<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\FileUploadValidator;
use App\Helpers\TenantHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PorsiController
{
    private PDO $db;
    private string $uploadsBase;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $base = rtrim((string) ($_ENV['UPLOADS_PATH'] ?? ''), '/\\');
        if ($base === '') {
            $base = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
        }
        $this->uploadsBase = $base;
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function parseBody(Request $request): array
    {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function find(int $id, int $sppgId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, u.name AS created_by_name, u.email AS created_by_email
             FROM porsi p
             LEFT JOIN users u ON u.id = p.created_by
             WHERE p.id = ? AND p.sppg_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $sppgId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @return list<array<string,mixed>> */
    private function menuOf(int $porsiId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, porsi_id, nama, pb, pk, urutan, created_at
             FROM porsi_menu
             WHERE porsi_id = ?
             ORDER BY urutan ASC, id ASC'
        );
        $stmt->execute([$porsiId]);
        return $stmt->fetchAll() ?: [];
    }

    /**
     * Menu item: nama + harga. Harga disimpan ke pb (porsi besar) atau pk (porsi kecil)
     * sesuai ukuran catatan.
     *
     * @param list<mixed> $items
     * @return array{ok:bool,message?:string,items?:list<array{nama:string,pb:float,pk:?float}>}
     */
    private function normalizeMenuItems(array $items, string $ukuran): array
    {
        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }
            $nama = trim((string) ($it['nama'] ?? ''));
            if ($nama === '') {
                continue;
            }
            if (strlen($nama) > 200) {
                return ['ok' => false, 'message' => 'Nama menu maksimal 200 karakter'];
            }
            $hargaRaw = $it['harga'] ?? null;
            if ($hargaRaw === null || $hargaRaw === '') {
                // Kompatibilitas payload lama
                $hargaRaw = $ukuran === 'kecil' ? ($it['pk'] ?? 0) : ($it['pb'] ?? 0);
            }
            $harga = (float) $hargaRaw;
            if ($harga < 0) {
                return ['ok' => false, 'message' => 'Harga tidak boleh negatif'];
            }
            $harga = round($harga, 2);
            if ($ukuran === 'kecil') {
                $out[] = ['nama' => $nama, 'pb' => 0.0, 'pk' => $harga];
            } else {
                $out[] = ['nama' => $nama, 'pb' => $harga, 'pk' => null];
            }
        }
        return ['ok' => true, 'items' => $out];
    }

    /** @param list<array{nama:string,pb:float,pk:?float}> $items */
    private function replaceMenu(int $porsiId, array $items): void
    {
        $del = $this->db->prepare('DELETE FROM porsi_menu WHERE porsi_id = ?');
        $del->execute([$porsiId]);
        if (!$items) {
            return;
        }
        $ins = $this->db->prepare(
            'INSERT INTO porsi_menu (porsi_id, nama, pb, pk, urutan) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($items as $i => $it) {
            $ins->execute([$porsiId, $it['nama'], $it['pb'], $it['pk'], $i + 1]);
        }
    }

    private function numField(array $body, string $key): float
    {
        return round((float) ($body[$key] ?? 0), 2);
    }

    /** @return array{ok:bool,message?:string,judul?:string} */
    private function normalizeJudul(array $body): array
    {
        $judul = trim((string) ($body['judul'] ?? ''));
        if ($judul === '') {
            return ['ok' => false, 'message' => 'Judul porsi wajib diisi'];
        }
        if (strlen($judul) > 200) {
            return ['ok' => false, 'message' => 'Judul porsi maksimal 200 karakter'];
        }
        return ['ok' => true, 'judul' => $judul];
    }

    /** GET /porsi */
    public function index(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $q = $request->getQueryParams();
        $sql = 'SELECT p.*, u.name AS created_by_name,
                       (SELECT COUNT(*) FROM porsi_menu m WHERE m.porsi_id = p.id) AS menu_count,
                       (SELECT COALESCE(SUM(m.pb),0) FROM porsi_menu m WHERE m.porsi_id = p.id) AS total_pb,
                       (SELECT COALESCE(SUM(COALESCE(m.pk,0)),0) FROM porsi_menu m WHERE m.porsi_id = p.id) AS total_pk,
                       (SELECT COALESCE(SUM(
                            CASE WHEN p.ukuran = \'kecil\' THEN COALESCE(m.pk, 0) ELSE m.pb END
                        ),0) FROM porsi_menu m WHERE m.porsi_id = p.id) AS total_harga
                FROM porsi p
                LEFT JOIN users u ON u.id = p.created_by
                WHERE p.sppg_id = ?';
        $params = [$sppgId];
        if (!empty($q['from'])) {
            $sql .= ' AND p.tanggal >= ?';
            $params[] = $q['from'];
        }
        if (!empty($q['to'])) {
            $sql .= ' AND p.tanggal <= ?';
            $params[] = $q['to'];
        }
        if (!empty($q['ukuran']) && in_array($q['ukuran'], ['besar', 'kecil'], true)) {
            $sql .= ' AND p.ukuran = ?';
            $params[] = $q['ukuran'];
        }
        if (!empty($q['q'])) {
            $sql .= ' AND (
                p.judul LIKE ?
                OR EXISTS (
                    SELECT 1 FROM porsi_menu m2 WHERE m2.porsi_id = p.id AND m2.nama LIKE ?
                )
            )';
            $params[] = '%' . $q['q'] . '%';
            $params[] = '%' . $q['q'] . '%';
        }
        $sql .= ' ORDER BY p.tanggal DESC, p.id DESC LIMIT 200';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /** GET /porsi/item-options — nama + harga terakhir untuk PB dan PK */
    public function itemOptions(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $stmt = $this->db->prepare(
            'SELECT
                names.nama,
                (
                    SELECT m.pb
                    FROM porsi_menu m
                    INNER JOIN porsi p ON p.id = m.porsi_id
                    WHERE LOWER(TRIM(m.nama)) = names.k AND p.ukuran = \'besar\' AND p.sppg_id = ?
                    ORDER BY m.id DESC
                    LIMIT 1
                ) AS pb,
                (
                    SELECT m.pk
                    FROM porsi_menu m
                    INNER JOIN porsi p ON p.id = m.porsi_id
                    WHERE LOWER(TRIM(m.nama)) = names.k AND p.ukuran = \'kecil\' AND p.sppg_id = ?
                    ORDER BY m.id DESC
                    LIMIT 1
                ) AS pk
             FROM (
                SELECT LOWER(TRIM(m.nama)) AS k, MAX(m.nama) AS nama
                FROM porsi_menu m
                INNER JOIN porsi p ON p.id = m.porsi_id
                WHERE TRIM(m.nama) <> \'\' AND p.sppg_id = ?
                GROUP BY LOWER(TRIM(m.nama))
             ) names
             ORDER BY names.nama ASC
             LIMIT 800'
        );
        $stmt->execute([$sppgId, $sppgId, $sppgId]);
        $rows = $stmt->fetchAll() ?: [];
        $data = [];
        foreach ($rows as $row) {
            $data[] = [
                'nama' => (string) $row['nama'],
                'pb' => $row['pb'] === null ? null : (float) $row['pb'],
                'pk' => $row['pk'] === null ? null : (float) $row['pk'],
            ];
        }
        return $this->json($response, ['success' => true, 'data' => ['menu' => $data]]);
    }

    /** GET /porsi/{id} */
    public function show(Request $request, Response $response, array $args): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $row = $this->find($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan porsi tidak ditemukan'], 404);
        }
        return $this->json($response, [
            'success' => true,
            'data' => [
                'porsi' => $row,
                'menu' => $this->menuOf($id),
            ],
        ]);
    }

    /** POST /porsi */
    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah porsi'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);

        $body = $this->parseBody($request);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Tanggal tidak valid'], 422);
        }
        $ukuran = trim((string) ($body['ukuran'] ?? 'besar'));
        if (!in_array($ukuran, ['besar', 'kecil'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Ukuran harus besar atau kecil'], 422);
        }

        $judulCheck = $this->normalizeJudul($body);
        if (!$judulCheck['ok']) {
            return $this->json($response, ['success' => false, 'message' => $judulCheck['message']], 422);
        }

        $menuCheck = $this->normalizeMenuItems(
            is_array($body['menu'] ?? null) ? $body['menu'] : [],
            $ukuran
        );
        if (!$menuCheck['ok']) {
            return $this->json($response, ['success' => false, 'message' => $menuCheck['message']], 422);
        }

        $ins = $this->db->prepare(
            'INSERT INTO porsi
             (sppg_id, tanggal, judul, ukuran, energi_kkal, karbohidrat_gr, protein_gr, lemak_gr, serat_gr, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $sppgId,
            $tanggal,
            $judulCheck['judul'],
            $ukuran,
            $this->numField($body, 'energi_kkal'),
            $this->numField($body, 'karbohidrat_gr'),
            $this->numField($body, 'protein_gr'),
            $this->numField($body, 'lemak_gr'),
            $this->numField($body, 'serat_gr'),
            isset($user['id']) ? (int) $user['id'] : null,
        ]);
        $id = (int) $this->db->lastInsertId();
        $this->replaceMenu($id, $menuCheck['items'] ?? []);

        return $this->json($response, [
            'success' => true,
            'message' => 'Porsi disimpan',
            'data' => [
                'porsi' => $this->find($id, $sppgId),
                'menu' => $this->menuOf($id),
            ],
        ], 201);
    }

    /** PUT /porsi/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah porsi'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        if (!$this->find($id, $sppgId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan porsi tidak ditemukan'], 404);
        }

        $body = $this->parseBody($request);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Tanggal tidak valid'], 422);
        }
        $ukuran = trim((string) ($body['ukuran'] ?? 'besar'));
        if (!in_array($ukuran, ['besar', 'kecil'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Ukuran harus besar atau kecil'], 422);
        }

        $judulCheck = $this->normalizeJudul($body);
        if (!$judulCheck['ok']) {
            return $this->json($response, ['success' => false, 'message' => $judulCheck['message']], 422);
        }

        $menuCheck = $this->normalizeMenuItems(
            is_array($body['menu'] ?? null) ? $body['menu'] : [],
            $ukuran
        );
        if (!$menuCheck['ok']) {
            return $this->json($response, ['success' => false, 'message' => $menuCheck['message']], 422);
        }

        $upd = $this->db->prepare(
            'UPDATE porsi
             SET tanggal = ?, judul = ?, ukuran = ?, energi_kkal = ?, karbohidrat_gr = ?, protein_gr = ?,
                 lemak_gr = ?, serat_gr = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND sppg_id = ?'
        );
        $upd->execute([
            $tanggal,
            $judulCheck['judul'],
            $ukuran,
            $this->numField($body, 'energi_kkal'),
            $this->numField($body, 'karbohidrat_gr'),
            $this->numField($body, 'protein_gr'),
            $this->numField($body, 'lemak_gr'),
            $this->numField($body, 'serat_gr'),
            $id,
            $sppgId,
        ]);
        $this->replaceMenu($id, $menuCheck['items'] ?? []);

        return $this->json($response, [
            'success' => true,
            'message' => 'Porsi diperbarui',
            'data' => [
                'porsi' => $this->find($id, $sppgId),
                'menu' => $this->menuOf($id),
            ],
        ]);
    }

    /** DELETE /porsi/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus porsi'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $row = $this->find($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan porsi tidak ditemukan'], 404);
        }

        $this->deleteFotoFile($row);
        $del = $this->db->prepare('DELETE FROM porsi WHERE id = ? AND sppg_id = ?');
        $del->execute([$id, $sppgId]);

        return $this->json($response, ['success' => true, 'message' => 'Porsi dihapus']);
    }

    /** POST /porsi/{id}/foto */
    public function uploadFoto(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat meng-upload foto'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $row = $this->find($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan porsi tidak ditemukan'], 404);
        }

        $uploaded = $request->getUploadedFiles();
        if (empty($uploaded['file'])) {
            return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
        }
        $file = $uploaded['file'];
        $validation = FileUploadValidator::validate($file, ['jpg', 'jpeg', 'png', 'gif', 'webp']);
        if (!$validation['success']) {
            return $this->json($response, ['success' => false, 'message' => $validation['message']], 422);
        }

        $dir = $this->uploadsBase . DIRECTORY_SEPARATOR . 'porsi' . DIRECTORY_SEPARATOR . $id;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat folder upload'], 500);
        }

        $ext = $validation['extension'] ?? 'jpg';
        $safe = 'foto_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $abs = $dir . DIRECTORY_SEPARATOR . $safe;
        $file->moveTo($abs);

        $this->deleteFotoFile($row);

        $rel = 'uploads/porsi/' . $id . '/' . $safe;
        $upd = $this->db->prepare(
            'UPDATE porsi
             SET foto_nama = ?, foto_simpan = ?, foto_path = ?, foto_tipe = ?, foto_ukuran = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND sppg_id = ?'
        );
        $upd->execute([
            $file->getClientFilename() ?: $safe,
            $safe,
            $rel,
            $validation['mime'] ?? $file->getClientMediaType(),
            (int) ($validation['size'] ?? $file->getSize()),
            $id,
            $sppgId,
        ]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Foto diunggah',
            'data' => $this->find($id, $sppgId),
        ]);
    }

    /** DELETE /porsi/{id}/foto */
    public function deleteFoto(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus foto'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $row = $this->find($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan porsi tidak ditemukan'], 404);
        }

        $this->deleteFotoFile($row);
        $upd = $this->db->prepare(
            'UPDATE porsi
             SET foto_nama = NULL, foto_simpan = NULL, foto_path = NULL, foto_tipe = NULL, foto_ukuran = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND sppg_id = ?'
        );
        $upd->execute([$id, $sppgId]);

        return $this->json($response, [
            'success' => true,
            'message' => 'Foto dihapus',
            'data' => $this->find($id, $sppgId),
        ]);
    }

    /** GET /porsi/{id}/foto */
    public function downloadFoto(Request $request, Response $response, array $args): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $row = $this->find($id, $sppgId);
        if (!$row || empty($row['foto_path'])) {
            return $this->json($response, ['success' => false, 'message' => 'Foto tidak ditemukan'], 404);
        }

        $candidate = $this->uploadsBase . DIRECTORY_SEPARATOR . 'porsi' . DIRECTORY_SEPARATOR . $id . DIRECTORY_SEPARATOR . ($row['foto_simpan'] ?? '');
        $abs = is_file($candidate) ? $candidate : '';
        if ($abs === '' && !empty($row['foto_path'])) {
            $rel = (string) $row['foto_path'];
            if (str_starts_with($rel, 'uploads/')) {
                $rel = substr($rel, strlen('uploads/'));
            }
            $try = $this->uploadsBase . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rel);
            if (is_file($try)) {
                $abs = $try;
            }
        }

        $realBase = realpath($this->uploadsBase);
        $realFile = $abs !== '' ? realpath($abs) : false;
        if ($realBase === false || $realFile === false || !str_starts_with($realFile, $realBase) || !is_file($realFile)) {
            return $this->json($response, ['success' => false, 'message' => 'File foto tidak ada di server'], 404);
        }

        $contents = file_get_contents($realFile);
        if ($contents === false) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal membaca foto'], 500);
        }

        $mime = (string) ($row['foto_tipe'] ?: 'application/octet-stream');
        $name = (string) ($row['foto_nama'] ?: basename($realFile));
        $response->getBody()->write($contents);

        return $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Content-Disposition', 'inline; filename="' . str_replace('"', '', $name) . '"')
            ->withHeader('Cache-Control', 'private, max-age=3600')
            ->withStatus(200);
    }

    private function deleteFotoFile(array $row): void
    {
        $simpan = (string) ($row['foto_simpan'] ?? '');
        $id = (int) ($row['id'] ?? 0);
        if ($simpan === '' || $id <= 0) {
            return;
        }
        $abs = $this->uploadsBase . DIRECTORY_SEPARATOR . 'porsi' . DIRECTORY_SEPARATOR . $id . DIRECTORY_SEPARATOR . $simpan;
        if (is_file($abs)) {
            @unlink($abs);
        }
    }
}
