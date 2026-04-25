<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class WiridNailulMurodController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * HTML teks kaya dari Quill: hilangkan skrip, izinkan tag tampilan umum.
     */
    private function sanitizeRichHtml(?string $html): string
    {
        if ($html === null || $html === '') {
            return '';
        }
        $s = (string) $html;
        $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        if ($s === false) {
            return '';
        }
        $s = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $s) ?? '';
        $s = preg_replace('#<iframe\b[^>]*>.*?</iframe>#is', '', $s) ?? '';
        $s = preg_replace('#<object\b[^>]*>.*?</object>#is', '', $s) ?? '';
        $s = preg_replace('#<embed\b[^>]*>#is', '', $s) ?? '';
        $allowed = '<p><br><b><i><u><s><em><strong><h1><h2><h3><h4><h5><h6><blockquote><ol><ul><li><a><span><div><sub><sup><code><pre><hr>';
        $s = strip_tags($s, $allowed);
        $s = preg_replace('/\bon\w+\s*=\s*([\'"])[^\'"]*\1/iu', '', $s) ?? $s;
        if (mb_strlen($s) > 16 * 1024 * 1024) {
            return '';
        }
        return $s;
    }

    private function sanitizeLine(?string $v, int $max = 2000): string
    {
        if ($v === null) {
            return '';
        }
        $s = trim((string) $v);
        if (mb_strlen($s) > $max) {
            $s = mb_substr($s, 0, $max);
        }
        return $s;
    }

    /**
     * GET /api/wirid-nailul-murod
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $bab = isset($params['bab']) ? trim((string) $params['bab']) : '';

            $sql = 'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan`, `tanggal_dibuat`, `tanggal_diedit` FROM `wirid___nailul_murod`';
            $bind = [];
            if ($bab !== '') {
                $sql .= ' WHERE `bab` = ?';
                $bind[] = $bab;
            }
            $sql .= ' ORDER BY `bab` ASC, `urutan` ASC, `id` ASC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::getList: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
            ], 500);
        }
    }

    /**
     * GET /api/wirid-nailul-murod/bab-options
     */
    public function getBabOptions(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query(
                "SELECT DISTINCT `bab` FROM `wirid___nailul_murod` WHERE `bab` IS NOT NULL AND TRIM(`bab`) <> '' ORDER BY `bab` ASC"
            );
            $bab = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $out = array_values(array_map('strval', $bab));

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $out,
            ], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::getBabOptions: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal opsi bab',
            ], 500);
        }
    }

    /**
     * GET /api/wirid-nailul-murod/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare(
                'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan`, `tanggal_dibuat`, `tanggal_diedit` FROM `wirid___nailul_murod` WHERE `id` = ?'
            );
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::getById: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
            ], 500);
        }
    }

    /**
     * POST /api/wirid-nailul-murod
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $bab = $this->sanitizeLine($body['bab'] ?? '', 255);
            $judul = $this->sanitizeLine($body['judul'] ?? '', 500);
            if ($judul === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Judul wajib diisi'], 400);
            }
            $isi = $this->sanitizeRichHtml($body['isi'] ?? null);
            $arti = $this->sanitizeRichHtml($body['arti'] ?? null);
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;

            $stmt = $this->db->prepare(
                'INSERT INTO `wirid___nailul_murod` (`bab`, `judul`, `isi`, `arti`, `urutan`) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$bab, $judul, $isi, $arti, $urutan]);
            $newId = (int) $this->db->lastInsertId();
            $stmt2 = $this->db->prepare(
                'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan`, `tanggal_dibuat`, `tanggal_diedit` FROM `wirid___nailul_murod` WHERE `id` = ?'
            );
            $stmt2->execute([$newId]);
            $row = $stmt2->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row,
            ], 201);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::create: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan',
            ], 500);
        }
    }

    /**
     * PUT /api/wirid-nailul-murod/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $bab = $this->sanitizeLine($body['bab'] ?? '', 255);
            $judul = $this->sanitizeLine($body['judul'] ?? '', 500);
            if ($judul === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Judul wajib diisi'], 400);
            }
            $isi = $this->sanitizeRichHtml($body['isi'] ?? null);
            $arti = $this->sanitizeRichHtml($body['arti'] ?? null);
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;

            $stmt = $this->db->prepare(
                'UPDATE `wirid___nailul_murod` SET `bab` = ?, `judul` = ?, `isi` = ?, `arti` = ?, `urutan` = ? WHERE `id` = ?'
            );
            $stmt->execute([$bab, $judul, $isi, $arti, $urutan, $id]);
            if ($stmt->rowCount() < 1) {
                $chk = $this->db->prepare('SELECT `id` FROM `wirid___nailul_murod` WHERE `id` = ?');
                $chk->execute([$id]);
                if (!$chk->fetch()) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
                }
            }
            $stmt2 = $this->db->prepare(
                'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan`, `tanggal_dibuat`, `tanggal_diedit` FROM `wirid___nailul_murod` WHERE `id` = ?'
            );
            $stmt2->execute([$id]);
            $row = $stmt2->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::update: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui',
            ], 500);
        }
    }

    /**
     * DELETE /api/wirid-nailul-murod/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `wirid___nailul_murod` WHERE `id` = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Dihapus'], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::delete: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus',
            ], 500);
        }
    }
}
