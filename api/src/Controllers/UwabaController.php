<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusAdminIdHelper;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UwabaController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
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
     * GET /api/uwaba - Ambil data uwaba untuk id dan tahun_ajaran
     */
    public function getUwaba(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idParam = $queryParams['id'] ?? '';
            $tahun_ajaran = $queryParams['tahun_ajaran'] ?? date('Y');
            
            // Resolve id atau nis dari frontend ke santri.id (untuk query DB)
            $idSantri = SantriHelper::resolveId($this->db, $idParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan',
                    'data' => [],
                    'histori' => []
                ], 404);
            }
            
            // Cek apakah tabel uwaba ada
            $stmtCheckTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba'");
            $stmtCheckTable->execute();
            $tableExists = $stmtCheckTable->rowCount() > 0;
            
            if (!$tableExists) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel uwaba tidak ditemukan',
                    'data' => [],
                    'histori' => []
                ], 404);
            }
            
            // Ambil semua data uwaba untuk id_santri dan tahun_ajaran (termasuk yang disabled)
            $stmt = $this->db->prepare('SELECT *, JSON_UNQUOTE(json) as json_data FROM uwaba WHERE id_santri = ? AND tahun_ajaran = ? ORDER BY id_bulan ASC');
            $stmt->execute([$idSantri, $tahun_ajaran]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Ambil histori pembayaran dari uwaba___bayar
            $histori = [];
            $stmtCheckHistoriTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba___bayar'");
            $stmtCheckHistoriTable->execute();
            $historiTableExists = $stmtCheckHistoriTable->rowCount() > 0;
            
            if ($historiTableExists) {
                $stmtHistori = $this->db->prepare('SELECT id, nominal, via, hijriyah, masehi as tanggal_dibuat, admin FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ? ORDER BY masehi ASC');
                $stmtHistori->execute([$idSantri, $tahun_ajaran]);
                $histori = $stmtHistori->fetchAll(\PDO::FETCH_ASSOC);
            }

            $nis = SantriHelper::getNisById($this->db, $idSantri);
            return $this->jsonResponse($response, [
                'success' => true,
                'id_santri' => $idSantri,
                'nis' => $nis,
                'data' => $data,
                'histori' => $histori
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat memproses permintaan',
                'data' => [],
                'histori' => []
            ], 500);
        }
    }

    /**
     * GET /api/uwaba/all-rows?id= — Semua baris uwaba santri (semua tahun ajaran), untuk agregasi wajib/json.
     * Urutan: tahun_ajaran ASC, id ASC (iterasi terakhir menang dedupe nominal sama).
     */
    public function getAllUwabaRowsBySantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idParam = $queryParams['id'] ?? '';

            $idSantri = SantriHelper::resolveId($this->db, $idParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan',
                    'data' => [],
                ], 404);
            }

            $stmtCheckTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba'");
            $stmtCheckTable->execute();
            if ($stmtCheckTable->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel uwaba tidak ditemukan',
                    'data' => [],
                ], 404);
            }

            $stmt = $this->db->prepare(
                'SELECT id, tahun_ajaran, id_bulan, bulan, wajib, JSON_UNQUOTE(json) AS json_data '
                . 'FROM uwaba WHERE id_santri = ? ORDER BY tahun_ajaran ASC, id ASC'
            );
            $stmt->execute([$idSantri]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            error_log('Get all uwaba rows error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat memproses permintaan',
                'data' => [],
            ], 500);
        }
    }

    /**
     * GET /api/uwaba/test-santri-count - Test untuk menghitung santri
     */
    public function testSantriCount(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahun_ajaran = $queryParams['tahun_ajaran'] ?? date('Y');
            
            // Count total santri
            $stmt1 = $this->db->prepare("SELECT COUNT(*) as total_santri FROM santri WHERE status_santri IS NOT NULL AND status_santri != ''");
            $stmt1->execute();
            $totalSantri = $stmt1->fetch(\PDO::FETCH_ASSOC)['total_santri'];
            
            // Count santri with uwaba data
            $stmt2 = $this->db->prepare("SELECT COUNT(DISTINCT s.id) as santri_with_uwaba FROM santri s INNER JOIN uwaba sy ON s.id = sy.id_santri WHERE sy.tahun_ajaran = ? AND sy.is_disabled = 0");
            $stmt2->execute([$tahun_ajaran]);
            $santriWithUwaba = $stmt2->fetch(\PDO::FETCH_ASSOC)['santri_with_uwaba'];
            
            // Count santri without uwaba data
            $stmt3 = $this->db->prepare("SELECT COUNT(*) as santri_without_uwaba FROM santri s LEFT JOIN uwaba sy ON s.id = sy.id_santri AND sy.tahun_ajaran = ? AND sy.is_disabled = 0 WHERE sy.id IS NULL AND s.status_santri IS NOT NULL AND s.status_santri != ''");
            $stmt3->execute([$tahun_ajaran]);
            $santriWithoutUwaba = $stmt3->fetch(\PDO::FETCH_ASSOC)['santri_without_uwaba'];
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'total_santri' => $totalSantri,
                    'santri_with_uwaba' => $santriWithUwaba,
                    'santri_without_uwaba' => $santriWithoutUwaba,
                    'tahun_ajaran' => $tahun_ajaran
                ],
                'message' => 'Test data berhasil diambil'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Test santri count error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil test data',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/uwaba/status-santri-options - Ambil opsi status santri
     */
    public function getStatusSantriOptions(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->prepare("
                SELECT DISTINCT status_santri 
                FROM santri 
                WHERE status_santri IS NOT NULL 
                AND status_santri != '' 
                ORDER BY status_santri
            ");
            $stmt->execute();
            $statusOptions = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $statusOptions,
                'message' => 'Status santri options berhasil diambil'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get status santri options error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil status santri options',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/uwaba/all-data - Ambil semua data untuk monitoring
     */
    public function getAllData(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahun_ajaran = $queryParams['tahun_ajaran'] ?? date('Y');
            
            $stmt = $this->db->prepare("
                SELECT 
                    s.id as id_santri,
                    s.nis,
                    s.nama as nama_santri,
                    s.nim_diniyah as nim,
                    s.status_santri,
                    s.kategori,
                    rd.lembaga_id AS diniyah,
                    rf.lembaga_id AS formal,
                    s.lttq,
                    s.saudara_di_pesantren as saudara,
                    COALESCE(sy.id_bulan, 0) as id_bulan,
                    COALESCE(sy.bulan, '') as bulan,
                    COALESCE(sy.wajib, 0) as wajib,
                    COALESCE(sy.nominal, 0) as nominal,
                    COALESCE(sy.keterangan, '') as keterangan,
                    ? as tahun_ajaran,
                    COALESCE(sy.is_disabled, 0) as is_disabled,
                    COALESCE(sy.json, '') as json,
                    COALESCE(sh.nominal, 0) as total_bayar,
                    sh.tanggal_dibuat,
                    CASE 
                        WHEN sy.id IS NULL THEN 'Belum Bayar'
                        WHEN sy.nominal >= sy.wajib AND sy.wajib > 0 THEN 'Lunas'
                        WHEN sy.nominal > 0 AND sy.nominal < sy.wajib THEN 'Belum Lunas'
                        ELSE 'Belum Bayar'
                    END as status,
                    CASE 
                        WHEN sy.id IS NULL THEN 0
                        ELSE (sy.wajib - COALESCE(sy.nominal, 0))
                    END as kurang
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN uwaba sy ON s.id = sy.id_santri AND sy.tahun_ajaran = ? AND sy.is_disabled = 0
                LEFT JOIN (
                    SELECT 
                        id_santri,
                        SUM(nominal) as nominal,
                        MAX(masehi) as tanggal_dibuat
                    FROM uwaba___bayar 
                    WHERE tahun_ajaran = ?
                    GROUP BY id_santri
                ) sh ON s.id = sh.id_santri
                WHERE s.status_santri IS NOT NULL 
                AND s.status_santri != ''
                ORDER BY s.nama
            ");
            
            $stmt->execute([$tahun_ajaran, $tahun_ajaran, $tahun_ajaran]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'message' => 'Data berhasil diambil',
                'count' => count($data)
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get all data error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
                'data' => []
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/get - Ambil data uwaba via POST
     */
    public function getUwabaPost(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id']) || !isset($input['tahun_ajaran'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran diperlukan.',
                    'data' => []
                ], 400);
            }
            
            $idParam = $input['id'] ?? null;
            $tahun_ajaran = $input['tahun_ajaran'] ?? null;
            
            $idSantri = SantriHelper::resolveId($this->db, $idParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan',
                    'data' => []
                ], 404);
            }
            
            // Cek apakah tabel uwaba ada
            $stmtCheckTable = $this->db->prepare("SHOW TABLES LIKE 'uwaba'");
            $stmtCheckTable->execute();
            $tableExists = $stmtCheckTable->rowCount() > 0;
            
            if (!$tableExists) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel uwaba tidak ditemukan',
                    'data' => []
                ], 404);
            }
            
            // Ambil data uwaba untuk id_santri dan tahun_ajaran
            $stmt = $this->db->prepare('SELECT *, JSON_UNQUOTE(json) as json_data FROM uwaba WHERE id_santri = ? AND tahun_ajaran = ? ORDER BY id_bulan ASC');
            $stmt->execute([$idSantri, $tahun_ajaran]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            $nis = SantriHelper::getNisById($this->db, $idSantri);
            return $this->jsonResponse($response, [
                'success' => true,
                'id_santri' => $idSantri,
                'nis' => $nis,
                'data' => $data
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get uwaba POST error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat memproses permintaan',
                'data' => []
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/save-data - Simpan data pembayaran dan rincian uwaba
     */
    public function saveUwabaData(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            if (!empty($input['payment_data']) && is_array($input['payment_data'])) {
                $input['payment_data'] = TextSanitizer::sanitizeStringValues($input['payment_data'], []);
            }
            if (!empty($input['uwaba_data']) && is_array($input['uwaba_data'])) {
                $input['uwaba_data'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $input['uwaba_data']);
            }
            
            // Validasi data yang diperlukan
            if (!isset($input['payment_data']) || !isset($input['uwaba_data'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data pembayaran dan rincian uwaba diperlukan.'
                ], 400);
            }
            
            $paymentData = $input['payment_data'];
            $uwabaData = $input['uwaba_data'];
            
            // Validasi data pembayaran
            $requiredPayment = ['id_santri', 'tahun_ajaran', 'nominal', 'via', 'admin', 'id_admin', 'hijriyah'];
            foreach ($requiredPayment as $field) {
                if (!isset($paymentData[$field])) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Field pembayaran '$field' diperlukan."
                    ], 400);
                }
            }
            
            // Validasi data uwaba (harus ada 10 bulan)
            if (!is_array($uwabaData) || count($uwabaData) !== 10) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data uwaba harus berisi 10 bulan.'
                ], 400);
            }
            
            $uArr = PengurusAdminIdHelper::userArrayFromRequest($request);
            $id_admin = PengurusAdminIdHelper::resolveEffectivePengurusId($uArr, $paymentData['id_admin'] ?? 0);
            if ($id_admin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }
            $admin = PengurusAdminIdHelper::fetchPengurusNama($this->db, $id_admin) ?? trim((string) ($paymentData['admin'] ?? ''));
            if ($admin === '') {
                $admin = 'Admin';
            }

            $this->db->beginTransaction();
            
            // 1. Simpan data pembayaran ke uwaba___bayar (id_santri dari input bisa id atau nis)
            $id_santri = SantriHelper::resolveId($this->db, $paymentData['id_santri'] ?? null);
            if ($id_santri === null) {
                $this->db->rollBack();
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan.'], 404);
            }
            $tahun_ajaran = $paymentData['tahun_ajaran'];
            $nominal = floatval($paymentData['nominal']);
            $via = $paymentData['via'];
            $hijriyah = $paymentData['hijriyah'];
            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            
            // Hitung nomor pembayaran
            $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
            $stmtCount->execute([$id_santri, $tahun_ajaran]);
            $count = $stmtCount->fetchColumn();
            $nomor = $count + 1;
            
            // Insert pembayaran (id akan AUTO_INCREMENT)
            $stmtPayment = $this->db->prepare('INSERT INTO uwaba___bayar (id_santri, tahun_ajaran, nominal, via, admin, id_admin, hijriyah, masehi, nomor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmtPayment->execute([$id_santri, $tahun_ajaran, $nominal, $via, $admin, $id_admin, $hijriyah, $waktu, $nomor]);
            
            // Ambil id yang baru dibuat
            $paymentId = $this->db->lastInsertId();

            $stmtNew = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtNew->execute([$paymentId]);
            $newBayar = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newBayar) {
                UserAktivitasLogger::log(null, $id_admin, UserAktivitasLogger::ACTION_CREATE, 'uwaba___bayar', $paymentId, null, $newBayar, $request);
            }

            // Insert ke tabel payment (induk)
            $this->insertToPayment('Uwaba', $paymentId, 'uwaba___bayar', [
                'id_santri' => $id_santri,
                'nominal' => $nominal,
                'via' => $via,
                'metode_pembayaran' => $via,
                'hijriyah' => $hijriyah,
                'masehi' => date('Y-m-d', strtotime($waktu)),
                'id_admin' => $id_admin,
                'admin' => $admin,
                'status' => 'Success'
            ]);
            
            // 2. Simpan data rincian uwaba ke tabel uwaba
            $bulanHijriyah = [
                'Dzul Qo\'dah', 'Dzul Hijjah', 'Muharram', 'Shafar', 
                'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Ula', 'Jumadil Akhir', 
                'Rajab', 'Sya\'ban'
            ];
            
            foreach ($uwabaData as $index => $bulanData) {
                $id_bulan = $index + 1; // 1-10
                $bulanName = $bulanHijriyah[$index];
                
                // Cek apakah data sudah ada
                $stmtCheck = $this->db->prepare('SELECT id FROM uwaba WHERE id_santri = ? AND tahun_ajaran = ? AND id_bulan = ?');
                $stmtCheck->execute([$id_santri, $tahun_ajaran, $id_bulan]);
                $existingId = $stmtCheck->fetchColumn();
                
                // Siapkan data untuk disimpan
                $wajib = isset($bulanData['wajib']) ? intval(str_replace(['Rp ', '.'], '', $bulanData['wajib'])) : 0;
                $nominal = isset($bulanData['nominal']) ? intval(str_replace(['Rp ', '.'], '', $bulanData['nominal'])) : 0;
                $keterangan = isset($bulanData['keterangan']) ? $bulanData['keterangan'] : 'Belum';
                $sama = isset($bulanData['sama_sebelumnya']) && $bulanData['sama_sebelumnya'] ? 1 : 0;
                
                // Data JSON untuk menyimpan select dan harga
                $jsonData = [
                    'status_santri' => $bulanData['status_santri'] ?? '',
                    'kategori' => $bulanData['kategori'] ?? '',
                    'diniyah' => $bulanData['diniyah'] ?? '',
                    'formal' => $bulanData['formal'] ?? '',
                    'lttq' => $bulanData['lttq'] ?? '',
                    'saudara_di_pesantren' => $bulanData['saudara_di_pesantren'] ?? '',
                    'harga_dasar' => $bulanData['harga_dasar'] ?? 0,
                    'harga_diniyah' => $bulanData['harga_diniyah'] ?? 0,
                    'harga_formal' => $bulanData['harga_formal'] ?? 0,
                    'harga_lttq' => $bulanData['harga_lttq'] ?? 0,
                    'diskon_saudara' => $bulanData['diskon_saudara'] ?? 0,
                    'diskon_saudara_type' => $bulanData['diskon_saudara_type'] ?? '',
                    'total_wajib' => $bulanData['total_wajib'] ?? 0,
                    'timestamp' => $bulanData['timestamp'] ?? time()
                ];
                
                if ($existingId) {
                    // Update data yang sudah ada
                    $stmtUpdate = $this->db->prepare('UPDATE uwaba SET wajib = ?, nominal = ?, keterangan = ?, sama = ?, json = ? WHERE id_santri = ? AND tahun_ajaran = ? AND id_bulan = ?');
                    $stmtUpdate->execute([$wajib, $nominal, $keterangan, $sama, json_encode($jsonData), $id_santri, $tahun_ajaran, $id_bulan]);
                } else {
                    // Insert data baru (id auto increment)
                    $stmtInsert = $this->db->prepare('INSERT INTO uwaba (id_santri, wajib, nominal, id_bulan, bulan, tahun_ajaran, keterangan, sama, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $stmtInsert->execute([$id_santri, $wajib, $nominal, $id_bulan, $bulanName, $tahun_ajaran, $keterangan, $sama, json_encode($jsonData)]);
                }
            }
            
            $this->db->commit();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data pembayaran dan rincian uwaba berhasil disimpan.',
                'payment_id' => $paymentId
            ], 200);
            
        } catch (\Exception $e) {
            $this->db->rollBack();
            error_log("Save uwaba data error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan data'
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/delete-payment - Hapus pembayaran
     */
    public function deletePayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_bayar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Pembayaran diperlukan.'
                ], 400);
            }
            
            $id_bayar = $input['id_bayar'];
            
            // Validasi bahwa id_bayar adalah integer (karena sekarang AUTO_INCREMENT INT)
            $id_bayar = filter_var($id_bayar, FILTER_VALIDATE_INT);
            if ($id_bayar === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Pembayaran harus berupa angka'
                ], 400);
            }
            
            $admin = $input['admin'] ?? '';

            $stmtOld = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtOld->execute([$id_bayar]);
            $oldBayar = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldBayar) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data pembayaran tidak ditemukan atau sudah dihapus.',
                ], 404);
            }

            $uArr = PengurusAdminIdHelper::userArrayFromRequest($request);
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

            // Update kolom admin sebelum hapus
            try {
                $stmtUpdate = $this->db->prepare('UPDATE uwaba___bayar SET admin = ? WHERE id = ?');
                $stmtUpdate->execute([$admin, $id_bayar]);
            } catch (\Exception $e) {
                error_log("Delete payment update admin error: " . $e->getMessage());
            }
            
            // Hapus pembayaran (id sekarang adalah INT AUTO_INCREMENT)
            $stmt = $this->db->prepare('DELETE FROM uwaba___bayar WHERE id = ?');
            $stmt->execute([$id_bayar]);
            $deleted = $stmt->rowCount();
            if ($deleted > 0) {
                UserAktivitasLogger::log(null, $idAdmin > 0 ? $idAdmin : null, UserAktivitasLogger::ACTION_DELETE, 'uwaba___bayar', $id_bayar, $oldBayar, null, $request);
            }
            
            if ($deleted > 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil dihapus.'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data pembayaran tidak ditemukan atau sudah dihapus.'
                ], 404);
            }
            
        } catch (\Exception $e) {
            error_log("Delete payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/create-payment - Buat pembayaran baru
     */
    public function createPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            
            $required = ['id_santri', 'tahun_ajaran', 'nominal', 'via', 'admin', 'id_admin', 'hijriyah'];
            foreach ($required as $f) {
                if (!isset($input[$f])) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Data input tidak valid.'
                    ], 400);
                }
            }
            
            $id_santri = SantriHelper::resolveId($this->db, $input['id_santri'] ?? null);
            if ($id_santri === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan.'], 404);
            }
            $id_admin = PengurusAdminIdHelper::resolveFromRequest($request, $input['id_admin'] ?? 0);
            if ($id_admin === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: tidak dapat menentukan admin pengurus.',
                ], 403);
            }
            $admin = PengurusAdminIdHelper::fetchPengurusNama($this->db, $id_admin) ?? trim((string) ($input['admin'] ?? ''));
            if ($admin === '') {
                $admin = 'Admin';
            }
            $tahun_ajaran = $input['tahun_ajaran'];
            $nominal = floatval($input['nominal']);
            $via = $input['via'];
            $hijriyah = $input['hijriyah'];
            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            
            // Hitung nomor pembayaran
            $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
            $stmtCount->execute([$id_santri, $tahun_ajaran]);
            $count = $stmtCount->fetchColumn();
            $nomor = $count + 1;
            
            // Insert pembayaran (id akan AUTO_INCREMENT)
            $stmt = $this->db->prepare('INSERT INTO uwaba___bayar (id_santri, tahun_ajaran, nominal, via, admin, id_admin, hijriyah, masehi, nomor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id_santri, $tahun_ajaran, $nominal, $via, $admin, $id_admin, $hijriyah, $waktu, $nomor]);
            
            // Ambil id yang baru dibuat
            $paymentId = $this->db->lastInsertId();

            $stmtNew = $this->db->prepare("SELECT * FROM uwaba___bayar WHERE id = ?");
            $stmtNew->execute([$paymentId]);
            $newBayar = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newBayar) {
                UserAktivitasLogger::log(null, $id_admin, UserAktivitasLogger::ACTION_CREATE, 'uwaba___bayar', $paymentId, null, $newBayar, $request);
            }

            // Insert ke tabel payment (induk)
            $this->insertToPayment('Uwaba', $paymentId, 'uwaba___bayar', [
                'id_santri' => $id_santri,
                'nominal' => $nominal,
                'via' => $via,
                'metode_pembayaran' => $via,
                'hijriyah' => $hijriyah,
                'masehi' => date('Y-m-d', strtotime($waktu)),
                'id_admin' => $id_admin,
                'admin' => $admin,
                'status' => 'Success'
            ]);
            
            $nis = SantriHelper::getNisById($this->db, $id_santri);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pembayaran berhasil disimpan.',
                'payment_id' => $paymentId,
                'id_santri' => $id_santri,
                'nis' => $nis
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Create payment error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pembayaran'
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/save-refresh - Simpan data bulan setelah refresh
     */
    public function saveUwabaRefresh(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            if (!empty($input['bulan_data']) && is_array($input['bulan_data'])) {
                $input['bulan_data'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $input['bulan_data']);
            }
            
            // Log input untuk debugging
            error_log("Save uwaba refresh input: " . json_encode($input));
            
            // Validasi data yang diperlukan
            if (!isset($input['id_santri']) || !isset($input['tahun_ajaran']) || !isset($input['bulan_data'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri, tahun ajaran, dan data bulan diperlukan.'
                ], 400);
            }
            
            $id_santri = SantriHelper::resolveId($this->db, $input['id_santri'] ?? null);
            if ($id_santri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan.'
                ], 404);
            }
            $tahun_ajaran = $input['tahun_ajaran'];
            $bulanData = $input['bulan_data'];
            
            // Validasi tahun ajaran tidak kosong
            if (empty($tahun_ajaran)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak boleh kosong.'
                ], 400);
            }
            
            // Validasi bahwa bulan_data adalah array
            if (!is_array($bulanData)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data bulan harus berupa array.'
                ], 400);
            }
            
            $this->db->beginTransaction();
            
            $bulanHijriyah = [
                'Dzul Qo\'dah', 'Dzul Hijjah', 'Muharram', 'Shafar', 
                'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Ula', 'Jumadil Akhir', 
                'Rajab', 'Sya\'ban'
            ];
            
            $bulanDisimpan = 0;
            
            foreach ($bulanData as $index => $bulan) {
                // Mapping urutan Hijri yang benar: 11, 12, 1, 2, 3, 4, 5, 6, 7, 8
                if ($index === 0) {
                    $id_bulan = 11; // Dzul Qo'dah - Bulan 1
                } else if ($index === 1) {
                    $id_bulan = 12; // Dzul Hijjah - Bulan 2
                } else {
                    $id_bulan = $index - 1; // 1, 2, 3, 4, 5, 6, 7, 8 (Muharram dst)
                }
                $bulanName = $bulanHijriyah[$index];
                
                // Siapkan data untuk disimpan
                // Parse wajib dengan lebih hati-hati
                $wajib = 0;
                if (isset($bulan['wajib']) && $bulan['wajib'] !== '' && $bulan['wajib'] !== '-') {
                    if (is_numeric($bulan['wajib'])) {
                        $wajib = intval($bulan['wajib']);
                    } else {
                        $wajibText = str_replace(['Rp ', '.', ' ', ','], '', $bulan['wajib']);
                        $wajib = intval($wajibText);
                    }
                    if ($wajib < 0) {
                        $wajib = 0;
                    }
                }
                
                $sama = isset($bulan['sama_sebelumnya']) && $bulan['sama_sebelumnya'] ? 1 : 0;
                
                // Parse nominal dengan lebih hati-hati
                $nominal = 0;
                if (isset($bulan['nominal']) && $bulan['nominal'] !== '' && $bulan['nominal'] !== '-') {
                    if (is_numeric($bulan['nominal'])) {
                        $nominal = intval($bulan['nominal']);
                    } else {
                        $nominalText = str_replace(['Rp ', '.', ' ', ','], '', $bulan['nominal']);
                        $nominal = intval($nominalText);
                    }
                    if ($nominal < 0) {
                        $nominal = 0;
                    }
                }
                
                // Validasi data sebelum diproses
                if (!is_numeric($wajib) || $wajib < 0) {
                    $wajib = 0;
                }
                
                if (!is_numeric($nominal) || $nominal < 0) {
                    $nominal = 0;
                }
                
                // Validasi is_disabled
                $isDisabled = 0;
                if (isset($bulan['is_disabled'])) {
                    if (is_numeric($bulan['is_disabled'])) {
                        $isDisabled = intval($bulan['is_disabled']);
                        if ($isDisabled !== 0 && $isDisabled !== 1) {
                            $isDisabled = 0;
                        }
                    } else {
                        $isDisabled = ($bulan['is_disabled'] === true || $bulan['is_disabled'] === '1' || $bulan['is_disabled'] === 1) ? 1 : 0;
                    }
                }
                
                $keterangan = isset($bulan['keterangan']) && $bulan['keterangan'] !== '' ? $bulan['keterangan'] : 'Belum';
                
                // Data JSON untuk menyimpan select dan harga
                $jsonData = [];
                
                if (isset($bulan['json']) && is_array($bulan['json'])) {
                    $jsonData = $bulan['json'];
                    // Hapus is_disabled dan sama_sebelumnya dari JSON karena sudah disimpan di kolom terpisah
                    unset($jsonData['is_disabled']);
                    unset($jsonData['sama_sebelumnya']);
                    $jsonData['timestamp'] = time();
                } else {
                    // Fallback: buat JSON minimal jika tidak ada bulan.json
                    $jsonData = [
                        'timestamp' => time()
                    ];
                }
                
                // Validasi JSON encoding
                $jsonEncoded = json_encode($jsonData, JSON_UNESCAPED_UNICODE);
                if ($jsonEncoded === false) {
                    error_log("JSON encode error untuk bulan index $index: " . json_last_error_msg());
                    $jsonData = ['timestamp' => time()];
                    $jsonEncoded = json_encode($jsonData, JSON_UNESCAPED_UNICODE);
                }
                
                // Cek apakah data sudah ada
                $stmtCheck = $this->db->prepare('SELECT id FROM uwaba WHERE id_santri = ? AND tahun_ajaran = ? AND id_bulan = ?');
                $stmtCheck->execute([$id_santri, $tahun_ajaran, $id_bulan]);
                $existingId = $stmtCheck->fetchColumn();
                
                try {
                    if ($existingId) {
                        // Update data yang sudah ada
                        $stmtUpdate = $this->db->prepare('UPDATE uwaba SET wajib = ?, nominal = ?, keterangan = ?, is_disabled = ?, sama = ?, json = ? WHERE id_santri = ? AND tahun_ajaran = ? AND id_bulan = ?');
                        $stmtUpdate->execute([$wajib, $nominal, $keterangan, $isDisabled, $sama, $jsonEncoded, $id_santri, $tahun_ajaran, $id_bulan]);
                    } else {
                        // Insert data baru (id auto increment)
                        $stmtInsert = $this->db->prepare('INSERT INTO uwaba (id_santri, wajib, nominal, id_bulan, bulan, tahun_ajaran, keterangan, is_disabled, sama, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $stmtInsert->execute([$id_santri, $wajib, $nominal, $id_bulan, $bulanName, $tahun_ajaran, $keterangan, $isDisabled, $sama, $jsonEncoded]);
                    }
                    
                    $bulanDisimpan++;
                } catch (\PDOException $e) {
                    error_log("PDO Error untuk bulan index $index (id_bulan: $id_bulan): " . $e->getMessage());
                    error_log("Data: id_santri=$id_santri, tahun_ajaran=$tahun_ajaran, wajib=$wajib, nominal=$nominal, bulan=$bulanName");
                    throw $e; // Re-throw untuk di-handle di catch block utama
                }
            }
            
            $this->db->commit();
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => "Data bulan-bulan berhasil disimpan setelah refresh. Total $bulanDisimpan bulan yang tersimpan."
            ], 200);
            
        } catch (\Exception $e) {
            $this->db->rollBack();
            $errorMessage = $e->getMessage();
            $errorTrace = $e->getTraceAsString();
            error_log("Save uwaba refresh error: " . $errorMessage);
            error_log("Stack trace: " . $errorTrace);
            
            // Jika ada error PDO, tambahkan info lebih detail
            if ($e instanceof \PDOException) {
                $errorInfo = $e->errorInfo ?? [];
                error_log("PDO Error Info: " . json_encode($errorInfo));
                if (isset($errorInfo[2])) {
                    $errorMessage = $errorInfo[2];
                }
            }
            
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan data refresh: ' . $errorMessage
            ], 500);
        }
    }

    /**
     * POST /api/uwaba/lengkapi-data - Lengkapi data uwaba untuk santri yang kurang dari 10 bulan
     */
    public function lengkapiData(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            if (!empty($input['form_data']) && is_array($input['form_data'])) {
                $input['form_data'] = TextSanitizer::sanitizeStringValues($input['form_data'], []);
            }
            
            if (!isset($input['id_santri']) || !isset($input['tahun_ajaran'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri dan tahun ajaran diperlukan.'
                ], 400);
            }
            
            $id_santri = SantriHelper::resolveId($this->db, $input['id_santri']);
            if ($id_santri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan.'
                ], 404);
            }
            $tahun_ajaran = $input['tahun_ajaran'];
            
            // Ambil data uwaba yang sudah ada
            $stmtExisting = $this->db->prepare('SELECT id_bulan FROM uwaba WHERE id_santri = ? AND tahun_ajaran = ?');
            $stmtExisting->execute([$id_santri, $tahun_ajaran]);
            $existingBulan = $stmtExisting->fetchAll(\PDO::FETCH_COLUMN);
            
            // Urutan bulan Hijriyah: 11, 12, 1, 2, 3, 4, 5, 6, 7, 8
            $bulanHijriyah = [
                ['id' => 11, 'nama' => 'Dzul Qo\'dah'],
                ['id' => 12, 'nama' => 'Dzul Hijjah'],
                ['id' => 1, 'nama' => 'Muharram'],
                ['id' => 2, 'nama' => 'Shafar'],
                ['id' => 3, 'nama' => 'Rabiul Awal'],
                ['id' => 4, 'nama' => 'Rabiul Akhir'],
                ['id' => 5, 'nama' => 'Jumadil Ula'],
                ['id' => 6, 'nama' => 'Jumadil Akhir'],
                ['id' => 7, 'nama' => 'Rajab'],
                ['id' => 8, 'nama' => 'Sya\'ban']
            ];
            
            // Tentukan bulan yang belum ada (maksimal sampai 10 bulan total)
            $bulanToCreate = [];
            foreach ($bulanHijriyah as $bulan) {
                if (!in_array($bulan['id'], $existingBulan) && count($existingBulan) + count($bulanToCreate) < 10) {
                    $bulanToCreate[] = $bulan;
                }
            }
            
            if (count($bulanToCreate) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data sudah lengkap (10 bulan) atau tidak ada bulan yang perlu ditambahkan.'
                ], 400);
            }
            
            // Ambil data form dari input
            $formData = $input['form_data'] ?? [];
            $wajib = isset($formData['wajib']) ? intval($formData['wajib']) : 0;
            $keterangan = isset($formData['keterangan']) ? $formData['keterangan'] : '';
            $isDisabled = isset($formData['is_disabled']) ? intval($formData['is_disabled']) : 0;
            $sama = isset($formData['sama']) ? intval($formData['sama']) : 1;
            
            // Siapkan JSON data
            $jsonData = [
                'status_santri' => $formData['status_santri'] ?? '',
                'kategori' => $formData['kategori'] ?? '',
                'diniyah' => $formData['diniyah'] ?? '',
                'formal' => $formData['formal'] ?? '',
                'lttq' => $formData['lttq'] ?? '',
                'saudara_di_pesantren' => $formData['saudara_di_pesantren'] ?? 'Tidak Ada',
                'timestamp' => time()
            ];
            $jsonEncoded = json_encode($jsonData, JSON_UNESCAPED_UNICODE);
            
            $this->db->beginTransaction();
            
            $bulanCreated = 0;
            foreach ($bulanToCreate as $bulan) {
                $stmtInsert = $this->db->prepare('INSERT INTO uwaba (id_santri, wajib, nominal, id_bulan, bulan, tahun_ajaran, keterangan, is_disabled, sama, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmtInsert->execute([
                    $id_santri,
                    $wajib,
                    0, // nominal default 0
                    $bulan['id'],
                    $bulan['nama'],
                    $tahun_ajaran,
                    $keterangan,
                    $isDisabled,
                    $sama,
                    $jsonEncoded
                ]);
                $bulanCreated++;
            }
            
            $this->db->commit();
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => "Berhasil menambahkan $bulanCreated bulan data uwaba.",
                'data' => [
                    'bulan_created' => $bulanCreated,
                    'total_bulan' => count($existingBulan) + $bulanCreated
                ]
            ], 200);
            
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Lengkapi data uwaba error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal melengkapi data'
            ], 500);
        }
    }
}

