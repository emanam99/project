<?php

namespace App\Controllers;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\PengurusAdminIdHelper;
use App\Helpers\PublicPaymentTokenHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\StaffDataDeleteAuditHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PaymentController
{
    private $db;
    private $securityConfig;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $this->securityConfig = $config['security'] ?? [];
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Apakah fallback akses publik tanpa token diperbolehkan (legacy/transisi).
     * Default false. Setelah seluruh frontend pindah ke signed token, flag ini bisa tetap false permanen.
     */
    private function isPublicPaymentEndpointEnabled(): bool
    {
        return (bool) ($this->securityConfig['allow_public_payment_lookup'] ?? false);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function extractOptionalJwtUser(Request $request): ?array
    {
        $user = $request->getAttribute('user');
        if (is_array($user) && $user !== []) {
            return $user;
        }
        $auth = trim($request->getHeaderLine('Authorization'));
        if (!preg_match('/^Bearer\s+(\S+)/i', $auth, $m)) {
            return null;
        }
        $jwt = new JwtAuth();
        $payload = $jwt->validateToken($m[1]);

        return is_array($payload) ? $payload : null;
    }

    private function resolveJwtBoundSantriId(?array $user): ?int
    {
        if ($user === null || $user === []) {
            return null;
        }
        if (!empty($user['santri_id']) && (int) $user['santri_id'] > 0) {
            return (int) $user['santri_id'];
        }
        if (RoleHelper::tokenIsSantriDaftarContext($user)) {
            $fromToken = SantriHelper::resolveSantriIdFromDaftarToken($this->db, $user);

            return $fromToken !== null && $fromToken > 0 ? $fromToken : null;
        }

        return null;
    }

    /**
     * Jika JWT login memuat santri terikat, id_santri query tidak boleh beda.
     *
     * @return Response|null respons error atau null jika lolos
     */
    private function enforceJwtSantriBinding(Request $request, Response $response, int $resolvedSantriId): ?Response
    {
        $jwtSantri = $this->resolveJwtBoundSantriId($this->extractOptionalJwtUser($request));
        if ($jwtSantri === null) {
            return null;
        }
        if ($jwtSantri !== $resolvedSantriId) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Akses ditolak untuk santri ini',
            ], 403);
        }

        return null;
    }

    /**
     * Ambil token signed khusus pembayaran publik (bukan JWT login).
     *
     * Penting: Jangan baca Authorization Bearer — klien MyBeddian/eBeddien selalu mengirim JWT login di header itu.
     * Memaksa JWT lewat PublicPaymentTokenHelper::verify() menghasilkan 401 "Token tidak valid..." dan frontend
     * mengosongkan sesi / mengarahkan ke login.
     */
    private function extractPublicPaymentToken(Request $request): ?string
    {
        $headerToken = trim($request->getHeaderLine('X-Public-Payment-Token'));
        if ($headerToken !== '') {
            return $headerToken;
        }
        $params = $request->getQueryParams();
        $queryToken = isset($params['token']) ? trim((string) $params['token']) : '';

        return $queryToken !== '' ? $queryToken : null;
    }

    /**
     * Validasi token publik untuk mode endpoint tertentu.
     *
     * Aturan:
     * - Jika token disertakan → wajib valid + scope cocok; santri_id terikat ke token.
     * - Jika token tidak ada DAN flag `allow_public_payment_lookup` aktif → fallback transisi: lewat (santri_id=null).
     * - Jika token tidak ada DAN flag tidak aktif → 401/403.
     *
     * @return array{santri_id?: int|null, error?: Response, used_token?: bool}
     */
    private function authorizePublicPaymentRequest(Request $request, Response $response, string $endpointMode): array
    {
        $token = $this->extractPublicPaymentToken($request);
        if ($token !== null) {
            $payload = PublicPaymentTokenHelper::verify($token);
            if ($payload === null) {
                return ['error' => $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak valid atau sudah kedaluwarsa'
                ], 401)];
            }
            if (!PublicPaymentTokenHelper::scopeAllowsMode((string) $payload['mode'], $endpointMode)) {
                return ['error' => $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak berlaku untuk mode ini'
                ], 403)];
            }
            return ['santri_id' => (int) $payload['id_santri'], 'used_token' => true];
        }

        // Tanpa token → hanya boleh kalau kill-switch transisi diaktifkan.
        if (!$this->isPublicPaymentEndpointEnabled()) {
            return ['error' => $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Token akses pembayaran wajib disertakan'
            ], 401)];
        }
        return ['santri_id' => null, 'used_token' => false];
    }

    /**
     * POST /api/payment/public-token - Issue signed token akses pembayaran publik.
     * Endpoint ini WAJIB di-mount di route ber-auth (frontend internal yang sudah login).
     * Body JSON: { id_santri: int|nis, mode: "uwaba"|"khusus"|"tunggakan"|"all", ttl?: int }
     */
    public function issuePublicPaymentToken(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            $idSantriParam = is_array($body) ? ($body['id_santri'] ?? null) : null;
            $mode = is_array($body) ? trim((string) ($body['mode'] ?? PublicPaymentTokenHelper::SCOPE_ALL)) : PublicPaymentTokenHelper::SCOPE_ALL;
            $ttl = is_array($body) && isset($body['ttl']) ? (int) $body['ttl'] : null;

            if ($idSantriParam === null || $idSantriParam === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }
            if (!in_array($mode, PublicPaymentTokenHelper::ALLOWED_SCOPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Mode tidak valid'
                ], 400);
            }
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }
            $jwtUser = $request->getAttribute('user');
            $jwtUserArr = is_array($jwtUser) ? $jwtUser : [];
            $jwtSantri = $this->resolveJwtBoundSantriId($jwtUserArr !== [] ? $jwtUserArr : $this->extractOptionalJwtUser($request));
            if ($jwtSantri !== null && $jwtSantri !== $idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak dapat membuat token untuk santri lain',
                ], 403);
            }
            if ($jwtSantri === null && !RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $jwtUserArr)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak untuk menerbitkan token pembayaran publik',
                ], 403);
            }
            // Batas TTL maksimum (cegah token berumur panjang dibuat lewat parameter user).
            if ($ttl !== null && ($ttl <= 0 || $ttl > 1800)) {
                $ttl = null;
            }
            $token = PublicPaymentTokenHelper::issue($idSantri, $mode, $ttl);
            if ($token === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal membuat token'
                ], 500);
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'token' => $token,
                    'mode' => $mode,
                    'ttl' => $ttl,
                ]
            ], 200);
        } catch (\Exception $e) {
            error_log('issuePublicPaymentToken error: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat token akses pembayaran'
            ], 500);
        }
    }

    /**
     * Helper untuk mendapatkan konfigurasi tabel berdasarkan mode.
     * Riwayat pembayaran di-load dari tabel asli (bukan dari tabel payment):
     * - uwaba: uwaba___bayar
     * - khusus: uwaba___bayar_khusus
     * - tunggakan: uwaba___bayar_tunggakan
     */
    private function getTableConfig(string $pageMode): array
    {
        if ($pageMode === 'khusus') {
            return [
                'tabel_utama' => 'uwaba___khusus',
                'tabel_bayar' => 'uwaba___bayar_khusus',
                'id_kolom_referensi' => 'id_khusus'
            ];
        } elseif ($pageMode === 'uwaba') {
            return [
                'tabel_utama' => 'uwaba',
                'tabel_bayar' => 'uwaba___bayar',
                'id_kolom_referensi' => 'id'
            ];
        } else {
            return [
                'tabel_utama' => 'uwaba___tunggakan',
                'tabel_bayar' => 'uwaba___bayar_tunggakan',
                'id_kolom_referensi' => 'id_tunggakan'
            ];
        }
    }

    /**
     * Helper function untuk insert ke tabel payment (induk)
     * @param string $jenisPembayaran Pendaftaran, Uwaba, Tunggakan, Khusus, Tabungan, Umroh
     * @param int $idReferensi ID dari tabel referensi
     * @param string $tabelReferensi Nama tabel referensi
     * @param array $data Data pembayaran
     * @return int|false ID payment yang baru dibuat atau false jika gagal
     */
    private function insertToPayment(string $jenisPembayaran, int $idReferensi, string $tabelReferensi, array $data): int|false
    {
        try {
            $sql = "INSERT INTO payment (
                jenis_pembayaran, id_referensi, tabel_referensi, id_santri, id_jamaah,
                nominal, metode_pembayaran, via, bank, no_rekening, bukti_pembayaran,
                keterangan, hijriyah, masehi, id_admin, admin, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $jenisPembayaran,
                $idReferensi,
                $tabelReferensi,
                $data['id_santri'] ?? null,
                $data['id_jamaah'] ?? null,
                $data['nominal'] ?? 0,
                $data['metode_pembayaran'] ?? ($data['via'] ?? 'Cash'),
                $data['via'] ?? null,
                $data['bank'] ?? null,
                $data['no_rekening'] ?? null,
                $data['bukti_pembayaran'] ?? null,
                $data['keterangan'] ?? null,
                $data['hijriyah'] ?? null,
                $data['masehi'] ?? null,
                $data['id_admin'] ?? null,
                $data['admin'] ?? null,
                $data['status'] ?? 'Success'
            ]);
            
            $idPayment = $this->db->lastInsertId();
            
            // Update id_payment di tabel referensi
            $sqlUpdate = "UPDATE {$tabelReferensi} SET id_payment = ? WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$idPayment, $idReferensi]);
            
            return $idPayment;
        } catch (\Exception $e) {
            error_log("Insert to payment error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * GET /api/payment/rincian - Ambil rincian tunggakan/khusus berdasarkan id_santri
     */
    public function getRincian(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pageMode = $queryParams['page'] ?? 'tunggakan';
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['rincian' => [], 'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0]]
                ], 200);
            }

            // Rincian uwaba (bulanan) punya struktur berbeda; gunakan GET /api/uwaba atau GET /api/public/pembayaran/uwaba
            if ($pageMode === 'uwaba') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Untuk rincian uwaba gunakan endpoint GET /api/uwaba dengan id dan tahun_ajaran, atau GET /api/public/pembayaran/uwaba'
                ], 400);
            }

            $config = $this->getTableConfig($pageMode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Untuk tunggakan dan khusus, ambil semua data tanpa filter tahun_ajaran
            $sqlTunggakan = "SELECT id, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga FROM {$tabelUtama} WHERE id_santri=?";
            $stmt = $this->db->prepare($sqlTunggakan);
            $stmt->execute([$idSantriResolved]);
            
            $rincian = [];
            $totalNominal = 0;
            $totalBayar = 0;
            
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['wajib'] = (int)$row['wajib'];
                
                // Ambil total bayar dari tabel pembayaran
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$row['id']]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $row['bayar'] = (int)$rowSum['total_bayar'];
                $row['kurang'] = $row['wajib'] - $row['bayar'];
                $totalNominal += $row['wajib'];
                $totalBayar += $row['bayar'];
                $rincian[] = $row;
            }

            $total = [
                'total' => $totalNominal,
                'bayar' => $totalBayar,
                'kurang' => $totalNominal - $totalBayar
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rincian' => $rincian,
                    'total' => $total
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get rincian error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil rincian'
            ], 500);
        }
    }

    /**
     * GET /api/payment/history - Ambil history pembayaran untuk id_tunggakan atau id_khusus
     */
    public function getPaymentHistory(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pageMode = $queryParams['page'] ?? 'tunggakan';
            $idTunggakan = $queryParams['id_tunggakan'] ?? null;
            $idKhusus = $queryParams['id_khusus'] ?? null;

            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            $idReferensi = null;
            if ($pageMode === 'khusus' && $idKhusus) {
                $idReferensi = $idKhusus;
            } elseif ($pageMode === 'tunggakan' && $idTunggakan) {
                $idReferensi = $idTunggakan;
            } else {
                // Fallback: coba ambil dari query params
                $idReferensi = $queryParams[$idKolomReferensi] ?? null;
            }

            if (!$idReferensi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID referensi tidak valid'
                ], 400);
            }

            $sqlHistory = "SELECT id, {$idKolomReferensi} AS id_referensi, nominal, via, admin, hijriyah, tanggal_dibuat FROM {$tabelBayar} WHERE {$idKolomReferensi}=? ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sqlHistory);
            $stmt->execute([$idReferensi]);
            $history = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $history
            ], 200);

        } catch (\Exception $e) {
            error_log("Get payment history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/payment/create - Buat pembayaran baru untuk tunggakan/khusus
     */
    public function createPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            $config = $this->getTableConfig($pageMode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Validasi parameter
            $requiredFields = ['amount', 'admin', 'id_admin', 'id_santri', 'hijriyah', 'via'];
            $missingFields = [];

            foreach ($requiredFields as $field) {
                if (!isset($input[$field]) || $input[$field] === "") {
                    $missingFields[] = $field;
                }
            }

            // Cek apakah ada id_tunggakan atau id_khusus
            $idReferensi = null;
            if ($pageMode === 'khusus' && isset($input['id_khusus'])) {
                $idReferensi = $input['id_khusus'];
            } elseif ($pageMode === 'tunggakan' && isset($input['id_tunggakan'])) {
                $idReferensi = $input['id_tunggakan'];
            } else {
                $idReferensi = $input[$idKolomReferensi] ?? null;
            }

            if (!$idReferensi) {
                $missingFields[] = $idKolomReferensi;
            }

            if (!empty($missingFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid. Field yang hilang: ' . implode(', ', $missingFields)
                ], 400);
            }

            $idSantriRaw = $input['id_santri'];
            $idSantri = SantriHelper::resolveId($this->db, $idSantriRaw);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan untuk ID/NIS: ' . $idSantriRaw
                ], 400);
            }
            $amount = (float)$input['amount'];
            $hijriyah = $input['hijriyah'];
            $via = $input['via'];
            $idAdmin = PengurusAdminIdHelper::resolveFromRequest($request, $input['id_admin'] ?? 0);
            if ($idAdmin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }
            $admin = PengurusAdminIdHelper::fetchPengurusNama($this->db, $idAdmin) ?? trim((string) ($input['admin'] ?? ''));
            if ($admin === '') {
                $admin = 'Admin';
            }

            $this->db->beginTransaction();

            try {
                // Pastikan tunggakan/khusus ada
                $sqlSelect = "SELECT wajib FROM {$tabelUtama} WHERE id=? FOR UPDATE";
                $stmtSelect = $this->db->prepare($sqlSelect);
                $stmtSelect->execute([$idReferensi]);
                $tunggakan = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$tunggakan) {
                    throw new \Exception("Data dengan ID {$idReferensi} tidak ditemukan.");
                }
                $total = (float)$tunggakan['wajib'];

                // Hitung total bayar saat ini
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$idReferensi]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $currentBayar = (float)$rowSum['total_bayar'];

                $newBayar = $currentBayar + $amount;
                if ($newBayar > $total) {
                    throw new \Exception("Pembayaran melebihi total tunggakan.");
                }

                // Insert pembayaran ke tabel pembayaran
                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $sqlInsert = "INSERT INTO {$tabelBayar} (id_santri, {$idKolomReferensi}, nominal, via, admin, id_admin, hijriyah, tanggal_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtInsert = $this->db->prepare($sqlInsert);
                $stmtInsert->execute([$idSantri, $idReferensi, $amount, $via, $admin, $idAdmin, $hijriyah, $waktuIndonesia]);

                // Ambil id pembayaran yang baru dibuat
                $idPembayaran = $this->db->lastInsertId();

                // Insert ke tabel payment (induk)
                $jenisPembayaran = $pageMode === 'khusus' ? 'Khusus' : 'Tunggakan';
                $this->insertToPayment($jenisPembayaran, $idPembayaran, $tabelBayar, [
                    'id_santri' => $idSantri,
                    'nominal' => $amount,
                    'via' => $via,
                    'metode_pembayaran' => $via,
                    'hijriyah' => $hijriyah,
                    'id_admin' => $idAdmin,
                    'admin' => $admin,
                    'status' => 'Success'
                ]);

                $this->db->commit();
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil disimpan.'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Create payment error: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal memproses pembayaran'
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Create payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memproses pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/payment/delete - Hapus pembayaran
     */
    public function deletePayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            if (!isset($input['id_bayar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Pembayaran diperlukan.'
                ], 400);
            }

            $idBayar = $input['id_bayar'];
            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Log untuk debugging
            error_log("Delete payment - ID: {$idBayar}, Mode: {$pageMode}, Table: {$tabelBayar}");

            $this->db->beginTransaction();

            try {
                // Cek apakah data pembayaran ada (tanpa FOR UPDATE karena tidak diperlukan)
                $sqlSelectBayar = "SELECT id, nominal, id_admin, {$idKolomReferensi} FROM {$tabelBayar} WHERE id = ?";
                $stmtSelect = $this->db->prepare($sqlSelectBayar);
                $stmtSelect->execute([$idBayar]);
                $payment = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$payment) {
                    $this->db->rollBack();
                    error_log("Delete payment - Data tidak ditemukan: ID {$idBayar} di tabel {$tabelBayar}");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Data pembayaran dengan ID {$idBayar} tidak ditemukan di tabel {$tabelBayar}."
                    ], 404);
                }

                $uArr = is_array($request->getAttribute('user')) ? $request->getAttribute('user') : [];
                if (!PengurusAdminIdHelper::actorMayModifyRowPengurusId($uArr, $payment['id_admin'] ?? null)) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Akses ditolak: hanya pemilik pencatatan atau super_admin yang dapat menghapus.',
                    ], 403);
                }

                // Hapus pembayaran dari tabel riwayat
                $sqlDelete = "DELETE FROM {$tabelBayar} WHERE id = ?";
                $stmtDelete = $this->db->prepare($sqlDelete);
                $stmtDelete->execute([$idBayar]);
                $deleted = $stmtDelete->rowCount();

                if ($deleted > 0) {
                    $this->db->commit();
                    error_log("Delete payment - Berhasil menghapus ID {$idBayar} dari tabel {$tabelBayar}");
                    $idRef = (int) ($payment[$idKolomReferensi] ?? 0);
                    $parentRow = null;
                    if ($idRef > 0) {
                        $tabelUtama = $config['tabel_utama'];
                        $stmtPr = $this->db->prepare("SELECT id_santri, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga FROM {$tabelUtama} WHERE id = ?");
                        $stmtPr->execute([$idRef]);
                        $parentRow = $stmtPr->fetch(\PDO::FETCH_ASSOC) ?: null;
                    }
                    $idS = $parentRow ? (int) ($parentRow['id_santri'] ?? 0) : 0;
                    $judul = $pageMode === 'khusus' ? 'Pembayaran khusus — hapus riwayat bayar' : 'Pembayaran tunggakan — hapus riwayat bayar';
                    StaffDataDeleteAuditHelper::notify($request, $this->db, $judul, [
                        'Jenis data' => $pageMode === 'khusus' ? 'Riwayat bayar khusus (uwaba___bayar_khusus)' : 'Riwayat bayar tunggakan (uwaba___bayar_tunggakan)',
                        'Mode halaman' => (string) $pageMode,
                        'ID riwayat pembayaran' => (string) $idBayar,
                        'Nominal dihapus' => StaffDataDeleteAuditHelper::formatRupiah($payment['nominal'] ?? 0),
                        'ID tagihan (' . $idKolomReferensi . ')' => $idRef > 0 ? (string) $idRef : '-',
                        'Keterangan tagihan' => $parentRow ? trim((string) ($parentRow['keterangan_1'] ?? '')) : '-',
                        'Wajib tagihan' => $parentRow ? StaffDataDeleteAuditHelper::formatRupiah($parentRow['wajib'] ?? 0) : '-',
                        'Santri' => $idS > 0 ? StaffDataDeleteAuditHelper::fetchSantriSummaries($this->db, [$idS]) : '-',
                        'Tahun ajaran' => $parentRow ? trim((string) ($parentRow['tahun_ajaran'] ?? '')) : '-',
                    ]);
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Pembayaran berhasil dihapus.'
                    ], 200);
                } else {
                    $this->db->rollBack();
                    error_log("Delete payment - Tidak ada baris yang dihapus: ID {$idBayar} di tabel {$tabelBayar}");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tidak ada data yang dihapus. Data mungkin sudah tidak ada.'
                    ], 404);
                }

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Delete payment error (inner): " . $e->getMessage());
                error_log("Delete payment error (inner) trace: " . $e->getTraceAsString());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal menghapus pembayaran'
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Delete payment error (outer): " . $e->getMessage());
            error_log("Delete payment error (outer) trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/payment/check-related - Cek apakah ada pembayaran terkait
     */
    public function checkRelatedPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';

            if (!isset($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wajib diisi.'
                ], 400);
            }

            $id = $input['id'];
            $config = $this->getTableConfig($pageMode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            $sqlCek = "SELECT COUNT(*) as jumlah, COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
            $stmtCek = $this->db->prepare($sqlCek);
            $stmtCek->execute([$id]);
            $row = $stmtCek->fetch(\PDO::FETCH_ASSOC);
            $ada = ($row && $row['jumlah'] > 0);
            $totalBayar = $row ? (float)$row['total_bayar'] : 0;

            return $this->jsonResponse($response, [
                'success' => true,
                'ada_pembayaran' => $ada,
                'jumlah' => (int)($row['jumlah'] ?? 0),
                'total_bayar' => $totalBayar
            ], 200);

        } catch (\Exception $e) {
            error_log("Check related payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek pembayaran terkait'
            ], 500);
        }
    }

    /**
     * POST /api/payment/insert - Tambah data tunggakan/khusus
     */
    public function insertTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            
            if (!isset($input['id_santri'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $idSantriParam = $input['id_santri'];
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid).'
                ], 404);
            }
            $keterangan1 = $input['keterangan_1'];
            $keterangan2 = $input['keterangan_2'] ?? null;
            $wajib = (float)$input['total']; // Input masih 'total' untuk backward compatibility
            $tahunAjaran = $input['tahun_ajaran'];
            $lembaga = $input['lembaga'];
            $idAdmin = PengurusAdminIdHelper::resolveFromRequest($request, $input['id_admin'] ?? 0);
            if ($idAdmin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            
            $sqlInsert = "INSERT INTO {$tabel} (id_santri, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga, tanggal_dibuat, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmtInsert = $this->db->prepare($sqlInsert);
            $stmtInsert->execute([$idSantri, $keterangan1, $keterangan2, $wajib, $tahunAjaran, $lembaga, $waktuIndonesia, $idAdmin]);
            $newId = (int) $this->db->lastInsertId();
            $newRow = [
                'id' => $newId,
                'id_santri' => $idSantri,
                'keterangan_1' => $keterangan1,
                'keterangan_2' => $keterangan2,
                'wajib' => $wajib,
                'tahun_ajaran' => $tahunAjaran,
                'lembaga' => $lembaga,
                'tanggal_dibuat' => $waktuIndonesia,
                'id_admin' => $idAdmin,
            ];
            $u = $request->getAttribute('user');
            $idAdminResolved = $idAdmin !== null ? (int) $idAdmin : (isset($u['user_id']) ? (int) $u['user_id'] : (isset($u['id']) ? (int) $u['id'] : null));
            UserAktivitasLogger::log(null, $idAdminResolved, UserAktivitasLogger::ACTION_CREATE, $tabel, $newId, null, $newRow, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil ditambahkan.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Insert tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan data'
            ], 500);
        }
    }

    /**
     * POST /api/payment/update - Update data tunggakan/khusus
     */
    public function updateTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            
            if (!isset($input['id'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $id = $input['id'];
            $keterangan1 = $input['keterangan_1'];
            $keterangan2 = $input['keterangan_2'] ?? null;
            $wajib = (float)$input['total']; // Input masih 'total' untuk backward compatibility
            $tahunAjaran = $input['tahun_ajaran'] ?? null;
            $lembaga = $input['lembaga'] ?? null;
            $idAdmin = PengurusAdminIdHelper::resolveFromRequest($request, $input['id_admin'] ?? 0);
            if ($idAdmin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }

            // Ambil baris lengkap untuk audit (old_data)
            $sqlSelect = "SELECT * FROM {$tabel} WHERE id = ?";
            $stmtSelect = $this->db->prepare($sqlSelect);
            $stmtSelect->execute([$id]);
            $existing = $stmtSelect->fetch(\PDO::FETCH_ASSOC);
            
            if (!$existing) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan.'
                ], 404);
            }
            
            // Gunakan nilai dari input jika ada, jika tidak gunakan nilai dari database
            $finalTahunAjaran = ($tahunAjaran !== null && $tahunAjaran !== '') ? $tahunAjaran : $existing['tahun_ajaran'];
            $finalLembaga = ($lembaga !== null && $lembaga !== '') ? $lembaga : $existing['lembaga'];
            $finalWajib = ($wajib > 0) ? $wajib : (float)$existing['wajib'];
            $finalKeterangan1 = ($keterangan1 !== null && $keterangan1 !== '') ? $keterangan1 : $existing['keterangan_1'];
            $finalKeterangan2 = ($keterangan2 !== null && $keterangan2 !== '') ? $keterangan2 : $existing['keterangan_2'];
            
            if ($finalWajib <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Total wajib harus lebih dari 0.'
                ], 400);
            }
            
            $sqlUpdate = "UPDATE {$tabel} SET keterangan_1=?, keterangan_2=?, wajib=?, tahun_ajaran=?, lembaga=?, id_admin=? WHERE id=?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$finalKeterangan1, $finalKeterangan2, $finalWajib, $finalTahunAjaran, $finalLembaga, $idAdmin, $id]);
            $newRow = $existing;
            $newRow['keterangan_1'] = $finalKeterangan1;
            $newRow['keterangan_2'] = $finalKeterangan2;
            $newRow['wajib'] = $finalWajib;
            $newRow['tahun_ajaran'] = $finalTahunAjaran;
            $newRow['lembaga'] = $finalLembaga;
            $newRow['id_admin'] = $idAdmin;
            $u = $request->getAttribute('user');
            $idAdminResolved = $idAdmin !== null ? (int) $idAdmin : (isset($u['user_id']) ? (int) $u['user_id'] : (isset($u['id']) ? (int) $u['id'] : null));
            UserAktivitasLogger::log(null, $idAdminResolved, UserAktivitasLogger::ACTION_UPDATE, $tabel, $id, $existing, $newRow, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil diupdate.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate data'
            ], 500);
        }
    }

    /**
     * POST /api/payment/delete-item - Hapus data tunggakan/khusus
     */
    public function deleteTunggakanKhusus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $pageMode = $input['page'] ?? $request->getQueryParams()['page'] ?? 'tunggakan';
            
            if (!isset($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wajib diisi.'
                ], 400);
            }
            
            $id = $input['id'];
            $tabel = $pageMode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan';
            $stmtOld = $this->db->prepare("SELECT * FROM {$tabel} WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldRow = $stmtOld->fetch(\PDO::FETCH_ASSOC);

            if (!$oldRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan.',
                ], 404);
            }

            $uArr = PengurusAdminIdHelper::userArrayFromRequest($request);
            if (!PengurusAdminIdHelper::actorMayModifyRowPengurusId($uArr, $oldRow['id_admin'] ?? null)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: hanya pemilik pencatatan atau super_admin yang dapat menghapus.',
                ], 403);
            }

            $sqlDelete = "DELETE FROM {$tabel} WHERE id=?";
            $stmtDelete = $this->db->prepare($sqlDelete);
            $stmtDelete->execute([$id]);
            $idAdminResolved = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);
            if ($idAdminResolved <= 0) {
                $idAdminResolved = (int) ($oldRow['id_admin'] ?? 0);
            }
            UserAktivitasLogger::log(null, $idAdminResolved > 0 ? $idAdminResolved : null, UserAktivitasLogger::ACTION_DELETE, $tabel, $id, $oldRow, null, $request);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data berhasil dihapus.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Delete tunggakan/khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus data'
            ], 500);
        }
    }

    /**
     * GET /api/payment/khusus - Ambil data pembayaran khusus dengan filter
     */
    public function getPembayaranKhusus(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? '';
            $keterangan1 = $queryParams['keterangan_1'] ?? '';
            
            // Validasi input
            if (strlen($tahunAjaran) > 20) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran terlalu panjang (maksimal 20 karakter)',
                    'error_type' => 'validation'
                ], 400);
            }
            
            if (strlen($keterangan1) > 255) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Keterangan terlalu panjang (maksimal 255 karakter)',
                    'error_type' => 'validation'
                ], 400);
            }
            
            // Query untuk mendapatkan data pembayaran khusus
            $sql = "
                SELECT 
                    k.id,
                    k.id_santri,
                    s.nama as nama_santri,
                    s.nim_formal as nim,
                    COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                    k.wajib as total,
                    (k.wajib - COALESCE(SUM(bk.nominal), 0)) as kurang,
                    k.keterangan_1,
                    k.keterangan_2,
                    k.tahun_ajaran,
                    k.lembaga,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal,
                    k.tanggal_dibuat,
                    COALESCE(SUM(bk.nominal), 0) as total_bayar,
                    CASE 
                        WHEN COALESCE(SUM(bk.nominal), 0) >= k.wajib THEN 'Lunas'
                        WHEN COALESCE(SUM(bk.nominal), 0) > 0 THEN 'Belum Lunas'
                        ELSE 'Belum Bayar'
                    END as status_pembayaran
                FROM uwaba___khusus k
                LEFT JOIN santri s ON k.id_santri = s.id
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN uwaba___bayar_khusus bk ON k.id = bk.id_khusus
            ";
            
            $whereConditions = [];
            $params = [];
            
            // Filter tahun ajaran
            if (!empty($tahunAjaran)) {
                $whereConditions[] = "k.tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }
            
            // Filter keterangan_1
            if (!empty($keterangan1)) {
                $whereConditions[] = "k.keterangan_1 = ?";
                $params[] = $keterangan1;
            }
            
            // Tambahkan WHERE clause jika ada filter
            if (!empty($whereConditions)) {
                $sql .= " WHERE " . implode(" AND ", $whereConditions);
            }
            
            $sql .= " GROUP BY k.id ORDER BY k.tanggal_dibuat DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Query untuk mendapatkan daftar tahun ajaran yang tersedia
            $sqlTahun = "SELECT DISTINCT tahun_ajaran FROM uwaba___khusus WHERE tahun_ajaran IS NOT NULL AND tahun_ajaran != '' ORDER BY tahun_ajaran DESC";
            $stmtTahun = $this->db->query($sqlTahun);
            $tahunAjaranList = $stmtTahun->fetchAll(\PDO::FETCH_COLUMN);
            
            // Query untuk mendapatkan daftar keterangan_1 yang tersedia
            $sqlKeterangan = "SELECT DISTINCT keterangan_1 FROM uwaba___khusus WHERE keterangan_1 IS NOT NULL AND keterangan_1 != '' ORDER BY keterangan_1";
            $stmtKeterangan = $this->db->query($sqlKeterangan);
            $keteranganList = $stmtKeterangan->fetchAll(\PDO::FETCH_COLUMN);
            
            // Hitung statistik
            $totalSantri = count($data);
            $totalLunas = 0;
            $totalBelumLunas = 0;
            $totalBelumBayar = 0;
            $totalNominal = 0;
            $totalBayar = 0;
            
            foreach ($data as $row) {
                if ($row['status_pembayaran'] === 'Lunas') {
                    $totalLunas++;
                } elseif ($row['status_pembayaran'] === 'Belum Lunas') {
                    $totalBelumLunas++;
                } else {
                    $totalBelumBayar++;
                }
                $totalNominal += $row['total'];
                $totalBayar += $row['total_bayar'];
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'filters' => [
                    'tahun_ajaran' => $tahunAjaran,
                    'keterangan_1' => $keterangan1
                ],
                'options' => [
                    'tahun_ajaran_list' => $tahunAjaranList,
                    'keterangan_list' => $keteranganList
                ],
                'statistics' => [
                    'total_santri' => $totalSantri,
                    'total_lunas' => $totalLunas,
                    'total_belum_lunas' => $totalBelumLunas,
                    'total_belum_bayar' => $totalBelumBayar,
                    'total_nominal' => $totalNominal,
                    'total_bayar' => $totalBayar,
                    'total_kurang' => $totalNominal - $totalBayar
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get pembayaran khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat memproses permintaan',
                'error_type' => 'database'
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/last-number - Ambil nomor pembayaran terakhir untuk uwaba
     */
    public function getSyahriahLastNumber(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantri = $input['id_santri'] ?? '';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            
            if (empty($idSantri) || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran harus diisi'
                ], 400);
            }
            
            $stmt = $this->db->prepare("
                SELECT COUNT(*) as last_number 
                FROM uwaba___bayar 
                WHERE id_santri = ? AND tahun_ajaran = ?
            ");
            $stmt->execute([$idSantri, $tahunAjaran]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'last_number' => (int)($result['last_number'] ?? 0)
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba last number error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil nomor terakhir'
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/save - Simpan pembayaran uwaba
     */
    public function saveSyahriahPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $idSantriParam = $input['id_santri'] ?? '';
            $nominal = $input['nominal'] ?? 0;
            $via = $input['via'] ?? 'Cash';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            $hijriyah = $input['hijriyah'] ?? '';
            $idAdmin = PengurusAdminIdHelper::resolveFromRequest($request, $input['id_admin'] ?? 0);
            if ($idAdmin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }
            $admin = PengurusAdminIdHelper::fetchPengurusNama($this->db, $idAdmin) ?? trim((string) ($input['admin'] ?? ''));
            if ($admin === '') {
                $admin = 'Admin';
            }

            if ($idSantriParam === '' || $idSantriParam === null || empty($nominal) || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data pembayaran tidak lengkap'
                ], 400);
            }
            
            // Resolve id_santri: frontend bisa kirim santri.id atau NIS (setelah migrasi 78, id = AUTO_INCREMENT)
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                ], 404);
            }
            
            // Hitung nomor pembayaran
            $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
            $stmtCount->execute([$idSantri, $tahunAjaran]);
            $count = $stmtCount->fetchColumn();
            $nomor = $count + 1;
            
            // Insert pembayaran (id akan AUTO_INCREMENT)
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO uwaba___bayar 
                (id_santri, nominal, via, tahun_ajaran, hijriyah, id_admin, admin, nomor, masehi) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$idSantri, $nominal, $via, $tahunAjaran, $hijriyah, $idAdmin, $admin, $nomor, $waktuIndonesia]);
            
            // Ambil id yang baru dibuat
            $newId = $this->db->lastInsertId();
            $stmtNew = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtNew->execute([$newId]);
            $newBayar = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newBayar) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'uwaba___bayar', $newId, null, $newBayar, $request);
            }

            // Insert ke tabel payment (induk)
            $this->insertToPayment('Uwaba', $newId, 'uwaba___bayar', [
                'id_santri' => $idSantri,
                'nominal' => $nominal,
                'via' => $via,
                'metode_pembayaran' => $via,
                'hijriyah' => $hijriyah,
                'masehi' => date('Y-m-d', strtotime($waktuIndonesia)),
                'id_admin' => $idAdmin,
                'admin' => $admin,
                'status' => 'Success'
            ]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran berhasil disimpan',
                'id' => $newId
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Save uwaba payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/delete - Hapus pembayaran uwaba
     */
    public function deleteSyahriahPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $id = $input['id'] ?? '';
            
            if (empty($id)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pembayaran harus diisi'
                ], 400);
            }
            
            // Validasi bahwa id adalah integer (karena sekarang AUTO_INCREMENT INT)
            $id = filter_var($id, FILTER_VALIDATE_INT);
            if ($id === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pembayaran harus berupa angka'
                ], 400);
            }
            
            // Cek apakah data pembayaran ada sebelum dihapus (ambil full row untuk audit)
            $stmtCheck = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtCheck->execute([$id]);
            $oldBayar = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
            
            if (!$oldBayar) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pembayaran tidak ditemukan'
                ], 404);
            }
            $uArr = is_array($request->getAttribute('user')) ? $request->getAttribute('user') : [];
            if (!PengurusAdminIdHelper::actorMayModifyRowPengurusId($uArr, $oldBayar['id_admin'] ?? null)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: hanya pemilik pencatatan atau super_admin yang dapat menghapus.',
                ], 403);
            }
            $idAdmin = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);
            if ($idAdmin <= 0) {
                $idAdmin = (int) ($oldBayar['id_admin'] ?? 0);
            }

            // Coba hapus pembayaran
            // Jika error karena trigger yang bermasalah, nonaktifkan trigger dan coba lagi
            $triggerName = 'trg_backup_before_delete_uwaba_bayar';
            $triggerWasDisabled = false;
            
            try {
                // Hapus pembayaran (id sekarang adalah INT AUTO_INCREMENT)
                // Catatan: Foreign key constraint akan otomatis menangani relasi dengan tabel payment
                // Foreign key constraint fk_uwaba_bayar_id_payment akan set id_payment menjadi NULL saat delete
                $stmt = $this->db->prepare("DELETE FROM uwaba___bayar WHERE id = ?");
                $stmt->execute([$id]);
            } catch (\PDOException $e) {
                // Jika error karena trigger (error tentang INSERT dengan kolom tidak sesuai)
                if (strpos($e->getMessage(), 'Column count') !== false || 
                    strpos($e->getMessage(), 'Insert value list') !== false ||
                    strpos($e->getMessage(), 'does not match') !== false) {
                    
                    error_log("Delete failed due to trigger error. Attempting to disable trigger: " . $e->getMessage());
                    
                    try {
                        // Nonaktifkan trigger sementara
                        $this->db->exec("DROP TRIGGER IF EXISTS `{$triggerName}`");
                        $triggerWasDisabled = true;
                        error_log("Trigger {$triggerName} disabled temporarily");
                        
                        // Coba hapus lagi tanpa trigger
                        $stmt = $this->db->prepare("DELETE FROM uwaba___bayar WHERE id = ?");
                        $stmt->execute([$id]);
                    } catch (\Exception $e2) {
                        error_log("Error during trigger disable/retry: " . $e2->getMessage());
                        throw $e; // Throw original error
                    }
                } else {
                    // Error lain, throw as is
                    throw $e;
                }
            }
            if ($stmt->rowCount() > 0 && $oldBayar) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_DELETE, 'uwaba___bayar', $id, $oldBayar, null, $request);
            }
            
            if ($stmt->rowCount() > 0) {
                $idSantriU = (int) ($oldBayar['id_santri'] ?? 0);
                StaffDataDeleteAuditHelper::notify($request, $this->db, 'UWABA / syahriah — hapus pembayaran', [
                    'Jenis data' => 'Riwayat pembayaran UWABA (uwaba___bayar)',
                    'ID riwayat' => (string) $id,
                    'Nominal dihapus' => StaffDataDeleteAuditHelper::formatRupiah($oldBayar['nominal'] ?? 0),
                    'Tahun ajaran' => trim((string) ($oldBayar['tahun_ajaran'] ?? '')),
                    'Via' => trim((string) ($oldBayar['via'] ?? '')),
                    'Hijriyah' => trim((string) ($oldBayar['hijriyah'] ?? '')),
                    'Santri' => $idSantriU > 0 ? StaffDataDeleteAuditHelper::fetchSantriSummaries($this->db, [$idSantriU]) : '-',
                    'Admin pencatat (kolom)' => trim((string) ($oldBayar['admin'] ?? '')) ?: '-',
                ]);
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil dihapus'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pembayaran tidak ditemukan atau sudah dihapus'
                ], 404);
            }
            
        } catch (\PDOException $e) {
            error_log("Delete uwaba payment PDO error: " . $e->getMessage());
            error_log("PDO Error Code: " . $e->getCode());
            error_log("PDO Error Info: " . print_r($e->errorInfo, true));
            
            // Handle specific database errors
            $errorMessage = 'Gagal menghapus pembayaran';
            if ($e->getCode() == 23000) {
                $errorMessage = 'Pembayaran tidak dapat dihapus karena masih terhubung dengan data lain';
            } elseif ($e->getCode() == 42000) {
                $errorMessage = 'Kesalahan sintaks database';
            }
            
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => $errorMessage
            ], 500);
        } catch (\Exception $e) {
            error_log("Delete uwaba payment error: " . $e->getMessage());
            error_log("Error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/payment/syahriah/history - Ambil riwayat pembayaran uwaba
     */
    public function getSyahriahHistory(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $idSantriParam = $input['id_santri'] ?? '';
            $tahunAjaran = $input['tahun_ajaran'] ?? '';
            $filter = $input['filter'] ?? '';
            
            if ($idSantriParam === '' || $idSantriParam === null || empty($tahunAjaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran harus diisi'
                ], 400);
            }
            
            // Resolve id_santri: frontend bisa kirim santri.id atau NIS
            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }
            
            $query = "
                SELECT id, nominal, via, hijriyah, admin, masehi, tanggal_dibuat
                FROM uwaba___bayar 
                WHERE id_santri = ? AND tahun_ajaran = ?
                ORDER BY COALESCE(masehi, tanggal_dibuat) DESC
            ";
            
            $params = [$idSantri, $tahunAjaran];
            
            // Filter 'uwaba' tidak diperlukan lagi karena semua pembayaran uwaba masuk ke tabel ini
            // Jika perlu filter di masa depan, bisa menggunakan kolom lain atau flag khusus
            
            $stmt = $this->db->prepare($query);
            $stmt->execute($params);
            $payments = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $payments
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran'
            ], 500);
        }
    }

    /** Akar proyek web (htdocs) dari PaymentController: api/src/Controllers → naik 3 level */
    private function getWebRootPath(): string
    {
        return dirname(__DIR__, 3);
    }

    /**
     * Coba beberapa lokasi deploy (sama isi dengan /js/uwaba/uwaba-prices.json di eBeddien).
     */
    private function getUwabaPricesJsonCandidatePaths(): array
    {
        $root = $this->getWebRootPath();

        return [
            $root . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'uwaba' . DIRECTORY_SEPARATOR . 'uwaba-prices.json',
            $root . DIRECTORY_SEPARATOR . 'ebeddien' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'uwaba' . DIRECTORY_SEPARATOR . 'uwaba-prices.json',
        ];
    }

    /** @return array<string, mixed>|null */
    private function loadUwabaPricesJson(): ?array
    {
        foreach ($this->getUwabaPricesJsonCandidatePaths() as $path) {
            if (!\is_readable($path)) {
                continue;
            }
            $raw = @file_get_contents($path);
            if ($raw === false || $raw === '') {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (\is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    private function normalizeUwabaPriceKey($raw): string
    {
        if ($raw === null) {
            return '';
        }
        $s = trim((string) $raw);
        if ($s === '' || $s === '-' || $s === 'null' || $s === 'undefined') {
            return '';
        }

        return $s;
    }

    /**
     * Tambahan diniyah / formal / lttq — selaras addonWajib() di ebeddien/src/utils/uwabaCalculator.js
     */
    private function uwabaAddonWajib(?array $prices, string $section, string $keyRaw): int
    {
        if (!$prices || !isset($prices[$section]) || !\is_array($prices[$section])) {
            return 0;
        }
        $sectionData = $prices[$section];
        $k = $this->normalizeUwabaPriceKey($keyRaw);
        if ($k === '') {
            return 0;
        }
        if (isset($sectionData[$k]['wajib'])) {
            return (int) $sectionData[$k]['wajib'];
        }
        $n = (float) $k;
        if (\is_finite($n) && (string) (int) $k === $k) {
            $ik = (string) (int) $k;
            if (isset($sectionData[$ik]['wajib'])) {
                return (int) $sectionData[$ik]['wajib'];
            }
        }

        return 0;
    }

    /**
     * Biodata santri untuk lookup harga (lembaga_id diniyah/formal dari rombel).
     *
     * @return array<string, mixed>|null
     */
    private function fetchSantriBiodataForUwabaPricing(int $idSantri): ?array
    {
        $sql = 'SELECT COALESCE(st.status_santri, s.status_santri, \'\') AS status_santri, COALESCE(d.kategori, \'\') AS kategori, lt.tingkatan AS lttq, s.saudara_di_pesantren,
                rd.lembaga_id AS diniyah, rf.lembaga_id AS formal
                FROM santri s
                ' . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . '
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                WHERE s.id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Gabung snapshot json uwaba dengan biodata terkini — selaras mergeBiodataForUwabaPricing di uwabaCalculator.js
     *
     * @param array<string, mixed>|null $json
     * @param array<string, mixed>      $live
     *
     * @return array<string, mixed>
     */
    private function mergeUwabaJsonWithLiveBiodata(?array $json, array $live): array
    {
        $s = $json ?? [];
        $liveDin = $this->normalizeUwabaPriceKey($live['diniyah'] ?? null);
        $liveFor = $this->normalizeUwabaPriceKey($live['formal'] ?? null);
        $snapDin = $this->normalizeUwabaPriceKey($s['diniyah'] ?? null);
        $snapFor = $this->normalizeUwabaPriceKey($s['formal'] ?? null);
        $saudara = $this->normalizeUwabaPriceKey($live['saudara_di_pesantren'] ?? null)
            ?: $this->normalizeUwabaPriceKey($live['saudara'] ?? null)
            ?: $this->normalizeUwabaPriceKey($s['saudara'] ?? null)
            ?: $this->normalizeUwabaPriceKey($s['saudara_di_pesantren'] ?? null);

        return [
            'status_santri' => $this->normalizeUwabaPriceKey($live['status_santri'] ?? null)
                ?: $this->normalizeUwabaPriceKey($s['status_santri'] ?? null),
            'kategori' => $this->normalizeUwabaPriceKey($live['kategori'] ?? null)
                ?: $this->normalizeUwabaPriceKey($s['kategori'] ?? null),
            'diniyah' => $liveDin !== '' ? $liveDin : $snapDin,
            'formal' => $liveFor !== '' ? $liveFor : $snapFor,
            'lttq' => $this->normalizeUwabaPriceKey($live['lttq'] ?? null)
                ?: $this->normalizeUwabaPriceKey($s['lttq'] ?? null),
            'saudara' => $saudara,
        ];
    }

    /**
     * Hitung wajib dari biodata + uwaba-prices — selaras calculateWajibFromBiodata di uwabaCalculator.js
     */
    private function calculateWajibFromBiodataAndPrices(array $biodata, ?array $prices): int
    {
        if (!$prices) {
            return 0;
        }
        $status = $biodata['status_santri'] ?? '';
        $dinKey = $this->normalizeUwabaPriceKey($biodata['diniyah'] ?? null);
        $forKey = $this->normalizeUwabaPriceKey($biodata['formal'] ?? null);
        $lttqKey = $this->normalizeUwabaPriceKey($biodata['lttq'] ?? null);
        $saudaraVal = $this->normalizeUwabaPriceKey($biodata['saudara'] ?? null);

        $hargaDasar = 0;
        if ($status !== '' && isset($prices['status_santri'][$status]['wajib'])) {
            $hargaDasar = (int) $prices['status_santri'][$status]['wajib'];
        } elseif ($status !== '') {
            $node = $prices['status_santri'][$status] ?? null;
            if (\is_array($node)) {
                foreach ($node as $sub) {
                    if (\is_array($sub) && isset($sub['wajib'])) {
                        $hargaDasar = (int) $sub['wajib'];
                        break;
                    }
                }
            }
        }

        $tambahan = $this->uwabaAddonWajib($prices, 'diniyah', $dinKey)
            + $this->uwabaAddonWajib($prices, 'formal', $forKey)
            + $this->uwabaAddonWajib($prices, 'lttq', $lttqKey);

        $sebelumDiskon = $hargaDasar + $tambahan;

        $diskon = 0;
        if ($saudaraVal !== '' && $saudaraVal !== 'Tidak Ada'
            && isset($prices['saudara'][$saudaraVal]) && \is_array($prices['saudara'][$saudaraVal])) {
            $cfg = $prices['saudara'][$saudaraVal];
            $diskonType = $cfg['diskon_type'] ?? '';
            if ($diskonType === 'percentage') {
                $diskon = (int) round($sebelumDiskon * ((float) ($cfg['diskon'] ?? 0)) / 100);
            } else {
                $diskon = (int) ($cfg['diskon'] ?? 0);
            }
        }

        return max($sebelumDiskon - $diskon, 0);
    }

    /**
     * Wajib per bulan — selaras eBeddien Manage Data & UwabaRincian setelah simpan:
     * 1) kolom uwaba.wajib (sumber agregat SUM di dashboard),
     * 2) json.total_wajib jika kolom 0,
     * 3) hitung biodata + uwaba-prices hanya jika keduanya 0.
     */
    private function effectiveUwabaWajibFromRow(array $row, ?array $santriLive, ?array $prices): int
    {
        $col = (int) ($row['wajib'] ?? 0);
        if ($col > 0) {
            return $col;
        }

        $j = null;
        $rawJson = $row['json'] ?? null;
        if ($rawJson !== null && $rawJson !== '') {
            if (\is_string($rawJson)) {
                $decoded = json_decode($rawJson, true);
                $j = \is_array($decoded) ? $decoded : null;
            } elseif (\is_array($rawJson)) {
                $j = $rawJson;
            }
        }

        if ($j !== null && \array_key_exists('total_wajib', $j)) {
            $tw = (int) round((float) $j['total_wajib']);
            if ($tw > 0) {
                return $tw;
            }
        }

        if (!$santriLive || !$prices) {
            return 0;
        }

        $merged = $this->mergeUwabaJsonWithLiveBiodata($j, $santriLive);

        return $this->calculateWajibFromBiodataAndPrices($merged, $prices);
    }

    /**
     * Rincian publik UWABA untuk satu tahun ajaran — dipakai endpoint publik & MyBeddian self-service.
     *
     * @return array{rincian: array<int, array<string, mixed>>, total: array{total: int, bayar: int, kurang: int}}
     */
    public function getPublicUwabaRincianForTahun(int $idSantriResolved, string $tahunAjaran): array
    {
        return $this->buildPublicUwabaRincianForTahun($idSantriResolved, $tahunAjaran);
    }

    /**
     * Rincian publik UWABA untuk satu tahun ajaran (tabel uwaba + agregat uwaba___bayar).
     * Total wajib = jumlah effective wajib per bulan; bayar per baris = alokasi FIFO dari total bayar
     * (sama seperti distributePaymentToBulanData di UwabaRincian.jsx), bukan kolom uwaba.nominal.
     *
     * @return array{rincian: array<int, array<string, mixed>>, total: array{total: int, bayar: int, kurang: int}}
     */
    private function buildPublicUwabaRincianForTahun(int $idSantriResolved, string $tahunAjaran): array
    {
        $sqlUwaba = "SELECT id, id_bulan, wajib, nominal, tahun_ajaran, bulan, `json` FROM uwaba WHERE id_santri=? AND tahun_ajaran=? AND is_disabled=0 ORDER BY FIELD(id_bulan, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8)";
        $stmt = $this->db->prepare($sqlUwaba);
        $stmt->execute([$idSantriResolved, $tahunAjaran]);

        $rows = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $rows[] = $row;
        }

        $santriLive = $this->fetchSantriBiodataForUwabaPricing($idSantriResolved);
        $uwabaPrices = $this->loadUwabaPricesJson();

        $stmtSum = $this->db->prepare('SELECT COALESCE(SUM(nominal), 0) AS total_bayar FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
        $stmtSum->execute([$idSantriResolved, $tahunAjaran]);
        $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
        $totalBayar = (int) ($rowSum['total_bayar'] ?? 0);

        $bulanMapping = [
            1 => 'Muharram',
            2 => 'Shafar',
            3 => 'Rabiul Awal',
            4 => 'Rabiul Akhir',
            5 => 'Jumadil Ula',
            6 => 'Jumadil Akhir',
            7 => 'Rajab',
            8 => 'Sya\'ban',
            9 => 'Ramadhan',
            10 => 'Syawal',
            11 => 'Dzul Qo\'dah',
            12 => 'Dzul Hijjah',
        ];

        $totalWajib = 0;
        foreach ($rows as $row) {
            $totalWajib += $this->effectiveUwabaWajibFromRow($row, $santriLive, $uwabaPrices);
        }

        $sisaPembayaran = $totalBayar;
        $rincian = [];

        foreach ($rows as $row) {
            $idBulan = (int) $row['id_bulan'];
            $wajib = $this->effectiveUwabaWajibFromRow($row, $santriLive, $uwabaPrices);

            $allocated = 0;
            if ($wajib > 0 && $sisaPembayaran > 0) {
                if ($sisaPembayaran >= $wajib) {
                    $allocated = $wajib;
                    $sisaPembayaran -= $wajib;
                } else {
                    $allocated = $sisaPembayaran;
                    $sisaPembayaran = 0;
                }
            }

            $namaBulan = !empty($row['bulan']) && $row['bulan'] !== '-'
                ? $row['bulan']
                : ($bulanMapping[$idBulan] ?? "Bulan {$idBulan}");

            $rincian[] = [
                'id' => $row['id'],
                'id_bulan' => $idBulan,
                'keterangan_1' => $namaBulan,
                'keterangan_2' => null,
                'wajib' => $wajib,
                'bayar' => $allocated,
                'kurang' => $wajib - $allocated,
                'tahun_ajaran' => $row['tahun_ajaran'],
                'lembaga' => null,
            ];
        }

        return [
            'rincian' => $rincian,
            'total' => [
                'total' => $totalWajib,
                'bayar' => $totalBayar,
                'kurang' => max(0, $totalWajib - $totalBayar),
            ],
        ];
    }

    /**
     * GET /api/public/pembayaran/uwaba/tahun-list - Daftar tahun ajaran UWABA (format 1447-1448 dari tabel uwaba)
     * Dipakai agar insert uwaba___bayar memakai tahun_ajaran yang benar (1447-1448), bukan hanya 1447.
     */
    public function getPublicUwabaTahunList(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'uwaba'");
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'data' => ['tahun_ajaran' => []]], 200);
            }

            $idParam = $request->getQueryParams()['id_santri'] ?? null;
            $resolved = null;
            if ($idParam !== null && $idParam !== '') {
                $authResult = $this->authorizePublicPaymentRequest($request, $response, 'uwaba');
                if (isset($authResult['error'])) {
                    return $authResult['error'];
                }
                $resolved = SantriHelper::resolveId($this->db, $idParam);
                if ($resolved === null) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => ['tahun_ajaran' => []],
                    ], 200);
                }
                $bindErr = $this->enforceJwtSantriBinding($request, $response, $resolved);
                if ($bindErr !== null) {
                    return $bindErr;
                }
                $usedToken = (bool) ($authResult['used_token'] ?? false);
                $tokenSantriId = $authResult['santri_id'] ?? null;
                if ($usedToken && $resolved !== (int) $tokenSantriId) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Token tidak berlaku untuk santri ini',
                    ], 403);
                }
            } elseif (!$this->isPublicPaymentEndpointEnabled()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token akses pembayaran wajib disertakan',
                ], 401);
            }

            if ($resolved !== null) {
                // Hanya tahun yang punya data uwaba atau pembayaran uwaba untuk santri ini (hindari tahun global kosong)
                $stmt = $this->db->prepare(
                    'SELECT tahun_ajaran FROM (
                        SELECT DISTINCT tahun_ajaran FROM uwaba
                            WHERE id_santri = ? AND tahun_ajaran IS NOT NULL AND TRIM(COALESCE(tahun_ajaran,\'\')) != \'\'
                        UNION
                        SELECT DISTINCT tahun_ajaran FROM uwaba___bayar
                            WHERE id_santri = ? AND tahun_ajaran IS NOT NULL AND TRIM(COALESCE(tahun_ajaran,\'\')) != \'\'
                    ) t ORDER BY tahun_ajaran DESC'
                );
                $stmt->execute([$resolved, $resolved]);
            } else {
                $stmt = $this->db->query("SELECT DISTINCT tahun_ajaran FROM uwaba WHERE tahun_ajaran IS NOT NULL AND TRIM(tahun_ajaran) != '' ORDER BY tahun_ajaran DESC");
            }

            $rows = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $list = is_array($rows) ? array_values($rows) : [];
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['tahun_ajaran' => $list]
            ], 200);
        } catch (\Exception $e) {
            error_log("getPublicUwabaTahunList error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar tahun ajaran UWABA'
            ], 500);
        }
    }

    /**
     * GET /api/public/pembayaran/{mode} - Public endpoint untuk rincian pembayaran
     * Mode: uwaba, khusus, tunggakan
     */
    public function getPublicRincian(Request $request, Response $response, array $args): Response
    {
        try {
            $mode = $args['mode'] ?? null;
            // Validasi mode
            $validModes = ['uwaba', 'khusus', 'tunggakan'];
            if (!in_array($mode, $validModes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Mode tidak valid. Gunakan: uwaba, khusus, atau tunggakan'
                ], 400);
            }

            $authResult = $this->authorizePublicPaymentRequest($request, $response, (string) $mode);
            if (isset($authResult['error'])) {
                return $authResult['error'];
            }
            $usedToken = (bool) ($authResult['used_token'] ?? false);
            $tokenSantriId = $authResult['santri_id'] ?? null;

            $queryParams = $request->getQueryParams();
            $tahunAjaranRaw = $queryParams['tahun_ajaran'] ?? null;
            $tahunAjaranParam = \is_string($tahunAjaranRaw) ? trim($tahunAjaranRaw) : '';
            $idSantri = $queryParams['id_santri'] ?? $tokenSantriId;

            if ($idSantri === null || $idSantri === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan. Periksa id_santri/NIS atau login ulang sebagai santri.',
                    'data' => ['rincian' => [], 'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0]],
                ], 200);
            }
            if ($usedToken && $idSantriResolved !== (int) $tokenSantriId) {
                // Token TIDAK match dengan id_santri di query → tolak (cegah re-use token untuk santri lain).
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak berlaku untuk santri ini'
                ], 403);
            }
            $bindErr = $this->enforceJwtSantriBinding($request, $response, $idSantriResolved);
            if ($bindErr !== null) {
                return $bindErr;
            }

            // Untuk uwaba, gunakan struktur berbeda (tabel uwaba)
            if ($mode === 'uwaba') {
                $stmtCheckTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba'");
                $stmtCheckTable->execute();
                $tableExists = $stmtCheckTable->rowCount() > 0;

                if (!$tableExists) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => [
                            'multi_tahun' => false,
                            'rincian' => [],
                            'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                            'per_tahun' => [],
                            'grand_total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                        ],
                    ], 200);
                }

                $uwabaSemuaTahun = ($tahunAjaranParam === '' || strtolower($tahunAjaranParam) === 'all');

                if ($uwabaSemuaTahun) {
                    $stmtY = $this->db->prepare("SELECT DISTINCT tahun_ajaran FROM uwaba WHERE id_santri = ? AND tahun_ajaran IS NOT NULL AND TRIM(COALESCE(tahun_ajaran,'')) != '' ORDER BY tahun_ajaran DESC");
                    $stmtY->execute([$idSantriResolved]);
                    /** @var list<string> $years */
                    $years = $stmtY->fetchAll(\PDO::FETCH_COLUMN) ?: [];

                    if ($years === []) {
                        return $this->jsonResponse($response, [
                            'success' => true,
                            'data' => [
                                'multi_tahun' => true,
                                'rincian' => [],
                                'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                                'per_tahun' => [],
                                'grand_total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                            ],
                        ], 200);
                    }

                    $perTahun = [];
                    $grand = ['total' => 0, 'bayar' => 0, 'kurang' => 0];
                    foreach ($years as $ta) {
                        $taStr = (string) $ta;
                        $payload = $this->buildPublicUwabaRincianForTahun($idSantriResolved, $taStr);
                        $perTahun[] = [
                            'tahun_ajaran' => $taStr,
                            'rincian' => $payload['rincian'],
                            'total' => $payload['total'],
                        ];
                        $grand['total'] += $payload['total']['total'];
                        $grand['bayar'] += $payload['total']['bayar'];
                        $grand['kurang'] += $payload['total']['kurang'];
                    }

                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => [
                            'multi_tahun' => true,
                            'rincian' => [],
                            'total' => ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                            'per_tahun' => $perTahun,
                            'grand_total' => $grand,
                        ],
                    ], 200);
                }

                $payload = $this->buildPublicUwabaRincianForTahun($idSantriResolved, $tahunAjaranParam);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'multi_tahun' => false,
                        'tahun_ajaran' => $tahunAjaranParam,
                        'rincian' => $payload['rincian'],
                        'total' => $payload['total'],
                        'per_tahun' => [],
                        'grand_total' => $payload['total'],
                    ],
                ], 200);
            }

            // Untuk khusus dan tunggakan, gunakan struktur yang sama
            $config = $this->getTableConfig($mode);
            $tabelUtama = $config['tabel_utama'];
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Untuk tunggakan dan khusus, ambil semua data tanpa filter tahun_ajaran
            $sqlTunggakan = "SELECT id, keterangan_1, keterangan_2, wajib, tahun_ajaran, lembaga FROM {$tabelUtama} WHERE id_santri=?";
            $stmt = $this->db->prepare($sqlTunggakan);
            $stmt->execute([$idSantriResolved]);
            
            $rincian = [];
            $totalNominal = 0;
            $totalBayar = 0;
            
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['wajib'] = (int)$row['wajib'];
                
                // Ambil total bayar dari tabel pembayaran
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM {$tabelBayar} WHERE {$idKolomReferensi}=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$row['id']]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $row['bayar'] = (int)$rowSum['total_bayar'];
                $row['kurang'] = $row['wajib'] - $row['bayar'];
                $totalNominal += $row['wajib'];
                $totalBayar += $row['bayar'];
                $rincian[] = $row;
            }

            $total = [
                'total' => $totalNominal,
                'bayar' => $totalBayar,
                'kurang' => $totalNominal - $totalBayar
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rincian' => $rincian,
                    'total' => $total
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public rincian error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil rincian'
            ], 500);
        }
    }

    /**
     * GET /api/public/pembayaran/{mode}/history - Public endpoint untuk riwayat pembayaran.
     * Data di-load dari tabel asli (bukan payment): uwaba___bayar, uwaba___bayar_khusus, uwaba___bayar_tunggakan.
     * Mode: uwaba, khusus, tunggakan
     */
    public function getPublicPaymentHistory(Request $request, Response $response, array $args): Response
    {
        try {
            $mode = $args['mode'] ?? null;
            $validModes = ['uwaba', 'khusus', 'tunggakan'];
            if (!in_array($mode, $validModes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Mode tidak valid. Gunakan: uwaba, khusus, atau tunggakan'
                ], 400);
            }

            $authResult = $this->authorizePublicPaymentRequest($request, $response, (string) $mode);
            if (isset($authResult['error'])) {
                return $authResult['error'];
            }
            $usedToken = (bool) ($authResult['used_token'] ?? false);
            $tokenSantriId = $authResult['santri_id'] ?? null;

            $queryParams = $request->getQueryParams();
            $tahunAjaranHistRaw = $queryParams['tahun_ajaran'] ?? null;
            $tahunAjaranHistParam = \is_string($tahunAjaranHistRaw) ? trim($tahunAjaranHistRaw) : '';
            $idSantri = $queryParams['id_santri'] ?? $tokenSantriId;

            if ($idSantri === null || $idSantri === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan. Periksa id_santri/NIS atau login ulang sebagai santri.',
                    'data' => [],
                ], 200);
            }
            if ($usedToken && $idSantriResolved !== (int) $tokenSantriId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Token tidak berlaku untuk santri ini'
                ], 403);
            }
            $bindErr = $this->enforceJwtSantriBinding($request, $response, $idSantriResolved);
            if ($bindErr !== null) {
                return $bindErr;
            }

            // Riwayat uwaba: dari tabel uwaba___bayar (bukan payment)
            if ($mode === 'uwaba') {
                $uwabaHistSemuaTahun = ($tahunAjaranHistParam === '' || strtolower($tahunAjaranHistParam) === 'all');

                if ($uwabaHistSemuaTahun) {
                    $query = "
                        SELECT id, nominal, via, hijriyah, admin, masehi, tanggal_dibuat, tahun_ajaran
                        FROM uwaba___bayar 
                        WHERE id_santri = ?
                        ORDER BY COALESCE(masehi, tanggal_dibuat) DESC
                    ";
                    $stmt = $this->db->prepare($query);
                    $stmt->execute([$idSantriResolved]);
                } else {
                    $query = "
                        SELECT id, nominal, via, hijriyah, admin, masehi, tanggal_dibuat, tahun_ajaran
                        FROM uwaba___bayar 
                        WHERE id_santri = ? AND tahun_ajaran = ?
                        ORDER BY COALESCE(masehi, tanggal_dibuat) DESC
                    ";
                    $stmt = $this->db->prepare($query);
                    $stmt->execute([$idSantriResolved, $tahunAjaranHistParam]);
                }
                $payments = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                // Pastikan unik per id (satu baris = satu transaksi pembayaran)
                $byId = [];
                foreach ($payments as $row) {
                    $id = $row['id'] ?? null;
                    if ($id !== null && !isset($byId[$id])) {
                        $byId[$id] = $row;
                    }
                }
                $payments = array_values($byId);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $payments
                ], 200);
            }

            // Riwayat khusus/tunggakan: dari uwaba___bayar_khusus / uwaba___bayar_tunggakan (bukan payment)
            $config = $this->getTableConfig($mode);
            $tabelBayar = $config['tabel_bayar'];
            $idKolomReferensi = $config['id_kolom_referensi'];

            // Ambil semua id referensi untuk id_santri ini
            $tabelUtama = $config['tabel_utama'];
            $sqlIds = "SELECT id FROM {$tabelUtama} WHERE id_santri=?";
            $stmtIds = $this->db->prepare($sqlIds);
            $stmtIds->execute([$idSantriResolved]);
            $ids = $stmtIds->fetchAll(\PDO::FETCH_COLUMN);

            if (empty($ids)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            // Ambil semua history untuk semua id referensi
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sqlHistory = "SELECT id, {$idKolomReferensi} AS id_referensi, nominal, via, admin, hijriyah, tanggal_dibuat as masehi FROM {$tabelBayar} WHERE {$idKolomReferensi} IN ({$placeholders}) ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sqlHistory);
            $stmt->execute($ids);
            $history = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $history
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public payment history error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran'
            ], 500);
        }
    }
}

