<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UmrohPayloadHelper;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UmrohJamaahController
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
     * GET /api/umroh/jamaah - Dapatkan daftar jamaah
     */
    public function getAllJamaah(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $status = $queryParams['status'] ?? null;
            $statusKeberangkatan = $queryParams['status_keberangkatan'] ?? null;
            $statusPembayaran = $queryParams['status_pembayaran'] ?? null;
            $paketUmroh = $queryParams['paket_umroh'] ?? null;
            $search = $queryParams['search'] ?? null;
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 20;
            $offset = ($page - 1) * $limit;

            $whereClause = '';
            $params = [];
            $conditions = [];

            if ($status) {
                $conditions[] = "j.status = ?";
                $params[] = $status;
            }

            if ($statusKeberangkatan) {
                $conditions[] = "j.status_keberangkatan = ?";
                $params[] = $statusKeberangkatan;
            }

            if ($statusPembayaran) {
                $conditions[] = "j.status_pembayaran = ?";
                $params[] = $statusPembayaran;
            }

            if ($paketUmroh) {
                $conditions[] = "j.paket_umroh = ?";
                $params[] = $paketUmroh;
            }

            if ($search) {
                $conditions[] = "(j.nama_lengkap LIKE ? OR j.kode_jamaah LIKE ? OR j.nik LIKE ? OR j.no_paspor LIKE ?)";
                $searchParam = "%{$search}%";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
            }

            if (!empty($conditions)) {
                $whereClause = "WHERE " . implode(" AND ", $conditions);
            }

            // Get total count
            $countSql = "SELECT COUNT(*) as total FROM umroh___jamaah j $whereClause";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get data
            $sql = "SELECT j.*, 
                    p.nama as admin_nama
                    FROM umroh___jamaah j
                    LEFT JOIN pengurus p ON j.id_admin = p.id
                    $whereClause
                    ORDER BY j.tanggal_dibuat DESC
                    LIMIT ? OFFSET ?";
            
            $data = UmrohPayloadHelper::fetchLimited($this->db, $sql, $params, $limit, $offset);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => (int)$total,
                    'total_pages' => ceil($total / $limit)
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get all jamaah error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching jamaah data',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/umroh/jamaah/{id} - Dapatkan detail jamaah by ID
     */
    public function getJamaahById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID jamaah wajib diisi'
                ], 400);
            }

            $sql = "SELECT j.*, 
                    p.nama as admin_nama
                    FROM umroh___jamaah j
                    LEFT JOIN pengurus p ON j.id_admin = p.id
                    WHERE j.id = ? OR j.kode_jamaah = ?
                    LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id, $id]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($data) {
                // Get tabungan summary
                $tabunganSql = "SELECT 
                    SUM(CASE WHEN jenis = 'Setoran' THEN nominal ELSE 0 END) as total_setoran,
                    SUM(CASE WHEN jenis = 'Penarikan' THEN nominal ELSE 0 END) as total_penarikan,
                    COUNT(*) as total_transaksi
                    FROM umroh___tabungan
                    WHERE id_jamaah = ?";
                $tabunganStmt = $this->db->prepare($tabunganSql);
                $tabunganStmt->execute([$data['id']]);
                $tabunganData = $tabunganStmt->fetch(\PDO::FETCH_ASSOC);
                
                $data['tabungan_summary'] = $tabunganData;

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $data
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jamaah tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Get jamaah by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching jamaah data'
            ], 500);
        }
    }

    /**
     * POST /api/umroh/jamaah - Buat jamaah baru
     */
    public function createJamaah(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $data = $this->normalizeJamaahRow($data);
            $user = $request->getAttribute('user');
            $idAdmin = UmrohPayloadHelper::pengurusId(is_array($user) ? $user : null);

            if (empty($data['nama_lengkap'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama lengkap wajib diisi'
                ], 400);
            }

            // Generate kode jamaah jika tidak ada
            if (empty($data['kode_jamaah'])) {
                $data['kode_jamaah'] = $this->generateKodeJamaah();
            }

            // Check if kode_jamaah already exists
            $checkSql = "SELECT id FROM umroh___jamaah WHERE kode_jamaah = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$data['kode_jamaah']]);
            if ($checkStmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kode jamaah sudah digunakan'
                ], 400);
            }

            $fields = [
                'kode_jamaah', 'nama_lengkap', 'gelar_awal', 'gelar_akhir', 'nik', 'no_kk',
                'tempat_lahir', 'tanggal_lahir', 'usia', 'gender', 'status_nikah',
                'agama', 'kewarganegaraan', 'alamat', 'dusun', 'rt', 'rw', 'desa',
                'kecamatan', 'kabupaten', 'provinsi', 'kode_pos', 'email', 'no_telpon',
                'whatsapp', 'no_paspor', 'tanggal_terbit_paspor', 'tanggal_berlaku_paspor',
                'tempat_terbit_paspor', 'no_visa', 'tanggal_terbit_visa', 'tanggal_berlaku_visa',
                'paket_umroh', 'tanggal_keberangkatan', 'tanggal_kepulangan', 'maskapai',
                'hotel_mekah', 'hotel_madinah', 'kamar_mekah', 'kamar_madinah',
                'nama_ayah', 'nama_ibu', 'nama_pasangan', 'hubungan_pasangan', 'jumlah_anak',
                'pekerjaan', 'pendidikan_terakhir', 'penghasilan', 'golongan_darah',
                'riwayat_penyakit', 'alergi', 'obat_rutin', 'kontak_darurat', 'telpon_darurat',
                'hubungan_darurat', 'target_tabungan', 'status', 'status_keberangkatan',
                'status_pembayaran', 'keterangan', 'id_admin'
            ];

            $insertFields = [];
            $insertValues = [];
            $params = [];

            foreach ($fields as $field) {
                if ($field === 'id_admin') {
                    continue;
                }
                if (!array_key_exists($field, $data)) {
                    continue;
                }
                if ($data[$field] === null && !in_array($field, ['nik', 'tanggal_lahir', 'gender', 'status_nikah', 'golongan_darah'], true)) {
                    continue;
                }
                $insertFields[] = $field;
                $insertValues[] = '?';
                $params[] = $data[$field];
            }

            // Set default values
            if (empty($data['status'])) {
                $insertFields[] = 'status';
                $insertValues[] = '?';
                $params[] = 'Aktif';
            }

            if (empty($data['status_keberangkatan'])) {
                $insertFields[] = 'status_keberangkatan';
                $insertValues[] = '?';
                $params[] = 'Belum Berangkat';
            }

            if (empty($data['status_pembayaran'])) {
                $insertFields[] = 'status_pembayaran';
                $insertValues[] = '?';
                $params[] = 'Belum Lunas';
            }

            if ($idAdmin) {
                $insertFields[] = 'id_admin';
                $insertValues[] = '?';
                $params[] = $idAdmin;
            }

            if (empty($insertFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang dikirim'
                ], 400);
            }

            $sql = "INSERT INTO umroh___jamaah (" . implode(', ', $insertFields) . ") 
                    VALUES (" . implode(', ', $insertValues) . ")";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            
            $idJamaah = (int) $this->db->lastInsertId();
            $newRow = $this->db->prepare("SELECT * FROM umroh___jamaah WHERE id = ?");
            $newRow->execute([$idJamaah]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            if ($newRow && $idAdmin !== null) {
                UserAktivitasLogger::log(null, (int) $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'umroh___jamaah', $idJamaah, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jamaah berhasil dibuat',
                'data' => [
                    'id' => $idJamaah
                ]
            ], 201);

        } catch (\PDOException $e) {
            error_log("Error creating jamaah: " . $e->getMessage());
            if ($e->getCode() == 23000) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data duplikat (NIK atau kode jamaah sudah digunakan)'
                ], 400);
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat jamaah'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error creating jamaah: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat jamaah'
            ], 500);
        }
    }

    /**
     * PUT /api/umroh/jamaah/{id} - Update jamaah
     */
    public function updateJamaah(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $data = $this->normalizeJamaahRow($data);

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID jamaah wajib diisi'
                ], 400);
            }

            $checkSql = "SELECT * FROM umroh___jamaah WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldJamaah = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldJamaah) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jamaah tidak ditemukan'
                ], 404);
            }

            $fields = [
                'kode_jamaah', 'nama_lengkap', 'gelar_awal', 'gelar_akhir', 'nik', 'no_kk',
                'tempat_lahir', 'tanggal_lahir', 'usia', 'gender', 'status_nikah',
                'agama', 'kewarganegaraan', 'alamat', 'dusun', 'rt', 'rw', 'desa',
                'kecamatan', 'kabupaten', 'provinsi', 'kode_pos', 'email', 'no_telpon',
                'whatsapp', 'no_paspor', 'tanggal_terbit_paspor', 'tanggal_berlaku_paspor',
                'tempat_terbit_paspor', 'no_visa', 'tanggal_terbit_visa', 'tanggal_berlaku_visa',
                'paket_umroh', 'tanggal_keberangkatan', 'tanggal_kepulangan', 'maskapai',
                'hotel_mekah', 'hotel_madinah', 'kamar_mekah', 'kamar_madinah',
                'nama_ayah', 'nama_ibu', 'nama_pasangan', 'hubungan_pasangan', 'jumlah_anak',
                'pekerjaan', 'pendidikan_terakhir', 'penghasilan', 'golongan_darah',
                'riwayat_penyakit', 'alergi', 'obat_rutin', 'kontak_darurat', 'telpon_darurat',
                'hubungan_darurat', 'target_tabungan', 'total_tabungan', 'status',
                'status_keberangkatan', 'status_pembayaran', 'keterangan'
            ];

            $set = [];
            $params = [];
            foreach ($fields as $field) {
                if (!array_key_exists($field, $data)) {
                    continue;
                }
                $set[] = "$field = ?";
                $params[] = $data[$field];
            }

            if (empty($set)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $params[] = $id;
            $sql = "UPDATE umroh___jamaah SET " . implode(', ', $set) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $stmtNew = $this->db->prepare("SELECT * FROM umroh___jamaah WHERE id = ?");
            $stmtNew->execute([$id]);
            $newJamaah = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = UmrohPayloadHelper::pengurusId(is_array($user) ? $user : null);
            if ($newJamaah && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'umroh___jamaah', $id, $oldJamaah, $newJamaah, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jamaah berhasil diupdate'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error updating jamaah: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate jamaah'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error updating jamaah: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate jamaah'
            ], 500);
        }
    }

    /**
     * DELETE /api/umroh/jamaah/{id} - Hapus jamaah
     */
    public function deleteJamaah(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID jamaah wajib diisi'
                ], 400);
            }

            $checkSql = "SELECT * FROM umroh___jamaah WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldJamaah = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldJamaah) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jamaah tidak ditemukan'
                ], 404);
            }

            $sql = "DELETE FROM umroh___jamaah WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $user = $request->getAttribute('user');
            $pengurusId = UmrohPayloadHelper::pengurusId(is_array($user) ? $user : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'umroh___jamaah', $id, $oldJamaah, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jamaah berhasil dihapus'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error deleting jamaah: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus jamaah'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error deleting jamaah: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus jamaah'
            ], 500);
        }
    }

    /**
     * Generate unique kode jamaah
     */
    private function generateKodeJamaah(): string
    {
        $prefix = 'UMR-';
        $sql = "SELECT kode_jamaah FROM umroh___jamaah WHERE kode_jamaah LIKE ? ORDER BY kode_jamaah DESC LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$prefix . '%']);
        $last = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($last) {
            $lastNumber = (int)str_replace($prefix, '', $last['kode_jamaah']);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return $prefix . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalizeJamaahRow(array $data): array
    {
        return UmrohPayloadHelper::normalizeRow(
            $data,
            [
                'tanggal_lahir', 'tanggal_terbit_paspor', 'tanggal_berlaku_paspor',
                'tanggal_terbit_visa', 'tanggal_berlaku_visa', 'tanggal_keberangkatan',
                'tanggal_kepulangan',
            ],
            ['gender', 'status_nikah', 'golongan_darah', 'status', 'status_keberangkatan', 'status_pembayaran'],
            ['nik', 'kode_jamaah']
        );
    }

    /**
     * GET /api/umroh/dashboard
     */
    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $stats = [
                'total_jamaah' => (int) $this->db->query('SELECT COUNT(*) FROM umroh___jamaah')->fetchColumn(),
                'aktif' => (int) $this->db->query("SELECT COUNT(*) FROM umroh___jamaah WHERE status = 'Aktif'")->fetchColumn(),
                'belum_berangkat' => (int) $this->db->query("SELECT COUNT(*) FROM umroh___jamaah WHERE status_keberangkatan = 'Belum Berangkat'")->fetchColumn(),
                'lunas' => (int) $this->db->query("SELECT COUNT(*) FROM umroh___jamaah WHERE status_pembayaran = 'Lunas'")->fetchColumn(),
                'total_tabungan' => (float) $this->db->query('SELECT COALESCE(SUM(total_tabungan), 0) FROM umroh___jamaah')->fetchColumn(),
                'pengeluaran_approved' => (float) $this->db->query("SELECT COALESCE(SUM(nominal), 0) FROM umroh___pengeluaran WHERE status = 'Approved'")->fetchColumn(),
            ];

            $jamaahBaru = $this->db->query(
                'SELECT id, kode_jamaah, nama_lengkap, paket_umroh, status, status_pembayaran, total_tabungan, target_tabungan, tanggal_dibuat
                 FROM umroh___jamaah ORDER BY tanggal_dibuat DESC LIMIT 8'
            )->fetchAll(\PDO::FETCH_ASSOC);

            $setoranBaru = $this->db->query(
                "SELECT t.id, t.kode_transaksi, t.jenis, t.nominal, t.tanggal_dibuat, j.nama_lengkap, j.kode_jamaah
                 FROM umroh___tabungan t
                 LEFT JOIN umroh___jamaah j ON j.id = t.id_jamaah
                 ORDER BY t.tanggal_dibuat DESC LIMIT 8"
            )->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'stats' => $stats,
                    'jamaah_terbaru' => $jamaahBaru ?: [],
                    'transaksi_terbaru' => $setoranBaru ?: [],
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('Umroh dashboard error: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat dashboard umroh',
            ], 500);
        }
    }

    /**
     * GET /api/umroh/laporan
     */
    public function getLaporan(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $dari = isset($q['tanggal_dari']) ? trim((string) $q['tanggal_dari']) : '';
            $sampai = isset($q['tanggal_sampai']) ? trim((string) $q['tanggal_sampai']) : '';
            $paket = isset($q['paket_umroh']) ? trim((string) $q['paket_umroh']) : '';

            $jamaahWhere = [];
            $jamaahParams = [];
            if ($paket !== '') {
                $jamaahWhere[] = 'paket_umroh = ?';
                $jamaahParams[] = $paket;
            }
            $jw = $jamaahWhere ? ('WHERE ' . implode(' AND ', $jamaahWhere)) : '';
            $stmtJ = $this->db->prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total_tabungan),0) AS saldo FROM umroh___jamaah $jw");
            $stmtJ->execute($jamaahParams);
            $jRow = $stmtJ->fetch(\PDO::FETCH_ASSOC) ?: [];

            $tabWhere = [];
            $tabParams = [];
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dari)) {
                $tabWhere[] = 'DATE(t.tanggal_dibuat) >= ?';
                $tabParams[] = $dari;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $sampai)) {
                $tabWhere[] = 'DATE(t.tanggal_dibuat) <= ?';
                $tabParams[] = $sampai;
            }
            if ($paket !== '') {
                $tabWhere[] = 'j.paket_umroh = ?';
                $tabParams[] = $paket;
            }
            $tw = $tabWhere ? ('WHERE ' . implode(' AND ', $tabWhere)) : '';

            $sumSql = "SELECT
                COALESCE(SUM(CASE WHEN t.jenis = 'Setoran' THEN t.nominal ELSE 0 END), 0) AS setoran,
                COALESCE(SUM(CASE WHEN t.jenis = 'Penarikan' THEN t.nominal ELSE 0 END), 0) AS penarikan
                FROM umroh___tabungan t
                LEFT JOIN umroh___jamaah j ON j.id = t.id_jamaah
                $tw";
            $stmtS = $this->db->prepare($sumSql);
            $stmtS->execute($tabParams);
            $sum = $stmtS->fetch(\PDO::FETCH_ASSOC) ?: [];

            $listSql = "SELECT t.*, j.nama_lengkap, j.kode_jamaah, j.paket_umroh
                FROM umroh___tabungan t
                LEFT JOIN umroh___jamaah j ON j.id = t.id_jamaah
                $tw
                ORDER BY t.tanggal_dibuat DESC
                LIMIT 200";
            $stmtL = $this->db->prepare($listSql);
            $stmtL->execute($tabParams);
            $transaksi = $stmtL->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $pengWhere = [];
            $pengParams = [];
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dari)) {
                $pengWhere[] = 'DATE(tanggal_dibuat) >= ?';
                $pengParams[] = $dari;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $sampai)) {
                $pengWhere[] = 'DATE(tanggal_dibuat) <= ?';
                $pengParams[] = $sampai;
            }
            $pw = $pengWhere ? ('WHERE ' . implode(' AND ', $pengWhere)) : '';
            $stmtP = $this->db->prepare("SELECT COALESCE(SUM(nominal),0) FROM umroh___pengeluaran $pw");
            $stmtP->execute($pengParams);
            $pengeluaranTotal = (float) $stmtP->fetchColumn();

            $stmtPL = $this->db->prepare("SELECT id, kode_pengeluaran, keterangan, kategori, nominal, status, tanggal_dibuat FROM umroh___pengeluaran $pw ORDER BY tanggal_dibuat DESC LIMIT 100");
            $stmtPL->execute($pengParams);
            $pengeluaran = $stmtPL->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $paketStmt = $this->db->query("SELECT DISTINCT paket_umroh FROM umroh___jamaah WHERE paket_umroh IS NOT NULL AND TRIM(paket_umroh) <> '' ORDER BY paket_umroh");
            $paketOptions = $paketStmt ? array_values(array_filter(array_map(static function ($r) {
                return $r['paket_umroh'] ?? null;
            }, $paketStmt->fetchAll(\PDO::FETCH_ASSOC) ?: []))) : [];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'ringkasan' => [
                        'jamaah' => (int) ($jRow['c'] ?? 0),
                        'saldo' => (float) ($jRow['saldo'] ?? 0),
                        'setoran' => (float) ($sum['setoran'] ?? 0),
                        'penarikan' => (float) ($sum['penarikan'] ?? 0),
                        'pengeluaran' => $pengeluaranTotal,
                    ],
                    'transaksi' => $transaksi,
                    'pengeluaran' => $pengeluaran,
                    'paket_options' => $paketOptions,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('Umroh laporan error: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat laporan umroh',
            ], 500);
        }
    }
}

