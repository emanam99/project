<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Data lulusan santri per lembaga per tahun ajaran (tabel santri___lulusan).
 * GET /api/santri-lulusan — super_admin only.
 */
class SantriLulusanController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/santri-lulusan
     * List semua record lulusan dengan JOIN santri, lembaga, dan rombel (dari santri___rombel + lembaga___rombel).
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            if (!$this->tableExists('santri___lulusan')) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            $sql = "SELECT 
                sl.id,
                sl.id_santri,
                sl.id_rombel,
                sl.tahun_ajaran,
                sl.tanggal_dibuat,
                s.nis,
                s.nama,
                s.nik,
                l.nama AS lembaga_nama,
                l.kategori AS lembaga_kategori,
                CONCAT(TRIM(COALESCE(r.kelas, '')), IF(TRIM(COALESCE(r.kel, '')) = '', '', ' '), TRIM(COALESCE(r.kel, ''))) AS rombel_label
                FROM santri___lulusan sl
                JOIN santri s ON s.id = sl.id_santri
                JOIN lembaga___rombel r ON r.id = sl.id_rombel
                JOIN lembaga l ON l.id = r.lembaga_id
                ORDER BY sl.tanggal_dibuat DESC, s.nama ASC";
            $stmt = $this->db->query($sql);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);
        } catch (\Exception $e) {
            error_log("Get santri lulusan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error mengambil data lulusan',
                'data' => []
            ], 500);
        }
    }

    /**
     * POST /api/santri-lulusan
     * Body: { "id_rombel": int, "tahun_ajaran": string, "id_santri_list": int[] }
     * Insert record lulusan untuk setiap id_santri (id_rombel + tahun_ajaran sama). Duplikat di-ignore.
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            if (!$this->tableExists('santri___lulusan')) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel lulusan belum tersedia'
                ], 400);
            }

            $body = $request->getParsedBody() ?? [];
            $idRombel = isset($body['id_rombel']) ? (int) $body['id_rombel'] : 0;
            $tahunAjaran = isset($body['tahun_ajaran']) ? TextSanitizer::cleanText((string) $body['tahun_ajaran']) : '';
            $idSantriList = isset($body['id_santri_list']) && is_array($body['id_santri_list'])
                ? array_map('intval', array_filter($body['id_santri_list'], function ($v) { return is_numeric($v); }))
                : [];

            if ($idRombel <= 0 || $tahunAjaran === '' || count($idSantriList) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_rombel, tahun_ajaran, dan id_santri_list (min 1) wajib diisi'
                ], 400);
            }

            $inserted = 0;
            $stmt = $this->db->prepare(
                'INSERT IGNORE INTO santri___lulusan (id_santri, id_rombel, tahun_ajaran) VALUES (?, ?, ?)'
            );
            foreach ($idSantriList as $idSantri) {
                if ($idSantri <= 0) continue;
                $stmt->execute([$idSantri, $idRombel, $tahunAjaran]);
                if ($stmt->rowCount() > 0) $inserted++;
            }

            // Set id_diniyah / id_formal santri ke null agar tidak masuk lembaga tersebut lagi (lembaga dari rombel)
            $idSantriList = array_values(array_filter($idSantriList, function ($id) { return $id > 0; }));
            if (count($idSantriList) > 0 && $this->tableExists('lembaga___rombel')) {
                $st = $this->db->prepare('SELECT lembaga_id FROM lembaga___rombel WHERE id = ?');
                $st->execute([$idRombel]);
                $row = $st->fetch(\PDO::FETCH_ASSOC);
                $idLembaga = $row ? trim((string) $row['lembaga_id']) : '';
                if ($idLembaga !== '') {
                    $placeholders = implode(',', array_fill(0, count($idSantriList), '?'));
                    $params = array_merge([$idLembaga], $idSantriList);
                    $sqlUpdate = "UPDATE santri s
                        INNER JOIN lembaga___rombel r ON r.id = s.id_diniyah AND r.lembaga_id = ?
                        SET s.id_diniyah = NULL
                        WHERE s.id IN ($placeholders)";
                    try {
                        $this->db->prepare($sqlUpdate)->execute($params);
                    } catch (\Exception $e) {
                        error_log("SantriLulusanController: clear id_diniyah: " . $e->getMessage());
                    }
                    $sqlUpdateFormal = "UPDATE santri s
                        INNER JOIN lembaga___rombel r ON r.id = s.id_formal AND r.lembaga_id = ?
                        SET s.id_formal = NULL
                        WHERE s.id IN ($placeholders)";
                    try {
                        $this->db->prepare($sqlUpdateFormal)->execute($params);
                    } catch (\Exception $e) {
                        error_log("SantriLulusanController: clear id_formal: " . $e->getMessage());
                    }
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $inserted > 0 ? "Berhasil mencatat {$inserted} santri lulus" : 'Tidak ada data baru (mungkin sudah tercatat)',
                'inserted' => $inserted
            ], 200);
        } catch (\Exception $e) {
            error_log("Create santri lulusan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mencatat lulusan'
            ], 500);
        }
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->db->query("SHOW TABLES LIKE " . $this->db->quote($table));
        return $stmt->rowCount() > 0;
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}
