<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RombelController
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
     * GET /api/rombel - List rombel (filter: lembaga_id, status)
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = $params['lembaga_id'] ?? null;
            $status = $params['status'] ?? null;

            $sql = "SELECT r.*, l.nama AS lembaga_nama,
                    (SELECT p.nama FROM lembaga___wali_kelas w 
                     LEFT JOIN pengurus p ON p.id = w.id_pengurus 
                     WHERE w.id_kelas = r.id AND w.status = 'aktif' 
                     ORDER BY w.id DESC LIMIT 1) AS wali_aktif_nama
                    FROM lembaga___rombel r 
                    LEFT JOIN lembaga l ON l.id = r.lembaga_id 
                    WHERE 1=1";
            $bind = [];
            if ($lembagaId !== null && $lembagaId !== '') {
                $sql .= " AND r.lembaga_id = ?";
                $bind[] = $lembagaId;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND r.status = ?";
                $bind[] = $status;
            }
            $sql .= " ORDER BY r.lembaga_id, r.kelas, r.kel";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("RombelController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data rombel',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/rombel/{id} - Get rombel by id
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rombel tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("
                SELECT r.*, l.nama AS lembaga_nama 
                FROM lembaga___rombel r 
                LEFT JOIN lembaga l ON l.id = r.lembaga_id 
                WHERE r.id = ?
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("RombelController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data rombel',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/rombel - Create rombel
     * Kombinasi (lembaga_id, kelas, kel) unik: jika sudah ada, pakai yang ada dan set status aktif.
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (empty($data['lembaga_id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Lembaga wajib diisi'
                ], 400);
            }

            $lembagaId = $data['lembaga_id'];
            $kelas = isset($data['kelas']) ? (string) $data['kelas'] : '';
            $kel = isset($data['kel']) ? (string) $data['kel'] : '';
            $keterangan = $data['keterangan'] ?? null;
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : 'aktif';

            // Cek apakah kombinasi (lembaga_id, kelas, kel) sudah ada
            $stmt = $this->db->prepare("
                SELECT id, lembaga_id, kelas, kel, keterangan, status, tanggal_dibuat
                FROM lembaga___rombel
                WHERE lembaga_id = ? AND COALESCE(kelas, '') = ? AND COALESCE(kel, '') = ?
                LIMIT 1
            ");
            $stmt->execute([$lembagaId, $kelas, $kel]);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                // Pakai yang ada: ubah status jadi aktif (dan keterangan jika dikirim)
                $id = (int) $existing['id'];
                $updateKeterangan = $keterangan !== null ? $keterangan : $existing['keterangan'];
                $stmt = $this->db->prepare("
                    UPDATE lembaga___rombel SET status = 'aktif', keterangan = ? WHERE id = ?
                ");
                $stmt->execute([$updateKeterangan, $id]);

                $stmt = $this->db->prepare("SELECT * FROM lembaga___rombel WHERE id = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);

                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($pengurusId !== null) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___rombel', (string) $id, $existing, $row, $request);
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Rombel sudah ada, status diaktifkan kembali',
                    'data' => $row
                ], 200);
            }

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO lembaga___rombel (lembaga_id, kelas, kel, keterangan, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$lembagaId, $kelas, $kel, $keterangan, $status, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'lembaga_id' => $lembagaId,
                'kelas' => $kelas,
                'kel' => $kel,
                'keterangan' => $keterangan,
                'status' => $status,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'lembaga___rombel', (string) $newId, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Rombel berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("RombelController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan rombel',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/rombel/{id} - Update rombel
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rombel tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga___rombel WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $lembagaId = $data['lembaga_id'] ?? $old['lembaga_id'];
            $kelas = $data['kelas'] ?? $old['kelas'];
            $kel = $data['kel'] ?? $old['kel'];
            $keterangan = $data['keterangan'] ?? $old['keterangan'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];

            $stmt = $this->db->prepare("
                UPDATE lembaga___rombel 
                SET lembaga_id = ?, kelas = ?, kel = ?, keterangan = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([$lembagaId, $kelas, $kel, $keterangan, $status, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___rombel WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___rombel', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Rombel berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("RombelController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate rombel',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PATCH /api/rombel/{id}/status - Set status (aktif / nonaktif), untuk menonaktifkan
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rombel tidak valid'
                ], 400);
            }

            $data = $request->getParsedBody();
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : null;
            if ($status === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus aktif atau nonaktif'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga___rombel WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE lembaga___rombel SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___rombel WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___rombel', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Rombel diaktifkan' : 'Rombel dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("RombelController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status rombel',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
