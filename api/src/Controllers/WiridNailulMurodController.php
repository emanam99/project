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

    private function hasBabTable(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'wirid___nailul_murod_bab'");
            $cached = (bool) $stmt->fetchColumn();
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function hasBabIdColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM `wirid___nailul_murod` LIKE 'bab_id'");
            $cached = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function hasJudulIdColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM `wirid___nailul_murod` LIKE 'judul_id'");
            $cached = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function hasJudulArColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM `wirid___nailul_murod` LIKE 'judul_ar'");
            $cached = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function wiridJudulSelectFields(): string
    {
        $parts = ['w.`judul`'];
        if ($this->hasJudulIdColumn()) {
            $parts[] = 'w.`judul_id`';
        }
        if ($this->hasJudulArColumn()) {
            $parts[] = 'w.`judul_ar`';
        }

        return implode(', ', $parts);
    }

    /**
     * @return array{judul_id: string, judul_ar: string, judul: string}|null null = judul kosong
     */
    private function parseJudulFromBody(array $body): ?array
    {
        $legacyJudul = $this->sanitizeLine($body['judul'] ?? '', 500);
        $judulId = $this->sanitizeLine($body['judul_id'] ?? '', 500);
        $judulAr = $this->sanitizeLine($body['judul_ar'] ?? '', 500);

        if (!$this->hasJudulIdColumn() && !$this->hasJudulArColumn()) {
            if ($legacyJudul === '') {
                return null;
            }

            return ['judul_id' => '', 'judul_ar' => '', 'judul' => $legacyJudul];
        }

        if ($judulId === '' && $judulAr === '' && $legacyJudul !== '') {
            $judulId = $legacyJudul;
        }
        if ($judulId === '' && $judulAr === '') {
            return null;
        }

        $judulLegacy = $judulId !== '' ? $judulId : $judulAr;

        return [
            'judul_id' => $judulId,
            'judul_ar' => $judulAr,
            'judul' => $judulLegacy,
        ];
    }

    private function hasBabNamaIdColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        if (!$this->hasBabTable()) {
            $cached = false;

            return false;
        }
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM `wirid___nailul_murod_bab` LIKE 'nama_id'");
            $cached = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function hasBabNamaArColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        if (!$this->hasBabTable()) {
            $cached = false;

            return false;
        }
        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM `wirid___nailul_murod_bab` LIKE 'nama_ar'");
            $cached = (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            $cached = false;
        }

        return $cached;
    }

    private function babNamaSelectFields(): string
    {
        $parts = ['b.`nama`'];
        if ($this->hasBabNamaIdColumn()) {
            $parts[] = 'b.`nama_id`';
        }
        if ($this->hasBabNamaArColumn()) {
            $parts[] = 'b.`nama_ar`';
        }

        return implode(', ', $parts);
    }

    /**
     * @return array{nama_id: string, nama_ar: string, nama: string}|null
     */
    private function parseBabNamaFromBody(array $body): ?array
    {
        $legacyNama = $this->sanitizeLine($body['nama'] ?? '', 255);
        $namaId = $this->sanitizeLine($body['nama_id'] ?? '', 255);
        $namaAr = $this->sanitizeLine($body['nama_ar'] ?? '', 255);

        if (!$this->hasBabNamaIdColumn() && !$this->hasBabNamaArColumn()) {
            if ($legacyNama === '') {
                return null;
            }

            return ['nama_id' => '', 'nama_ar' => '', 'nama' => $legacyNama];
        }

        if ($namaId === '' && $namaAr === '' && $legacyNama !== '') {
            $namaId = $legacyNama;
        }
        if ($namaId === '' && $namaAr === '') {
            return null;
        }

        $namaLegacy = $namaId !== '' ? $namaId : $namaAr;

        return [
            'nama_id' => $namaId,
            'nama_ar' => $namaAr,
            'nama' => $namaLegacy,
        ];
    }

    /** @param array<string, mixed> $row */
    private function formatBabRow(array $row, int $jumlahEntri): array
    {
        $out = [
            'id' => (int) $row['id'],
            'nama' => (string) $row['nama'],
            'urutan' => (int) $row['urutan'],
            'jumlah_entri' => $jumlahEntri,
        ];
        if ($this->hasBabNamaIdColumn()) {
            $out['nama_id'] = (string) ($row['nama_id'] ?? $row['nama'] ?? '');
        }
        if ($this->hasBabNamaArColumn()) {
            $out['nama_ar'] = (string) ($row['nama_ar'] ?? $row['nama'] ?? '');
        }

        return $out;
    }

    private function resolveBabIdByNama(string $nama): ?int
    {
        if ($nama === '' || !$this->hasBabTable()) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT `id` FROM `wirid___nailul_murod_bab` WHERE `nama` = ? LIMIT 1');
        $stmt->execute([$nama]);
        $id = $stmt->fetchColumn();

        return $id !== false ? (int) $id : null;
    }

    /** @return array{0: string, 1: string} [FROM/JOIN clause, bab SELECT expression] */
    private function wiridBabJoinParts(): array
    {
        if ($this->hasBabTable() && $this->hasBabIdColumn()) {
            return [
                'FROM `wirid___nailul_murod` w LEFT JOIN `wirid___nailul_murod_bab` b ON b.`id` = w.`bab_id`',
                'COALESCE(b.`nama`, w.`bab`) AS `bab`',
            ];
        }
        if ($this->hasBabTable()) {
            return [
                'FROM `wirid___nailul_murod` w LEFT JOIN `wirid___nailul_murod_bab` b ON b.`nama` = w.`bab`',
                'COALESCE(b.`nama`, w.`bab`) AS `bab`',
            ];
        }

        return [
            'FROM `wirid___nailul_murod` w',
            'w.`bab`',
        ];
    }

    private function countWiridForBabSql(): string
    {
        if ($this->hasBabIdColumn()) {
            return '(SELECT COUNT(*) FROM `wirid___nailul_murod` w WHERE w.`bab_id` = b.`id`)';
        }

        return '(SELECT COUNT(*) FROM `wirid___nailul_murod` w WHERE w.`bab` = b.`nama`)';
    }

    /** @return array{bab_id: ?int, bab: string}|null */
    private function resolveWiridBabFields(string $bab): ?array
    {
        if ($bab === '') {
            return ['bab_id' => null, 'bab' => ''];
        }
        if (!$this->hasBabTable()) {
            return ['bab_id' => null, 'bab' => $bab];
        }
        $babId = $this->resolveBabIdByNama($bab);
        if ($babId === null) {
            return null;
        }

        return ['bab_id' => $babId, 'bab' => $bab];
    }

    private function fetchWiridRowById(int $id): ?array
    {
        [$fromJoin, $babSelect] = $this->wiridBabJoinParts();
        $sql = 'SELECT w.`id`, ' . $babSelect . ', ' . $this->wiridJudulSelectFields() . ', w.`isi`, w.`arti`, w.`urutan`, w.`tanggal_dibuat`, w.`tanggal_diedit` '
            . $fromJoin . ' WHERE w.`id` = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * GET /api/wirid-nailul-murod
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $bab = isset($params['bab']) ? trim((string) $params['bab']) : '';

            [$fromJoin, $babSelect] = $this->wiridBabJoinParts();
            $sql = 'SELECT w.`id`, ' . $babSelect . ', ' . $this->wiridJudulSelectFields() . ', w.`isi`, w.`arti`, w.`urutan`, w.`tanggal_dibuat`, w.`tanggal_diedit` '
                . $fromJoin;
            $bind = [];
            if ($bab !== '') {
                if ($this->hasBabIdColumn()) {
                    $sql .= ' WHERE (b.`nama` = ? OR (w.`bab_id` IS NULL AND w.`bab` = ?))';
                    $bind[] = $bab;
                    $bind[] = $bab;
                } else {
                    $sql .= ' WHERE w.`bab` = ?';
                    $bind[] = $bab;
                }
            }
            if ($this->hasBabTable()) {
                $sql .= ' ORDER BY COALESCE(b.`urutan`, 9999) ASC, COALESCE(b.`nama`, w.`bab`) ASC, w.`urutan` ASC, w.`id` ASC';
            } else {
                $sql .= ' ORDER BY w.`bab` ASC, w.`urutan` ASC, w.`id` ASC';
            }

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
            if ($this->hasBabTable()) {
                $stmt = $this->db->query(
                    'SELECT `nama` FROM `wirid___nailul_murod_bab` ORDER BY `urutan` ASC, `id` ASC'
                );
            } else {
                $stmt = $this->db->query(
                    "SELECT DISTINCT `bab` FROM `wirid___nailul_murod` WHERE `bab` IS NOT NULL AND TRIM(`bab`) <> '' ORDER BY `bab` ASC"
                );
            }
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
     * GET /api/wirid-nailul-murod/bab
     */
    public function getBabList(Request $request, Response $response): Response
    {
        try {
            if (!$this->hasBabTable()) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                ], 200);
            }

            $countSql = $this->countWiridForBabSql();
            $stmt = $this->db->query(
                'SELECT b.`id`, ' . $this->babNamaSelectFields() . ', b.`urutan`, ' . $countSql . ' AS `jumlah_entri`
                 FROM `wirid___nailul_murod_bab` b
                 ORDER BY b.`urutan` ASC, b.`id` ASC'
            );
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $out = array_map(function (array $row): array {
                return $this->formatBabRow($row, (int) $row['jumlah_entri']);
            }, $rows);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $out,
            ], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::getBabList: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar bab',
            ], 500);
        }
    }

    /**
     * POST /api/wirid-nailul-murod/bab
     */
    public function createBab(Request $request, Response $response): Response
    {
        try {
            if (!$this->hasBabTable()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel bab belum tersedia',
                ], 503);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $namaFields = $this->parseBabNamaFromBody($body);
            if ($namaFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi minimal satu nama bab (Indonesia atau Arab)',
                ], 400);
            }

            $stmtMax = $this->db->query('SELECT COALESCE(MAX(`urutan`), 0) FROM `wirid___nailul_murod_bab`');
            $nextUrutan = ((int) $stmtMax->fetchColumn()) + 1;

            if ($this->hasBabNamaIdColumn() && $this->hasBabNamaArColumn()) {
                $stmt = $this->db->prepare(
                    'INSERT INTO `wirid___nailul_murod_bab` (`nama`, `nama_id`, `nama_ar`, `urutan`) VALUES (?, ?, ?, ?)'
                );
                $stmt->execute([
                    $namaFields['nama'],
                    $namaFields['nama_id'],
                    $namaFields['nama_ar'],
                    $nextUrutan,
                ]);
            } else {
                $stmt = $this->db->prepare(
                    'INSERT INTO `wirid___nailul_murod_bab` (`nama`, `urutan`) VALUES (?, ?)'
                );
                $stmt->execute([$namaFields['nama'], $nextUrutan]);
            }
            $newId = (int) $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $this->formatBabRow([
                    'id' => $newId,
                    'nama' => $namaFields['nama'],
                    'nama_id' => $namaFields['nama_id'],
                    'nama_ar' => $namaFields['nama_ar'],
                    'urutan' => $nextUrutan,
                ], 0),
            ], 201);
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama bab sudah ada',
                ], 409);
            }
            error_log('WiridNailulMurodController::createBab: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambah bab',
            ], 500);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::createBab: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambah bab',
            ], 500);
        }
    }

    /**
     * PUT /api/wirid-nailul-murod/bab/{id}
     */
    public function updateBab(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->hasBabTable()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel bab belum tersedia',
                ], 503);
            }

            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $namaFields = $this->parseBabNamaFromBody($body);
            if ($namaFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi minimal satu nama bab (Indonesia atau Arab)',
                ], 400);
            }

            $selectFields = $this->hasBabNamaIdColumn() && $this->hasBabNamaArColumn()
                ? '`id`, `nama`, `nama_id`, `nama_ar`, `urutan`'
                : '`id`, `nama`, `urutan`';
            $stmtOld = $this->db->prepare('SELECT ' . $selectFields . ' FROM `wirid___nailul_murod_bab` WHERE `id` = ?');
            $stmtOld->execute([$id]);
            $old = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Bab tidak ditemukan'], 404);
            }

            $oldNama = (string) $old['nama'];
            $newNama = $namaFields['nama'];
            $namaUnchanged = $oldNama === $newNama;
            if ($this->hasBabNamaIdColumn() && $this->hasBabNamaArColumn()) {
                $namaUnchanged = $namaUnchanged
                    && (string) ($old['nama_id'] ?? '') === $namaFields['nama_id']
                    && (string) ($old['nama_ar'] ?? '') === $namaFields['nama_ar'];
            }

            if ($namaUnchanged) {
                $countSql = $this->hasBabIdColumn()
                    ? 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab_id` = ?'
                    : 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab` = ?';
                $countStmt = $this->db->prepare($countSql);
                $countStmt->execute([$this->hasBabIdColumn() ? $id : $newNama]);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $this->formatBabRow(array_merge($old, ['id' => $id]), (int) $countStmt->fetchColumn()),
                ], 200);
            }

            $this->db->beginTransaction();
            try {
                if ($this->hasBabNamaIdColumn() && $this->hasBabNamaArColumn()) {
                    $stmtUp = $this->db->prepare(
                        'UPDATE `wirid___nailul_murod_bab` SET `nama` = ?, `nama_id` = ?, `nama_ar` = ? WHERE `id` = ?'
                    );
                    $stmtUp->execute([
                        $newNama,
                        $namaFields['nama_id'],
                        $namaFields['nama_ar'],
                        $id,
                    ]);
                } else {
                    $stmtUp = $this->db->prepare('UPDATE `wirid___nailul_murod_bab` SET `nama` = ? WHERE `id` = ?');
                    $stmtUp->execute([$newNama, $id]);
                }

                if ($oldNama !== $newNama) {
                    if ($this->hasBabIdColumn()) {
                        $stmtWirid = $this->db->prepare(
                            'UPDATE `wirid___nailul_murod` SET `bab` = ? WHERE `bab_id` = ?'
                        );
                        $stmtWirid->execute([$newNama, $id]);
                    } else {
                        $stmtWirid = $this->db->prepare('UPDATE `wirid___nailul_murod` SET `bab` = ? WHERE `bab` = ?');
                        $stmtWirid->execute([$newNama, $oldNama]);
                    }
                }

                $this->db->commit();
            } catch (\PDOException $e) {
                $this->db->rollBack();
                if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nama bab sudah ada',
                    ], 409);
                }
                throw $e;
            }

            $countSql = $this->hasBabIdColumn()
                ? 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab_id` = ?'
                : 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab` = ?';
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute([$this->hasBabIdColumn() ? $id : $newNama]);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $this->formatBabRow([
                    'id' => $id,
                    'nama' => $newNama,
                    'nama_id' => $namaFields['nama_id'],
                    'nama_ar' => $namaFields['nama_ar'],
                    'urutan' => (int) $old['urutan'],
                ], (int) $countStmt->fetchColumn()),
            ], 200);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('WiridNailulMurodController::updateBab: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui bab',
            ], 500);
        }
    }

    /**
     * DELETE /api/wirid-nailul-murod/bab/{id}
     */
    public function deleteBab(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->hasBabTable()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel bab belum tersedia',
                ], 503);
            }

            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmtOld = $this->db->prepare('SELECT `id`, `nama` FROM `wirid___nailul_murod_bab` WHERE `id` = ?');
            $stmtOld->execute([$id]);
            $old = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Bab tidak ditemukan'], 404);
            }

            $countSql = $this->hasBabIdColumn()
                ? 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab_id` = ?'
                : 'SELECT COUNT(*) FROM `wirid___nailul_murod` WHERE `bab` = ?';
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute([$this->hasBabIdColumn() ? $id : (string) $old['nama']]);
            $count = (int) $countStmt->fetchColumn();
            if ($count > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Bab masih berisi ' . $count . ' entri. Hapus atau pindahkan entri dulu.',
                ], 409);
            }

            $stmtDel = $this->db->prepare('DELETE FROM `wirid___nailul_murod_bab` WHERE `id` = ?');
            $stmtDel->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Bab dihapus'], 200);
        } catch (\Exception $e) {
            error_log('WiridNailulMurodController::deleteBab: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus bab',
            ], 500);
        }
    }

    /**
     * PUT /api/wirid-nailul-murod/bab/reorder
     */
    public function reorderBab(Request $request, Response $response): Response
    {
        try {
            if (!$this->hasBabTable()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel bab belum tersedia',
                ], 503);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $order = $body['order'] ?? null;
            if (!is_array($order) || count($order) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Urutan bab tidak valid',
                ], 400);
            }

            $ids = [];
            foreach ($order as $rawId) {
                $id = (int) $rawId;
                if ($id < 1) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Urutan bab tidak valid',
                    ], 400);
                }
                $ids[] = $id;
            }

            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmtCheck = $this->db->prepare(
                'SELECT COUNT(*) FROM `wirid___nailul_murod_bab` WHERE `id` IN (' . $placeholders . ')'
            );
            $stmtCheck->execute($ids);
            if ((int) $stmtCheck->fetchColumn() !== count($ids)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Beberapa bab tidak ditemukan',
                ], 400);
            }

            $this->db->beginTransaction();
            try {
                $stmtUp = $this->db->prepare('UPDATE `wirid___nailul_murod_bab` SET `urutan` = ? WHERE `id` = ?');
                foreach ($ids as $idx => $babId) {
                    $stmtUp->execute([$idx + 1, $babId]);
                }
                $this->db->commit();
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->getBabList($request, $response);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('WiridNailulMurodController::reorderBab: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah urutan bab',
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
                'SELECT `id` FROM `wirid___nailul_murod` WHERE `id` = ?'
            );
            $stmt->execute([$id]);
            if (!$stmt->fetch(\PDO::FETCH_ASSOC)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }
            $row = $this->fetchWiridRowById($id);
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
            $judulFields = $this->parseJudulFromBody($body);
            if ($judulFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi minimal satu judul (Indonesia atau Arab)',
                ], 400);
            }
            $isi = $this->sanitizeRichHtml($body['isi'] ?? null);
            $arti = $this->sanitizeRichHtml($body['arti'] ?? null);
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;

            $babFields = $this->resolveWiridBabFields($bab);
            if ($babFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Bab tidak terdaftar. Pilih dari daftar bab atau kelola bab terlebih dahulu.',
                ], 400);
            }

            if ($this->hasBabIdColumn()) {
                if ($this->hasJudulIdColumn() && $this->hasJudulArColumn()) {
                    $stmt = $this->db->prepare(
                        'INSERT INTO `wirid___nailul_murod` (`bab_id`, `bab`, `judul`, `judul_id`, `judul_ar`, `isi`, `arti`, `urutan`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([
                        $babFields['bab_id'],
                        $babFields['bab'],
                        $judulFields['judul'],
                        $judulFields['judul_id'],
                        $judulFields['judul_ar'],
                        $isi,
                        $arti,
                        $urutan,
                    ]);
                } else {
                    $stmt = $this->db->prepare(
                        'INSERT INTO `wirid___nailul_murod` (`bab_id`, `bab`, `judul`, `isi`, `arti`, `urutan`) VALUES (?, ?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([
                        $babFields['bab_id'],
                        $babFields['bab'],
                        $judulFields['judul'],
                        $isi,
                        $arti,
                        $urutan,
                    ]);
                }
            } else {
                if ($this->hasJudulIdColumn() && $this->hasJudulArColumn()) {
                    $stmt = $this->db->prepare(
                        'INSERT INTO `wirid___nailul_murod` (`bab`, `judul`, `judul_id`, `judul_ar`, `isi`, `arti`, `urutan`) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([
                        $babFields['bab'],
                        $judulFields['judul'],
                        $judulFields['judul_id'],
                        $judulFields['judul_ar'],
                        $isi,
                        $arti,
                        $urutan,
                    ]);
                } else {
                    $stmt = $this->db->prepare(
                        'INSERT INTO `wirid___nailul_murod` (`bab`, `judul`, `isi`, `arti`, `urutan`) VALUES (?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([$babFields['bab'], $judulFields['judul'], $isi, $arti, $urutan]);
                }
            }
            $newId = (int) $this->db->lastInsertId();
            $row = $this->fetchWiridRowById($newId);

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
            $judulFields = $this->parseJudulFromBody($body);
            if ($judulFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi minimal satu judul (Indonesia atau Arab)',
                ], 400);
            }
            $isi = $this->sanitizeRichHtml($body['isi'] ?? null);
            $arti = $this->sanitizeRichHtml($body['arti'] ?? null);
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;

            $babFields = $this->resolveWiridBabFields($bab);
            if ($babFields === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Bab tidak terdaftar. Pilih dari daftar bab atau kelola bab terlebih dahulu.',
                ], 400);
            }

            if ($this->hasBabIdColumn()) {
                if ($this->hasJudulIdColumn() && $this->hasJudulArColumn()) {
                    $stmt = $this->db->prepare(
                        'UPDATE `wirid___nailul_murod` SET `bab_id` = ?, `bab` = ?, `judul` = ?, `judul_id` = ?, `judul_ar` = ?, `isi` = ?, `arti` = ?, `urutan` = ? WHERE `id` = ?'
                    );
                    $stmt->execute([
                        $babFields['bab_id'],
                        $babFields['bab'],
                        $judulFields['judul'],
                        $judulFields['judul_id'],
                        $judulFields['judul_ar'],
                        $isi,
                        $arti,
                        $urutan,
                        $id,
                    ]);
                } else {
                    $stmt = $this->db->prepare(
                        'UPDATE `wirid___nailul_murod` SET `bab_id` = ?, `bab` = ?, `judul` = ?, `isi` = ?, `arti` = ?, `urutan` = ? WHERE `id` = ?'
                    );
                    $stmt->execute([
                        $babFields['bab_id'],
                        $babFields['bab'],
                        $judulFields['judul'],
                        $isi,
                        $arti,
                        $urutan,
                        $id,
                    ]);
                }
            } else {
                if ($this->hasJudulIdColumn() && $this->hasJudulArColumn()) {
                    $stmt = $this->db->prepare(
                        'UPDATE `wirid___nailul_murod` SET `bab` = ?, `judul` = ?, `judul_id` = ?, `judul_ar` = ?, `isi` = ?, `arti` = ?, `urutan` = ? WHERE `id` = ?'
                    );
                    $stmt->execute([
                        $babFields['bab'],
                        $judulFields['judul'],
                        $judulFields['judul_id'],
                        $judulFields['judul_ar'],
                        $isi,
                        $arti,
                        $urutan,
                        $id,
                    ]);
                } else {
                    $stmt = $this->db->prepare(
                        'UPDATE `wirid___nailul_murod` SET `bab` = ?, `judul` = ?, `isi` = ?, `arti` = ?, `urutan` = ? WHERE `id` = ?'
                    );
                    $stmt->execute([$babFields['bab'], $judulFields['judul'], $isi, $arti, $urutan, $id]);
                }
            }
            if ($stmt->rowCount() < 1) {
                $chk = $this->db->prepare('SELECT `id` FROM `wirid___nailul_murod` WHERE `id` = ?');
                $chk->execute([$id]);
                if (!$chk->fetch()) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
                }
            }
            $row = $this->fetchWiridRowById($id);

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
     * PUT /api/wirid-nailul-murod/reorder
     * Body: { bab: string (label grup, "(Tanpa bab)" jika kosong), order: number[] }
     */
    public function reorder(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $babLabel = $this->sanitizeLine($body['bab'] ?? '', 255);
            $order = $body['order'] ?? null;
            if (!is_array($order) || count($order) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Urutan entri tidak valid',
                ], 400);
            }

            $ids = [];
            foreach ($order as $rawId) {
                $id = (int) $rawId;
                if ($id < 1) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Urutan entri tidak valid',
                    ], 400);
                }
                $ids[] = $id;
            }

            if (count($ids) !== count(array_unique($ids))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Urutan entri tidak valid',
                ], 400);
            }

            $existingIds = $this->fetchWiridIdsForBabLabel($babLabel);
            sort($existingIds);
            $sortedOrder = $ids;
            sort($sortedOrder);
            if ($existingIds !== $sortedOrder) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Urutan harus mencakup semua entri dalam bab yang sama',
                ], 400);
            }

            $this->db->beginTransaction();
            try {
                $stmtUp = $this->db->prepare('UPDATE `wirid___nailul_murod` SET `urutan` = ? WHERE `id` = ?');
                foreach ($ids as $idx => $wiridId) {
                    $stmtUp->execute([$idx + 1, $wiridId]);
                }
                $this->db->commit();
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

            $rows = $this->fetchWiridRowsForBabLabel($babLabel);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('WiridNailulMurodController::reorder: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah urutan entri',
            ], 500);
        }
    }

    /** @return int[] */
    private function fetchWiridIdsForBabLabel(string $babLabel): array
    {
        [$where, $bind] = $this->wiridBabLabelWhereClause($babLabel);
        $stmt = $this->db->prepare(
            'SELECT w.`id` FROM `wirid___nailul_murod` w WHERE ' . $where . ' ORDER BY w.`urutan` ASC, w.`id` ASC'
        );
        $stmt->execute($bind);
        $ids = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        return array_map('intval', $ids ?: []);
    }

    /** @return array<int, array<string, mixed>> */
    private function fetchWiridRowsForBabLabel(string $babLabel): array
    {
        [$fromJoin, $babSelect] = $this->wiridBabJoinParts();
        [$where, $bind] = $this->wiridBabLabelWhereClause($babLabel);
        $sql = 'SELECT w.`id`, ' . $babSelect . ', ' . $this->wiridJudulSelectFields()
            . ', w.`isi`, w.`arti`, w.`urutan`, w.`tanggal_dibuat`, w.`tanggal_diedit` '
            . $fromJoin . ' WHERE ' . $where . ' ORDER BY w.`urutan` ASC, w.`id` ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return $rows ?: [];
    }

    /** @return array{0: string, 1: array<int, mixed>} */
    private function wiridBabLabelWhereClause(string $babLabel): array
    {
        $bab = $babLabel === '(Tanpa bab)' ? '' : $babLabel;
        if ($bab === '') {
            return ['TRIM(COALESCE(w.`bab`, \'\')) = \'\'', []];
        }
        if ($this->hasBabIdColumn()) {
            $babId = $this->resolveBabIdByNama($bab);
            if ($babId !== null) {
                return ['(w.`bab_id` = ? OR (w.`bab_id` IS NULL AND w.`bab` = ?))', [$babId, $bab]];
            }
        }

        return ['w.`bab` = ?', [$bab]];
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
