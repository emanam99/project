<?php

namespace App\Controllers;

use App\Database;
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

            // Generate ID menggunakan timestamp untuk memastikan unique
            $id = $this->generateId($data['id_santri'], $data['tahun_ajaran']);

            // Cek apakah sudah ada
            $stmtCheck = $this->db->prepare("SELECT id FROM santri___ijin WHERE id = ?");
            $stmtCheck->execute([$id]);
            if ($stmtCheck->fetch()) {
                // Jika ID sudah ada, tambahkan timestamp
                $id = $this->generateId($data['id_santri'], $data['tahun_ajaran'], true);
            }

            $sql = "INSERT INTO santri___ijin (id, id_santri, urutan, tahun_ajaran, alasan, dari, sampai, perpanjang, lama) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $id,
                $data['id_santri'],
                $data['urutan'] ?? null,
                $data['tahun_ajaran'],
                $data['alasan'] ?? null,
                $data['dari'] ?? null,
                $data['sampai'] ?? null,
                $data['perpanjang'] ?? null,
                $data['lama'] ?? null
            ]);
            $stmtNew = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
            $stmtNew->execute([$id]);
            $newIjin = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            if ($newIjin && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_CREATE, 'santri___ijin', $id, null, $newIjin, $request);
            }

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
            $id = $args['id'] ?? null;
            if (!$id) {
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
                $params[] = $data['alasan'];
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
                $fields[] = "lama = ?";
                $params[] = $data['lama'];
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
            if ($idPengurus) {
                $stmtNew = $this->db->prepare("SELECT * FROM santri___ijin WHERE id = ?");
                $stmtNew->execute([$id]);
                $newIjin = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($newIjin) {
                    UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___ijin', $id, $oldIjin, $newIjin, $request);
                }
            }

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
            $id = $args['id'] ?? null;
            if (!$id) {
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

    private function generateId($idSantri, $tahunAjaran, $useTimestamp = false)
    {
        // Format: id_santri-timestamp-tahun_ajaran (tanpa spasi)
        // Menggunakan timestamp untuk memastikan unique karena urutan sekarang nullable
        $tahunClean = str_replace(['-', ' '], '', $tahunAjaran);
        $timestamp = $useTimestamp ? time() : microtime(true) * 10000; // Gunakan microtime untuk lebih unique
        return $idSantri . '-' . (int)$timestamp . '-' . $tahunClean;
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

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}
