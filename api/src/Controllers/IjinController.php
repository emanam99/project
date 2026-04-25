<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\KalenderHelper;
use App\Helpers\LiveIjinNotifier;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class IjinController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getIjin(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            $sql = "SELECT * FROM santri___ijin WHERE 1=1";
            $params = [];

            if ($idSantri) {
                $sql .= " AND id_santri = ?";
                $params[] = $idSantri;
            }

            if ($tahunAjaran) {
                $sql .= " AND tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }

            $sql .= " ORDER BY tahun_ajaran DESC, urutan ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function createIjin(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();

            if (!isset($data['id_santri']) || !isset($data['tahun_ajaran'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri dan tahun_ajaran wajib diisi'
                ], 400);
            }

            $dari = $data['dari'] ?? null;
            $sampai = $data['sampai'] ?? null;
            $perpanjang = $data['perpanjang'] ?? null;
            $masehi = $this->computeMasehiTriplet($dari, $sampai, $perpanjang);

            $sql = 'INSERT INTO santri___ijin (id_santri, urutan, tahun_ajaran, alasan, dari, sampai, perpanjang, lama, tanggal_kembali, dari_masehi, sampai_masehi, perpanjang_masehi)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)';

            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $data['id_santri'],
                $data['urutan'] ?? null,
                $data['tahun_ajaran'],
                TextSanitizer::cleanTextOrNull($data['alasan'] ?? null),
                $dari,
                $sampai,
                $perpanjang,
                $data['lama'] ?? null,
                $masehi['dari_masehi'],
                $masehi['sampai_masehi'],
                $masehi['perpanjang_masehi'],
            ]);
            $id = (int) $this->db->lastInsertId();
            $stmtNew = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtNew->execute([$id]);
            $newIjin = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            if ($newIjin && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_CREATE, 'santri___ijin', $id, null, $newIjin, $request);
            }

            LiveIjinNotifier::ping([
                'id_santri' => (int) $data['id_santri'],
                'tahun_ajaran' => (string) $data['tahun_ajaran'],
                'action' => 'create',
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil ditambahkan',
                'data' => ['id' => $id]
            ], 201);

        } catch (\Exception $e) {
            error_log("Create ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateIjin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi'
                ], 400);
            }

            $data = $request->getParsedBody();

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan'
                ], 404);
            }

            $fields = [];
            $params = [];

            // Urutan tidak bisa diupdate (tetap null)
            if (isset($data['tahun_ajaran'])) {
                $fields[] = "tahun_ajaran = ?";
                $params[] = $data['tahun_ajaran'];
            }
            if (isset($data['alasan'])) {
                $fields[] = "alasan = ?";
                $params[] = TextSanitizer::cleanTextOrNull($data['alasan']);
            }
            if (isset($data['dari'])) {
                $fields[] = "dari = ?";
                $params[] = $data['dari'];
            }
            if (isset($data['sampai'])) {
                $fields[] = "sampai = ?";
                $params[] = $data['sampai'];
            }
            if (isset($data['perpanjang'])) {
                $fields[] = "perpanjang = ?";
                $params[] = $data['perpanjang'];
            }
            if (isset($data['lama'])) {
                $fields[] = 'lama = ?';
                $params[] = $data['lama'];
            }
            if (array_key_exists('tanggal_kembali', $data)) {
                $fields[] = 'tanggal_kembali = ?';
                $v = $data['tanggal_kembali'];
                $params[] = ($v === '' || $v === null) ? null : $v;
            }

            $mergedDari = $oldIjin['dari'] ?? null;
            $mergedSampai = $oldIjin['sampai'] ?? null;
            $mergedPerpanjang = $oldIjin['perpanjang'] ?? null;
            if (isset($data['dari'])) {
                $mergedDari = $data['dari'];
            }
            if (isset($data['sampai'])) {
                $mergedSampai = $data['sampai'];
            }
            if (isset($data['perpanjang'])) {
                $mergedPerpanjang = $data['perpanjang'];
            }
            if (isset($data['dari']) || isset($data['sampai']) || isset($data['perpanjang'])) {
                $m = $this->computeMasehiTriplet($mergedDari, $mergedSampai, $mergedPerpanjang);
                $fields[] = 'dari_masehi = ?';
                $params[] = $m['dari_masehi'];
                $fields[] = 'sampai_masehi = ?';
                $params[] = $m['sampai_masehi'];
                $fields[] = 'perpanjang_masehi = ?';
                $params[] = $m['perpanjang_masehi'];
            }

            if (empty($fields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $params[] = $id;
            $sql = "UPDATE santri___ijin SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            $stmtNew = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtNew->execute([$id]);
            $newIjin = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($idPengurus && $newIjin) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___ijin', $id, $oldIjin, $newIjin, $request);
            }
            $pingTa = (string) (($newIjin['tahun_ajaran'] ?? null) !== null && (string) $newIjin['tahun_ajaran'] !== ''
                ? $newIjin['tahun_ajaran']
                : ($oldIjin['tahun_ajaran'] ?? ''));
            LiveIjinNotifier::ping([
                'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                'tahun_ajaran' => $pingTa,
                'action' => 'update',
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteIjin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi'
                ], 400);
            }

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan'
                ], 404);
            }
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;

            $stmt = $this->db->prepare("DELETE FROM santri___ijin WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() > 0 && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_DELETE, 'santri___ijin', $id, $oldIjin, null, $request);
            }
            if ($stmt->rowCount() > 0) {
                LiveIjinNotifier::ping([
                    'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                    'tahun_ajaran' => (string) ($oldIjin['tahun_ajaran'] ?? ''),
                    'action' => 'delete',
                ]);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data ijin berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * @return array{dari_masehi: ?string, sampai_masehi: ?string, perpanjang_masehi: ?string}
     */
    private function computeMasehiTriplet(?string $dari, ?string $sampai, ?string $perpanjang): array
    {
        return [
            'dari_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($dari)),
            'sampai_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($sampai)),
            'perpanjang_masehi' => KalenderHelper::hijriyahToMasehi($this->db, $this->normalizeHijriForConvert($perpanjang)),
        ];
    }

    private function normalizeHijriForConvert($v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $s = trim((string) $v);

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
    }

    public function markKembali(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ijin wajib diisi',
                ], 400);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $set = array_key_exists('set', $body) ? (bool) $body['set'] : true;

            $stmtOld = $this->db->prepare('SELECT * FROM santri___ijin WHERE id = ?');
            $stmtOld->execute([$id]);
            $oldIjin = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldIjin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data ijin tidak ditemukan',
                ], 404);
            }

            $tanggal = $set ? date('Y-m-d') : null;
            $stmt = $this->db->prepare('UPDATE santri___ijin SET tanggal_kembali = ? WHERE id = ?');
            $stmt->execute([$tanggal, $id]);

            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            if ($idPengurus) {
                $stmtNew = $this->db->prepare('SELECT * FROM santri___ijin WHERE id = ?');
                $stmtNew->execute([$id]);
                $newIjin = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($newIjin) {
                    UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___ijin', $id, $oldIjin, $newIjin, $request);
                }
            }

            LiveIjinNotifier::ping([
                'id_santri' => (int) ($oldIjin['id_santri'] ?? 0),
                'tahun_ajaran' => (string) ($oldIjin['tahun_ajaran'] ?? ''),
                'action' => 'markKembali',
            ]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $set ? 'Tanggal kembali dicatat' : 'Status kembali dibatalkan',
                'data' => ['tanggal_kembali' => $tanggal],
            ], 200);
        } catch (\Exception $e) {
            error_log('Mark kembali error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getPublicIjin(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $sql = "SELECT * FROM santri___ijin WHERE id_santri = ? ORDER BY tahun_ajaran DESC, urutan ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null; // Tahun hijriyah

            // Build WHERE clause untuk filter tahun ajaran
            $whereClause = '';
            $params = [];
            if ($tahunAjaran) {
                $whereClause = 'WHERE tahun_ajaran = ?';
                $params[] = $tahunAjaran;
            }

            // Statistik Ijin
            // Total ijin
            $sqlTotalIjin = "SELECT COUNT(DISTINCT id) as total FROM santri___ijin" . ($whereClause ? " $whereClause" : "");
            $stmt = $this->db->prepare($sqlTotalIjin);
            $stmt->execute($params);
            $totalIjin = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Total santri yang punya ijin
            $sqlSantriIjin = "SELECT COUNT(DISTINCT id_santri) as total FROM santri___ijin" . ($whereClause ? " $whereClause" : "");
            $stmt = $this->db->prepare($sqlSantriIjin);
            $stmt->execute($params);
            $totalSantriIjin = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Ijin per bulan (berdasarkan tanggal_dibuat)
            $sqlIjinPerBulan = "SELECT 
                DATE_FORMAT(tanggal_dibuat, '%Y-%m') as bulan,
                COUNT(*) as jumlah
                FROM santri___ijin" . ($whereClause ? " $whereClause" : "") . "
                GROUP BY DATE_FORMAT(tanggal_dibuat, '%Y-%m')
                ORDER BY bulan DESC
                LIMIT 12";
            $stmt = $this->db->prepare($sqlIjinPerBulan);
            $stmt->execute($params);
            $ijinPerBulan = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Statistik Shohifah
            // Total shohifah yang sudah diisi
            $sqlTotalShohifah = "SELECT COUNT(DISTINCT id_santri) as total FROM santri___shohifah" . ($whereClause ? " $whereClause" : "");
            $stmt = $this->db->prepare($sqlTotalShohifah);
            $stmt->execute($params);
            $totalShohifah = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Total santri (untuk menghitung persentase)
            $sqlTotalSantri = "SELECT COUNT(*) as total FROM santri";
            $stmt = $this->db->prepare($sqlTotalSantri);
            $stmt->execute();
            $totalSantri = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Persentase shohifah yang sudah diisi
            $persentaseShohifah = $totalSantri > 0 ? round(($totalShohifah / $totalSantri) * 100, 2) : 0;

            // Shohifah per bulan (berdasarkan tanggal_dibuat)
            $sqlShohifahPerBulan = "SELECT 
                DATE_FORMAT(tanggal_dibuat, '%Y-%m') as bulan,
                COUNT(DISTINCT id_santri) as jumlah
                FROM santri___shohifah" . ($whereClause ? " $whereClause" : "") . "
                GROUP BY DATE_FORMAT(tanggal_dibuat, '%Y-%m')
                ORDER BY bulan DESC
                LIMIT 12";
            $stmt = $this->db->prepare($sqlShohifahPerBulan);
            $stmt->execute($params);
            $shohifahPerBulan = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Ijin terbaru (5 terakhir)
            $sqlIjinTerbaru = "SELECT 
                i.*,
                s.nama as nama_santri
                FROM santri___ijin i
                INNER JOIN santri s ON i.id_santri = s.id" . ($whereClause ? " $whereClause" : "") . "
                ORDER BY i.tanggal_dibuat DESC
                LIMIT 5";
            $stmt = $this->db->prepare($sqlIjinTerbaru);
            $stmt->execute($params);
            $ijinTerbaru = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Shohifah terbaru (5 terakhir)
            $sqlShohifahTerbaru = "SELECT 
                sh.*,
                s.nama as nama_santri
                FROM santri___shohifah sh
                INNER JOIN santri s ON sh.id_santri = s.id" . ($whereClause ? " $whereClause" : "") . "
                ORDER BY sh.tanggal_dibuat DESC
                LIMIT 5";
            $stmt = $this->db->prepare($sqlShohifahTerbaru);
            $stmt->execute($params);
            $shohifahTerbaru = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Statistik Boyong: tahun ajaran ini (sesuai tahun hijriyah di header) dan hari ini
            $boyongTahunIni = 0;
            if ($tahunAjaran) {
                $stmtBoyong = $this->db->prepare("SELECT COUNT(*) as total FROM santri___boyong WHERE tahun_hijriyah = ?");
                $stmtBoyong->execute([$tahunAjaran]);
                $boyongTahunIni = (int)($stmtBoyong->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            }
            $stmtBoyongHariIni = $this->db->prepare("SELECT COUNT(*) as total FROM santri___boyong WHERE DATE(tanggal_dibuat) = CURDATE()");
            $stmtBoyongHariIni->execute();
            $boyongHariIni = (int)($stmtBoyongHariIni->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'ijin' => [
                        'total' => $totalIjin,
                        'total_santri' => $totalSantriIjin,
                        'per_bulan' => $ijinPerBulan,
                        'terbaru' => $ijinTerbaru
                    ],
                    'shohifah' => [
                        'total' => $totalShohifah,
                        'persentase' => $persentaseShohifah,
                        'per_bulan' => $shohifahPerBulan,
                        'terbaru' => $shohifahTerbaru
                    ],
                    'boyong' => [
                        'tahun_ini' => $boyongTahunIni,
                        'hari_ini' => $boyongHariIni
                    ],
                    'total_santri' => $totalSantri
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get dashboard ijin error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/ijin/kamar-options — daftar kamar untuk dropdown id_kamar (admin_ijin / petugas_ijin).
     * Query: id_daerah (opsional), status (opsional). Tanpa filter status: hanya aktif.
     */
    public function getKamarOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerah = isset($params['id_daerah']) ? (int) $params['id_daerah'] : null;
            $status = isset($params['status']) && $params['status'] !== '' ? trim((string) $params['status']) : null;

            $sql = 'SELECT dk.id, dk.id_daerah, dk.kamar, dk.keterangan, dk.status,
                    d.daerah AS daerah_nama, d.kategori AS daerah_kategori
                    FROM daerah___kamar dk
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    WHERE 1=1';
            $bind = [];
            if ($idDaerah !== null && $idDaerah > 0) {
                $sql .= ' AND dk.id_daerah = ?';
                $bind[] = $idDaerah;
            }
            if ($status !== null) {
                $sql .= ' AND dk.status = ?';
                $bind[] = $status;
            } else {
                $sql .= " AND (dk.status IS NULL OR dk.status = 'aktif')";
            }
            $sql .= ' ORDER BY d.kategori, d.daerah, dk.kamar';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log('IjinController::getKamarOptions ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kamar',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/ijin/rombel-options?jenis=diniyah|formal — sama dengan pendaftaran/rombel-options.
     */
    public function getRombelOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $jenis = isset($params['jenis']) ? trim((string) $params['jenis']) : '';
            if ($jenis === '' || !in_array(strtolower($jenis), ['diniyah', 'formal'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter jenis wajib: diniyah atau formal',
                    'data' => []
                ], 400);
            }
            $kategoriLembaga = ucfirst(strtolower($jenis));

            $sql = 'SELECT r.id, r.lembaga_id, l.nama AS lembaga_nama, r.kelas, r.kel
                    FROM lembaga___rombel r
                    INNER JOIN lembaga l ON l.id = r.lembaga_id
                    WHERE l.kategori = ? AND (r.status IS NULL OR r.status = \'aktif\')
                    ORDER BY l.nama, r.kelas, r.kel';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$kategoriLembaga]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log('IjinController::getRombelOptions ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data rombel',
                'data' => []
            ], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}
