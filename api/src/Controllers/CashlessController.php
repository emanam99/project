<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CashlessWalletCodeGenerator;

use App\Database;
use App\Helpers\AiAgentUserHelper;
use App\Helpers\CashlessCardTokenHelper;
use App\Helpers\CashlessMaintenanceHelper;
use App\Helpers\CashlessMoneyLimitsHelper;
use App\Helpers\TextSanitizer;
use App\Services\CashlessKartuService;
use App\Services\CashlessPurchaseService;
use App\Services\CashlessReconcileService;
use App\Services\CashlessReversalService;
use App\Services\CashlessStatementService;
use App\Services\CashlessTopUpService;
use App\Services\CashlessWithdrawService;
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

    /** users.id pelaku dari JWT (bukan pengurus.id). */
    private function resolveActorUserId(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }

        return AiAgentUserHelper::resolveUsersId($payload, $this->db);
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
                $where .= ' AND (p.nama_toko LIKE ? OR p.kode_toko LIKE ? OR p.penanggung_jawab_nama LIKE ? OR p.penanggung_jawab_nik LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
            }

            $sqlCount = "SELECT COUNT(*) FROM cashless___pedagang p WHERE $where";
            $stmtCount = $this->db->prepare($sqlCount);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT p.id, p.nama_toko, p.kode_toko, p.foto_path,
                    p.penanggung_jawab_nama, p.penanggung_jawab_nik,
                    p.penanggung_jawab_ktp_path, p.penanggung_jawab_foto_path,
                    p.id_users, p.tanggal_dibuat,
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
     * GET /api/v2/cashless/toko/{id} — detail toko + akun wallet + ringkasan barang.
     */
    public function getTokoDetail(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID toko tidak valid'], 400);
            }

            $stmt = $this->db->prepare(
                "SELECT p.id, p.nama_toko, p.kode_toko, p.foto_path,
                        p.penanggung_jawab_nama, p.penanggung_jawab_nik,
                        p.penanggung_jawab_ktp_path, p.penanggung_jawab_foto_path,
                        p.id_users, p.tanggal_dibuat,
                        u.username AS user_username
                 FROM cashless___pedagang p
                 LEFT JOIN users u ON u.id = p.id_users
                 WHERE p.id = ?
                 LIMIT 1"
            );
            $stmt->execute([$id]);
            $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$toko) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Toko tidak ditemukan'], 404);
            }

            $toko['id'] = (int) $toko['id'];
            $toko['id_users'] = $toko['id_users'] !== null ? (int) $toko['id_users'] : null;

            $accStmt = $this->db->prepare(
                "SELECT id, code, name, balance_cached, tanggal_update
                 FROM cashless___accounts
                 WHERE entity_type = 'PEDAGANG' AND entity_id = ?
                 LIMIT 1"
            );
            $accStmt->execute([$id]);
            $account = $accStmt->fetch(\PDO::FETCH_ASSOC);
            if ($account) {
                $account = [
                    'id' => (int) $account['id'],
                    'code' => $account['code'],
                    'name' => $account['name'],
                    'balance_cached' => (float) $account['balance_cached'],
                    'tanggal_update' => $account['tanggal_update'] ?? null,
                ];
            } else {
                $account = null;
            }

            $countStmt = $this->db->prepare(
                'SELECT COUNT(*) FROM cashless___barang WHERE pedagang_id = ?'
            );
            $countStmt->execute([$id]);
            $barangCount = (int) $countStmt->fetchColumn();

            $barangStmt = $this->db->prepare(
                'SELECT id, kode_barang, nama_barang, harga, stok, aktif, tanggal_dibuat, tanggal_update
                 FROM cashless___barang
                 WHERE pedagang_id = ?
                 ORDER BY tanggal_dibuat DESC, id DESC
                 LIMIT 5'
            );
            $barangStmt->execute([$id]);
            $barangTerbaru = [];
            while ($row = $barangStmt->fetch(\PDO::FETCH_ASSOC)) {
                $barangTerbaru[] = [
                    'id' => (int) $row['id'],
                    'kode_barang' => $row['kode_barang'] ?? '',
                    'nama_barang' => $row['nama_barang'] ?? '',
                    'harga' => (float) $row['harga'],
                    'stok' => (int) ($row['stok'] ?? 0),
                    'aktif' => (int) ($row['aktif'] ?? 1),
                    'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
                    'tanggal_update' => $row['tanggal_update'] ?? null,
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'toko' => $toko,
                    'account' => $account,
                    'has_account' => $account !== null,
                    'barang_count' => $barangCount,
                    'barang_terbaru' => $barangTerbaru,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getTokoDetail ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat detail toko'], 500);
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
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $namaToko = trim((string) ($data['nama_toko'] ?? ''));
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            $pjNama = trim((string) ($data['penanggung_jawab_nama'] ?? ''));
            $pjNik = preg_replace('/\D+/', '', (string) ($data['penanggung_jawab_nik'] ?? ''));
            if ($namaToko === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'nama_toko wajib diisi'], 400);
            }
            if ($pjNik !== '' && strlen($pjNik) !== 16) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'NIK penanggung jawab harus 16 digit'], 400);
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
            $ins = $this->db->prepare(
                'INSERT INTO cashless___pedagang (nama_toko, kode_toko, id_users, penanggung_jawab_nama, penanggung_jawab_nik)
                 VALUES (?, ?, NULL, ?, ?)'
            );
            $ins->execute([
                $namaToko,
                $kodeToko,
                $pjNama !== '' ? $pjNama : null,
                $pjNik !== '' ? $pjNik : null,
            ]);
            $newId = (int) $this->db->lastInsertId();
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Toko berhasil ditambahkan',
                'data' => [
                    'id' => $newId,
                    'nama_toko' => $namaToko,
                    'kode_toko' => $kodeToko,
                    'penanggung_jawab_nama' => $pjNama !== '' ? $pjNama : null,
                    'penanggung_jawab_nik' => $pjNik !== '' ? $pjNik : null,
                ],
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
     * POST /api/v2/cashless/upload-foto - Upload foto toko / penanggung jawab.
     * Form: foto (file), pedagang_id (wajib untuk update DB), upload_type: toko|pj_foto|pj_ktp (default toko).
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

            $data = $request->getParsedBody() ?? [];
            $uploadType = isset($data['upload_type']) ? trim((string) $data['upload_type']) : 'toko';
            $columnMap = [
                'toko' => ['column' => 'foto_path', 'prefix' => 'toko_'],
                'pj_foto' => ['column' => 'penanggung_jawab_foto_path', 'prefix' => 'pj_foto_'],
                'pj_ktp' => ['column' => 'penanggung_jawab_ktp_path', 'prefix' => 'pj_ktp_'],
            ];
            if (!isset($columnMap[$uploadType])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'upload_type tidak valid'], 400);
            }
            $target = $columnMap[$uploadType];

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = $target['prefix'] . uniqid('', true) . '.' . $ext;
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
            $pedagangId = isset($data['pedagang_id']) ? (int) $data['pedagang_id'] : 0;

            if ($pedagangId > 0) {
                $col = $target['column'];
                $up = $this->db->prepare("UPDATE cashless___pedagang SET {$col} = ? WHERE id = ?");
                $up->execute([$relativePath, $pedagangId]);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto berhasil diunggah',
                'foto_path' => $relativePath,
                'upload_type' => $uploadType,
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
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $namaToko = isset($data['nama_toko']) ? trim((string) $data['nama_toko']) : null;
            $kodeToko = isset($data['kode_toko']) ? trim((string) $data['kode_toko']) : null;
            $fotoPath = array_key_exists('foto_path', $data) ? (trim((string) $data['foto_path']) ?: null) : null;
            $pjNama = array_key_exists('penanggung_jawab_nama', $data)
                ? (trim((string) $data['penanggung_jawab_nama']) ?: null)
                : null;
            $pjNik = null;
            $pjNikProvided = array_key_exists('penanggung_jawab_nik', $data);
            if ($pjNikProvided) {
                $pjNikDigits = preg_replace('/\D+/', '', (string) $data['penanggung_jawab_nik']);
                if ($pjNikDigits !== '' && strlen($pjNikDigits) !== 16) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'NIK penanggung jawab harus 16 digit'], 400);
                }
                $pjNik = $pjNikDigits !== '' ? $pjNikDigits : null;
            }

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
            if (array_key_exists('penanggung_jawab_nama', $data)) {
                $updates[] = 'penanggung_jawab_nama = ?';
                $bind[] = $pjNama;
            }
            if (array_key_exists('penanggung_jawab_nik', $data)) {
                $updates[] = 'penanggung_jawab_nik = ?';
                $bind[] = $pjNik;
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
     * GET /api/v2/cashless/ledger-summary — Kas SYSTEM vs total wallet LIABILITY (cek keseimbangan float).
     * Model valid: kas ≈ sum(wallet santri + pedagang) setelah top-up / tarik / belanja / transfer antar wallet.
     */
    public function getLedgerSummary(Request $request, Response $response): Response
    {
        try {
            $this->ensureSystemAccount();

            $stmtKas = $this->db->prepare(
                "SELECT id, code, name, balance_cached
                 FROM cashless___accounts
                 WHERE type = 'ASSET' AND entity_type = 'SYSTEM'
                   AND code IN ('1000', '1000000000000001', ?)
                 ORDER BY id ASC
                 LIMIT 1"
            );
            $stmtKas->execute([self::CODE_KAS]);
            $kasRow = $stmtKas->fetch(\PDO::FETCH_ASSOC);
            $kasBalance = $kasRow ? (float) $kasRow['balance_cached'] : 0.0;

            $stmtWallets = $this->db->query(
                "SELECT
                    COALESCE(SUM(CASE WHEN entity_type = 'SANTRI' THEN balance_cached ELSE 0 END), 0) AS sum_santri,
                    COALESCE(SUM(CASE WHEN entity_type = 'PEDAGANG' THEN balance_cached ELSE 0 END), 0) AS sum_pedagang,
                    COALESCE(SUM(balance_cached), 0) AS sum_total,
                    COUNT(*) AS wallet_count,
                    SUM(CASE WHEN entity_type = 'SANTRI' THEN 1 ELSE 0 END) AS count_santri,
                    SUM(CASE WHEN entity_type = 'PEDAGANG' THEN 1 ELSE 0 END) AS count_pedagang
                 FROM cashless___accounts
                 WHERE type = 'LIABILITY' AND entity_type IN ('SANTRI', 'PEDAGANG')"
            );
            $w = $stmtWallets->fetch(\PDO::FETCH_ASSOC) ?: [];
            $sumSantri = (float) ($w['sum_santri'] ?? 0);
            $sumPedagang = (float) ($w['sum_pedagang'] ?? 0);
            $sumWallet = (float) ($w['sum_total'] ?? 0);

            $feeBalance = 0.0;
            try {
                $stmtFee = $this->db->prepare(
                    "SELECT balance_cached FROM cashless___accounts
                     WHERE type = 'INCOME' AND code IN (?, '4000000000000001')
                     LIMIT 1"
                );
                $stmtFee->execute([self::CODE_FEE_INCOME]);
                $feeBalance = (float) ($stmtFee->fetchColumn() ?: 0);
            } catch (\Throwable $e) {
                $feeBalance = 0.0;
            }

            $selisih = round($kasBalance - $sumWallet, 2);
            $valid = abs($selisih) < 0.02;

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'kas' => [
                        'account_id' => $kasRow ? (int) $kasRow['id'] : null,
                        'code' => $kasRow['code'] ?? self::CODE_KAS,
                        'name' => $kasRow['name'] ?? 'Kas Cashless',
                        'balance' => round($kasBalance, 2),
                    ],
                    'wallet' => [
                        'santri' => round($sumSantri, 2),
                        'pedagang' => round($sumPedagang, 2),
                        'total' => round($sumWallet, 2),
                        'count_santri' => (int) ($w['count_santri'] ?? 0),
                        'count_pedagang' => (int) ($w['count_pedagang'] ?? 0),
                        'count_total' => (int) ($w['wallet_count'] ?? 0),
                    ],
                    'fee_income' => round($feeBalance, 2),
                    'selisih' => $selisih,
                    'valid' => $valid,
                    'valid_hint' => $valid
                        ? 'Kas sistem = total wallet (sistem seimbang).'
                        : 'Kas sistem ≠ total wallet. Periksa jurnal / rekonsiliasi.',
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getLedgerSummary ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat ringkasan ledger'], 500);
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
            $limit = min(500, max(1, (int) ($params['limit'] ?? 20)));
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

            if ($list !== []) {
                $santriIds = [];
                foreach ($list as $r) {
                    if (($r['entity_type'] ?? '') === 'SANTRI' && !empty($r['entity_id'])) {
                        $santriIds[] = (int) $r['entity_id'];
                    }
                }
                if ($santriIds !== []) {
                    try {
                        $kartuSvc = new CashlessKartuService($this->db);
                        $uniqueIds = array_values(array_unique($santriIds));
                        $flags = $kartuSvc->activeFlagsBySantriIds($uniqueIds);
                        $printed = $kartuSvc->printedFlagsBySantriIds($uniqueIds);
                        $cmDetail = $kartuSvc->cmMahromDetailBySantriIds($uniqueIds);
                        $pendingVal = $kartuSvc->pendingValidationBySantriIds($uniqueIds);
                        foreach ($list as &$r) {
                            if (($r['entity_type'] ?? '') === 'SANTRI' && !empty($r['entity_id'])) {
                                $sid = (int) $r['entity_id'];
                                $r['kartu_aktif'] = $flags[$sid] ?? ['CS' => false, 'CM' => false];
                                $r['kartu_dicetak'] = $printed[$sid] ?? ['CS' => false, 'CM' => false];
                                $r['kartu_cm_mahrom'] = $cmDetail[$sid] ?? [];
                                $pv = $pendingVal[$sid] ?? ['flags' => ['CS' => false, 'CM' => false], 'slots' => []];
                                $r['kartu_perlu_validasi'] = $pv['flags'];
                                $r['kartu_pending_validasi'] = $pv['slots'];
                            }
                        }
                        unset($r);
                    } catch (\Throwable $e) {
                        // tabel kartu belum ada
                    }
                }
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

            $codeGenerator = new CashlessWalletCodeGenerator($this->db);
            $nextCode = null;
            $lastError = null;
            for ($attempt = 0; $attempt < 5; $attempt++) {
                try {
                    $candidate = $codeGenerator->generateUnique();
                    $ins = $this->db->prepare(
                        'INSERT INTO cashless___accounts (code, name, type, entity_type, entity_id, balance_cached) VALUES (?, ?, ?, ?, ?, 0.00)'
                    );
                    $ins->execute([$candidate, $name, 'LIABILITY', $entityType, $entityId]);
                    $nextCode = $candidate;
                    break;
                } catch (\PDOException $e) {
                    $lastError = $e;
                    if (!$this->isDuplicateWalletCodeError($e)) {
                        throw $e;
                    }
                }
            }
            if ($nextCode === null) {
                throw $lastError ?? new \RuntimeException('Gagal menghasilkan kode wallet unik');
            }

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

    private function isDuplicateWalletCodeError(\PDOException $e): bool
    {
        $msg = strtolower($e->getMessage());
        return str_contains($msg, 'duplicate') || str_contains($msg, 'unique_code') || (string) $e->getCode() === '23000';
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
            $entityNis = null;
            if ($row['entity_type'] === 'SANTRI' && $row['entity_id']) {
                $s = $this->db->prepare('SELECT nama, nis FROM santri WHERE id = ?');
                $s->execute([$row['entity_id']]);
                $r = $s->fetch(\PDO::FETCH_ASSOC);
                if ($r) {
                    $entityLabel = $r['nama'];
                    $entityNis = isset($r['nis']) && trim((string) $r['nis']) !== '' ? trim((string) $r['nis']) : null;
                }
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
                    'entity_nis' => $entityNis,
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
            $out = [
                'fee_type' => 'percent',
                'fee_value' => 0,
                'fee_percent' => 0,
                'batas_harian_global' => 0,
                'topup_max_per_tx' => CashlessMoneyLimitsHelper::DEFAULT_TOPUP_MAX,
                'withdraw_max_per_tx' => CashlessMoneyLimitsHelper::DEFAULT_WITHDRAW_MAX,
                'transfer_max_per_tx' => CashlessMoneyLimitsHelper::DEFAULT_TRANSFER_MAX,
                'wallet_saldo_max' => CashlessMoneyLimitsHelper::DEFAULT_WALLET_SALDO_MAX,
                'transfer_daily_max' => CashlessMoneyLimitsHelper::DEFAULT_TRANSFER_DAILY_MAX,
                'duplicate_window_sec' => CashlessMoneyLimitsHelper::DEFAULT_DUPLICATE_WINDOW_SEC,
            ];
            try {
                $stmt = $this->db->query(
                    "SELECT kunci, nilai FROM cashless___config WHERE kunci IN (
                        'fee_type', 'fee_value', 'fee_percent', 'batas_harian_global',
                        'topup_max_per_tx','withdraw_max_per_tx','transfer_max_per_tx',
                        'wallet_saldo_max','transfer_daily_max','duplicate_window_sec'
                    )"
                );
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
                    if ($row['kunci'] === 'batas_harian_global') {
                        $out['batas_harian_global'] = max(0, (float) str_replace(',', '.', $row['nilai'] ?? '0'));
                    }
                    foreach (
                        [
                            'topup_max_per_tx',
                            'withdraw_max_per_tx',
                            'transfer_max_per_tx',
                            'wallet_saldo_max',
                            'transfer_daily_max',
                        ] as $moneyKey
                    ) {
                        if ($row['kunci'] === $moneyKey) {
                            $mv = (float) str_replace(',', '.', $row['nilai'] ?? '0');
                            if ($mv > 0) {
                                $out[$moneyKey] = $mv;
                            }
                        }
                    }
                    if ($row['kunci'] === 'duplicate_window_sec') {
                        $out['duplicate_window_sec'] = max(5, (int) round((float) str_replace(',', '.', $row['nilai'] ?? '30')));
                    }
                }
                if ($out['fee_value'] == 0 && $out['fee_percent'] != 0) {
                    $out['fee_value'] = $out['fee_percent'];
                    $out['fee_type'] = 'percent';
                }
            } catch (\Throwable $e) {
                // Tabel cashless___config belum ada (migration belum dijalankan)
            }
            $out['card_secret_version'] = CashlessCardTokenHelper::getSecretVersion();
            $out['maintenance'] = CashlessMaintenanceHelper::getSnapshot($this->db);
            return $this->jsonResponse($response, ['success' => true, 'data' => $out], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getConfig ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil config'], 500);
        }
    }

    /**
     * PUT /api/v2/cashless/config - Update config.
     * Body: fee_type/fee_value dan/atau batas_harian_global (Rp, 0 = nonaktif).
     */
    public function setConfig(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $feeType = isset($data['fee_type']) ? trim((string) $data['fee_type']) : null;
            $feeValue = isset($data['fee_value']) ? (float) str_replace(',', '.', (string) $data['fee_value']) : null;
            $hasBatasGlobal = array_key_exists('batas_harian_global', $data);
            $moneyKeys = [
                'topup_max_per_tx',
                'withdraw_max_per_tx',
                'transfer_max_per_tx',
                'wallet_saldo_max',
                'transfer_daily_max',
                'duplicate_window_sec',
            ];
            $hasMoneyLimits = false;
            foreach ($moneyKeys as $mk) {
                if (array_key_exists($mk, $data)) {
                    $hasMoneyLimits = true;
                    break;
                }
            }

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

            if ($hasBatasGlobal) {
                $batas = (float) str_replace(',', '.', (string) ($data['batas_harian_global'] ?? 0));
                if ($batas < 0) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Batas harian tidak boleh negatif'], 400);
                }
                try {
                    $this->db->prepare(
                        "INSERT INTO cashless___config (kunci, nilai) VALUES ('batas_harian_global', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)"
                    )->execute([(string) $batas]);
                } catch (\Throwable $e) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel config belum tersedia. Jalankan migration cashless terlebih dahulu.'], 503);
                }
            }

            if ($hasMoneyLimits) {
                try {
                    $upsert = $this->db->prepare(
                        'INSERT INTO cashless___config (kunci, nilai) VALUES (?, ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)'
                    );
                    foreach (['topup_max_per_tx', 'withdraw_max_per_tx', 'transfer_max_per_tx', 'wallet_saldo_max', 'transfer_daily_max'] as $mk) {
                        if (!array_key_exists($mk, $data)) {
                            continue;
                        }
                        $val = (float) str_replace(',', '.', (string) $data[$mk]);
                        if ($val < 1000) {
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Batas uang minimal Rp 1.000 (' . $mk . ')',
                            ], 400);
                        }
                        $upsert->execute([$mk, (string) $val]);
                    }
                    if (array_key_exists('duplicate_window_sec', $data)) {
                        $sec = (int) round((float) str_replace(',', '.', (string) $data['duplicate_window_sec']));
                        if ($sec < 5 || $sec > 600) {
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Jendela anti-duplikat harus 5–600 detik',
                            ], 400);
                        }
                        $upsert->execute(['duplicate_window_sec', (string) $sec]);
                    }
                } catch (\Throwable $e) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel config belum tersedia. Jalankan migration cashless terlebih dahulu.'], 503);
                }
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Config disimpan'], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::setConfig ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan config'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/accounts/{id}/batas-harian — batas belanja harian wallet santri.
     */
    public function getAccountBatasHarian(Request $request, Response $response, array $args): Response
    {
        try {
            $accountId = (int) ($args['id'] ?? 0);
            $resolved = $this->resolveSantriIdFromAccount($accountId);
            if ($resolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun wallet santri tidak ditemukan'], 404);
            }
            $payload = $this->buildBatasHarianPayload($resolved);
            return $this->jsonResponse($response, ['success' => true, 'data' => $payload], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getAccountBatasHarian ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil batas harian'], 500);
        }
    }

    /**
     * PUT /api/v2/cashless/accounts/{id}/batas-harian
     * Body: { aktif: bool, batas_per_hari: number }
     */
    public function setAccountBatasHarian(Request $request, Response $response, array $args): Response
    {
        try {
            $accountId = (int) ($args['id'] ?? 0);
            $resolved = $this->resolveSantriIdFromAccount($accountId);
            if ($resolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akun wallet santri tidak ditemukan'], 404);
            }

            $data = $request->getParsedBody() ?? [];
            $aktif = !empty($data['aktif']);
            $batas = (float) str_replace(',', '.', (string) ($data['batas_per_hari'] ?? 0));
            if ($batas < 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Batas harian tidak boleh negatif'], 400);
            }
            if ($aktif && $batas <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Isi batas per hari (Rp) jika mengaktifkan batas khusus'], 400);
            }

            $rawUserId = $request->getAttribute('user_id');
            $userId = $rawUserId !== null ? (int) $rawUserId : null;

            try {
                $stmt = $this->db->prepare(
                    'INSERT INTO cashless___batas_harian_santri (santri_id, batas_per_hari, aktif, updated_by)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE batas_per_hari = VALUES(batas_per_hari), aktif = VALUES(aktif), updated_by = VALUES(updated_by)'
                );
                $stmt->execute([
                    $resolved,
                    $batas,
                    $aktif ? 1 : 0,
                    $userId > 0 ? $userId : null,
                ]);
            } catch (\Throwable $e) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel batas harian belum tersedia. Jalankan migration cashless terlebih dahulu.',
                ], 503);
            }

            $payload = $this->buildBatasHarianPayload($resolved);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Batas harian wallet disimpan',
                'data' => $payload,
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::setAccountBatasHarian ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan batas harian'], 500);
        }
    }

    /**
     * @return int|null santri_id
     */
    private function resolveSantriIdFromAccount(int $accountId): ?int
    {
        if ($accountId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare(
            "SELECT entity_id FROM cashless___accounts WHERE id = ? AND entity_type = 'SANTRI' LIMIT 1"
        );
        $stmt->execute([$accountId]);
        $entityId = $stmt->fetchColumn();
        if ($entityId === false || $entityId === null) {
            return null;
        }
        $santriId = (int) $entityId;
        return $santriId > 0 ? $santriId : null;
    }

    /**
     * @return array{santri_id:int,aktif:bool,batas_per_hari:float,batas_global:float,batas_efektif:float,terpakai_hari_ini:float}
     */
    private function buildBatasHarianPayload(int $santriId): array
    {
        $aktif = false;
        $batasPerHari = 0.0;
        try {
            $stmt = $this->db->prepare(
                'SELECT batas_per_hari, aktif FROM cashless___batas_harian_santri WHERE santri_id = ? LIMIT 1'
            );
            $stmt->execute([$santriId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                $aktif = (int) ($row['aktif'] ?? 0) === 1;
                $batasPerHari = (float) ($row['batas_per_hari'] ?? 0);
            }
        } catch (\Throwable $e) {
            // tabel belum ada
        }

        $batasGlobal = 0.0;
        try {
            $stmt = $this->db->prepare(
                "SELECT nilai FROM cashless___config WHERE kunci = 'batas_harian_global' LIMIT 1"
            );
            $stmt->execute();
            $v = $stmt->fetchColumn();
            if ($v !== false && $v !== null) {
                $batasGlobal = max(0.0, (float) str_replace(',', '.', (string) $v));
            }
        } catch (\Throwable $e) {
            // ignore
        }

        $batasEfektif = 0.0;
        if ($aktif && $batasPerHari > 0) {
            $batasEfektif = $batasPerHari;
        } elseif ($batasGlobal > 0) {
            $batasEfektif = $batasGlobal;
        }

        $terpakai = 0.0;
        try {
            $sum = $this->db->prepare(
                'SELECT COALESCE(SUM(nominal), 0) FROM cashless___transaksi_detail
                 WHERE santri_id = ? AND DATE(transaksi_at) = CURDATE()'
            );
            $sum->execute([$santriId]);
            $terpakai = (float) $sum->fetchColumn();
        } catch (\Throwable $e) {
            // ignore
        }

        return [
            'santri_id' => $santriId,
            'aktif' => $aktif,
            'batas_per_hari' => $batasPerHari,
            'batas_global' => $batasGlobal,
            'batas_efektif' => $batasEfektif,
            'terpakai_hari_ini' => $terpakai,
        ];
    }

    /**
     * POST /api/v2/cashless/kartu/santri/{santriId}/issue - Terbitkan satu kartu (CS atau CM).
     * Body: { "card_type": "SANTRI"|"MAHROM", "mahrom_id"?: number }
     */
    public function issueKartuSingle(Request $request, Response $response, array $args): Response
    {
        try {
            $santriId = (int) ($args['santriId'] ?? 0);
            if ($santriId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $cardType = isset($data['card_type']) ? trim((string) $data['card_type']) : '';
            if ($cardType === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'card_type wajib'], 400);
            }
            $mahromId = isset($data['mahrom_id']) ? (int) $data['mahrom_id'] : null;
            if ($mahromId !== null && $mahromId <= 0) {
                $mahromId = null;
            }
            $rawUserId = $request->getAttribute('user_id');
            $userId = $rawUserId !== null ? (int) $rawUserId : null;
            $svc = new CashlessKartuService($this->db);
            $result = $svc->issueSingle($santriId, $cardType, $userId > 0 ? $userId : null, $mahromId);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::issueKartuSingle ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menerbitkan kartu'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/kartu/issue-bundle - Terbitkan CS+CM untuk santri (wajib mahrom_id untuk CM).
     * Body: { santri_id: number, mahrom_id: number }
     */
    public function issueKartuBundle(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $santriId = isset($data['santri_id']) ? (int) $data['santri_id'] : 0;
            if ($santriId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id wajib'], 400);
            }
            $mahromId = isset($data['mahrom_id']) ? (int) $data['mahrom_id'] : null;
            if ($mahromId !== null && $mahromId <= 0) {
                $mahromId = null;
            }
            $rawUserId = $request->getAttribute('user_id');
            $userId = $rawUserId !== null ? (int) $rawUserId : null;
            $svc = new CashlessKartuService($this->db);
            $result = $svc->issueBundle($santriId, $userId > 0 ? $userId : null, $mahromId);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::issueKartuBundle ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menerbitkan kartu'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/kartu/santri/{santriId} - Status kartu aktif (tanpa token).
     */
    public function listKartuBySantri(Request $request, Response $response, array $args): Response
    {
        try {
            $santriId = (int) ($args['santriId'] ?? 0);
            if ($santriId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id tidak valid'], 400);
            }
            $svc = new CashlessKartuService($this->db);
            $mahromSvc = new \App\Services\MahromService($this->db);
            $cards = $svc->listActiveBySantri($santriId);
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $cards,
                'mahrom_options' => $mahromSvc->listBySantri($santriId),
                'secret_version' => CashlessCardTokenHelper::getSecretVersion(),
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::listKartuBySantri ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat kartu'], 500);
        }
    }

    /**
     * PUT /api/v2/cashless/kartu/{id}/pin — Set/ganti PIN 6 digit kartu santri (CS).
     * Body: { "pin": "123456" }
     */
    public function setKartuPin(Request $request, Response $response, array $args): Response
    {
        try {
            $kartuId = (int) ($args['id'] ?? 0);
            if ($kartuId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID kartu tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $pin = isset($data['pin']) ? (string) $data['pin'] : '';
            $svc = new CashlessPurchaseService($this->db);
            $result = $svc->setKartuPin($kartuId, $pin);
            $status = ($result['success'] ?? false) ? 200 : 400;
            return $this->jsonResponse($response, $result, $status);
        } catch (\Exception $e) {
            error_log('CashlessController::setKartuPin ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan PIN'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/kartu/santri/{santriId}/mark-printed - Tandai kartu sudah dicetak.
     * Body: { "card_type": "SANTRI"|"MAHROM"|"all" }
     */
    public function markKartuPrinted(Request $request, Response $response, array $args): Response
    {
        try {
            $santriId = (int) ($args['santriId'] ?? 0);
            if ($santriId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $cardType = isset($data['card_type']) ? trim((string) $data['card_type']) : 'all';
            $mahromId = isset($data['mahrom_id']) ? (int) $data['mahrom_id'] : null;
            if ($mahromId !== null && $mahromId <= 0) {
                $mahromId = null;
            }
            $kartuId = isset($data['kartu_id']) ? (int) $data['kartu_id'] : null;
            if ($kartuId !== null && $kartuId <= 0) {
                $kartuId = null;
            }
            $rawUserId = $request->getAttribute('user_id');
            $userId = $rawUserId !== null ? (int) $rawUserId : null;
            $svc = new CashlessKartuService($this->db);
            $result = $svc->markPrinted($santriId, $cardType, $userId > 0 ? $userId : null, $mahromId, $kartuId);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::markKartuPrinted ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan status cetak'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/kartu/validate - Aktifkan kartu pending setelah scan QR post-cetak.
     * Body: { "token": string, "kartu_id"?: number }
     */
    public function validateKartuPrinted(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $token = isset($data['token']) ? trim((string) $data['token']) : '';
            if ($token === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'token QR wajib'], 400);
            }
            $kartuId = isset($data['kartu_id']) ? (int) $data['kartu_id'] : null;
            if ($kartuId !== null && $kartuId <= 0) {
                $kartuId = null;
            }
            $rawUserId = $request->getAttribute('user_id');
            $userId = $rawUserId !== null ? (int) $rawUserId : null;
            $svc = new CashlessKartuService($this->db);
            $result = $svc->validateAfterPrint($token, $userId > 0 ? $userId : null, $kartuId);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::validateKartuPrinted ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memvalidasi kartu'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/maintenance/start - Hentikan scan kartu sementara.
     * Body: { duration_minutes?: 5|10|30|60|1440 } — kosong/null = hingga diaktifkan kembali manual.
     */
    public function startMaintenance(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $duration = null;
            if (array_key_exists('duration_minutes', $data) && $data['duration_minutes'] !== null && $data['duration_minutes'] !== '') {
                $duration = (int) $data['duration_minutes'];
            }
            $snapshot = CashlessMaintenanceHelper::start($duration, $this->db);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Transaksi cashless dihentikan sementara. Scan kartu tidak tersedia.',
                'maintenance' => $snapshot,
            ], 200);
        } catch (\InvalidArgumentException $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Exception $e) {
            error_log('CashlessController::startMaintenance ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengaktifkan mode pemeliharaan'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/maintenance/stop - Aktifkan kembali scan kartu.
     */
    public function stopMaintenance(Request $request, Response $response): Response
    {
        try {
            CashlessMaintenanceHelper::stop($this->db);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Transaksi cashless kembali aktif.',
                'maintenance' => CashlessMaintenanceHelper::getSnapshot($this->db),
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::stopMaintenance ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menonaktifkan mode pemeliharaan'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/kartu/invalidate-all - Putar secret kartu: hapus semua kartu, naikkan card_secret_version.
     * Wajib setelah JWT_SECRET diganti; kartu lama tidak bisa dipakai lagi.
     */
    public function invalidateAllKartu(Request $request, Response $response): Response
    {
        try {
            $next = CashlessCardTokenHelper::bumpSecretVersion($this->db);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Semua kartu lama telah dihapus. Secret versi ' . $next . '. Terbitkan ulang kartu untuk setiap santri.',
                'secret_version' => $next,
            ], 200);
        } catch (\Exception $e) {
            error_log('CashlessController::invalidateAllKartu ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memutar secret kartu'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/topup - Top-up wallet santri atau toko.
     * Body: { santri_id? | pedagang_id?/toko_id?, nominal, referensi?, metode?, source_account_id? }
     * source_account_id hanya untuk transfer P2P ke santri.
     */
    public function topUp(Request $request, Response $response): Response
    {
        try {
            $this->ensureSystemAccount();
            $data = $request->getParsedBody() ?? [];
            $santriId = isset($data['santri_id']) ? (int) $data['santri_id'] : 0;
            $pedagangId = isset($data['pedagang_id']) ? (int) $data['pedagang_id'] : 0;
            if ($pedagangId <= 0 && isset($data['toko_id'])) {
                $pedagangId = (int) $data['toko_id'];
            }
            $nominal = isset($data['nominal']) ? (float) $data['nominal'] : 0;
            $referensi = isset($data['referensi']) ? trim((string) $data['referensi']) : null;
            $metode = isset($data['metode']) ? trim((string) $data['metode']) : 'tunai';
            $sourceAccountId = isset($data['source_account_id']) ? (int) $data['source_account_id'] : null;
            if ($sourceAccountId !== null && $sourceAccountId <= 0) {
                $sourceAccountId = null;
            }

            $hasSantri = $santriId > 0;
            $hasToko = $pedagangId > 0;
            if ($hasSantri === $hasToko) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi salah satu: santri_id atau pedagang_id (toko_id)',
                ], 400);
            }

            $actorUserId = $this->resolveActorUserId($request);
            $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
            $entityPart = $hasSantri ? ('S:' . $santriId) : ('T:' . $pedagangId);
            if ($sourceAccountId) {
                $entityPart .= ':src:' . $sourceAccountId;
            }
            $idemKey = CashlessMoneyLimitsHelper::resolveIdempotencyKey(
                isset($data['idempotency_key']) ? (string) $data['idempotency_key'] : null,
                'TOPUP',
                $entityPart,
                $nominal,
                $actorUserId,
                $limits['duplicate_window_sec']
            );
            $claim = CashlessMoneyLimitsHelper::claimIdempotency($this->db, $idemKey, 'TOPUP', $actorUserId);
            if (!($claim['claimed'] ?? false) && isset($claim['cached'])) {
                return $this->jsonResponse($response, $claim['cached']['body'], (int) $claim['cached']['http']);
            }

            $svc = new CashlessTopUpService($this->db);

            if ($hasToko) {
                if ($sourceAccountId !== null) {
                    $fail = [
                        'success' => false,
                        'message' => 'Transfer antar wallet ke toko belum didukung. Gunakan top-up kas.',
                    ];
                    CashlessMoneyLimitsHelper::completeIdempotency($this->db, $idemKey, $fail, 400);
                    return $this->jsonResponse($response, $fail, 400);
                }
                $result = $svc->topUpPedagang($pedagangId, $nominal, $referensi, $metode, $actorUserId);
            } else {
                $result = $svc->topUp(
                    $santriId,
                    $nominal,
                    $referensi,
                    $metode,
                    $actorUserId,
                    $sourceAccountId
                );
            }
            $status = ($result['success'] ?? false) ? 200 : 400;
            $journalId = isset($result['data']['journal_id']) ? (int) $result['data']['journal_id'] : null;
            CashlessMoneyLimitsHelper::completeIdempotency($this->db, $idemKey, $result, $status, $journalId);
            return $this->jsonResponse($response, $result, $status);
        } catch (\Exception $e) {
            error_log('CashlessController::topUp ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal melakukan top-up'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/topup/history?santri_id=|&pedagang_id=|&toko_id=&limit=
     */
    public function getTopUpHistory(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $santriId = isset($params['santri_id']) ? (int) $params['santri_id'] : 0;
            $pedagangId = isset($params['pedagang_id']) ? (int) $params['pedagang_id'] : 0;
            if ($pedagangId <= 0 && isset($params['toko_id'])) {
                $pedagangId = (int) $params['toko_id'];
            }
            $limit = isset($params['limit']) ? (int) $params['limit'] : 50;

            $hasSantri = $santriId > 0;
            $hasToko = $pedagangId > 0;
            if ($hasSantri === $hasToko) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi salah satu: santri_id atau pedagang_id (toko_id)',
                ], 400);
            }

            $svc = new CashlessTopUpService($this->db);
            $result = $hasSantri
                ? $svc->listHistory($santriId, $limit)
                : $svc->listHistoryPedagang($pedagangId, $limit);
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getTopUpHistory ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat riwayat top-up'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/withdraw — Tarik tunai dari wallet (santri atau toko).
     * Body: { santri_id? | pedagang_id?, nominal, referensi?, metode? }
     * Jurnal WITHDRAWAL: debit wallet, kredit Kas SYSTEM.
     */
    public function withdraw(Request $request, Response $response): Response
    {
        try {
            $this->ensureSystemAccount();
            $data = $request->getParsedBody() ?? [];
            $santriId = isset($data['santri_id']) ? (int) $data['santri_id'] : 0;
            $pedagangId = isset($data['pedagang_id']) ? (int) $data['pedagang_id'] : 0;
            if ($pedagangId <= 0 && isset($data['toko_id'])) {
                $pedagangId = (int) $data['toko_id'];
            }
            $nominal = isset($data['nominal']) ? (float) $data['nominal'] : 0;
            $referensi = isset($data['referensi']) ? trim((string) $data['referensi']) : null;
            $metode = isset($data['metode']) ? trim((string) $data['metode']) : 'tunai';

            $hasSantri = $santriId > 0;
            $hasToko = $pedagangId > 0;
            if ($hasSantri === $hasToko) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi salah satu: santri_id atau pedagang_id (toko_id)',
                ], 400);
            }

            $actorUserId = $this->resolveActorUserId($request);
            $limits = CashlessMoneyLimitsHelper::getLimits($this->db);
            $entityPart = $hasSantri ? ('S:' . $santriId) : ('T:' . $pedagangId);
            $idemKey = CashlessMoneyLimitsHelper::resolveIdempotencyKey(
                isset($data['idempotency_key']) ? (string) $data['idempotency_key'] : null,
                'WITHDRAW',
                $entityPart,
                $nominal,
                $actorUserId,
                $limits['duplicate_window_sec']
            );
            $claim = CashlessMoneyLimitsHelper::claimIdempotency($this->db, $idemKey, 'WITHDRAW', $actorUserId);
            if (!($claim['claimed'] ?? false) && isset($claim['cached'])) {
                return $this->jsonResponse($response, $claim['cached']['body'], (int) $claim['cached']['http']);
            }

            $svc = new CashlessWithdrawService($this->db);
            $result = $hasSantri
                ? $svc->withdrawSantri($santriId, $nominal, $referensi, $metode, $actorUserId)
                : $svc->withdrawPedagang($pedagangId, $nominal, $referensi, $metode, $actorUserId);
            $status = ($result['success'] ?? false) ? 200 : 400;
            $journalId = isset($result['data']['journal_id']) ? (int) $result['data']['journal_id'] : null;
            CashlessMoneyLimitsHelper::completeIdempotency($this->db, $idemKey, $result, $status, $journalId);
            return $this->jsonResponse($response, $result, $status);
        } catch (\Exception $e) {
            error_log('CashlessController::withdraw ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal melakukan tarik tunai'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/withdraw/history?santri_id=|&pedagang_id=|&toko_id=&limit=
     */
    public function getWithdrawHistory(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $santriId = isset($params['santri_id']) ? (int) $params['santri_id'] : 0;
            $pedagangId = isset($params['pedagang_id']) ? (int) $params['pedagang_id'] : 0;
            if ($pedagangId <= 0 && isset($params['toko_id'])) {
                $pedagangId = (int) $params['toko_id'];
            }
            $limit = isset($params['limit']) ? (int) $params['limit'] : 50;

            $hasSantri = $santriId > 0;
            $hasToko = $pedagangId > 0;
            if ($hasSantri === $hasToko) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi salah satu: santri_id atau pedagang_id (toko_id)',
                ], 400);
            }

            $svc = new CashlessWithdrawService($this->db);
            $result = $hasSantri
                ? $svc->listHistorySantri($santriId, $limit)
                : $svc->listHistoryPedagang($pedagangId, $limit);
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getWithdrawHistory ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat riwayat tarik tunai'], 500);
        }
    }

    /**
     * GET /api/v2/cashless/statement/history — Riwayat mutasi wallet (top-up, tarik, belanja, transfer).
     * Query: santri_id | pedagang_id (toko_id), limit
     */
    public function getStatementHistory(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $santriId = isset($params['santri_id']) ? (int) $params['santri_id'] : 0;
            $pedagangId = isset($params['pedagang_id']) ? (int) $params['pedagang_id'] : 0;
            if ($pedagangId <= 0 && isset($params['toko_id'])) {
                $pedagangId = (int) $params['toko_id'];
            }
            $limit = isset($params['limit']) ? (int) $params['limit'] : 50;

            $hasSantri = $santriId > 0;
            $hasToko = $pedagangId > 0;
            if ($hasSantri === $hasToko) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Isi salah satu: santri_id atau pedagang_id (toko_id)',
                ], 400);
            }

            $svc = new CashlessStatementService($this->db);
            $result = $hasSantri
                ? $svc->listForSantri($santriId, $limit)
                : $svc->listForPedagang($pedagangId, $limit);
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::getStatementHistory ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat riwayat transaksi'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/journal/{id}/reverse — Batalkan jurnal (reversal).
     * Body: { alasan? }
     */
    public function reverseJournal(Request $request, Response $response, array $args): Response
    {
        try {
            $journalId = isset($args['id']) ? (int) $args['id'] : 0;
            if ($journalId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID jurnal tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $alasan = isset($data['alasan']) ? trim((string) $data['alasan']) : null;
            $actorUserId = $this->resolveActorUserId($request);

            $svc = new CashlessReversalService($this->db);
            $result = $svc->reverseJournal($journalId, $actorUserId, $alasan);
            $status = ($result['success'] ?? false) ? 200 : 400;
            return $this->jsonResponse($response, $result, $status);
        } catch (\Exception $e) {
            error_log('CashlessController::reverseJournal ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal membatalkan jurnal'], 500);
        }
    }

    /**
     * POST /api/v2/cashless/reconcile — Rekonsiliasi saldo wallet dari ledger.
     */
    public function reconcileAccounts(Request $request, Response $response): Response
    {
        try {
            $svc = new CashlessReconcileService($this->db);
            $result = $svc->reconcileWalletAccounts();
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('CashlessController::reconcileAccounts ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal rekonsiliasi'], 500);
        }
    }
}
