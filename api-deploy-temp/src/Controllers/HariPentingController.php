<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class HariPentingController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/hari-penting - list (public)
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $filters = [];
            $bind = [];
            $types = '';
            if (isset($params['tipe'])) {
                $filters[] = 'tipe = ?';
                $bind[] = $params['tipe'];
                $types .= 's';
            }
            // Jika tahun dan bulan keduanya ada: tampilkan event bulan ini + event bulan ini tiap tahun (tahun IS NULL)
            if (isset($params['tahun']) && isset($params['bulan'])) {
                $filters[] = 'bulan = ? AND (tahun = ? OR tahun IS NULL)';
                $bind[] = $params['bulan'];
                $bind[] = $params['tahun'];
                $types .= 'ii';
            } else {
                if (isset($params['tahun'])) {
                    $filters[] = 'tahun = ?';
                    $bind[] = $params['tahun'];
                    $types .= 'i';
                }
                if (isset($params['bulan'])) {
                    $filters[] = 'bulan = ?';
                    $bind[] = $params['bulan'];
                    $types .= 'i';
                }
            }
            if (isset($params['tanggal'])) {
                $filters[] = 'tanggal = ?';
                $bind[] = $params['tanggal'];
                $types .= 'i';
            }
            if (isset($params['hari_pekan'])) {
                $filters[] = 'hari_pekan = ?';
                $bind[] = $params['hari_pekan'];
                $types .= 'i';
            }
            $sql = "SELECT * FROM psa___hari_penting";
            if (count($filters) > 0) {
                $sql .= " WHERE " . implode(' AND ', $filters);
            }
            $sql .= " ORDER BY id DESC";
            if (count($bind) > 0) {
                $stmt = $this->db->prepare($sql);
                $stmt->execute($bind);
            } else {
                $stmt = $this->db->query($sql);
            }
            $rows = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
            return $this->json($response, $rows);
        } catch (\Exception $e) {
            error_log("HariPenting getList error: " . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/hari-penting - create, update, or delete (admin_kalender only)
     */
    public function post(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                return $this->json($response, ['error' => 'Input harus JSON object'], 400);
            }
            if (!empty($data['delete']) && isset($data['id'])) {
                $old = $this->db->prepare("SELECT * FROM psa___hari_penting WHERE id = ?");
                $old->execute([$data['id']]);
                $oldRow = $old->fetch(\PDO::FETCH_ASSOC);
                $stmt = $this->db->prepare("DELETE FROM psa___hari_penting WHERE id = ?");
                $stmt->execute([$data['id']]);
                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($oldRow && $pengurusId !== null) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'psa___hari_penting', $data['id'], $oldRow, null, $request);
                }
                return $this->json($response, ['message' => 'Hari penting berhasil dihapus']);
            }
            $nama_event = TextSanitizer::cleanText($data['nama_event'] ?? '');
            $kategori = $data['kategori'] ?? 'hijriyah';
            $tipe = $data['tipe'] ?? 'per_tahun';
            $hari_pekan = isset($data['hari_pekan']) ? (int) $data['hari_pekan'] : null;
            $tanggal = isset($data['tanggal']) ? (int) $data['tanggal'] : null;
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : null;
            $tahun = isset($data['tahun']) ? (int) $data['tahun'] : null;
            $warna_label = TextSanitizer::cleanTextOrNull($data['warna_label'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $aktif = isset($data['aktif']) ? (int) $data['aktif'] : 1;

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if (isset($data['id']) && $data['id'] !== '' && $data['id'] !== null) {
                $oldStmt = $this->db->prepare("SELECT * FROM psa___hari_penting WHERE id = ?");
                $oldStmt->execute([$data['id']]);
                $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC);
                $stmt = $this->db->prepare("UPDATE psa___hari_penting SET nama_event=?, kategori=?, tipe=?, hari_pekan=?, tanggal=?, bulan=?, tahun=?, warna_label=?, keterangan=?, aktif=? WHERE id=?");
                $stmt->execute([$nama_event, $kategori, $tipe, $hari_pekan, $tanggal, $bulan, $tahun, $warna_label, $keterangan, $aktif, $data['id']]);
                if ($pengurusId !== null) {
                    $newStmt = $this->db->prepare("SELECT * FROM psa___hari_penting WHERE id = ?");
                    $newStmt->execute([$data['id']]);
                    $newRow = $newStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($oldRow && $newRow) {
                        UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'psa___hari_penting', $data['id'], $oldRow, $newRow, $request);
                    }
                }
                return $this->json($response, ['message' => 'Hari penting berhasil diupdate']);
            }
            $stmt = $this->db->prepare("INSERT INTO psa___hari_penting (nama_event, kategori, tipe, hari_pekan, tanggal, bulan, tahun, warna_label, keterangan, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$nama_event, $kategori, $tipe, $hari_pekan, $tanggal, $bulan, $tahun, $warna_label, $keterangan, $aktif]);
            $newId = (int) $this->db->lastInsertId();
            if ($pengurusId !== null && $newId) {
                $newStmt = $this->db->prepare("SELECT * FROM psa___hari_penting WHERE id = ?");
                $newStmt->execute([$newId]);
                $newRow = $newStmt->fetch(\PDO::FETCH_ASSOC);
                if ($newRow) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'psa___hari_penting', $newId, null, $newRow, $request);
                }
            }
            return $this->json($response, ['message' => 'Hari penting berhasil ditambah', 'id' => $newId]);
        } catch (\Exception $e) {
            error_log("HariPenting post error: " . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/hari-penting - delete by id in body (admin_kalender only)
     */
    public function delete(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data) || !isset($data['id'])) {
                return $this->json($response, ['error' => 'Input harus JSON dengan field id'], 400);
            }
            $oldStmt = $this->db->prepare("SELECT * FROM psa___hari_penting WHERE id = ?");
            $oldStmt->execute([$data['id']]);
            $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC);
            $stmt = $this->db->prepare("DELETE FROM psa___hari_penting WHERE id = ?");
            $stmt->execute([$data['id']]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($oldRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'psa___hari_penting', $data['id'], $oldRow, null, $request);
            }
            return $this->json($response, ['message' => 'Hari penting berhasil dihapus']);
        } catch (\Exception $e) {
            error_log("HariPenting delete error: " . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
