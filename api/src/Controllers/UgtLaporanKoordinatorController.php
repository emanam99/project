<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD laporan koordinator UGT (tabel ugt___koordonator) + upload foto.
 * Koordinator hanya madrasah yang id_koordinator = pengurus login; admin_ugt / super_admin semua.
 */
class UgtLaporanKoordinatorController
{
    private \PDO $db;
    private string $uploadsBasePath;
    private const MAX_FOTO_SIZE = 1024 * 1024;
    private const FOTO_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    /** Nilai `laporan_jenis` di ugt___masalah untuk baris ugt___koordonator */
    private const LAPORAN_JENIS_KOORDINATOR = 'koordonator';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array{user: array, pengurus_id: int, apply_koordinator: bool} */
    private function authContext(Request $request): array
    {
        $user = $request->getAttribute('user');
        $userArr = is_array($user) ? $user : [];
        $pengurusId = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        $apply = RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr);

        return ['user' => $userArr, 'pengurus_id' => $pengurusId, 'apply_koordinator' => $apply];
    }

    /** Pengurus yang menyimpan (dari JWT user_id); null jika tidak ada. */
    private function getPembuatPengurusId(Request $request): ?int
    {
        $ctx = $this->authContext($request);
        $pid = $ctx['pengurus_id'];

        return $pid > 0 ? $pid : null;
    }

    private function userMayAccessMadrasah(Request $request, int $madrasahId): bool
    {
        if ($madrasahId <= 0) {
            return false;
        }
        $ctx = $this->authContext($request);
        if (!$ctx['apply_koordinator']) {
            return true;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM madrasah WHERE id = ? AND id_koordinator = ? LIMIT 1');
        $stmt->execute([$madrasahId, $ctx['pengurus_id']]);

        return (bool) $stmt->fetchColumn();
    }

    /** id_koordinator madrasah saat ini (boleh null). */
    private function getMadrasahKoordinatorId(int $madrasahId): ?int
    {
        $stmt = $this->db->prepare('SELECT id_koordinator FROM madrasah WHERE id = ? LIMIT 1');
        $stmt->execute([$madrasahId]);
        $v = $stmt->fetchColumn();
        if ($v === false || $v === null || $v === '') {
            return null;
        }
        $pid = (int) $v;

        return $pid > 0 ? $pid : null;
    }

    private function selectLaporanFromClause(): string
    {
        return 'FROM ugt___koordonator k
                INNER JOIN madrasah m ON m.id = k.id_madrasah
                INNER JOIN santri s ON s.id = k.id_santri
                LEFT JOIN pengurus pk ON pk.id = k.id_koordinator
                LEFT JOIN pengurus pbu ON pbu.id = k.id_pembuat';
    }

    private function selectLaporanColumns(): string
    {
        return 'SELECT k.*, m.nama AS madrasah_nama, s.nama AS santri_nama, s.nis AS santri_nis, pk.nama AS koordinator_nama, pbu.nama AS pembuat_nama';
    }

    /**
     * @param array<int,mixed> $raw
     * @return list<array{masalah: ?string, solusi: ?string, saran: ?string}>
     */
    private function normalizeMasalahItemsFromBody(array $raw): array
    {
        if (!isset($raw['masalah_list']) || !is_array($raw['masalah_list'])) {
            return [];
        }
        $out = [];
        foreach ($raw['masalah_list'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $m = trim((string) ($item['masalah'] ?? ''));
            $s = trim((string) ($item['solusi'] ?? ''));
            $r = trim((string) ($item['saran'] ?? ''));
            if ($m === '' && $s === '' && $r === '') {
                continue;
            }
            $out[] = [
                'masalah' => $m === '' ? null : TextSanitizer::cleanMultilineMessage($m),
                'solusi' => $s === '' ? null : TextSanitizer::cleanMultilineMessage($s),
                'saran' => $r === '' ? null : TextSanitizer::cleanMultilineMessage($r),
            ];
        }

        return $out;
    }

    /**
     * @param list<array{masalah: ?string, solusi: ?string, saran: ?string}> $items
     */
    private function insertMasalahRows(int $idLaporan, int $idMadrasah, int $idSantri, array $items): void
    {
        if ($items === []) {
            return;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO ugt___masalah (id_madrasah, id_santri, id_laporan, laporan_jenis, masalah, solusi, saran)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($items as $it) {
            $stmt->execute([
                $idMadrasah,
                $idSantri,
                $idLaporan,
                self::LAPORAN_JENIS_KOORDINATOR,
                $it['masalah'],
                $it['solusi'],
                $it['saran'],
            ]);
        }
    }

    private function deleteMasalahForKoordinatorLaporan(int $idLaporan): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM ugt___masalah WHERE id_laporan = ? AND laporan_jenis = ?'
        );
        $stmt->execute([$idLaporan, self::LAPORAN_JENIS_KOORDINATOR]);
    }

    /**
     * @return list<array{id: int, masalah: ?string, solusi: ?string, saran: ?string, tanggal_dibuat: string}>
     */
    private function fetchMasalahForKoordinatorLaporan(int $idLaporan): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, masalah, solusi, saran, tanggal_dibuat FROM ugt___masalah
             WHERE id_laporan = ? AND laporan_jenis = ? ORDER BY id ASC'
        );
        $stmt->execute([$idLaporan, self::LAPORAN_JENIS_KOORDINATOR]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $list = [];
        foreach ($rows as $row) {
            $list[] = [
                'id' => (int) $row['id'],
                'masalah' => $row['masalah'] !== null && $row['masalah'] !== '' ? (string) $row['masalah'] : null,
                'solusi' => $row['solusi'] !== null && $row['solusi'] !== '' ? (string) $row['solusi'] : null,
                'saran' => $row['saran'] !== null && $row['saran'] !== '' ? (string) $row['saran'] : null,
                'tanggal_dibuat' => (string) ($row['tanggal_dibuat'] ?? ''),
            ];
        }

        return $list;
    }

    /** @param array<string,mixed> $row */
    private function attachMasalahToRow(array $row): array
    {
        $id = (int) ($row['id'] ?? 0);
        if ($id <= 0) {
            $row['masalah'] = [];

            return $row;
        }
        $row['masalah'] = $this->fetchMasalahForKoordinatorLaporan($id);

        return $row;
    }

    private function getUgtDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'ugt';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    private function deleteStoredFoto(?string $relativePath): void
    {
        if ($relativePath === null || $relativePath === '') {
            return;
        }
        $relativePath = trim(str_replace('\\', '/', $relativePath));
        if (strpos($relativePath, '..') !== false) {
            return;
        }
        if (!preg_match('#^uploads/ugt/[^/]+$#', $relativePath)) {
            return;
        }
        $rel = trim(substr($relativePath, strlen('uploads/')), '/');
        $full = $this->uploadsBasePath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $real = realpath($full);
        if ($real !== false && is_file($real) && strpos($real, $this->uploadsBasePath) === 0) {
            @unlink($real);
        }
    }

    /**
     * GET /api/ugt/laporan-koordinator/santri-options?search=&limit=
     */
    public function getSantriOptions(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $search = trim((string) ($q['search'] ?? ''));
            $limit = isset($q['limit']) ? (int) $q['limit'] : 40;
            $limit = min(max(1, $limit), 100);

            $sql = 'SELECT s.id, s.nis, s.nama FROM santri s WHERE 1=1';
            $params = [];
            if ($search !== '') {
                $sql .= ' AND (s.nama LIKE ? OR CAST(s.nis AS CHAR) LIKE ?)';
                $like = '%' . $search . '%';
                $params[] = $like;
                $params[] = $like;
            }
            $sql .= ' ORDER BY s.nama ASC LIMIT ' . (int) $limit;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = [];
            foreach ($rows as $row) {
                $list[] = [
                    'id' => (int) $row['id'],
                    'nis' => $row['nis'] !== null ? (string) $row['nis'] : '',
                    'nama' => (string) ($row['nama'] ?? ''),
                ];
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::getSantriOptions ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat daftar santri'], 500);
        }
    }

    /**
     * POST /api/ugt/laporan-koordinator/upload-foto
     */
    public function uploadFoto(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? 'Error upload' : 'Tidak ada file foto';

                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = $file->getClientMediaType();
            if (!in_array($mediaType, self::FOTO_ALLOWED_TYPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan',
                ], 400);
            }

            if ($file->getSize() > self::MAX_FOTO_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file maksimal 1 MB. Kompres gambar di perangkat Anda lalu coba lagi.',
                ], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = 'ugt_koord_' . uniqid('', true) . '.' . $ext;
            $uploadDir = $this->getUgtDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2]) || !in_array($imageInfo[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) {
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }

                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar yang valid atau format tidak didukung',
                ], 400);
            }

            $relativePath = 'uploads/ugt/' . $fileName;

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto berhasil diunggah',
                'foto_path' => $relativePath,
            ], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::uploadFoto ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * GET /api/ugt/laporan-koordinator?id_madrasah=&id_tahun_ajaran=&bulan=&id_koordinator=
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $ctx = $this->authContext($request);
            $q = $request->getQueryParams();
            $idMadrasah = isset($q['id_madrasah']) ? (int) $q['id_madrasah'] : 0;
            $idTa = isset($q['id_tahun_ajaran']) ? trim((string) $q['id_tahun_ajaran']) : '';
            $bulan = isset($q['bulan']) ? (int) $q['bulan'] : 0;
            $idKoordinatorFilter = isset($q['id_koordinator']) ? (int) $q['id_koordinator'] : 0;

            if ($idMadrasah > 0 && !$this->userMayAccessMadrasah($request, $idMadrasah)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak untuk madrasah ini'], 403);
            }

            $canFilterSemuaKoordinator = RoleHelper::tokenUgtLaporanCanFilterSemuaKoordinator($this->db, $ctx['user']);
            if ($idKoordinatorFilter > 0 && $ctx['apply_koordinator'] && !$canFilterSemuaKoordinator && $idKoordinatorFilter !== $ctx['pengurus_id']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $sql = $this->selectLaporanColumns() . ' ' . $this->selectLaporanFromClause() . ' WHERE 1=1';
            $params = [];
            if ($ctx['apply_koordinator']) {
                $sql .= ' AND m.id_koordinator = ?';
                $params[] = $ctx['pengurus_id'];
            }
            if ($idMadrasah > 0) {
                $sql .= ' AND k.id_madrasah = ?';
                $params[] = $idMadrasah;
            }
            if ($idKoordinatorFilter > 0) {
                $sql .= ' AND k.id_koordinator = ?';
                $params[] = $idKoordinatorFilter;
            }
            if ($idTa !== '') {
                $sql .= ' AND k.id_tahun_ajaran = ?';
                $params[] = $idTa;
            }
            if ($bulan >= 1 && $bulan <= 12) {
                $sql .= ' AND k.bulan = ?';
                $params[] = $bulan;
            }
            $sql .= ' ORDER BY k.tanggal_dibuat DESC, k.id DESC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            foreach ($rows as &$row) {
                $row = $this->normalizeLaporanRow($row);
            }
            unset($row);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::getAll ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data laporan'], 500);
        }
    }

    /** @param array<string,mixed> $row */
    private function normalizeLaporanRow(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['id_madrasah'] = (int) $row['id_madrasah'];
        $row['id_santri'] = (int) $row['id_santri'];
        $row['bulan'] = (int) $row['bulan'];
        $row['santri_nis'] = isset($row['santri_nis']) && $row['santri_nis'] !== null ? (string) $row['santri_nis'] : '';
        if (array_key_exists('id_koordinator', $row)) {
            $row['id_koordinator'] = $row['id_koordinator'] !== null && $row['id_koordinator'] !== ''
                ? (int) $row['id_koordinator'] : null;
        } else {
            $row['id_koordinator'] = null;
        }
        $row['koordinator_nama'] = (string) ($row['koordinator_nama'] ?? '');
        if (array_key_exists('id_pembuat', $row)) {
            $row['id_pembuat'] = $row['id_pembuat'] !== null && $row['id_pembuat'] !== ''
                ? (int) $row['id_pembuat'] : null;
        } else {
            $row['id_pembuat'] = null;
        }
        $row['pembuat_nama'] = (string) ($row['pembuat_nama'] ?? '');

        return $row;
    }

    private function fetchRowById(int $id): ?array
    {
        $sql = $this->selectLaporanColumns() . ' ' . $this->selectLaporanFromClause() . ' WHERE k.id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return $this->normalizeLaporanRow($row);
    }

    /**
     * GET /api/ugt/laporan-koordinator/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $row = $this->fetchRowById($id);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Laporan tidak ditemukan'], 404);
            }
            if (!$this->userMayAccessMadrasah($request, (int) $row['id_madrasah'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $row = $this->attachMasalahToRow($row);

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::getById ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil laporan'], 500);
        }
    }

    private function tahunAjaranExists(string $ta): bool
    {
        if ($ta === '') {
            return false;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM tahun_ajaran WHERE tahun_ajaran = ? LIMIT 1');
        $stmt->execute([$ta]);

        return (bool) $stmt->fetchColumn();
    }

    private function santriExists(int $id): bool
    {
        if ($id <= 0) {
            return false;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM santri WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);

        return (bool) $stmt->fetchColumn();
    }

    private function duplicateExists(int $madrasahId, int $santriId, string $ta, int $bulan, int $excludeId = 0): bool
    {
        $sql = 'SELECT id FROM ugt___koordonator WHERE id_madrasah = ? AND id_santri = ? AND id_tahun_ajaran = ? AND bulan = ?';
        $params = [$madrasahId, $santriId, $ta, $bulan];
        if ($excludeId > 0) {
            $sql .= ' AND id <> ?';
            $params[] = $excludeId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * POST /api/ugt/laporan-koordinator
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $raw = $request->getParsedBody();
            $data = is_array($raw) ? TextSanitizer::sanitizeStringValues($raw, []) : [];

            $idMadrasah = isset($data['id_madrasah']) ? (int) $data['id_madrasah'] : 0;
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $idTa = isset($data['id_tahun_ajaran']) ? trim((string) $data['id_tahun_ajaran']) : '';
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : 0;
            $foto = isset($data['foto']) ? trim((string) $data['foto']) : null;
            if ($foto === '') {
                $foto = null;
            }
            $usulan = isset($data['usulan']) ? (string) $data['usulan'] : null;
            if ($usulan === '') {
                $usulan = null;
            }

            if ($idMadrasah <= 0 || $idSantri <= 0 || $idTa === '' || $bulan < 1 || $bulan > 12) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah, santri, tahun ajaran, dan bulan (1–12) wajib diisi',
                ], 400);
            }

            if (!$this->userMayAccessMadrasah($request, $idMadrasah)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak untuk madrasah ini'], 403);
            }

            if (!$this->santriExists($idSantri)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 400);
            }

            if (!$this->tahunAjaranExists($idTa)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak valid'], 400);
            }

            if ($this->duplicateExists($idMadrasah, $idSantri, $idTa, $bulan, 0)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Sudah ada laporan untuk madrasah, santri, tahun ajaran, dan bulan yang sama',
                ], 409);
            }

            if ($foto !== null && !preg_match('#^uploads/ugt/[^/]+$#', $foto)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Path foto tidak valid'], 400);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);
            $idPembuat = $this->getPembuatPengurusId($request);
            $masalahItems = $this->normalizeMasalahItemsFromBody($data);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'INSERT INTO ugt___koordonator (id_madrasah, id_santri, id_koordinator, id_pembuat, foto, id_tahun_ajaran, bulan, usulan)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([$idMadrasah, $idSantri, $idKord, $idPembuat, $foto, $idTa, $bulan, $usulan]);
                $newId = (int) $this->db->lastInsertId();
                $this->insertMasalahRows($newId, $idMadrasah, $idSantri, $masalahItems);
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            $row = $this->fetchRowById($newId);
            if ($row) {
                $row = $this->attachMasalahToRow($row);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Laporan berhasil dibuat', 'data' => $row], 201);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::create ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan laporan'], 500);
        }
    }

    /**
     * PUT /api/ugt/laporan-koordinator/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $existing = $this->fetchRowById($id);
            if (!$existing) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Laporan tidak ditemukan'], 404);
            }
            if (!$this->userMayAccessMadrasah($request, (int) $existing['id_madrasah'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $raw = $request->getParsedBody();
            $data = is_array($raw) ? TextSanitizer::sanitizeStringValues($raw, []) : [];

            $idMadrasah = isset($data['id_madrasah']) ? (int) $data['id_madrasah'] : (int) $existing['id_madrasah'];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : (int) $existing['id_santri'];
            $idTa = isset($data['id_tahun_ajaran']) ? trim((string) $data['id_tahun_ajaran']) : (string) $existing['id_tahun_ajaran'];
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : (int) $existing['bulan'];

            $foto = array_key_exists('foto', $data) ? trim((string) $data['foto']) : (string) ($existing['foto'] ?? '');
            if ($foto === '') {
                $foto = null;
            }
            $usulan = array_key_exists('usulan', $data) ? (string) $data['usulan'] : (string) ($existing['usulan'] ?? '');
            if ($usulan === '') {
                $usulan = null;
            }

            if ($idMadrasah <= 0 || $idSantri <= 0 || $idTa === '' || $bulan < 1 || $bulan > 12) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah, santri, tahun ajaran, dan bulan (1–12) wajib valid',
                ], 400);
            }

            if (!$this->userMayAccessMadrasah($request, $idMadrasah)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak untuk madrasah ini'], 403);
            }

            if (!$this->santriExists($idSantri)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 400);
            }

            if (!$this->tahunAjaranExists($idTa)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tahun ajaran tidak valid'], 400);
            }

            if ($this->duplicateExists($idMadrasah, $idSantri, $idTa, $bulan, $id)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Sudah ada laporan lain untuk kombinasi madrasah, santri, tahun ajaran, dan bulan yang sama',
                ], 409);
            }

            if ($foto !== null && !preg_match('#^uploads/ugt/[^/]+$#', $foto)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Path foto tidak valid'], 400);
            }

            $oldFoto = $existing['foto'] ?? null;
            if ($foto !== $oldFoto && $oldFoto) {
                $this->deleteStoredFoto((string) $oldFoto);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'UPDATE ugt___koordonator SET id_madrasah = ?, id_santri = ?, id_koordinator = ?, foto = ?, id_tahun_ajaran = ?, bulan = ?, usulan = ? WHERE id = ?'
                );
                $stmt->execute([$idMadrasah, $idSantri, $idKord, $foto, $idTa, $bulan, $usulan, $id]);

                if (array_key_exists('masalah_list', $data)) {
                    $masalahItems = $this->normalizeMasalahItemsFromBody($data);
                    $this->deleteMasalahForKoordinatorLaporan($id);
                    $this->insertMasalahRows($id, $idMadrasah, $idSantri, $masalahItems);
                }

                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            $row = $this->fetchRowById($id);
            if ($row) {
                $row = $this->attachMasalahToRow($row);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Laporan diperbarui', 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::update ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui laporan'], 500);
        }
    }

    /**
     * DELETE /api/ugt/laporan-koordinator/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $existing = $this->fetchRowById($id);
            if (!$existing) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Laporan tidak ditemukan'], 404);
            }
            if (!$this->userMayAccessMadrasah($request, (int) $existing['id_madrasah'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            if (!empty($existing['foto'])) {
                $this->deleteStoredFoto((string) $existing['foto']);
            }

            $this->deleteMasalahForKoordinatorLaporan($id);

            $stmt = $this->db->prepare('DELETE FROM ugt___koordonator WHERE id = ?');
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Laporan dihapus'], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanKoordinatorController::delete ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus laporan'], 500);
        }
    }
}
