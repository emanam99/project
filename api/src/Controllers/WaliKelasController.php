<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class WaliKelasController
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
     * GET /api/wali-kelas - List wali kelas (filter: id_kelas, status, tahun_ajaran)
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idKelas = isset($params['id_kelas']) ? (int) $params['id_kelas'] : null;
            $status = $params['status'] ?? null;
            $tahunAjaran = $params['tahun_ajaran'] ?? null;

            $sql = "SELECT w.*, 
                    p.nama AS wali_nama,
                    sk.nama AS ketua_nama, sw.nama AS wakil_nama, 
                    ss.nama AS sekretaris_nama, sb.nama AS bendahara_nama
                    FROM lembaga___wali_kelas w
                    LEFT JOIN pengurus p ON p.id = w.id_pengurus
                    LEFT JOIN santri sk ON sk.id = w.id_ketua
                    LEFT JOIN santri sw ON sw.id = w.id_wakil
                    LEFT JOIN santri ss ON ss.id = w.id_sekretaris
                    LEFT JOIN santri sb ON sb.id = w.id_bendahara
                    WHERE 1=1";
            $bind = [];
            if ($idKelas !== null && $idKelas > 0) {
                $sql .= " AND w.id_kelas = ?";
                $bind[] = $idKelas;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND w.status = ?";
                $bind[] = $status;
            }
            if ($tahunAjaran !== null && $tahunAjaran !== '') {
                $sql .= " AND w.tahun_ajaran = ?";
                $bind[] = $tahunAjaran;
            }
            $sql .= " ORDER BY w.id_kelas, w.tahun_ajaran DESC, w.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data wali kelas',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/wali-kelas/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("
                SELECT w.*, 
                p.nama AS wali_nama,
                sk.nama AS ketua_nama, sw.nama AS wakil_nama, 
                ss.nama AS sekretaris_nama, sb.nama AS bendahara_nama,
                r.lembaga_id, r.kelas AS kelas_nama, r.kel
                FROM lembaga___wali_kelas w
                LEFT JOIN lembaga___rombel r ON r.id = w.id_kelas
                LEFT JOIN pengurus p ON p.id = w.id_pengurus
                LEFT JOIN santri sk ON sk.id = w.id_ketua
                LEFT JOIN santri sw ON sw.id = w.id_wakil
                LEFT JOIN santri ss ON ss.id = w.id_sekretaris
                LEFT JOIN santri sb ON sb.id = w.id_bendahara
                WHERE w.id = ?
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data wali kelas',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/wali-kelas - Create (riwayat tidak dihapus)
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (empty($data['id_kelas'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kelas (rombel) wajib diisi'
                ], 400);
            }

            $idKelas = (int) $data['id_kelas'];
            $idPengurus = isset($data['id_pengurus']) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idKetua = isset($data['id_ketua']) && $data['id_ketua'] !== '' ? (int) $data['id_ketua'] : null;
            $idWakil = isset($data['id_wakil']) && $data['id_wakil'] !== '' ? (int) $data['id_wakil'] : null;
            $idSekretaris = isset($data['id_sekretaris']) && $data['id_sekretaris'] !== '' ? (int) $data['id_sekretaris'] : null;
            $idBendahara = isset($data['id_bendahara']) && $data['id_bendahara'] !== '' ? (int) $data['id_bendahara'] : null;
            $tahunAjaran = $data['tahun_ajaran'] ?? null;
            $gedung = $data['gedung'] ?? null;
            $ruang = $data['ruang'] ?? null;

            // Wali baru selalu aktif; yang lama untuk rombel yang sama otomatis jadi nonaktif
            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmtDeactivate = $this->db->prepare("UPDATE lembaga___wali_kelas SET status = 'nonaktif' WHERE id_kelas = ?");
            $stmtDeactivate->execute([$idKelas]);

            $stmt = $this->db->prepare("
                INSERT INTO lembaga___wali_kelas 
                (id_kelas, id_pengurus, id_ketua, id_wakil, id_sekretaris, id_bendahara, tahun_ajaran, gedung, ruang, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?)
            ");
            $stmt->execute([
                $idKelas, $idPengurus, $idKetua, $idWakil, $idSekretaris, $idBendahara,
                $tahunAjaran, $gedung, $ruang, $waktu
            ]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'id_kelas' => $idKelas,
                'id_pengurus' => $idPengurus,
                'id_ketua' => $idKetua,
                'id_wakil' => $idWakil,
                'id_sekretaris' => $idSekretaris,
                'id_bendahara' => $idBendahara,
                'tahun_ajaran' => $tahunAjaran,
                'gedung' => $gedung,
                'ruang' => $ruang,
                'status' => 'aktif',
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'lembaga___wali_kelas', (string) $newId, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Wali kelas berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("WaliKelasController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan wali kelas',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/wali-kelas/{id} - Update
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $idKelas = isset($data['id_kelas']) ? (int) $data['id_kelas'] : (int) $old['id_kelas'];
            $idPengurus = array_key_exists('id_pengurus', $data) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idKetua = array_key_exists('id_ketua', $data) && $data['id_ketua'] !== '' ? (int) $data['id_ketua'] : null;
            $idWakil = array_key_exists('id_wakil', $data) && $data['id_wakil'] !== '' ? (int) $data['id_wakil'] : null;
            $idSekretaris = array_key_exists('id_sekretaris', $data) && $data['id_sekretaris'] !== '' ? (int) $data['id_sekretaris'] : null;
            $idBendahara = array_key_exists('id_bendahara', $data) && $data['id_bendahara'] !== '' ? (int) $data['id_bendahara'] : null;
            $tahunAjaran = $data['tahun_ajaran'] ?? $old['tahun_ajaran'];
            $gedung = $data['gedung'] ?? $old['gedung'];
            $ruang = $data['ruang'] ?? $old['ruang'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];

            $stmt = $this->db->prepare("
                UPDATE lembaga___wali_kelas 
                SET id_kelas = ?, id_pengurus = ?, id_ketua = ?, id_wakil = ?, id_sekretaris = ?, id_bendahara = ?,
                    tahun_ajaran = ?, gedung = ?, ruang = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $idKelas, $idPengurus, $idKetua, $idWakil, $idSekretaris, $idBendahara,
                $tahunAjaran, $gedung, $ruang, $status, $id
            ]);

            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___wali_kelas', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Wali kelas berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate wali kelas',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PATCH /api/wali-kelas/{id}/status - Set status (aktif / nonaktif)
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
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

            $stmt = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE lembaga___wali_kelas SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___wali_kelas', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Wali kelas diaktifkan' : 'Wali kelas dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status wali kelas',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
