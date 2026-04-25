<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD titik lokasi absen GPS (absen___lokasi).
 */
final class AbsenLokasiController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** Isi JSON dari request — pakai getParsedBody() (BodyParsingMiddleware Slim), bukan getContents() yang sering kosong. */
    private function requestJsonBody(Request $request): array
    {
        $parsed = $request->getParsedBody();

        return is_array($parsed) ? $parsed : [];
    }

    /** Koordinat dari JSON (angka atau string; koma desimal → titik). */
    private static function floatCoord(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            $f = (float) $v;

            return is_finite($f) ? $f : null;
        }
        $s = str_replace(',', '.', preg_replace('/\s+/u', '', (string) $v));
        if ($s === '' || !is_numeric($s)) {
            return null;
        }
        $f = (float) $s;

        return is_finite($f) ? $f : null;
    }

    /** Alamat opsional: null jika kosong; potong ke panjang maks. */
    private static function optStringAddr(mixed $v, int $maxLen): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        if ($s === '') {
            return null;
        }
        if (mb_strlen($s) > $maxLen) {
            $s = mb_substr($s, 0, $maxLen);
        }

        return $s;
    }

    /** Baca alamat dari body (PUT) atau pertahankan nilai baris (GET). */
    private static function addrFromBodyOrRow(array $body, array $row, string $key, int $maxLen): ?string
    {
        if (array_key_exists($key, $body)) {
            return self::optStringAddr($body[$key], $maxLen);
        }

        return self::optStringAddr($row[$key] ?? null, $maxLen);
    }

    /** True jika klien mengirim minimal satu isian alamat pratinjau yang tidak kosong. */
    private static function bodyMemintaPenyimpananAlamat(array $body): bool
    {
        $limits = [
            'dusun' => 191,
            'rt' => 32,
            'rw' => 32,
            'desa' => 191,
            'kecamatan' => 191,
            'kabupaten' => 191,
            'provinsi' => 191,
        ];
        foreach ($limits as $k => $max) {
            if (!array_key_exists($k, $body)) {
                continue;
            }
            if (self::optStringAddr($body[$k], $max) !== null) {
                return true;
            }
        }

        return false;
    }

    private function apiHasLokasiGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.lokasi.');
    }

    private function apiHasTabGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.tab.');
    }

    /** Role memakai aksi granular Absen (tab atau lokasi); selain itu perilaku legacy penuh dengan menu.absen saja. */
    private function apiHasAnyAbsenActionGranular(array $user): bool
    {
        return $this->apiHasLokasiGranular($user) || $this->apiHasTabGranular($user);
    }

    private function hasMenuAbsen(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.absen');
    }

    private function isSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    /** null = tanpa batas lembaga; array kosong = tidak ada akses lembaga */
    private function userLembagaScope(array $user): ?array
    {
        if ($this->isSuper($user)) {
            return null;
        }
        if (!empty($user['lembaga_scope_all'])) {
            return null;
        }
        $ids = $user['lembaga_ids'] ?? [];
        if (!is_array($ids)) {
            return [];
        }

        return array_values(array_filter(array_map('strval', $ids)));
    }

    private function scopeWhereSql(?array $scope, string $alias = 'l'): array
    {
        if ($scope === null) {
            return ['', []];
        }
        if ($scope === []) {
            return [' AND 1=0 ', []];
        }
        $ph = implode(',', array_fill(0, count($scope), '?'));

        return [" AND ({$alias}.`id_lembaga` IS NULL OR {$alias}.`id_lembaga` IN ({$ph})) ", $scope];
    }

    private function canRead(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->hasMenuAbsen($user)) {
            return false;
        }
        if (!$this->apiHasAnyAbsenActionGranular($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.absen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.tambah')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.ubah')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.hapus')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.absen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.ngabsen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.pengaturan');
    }

    private function canTambah(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->hasMenuAbsen($user)) {
            return false;
        }
        if (!$this->apiHasAnyAbsenActionGranular($user)) {
            return true;
        }
        if (!RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.tambah')) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list');
    }

    private function canUbah(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->hasMenuAbsen($user)) {
            return false;
        }
        if (!$this->apiHasAnyAbsenActionGranular($user)) {
            return true;
        }
        if (!RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.ubah')) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list');
    }

    private function canHapus(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (!$this->hasMenuAbsen($user)) {
            return false;
        }
        if (!$this->apiHasAnyAbsenActionGranular($user)) {
            return true;
        }
        if (!RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.hapus')) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list');
    }

    private function tableOk(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___lokasi' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function tableHasAlamatColumns(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
                 AND table_name = 'absen___lokasi' AND column_name = 'dusun' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function tableHasJamColumns(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
                 AND table_name = 'absen___lokasi' AND column_name = 'jam_mulai_pagi' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function tableHasJamTelatColumns(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
                 AND table_name = 'absen___lokasi' AND column_name = 'jam_telat_pagi' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Untuk kolom TIME MySQL: "HH:MM" / "HH:MM:SS" → "HH:MM:SS" atau null */
    private static function normalizeTimeSql(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        if ($s === '') {
            return null;
        }
        if (!preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
            return null;
        }
        $h = min(23, max(0, (int) $m[1]));
        $min = min(59, max(0, (int) $m[2]));
        $sec = isset($m[3]) ? min(59, max(0, (int) $m[3])) : 0;

        return sprintf('%02d:%02d:%02d', $h, $min, $sec);
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, mixed> $row
     */
    private static function timeFromBodyOrRow(array $body, array $row, string $key): ?string
    {
        if (array_key_exists($key, $body)) {
            $raw = $body[$key];
            if ($raw === null || $raw === '') {
                return null;
            }

            return self::normalizeTimeSql($raw);
        }
        if (!isset($row[$key]) || $row[$key] === null || $row[$key] === '') {
            return null;
        }

        return self::normalizeTimeSql($row[$key]);
    }

    /** @param array<string, mixed> $body */
    private static function optionalTimeFromBody(array $body, string $key): ?string
    {
        if (!array_key_exists($key, $body)) {
            return null;
        }
        $raw = $body[$key];
        if ($raw === null || $raw === '') {
            return null;
        }

        return self::normalizeTimeSql($raw);
    }

    /**
     * GET /api/absen-lokasi
     */
    public function getList(Request $request, Response $response): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => true, 'data' => []], 200);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canRead($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak melihat lokasi absen'], 403);
        }
        $scope = $this->userLembagaScope($user);
        [$extraSql, $bind] = $this->scopeWhereSql($scope, 'l');
        $addrCols = $this->tableHasAlamatColumns()
            ? ', l.dusun, l.rt, l.rw, l.desa, l.kecamatan, l.kabupaten, l.provinsi'
            : '';
        $hasJam = $this->tableHasJamColumns();
        $hasTelat = $hasJam && $this->tableHasJamTelatColumns();
        $jamCols = $hasJam
            ? ($hasTelat
                ? ', l.jam_mulai_pagi, l.jam_telat_pagi, l.jam_mulai_sore, l.jam_telat_sore, l.jam_mulai_malam, l.jam_telat_malam'
                : ', l.jam_mulai_pagi, l.jam_mulai_sore, l.jam_mulai_malam')
            : '';
        $sql = 'SELECT l.id, l.nama, l.latitude, l.longitude, l.radius_meter, l.id_lembaga, l.aktif, l.sort_order'
            . $jamCols . $addrCols . ',
                lg.nama AS lembaga_nama
            FROM absen___lokasi l
            LEFT JOIN lembaga lg ON lg.id = l.id_lembaga
            WHERE 1=1 ' . $extraSql . '
            ORDER BY l.sort_order ASC, l.id ASC';
        $st = $this->db->prepare($sql);
        $st->execute($bind);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        return $this->json($response, ['success' => true, 'data' => $rows], 200);
    }

    /**
     * POST /api/absen-lokasi
     *
     * @param array{nama?:string,latitude?:float|int|string,longitude?:float|int|string,radius_meter?:int,id_lembaga?:int|string|null,aktif?:int|bool,sort_order?:int} $body
     */
    public function create(Request $request, Response $response): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur lokasi belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canTambah($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak menambah lokasi'], 403);
        }
        $body = $this->requestJsonBody($request);
        $nama = trim((string) ($body['nama'] ?? ''));
        $lat = array_key_exists('latitude', $body) ? self::floatCoord($body['latitude']) : null;
        $lng = array_key_exists('longitude', $body) ? self::floatCoord($body['longitude']) : null;
        $radius = isset($body['radius_meter']) ? max(10, min(5000, (int) $body['radius_meter'])) : 100;
        $idLembaga = $body['id_lembaga'] ?? null;
        $idLembaga = $idLembaga === '' || $idLembaga === null ? null : trim((string) $idLembaga);
        $aktif = isset($body['aktif']) ? ((int) (bool) $body['aktif']) : 1;
        $sort = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $dusun = self::optStringAddr($body['dusun'] ?? null, 191);
        $rt = self::optStringAddr($body['rt'] ?? null, 32);
        $rw = self::optStringAddr($body['rw'] ?? null, 32);
        $desa = self::optStringAddr($body['desa'] ?? null, 191);
        $kecamatan = self::optStringAddr($body['kecamatan'] ?? null, 191);
        $kabupaten = self::optStringAddr($body['kabupaten'] ?? null, 191);
        $provinsi = self::optStringAddr($body['provinsi'] ?? null, 191);

        if ($nama === '' || $lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->json($response, ['success' => false, 'message' => 'nama, latitude, longitude wajib valid'], 400);
        }

        $scope = $this->userLembagaScope($user);
        if ($scope !== null && $idLembaga !== null) {
            if ($scope === [] || !in_array($idLembaga, $scope, true)) {
                return $this->json($response, ['success' => false, 'message' => 'Lembaga tidak dalam jangkauan Anda'], 403);
            }
        }
        if ($scope !== null && $scope !== [] && $idLembaga === null) {
            // non-super dengan scope: lokasi global (semua lembaga) tidak diperbolehkan
            return $this->json($response, ['success' => false, 'message' => 'Pilih lembaga untuk lokasi ini'], 400);
        }

        $hasAddr = $this->tableHasAlamatColumns();
        if (self::bodyMemintaPenyimpananAlamat($body) && !$hasAddr) {
            return $this->json($response, [
                'success' => false,
                'code' => 'absen_lokasi_alamat_migration_required',
                'message' => 'Basis data belum punya kolom alamat titik lokasi. Jalankan migrasi Phinx di folder api '
                    . '(php vendor/bin/phinx migrate) atau jalankan api/db/manual/absen_lokasi_alamat_pratinjau.sql di phpMyAdmin. '
                    . 'Tanpa itu, isian alamat tidak bisa disimpan.',
            ], 503);
        }
        $hasJam = $this->tableHasJamColumns();
        $hasJamTelat = $hasJam && $this->tableHasJamTelatColumns();
        $jmP = $hasJam ? self::optionalTimeFromBody($body, 'jam_mulai_pagi') : null;
        $jmS = $hasJam ? self::optionalTimeFromBody($body, 'jam_mulai_sore') : null;
        $jmM = $hasJam ? self::optionalTimeFromBody($body, 'jam_mulai_malam') : null;
        $jtP = $hasJamTelat ? self::optionalTimeFromBody($body, 'jam_telat_pagi') : null;
        $jtS = $hasJamTelat ? self::optionalTimeFromBody($body, 'jam_telat_sore') : null;
        $jtM = $hasJamTelat ? self::optionalTimeFromBody($body, 'jam_telat_malam') : null;

        try {
            if ($hasAddr && $hasJam && $hasJamTelat) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order,
                        jam_mulai_pagi, jam_telat_pagi, jam_mulai_sore, jam_telat_sore, jam_mulai_malam, jam_telat_malam,
                        `dusun`, `rt`, `rw`, `desa`, `kecamatan`, `kabupaten`, `provinsi`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi,
                ]);
            } elseif ($hasAddr && $hasJam) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order,
                        jam_mulai_pagi, jam_mulai_sore, jam_mulai_malam,
                        `dusun`, `rt`, `rw`, `desa`, `kecamatan`, `kabupaten`, `provinsi`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort,
                    $jmP, $jmS, $jmM,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi,
                ]);
            } elseif ($hasAddr) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order,
                        `dusun`, `rt`, `rw`, `desa`, `kecamatan`, `kabupaten`, `provinsi`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi,
                ]);
            } elseif ($hasJam && $hasJamTelat) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order,
                        jam_mulai_pagi, jam_telat_pagi, jam_mulai_sore, jam_telat_sore, jam_mulai_malam, jam_telat_malam)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM,
                ]);
            } elseif ($hasJam) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order,
                        jam_mulai_pagi, jam_mulai_sore, jam_mulai_malam)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort,
                    $jmP, $jmS, $jmM,
                ]);
            } else {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([$nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort]);
            }
        } catch (\Throwable $e) {
            error_log('AbsenLokasiController::create: ' . $e->getMessage());

            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menyimpan lokasi. Periksa migrasi basis data atau hubungi admin.',
            ], 500);
        }
        $id = (int) $this->db->lastInsertId();

        return $this->json($response, ['success' => true, 'message' => 'Lokasi disimpan', 'data' => ['id' => $id]], 201);
    }

    /**
     * PUT /api/absen-lokasi/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur lokasi belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canUbah($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengubah lokasi'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $scope = $this->userLembagaScope($user);
        [$extraSql, $bindScope] = $this->scopeWhereSql($scope, 'l');

        $body = $this->requestJsonBody($request);
        $cur = $this->db->prepare('SELECT * FROM absen___lokasi l WHERE l.id = ?' . $extraSql);
        $cur->execute(array_merge([$id], $bindScope));
        $row = $cur->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return $this->json($response, ['success' => false, 'message' => 'Lokasi tidak ditemukan'], 404);
        }

        $nama = trim((string) ($body['nama'] ?? $row['nama'] ?? ''));
        $lat = array_key_exists('latitude', $body)
            ? self::floatCoord($body['latitude'])
            : (float) $row['latitude'];
        $lng = array_key_exists('longitude', $body)
            ? self::floatCoord($body['longitude'])
            : (float) $row['longitude'];
        $radius = isset($body['radius_meter'])
            ? max(10, min(5000, (int) $body['radius_meter']))
            : (int) $row['radius_meter'];
        $idLembagaNew = array_key_exists('id_lembaga', $body)
            ? ($body['id_lembaga'] === '' || $body['id_lembaga'] === null ? null : trim((string) $body['id_lembaga']))
            : (isset($row['id_lembaga']) && $row['id_lembaga'] !== null && $row['id_lembaga'] !== ''
                ? trim((string) $row['id_lembaga']) : null);
        $aktif = array_key_exists('aktif', $body) ? ((int) (bool) $body['aktif']) : (int) $row['aktif'];
        $sort = array_key_exists('sort_order', $body) ? (int) $body['sort_order'] : (int) $row['sort_order'];
        $dusun = self::addrFromBodyOrRow($body, $row, 'dusun', 191);
        $rt = self::addrFromBodyOrRow($body, $row, 'rt', 32);
        $rw = self::addrFromBodyOrRow($body, $row, 'rw', 32);
        $desa = self::addrFromBodyOrRow($body, $row, 'desa', 191);
        $kecamatan = self::addrFromBodyOrRow($body, $row, 'kecamatan', 191);
        $kabupaten = self::addrFromBodyOrRow($body, $row, 'kabupaten', 191);
        $provinsi = self::addrFromBodyOrRow($body, $row, 'provinsi', 191);

        if ($nama === '' || $lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->json($response, ['success' => false, 'message' => 'nama, latitude, longitude wajib valid'], 400);
        }

        if ($scope !== null && $scope !== [] && $idLembagaNew === null) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih lembaga untuk lokasi ini'], 400);
        }
        if ($scope !== null && $idLembagaNew !== null) {
            if ($scope === [] || !in_array($idLembagaNew, $scope, true)) {
                return $this->json($response, ['success' => false, 'message' => 'Lembaga tidak dalam jangkauan Anda'], 403);
            }
        }

        $hasAddr = $this->tableHasAlamatColumns();
        if (self::bodyMemintaPenyimpananAlamat($body) && !$hasAddr) {
            return $this->json($response, [
                'success' => false,
                'code' => 'absen_lokasi_alamat_migration_required',
                'message' => 'Basis data belum punya kolom alamat titik lokasi. Jalankan migrasi Phinx di folder api '
                    . '(php vendor/bin/phinx migrate) atau jalankan api/db/manual/absen_lokasi_alamat_pratinjau.sql di phpMyAdmin. '
                    . 'Tanpa itu, isian alamat tidak bisa disimpan.',
            ], 503);
        }
        $hasJam = $this->tableHasJamColumns();
        $hasJamTelat = $hasJam && $this->tableHasJamTelatColumns();
        $jmP = $hasJam ? self::timeFromBodyOrRow($body, $row, 'jam_mulai_pagi') : null;
        $jmS = $hasJam ? self::timeFromBodyOrRow($body, $row, 'jam_mulai_sore') : null;
        $jmM = $hasJam ? self::timeFromBodyOrRow($body, $row, 'jam_mulai_malam') : null;
        $jtP = $hasJamTelat ? self::timeFromBodyOrRow($body, $row, 'jam_telat_pagi') : null;
        $jtS = $hasJamTelat ? self::timeFromBodyOrRow($body, $row, 'jam_telat_sore') : null;
        $jtM = $hasJamTelat ? self::timeFromBodyOrRow($body, $row, 'jam_telat_malam') : null;

        try {
            if ($hasAddr && $hasJam && $hasJamTelat) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?,
                     jam_mulai_pagi = ?, jam_telat_pagi = ?, jam_mulai_sore = ?, jam_telat_sore = ?, jam_mulai_malam = ?, jam_telat_malam = ?,
                     `dusun` = ?, `rt` = ?, `rw` = ?, `desa` = ?, `kecamatan` = ?, `kabupaten` = ?, `provinsi` = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi, $id,
                ]);
            } elseif ($hasAddr && $hasJam) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?,
                     jam_mulai_pagi = ?, jam_mulai_sore = ?, jam_mulai_malam = ?,
                     `dusun` = ?, `rt` = ?, `rw` = ?, `desa` = ?, `kecamatan` = ?, `kabupaten` = ?, `provinsi` = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort,
                    $jmP, $jmS, $jmM,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi, $id,
                ]);
            } elseif ($hasAddr) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?,
                     `dusun` = ?, `rt` = ?, `rw` = ?, `desa` = ?, `kecamatan` = ?, `kabupaten` = ?, `provinsi` = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort,
                    $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi, $id,
                ]);
            } elseif ($hasJam && $hasJamTelat) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?,
                     jam_mulai_pagi = ?, jam_telat_pagi = ?, jam_mulai_sore = ?, jam_telat_sore = ?, jam_mulai_malam = ?, jam_telat_malam = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM, $id,
                ]);
            } elseif ($hasJam) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?,
                     jam_mulai_pagi = ?, jam_mulai_sore = ?, jam_mulai_malam = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort,
                    $jmP, $jmS, $jmM, $id,
                ]);
            } else {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ? WHERE id = ?'
                );
                $upd->execute([$nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort, $id]);
            }
        } catch (\Throwable $e) {
            error_log('AbsenLokasiController::update: ' . $e->getMessage());

            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memperbarui lokasi. Periksa migrasi basis data atau hubungi admin.',
            ], 500);
        }

        return $this->json($response, ['success' => true, 'message' => 'Lokasi diperbarui'], 200);
    }

    /**
     * DELETE /api/absen-lokasi/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur lokasi belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canHapus($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak menghapus lokasi'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $scope = $this->userLembagaScope($user);
        [$extraSql, $bindScope] = $this->scopeWhereSql($scope, 'l');
        $chk = $this->db->prepare('SELECT id FROM absen___lokasi l WHERE l.id = ?' . $extraSql);
        $chk->execute(array_merge([$id], $bindScope));
        if (!$chk->fetchColumn()) {
            return $this->json($response, ['success' => false, 'message' => 'Lokasi tidak ditemukan'], 404);
        }
        $this->db->prepare('DELETE FROM absen___lokasi WHERE id = ?')->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Lokasi dihapus'], 200);
    }
}
