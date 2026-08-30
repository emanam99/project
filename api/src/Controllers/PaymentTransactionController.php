<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\SantriJwtAccessHelper;
use App\Helpers\PaymentGatewaySettlementHelper;
use App\Helpers\ViaPembayaranHelper;
use App\Services\PaymentGateway\iPaymuService;
use App\Services\PaymentGateway\PaymentGatewayConfig;
use App\Services\PaymentGateway\PaymentGatewayLogger;
use App\Services\PaymentGateway\XenditService;
use App\Services\WhatsAppService;
use App\Helpers\RoleHelper;
use App\Utils\DeferredHttpTask;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller untuk Payment Transaction
 * Menangani operasi pembayaran melalui payment gateway
 */
class PaymentTransactionController
{
    private $db;
    private $ipaymuService;

    /** Biaya admin default iPayMu (rupiah). Sesuai ketentuan iPayMu, bisa dikembangkan per channel dari pengaturan. */
    private const DEFAULT_ADMIN_FEE = 4000;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->ipaymuService = new iPaymuService();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return Response|null */
    private function denyUnlessCanAccessSantriPayment(Request $request, Response $response, ?int $santriId): ?Response
    {
        if (!SantriJwtAccessHelper::canAccessSantriPayment($this->db, $request, $santriId)) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Akses ditolak untuk transaksi santri ini',
            ], 403);
        }

        return null;
    }

    private function resolveSantriIdFromTransactionRow(?array $transaction): ?int
    {
        if (!is_array($transaction)) {
            return null;
        }
        if (!empty($transaction['id_santri'])) {
            return (int) $transaction['id_santri'];
        }
        $paymentId = isset($transaction['id_payment']) ? (int) $transaction['id_payment'] : 0;
        if ($paymentId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id_santri FROM payment WHERE id = ? LIMIT 1');
        $stmt->execute([$paymentId]);
        $val = $stmt->fetchColumn();

        return $val !== false && $val !== null ? (int) $val : null;
    }

    /**
     * Keterangan label untuk iPayMu (product/deskripsi) sesuai jenis pembayaran.
     * @param string $jenis Pendaftaran|Uwaba|Tunggakan|Khusus|Tabungan|Umroh
     * @return string
     */
    private function isMybeddianClient(Request $request): bool
    {
        return strtolower(trim($request->getHeaderLine('X-Client-App'))) === 'mybeddien';
    }

    private function resolveProviderForCreate(Request $request, bool $useSandbox): string
    {
        if (!$this->isMybeddianClient($request)) {
            return PaymentGatewayConfig::PROVIDER_IPAYMU;
        }

        return PaymentGatewayConfig::getMybeddianPaymentProvider();
    }

    private function viaLabelForProvider(string $provider): string
    {
        return $provider === PaymentGatewayConfig::PROVIDER_XENDIT
            ? ViaPembayaranHelper::CANONICAL_XENDIT
            : ViaPembayaranHelper::CANONICAL_IPAYMU;
    }

    /**
     * @return iPaymuService|XenditService
     */
    private function getGatewayServiceForRequest(Request $request, string $provider)
    {
        $frontendEnv = $request->getHeaderLine('X-Frontend-Env');
        $useSandbox = strtolower(trim($frontendEnv)) === 'staging';
        $productionMode = PaymentGatewayConfig::resolveProductionModeForRequest($useSandbox);
        $configName = PaymentGatewayConfig::configNameForProvider($provider);
        $config = PaymentGatewayConfig::getConfigByProviderAndMode($configName, $productionMode);
        if (!$config && $useSandbox) {
            $config = PaymentGatewayConfig::getConfigByProviderAndMode($configName, true);
        }
        if ($provider === PaymentGatewayConfig::PROVIDER_XENDIT) {
            return $config ? new XenditService($config) : new XenditService();
        }

        return $config ? new iPaymuService($config) : $this->ipaymuService;
    }

    private function paymentTransactionHasGatewayProviderColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $cols = $this->db->query('SHOW COLUMNS FROM payment___transaction')->fetchAll(\PDO::FETCH_COLUMN);
            $cached = in_array('gateway_provider', $cols, true);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function getKeteranganLabelForJenis(string $jenis): string
    {
        $map = [
            'Pendaftaran' => 'Pembayaran Pendaftaran',
            'Uwaba' => 'Pembayaran UWABA',
            'Tunggakan' => 'Pembayaran Tunggakan',
            'Khusus' => 'Pembayaran Khusus',
            'Tabungan' => 'Tabungan',
            'Umroh' => 'Pembayaran Umroh',
            'Cashless' => 'Top-up Cashless',
        ];
        return $map[$jenis] ?? ('Pembayaran ' . $jenis);
    }

    /**
     * GET /api/payment-transaction/mode - Cek mode aktif (sandbox/production)
     * Jika header X-Frontend-Env = staging, kembalikan is_sandbox sesuai mode staging (sandbox iPayMu).
     */
    public function getMode(Request $request, Response $response): Response
    {
        try {
            $frontendEnv = $request->getHeaderLine('X-Frontend-Env');
            $useSandbox = strtolower(trim($frontendEnv)) === 'staging';
            $productionMode = PaymentGatewayConfig::resolveProductionModeForRequest($useSandbox);
            $isSandbox = !$productionMode;

            PaymentGatewayConfig::ensureIpaymuConfigRows();
            $data = [
                'is_sandbox' => $isSandbox,
                'ipaymu_configured' => PaymentGatewayConfig::isProviderConfigured(
                    PaymentGatewayConfig::PROVIDER_IPAYMU,
                    $productionMode
                ),
            ];

            if ($this->isMybeddianClient($request)) {
                $provider = PaymentGatewayConfig::getMybeddianPaymentProvider();
                $configured = PaymentGatewayConfig::isProviderConfigured($provider, $productionMode);
                $data['payment_provider'] = $provider;
                $data['provider_label'] = $this->viaLabelForProvider($provider);
                $data['provider_configured'] = $configured;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::getMode error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil mode',
                'data' => ['is_sandbox' => false]
            ], 500);
        }
    }

    /**
     * GET /api/payment-transaction/admin-fee - Ambil biaya admin untuk channel (untuk tampilan konfirmasi).
     */
    public function getAdminFee(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $paymentMethod = $params['payment_method'] ?? 'va';
        $paymentChannel = $params['payment_channel'] ?? '';
        $adminFee = $this->getAdminFeeForChannel($paymentMethod, $paymentChannel);
        return $this->jsonResponse($response, [
            'success' => true,
            'data' => ['admin_fee' => (int) $adminFee]
        ], 200);
    }

    /**
     * Biaya admin sesuai bank/channel (rupiah). Bisa dikembangkan baca dari pengaturan.
     */
    private function getAdminFeeForChannel(string $paymentMethod, string $paymentChannel): float
    {
        // TODO: baca dari tabel pengaturan jika ada key misalnya biaya_admin_ipaymu_bca, dll.
        return (float) self::DEFAULT_ADMIN_FEE;
    }

    /**
     * Ambil iPaymuService sesuai request: jika header X-Frontend-Env = staging, pakai sandbox.
     */
    private function getIpaymuServiceForRequest(Request $request): iPaymuService
    {
        $svc = $this->getGatewayServiceForRequest($request, PaymentGatewayConfig::PROVIDER_IPAYMU);

        return $svc instanceof iPaymuService ? $svc : $this->ipaymuService;
    }

    /**
     * POST /api/payment-transaction/create - Buat transaksi payment gateway
     */
    public function createTransaction(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $frontendEnv = $request->getHeaderLine('X-Frontend-Env');
            $useSandbox = (strtolower(trim($frontendEnv)) === 'staging')
                || (isset($input['use_sandbox']) && !empty($input['use_sandbox']));

            $gatewayProvider = $this->resolveProviderForCreate($request, $useSandbox);
            if ($gatewayProvider === PaymentGatewayConfig::PROVIDER_IPAYMU) {
                PaymentGatewayConfig::ensureIpaymuConfigRows();
            }
            $productionMode = PaymentGatewayConfig::resolveProductionModeForRequest($useSandbox);
            $configName = PaymentGatewayConfig::configNameForProvider($gatewayProvider);
            $config = PaymentGatewayConfig::getConfigByProviderAndMode($configName, $productionMode);
            if (!$config && $useSandbox) {
                $config = PaymentGatewayConfig::getConfigByProviderAndMode($configName, true);
            }
            $gatewayService = $this->getGatewayServiceForRequest($request, $gatewayProvider);
            $ipaymuService = $gatewayService instanceof iPaymuService ? $gatewayService : $this->ipaymuService;
            if (!$config || !PaymentGatewayConfig::isProviderConfigured($gatewayProvider, $productionMode)) {
                $label = $gatewayProvider === PaymentGatewayConfig::PROVIDER_XENDIT ? 'Xendit' : 'iPayMu';
                $modeLabel = $productionMode ? 'production' : 'sandbox';
                $detail = !$config
                    ? 'Baris konfigurasi ' . $modeLabel . ' belum ada.'
                    : (trim((string) ($config['api_key'] ?? '')) === ''
                        ? 'API Key ' . $modeLabel . ' belum diisi.'
                        : 'Virtual Account (VA) merchant ' . $modeLabel . ' belum diisi.');
                if ($gatewayProvider === PaymentGatewayConfig::PROVIDER_IPAYMU) {
                    $detail .= ' Atur di eBeddien → Pengaturan PSB → Payment Gateway → iPayMu '
                        . ($productionMode ? 'Production' : 'Sandbox') . '.';
                }

                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Konfigurasi pembayaran ' . $label . ' belum diatur. Hubungi admin.',
                    'detail' => $detail,
                ], 503);
            }
            $viaLabel = $this->viaLabelForProvider($gatewayProvider);

            // Validasi required fields (id_payment bisa opsional jika ada data untuk membuat payment baru)
            $requiredFields = ['amount', 'name', 'phone'];
            foreach ($requiredFields as $field) {
                if (!array_key_exists($field, $input) || $input[$field] === null || $input[$field] === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Field {$field} wajib diisi",
                    ], 400);
                }
            }
            if ((float) $input['amount'] <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal pembayaran harus lebih dari 0',
                ], 400);
            }
            $phoneNormalized = preg_replace('/[^0-9]/', '', (string) $input['phone']);
            if (is_string($phoneNormalized) && str_starts_with($phoneNormalized, '62')) {
                $phoneNormalized = substr($phoneNormalized, 2);
            }
            if (is_string($phoneNormalized) && str_starts_with($phoneNormalized, '0')) {
                $phoneNormalized = substr($phoneNormalized, 1);
            }
            if (!is_string($phoneNormalized) || strlen($phoneNormalized) < 10) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor telepon tidak valid (minimal 10 digit). Lengkapi nomor WA/telepon di biodata.',
                ], 400);
            }
            
            // Email bisa kosong, tapi tetap harus ada di input
            if (!isset($input['email'])) {
                $input['email'] = '';
            }

            $userPayloadEarly = $request->getAttribute('user');
            $userArrEarly = is_array($userPayloadEarly) ? $userPayloadEarly : [];
            if ($userArrEarly !== []) {
                $jwtSantriBound = null;
                if (!empty($userArrEarly['santri_id']) && (int) $userArrEarly['santri_id'] > 0) {
                    $jwtSantriBound = (int) $userArrEarly['santri_id'];
                } elseif (RoleHelper::tokenIsSantriDaftarContext($userArrEarly)) {
                    $jwtSantriBound = SantriHelper::resolveSantriIdFromDaftarToken($this->db, $userArrEarly);
                }
                if ($jwtSantriBound !== null && $jwtSantriBound > 0) {
                    $bodySantriRaw = $input['id_santri'] ?? null;
                    if ($bodySantriRaw !== null && $bodySantriRaw !== '') {
                        $bodySantriResolved = SantriHelper::resolveId($this->db, $bodySantriRaw);
                        if ($bodySantriResolved !== null && $bodySantriResolved !== $jwtSantriBound) {
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Tidak dapat membuat pembayaran untuk santri lain',
                            ], 403);
                        }
                    }
                    $input['id_santri'] = $jwtSantriBound;
                }
            }

            $amount = (float)$input['amount'];
            // Tidak memaksa minimal Rp 100.000: sisa tagihan kecil (mis. PAUD) tetap boleh; iPayMu menolak hanya jika di luar ketentuan mereka.
            $adminFee = $this->getAdminFeeForChannel($input['payment_method'] ?? 'va', $input['payment_channel'] ?? '');
            $total = $amount + $adminFee;
            $name = $input['name'];
            // Pendaftaran PSB: nama di iPayMu harus nama santri (santri.nama), bukan nama wali dari payload klien.
            $tabelRefNama = isset($input['tabel_referensi']) ? trim((string) $input['tabel_referensi']) : 'psb___registrasi';
            if ($tabelRefNama === 'psb___registrasi') {
                $idSantriNama = $input['id_santri'] ?? null;
                if (($idSantriNama === null || $idSantriNama === '') && !empty($input['id_registrasi'])) {
                    $stmtRs = $this->db->prepare('SELECT id_santri FROM psb___registrasi WHERE id = ? LIMIT 1');
                    $stmtRs->execute([(int) $input['id_registrasi']]);
                    $rowRs = $stmtRs->fetch(\PDO::FETCH_ASSOC);
                    $idSantriNama = $rowRs['id_santri'] ?? null;
                }
                if ($idSantriNama !== null && $idSantriNama !== '') {
                    $resolvedNama = SantriHelper::resolveId($this->db, $idSantriNama);
                    if ($resolvedNama !== null) {
                        $stmtNm = $this->db->prepare('SELECT nama FROM santri WHERE id = ? LIMIT 1');
                        $stmtNm->execute([$resolvedNama]);
                        $rowNm = $stmtNm->fetch(\PDO::FETCH_ASSOC);
                        if ($rowNm && trim((string) ($rowNm['nama'] ?? '')) !== '') {
                            $name = trim((string) $rowNm['nama']);
                            $input['name'] = $name;
                        }
                    }
                }
            }
            $phone = $input['phone'];
            $email = $input['email'];
            $paymentMethod = $input['payment_method'] ?? 'va';
            $paymentChannel = $input['payment_channel'] ?? '';
            $product = $input['product'] ?? [];
            
            // Cek apakah id_payment diberikan atau perlu dibuat baru
            $idPayment = isset($input['id_payment']) && !empty($input['id_payment']) ? (int)$input['id_payment'] : null;

            // Tanpa id_payment: jika sudah ada transaksi pending (nominal + metode + channel sama, belum kedaluwarsa), kembalikan itu — tanpa order baru ke iPayMu.
            if ($idPayment === null && empty($input['force_new_ipaymu'])) {
                $reuseData = $this->tryReuseExistingPendingIpaymuTransaction($input, $amount, $paymentMethod, $paymentChannel);
                if ($reuseData !== null) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Menggunakan tagihan pembayaran yang masih berlaku',
                        'data' => $reuseData,
                    ], 200);
                }
            }

            // Mulai transaction database
            $this->db->beginTransaction();
            
            try {
                // Jika id_payment tidak diberikan, buat payment record baru
                if (!$idPayment) {
                    // Ambil data untuk membuat payment record baru
                    $jenisPembayaran = $this->normalizeJenisPembayaranForStorage((string) ($input['jenis_pembayaran'] ?? 'Pendaftaran'));
                    $idReferensi = $input['id_referensi'] ?? null;
                    $tabelReferensi = $input['tabel_referensi'] ?? 'psb___registrasi';
                    $idSantriParam = $input['id_santri'] ?? null;
                    $idRegistrasi = $input['id_registrasi'] ?? null;
                    $tahunAjaran = isset($input['tahun_ajaran']) ? trim((string) $input['tahun_ajaran']) : null;

                    // Jika ada id_registrasi, ambil id_santri dari registrasi
                    $idSantri = null;
                    if ($idRegistrasi) {
                        $stmtGetSantri = $this->db->prepare("SELECT id_santri FROM psb___registrasi WHERE id = ?");
                        $stmtGetSantri->execute([$idRegistrasi]);
                        $registrasi = $stmtGetSantri->fetch(\PDO::FETCH_ASSOC);
                        if ($registrasi) {
                            $idSantri = $registrasi['id_santri'] ?? null;
                            if (!$idReferensi) {
                                $idReferensi = $idRegistrasi;
                            }
                        }
                    }
                    if ($idSantriParam && $idSantri === null) {
                        $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
                    }
                    
                    // Jika masih belum ada id_referensi, gunakan id_registrasi atau id_santri
                    if (!$idReferensi) {
                        $idReferensi = $idRegistrasi ?? $idSantri ?? null;
                    }
                    // Untuk UWABA: id_referensi = tahun_ajaran (format 1447-1448), sama dengan kolom tahun_ajaran di uwaba & uwaba___bayar
                    if ($tabelReferensi === 'uwaba___bayar' && $tahunAjaran !== null && $tahunAjaran !== '') {
                        $idReferensi = $tahunAjaran;
                    }

                    if ($tabelReferensi === 'cashless___accounts') {
                        $accId = (int) ($idReferensi ?? 0);
                        if ($accId <= 0) {
                            $this->db->rollBack();
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Akun cashless tidak valid. Muat ulang halaman lalu coba lagi.',
                            ], 400);
                        }
                        $stmtAcc = $this->db->prepare('SELECT id FROM cashless___accounts WHERE id = ? LIMIT 1');
                        $stmtAcc->execute([$accId]);
                        if (!$stmtAcc->fetch(\PDO::FETCH_ASSOC)) {
                            $this->db->rollBack();
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Akun cashless tidak ditemukan',
                            ], 404);
                        }
                    }

                    // id_user (users.id) untuk notif WA mybeddian / audit cashless.
                    $idUser = null;
                    $userPayload = $request->getAttribute('user');
                    $userArr = is_array($userPayload) ? $userPayload : [];
                    if ($userArr !== []) {
                        if (!empty($userArr['users_id'])) {
                            $idUser = (int) $userArr['users_id'];
                        } elseif (!empty($userArr['user_id'])) {
                            $uid = (int) $userArr['user_id'];
                            $isSantri = RoleHelper::tokenIsSantriDaftarContext($userArr);
                            if ($isSantri) {
                                $stmtSu = $this->db->prepare('SELECT id_user FROM santri WHERE id = ? LIMIT 1');
                                $sidForUser = !empty($userArr['santri_id']) ? (int) $userArr['santri_id'] : $uid;
                                $stmtSu->execute([$sidForUser]);
                                $rowSu = $stmtSu->fetch(\PDO::FETCH_ASSOC);
                                $idUser = $rowSu && !empty($rowSu['id_user']) ? (int) $rowSu['id_user'] : null;
                            } else {
                                $stmtU = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
                                $stmtU->execute([$uid]);
                                $rowU = $stmtU->fetch(\PDO::FETCH_ASSOC);
                                $idUser = $rowU && !empty($rowU['id_user']) ? (int) $rowU['id_user'] : null;
                            }
                        }
                    }
                    // Pastikan id_user benar-benar ada di users (hindari FK violation jika user dihapus atau data tidak konsisten)
                    if ($idUser !== null) {
                        $stmtCheckUser = $this->db->prepare("SELECT 1 FROM users WHERE id = ? LIMIT 1");
                        $stmtCheckUser->execute([$idUser]);
                        if (!$stmtCheckUser->fetch(\PDO::FETCH_ASSOC)) {
                            $idUser = null;
                        }
                    }
                    
                    // Buat payment record baru dengan status Pending (id_user untuk WA mybeddian; tahun_ajaran untuk UWABA 1447-1448)
                    $cols = $this->db->query("SHOW COLUMNS FROM payment")->fetchAll(\PDO::FETCH_COLUMN);
                    $hasIdUser = in_array('id_user', $cols, true);
                    $hasTahunAjaran = in_array('tahun_ajaran', $cols, true);
                    $includeTahunAjaran = $hasTahunAjaran && $tabelReferensi === 'uwaba___bayar' && $tahunAjaran !== null && $tahunAjaran !== '';
                    $sql = "INSERT INTO payment (
                        jenis_pembayaran, id_referensi, tabel_referensi" . ($includeTahunAjaran ? ", tahun_ajaran" : "") . ", id_santri" . ($hasIdUser ? ", id_user" : "") . ",
                        nominal, metode_pembayaran, via, status
                    ) VALUES (?, ?, ?" . ($includeTahunAjaran ? ", ?" : "") . ", ?" . ($hasIdUser ? ", ?" : "") . ", ?, ?, ?, ?)";
                    $params = [$jenisPembayaran, $idReferensi, $tabelReferensi];
                    if ($includeTahunAjaran) {
                        $params[] = $tahunAjaran;
                    }
                    $params[] = $idSantri;
                    if ($hasIdUser) {
                        $params[] = $idUser;
                    }
                    $params = array_merge($params, [$amount, $viaLabel, $viaLabel, 'Pending']);
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($params);
                    
                    $idPayment = $this->db->lastInsertId();
                } else {
                    // Cek apakah payment sudah ada
                    $stmt = $this->db->prepare("SELECT * FROM payment WHERE id = ?");
                    $stmt->execute([$idPayment]);
                    $payment = $stmt->fetch(\PDO::FETCH_ASSOC);

                    if (!$payment) {
                        $this->db->rollBack();
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Payment tidak ditemukan'
                        ], 404);
                    }
                }

                $referenceId = $input['reference_id'] ?? 'PAY-' . time() . '-' . $idPayment;

                // Ambil jenis_pembayaran untuk keterangan/product iPayMu (agar email/notifikasi menampilkan tipe pembayaran)
                $stmtJenis = $this->db->prepare("SELECT jenis_pembayaran FROM payment WHERE id = ? LIMIT 1");
                $stmtJenis->execute([$idPayment]);
                $rowJenis = $stmtJenis->fetch(\PDO::FETCH_ASSOC);
                $jenisForProduct = trim((string) ($rowJenis['jenis_pembayaran'] ?? ''));
                if ($jenisForProduct === '') {
                    $jenisForProduct = $this->normalizeJenisPembayaranForStorage((string) ($input['jenis_pembayaran'] ?? 'Pendaftaran'));
                }

                // Jika product/keterangan kosong, isi dari jenis pembayaran (Pendaftaran, UWABA, Tunggakan, Khusus, Tabungan, Umroh)
                $keteranganLabel = $this->getKeteranganLabelForJenis($jenisForProduct);
                if (empty($product) || !is_array($product)) {
                    $product = [
                        'product' => [$keteranganLabel],
                        'quantity' => ['1'],
                        'price' => [(string)(int)$amount]
                    ];
                }

                // Keterangan untuk iPayMu (parameter "comments") — dipakai di email/halaman iPayMu
                $comments = $input['comments'] ?? null;
                if ($comments === null || $comments === '') {
                    if (!empty($product) && is_array($product)) {
                        if (isset($product['product'][0])) {
                            $comments = $product['product'][0];
                        } elseif (isset($product[0]) && is_string($product[0])) {
                            $comments = $product[0];
                        }
                    }
                    if ($comments === null || $comments === '') {
                        $comments = $keteranganLabel;
                    }
                }

                // Cek apakah sudah ada transaction untuk payment ini
                $stmtCheck = $this->db->prepare("SELECT id FROM payment___transaction WHERE id_payment = ? AND status IN ('pending', 'paid') LIMIT 1");
                $stmtCheck->execute([$idPayment]);
                $existingTransaction = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

                if ($existingTransaction) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Sudah ada transaksi aktif untuk payment ini'
                    ], 400);
                }

                // Insert ke payment___transaction
                $hasGwCol = $this->paymentTransactionHasGatewayProviderColumn();
                $sql = 'INSERT INTO payment___transaction (
                    id_payment' . ($hasGwCol ? ', gateway_provider' : '') . ', reference_id, amount, payment_method, payment_channel,
                    status, request_data
                ) VALUES (?' . ($hasGwCol ? ', ?' : '') . ', ?, ?, ?, ?, \'pending\', ?)';

                $requestData = [
                    'id_payment' => $idPayment,
                    'amount' => $amount,
                    'name' => $name,
                    'phone' => $phone,
                    'email' => $email,
                    'payment_method' => $paymentMethod,
                    'payment_channel' => $paymentChannel,
                    'product' => $product,
                    'reference_id' => $referenceId,
                    'gateway_provider' => $gatewayProvider,
                ];

                $insertParams = [$idPayment];
                if ($hasGwCol) {
                    $insertParams[] = $gatewayProvider;
                }
                $insertParams = array_merge($insertParams, [
                    $referenceId,
                    $amount,
                    $paymentMethod,
                    $paymentChannel,
                    json_encode($requestData, JSON_UNESCAPED_UNICODE),
                ]);

                $stmt = $this->db->prepare($sql);
                $stmt->execute($insertParams);

                $transactionId = $this->db->lastInsertId();

                // Panggil gateway API (comments = keterangan; return_url/cancel_url untuk redirect)
                $ipaymuData = [
                    'name' => $name,
                    'phone' => $phone,
                    'email' => $email,
                    'amount' => $amount,
                    'reference_id' => $referenceId,
                    'payment_method' => $paymentMethod,
                    'product' => $product,
                    'comments' => $comments
                ];
                if (!empty($paymentChannel) && trim($paymentChannel) !== '') {
                    $ipaymuData['payment_channel'] = trim($paymentChannel);
                }
                if (!empty($input['return_url'])) {
                    $ipaymuData['return_url'] = trim($input['return_url']);
                }
                if (!empty($input['cancel_url'])) {
                    $ipaymuData['cancel_url'] = trim($input['cancel_url']);
                }

                $gatewayResponse = $gatewayProvider === PaymentGatewayConfig::PROVIDER_XENDIT
                    ? $gatewayService->createPayment($ipaymuData)
                    : $ipaymuService->createPayment($ipaymuData);

                if ($gatewayProvider === PaymentGatewayConfig::PROVIDER_XENDIT
                    && !empty($gatewayResponse['success'])
                    && !empty($gatewayResponse['data']['session_id'])) {
                    $norm = $gatewayResponse['data'];
                    $sessionId = $norm['session_id'];
                    $vaNumber = $norm['va_number'] ?? null;
                    $qrCodeFromResponse = $norm['qr_code'] ?? null;
                    $urlFromResponse = $norm['payment_url'] ?? null;
                    $expiredAt = $norm['expired_at'] ?? null;
                    $feeFromResponse = $norm['fee'] ?? null;
                    $totalFromResponse = $norm['total'] ?? null;
                    $amountForWa = (float) $amount;
                    $adminFeeForWa = $feeFromResponse !== null ? (int) (float) $feeFromResponse : null;
                    $totalForWa = $totalFromResponse !== null ? (float) $totalFromResponse : null;

                    $this->db->prepare(
                        'UPDATE payment___transaction SET session_id = ?, trx_id = ?, va_number = ?, qr_code = ?, payment_url = ?, '
                        . 'expired_at = ?, response_data = ?, status_message = ? WHERE id = ?'
                    )->execute([
                        $sessionId,
                        $sessionId,
                        $vaNumber,
                        $qrCodeFromResponse,
                        $urlFromResponse,
                        $expiredAt,
                        json_encode($gatewayResponse['raw'] ?? $norm, JSON_UNESCAPED_UNICODE),
                        'Xendit payment request created',
                        $transactionId,
                    ]);

                    try {
                        $cols = $this->db->query('SHOW COLUMNS FROM payment___transaction')->fetchAll(\PDO::FETCH_COLUMN);
                        if (in_array('fee', $cols, true) && in_array('sub_total', $cols, true) && in_array('total', $cols, true)) {
                            $this->db->prepare('UPDATE payment___transaction SET fee = ?, sub_total = ?, total = ? WHERE id = ?')
                                ->execute([$adminFeeForWa, $amountForWa, $totalForWa, $transactionId]);
                        }
                    } catch (\Exception $e) {
                        error_log('PaymentTransactionController Xendit fee update: ' . $e->getMessage());
                    }

                    $this->db->commit();

                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Transaksi berhasil dibuat',
                        'data' => [
                            'transaction_id' => $transactionId,
                            'session_id' => $sessionId,
                            'payment_url' => $urlFromResponse,
                            'qr_code' => $qrCodeFromResponse,
                            'va_number' => $vaNumber,
                            'expired_at' => $expiredAt,
                            'amount' => $amountForWa,
                            'admin_fee' => $adminFeeForWa,
                            'total' => $totalForWa,
                            'gateway_provider' => $gatewayProvider,
                        ],
                    ], 201);
                }

                if ($gatewayProvider === PaymentGatewayConfig::PROVIDER_XENDIT) {
                    $errorMessage = $gatewayResponse['message'] ?? 'Gagal membuat transaksi di Xendit';
                    $this->db->prepare(
                        "UPDATE payment___transaction SET status = 'failed', status_message = ?, response_data = ? WHERE id = ?"
                    )->execute([
                        $errorMessage,
                        json_encode($gatewayResponse, JSON_UNESCAPED_UNICODE),
                        $transactionId,
                    ]);
                    $this->db->commit();

                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => $errorMessage,
                        'data' => $gatewayResponse,
                    ], 400);
                }

                $ipaymuResponse = $gatewayResponse;

                // Update transaction dengan response dari iPaymu
                if ($ipaymuResponse['success'] && isset($ipaymuResponse['data'])) {
                    $ipaymuData = $ipaymuResponse['data'];
                    
                    // Log response untuk debugging
                    error_log("PaymentTransactionController::createTransaction - iPayMu Response Data: " . json_encode($ipaymuData, JSON_UNESCAPED_UNICODE));
                    
                    // iPayMu mengembalikan response dengan struktur:
                    // { "Status": 200, "Success": true, "Message": "Success", "Data": { "PaymentNo": "...", ... } }
                    // Jadi PaymentNo ada di dalam Data
                    $ipaymuDataInner = $ipaymuData['Data'] ?? $ipaymuData['data'] ?? $ipaymuData;
                    
                    // Ambil payment method dari input (sudah didefinisikan di atas)
                    // $paymentMethod sudah didefinisikan di line 62: $paymentMethod = $input['payment_method'] ?? 'va';
                    
                    // Cari PaymentNo dari response
                    $paymentNo = $ipaymuDataInner['PaymentNo'] 
                        ?? $ipaymuDataInner['paymentNo']
                        ?? $ipaymuDataInner['payment_no']
                        ?? $ipaymuDataInner['Payment_No']
                        ?? $ipaymuData['PaymentNo'] 
                        ?? $ipaymuData['paymentNo']
                        ?? $ipaymuData['payment_no']
                        ?? $ipaymuData['Payment_No']
                        ?? null;
                    
                    // Untuk QRIS, PaymentNo berisi kode QR, bukan VA number
                    // Untuk VA, PaymentNo berisi nomor VA
                    $vaNumber = null;
                    $qrCodeFromPaymentNo = null;
                    
                    if ($paymentMethod === 'qris' && $paymentNo) {
                        // Jika payment method adalah QRIS, PaymentNo adalah kode QR
                        $qrCodeFromPaymentNo = $paymentNo;
                        error_log("PaymentTransactionController::createTransaction - QRIS PaymentNo (QR Code) Found: " . substr($qrCodeFromPaymentNo, 0, 50) . "...");
                    } else if (!in_array($paymentMethod, ['qris', 'ewallet'], true) && $paymentNo) {
                        // Jika bukan QRIS/e-wallet, PaymentNo adalah VA number / kode CStore
                        $vaNumber = $paymentNo;
                        error_log("PaymentTransactionController::createTransaction - VA Number from PaymentNo: " . $vaNumber);
                    }
                    
                    // Jika belum ada VA number, cari di field lain (hanya untuk non-QRIS / non-ewallet)
                    if (!$vaNumber && !in_array($paymentMethod, ['qris', 'ewallet'], true)) {
                        $vaNumber = $ipaymuDataInner['va'] 
                            ?? $ipaymuDataInner['Va'] 
                            ?? $ipaymuDataInner['VA']
                            ?? $ipaymuData['va'] 
                            ?? $ipaymuData['Va'] 
                            ?? $ipaymuData['VA']
                            ?? $ipaymuData['va_number']
                            ?? $ipaymuData['vaNumber']
                            ?? $ipaymuData['VaNumber']
                            ?? null;
                        
                        if ($vaNumber) {
                            error_log("PaymentTransactionController::createTransaction - VA Number from other fields: " . $vaNumber);
                        }
                    }
                    
                    error_log("PaymentTransactionController::createTransaction - Final VA Number: " . ($vaNumber ?? 'NULL'));
                    error_log("PaymentTransactionController::createTransaction - QR Code from PaymentNo: " . ($qrCodeFromPaymentNo ? substr($qrCodeFromPaymentNo, 0, 50) . "..." : 'NULL'));
                    
                    $updateSql = "UPDATE payment___transaction SET 
                        session_id = ?,
                        trx_id = ?,
                        status = ?,
                        status_code = ?,
                        status_message = ?,
                        payment_url = ?,
                        qr_code = ?,
                        va_number = ?,
                        expired_at = ?,
                        response_data = ?
                        WHERE id = ?";

                    $status = $this->mapStatusFromResponse($ipaymuData);
                    // expired_at: prioritas dari response iPayMu (ExpiredDate), else hitung dari rule per method/channel
                    $expiredAt = null;
                    $expiredDateFromResponse = $ipaymuDataInner['ExpiredDate'] ?? $ipaymuDataInner['expiredDate'] ?? $ipaymuDataInner['expired_at'] ?? $ipaymuData['ExpiredDate'] ?? $ipaymuData['expiredDate'] ?? null;
                    if ($expiredDateFromResponse !== null && $expiredDateFromResponse !== '') {
                        $ts = is_numeric($expiredDateFromResponse) ? (int)$expiredDateFromResponse : strtotime($expiredDateFromResponse);
                        if ($ts !== false) {
                            $expiredAt = date('Y-m-d H:i:s', $ts);
                        }
                    }
                    if ($expiredAt === null) {
                        $expiredRule = $this->ipaymuService->getExpiredForChannel($paymentMethod, trim((string)($paymentChannel ?? '')), []);
                        if ($expiredRule['expiredType'] === 'minutes') {
                            $expiredAt = date('Y-m-d H:i:s', strtotime('+' . (int)$expiredRule['expired'] . ' minutes'));
                        } else {
                            $expiredAt = date('Y-m-d H:i:s', strtotime('+' . (int)$expiredRule['expired'] . ' hours'));
                        }
                    }

                    // Ambil data dari Data object jika ada, atau langsung dari ipaymuData
                    $sessionId = $ipaymuDataInner['SessionId'] ?? $ipaymuDataInner['sessionId'] ?? $ipaymuData['sessionId'] ?? $ipaymuData['SessionId'] ?? null;
                    $transactionIdFromResponse = $ipaymuDataInner['TransactionId'] ?? $ipaymuDataInner['transactionId'] ?? $ipaymuData['transactionId'] ?? $ipaymuData['TransactionId'] ?? null;
                    $statusFromResponse = $ipaymuDataInner['Status'] ?? $ipaymuDataInner['status'] ?? $ipaymuData['status'] ?? $ipaymuData['Status'] ?? null;
                    $messageFromResponse = $ipaymuDataInner['Message'] ?? $ipaymuDataInner['message'] ?? $ipaymuData['message'] ?? $ipaymuData['Message'] ?? null;
                    $urlFromResponse = $ipaymuDataInner['Url'] ?? $ipaymuDataInner['url'] ?? $ipaymuData['url'] ?? $ipaymuData['Url'] ?? null;
                    
                    // Cari QR code dari berbagai field
                    // Prioritas: 1. PaymentNo (jika QRIS), 2. QrCode field, 3. qrCode field
                    $qrCodeFromResponse = $qrCodeFromPaymentNo // Dari PaymentNo jika QRIS
                        ?? $ipaymuDataInner['QrCode'] 
                        ?? $ipaymuDataInner['qrCode']
                        ?? $ipaymuDataInner['QRCode']
                        ?? $ipaymuDataInner['qr_code']
                        ?? $ipaymuDataInner['QR_Code']
                        ?? $ipaymuDataInner['qr_string']
                        ?? $ipaymuDataInner['QrString']
                        ?? $ipaymuData['QrCode'] 
                        ?? $ipaymuData['qrCode']
                        ?? $ipaymuData['QRCode']
                        ?? $ipaymuData['qr_code']
                        ?? $ipaymuData['QR_Code']
                        ?? $ipaymuData['qr_string']
                        ?? $ipaymuData['QrString']
                        ?? null;
                    
                    if ($qrCodeFromResponse) {
                        error_log("PaymentTransactionController::createTransaction - QR Code Found: " . substr($qrCodeFromResponse, 0, 50) . "...");
                    }
                    
                    $updateStmt = $this->db->prepare($updateSql);
                    $updateStmt->execute([
                        $sessionId,
                        $transactionIdFromResponse,
                        $status,
                        $statusFromResponse,
                        $messageFromResponse,
                        $urlFromResponse,
                        $qrCodeFromResponse,
                        $vaNumber,
                        $expiredAt,
                        json_encode($ipaymuData, JSON_UNESCAPED_UNICODE),
                        $transactionId
                    ]);

                    // Update payment dengan id_payment_transaction
                    $this->db->prepare("UPDATE payment SET id_payment_transaction = ? WHERE id = ?")->execute([$transactionId, $idPayment]);

                    $this->db->commit();

                    // Jika VA number masih null, coba ambil dari database (mungkin sudah di-update oleh callback)
                    if (empty($vaNumber)) {
                        $stmtGetVa = $this->db->prepare("SELECT va_number FROM payment___transaction WHERE id = ?");
                        $stmtGetVa->execute([$transactionId]);
                        $vaFromDb = $stmtGetVa->fetch(\PDO::FETCH_ASSOC);
                        if ($vaFromDb && !empty($vaFromDb['va_number'])) {
                            $vaNumber = $vaFromDb['va_number'];
                            error_log("PaymentTransactionController::createTransaction - VA Number from DB: {$vaNumber}");
                        }
                    }

                    // Ambil nominal/fee/total dari response iPayMu (prioritas) agar WA pakai data resmi, bukan default 4000
                    $subTotalFromResponse = $ipaymuDataInner['SubTotal'] ?? $ipaymuDataInner['sub_total'] ?? null;
                    $feeFromResponse = $ipaymuDataInner['Fee'] ?? $ipaymuDataInner['fee'] ?? null;
                    $totalFromResponse = $ipaymuDataInner['Total'] ?? $ipaymuDataInner['total'] ?? null;

                    $amountForWa = $subTotalFromResponse !== null ? (float) $subTotalFromResponse : (float) $amount;
                    $adminFeeForWa = $feeFromResponse !== null && $feeFromResponse !== '' ? (int) (float) $feeFromResponse : null;
                    $totalForWa = $totalFromResponse !== null && $totalFromResponse !== '' ? (float) $totalFromResponse : null;

                    if ($adminFeeForWa === null && $totalFromResponse === null && !empty($sessionId)) {
                        $checkResponse = $this->ipaymuService->checkPaymentStatus($sessionId);
                        if (!empty($checkResponse['success']) && !empty($checkResponse['data'])) {
                            $checkData = $checkResponse['data'];
                            $checkPayload = $checkData;
                            if (isset($checkData['Data']) && is_array($checkData['Data'])) {
                                $checkPayload = array_merge($checkPayload, $checkData['Data']);
                            }
                            if (isset($checkData['data']) && is_array($checkData['data'])) {
                                $checkPayload = array_merge($checkPayload, $checkData['data']);
                            }
                            if ($adminFeeForWa === null) {
                                $feeCheck = $checkPayload['Fee'] ?? $checkPayload['fee'] ?? null;
                                if ($feeCheck !== null && $feeCheck !== '') {
                                    $adminFeeForWa = (int) (float) $feeCheck;
                                }
                            }
                            if ($totalForWa === null) {
                                $totalCheck = $checkPayload['Total'] ?? $checkPayload['total'] ?? null;
                                if ($totalCheck !== null && $totalCheck !== '') {
                                    $totalForWa = (float) $totalCheck;
                                }
                            }
                            if (isset($checkPayload['SubTotal']) || isset($checkPayload['sub_total'])) {
                                $amountForWa = (float) ($checkPayload['SubTotal'] ?? $checkPayload['sub_total']);
                            }
                        }
                    }

                    // Simpan fee/sub_total/total ke payment___transaction agar halaman "menunggu pembayaran" dapat data benar
                    try {
                        $cols = $this->db->query("SHOW COLUMNS FROM payment___transaction")->fetchAll(\PDO::FETCH_COLUMN);
                        if (in_array('fee', $cols, true) && in_array('sub_total', $cols, true) && in_array('total', $cols, true)) {
                            $stmtFee = $this->db->prepare("UPDATE payment___transaction SET fee = ?, sub_total = ?, total = ? WHERE id = ?");
                            $stmtFee->execute([
                                $adminFeeForWa !== null ? $adminFeeForWa : null,
                                $amountForWa,
                                $totalForWa !== null ? $totalForWa : null,
                                $transactionId
                            ]);
                        }
                    } catch (\Exception $e) {
                        error_log("PaymentTransactionController::createTransaction update fee/sub_total/total: " . $e->getMessage());
                    }

                    // Kirim WA otomatis (daftar/myBeddien). eBeddien: defer — staff kirim lewat POST …/send-wa.
                    $deferWa = !empty($input['defer_wa'])
                        || strtolower(trim($request->getHeaderLine('X-Client-App'))) === 'ebeddien';
                    $hasOrderData = (!empty($vaNumber) && in_array($paymentMethod, ['va', 'cstore'], true))
                        || ($paymentMethod === 'qris' && !empty($qrCodeFromResponse))
                        || ($paymentMethod === 'ewallet' && !empty($urlFromResponse));
                    if ($hasOrderData && !$deferWa) {
                        $waCtx = [
                            'id_payment' => (int) $idPayment,
                            'payment_method' => $paymentMethod,
                            'payment_channel' => (string) ($paymentChannel ?? ''),
                            'va_number' => $vaNumber,
                            'qr_code' => $qrCodeFromResponse,
                            'amount_for_wa' => $amountForWa,
                            'admin_fee_for_wa' => $adminFeeForWa,
                            'total_for_wa' => $totalForWa,
                            'url_from_response' => $urlFromResponse,
                        ];
                        $self = $this;
                        DeferredHttpTask::runAfterResponse(static function () use ($self, $waCtx): void {
                            $self->deliverIpaymuCreateTransactionWaNotifications($waCtx);
                        });
                    }

                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Transaksi berhasil dibuat',
                        'data' => [
                            'transaction_id' => $transactionId,
                            'session_id' => $sessionId,
                            'ipaymu_transaction_id' => $transactionIdFromResponse,
                            'payment_url' => $urlFromResponse,
                            'qr_code' => $qrCodeFromResponse,
                            'va_number' => $vaNumber,
                            'expired_at' => $expiredAt,
                            'amount' => $amountForWa,
                            'admin_fee' => $adminFeeForWa !== null ? (int) $adminFeeForWa : null,
                            'total' => $totalForWa !== null ? (float) $totalForWa : null,
                            'payment_method' => $paymentMethod,
                            'payment_channel' => $paymentChannel ?? null,
                            'wa_deferred' => $deferWa,
                        ]
                    ], 201);
                } else {
                    // Extract error message dari response iPaymu
                    $errorMessage = 'Gagal membuat transaksi di iPayMu';
                    $ipaymuData = $ipaymuResponse['data'] ?? [];
                    
                    // Cek berbagai format response error dari iPayMu
                    if (isset($ipaymuData['Message'])) {
                        $errorMessage = $ipaymuData['Message'];
                    } elseif (isset($ipaymuData['message'])) {
                        $errorMessage = $ipaymuData['message'];
                    } elseif (isset($ipaymuResponse['message'])) {
                        $errorMessage = $ipaymuResponse['message'];
                    } elseif (isset($ipaymuData['Status']) && $ipaymuData['Status'] != 200) {
                        $errorMessage = $ipaymuData['Message'] ?? 'Error dari iPayMu (Status: ' . $ipaymuData['Status'] . ')';
                    }
                    
                    // Khusus untuk QRIS dan CStore, tambahkan informasi tentang sandbox mode
                    $config = $this->ipaymuService->getConfig();
                    $isSandbox = !($config['production_mode'] ?? false);
                    
                    if ($paymentMethod === 'qris' && (stripos($errorMessage, 'qris') !== false || stripos($errorMessage, 'QRIS') !== false || stripos($errorMessage, 'generate') !== false)) {
                        if ($isSandbox) {
                            $errorMessage .= ' (Catatan: QRIS mungkin tidak didukung di sandbox mode iPayMu. Silakan gunakan production mode atau metode pembayaran lain seperti VA atau CStore)';
                        } else {
                            $errorMessage .= ' (Pastikan akun iPayMu Anda sudah teraktivasi untuk QRIS di production mode)';
                        }
                    } elseif (
                        $paymentMethod === 'cstore'
                        && (
                            stripos($errorMessage, 'payment code') !== false
                            || stripos($errorMessage, 'payment channel') !== false
                            || stripos($errorMessage, 'invalid channel') !== false
                            || stripos($errorMessage, 'alfamart') !== false
                            || stripos($errorMessage, 'indomaret') !== false
                        )
                    ) {
                        if ($isSandbox) {
                            $errorMessage .= ' (Catatan: CStore (Alfamart/Indomaret) mungkin tidak didukung di sandbox mode iPayMu. Silakan gunakan production mode atau metode pembayaran lain seperti VA)';
                        } else {
                            $errorMessage .= ' (Pastikan paymentChannel sudah diisi dengan "alfamart" atau "indomaret" dan akun iPayMu Anda sudah teraktivasi untuk CStore)';
                        }
                    }
                    
                    // Log error detail untuk debugging
                    error_log("PaymentTransactionController::createTransaction - iPayMu Error: " . json_encode($ipaymuResponse, JSON_UNESCAPED_UNICODE));
                    
                    // Update transaction dengan error
                    $this->db->prepare("UPDATE payment___transaction SET status = 'failed', status_message = ?, status_code = ?, response_data = ? WHERE id = ?")
                        ->execute([
                            $errorMessage,
                            $ipaymuData['Status'] ?? $ipaymuResponse['http_code'] ?? '400',
                            json_encode($ipaymuResponse, JSON_UNESCAPED_UNICODE),
                            $transactionId
                        ]);

                    $this->db->commit();

                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => $errorMessage,
                        'data' => $ipaymuResponse,
                        'debug' => [
                            'http_code' => $ipaymuResponse['http_code'] ?? null,
                            'ipaymu_status' => $ipaymuData['Status'] ?? null,
                            'ipaymu_message' => $ipaymuData['Message'] ?? null
                        ]
                    ], 400);
                }
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::createTransaction error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat transaksi'
            ], 500);
        }
    }

    /**
     * POST /api/payment-transaction/callback/xendit — webhook Xendit (header x-callback-token).
     */
    public function handleXenditCallback(Request $request, Response $response): Response
    {
        try {
            $rawBody = (string) $request->getBody()->getContents();
            $tokenHeader = $request->getHeaderLine('x-callback-token');
            $xenditService = new XenditService();
            if (!$xenditService->verifyCallbackToken($tokenHeader !== '' ? $tokenHeader : null)) {
                error_log('PaymentTransactionController::handleXenditCallback - invalid x-callback-token');

                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token callback tidak valid',
                ], 401);
            }

            $callbackData = XenditService::decodeCallbackBody($request, $rawBody);
            if ($callbackData === null) {
                error_log('PaymentTransactionController::handleXenditCallback - body kosong atau bukan JSON, len=' . strlen($rawBody));

                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data callback tidak valid (body kosong atau bukan JSON). Kirim Content-Type: application/json dan body JSON.',
                ], 400);
            }

            $result = $xenditService->processCallback($callbackData);
            $httpCode = isset($result['http_code']) ? (int) $result['http_code'] : ($result['success'] ? 200 : 400);
            unset($result['http_code']);

            return $this->jsonResponse($response, $result, $httpCode);
        } catch (\Exception $e) {
            error_log('PaymentTransactionController::handleXenditCallback error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memproses callback Xendit',
            ], 500);
        }
    }

    /**
     * POST /api/payment-transaction/callback - Handle callback dari iPayMu
     * Keamanan: IP whitelist (opsional), verifikasi signature HMAC-SHA256, idempotency & validasi state di service.
     * Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT | https://ipaymu.com/en/api-documentation/
     */
    public function handleCallback(Request $request, Response $response): Response
    {
        try {
            $rawBody = (string) $request->getBody()->getContents();
            $config = require __DIR__ . '/../../config.php';
            $callbackConfig = $config['ipaymu_callback'] ?? [];

            // 1. IP whitelist (opsional): jika dikonfigurasi, hanya terima dari IP yang diizinkan
            $ipWhitelist = $callbackConfig['ip_whitelist'] ?? [];
            if (!empty($ipWhitelist)) {
                $serverParams = $request->getServerParams();
                $clientIp = isset($serverParams['HTTP_X_FORWARDED_FOR'])
                    ? trim(explode(',', $serverParams['HTTP_X_FORWARDED_FOR'])[0])
                    : ($serverParams['REMOTE_ADDR'] ?? '');
                if (!in_array($clientIp, $ipWhitelist, true)) {
                    error_log("PaymentTransactionController::handleCallback - IP tidak diizinkan: " . $clientIp);
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Forbidden'
                    ], 403);
                }
            }

            // Parse body dulu (dipakai untuk verifikasi signature dan untuk fallback)
            $callbackData = json_decode($rawBody, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $parsedBody = $request->getParsedBody();
                if (is_array($parsedBody) && !empty($parsedBody)) {
                    $callbackData = $parsedBody;
                } else {
                    parse_str($rawBody, $parsed);
                    $callbackData = is_array($parsed ?? null) ? $parsed : [];
                }
            }
            if (isset($callbackData['sid']) && !isset($callbackData['session_id'])) {
                $callbackData['session_id'] = $callbackData['sid'];
            }

            // 2. Verifikasi signature (HMAC-SHA256 sesuai iPayMu v2)
            $vaHeader = $request->getHeaderLine('va');
            $signatureHeader = $request->getHeaderLine('signature');
            $hasSignature = $vaHeader !== '' && $signatureHeader !== '';

            if ($hasSignature) {
                $verifySignature = $callbackConfig['verify_signature'] ?? true;
                if ($verifySignature) {
                    $valid = $this->ipaymuService->verifyCallbackSignature('POST', $rawBody, $vaHeader, $signatureHeader);
                    if (!$valid) {
                        error_log("PaymentTransactionController::handleCallback - Signature tidak valid");
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Unauthorized'
                        ], 401);
                    }
                }
            } else {
                // Fallback tanpa signature tidak boleh langsung update status dari body callback.
                // Jalur ini hanya untuk sinkronisasi status melalui API iPaymu berdasarkan session_id.
                $sessionId = $callbackData['session_id'] ?? $callbackData['sid'] ?? null;
                if (empty($sessionId)) {
                    error_log("PaymentTransactionController::handleCallback - Header va/signature tidak ada dan session_id/sid tidak ada di body");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Unauthorized'
                    ], 401);
                }
                // Sinkron dari API transaction agar status berasal dari source yang tervalidasi.
                $stmt = $this->db->prepare("SELECT id, status, id_payment FROM payment___transaction WHERE session_id = ? LIMIT 1");
                $stmt->execute([$sessionId]);
                $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$transaction) {
                    error_log("PaymentTransactionController::handleCallback - Fallback: transaksi tidak ditemukan session_id=" . $sessionId);
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Transaksi tidak ditemukan'
                    ], 404);
                }
                $ipaymuResponse = $this->ipaymuService->checkPaymentStatus($sessionId);
                if ($ipaymuResponse['success'] && isset($ipaymuResponse['data']) && !empty($ipaymuResponse['data'])) {
                    $responseData = $ipaymuResponse['data'];
                    $payload = $responseData;
                    if (isset($responseData['Data']) && is_array($responseData['Data'])) {
                        $payload = array_merge($payload, $responseData['Data']);
                    }
                    if (isset($responseData['data']) && is_array($responseData['data'])) {
                        $payload = array_merge($payload, $responseData['data']);
                    }
                    $mappedStatus = $this->mapStatusFromResponse($payload);
                    error_log("PaymentTransactionController::handleCallback - Fallback: API response keys=" . implode(',', array_keys($responseData)) . " payload_status=" . ($payload['status'] ?? $payload['Status'] ?? 'null') . " mapped=" . $mappedStatus);
                    $this->updateTransactionFromResponse((int) $transaction['id'], $responseData);
                    error_log("PaymentTransactionController::handleCallback - Fallback: status transaksi session_id=" . $sessionId . " disinkronkan dari API iPaymu");
                    if (!empty($transaction['id_payment'])) {
                        $this->ipaymuService->ensurePendaftaranTransactionInserted((int) $transaction['id_payment']);
                        $this->ipaymuService->ensureUwabaKhususTunggakanBayarInserted((int) $transaction['id_payment']);
                    }
                }
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Fallback: status disinkronkan dari API iPaymu'
                ], 200);
            }

            if (empty($callbackData)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data callback kosong'
                ], 400);
            }

            $result = $this->ipaymuService->processCallback($callbackData);
            $httpCode = isset($result['http_code']) ? (int) $result['http_code'] : ($result['success'] ? 200 : 400);
            unset($result['http_code']);

            return $this->jsonResponse($response, $result, $httpCode);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::handleCallback error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memproses callback'
            ], 500);
        }
    }

    /**
     * GET /api/payment-transaction/callback - Fallback redirect dari iPaymu (user diarahkan ke URL ini dengan query sid/session_id).
     * Sinkronkan status transaksi dari API iPaymu lalu kembalikan JSON (frontend bisa arahkan user ke halaman status).
     */
    public function handleCallbackGet(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $sessionId = $queryParams['session_id'] ?? $queryParams['sid'] ?? null;
            if (empty($sessionId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter session_id atau sid wajib'
                ], 400);
            }
            $stmt = $this->db->prepare("SELECT id, status, session_id FROM payment___transaction WHERE session_id = ? LIMIT 1");
            $stmt->execute([$sessionId]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$transaction) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaksi tidak ditemukan'
                ], 404);
            }
            $ipaymuResponse = $this->ipaymuService->checkPaymentStatus($sessionId);
            if ($ipaymuResponse['success'] && isset($ipaymuResponse['data']) && !empty($ipaymuResponse['data'])) {
                $this->updateTransactionFromResponse((int) $transaction['id'], $ipaymuResponse['data']);
                error_log("PaymentTransactionController::handleCallbackGet - Fallback GET: session_id=" . $sessionId . " disinkronkan dari API iPaymu");
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status disinkronkan',
                'session_id' => $sessionId
            ], 200);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::handleCallbackGet error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal sinkronisasi status'
            ], 500);
        }
    }

    /**
     * Apakah transaksi pending sudah lewat batas waktu bayar (kolom expired_at atau ExpiredDate di response_data iPayMu).
     */
    private function transactionIsPastExpiryForDisplay(array $transaction): bool
    {
        $now = time();
        $ea = $transaction['expired_at'] ?? null;
        if ($ea !== null && $ea !== '' && (string) $ea !== '0000-00-00 00:00:00') {
            $ts = strtotime((string) $ea);
            if ($ts !== false) {
                return $ts <= $now;
            }
        }
        $responseData = $transaction['response_data'] ?? null;
        if ($responseData === null || $responseData === '') {
            return false;
        }
        $raw = is_string($responseData) ? json_decode($responseData, true) : $responseData;
        if (!is_array($raw)) {
            return false;
        }
        $payload = $raw;
        if (isset($raw['Data']) && is_array($raw['Data'])) {
            $payload = array_merge($payload, $raw['Data']);
        }
        if (isset($raw['data']) && is_array($raw['data'])) {
            $payload = array_merge($payload, $raw['data']);
        }
        $d = $payload['ExpiredDate'] ?? $payload['expiredDate'] ?? $payload['expired_at'] ?? null;
        if ($d === null || $d === '') {
            return false;
        }
        $ts = strtotime((string) $d);

        return $ts !== false && $ts <= $now;
    }

    private function markPendingTransactionExpiredInDb(int $id): void
    {
        try {
            $stmt = $this->db->prepare(
                "UPDATE payment___transaction SET status = 'expired', tanggal_update = NOW() WHERE id = ? AND status = 'pending'"
            );
            $stmt->execute([$id]);
        } catch (\Throwable $e) {
            error_log('PaymentTransactionController::markPendingTransactionExpiredInDb: ' . $e->getMessage());
        }
    }

    /**
     * GET /api/payment-transaction/pending - Ambil transaksi pending berdasarkan id_registrasi atau id_santri
     */
    public function getPendingTransaction(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idRegistrasi = $queryParams['id_registrasi'] ?? null;
            $idSantriParam = $queryParams['id_santri'] ?? null;
            $idReferensi = $queryParams['id_referensi'] ?? null;
            $tabelReferensi = $queryParams['tabel_referensi'] ?? null;
            $status = $queryParams['status'] ?? 'pending';

            if (!$idRegistrasi && !$idSantriParam) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_registrasi atau id_santri wajib diisi'
                ], 400);
            }

            $idSantri = null;
            if ($idSantriParam) {
                $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
                if ($idSantri === null) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                    ], 400);
                }
            }

            // Query untuk mendapatkan transaksi pending
            // Tabel payment menggunakan id_referensi dan tabel_referensi
            // Untuk pendaftaran, id_referensi bisa berupa id_registrasi atau id dari psb___transaksi
            // Kita perlu cek melalui psb___transaksi untuk mendapatkan id_registrasi jika perlu
            $sql = "SELECT pt.*, p.id_santri, p.jenis_pembayaran, p.id_referensi, p.tabel_referensi
                    FROM payment___transaction pt
                    LEFT JOIN payment p ON pt.id_payment = p.id
                    LEFT JOIN psb___transaksi t ON (p.tabel_referensi = 'psb___transaksi' AND t.id = p.id_referensi)
                    WHERE pt.status = ?";
            
            $params = [$status];

            if ($idRegistrasi) {
                // Untuk id_registrasi, cek:
                // 1. id_referensi langsung = id_registrasi (jika tabel_referensi = 'psb___registrasi')
                // 2. Melalui psb___transaksi jika tabel_referensi = 'psb___transaksi'
                $sql .= " AND (
                    (p.tabel_referensi = 'psb___registrasi' AND p.id_referensi = ?)
                    OR (p.tabel_referensi = 'psb___transaksi' AND t.id_registrasi = ?)
                )";
                $params[] = $idRegistrasi;
                $params[] = $idRegistrasi;
            }
            
            if ($idSantri) {
                $sql .= " AND (p.id_santri = ?)";
                $params[] = $idSantri;
            }

            $accessSantriId = $idSantri;
            if ($accessSantriId === null && $idRegistrasi) {
                $stmtReg = $this->db->prepare('SELECT id_santri FROM psb___registrasi WHERE id = ? LIMIT 1');
                $stmtReg->execute([$idRegistrasi]);
                $regSantri = $stmtReg->fetchColumn();
                if ($regSantri !== false && $regSantri !== null) {
                    $accessSantriId = (int) $regSantri;
                }
            }
            $deny = $this->denyUnlessCanAccessSantriPayment($request, $response, $accessSantriId);
            if ($deny !== null) {
                return $deny;
            }

            // Filter by id_referensi (mis. tahun ajaran 1447-1448 untuk UWABA) agar yang muncul transaksi untuk tahun yang dipilih
            if ($idReferensi !== null && $idReferensi !== '') {
                $sql .= " AND (p.id_referensi = ?)";
                $params[] = $idReferensi;
            }
            if ($tabelReferensi !== null && $tabelReferensi !== '') {
                $sql .= " AND (p.tabel_referensi = ?)";
                $params[] = $tabelReferensi;
            }

            // Ambil yang paling baru
            $sql .= " ORDER BY pt.tanggal_dibuat DESC, pt.id DESC LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($transaction) {
                $transaction = $this->enrichTransactionWithFeeFromResponse($transaction);
                // Jangan kembalikan tagihan yang sudah lewat waktu — paksa buat order baru; samakan status di DB
                if (($transaction['status'] ?? '') === 'pending' && $this->transactionIsPastExpiryForDisplay($transaction)) {
                    $this->markPendingTransactionExpiredInDb((int) $transaction['id']);
                    $transaction = null;
                }
            }

            if ($transaction) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $transaction
                ], 200);
            }
            // Tidak ada transaksi pending: kembalikan 200 + data null (bukan 404) agar frontend bisa bedakan "tidak ada data" vs "endpoint tidak ada"
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tidak ada transaksi pending ditemukan',
                'data' => null
            ], 200);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::getPendingTransaction error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil transaksi pending'
            ], 500);
        }
    }

    /**
     * GET /api/payment-transaction/status/{sessionId} - Cek status transaksi
     */
    public function checkStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $sessionId = $args['sessionId'] ?? null;

            if (!$sessionId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Session ID tidak ditemukan'
                ], 400);
            }

            // Cek di database dulu
            $stmt = $this->db->prepare("SELECT pt.*, p.id_santri FROM payment___transaction pt LEFT JOIN payment p ON pt.id_payment = p.id WHERE pt.session_id = ? LIMIT 1");
            $stmt->execute([$sessionId]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$transaction) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaksi tidak ditemukan'
                ], 404);
            }

            $deny = $this->denyUnlessCanAccessSantriPayment(
                $request,
                $response,
                $this->resolveSantriIdFromTransactionRow($transaction)
            );
            if ($deny !== null) {
                return $deny;
            }

            // Pending: sync ke iPayMu. Cancelled/expired/failed: tetap cek (user bisa bayar dengan QR/VA yang sama setelah batal di app)
            $shouldPollGateway = in_array($transaction['status'], ['pending', 'cancelled', 'expired', 'failed'], true);
            if ($shouldPollGateway) {
                $gwProvider = $transaction['gateway_provider'] ?? PaymentGatewayConfig::PROVIDER_IPAYMU;
                if ($gwProvider === PaymentGatewayConfig::PROVIDER_XENDIT) {
                    $xenditService = $this->getGatewayServiceForRequest($request, PaymentGatewayConfig::PROVIDER_XENDIT);
                    if ($xenditService instanceof XenditService) {
                        $gwResponse = $xenditService->checkPaymentStatus($sessionId);
                        if (!empty($gwResponse['success']) && !empty($gwResponse['data'])) {
                            $norm = $gwResponse['data'];
                            if (($norm['status'] ?? '') === 'paid') {
                                $this->db->prepare(
                                    "UPDATE payment___transaction SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), response_data = ? WHERE id = ?"
                                )->execute([
                                    json_encode($norm['raw'] ?? $norm, JSON_UNESCAPED_UNICODE),
                                    $transaction['id'],
                                ]);
                                PaymentGatewaySettlementHelper::completePaidSettlement((int) $transaction['id']);
                            }
                            $stmt->execute([$sessionId]);
                            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
                        }
                    }
                } else {
                    $ipaymuService = $this->getIpaymuServiceForRequest($request);
                    $ipaymuResponse = $ipaymuService->checkPaymentStatus($sessionId);

                    if ($ipaymuResponse['success'] && isset($ipaymuResponse['data'])) {
                        $this->updateTransactionFromResponse($transaction['id'], $ipaymuResponse['data']);

                        $stmt->execute([$sessionId]);
                        $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
                    }
                }
            }

            $transaction = $this->enrichTransactionWithFeeFromResponse($transaction);
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $transaction
            ], 200);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::checkStatus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek status'
            ], 500);
        }
    }

    /**
     * Ambil admin_fee dan total dari kolom fee/sub_total/total atau response_data.
     * response_data iPayMu bisa pakai Fee/SubTotal/Total (PascalCase) atau fee/sub_total/total (snake_case).
     * Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT?version=latest
     */
    private function enrichTransactionWithFeeFromResponse(array $transaction): array
    {
        // Prioritas: kolom fee/sub_total/total di tabel (payment___transaction / payment___callback)
        if (isset($transaction['fee']) && $transaction['fee'] !== null && $transaction['fee'] !== '') {
            $transaction['admin_fee'] = (int) (float) $transaction['fee'];
        }
        if (isset($transaction['total']) && $transaction['total'] !== null && $transaction['total'] !== '') {
            $transaction['total'] = (float) $transaction['total'];
        }
        if (isset($transaction['sub_total']) && $transaction['sub_total'] !== null && $transaction['sub_total'] !== '') {
            $transaction['amount'] = (float) $transaction['sub_total'];
        }

        $responseData = $transaction['response_data'] ?? null;
        if ($responseData === null || $responseData === '') {
            return $transaction;
        }
        $raw = is_string($responseData) ? json_decode($responseData, true) : $responseData;
        if (!is_array($raw)) {
            return $transaction;
        }
        $payload = $raw;
        if (isset($raw['Data']) && is_array($raw['Data'])) {
            $payload = array_merge($payload, $raw['Data']);
        }
        if (isset($raw['data']) && is_array($raw['data'])) {
            $payload = array_merge($payload, $raw['data']);
        }

        // Fee: iPayMu response pakai "Fee" (PascalCase) atau "fee" (snake_case)
        if (!isset($transaction['admin_fee'])) {
            $feeVal = $payload['Fee'] ?? $payload['fee'] ?? null;
            if ($feeVal !== null && $feeVal !== '') {
                $transaction['admin_fee'] = (int) (float) $feeVal;
            }
        }
        // Total: "Total" atau "total"
        if (!isset($transaction['total']) || $transaction['total'] === null || $transaction['total'] === '') {
            $totalVal = $payload['Total'] ?? $payload['total'] ?? null;
            if ($totalVal !== null && $totalVal !== '') {
                $transaction['total'] = (float) $totalVal;
            }
        }
        // Amount (sub_total): "SubTotal" atau "sub_total"
        $hasSubTotalFromRow = isset($transaction['sub_total']) && $transaction['sub_total'] !== null && $transaction['sub_total'] !== '';
        if (!$hasSubTotalFromRow) {
            $subVal = $payload['SubTotal'] ?? $payload['sub_total'] ?? null;
            if ($subVal !== null && $subVal !== '') {
                $transaction['amount'] = (float) $subVal;
            }
        }
        return $transaction;
    }

    /**
     * Map status dari response iPaymu.
     * Status "paid"/"berhasil"/"success" = terbayar; dicatat Success di aplikasi meski dana belum di-cairkan (unsettled).
     * API transaction iPaymu bisa pakai Status numerik: 1 = Success, 0 = Pending, -1 = Processing, 2 = Cancelled, 3 = Refund.
     */
    private function mapStatusFromResponse(array $responseData): string
    {
        $raw = $responseData['status'] ?? $responseData['Status']
            ?? $responseData['status_code'] ?? $responseData['transaction_status_code']
            ?? $responseData['TransactionStatus'] ?? $responseData['PaymentStatus']
            ?? $responseData['transaction_status'] ?? $responseData['payment_status']
            ?? 'pending';
        $statusMap = [
            'pending' => 'pending',
            'paid' => 'paid',
            'berhasil' => 'paid',   // iPayMu callback body
            'success' => 'paid',
            'expired' => 'expired',
            'failed' => 'failed',
            'gagal' => 'failed',
            'cancelled' => 'cancelled',
            'dibatalkan' => 'cancelled',
            'refunded' => 'refunded',
            // Numerik: 1 = Success (callback status_code), 6 = paid/success (API Data / transaction_status_code)
            '1' => 'paid',
            '6' => 'paid',
            '0' => 'pending',
            '-1' => 'pending',
            '2' => 'cancelled',
            '3' => 'refunded',
        ];
        $key = is_numeric($raw) ? (string)(int)$raw : strtolower((string)$raw);
        return $statusMap[$key] ?? $statusMap[strtolower((string)$raw)] ?? 'pending';
    }

    /**
     * Update transaction dari response iPaymu (callback atau API cek transaksi).
     * Response API transaction bisa nested: {"Status":200,"Data":{"status","fee","total",...}}
     * Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT?version=latest
     */
    private function updateTransactionFromResponse(int $transactionId, array $responseData): void
    {
        try {
            // Normalisasi: ambil payload dari Data/data jika ada (response API transaction)
            $payload = $responseData;
            if (isset($responseData['Data']) && is_array($responseData['Data'])) {
                $payload = array_merge($payload, $responseData['Data']);
            }
            if (isset($responseData['data']) && is_array($responseData['data'])) {
                $payload = array_merge($payload, $responseData['data']);
            }

            $status = $this->mapStatusFromResponse($payload);
            error_log("PaymentTransactionController::updateTransactionFromResponse - transactionId=" . $transactionId . " payload_status_raw=" . json_encode($payload['status'] ?? $payload['Status'] ?? null) . " mapped=" . $status);
            $paidAt = $payload['paid_at'] ?? $responseData['paid_at'] ?? null;
            if ($paidAt) {
                $paidAt = is_numeric($paidAt) ? date('Y-m-d H:i:s', $paidAt) : date('Y-m-d H:i:s', strtotime($paidAt));
            }
            // iPayMu pakai Fee/SubTotal/Total (PascalCase) atau fee/sub_total/total
            $feeVal = $payload['Fee'] ?? $payload['fee'] ?? null;
            $subVal = $payload['SubTotal'] ?? $payload['sub_total'] ?? null;
            $totalVal = $payload['Total'] ?? $payload['total'] ?? null;
            $fee = ($feeVal !== null && $feeVal !== '') ? (float) $feeVal : null;
            $subTotal = ($subVal !== null && $subVal !== '') ? (float) $subVal : null;
            $total = ($totalVal !== null && $totalVal !== '') ? (float) $totalVal : null;

            $setParts = [
                'status = ?',
                'status_code = ?',
                'status_message = ?',
                'paid_at = ?',
                'response_data = ?'
            ];
            $updateParams = [
                $status,
                $payload['status_code'] ?? $payload['statusCode'] ?? $responseData['status_code'] ?? $responseData['Status'] ?? null,
                $payload['status_message'] ?? $payload['message'] ?? $responseData['Message'] ?? null,
                $paidAt,
                json_encode($responseData, JSON_UNESCAPED_UNICODE)
            ];

            try {
                $cols = $this->db->query("SHOW COLUMNS FROM payment___transaction")->fetchAll(\PDO::FETCH_COLUMN);
                if (in_array('fee', $cols, true)) {
                    $setParts[] = 'fee = ?';
                    $updateParams[] = $fee;
                }
                if (in_array('sub_total', $cols, true)) {
                    $setParts[] = 'sub_total = ?';
                    $updateParams[] = $subTotal;
                }
                if (in_array('total', $cols, true)) {
                    $setParts[] = 'total = ?';
                    $updateParams[] = $total;
                }
            } catch (\Exception $e) {
                // Kolom belum ada (migrasi 56 belum dijalankan)
            }

            $updateParams[] = $transactionId;
            $updateSql = "UPDATE payment___transaction SET " . implode(', ', $setParts) . " WHERE id = ?";
            $updateStmt = $this->db->prepare($updateSql);
            $updateStmt->execute($updateParams);

            // Update payment status jika paid
            if ($status === 'paid') {
                $stmt = $this->db->prepare("SELECT id_payment FROM payment___transaction WHERE id = ?");
                $stmt->execute([$transactionId]);
                $transactionRow = $stmt->fetch(\PDO::FETCH_ASSOC);
                
                if ($transactionRow && $transactionRow['id_payment']) {
                    $this->db->prepare("UPDATE payment SET status = 'Success' WHERE id = ?")
                        ->execute([$transactionRow['id_payment']]);
                    error_log("PaymentTransactionController::updateTransactionFromResponse - payment id=" . $transactionRow['id_payment'] . " updated to Success, calling updatePaymentStatusFromTransaction");
                    $this->ipaymuService->updatePaymentStatusFromTransaction((int) $transactionRow['id_payment']);
                } else {
                    error_log("PaymentTransactionController::updateTransactionFromResponse - status=paid but id_payment missing, transactionId=" . $transactionId);
                }
            }
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::updateTransactionFromResponse error: " . $e->getMessage());
        }
    }

    /**
     * PUT /api/payment-transaction/{id}/cancel - Batalkan transaksi
     */
    public function cancelTransaction(Request $request, Response $response, array $args): Response
    {
        try {
            error_log("cancelTransaction called - Method: " . $request->getMethod());
            error_log("cancelTransaction called - Args: " . json_encode($args));
            error_log("cancelTransaction called - URI: " . $request->getUri()->getPath());
            
            $transactionId = $args['id'] ?? null;

            if (!$transactionId) {
                error_log("cancelTransaction error: Transaction ID tidak ditemukan");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaction ID tidak ditemukan'
                ], 400);
            }
            
            error_log("cancelTransaction - Transaction ID: " . $transactionId);

            // Cek apakah transaksi ada dan masih pending
            // Cari dengan id (database) atau trx_id (iPayMu TransactionId)
            $stmt = $this->db->prepare("SELECT pt.id, pt.id_payment, pt.status, pt.session_id, pt.trx_id, p.id_santri FROM payment___transaction pt LEFT JOIN payment p ON pt.id_payment = p.id WHERE pt.id = ? OR pt.trx_id = ?");
            $stmt->execute([$transactionId, $transactionId]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);

            error_log("cancelTransaction - Query result: " . json_encode($transaction));

            if (!$transaction) {
                error_log("cancelTransaction error: Transaksi tidak ditemukan dengan ID: " . $transactionId);
                $errorResponse = [
                    'success' => false,
                    'message' => 'Transaksi tidak ditemukan'
                ];
                error_log("cancelTransaction - Returning 404 response: " . json_encode($errorResponse));
                return $this->jsonResponse($response, $errorResponse, 404);
            }

            $deny = $this->denyUnlessCanAccessSantriPayment(
                $request,
                $response,
                $this->resolveSantriIdFromTransactionRow($transaction)
            );
            if ($deny !== null) {
                return $deny;
            }

            error_log("cancelTransaction - Transaction status: " . $transaction['status']);

            // Hanya bisa cancel jika status masih pending
            if ($transaction['status'] !== 'pending') {
                error_log("cancelTransaction error: Transaksi tidak dapat dibatalkan. Status: " . $transaction['status']);
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaksi tidak dapat dibatalkan. Status: ' . $transaction['status']
                ], 400);
            }

            // Update status menjadi cancelled
            // Gunakan id dari database (bukan trx_id yang mungkin dikirim dari frontend)
            $dbTransactionId = $transaction['id'];
            error_log("cancelTransaction - Updating status to cancelled for DB ID: " . $dbTransactionId);
            $updateStmt = $this->db->prepare("UPDATE payment___transaction SET status = 'cancelled', tanggal_update = NOW() WHERE id = ?");
            $updateStmt->execute([$dbTransactionId]);
            $rowsAffected = $updateStmt->rowCount();
            error_log("cancelTransaction - Rows affected: " . $rowsAffected);

            // Kirim WA notifikasi pesanan dibatalkan: Pendaftaran -> santri; Uwaba/Khusus/Tunggakan -> users.no_wa
            $idPayment = $transaction['id_payment'] ?? null;
            if ($idPayment) {
                $idPaymentWa = (int) $idPayment;
                $self = $this;
                DeferredHttpTask::runAfterResponse(static function () use ($self, $idPaymentWa): void {
                    $self->deliverCancelTransactionWaNotifications($idPaymentWa);
                });
            }

            $responseData = [
                'success' => true,
                'message' => 'Transaksi berhasil dibatalkan',
                'data' => [
                    'transaction_id' => $dbTransactionId,
                    'trx_id' => $transaction['trx_id'] ?? null,
                    'status' => 'cancelled'
                ]
            ];
            
            error_log("cancelTransaction - Returning success response: " . json_encode($responseData));
            
            return $this->jsonResponse($response, $responseData, 200);
        } catch (\PDOException $e) {
            error_log("PaymentTransactionController::cancelTransaction PDO error: " . $e->getMessage());
            error_log("PaymentTransactionController::cancelTransaction PDO error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membatalkan transaksi: Database error'
            ], 500);
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::cancelTransaction error: " . $e->getMessage());
            error_log("PaymentTransactionController::cancelTransaction error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membatalkan transaksi'
            ], 500);
        }
    }

    /**
     * PUT /api/payment-transaction/{id}/update - Update transaksi (ubah nominal atau metode)
     * Note: Untuk update, kita perlu membuat transaksi baru karena iPayMu tidak support update transaksi yang sudah dibuat
     */
    public function updateTransaction(Request $request, Response $response, array $args): Response
    {
        try {
            $transactionId = $args['id'] ?? null;
            $input = $request->getParsedBody();

            if (!$transactionId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaction ID tidak ditemukan'
                ], 400);
            }

            // Cek apakah transaksi ada dan masih pending
            $stmt = $this->db->prepare("SELECT * FROM payment___transaction WHERE id = ?");
            $stmt->execute([$transactionId]);
            $oldTransaction = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$oldTransaction) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaksi tidak ditemukan'
                ], 404);
            }

            // Hanya bisa update jika status masih pending
            if ($oldTransaction['status'] !== 'pending') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Transaksi tidak dapat diubah. Status: ' . $oldTransaction['status']
                ], 400);
            }

            // Cancel transaksi lama
            $cancelStmt = $this->db->prepare("UPDATE payment___transaction SET status = 'cancelled', tanggal_update = NOW() WHERE id = ?");
            $cancelStmt->execute([$transactionId]);

            // Ambil data dari transaksi lama untuk membuat transaksi baru
            $amount = isset($input['amount']) ? (float)$input['amount'] : (float)$oldTransaction['amount'];
            $paymentMethod = $input['payment_method'] ?? $oldTransaction['payment_method'];
            $paymentChannel = $input['payment_channel'] ?? $oldTransaction['payment_channel'];

            // Validasi amount
            if ($amount <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal pembayaran harus lebih dari 0'
                ], 400);
            }

            // Ambil data payment untuk membuat transaksi baru
            $paymentStmt = $this->db->prepare("SELECT * FROM payment WHERE id = ?");
            $paymentStmt->execute([$oldTransaction['id_payment']]);
            $payment = $paymentStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$payment) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data payment tidak ditemukan'
                ], 404);
            }

            // Ambil data name, phone, email dari request atau dari payment/transaksi lama
            $name = $input['name'] ?? $payment['admin'] ?? 'Pembayar';
            $phone = $input['phone'] ?? '';
            $email = $input['email'] ?? '';

            // Jika phone atau email kosong, coba ambil dari request_data transaksi lama
            if (empty($phone) || empty($email)) {
                $oldRequestData = json_decode($oldTransaction['request_data'] ?? '{}', true);
                if (empty($phone) && isset($oldRequestData['phone'])) {
                    $phone = $oldRequestData['phone'];
                }
                if (empty($email) && isset($oldRequestData['email'])) {
                    $email = $oldRequestData['email'];
                }
            }

            // Validasi phone wajib
            if (empty($phone)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor telepon wajib diisi untuk membuat pembayaran baru'
                ], 400);
            }

            // Jika email kosong, gunakan default
            if (empty($email)) {
                $email = 'alutsmanipps@gmail.com';
            }

            // Buat transaksi baru dengan data yang diupdate
            // Langsung buat pembayaran ke iPayMu dengan memanggil createTransaction
            $newTransactionData = [
                'id_payment' => $oldTransaction['id_payment'],
                'amount' => $amount,
                'name' => $name,
                'phone' => $phone,
                'email' => $email,
                'payment_method' => $paymentMethod,
                'payment_channel' => $paymentChannel,
                'reference_id' => $oldTransaction['reference_id'] . '-UPDATED-' . time(),
                'jenis_pembayaran' => $payment['jenis_pembayaran'] ?? 'Pendaftaran',
                'id_registrasi' => $payment['id_referensi'] ?? null,
                'id_santri' => $payment['id_santri'] ?? null,
                'tabel_referensi' => $payment['tabel_referensi'] ?? 'psb___registrasi'
            ];

            // Buat request baru untuk createTransaction
            $createRequest = new \Slim\Psr7\Factory\ServerRequestFactory();
            $createRequest = $createRequest->createServerRequest('POST', '/api/payment-transaction/create');
            $createRequest = $createRequest->withParsedBody($newTransactionData);
            $createResponse = new \Slim\Psr7\Response();
            
            // Panggil createTransaction
            $createResult = $this->createTransaction($createRequest, $createResponse);
            $createResultBody = json_decode($createResult->getBody()->getContents(), true);
            
            if ($createResult->getStatusCode() === 200 && isset($createResultBody['success']) && $createResultBody['success']) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Transaksi berhasil diupdate dan pembayaran baru berhasil dibuat',
                    'data' => [
                        'old_transaction_id' => $transactionId,
                        'new_transaction' => $createResultBody['data'] ?? null
                    ]
                ], 200);
            } else {
                // Jika createTransaction gagal, tetap return success untuk cancel transaksi lama
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $createResultBody['message'] ?? 'Transaksi lama dibatalkan, tapi gagal membuat pembayaran baru. Silakan coba lagi.',
                    'data' => [
                        'old_transaction_id' => $transactionId,
                        'cancelled' => true
                    ]
                ], 400);
            }
        } catch (\Exception $e) {
            error_log("PaymentTransactionController::updateTransaction error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate transaksi'
            ], 500);
        }
    }

    /**
     * Pakai ulang baris payment___transaction pending/cancelled (nominal + metode + channel sama, belum kedaluwarsa, ada session_id).
     * Mencakup PSB Pendaftaran, UWABA, Khusus, Tunggakan (mybeddian) — selaras aplikasi daftar.
     */
    private function tryReuseExistingPendingIpaymuTransaction(array $input, float $amount, string $paymentMethod, string $paymentChannel): ?array
    {
        $tabelReferensi = isset($input['tabel_referensi']) ? trim((string) $input['tabel_referensi']) : 'psb___registrasi';
        $allowedTables = ['psb___registrasi', 'uwaba___bayar', 'uwaba___khusus', 'uwaba___tunggakan'];
        if (!in_array($tabelReferensi, $allowedTables, true)) {
            return null;
        }

        $jenisNorm = $this->normalizeJenisPembayaranForIpaymuReuse((string) ($input['jenis_pembayaran'] ?? 'Pendaftaran'));
        $jenisPerTable = [
            'psb___registrasi' => 'Pendaftaran',
            'uwaba___bayar' => 'Uwaba',
            'uwaba___khusus' => 'Khusus',
            'uwaba___tunggakan' => 'Tunggakan',
        ];
        if (($jenisPerTable[$tabelReferensi] ?? '') !== $jenisNorm) {
            return null;
        }

        $idSantriParam = $input['id_santri'] ?? null;
        $scopeExtraSql = '';
        $scopeParams = [];

        if ($tabelReferensi === 'psb___registrasi') {
            $idRegistrasi = isset($input['id_registrasi']) ? (int) $input['id_registrasi'] : 0;
            $idSantri = null;
            if ($idRegistrasi > 0) {
                $stmtR = $this->db->prepare('SELECT id_santri FROM psb___registrasi WHERE id = ? LIMIT 1');
                $stmtR->execute([$idRegistrasi]);
                $rowR = $stmtR->fetch(\PDO::FETCH_ASSOC);
                if ($rowR && isset($rowR['id_santri'])) {
                    $idSantri = (int) $rowR['id_santri'];
                }
            }
            if ($idSantriParam !== null && $idSantri === null) {
                $resolved = SantriHelper::resolveId($this->db, $idSantriParam);
                $idSantri = $resolved !== null ? (int) $resolved : null;
            }
            $scopeParts = [];
            if ($idRegistrasi > 0) {
                $scopeParts[] = '(p.id_referensi = ? AND p.tabel_referensi = \'psb___registrasi\')';
                $scopeParams[] = $idRegistrasi;
            }
            if ($idSantri !== null && $idSantri > 0) {
                $scopeParts[] = 'p.id_santri = ?';
                $scopeParams[] = $idSantri;
            }
            if ($scopeParts === []) {
                return null;
            }
            $scopeExtraSql = ' AND (' . implode(' OR ', $scopeParts) . ')';
        } elseif ($tabelReferensi === 'uwaba___bayar') {
            $resolvedS = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($resolvedS === null || (int) $resolvedS <= 0) {
                return null;
            }
            $idSantri = (int) $resolvedS;
            $tahunAjaran = isset($input['tahun_ajaran']) ? trim((string) $input['tahun_ajaran']) : '';
            if ($tahunAjaran === '' && isset($input['id_referensi'])) {
                $tahunAjaran = trim((string) $input['id_referensi']);
            }
            if ($tahunAjaran === '') {
                return null;
            }
            $cols = $this->db->query('SHOW COLUMNS FROM payment')->fetchAll(\PDO::FETCH_COLUMN);
            $hasTahunAjaran = in_array('tahun_ajaran', $cols, true);
            $idRefTrunc = (int) $tahunAjaran;
            if ($hasTahunAjaran) {
                $scopeExtraSql = ' AND p.id_santri = ? AND (p.tahun_ajaran = ? OR p.id_referensi = ?)';
                $scopeParams = [$idSantri, $tahunAjaran, $idRefTrunc];
            } else {
                $scopeExtraSql = ' AND p.id_santri = ? AND p.id_referensi = ?';
                $scopeParams = [$idSantri, $idRefTrunc];
            }
        } else {
            $resolvedS = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($resolvedS === null || (int) $resolvedS <= 0) {
                return null;
            }
            $idSantri = (int) $resolvedS;
            $idRef = isset($input['id_referensi']) ? (int) $input['id_referensi'] : 0;
            if ($idRef <= 0) {
                return null;
            }
            $scopeExtraSql = ' AND p.id_referensi = ? AND p.id_santri = ?';
            $scopeParams = [$idRef, $idSantri];
        }

        $channelNorm = trim((string) $paymentChannel);
        $amountSql = number_format($amount, 2, '.', '');

        $sql = 'SELECT pt.* FROM payment___transaction pt
                INNER JOIN payment p ON pt.id_payment = p.id
                WHERE pt.status IN (\'pending\', \'cancelled\')
                AND p.tabel_referensi = ?
                AND p.jenis_pembayaran = ?
                AND pt.payment_method = ?
                AND COALESCE(TRIM(pt.payment_channel) COLLATE utf8mb4_unicode_ci, \'\' COLLATE utf8mb4_unicode_ci)
                    = COALESCE(TRIM(CAST(? AS CHAR CHARACTER SET utf8mb4)) COLLATE utf8mb4_unicode_ci, \'\' COLLATE utf8mb4_unicode_ci)
                AND ABS(CAST(pt.amount AS DECIMAL(15,2)) - CAST(? AS DECIMAL(15,2))) < 0.02
                AND (pt.expired_at IS NULL OR pt.expired_at > NOW())
                AND pt.session_id IS NOT NULL AND CHAR_LENGTH(TRIM(pt.session_id)) > 0'
                . $scopeExtraSql . '
                ORDER BY pt.id DESC
                LIMIT 1';

        $params = array_merge([$tabelReferensi, $jenisNorm, $paymentMethod, $channelNorm, $amountSql], $scopeParams);
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        $hasVa = trim((string) ($row['va_number'] ?? '')) !== '';
        $hasQr = trim((string) ($row['qr_code'] ?? '')) !== '';
        $hasUrl = trim((string) ($row['payment_url'] ?? '')) !== '';
        if ($paymentMethod === 'va' && !$hasVa && !$hasUrl) {
            return null;
        }
        if ($paymentMethod === 'cstore' && !$hasVa && !$hasUrl) {
            return null;
        }
        if ($paymentMethod === 'qris' && !$hasQr && !$hasUrl) {
            return null;
        }

        // Batal di app hanya mengubah status lokal; QR/VA bisa masih valid — pakai ulang dan buka lagi alur bayar
        if (($row['status'] ?? '') === 'cancelled') {
            $this->db->prepare('UPDATE payment___transaction SET status = \'pending\', tanggal_update = NOW() WHERE id = ?')
                ->execute([(int) $row['id']]);
            $row['status'] = 'pending';
        }

        $row = $this->enrichTransactionWithFeeFromResponse($row);

        $expiredAt = $row['expired_at'] ?? null;
        if ($expiredAt instanceof \DateTimeInterface) {
            $expiredAt = $expiredAt->format('Y-m-d H:i:s');
        }

        $amtOut = isset($row['sub_total']) && $row['sub_total'] !== null && $row['sub_total'] !== ''
            ? (float) $row['sub_total']
            : (float) ($row['amount'] ?? $amount);
        $feeOut = isset($row['fee']) && $row['fee'] !== null && $row['fee'] !== '' ? (int) (float) $row['fee'] : null;
        $totalOut = isset($row['total']) && $row['total'] !== null && $row['total'] !== '' ? (float) $row['total'] : null;

        return [
            'transaction_id' => (int) $row['id'],
            'session_id' => $row['session_id'],
            'ipaymu_transaction_id' => $row['trx_id'] ?? null,
            'payment_url' => $row['payment_url'] ?? null,
            'qr_code' => $row['qr_code'] ?? null,
            'va_number' => $row['va_number'] ?? null,
            'expired_at' => $expiredAt,
            'amount' => $amtOut,
            'admin_fee' => $feeOut,
            'total' => $totalOut,
            'reused_existing' => true,
        ];
    }

    /**
     * POST /api/payment-transaction/{id}/send-wa
     * Staff eBeddien: kirim WA tagihan (QRIS=gambar QR; lain=logo metode + detail).
     * Body: { phone|phones[], email? }
     */
    public function sendWaNotification(Request $request, Response $response, array $args): Response
    {
        try {
            $trxId = isset($args['id']) ? (int) $args['id'] : 0;
            if ($trxId < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID transaksi tidak valid'], 400);
            }
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($userArr === [] || RoleHelper::getPengurusIdFromPayload($userArr) === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya staff yang dapat mengirim notifikasi WA tagihan',
                ], 403);
            }

            $input = $request->getParsedBody();
            if (!is_array($input)) {
                $input = [];
            }
            $phones = [];
            if (!empty($input['phones']) && is_array($input['phones'])) {
                foreach ($input['phones'] as $p) {
                    $phones[] = trim((string) $p);
                }
            }
            if (!empty($input['phone'])) {
                $phones[] = trim((string) $input['phone']);
            }
            $phones = array_values(array_filter($phones, static fn ($p) => $p !== ''));
            if ($phones === []) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp tujuan wajib diisi',
                ], 400);
            }
            $emailOverride = isset($input['email']) ? trim((string) $input['email']) : null;
            if ($emailOverride === '') {
                $emailOverride = null;
            }

            $stmt = $this->db->prepare(
                'SELECT t.*, p.id_santri, p.jenis_pembayaran, p.nama AS payment_nama
                 FROM payment___transaction t
                 LEFT JOIN payment p ON p.id = t.id_payment
                 WHERE t.id = ? LIMIT 1'
            );
            $stmt->execute([$trxId]);
            $trx = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$trx) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Transaksi tidak ditemukan'], 404);
            }

            $idSantri = !empty($trx['id_santri']) ? (int) $trx['id_santri'] : $this->resolveSantriIdFromTransactionRow($trx);
            $deny = $this->denyUnlessCanAccessSantriPayment($request, $response, $idSantri);
            if ($deny !== null) {
                return $deny;
            }

            $status = strtolower(trim((string) ($trx['status'] ?? '')));
            if (in_array($status, ['success', 'berhasil', 'paid', 'expire', 'expired', 'cancel', 'cancelled', 'failed'], true)) {
                // Izinkan kirim ulang selama masih pending/waiting; tolak jika sudah final expired/cancel
                if (in_array($status, ['expire', 'expired', 'cancel', 'cancelled', 'failed'], true)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Transaksi sudah tidak aktif; buat tagihan baru',
                    ], 400);
                }
            }

            $paymentMethod = strtolower(trim((string) ($trx['payment_method'] ?? '')));
            $paymentChannel = trim((string) ($trx['payment_channel'] ?? ''));
            $vaNumber = trim((string) ($trx['va_number'] ?? ''));
            $qrCode = trim((string) ($trx['qr_code'] ?? ''));
            $paymentUrl = trim((string) ($trx['payment_url'] ?? ''));
            if ($paymentUrl === '' && !empty($trx['url'])) {
                $paymentUrl = trim((string) $trx['url']);
            }
            $amount = (float) ($trx['sub_total'] ?? $trx['amount'] ?? 0);
            $fee = isset($trx['fee']) && $trx['fee'] !== null && $trx['fee'] !== '' ? (float) $trx['fee'] : null;
            $total = isset($trx['total']) && $trx['total'] !== null && $trx['total'] !== '' ? (float) $trx['total'] : null;

            $nama = trim((string) ($trx['payment_nama'] ?? ''));
            if ($nama === '' && $idSantri) {
                $st = $this->db->prepare('SELECT nama FROM santri WHERE id = ? LIMIT 1');
                $st->execute([$idSantri]);
                $nama = trim((string) ($st->fetchColumn() ?: ''));
            }
            if ($nama === '') {
                $nama = 'Pembayar';
            }

            $jenis = (string) ($trx['jenis_pembayaran'] ?? '');
            $link = $paymentUrl;
            if ($link === '') {
                if ($jenis === 'Pendaftaran') {
                    $link = WhatsAppService::getDaftarAppUrl() . '/pembayaran?payment=ipaymu';
                } else {
                    $link = WhatsAppService::getMybeddianAppUrl() . '/riwayat';
                }
            }

            $phonesCopy = $phones;
            $emailCopy = $emailOverride;
            $self = $this;
            DeferredHttpTask::runAfterResponse(static function () use (
                $self,
                $phonesCopy,
                $emailCopy,
                $nama,
                $amount,
                $fee,
                $total,
                $paymentMethod,
                $paymentChannel,
                $vaNumber,
                $qrCode,
                $paymentUrl,
                $link,
                $idSantri
            ): void {
                $self->runStaffSendWaDelivery(
                    $phonesCopy,
                    $emailCopy,
                    $nama,
                    $amount,
                    $fee,
                    $total,
                    $paymentMethod,
                    $paymentChannel,
                    $vaNumber,
                    $qrCode,
                    $paymentUrl,
                    $link,
                    $idSantri
                );
            });

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Notifikasi WA sedang dikirim',
                'data' => ['queued' => true, 'recipient_count' => count($phones)],
            ], 200);
        } catch (\Throwable $e) {
            error_log('PaymentTransactionController::sendWaNotification: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengirim notifikasi WA',
            ], 500);
        }
    }

    /**
     * @param list<string> $phones
     */
    private function runStaffSendWaDelivery(
        array $phones,
        ?string $emailOverride,
        string $nama,
        float $amount,
        ?float $fee,
        ?float $total,
        string $paymentMethod,
        string $paymentChannel,
        string $vaNumber,
        string $qrCode,
        string $paymentUrl,
        string $link,
        ?int $idSantri
    ): void {
        try {
            if ($paymentMethod === 'qris' && $qrCode !== '') {
                WhatsAppService::sendPsbPembayaranIpaymuQris(
                    $phones,
                    $nama,
                    $amount,
                    $fee,
                    $total,
                    $qrCode,
                    $link,
                    $idSantri,
                    true,
                    $emailOverride
                );
                return;
            }
            $vaOrCode = $vaNumber;
            if ($paymentMethod === 'ewallet' && $vaOrCode === '') {
                $vaOrCode = $paymentUrl !== '' ? $paymentUrl : $link;
            }
            if ($vaOrCode === '') {
                error_log('runStaffSendWaDelivery: tidak ada VA/kode/URL untuk method=' . $paymentMethod);
                return;
            }
            WhatsAppService::sendPsbPembayaranIpaymuOrder(
                $phones,
                $nama,
                $amount,
                $fee,
                $total,
                $paymentMethod,
                $paymentChannel,
                $vaOrCode,
                $link,
                $idSantri,
                true,
                true,
                $emailOverride
            );
        } catch (\Throwable $e) {
            error_log('PaymentTransactionController::runStaffSendWaDelivery: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $ctx id_payment, payment_method, payment_channel, va_number, qr_code, amount_for_wa, admin_fee_for_wa, total_for_wa, url_from_response
     */
    private function deliverIpaymuCreateTransactionWaNotifications(array $ctx): void
    {
        try {
            $idPayment = (int) ($ctx['id_payment'] ?? 0);
            if ($idPayment < 1) {
                return;
            }
            $paymentMethod = (string) ($ctx['payment_method'] ?? '');
            $paymentChannel = (string) ($ctx['payment_channel'] ?? '');
            $vaNumber = $ctx['va_number'] ?? null;
            $qrCodeFromResponse = $ctx['qr_code'] ?? null;
            $amountForWa = (float) ($ctx['amount_for_wa'] ?? 0);
            $adminFeeForWa = array_key_exists('admin_fee_for_wa', $ctx) ? $ctx['admin_fee_for_wa'] : null;
            $adminFeeForWa = $adminFeeForWa !== null && $adminFeeForWa !== '' ? (int) (float) $adminFeeForWa : null;
            $totalForWa = array_key_exists('total_for_wa', $ctx) && $ctx['total_for_wa'] !== null && $ctx['total_for_wa'] !== ''
                ? (float) $ctx['total_for_wa'] : null;
            $urlFromResponse = isset($ctx['url_from_response']) ? ($ctx['url_from_response'] !== null ? (string) $ctx['url_from_response'] : null) : null;

            $stmtPay = $this->db->prepare("SELECT id_santri, jenis_pembayaran, id_user FROM payment WHERE id = ?");
            $stmtPay->execute([$idPayment]);
            $pay = $stmtPay->fetch(\PDO::FETCH_ASSOC);
            if (!$pay) {
                return;
            }
            if (in_array($pay['jenis_pembayaran'] ?? '', ['Uwaba', 'Khusus', 'Tunggakan'], true) && !empty($pay['id_user'])) {
                $stmtUsers = $this->db->prepare("SELECT no_wa, username FROM users WHERE id = ? LIMIT 1");
                $stmtUsers->execute([$pay['id_user']]);
                $userRow = $stmtUsers->fetch(\PDO::FETCH_ASSOC);
                $noWaUser = $userRow ? trim($userRow['no_wa'] ?? '') : '';
                if ($noWaUser !== '') {
                    $nama = $userRow['username'] ?? 'Santri';
                    if (!empty($pay['id_santri'])) {
                        $stmtSn = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                        $stmtSn->execute([$pay['id_santri']]);
                        $sn = $stmtSn->fetch(\PDO::FETCH_ASSOC);
                        if ($sn && !empty($sn['nama'])) {
                            $nama = $sn['nama'];
                        }
                    }
                    $link = $urlFromResponse ?: (WhatsAppService::getMybeddianAppUrl() . '/riwayat');
                    $phoneNumbers = [$noWaUser];
                    if (!empty($vaNumber) && in_array($paymentMethod, ['va', 'cstore'], true)) {
                        WhatsAppService::sendPsbPembayaranIpaymuOrder(
                            $phoneNumbers,
                            $nama,
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            $paymentMethod,
                            $paymentChannel,
                            (string) $vaNumber,
                            $link,
                            !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null
                        );
                    } elseif ($paymentMethod === 'qris' && !empty($qrCodeFromResponse)) {
                        WhatsAppService::sendPsbPembayaranIpaymuQris(
                            $phoneNumbers,
                            $nama,
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            (string) $qrCodeFromResponse,
                            $link,
                            !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null
                        );
                    } elseif ($paymentMethod === 'ewallet' && $urlFromResponse) {
                        WhatsAppService::sendPsbPembayaranIpaymuOrder(
                            $phoneNumbers,
                            $nama,
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            $paymentMethod,
                            $paymentChannel,
                            (string) $urlFromResponse,
                            $link,
                            !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null
                        );
                    }
                }
            } elseif (($pay['jenis_pembayaran'] ?? '') === 'Pendaftaran' && !empty($pay['id_santri'])) {
                $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                $stmtSantri->execute([$pay['id_santri']]);
                $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                if ($santri) {
                    $noTelpon = trim($santri['no_telpon'] ?? '');
                    $noWaSantri = trim($santri['no_wa_santri'] ?? '');
                    $phoneNumbers = array_filter([$noTelpon, $noWaSantri]);
                    $link = $urlFromResponse ?: (WhatsAppService::getDaftarAppUrl() . '/pembayaran?payment=ipaymu');

                    if (!empty($vaNumber) && in_array($paymentMethod, ['va', 'cstore'], true)) {
                        WhatsAppService::sendPsbPembayaranIpaymuOrder(
                            $phoneNumbers,
                            $santri['nama'] ?? '',
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            $paymentMethod,
                            $paymentChannel,
                            (string) $vaNumber,
                            $link,
                            (int) $pay['id_santri']
                        );
                    } elseif ($paymentMethod === 'qris' && !empty($qrCodeFromResponse)) {
                        WhatsAppService::sendPsbPembayaranIpaymuQris(
                            $phoneNumbers,
                            $santri['nama'] ?? '',
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            (string) $qrCodeFromResponse,
                            $link,
                            (int) $pay['id_santri']
                        );
                    } elseif ($paymentMethod === 'ewallet' && $urlFromResponse) {
                        WhatsAppService::sendPsbPembayaranIpaymuOrder(
                            $phoneNumbers,
                            $santri['nama'] ?? '',
                            $amountForWa,
                            $adminFeeForWa,
                            $totalForWa,
                            $paymentMethod,
                            $paymentChannel,
                            (string) $urlFromResponse,
                            $link,
                            (int) $pay['id_santri']
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('PaymentTransactionController::deliverIpaymuCreateTransactionWaNotifications: ' . $e->getMessage());
        }
    }

    private function deliverCancelTransactionWaNotifications(int $idPayment): void
    {
        try {
            $stmtPay = $this->db->prepare("SELECT id_santri, jenis_pembayaran, id_user FROM payment WHERE id = ?");
            $stmtPay->execute([$idPayment]);
            $pay = $stmtPay->fetch(\PDO::FETCH_ASSOC);
            if (!$pay) {
                return;
            }
            if (in_array($pay['jenis_pembayaran'] ?? '', ['Uwaba', 'Khusus', 'Tunggakan'], true) && !empty($pay['id_user'])) {
                $stmtU = $this->db->prepare("SELECT no_wa, username FROM users WHERE id = ? LIMIT 1");
                $stmtU->execute([$pay['id_user']]);
                $u = $stmtU->fetch(\PDO::FETCH_ASSOC);
                $noWa = $u ? trim($u['no_wa'] ?? '') : '';
                if ($noWa !== '') {
                    $nama = $u['username'] ?? 'Santri';
                    if (!empty($pay['id_santri'])) {
                        $stmtSn = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                        $stmtSn->execute([$pay['id_santri']]);
                        $sn = $stmtSn->fetch(\PDO::FETCH_ASSOC);
                        if ($sn && !empty($sn['nama'])) {
                            $nama = $sn['nama'];
                        }
                    }
                    WhatsAppService::sendPsbPembayaranDibatalkan([$noWa], $nama, !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null);
                }
            } elseif (($pay['jenis_pembayaran'] ?? '') === 'Pendaftaran' && !empty($pay['id_santri'])) {
                $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                $stmtSantri->execute([$pay['id_santri']]);
                $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                if ($santri) {
                    $phoneNumbers = array_filter([trim($santri['no_telpon'] ?? ''), trim($santri['no_wa_santri'] ?? '')]);
                    WhatsAppService::sendPsbPembayaranDibatalkan($phoneNumbers, $santri['nama'] ?? '', (int) $pay['id_santri']);
                }
            }
        } catch (\Throwable $e) {
            error_log('PaymentTransactionController::deliverCancelTransactionWaNotifications: ' . $e->getMessage());
        }
    }

    /** Samakan input frontend (UWABA, dll.) dengan nilai enum kolom payment.jenis_pembayaran. */
    private function normalizeJenisPembayaranForIpaymuReuse(string $raw): string
    {
        return $this->normalizeJenisPembayaranForStorage($raw);
    }

    /** Normalisasi jenis_pembayaran sebelum INSERT ke kolom enum payment. */
    private function normalizeJenisPembayaranForStorage(string $raw): string
    {
        $k = strtoupper(trim($raw));
        $map = [
            'PENDAFTARAN' => 'Pendaftaran',
            'UWABA' => 'Uwaba',
            'KHUSUS' => 'Khusus',
            'TUNGGAKAN' => 'Tunggakan',
            'TABUNGAN' => 'Tabungan',
            'UMROH' => 'Umroh',
            'CASHLESS' => 'Cashless',
        ];

        return $map[$k] ?? trim($raw);
    }
}
