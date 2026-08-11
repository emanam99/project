<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class LttqMualimController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idTingkatan = isset($params['id_lttq_tingkatan']) ? (int) $params['id_lttq_tingkatan'] : null;
            $status = $params['status'] ?? null;
            $tahunAjaran = $params['tahun_ajaran'] ?? null;

            $sql = 'SELECT m.*, p.nama AS pengurus_nama, s.nama AS santri_nama, s.nis AS santri_nis
                FROM lttq___mualim m
                LEFT JOIN pengurus p ON p.id = m.id_pengurus
                LEFT JOIN santri s ON s.id = m.id_santri
                WHERE 1=1';
            $bind = [];
            if ($idTingkatan !== null && $idTingkatan > 0) {
                $sql .= ' AND m.id_lttq_tingkatan = ?';
                $bind[] = $idTingkatan;
            }
            if ($status !== null && $status !== '') {
                $sql .= ' AND m.status = ?';
                $bind[] = $status;
            }
            if ($tahunAjaran !== null && $tahunAjaran !== '') {
                $sql .= ' AND m.tahun_ajaran = ?';
                $bind[] = $tahunAjaran;
            }
            $sql .= ' ORDER BY m.id_lttq_tingkatan, m.tahun_ajaran DESC, m.tanggal_dibuat DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['mualim_nama'] = trim((string) ($r['pengurus_nama'] ?? '')) !== ''
                    ? (string) $r['pengurus_nama']
                    : (string) ($r['santri_nama'] ?? '');
                $r['tipe_mualim'] = !empty($r['id_pengurus']) ? 'pengurus' : 'santri';
            }
            unset($r);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Exception $e) {
            error_log('LttqMualimController getAll: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data mualim'], 500);
        }
    }

    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('
                SELECT m.*, p.nama AS pengurus_nama, s.nama AS santri_nama
                FROM lttq___mualim m
                LEFT JOIN pengurus p ON p.id = m.id_pengurus
                LEFT JOIN santri s ON s.id = m.id_santri
                WHERE m.id = ?
            ');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mualim tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data mualim'], 500);
        }
    }

    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            if (empty($data['id_lttq_tingkatan'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tingkatan wajib diisi'], 400);
            }
            $idTingkatan = (int) $data['id_lttq_tingkatan'];
            $idPengurus = isset($data['id_pengurus']) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idSantri = isset($data['id_santri']) && $data['id_santri'] !== '' ? (int) $data['id_santri'] : null;
            if (($idPengurus === null || $idPengurus <= 0) && ($idSantri === null || $idSantri <= 0)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih pengurus atau santri sebagai mualim'], 400);
            }
            if ($idPengurus > 0 && $idSantri > 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Hanya satu sumber: pengurus atau santri'], 400);
            }
            $tahunAjaran = TextSanitizer::cleanTextOrNull($data['tahun_ajaran'] ?? null);

            $this->db->prepare("UPDATE lttq___mualim SET status = 'nonaktif' WHERE id_lttq_tingkatan = ?")
                ->execute([$idTingkatan]);

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $this->db->prepare('
                INSERT INTO lttq___mualim (id_lttq_tingkatan, id_pengurus, id_santri, tahun_ajaran, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, \'aktif\', ?)
            ')->execute([
                $idTingkatan,
                $idPengurus > 0 ? $idPengurus : null,
                $idSantri > 0 ? $idSantri : null,
                $tahunAjaran,
                $waktu,
            ]);
            $newId = (int) $this->db->lastInsertId();
            $stmt = $this->db->prepare('SELECT * FROM lttq___mualim WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Mualim berhasil ditambahkan',
                'data' => $row,
            ], 201);
        } catch (\Exception $e) {
            error_log('LttqMualimController create: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambahkan mualim'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT * FROM lttq___mualim WHERE id = ?');
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mualim tidak ditemukan'], 404);
            }
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            $idPengurus = array_key_exists('id_pengurus', $data)
                ? ($data['id_pengurus'] === '' || $data['id_pengurus'] === null ? null : (int) $data['id_pengurus'])
                : (isset($old['id_pengurus']) ? (int) $old['id_pengurus'] : null);
            $idSantri = array_key_exists('id_santri', $data)
                ? ($data['id_santri'] === '' || $data['id_santri'] === null ? null : (int) $data['id_santri'])
                : (isset($old['id_santri']) ? (int) $old['id_santri'] : null);
            $tahunAjaran = array_key_exists('tahun_ajaran', $data)
                ? TextSanitizer::cleanTextOrNull($data['tahun_ajaran'])
                : ($old['tahun_ajaran'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status']
                : ($old['status'] ?? 'aktif');

            $this->db->prepare('
                UPDATE lttq___mualim SET id_pengurus = ?, id_santri = ?, tahun_ajaran = ?, status = ? WHERE id = ?
            ')->execute([
                $idPengurus > 0 ? $idPengurus : null,
                $idSantri > 0 ? $idSantri : null,
                $tahunAjaran,
                $status,
                $id,
            ]);
            $stmt = $this->db->prepare('SELECT * FROM lttq___mualim WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Mualim berhasil diupdate', 'data' => $row], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengupdate mualim'], 500);
        }
    }

    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $data = $request->getParsedBody();
            $status = is_array($data) && isset($data['status']) ? $data['status'] : null;
            if ($id <= 0 || !in_array($status, ['aktif', 'nonaktif'], true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
            }
            $this->db->prepare('UPDATE lttq___mualim SET status = ? WHERE id = ?')->execute([$status, $id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Status mualim diperbarui'], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengubah status'], 500);
        }
    }
}
