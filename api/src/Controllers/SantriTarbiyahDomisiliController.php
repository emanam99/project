<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveSantriIndexNotifier;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Aksi santri dari konteks Domisili (daerah/kamar) — middleware tarbiyah super.
 */
class SantriTarbiyahDomisiliController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function listCatatan(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri || (int) $idSantri <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $sql = 'SELECT c.*, p.nama AS pengurus_nama
                    FROM santri___catatan c
                    LEFT JOIN pengurus p ON c.id_pengurus = p.id
                    WHERE c.id_santri = ?
                    ORDER BY c.tanggal_dibuat DESC';
            $st = $this->db->prepare($sql);
            $st->execute([(int) $idSantri]);
            return $this->json($response, ['success' => true, 'data' => $st->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('listCatatan: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar catatan'], 500);
        }
    }

    public function createCatatan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $catatan = isset($data['catatan']) ? trim((string) $data['catatan']) : '';
            if ($idSantri <= 0 || $catatan === '') {
                return $this->json($response, ['success' => false, 'message' => 'id_santri dan catatan wajib'], 400);
            }
            $keterangan = isset($data['keterangan']) ? trim((string) $data['keterangan']) : '';
            if ($keterangan !== '' && mb_strlen($keterangan) > 512) {
                $keterangan = mb_substr($keterangan, 0, 512);
            }
            if ($keterangan === '') {
                $keterangan = null;
            }
            $user = $request->getAttribute('user');
            $idPengurus = $user !== null ? (int) ($user['user_id'] ?? $user['id'] ?? 0) : 0;
            if ($idPengurus <= 0) {
                $idPengurus = null;
            }
            $sql = 'INSERT INTO santri___catatan (id_santri, id_pengurus, catatan, keterangan) VALUES (?, ?, ?, ?)';
            $st = $this->db->prepare($sql);
            $st->execute([$idSantri, $idPengurus, $catatan, $keterangan]);
            $id = (int) $this->db->lastInsertId();
            return $this->json($response, ['success' => true, 'message' => 'Catatan disimpan', 'data' => ['id' => $id]], 201);
        } catch (\Exception $e) {
            error_log('createCatatan: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan catatan'], 500);
        }
    }

    public function pindahKamar(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $idKamar = array_key_exists('id_kamar', $data)
                ? ($data['id_kamar'] === '' || $data['id_kamar'] === null ? null : (int) $data['id_kamar'])
                : null;
            if ($idSantri <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            if ($idKamar !== null && $idKamar > 0) {
                $chk = $this->db->prepare('SELECT id FROM daerah___kamar WHERE id = ? LIMIT 1');
                $chk->execute([$idKamar]);
                if (!$chk->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Kamar tidak ditemukan'], 404);
                }
            }
            $st = $this->db->prepare('UPDATE santri SET id_kamar = ? WHERE id = ?');
            $st->execute([$idKamar, $idSantri]);
            LiveSantriIndexNotifier::ping();
            return $this->json($response, ['success' => true, 'message' => 'Kamar santri diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('pindahKamar: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memindahkan kamar santri'], 500);
        }
    }

    private function json(Response $response, array $data, int $code): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
