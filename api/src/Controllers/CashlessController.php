<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * API Cashless (data toko) - akses admin_cashless & super_admin.
 * List toko, serve foto toko (uploads/cashless/), upload foto toko.
 */
class CashlessController
{
    private \PDO $db;
    private string $uploadsBasePath;
    private const MAX_SIZE = 1024 * 1024; // 1 MB
    private const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require dirname(__DIR__, 2) . '/config.php';
        $root = rtrim($config['uploads_base_path'] ?? dirname(__DIR__, 2), '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function getCashlessDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'cashless';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/v2/cashless/toko - List toko (paginated, search). admin_cashless | super_admin.
     */
    public function getTokoList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $page = max(1, (int) ($params['page'] ?? 1));
            $limit = min(100, max(1, (int) ($params['limit'] ?? 20)));
            $search = trim((string) ($params['search'] ?? ''));
            $offset = ($page - 1) * $limit;

            $where = '1=1';
            $bind = [];
            if ($search !== '') {
                $where .= ' AND (p.nama_toko LIKE ? OR p.kode_toko LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
            }

            $sqlCount = "SELECT COUNT(*) FROM cashless___pedagang p WHERE $where";
            $stmtCount = $this->db->prepare($sqlCount);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT p.id, p.nama_toko, p.kode_toko, p.foto_path, p.id_users, p.tanggal_dibuat,
                    u.username AS user_username
                    FROM cashless___pedagang p
                    LEFT JOIN users u ON u.id = p.id_users
                    WHERE $where
                    ORDER BY p.nama_toko ASC
                    LIMIT $limit OFFSET $offset";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $row['id_users'] = $row['id_users'] !== null ? (int) $row['id_users'] : null;
                $list[] = $row;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => $limit > 0 ? (int) ceil($total / $limit) : 0,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getTokoList ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data toko'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/toko - Buat toko baru (tanpa user). Body: nama_toko (wajib), kode_toko (opsional).
     * Jika kode_toko kosong: digenerate yymmdd + urutan 2 digit, contoh 26030101 (26=tahun, 03=bulan, 01=hari, 01=urutan).
     */
    public function createToko(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $namaToko = trim((string) ($data['nama_toko'] ?? ''));
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            if ($namaToko === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'nama_toko wajib diisi'], 400);
            }
            if ($kodeToko === '') {
                $yymmdd = date('ymd');
                $prefix = $yymmdd . '%';
                $stmt = $this->db->prepare(
                    "SELECT COALESCE(MAX(CAST(SUBSTRING(kode_toko, 7, 2) AS UNSIGNED)), 0) + 1 AS next_seq FROM cashless___pedagang WHERE kode_toko LIKE ? AND LENGTH(kode_toko) = 8"
                );
                $stmt->execute([$prefix]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $nextSeq = (int) ($row['next_seq'] ?? 1);
                if ($nextSeq > 99) {
                    $nextSeq = 99;
                }
                $kodeToko = $yymmdd . str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
            }
            $chk = $this->db->prepare('SELECT id FROM cashless___pedagang WHERE kode_toko = ?');
            $chk->execute([$kodeToko]);
            if ($chk->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kode toko sudah dipakai'], 400);
            }
            $ins = $this->db->prepare('INSERT INTO cashless___pedagang (nama_toko, kode_toko, id_users) VALUES (?, ?, NULL)');
            $ins->execute([$namaToko, $kodeToko]);
            $newId = (int) $this->db->lastInsertId();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Toko berhasil ditambahkan',
                'data' => ['id' => $newId, 'nama_toko' => $namaToko, 'kode_toko' => $kodeToko],
            ], 201);
        } catch (\Exception $e) {
            error_log('CashlessController::createToko ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambahkan toko'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/serve-foto?path=uploads/cashless/xxx.jpg - Stream foto toko.
     */
    public function serveFoto(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $path = isset($params['path']) ? trim((string) $params['path']) : '';

            if ($path === '' || preg_match('/\.\./', $path)) {
                return $response->withStatus(400);
            }

            $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
            if (stripos($path, 'uploads') === 0) {
                $path = trim(substr($path, strlen('uploads')), DIRECTORY_SEPARATOR . '/');
            }
            if (strpos($path, 'cashless' . DIRECTORY_SEPARATOR) !== 0 && strpos($path, 'cashless/') !== 0) {
                return $response->withStatus(403);
            }

            $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $path;
            $real = realpath($fullPath);
            if ($real === false || !is_file($real) || strpos($real, $this->uploadsBasePath) !== 0) {
                return $response->withStatus(404);
            }

            $mime = @mime_content_type($real);
            if (!$mime || !preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }

            $mtime = filemtime($real);
            $etag = '"' . md5($real . (string) $mtime . (string) filesize($real)) . '"';
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Cache-Control', 'public, max-age=604800')
                ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $mtime) . ' GMT')
                ->withHeader('ETag', $etag);

            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
                return $response->withStatus(304);
            }

            $response->getBody()->write(file_get_contents($real));
            return $response;
        } catch (\Exception $e) {
            error_log('CashlessController::serveFoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * POST /api/v2/cashless/upload-foto - Upload foto toko. Returns foto_path; frontend then PATCH toko to set it.
     * Body/Form: foto (file), optional pedagang_id - if given, update cashless___pedagang.foto_path directly.
     */
    public function uploadFoto(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->uploadErrorMessage($file->getError()) : 'Tidak ada file foto';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = $file->getClientMediaType();
            if (!in_array($mediaType, self::ALLOWED_TYPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan',
                ], 400);
            }

            if ($file->getSize() > self::MAX_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file maksimal 1 MB',
                ], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = 'toko_' . uniqid('', true) . '.' . $ext;
            $uploadDir = $this->getCashlessDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2]) || !in_array($imageInfo[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) {
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar yang valid',
                ], 400);
            }

            $relativePath = 'uploads/cashless/' . $fileName;
            $data = $request->getParsedBody() ?? [];
            $pedagangId = isset($data['pedagang_id']) ? (int) $data['pedagang_id'] : 0;

            if ($pedagangId > 0) {
                $up = $this->db->prepare('UPDATE cashless___pedagang SET foto_path = ? WHERE id = ?');
                $up->execute([$relativePath, $pedagangId]);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto berhasil diunggah',
                'foto_path' => $relativePath,
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::uploadFoto ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * PUT /api/v2/cashless/toko/{id} - Update toko (nama_toko, kode_toko, foto_path). admin_cashless | super_admin.
     */
    public function updateToko(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID toko tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $namaToko = isset($data['nama_toko']) ? trim((string) $data['nama_toko']) : null;
            $kodeToko = isset($data['kode_toko']) ? trim((string) $data['kode_toko']) : null;
            $fotoPath = array_key_exists('foto_path', $data) ? (trim((string) $data['foto_path']) ?: null) : null;

            $updates = [];
            $bind = [];
            if ($namaToko !== null) {
                $updates[] = 'nama_toko = ?';
                $bind[] = $namaToko;
            }
            if ($kodeToko !== null) {
                $chk = $this->db->prepare('SELECT id FROM cashless___pedagang WHERE kode_toko = ? AND id != ?');
                $chk->execute([$kodeToko, $id]);
                if ($chk->fetch()) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Kode toko sudah dipakai'], 400);
                }
                $updates[] = 'kode_toko = ?';
                $bind[] = $kodeToko;
            }
            if ($fotoPath !== null) {
                $updates[] = 'foto_path = ?';
                $bind[] = $fotoPath;
            }
            if ($updates === []) {
                return $this->jsonResponse($response, ['success' => true, 'message' => 'Tidak ada perubahan'], 200);
            }
            $bind[] = $id;
            $sql = 'UPDATE cashless___pedagang SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Toko tidak ditemukan'], 404);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Toko berhasil diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::updateToko ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui toko'], 500);
        }
    }

    private function uploadErrorMessage(int $code): string
    {
        switch ($code) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'File terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh extension';
            default:
                return 'Error upload';
        }
    }

    /** Kode akun 7 digit: digit pertama 1=ASSET, 2=SANTRI, 3=PEDAGANG, 4=INCOME, 5=EXPENSE, 6=EQUITY. */
    private const CODE_KAS = '1000001';
    private const CODE_FEE_INCOME = '4000001';

    /**
     * Pastikan akun SYSTEM ada: Kas Cashless (ASSET) dan Pendapatan Fee (INCOME). Dipanggil sebelum list/create.
     */
    private function ensureSystemAccount(): void
    {
        $chk = $this->db->prepare("SELECT id FROM cashless___accounts WHERE code IN ('1000', '1000000000000001', ?) LIMIT 1");
        $chk->execute([self::CODE_KAS]);
        if ($chk->fetch()) {
            // Kas sudah ada (kode lama 1000 atau baru CODE_KAS)
        } else {
            $ins = $this->db->prepare("INSERT INTO cashless___accounts (code, name, type, entity_type, entity_id, balance_cached) VALUES (?, 'Kas Cashless', 'ASSET', 'SYSTEM', NULL, 0.00)");
            $ins->execute([self::CODE_KAS]);
        }
        $chkFee = $this->db->prepare("SELECT id FROM cashless___accounts WHERE code IN (?, '4000000000000001') LIMIT 1");
        $chkFee->execute([self::CODE_FEE_INCOME]);
        if (!$chkFee->fetch()) {
            try {
                $insFee = $this->db->prepare("INSERT INTO cashless___accounts (code, name, type, entity_type, entity_id, balance_cached) VALUES (?, 'Pendapatan Fee Cashless', 'INCOME', 'SYSTEM', NULL, 0.00)");
                $insFee->execute([self::CODE_FEE_INCOME]);
            } catch (\Throwable $e) {
                // Tipe INCOME belum ada (migration 20250301000005 belum dijalankan)
            }
        }
    }

    /**
     * GET /api/v2/cashless/accounts - Daftar akun wallet (cashless___accounts). Filter: entity_type, search. Pagination.
     */
    public function getAccountsList(Request $request, Response $response): Response
    {
        try {
            $this->ensureSystemAccount();

            $params = $request->getQueryParams();
            $page = max(1, (int) ($params['page'] ?? 1));
            $limit = min(100, max(1, (int) ($params['limit'] ?? 20)));
            $entityType = trim((string) ($params['entity_type'] ?? ''));
            $search = trim((string) ($params['search'] ?? ''));
            $offset = ($page - 1) * $limit;

            $where = ['1=1'];
            $bind = [];
            if ($entityType !== '' && in_array($entityType, ['SYSTEM', 'SANTRI', 'PEDAGANG'], true)) {
                $where[] = 'a.entity_type = ?';
                $bind[] = $entityType;
            }
            if ($search !== '') {
                $where[] = '(a.code LIKE ? OR a.name LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
            }

            $sqlCount = "SELECT COUNT(*) FROM cashless___accounts a WHERE " . implode(' AND ', $where);
            $stmtCount = $this->db->prepare($sqlCount);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT a.id, a.code, a.name, a.type, a.entity_type, a.entity_id, a.balance_cached, a.tanggal_update
                    FROM cashless___accounts a
                    WHERE " . implode(' AND ', $where) . "
                    ORDER BY a.code ASC
                    LIMIT $limit OFFSET $offset";
            try {
                $stmtWithCard = $this->db->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cashless___accounts' AND COLUMN_NAME = 'card_uid' LIMIT 1");
                $stmtWithCard->execute();
                if ($stmtWithCard->fetch()) {
                    $sql = "SELECT a.id, a.code, a.name, a.type, a.entity_type, a.entity_id, a.balance_cached, a.card_uid, a.tanggal_update
                            FROM cashless___accounts a
                            WHERE " . implode(' AND ', $where) . "
                            ORDER BY a.code ASC
                            LIMIT $limit OFFSET $offset";
                }
            } catch (\Throwable $e) {
                // Pakai SELECT tanpa card_uid
            }
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $row['entity_id'] = $row['entity_id'] !== null ? (int) $row['entity_id'] : null;
                $row['balance_cached'] = (float) $row['balance_cached'];
                $row['card_uid'] = isset($row['card_uid']) ? trim((string) $row['card_uid']) : null;
                $row['entity_label'] = $row['name'];
                if ($row['entity_type'] === 'SANTRI' && $row['entity_id']) {
                    $s = $this->db->prepare('SELECT nama FROM santri WHERE id = ?');
                    $s->execute([$row['entity_id']]);
                    $r = $s->fetch(\PDO::FETCH_ASSOC);
                    $row['entity_label'] = $r ? ($r['nama'] ?? $row['name']) : $row['name'];
                }
                if ($row['entity_type'] === 'PEDAGANG' && $row['entity_id']) {
                    $p = $this->db->prepare('SELECT nama_toko, kode_toko FROM cashless___pedagang WHERE id = ?');
                    $p->execute([$row['entity_id']]);
                    $r = $p->fetch(\PDO::FETCH_ASSOC);
                    $row['entity_label'] = $r ? ($r['nama_toko'] ?? $row['name']) : $row['name'];
                    $row['kode_toko'] = $r['kode_toko'] ?? null;
                }
                $list[] = $row;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => $limit > 0 ? (int) ceil($total / $limit) : 0,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getAccountsList ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data akun'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/accounts - Buat akun wallet dari toko (PEDAGANG) atau santri (SANTRI).
     * Body: { entity_type: 'PEDAGANG'|'SANTRI', entity_id: number }.
     * Satu entity hanya boleh punya satu akun (duplicate dicek).
     */
    public function createAccount(Request $request, Response $response): Response
    {
        try {
            $this->ensureSystemAccount();

            $data = $request->getParsedBody() ?? [];
            $entityType = trim((string) ($data['entity_type'] ?? ''));
            $entityId = isset($data['entity_id']) ? (int) $data['entity_id'] : 0;

            if (!in_array($entityType, ['PEDAGANG', 'SANTRI'], true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'entity_type harus PEDAGANG atau SANTRI'], 400);
            }
            if ($entityId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'entity_id wajib dan harus positif'], 400);
            }

            $chkExists = $this->db->prepare('SELECT id FROM cashless___accounts WHERE entity_type = ? AND entity_id = ? LIMIT 1');
            $chkExists->execute([$entityType, $entityId]);
            if ($chkExists->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun untuk ' . ($entityType === 'PEDAGANG' ? 'toko' : 'santri') . ' ini sudah ada'], 400);
            }

            $name = '';
            $codePrefix = $entityType === 'PEDAGANG' ? '3' : '2';
            if ($entityType === 'PEDAGANG') {
                $stmt = $this->db->prepare('SELECT id, nama_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
                $stmt->execute([$entityId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Toko tidak ditemukan'], 404);
                }
                $name = 'Wallet: ' . $row['nama_toko'];
            } else {
                $stmt = $this->db->prepare('SELECT id, nama FROM santri WHERE id = ? LIMIT 1');
                $stmt->execute([$entityId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
                }
                $name = 'Wallet: ' . ($row['nama'] ?? 'Santri #' . $entityId);
            }

            $nextCode = $this->getNextAccountCodeVa($codePrefix);
            $ins = $this->db->prepare('INSERT INTO cashless___accounts (code, name, type, entity_type, entity_id, balance_cached) VALUES (?, ?, ?, ?, ?, 0.00)');
            $ins->execute([$nextCode, $name, 'LIABILITY', $entityType, $entityId]);

            $newId = (int) $this->db->lastInsertId();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Akun wallet berhasil dibuat',
                'data' => ['id' => $newId, 'code' => $nextCode, 'name' => $name, 'entity_type' => $entityType, 'entity_id' => $entityId],
            ], 201);
        } catch (\Exception $e) {
            error_log('CashlessController::createAccount ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal membuat akun'], 500);
        }
    }

    /** Generate kode akun 7 digit: prefix 1 digit (2=SANTRI, 3=PEDAGANG) + 6 digit urutan. */
    private function getNextAccountCodeVa(string $prefix): string
    {
        $like = $prefix . '%';
        $defaultMin = $prefix === '3' ? 3000000 : 2000000;
        $stmt = $this->db->prepare("SELECT COALESCE(MAX(CAST(code AS UNSIGNED)), ?) + 1 AS next_code FROM cashless___accounts WHERE code LIKE ? AND LENGTH(code) = 7 AND code REGEXP '^[0-9]+$'");
        $stmt->execute([$defaultMin, $like]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $next = (int) ($row['next_code'] ?? $defaultMin + 1);
        return str_pad((string) min($next, $defaultMin + 999999), 7, '0', STR_PAD_LEFT);
    }

    /**
     * GET /api/v2/cashless/accounts/{id}/card - Data kartu untuk preview/cetak (code, card_uid, name, entity_label).
     */
    public function getAccountCard(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT id, code, name, type, entity_type, entity_id, card_uid FROM cashless___accounts WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun tidak ditemukan'], 404);
            }
            $entityLabel = $row['name'];
            if ($row['entity_type'] === 'SANTRI' && $row['entity_id']) {
                $s = $this->db->prepare('SELECT nama FROM santri WHERE id = ?');
                $s->execute([$row['entity_id']]);
                $r = $s->fetch(\PDO::FETCH_ASSOC);
                $entityLabel = $r ? $r['nama'] : $entityLabel;
            }
            if ($row['entity_type'] === 'PEDAGANG' && $row['entity_id']) {
                $p = $this->db->prepare('SELECT nama_toko FROM cashless___pedagang WHERE id = ?');
                $p->execute([$row['entity_id']]);
                $r = $p->fetch(\PDO::FETCH_ASSOC);
                $entityLabel = $r ? $r['nama_toko'] : $entityLabel;
            }
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'id' => (int) $row['id'],
                    'code' => $row['code'],
                    'name' => $row['name'],
                    'entity_type' => $row['entity_type'],
                    'entity_label' => $entityLabel,
                    'card_uid' => $row['card_uid'] ? trim($row['card_uid']) : null,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getAccountCard ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data kartu'], 500);
        }
    }

    /**
     * PATCH /api/v2/cashless/accounts/{id} - Update akun (card_uid).
     */
    public function updateAccount(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $cardUid = array_key_exists('card_uid', $data) ? trim((string) $data['card_uid']) : null;
            if ($cardUid === '') {
                $cardUid = null;
            }
            $up = $this->db->prepare('UPDATE cashless___accounts SET card_uid = ? WHERE id = ?');
            $up->execute([$cardUid, $id]);
            if ($up->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun tidak ditemukan'], 404);
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Akun berhasil diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::updateAccount ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui akun'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/config - Config cashless (fee transaksi: persen atau nominal tetap).
     * Return: fee_type ('percent'|'fixed'), fee_value (angka), fee_percent (backward compat).
     */
    public function getConfig(Request $request, Response $response): Response
    {
        try {
            $out = ['fee_type' => 'percent', 'fee_value' => 0, 'fee_percent' => 0];
            try {
                $stmt = $this->db->query("SELECT kunci, nilai FROM cashless___config WHERE kunci IN ('fee_type', 'fee_value', 'fee_percent')");
                while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                    if ($row['kunci'] === 'fee_type') {
                        $v = trim((string) ($row['nilai'] ?? ''));
                        $out['fee_type'] = ($v === 'fixed') ? 'fixed' : 'percent';
                    }
                    if ($row['kunci'] === 'fee_value') {
                        $out['fee_value'] = (float) str_replace(',', '.', $row['nilai'] ?? '0');
                    }
                    if ($row['kunci'] === 'fee_percent') {
                        $out['fee_percent'] = (float) str_replace(',', '.', $row['nilai'] ?? '0');
                    }
                }
                if ($out['fee_value'] == 0 && $out['fee_percent'] != 0) {
                    $out['fee_value'] = $out['fee_percent'];
                    $out['fee_type'] = 'percent';
                }
            } catch (\Throwable $e) {
                // Tabel cashless___config belum ada (migration belum dijalankan)
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $out], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getConfig ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil config'], 500);
        }
    }

    /**
     * PUT /api/v2/cashless/config - Update config. Body: { fee_type: 'percent'|'fixed', fee_value: number }.
     * fee_value = persen (0-100) jika fee_type=percent, atau nominal rupiah (>= 0) jika fee_type=fixed.
     */
    public function setConfig(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $feeType = isset($data['fee_type']) ? trim((string) $data['fee_type']) : null;
            $feeValue = isset($data['fee_value']) ? (float) str_replace(',', '.', (string) $data['fee_value']) : null;

            if ($feeType !== null || $feeValue !== null) {
                $type = ($feeType === 'fixed') ? 'fixed' : 'percent';
                $value = $feeValue !== null ? $feeValue : 0;
                if ($type === 'percent' && ($value < 0 || $value > 100)) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Fee persen harus antara 0 dan 100'], 400);
                }
                if ($type === 'fixed' && $value < 0) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Fee nominal tidak boleh negatif'], 400);
                }
                try {
                    $this->db->prepare("INSERT INTO cashless___config (kunci, nilai) VALUES ('fee_type', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)")->execute([$type]);
                    $this->db->prepare("INSERT INTO cashless___config (kunci, nilai) VALUES ('fee_value', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)")->execute([(string) $value]);
                    $this->db->prepare("INSERT INTO cashless___config (kunci, nilai) VALUES ('fee_percent', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)")->execute([$type === 'percent' ? (string) $value : '0']);
                } catch (\Throwable $e) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel config belum tersedia. Jalankan migration cashless terlebih dahulu.'], 503);
                }
            }
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Config berhasil disimpan'], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::setConfig ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan config'], 500);
        }
    }
}
