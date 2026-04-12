<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\LiveSantriIndexNotifier;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BoyongController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getBoyong(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            $sql = "SELECT b.*, 
                    s.nis AS santri_nis, s.nama AS santri_nama, s.gender AS santri_gender,
                    p.nama AS pengurus_nama
                    FROM santri___boyong b
                    LEFT JOIN santri s ON b.id_santri = s.id
                    LEFT JOIN pengurus p ON b.id_pengurus = p.id
                    WHERE 1=1";
            $params = [];

            if ($idSantri) {
                $sql .= " AND b.id_santri = ?";
                $params[] = $idSantri;
            }
            if ($tahunHijriyah !== null && $tahunHijriyah !== '') {
                $sql .= " AND b.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            }
            if ($tahunMasehi !== null && $tahunMasehi !== '') {
                $sql .= " AND b.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }

            $sql .= " ORDER BY b.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Nomor surat: id/SKU/RKM/MM.YYYY (id boyong, bulan hijriyah 2 digit, tahun hijriyah)
            $bulanHijriNames = [
                'Muharram' => 1, 'Shafar' => 2, 'Rabiul Awal' => 3, 'Rabiul Akhir' => 4,
                'Jumadil Ula' => 5, 'Jumadits Tsani' => 6, 'Rajab' => 7, "Sya'ban" => 8,
                'Ramadhan' => 9, 'Syawal' => 10, "Dzulqa'dah" => 11, 'Dzulhijjah' => 12,
            ];
            foreach ($data as &$row) {
                $id = (int)($row['id'] ?? 0);
                $tanggalHijriyah = trim($row['tanggal_hijriyah'] ?? '');
                $bulan = null;
                $tahun = null;
                if (preg_match('/^\d+\s+(.+?)\s+(\d{4})$/', $tanggalHijriyah, $m)) {
                    $monthName = trim($m[1]);
                    $tahun = $m[2];
                    foreach ($bulanHijriNames as $name => $num) {
                        if (strcasecmp($name, $monthName) === 0) {
                            $bulan = $num;
                            break;
                        }
                    }
                }
                $bulanStr = $bulan !== null ? str_pad((string)$bulan, 2, '0', STR_PAD_LEFT) : '00';
                $tahunStr = $tahun ?: '0000';
                $row['nomor_surat'] = $id . '/SKU/RKM/' . $bulanStr . '.' . $tahunStr;
            }
            unset($row);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get boyong error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function createBoyong(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $user = $request->getAttribute('user');
            $idPengurus = $user !== null ? (int)($user['user_id'] ?? $user['id'] ?? 0) : null;
            if ($idPengurus <= 0) {
                $idPengurus = null;
            }

            if (!isset($data['id_santri'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri wajib diisi'
                ], 400);
            }

            $sql = "INSERT INTO santri___boyong (id_santri, diniyah, formal, tanggal_hijriyah, tahun_hijriyah, tahun_masehi, id_pengurus) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)";

            $stmt = $this->db->prepare($sql);
            $idSantri = (int) $data['id_santri'];
            $stmt->execute([
                $idSantri,
                $data['diniyah'] ?? null,
                $data['formal'] ?? null,
                $data['tanggal_hijriyah'] ?? null,
                $data['tahun_hijriyah'] ?? null,
                $data['tahun_masehi'] ?? null,
                $idPengurus
            ]);

            $id = (int) $this->db->lastInsertId();
            $stmtNew = $this->db->prepare("SELECT * FROM santri___boyong WHERE id = ?");
            $stmtNew->execute([$id]);
            $newBoyong = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newBoyong && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_CREATE, 'santri___boyong', $id, null, $newBoyong, $request);
            }

            // Update status_santri jadi 'Boyong' di tabel santri
            $stmtSantri = $this->db->prepare("UPDATE santri SET status_santri = 'Boyong' WHERE id = ?");
            $stmtSantri->execute([$idSantri]);

            LiveSantriIndexNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data boyong berhasil ditambahkan',
                'data' => ['id' => $id]
            ], 201);

        } catch (\Exception $e) {
            error_log("Create boyong error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateBoyong(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID boyong wajib diisi'
                ], 400);
            }

            $stmtOld = $this->db->prepare("SELECT * FROM santri___boyong WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldBoyong = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldBoyong) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data boyong tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $fields = [];
            $params = [];

            $allowed = ['id_santri', 'diniyah', 'formal', 'tanggal_hijriyah', 'tahun_hijriyah', 'tahun_masehi'];
            foreach ($allowed as $key) {
                if (array_key_exists($key, $data)) {
                    $fields[] = "`$key` = ?";
                    $params[] = $data[$key];
                }
            }

            if (empty($fields)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Tidak ada perubahan'
                ], 200);
            }

            $params[] = $id;
            $sql = "UPDATE santri___boyong SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            if ($idPengurus) {
                $stmtNew = $this->db->prepare("SELECT * FROM santri___boyong WHERE id = ?");
                $stmtNew->execute([$id]);
                $newBoyong = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($newBoyong) {
                    UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_UPDATE, 'santri___boyong', $id, $oldBoyong, $newBoyong, $request);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data boyong berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update boyong error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteBoyong(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID boyong wajib diisi'
                ], 400);
            }

            $stmtOld = $this->db->prepare("SELECT * FROM santri___boyong WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldBoyong = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldBoyong) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data boyong tidak ditemukan'
                ], 404);
            }
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;

            $stmt = $this->db->prepare("DELETE FROM santri___boyong WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() > 0 && $idPengurus) {
                UserAktivitasLogger::log(null, $idPengurus, UserAktivitasLogger::ACTION_DELETE, 'santri___boyong', $id, $oldBoyong, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data boyong berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete boyong error: " . $e->getMessage());
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
