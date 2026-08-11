<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\ProperCaseHelper;
use App\Helpers\RoleHelper;
use App\Support\AbsenLokasiGeo;
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

    /**
     * Skop id_lembaga untuk absen___lokasi (GET daftar & pratinjau alamat): selaras absen mandiri —
     * irisan lembaga token dengan jabatan aktif bila jabatan punya id lembaga; jika tidak, pakai token.
     * null = tanpa filter (super / lembaga_scope_all / role super_admin di token).
     */
    private function titikLembagaScopeForList(array $user): ?array
    {
        if ($this->isSuper($user)) {
            return null;
        }
        if (!empty($user['lembaga_scope_all'])) {
            return null;
        }
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid !== null && $pid > 0) {
            $r = RoleHelper::resolveAbsenMandiriLembagaScope($user, $pid);
            if ($r !== null) {
                return $r;
            }

            return null;
        }

        return $this->userLembagaScope($user);
    }

    /**
     * Filter titik lokasi per lembaga token. Tanpa OR id_lembaga IS NULL — pengguna ter-scope hanya melihat
     * titik yang diikat ke lembaga mereka (bukan titik «semua lembaga»).
     *
     * @return array{string, array<int, string>}
     */
    private function scopeLembagaSqlForTitik(?array $scope, string $alias = 'l'): array
    {
        if ($scope === null) {
            return ['', []];
        }
        if ($scope === []) {
            return [' AND 1=0 ', []];
        }
        $ph = implode(',', array_fill(0, count($scope), '?'));

        return [" AND {$alias}.`id_lembaga` IN ({$ph}) ", $scope];
    }

    /**
     * @param null|list<string> $strictScope hasil RoleHelper::resolveAbsenMandiriLembagaScope
     */
    private function rowMandiriDiizinkan(?array $strictScope, array $row): bool
    {
        if ($strictScope === null) {
            return true;
        }
        if ($strictScope === []) {
            return false;
        }
        $idLem = $row['id_lembaga'] ?? null;
        $idLem = $idLem !== null && $idLem !== '' ? trim((string) $idLem) : '';

        return $idLem !== '' && in_array($idLem, $strictScope, true);
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

    private function alamatMasterTableOk(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___alamat' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function lokasiHasAlamatFkColumn(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
                 AND table_name = 'absen___lokasi' AND column_name = 'id_absen_alamat' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Skema baru: alamat di tabel absen___alamat, FK di titik lokasi. */
    private function alamatRelOk(): bool
    {
        return $this->alamatMasterTableOk() && $this->lokasiHasAlamatFkColumn();
    }

    /** Basis data lama: kolom alamat masih di absen___lokasi (sebelum migrasi absen___alamat). */
    private function lokasiLegacyAlamatColumnsOk(): bool
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

    private function tableHasAlamatColumns(): bool
    {
        return $this->alamatRelOk() || $this->lokasiLegacyAlamatColumnsOk();
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
     * Selaras hak akses reverse geocode tab Absen — alamat titik umum tanpa nama.
     */
    private function canPratinjauAlamatUmum(array $user): bool
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

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.absen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.ngabsen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.pengaturan')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.absen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list');
    }

    private static function haversineMetersPratinjau(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R = 6371000.0;
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $dphi = deg2rad($lat2 - $lat1);
        $dlambda = deg2rad($lon2 - $lon1);
        $a = sin($dphi / 2) ** 2 + cos($phi1) * cos($phi2) * sin($dlambda / 2) ** 2;

        return 2 * $R * atan2(sqrt($a), sqrt(1 - $a));
    }

    /** @return array<string, string> */
    private function buildAlamatPayloadFromTitikRow(array $row): array
    {
        if (!$this->tableHasAlamatColumns()) {
            return [];
        }
        $keys = ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi'];
        $out = [];
        foreach ($keys as $k) {
            $raw = $row[$k] ?? null;
            $v = $raw !== null && $raw !== '' ? trim((string) $raw) : '';
            if ($v !== '') {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    private function bodyHasExplicitClearAlamatLink(array $body): bool
    {
        if (!array_key_exists('id_absen_alamat', $body)) {
            return false;
        }
        $v = $body['id_absen_alamat'];

        return $v === null || $v === '' || (int) $v === 0;
    }

    /** @return null|array<string, mixed> */
    private function fetchAlamatRowVisibleToUser(int $alamatId, array $user): ?array
    {
        if (!$this->alamatRelOk() || $alamatId <= 0) {
            return null;
        }
        $st = $this->db->prepare('SELECT * FROM absen___alamat a WHERE a.id = ?');
        $st->execute([$alamatId]);
        $r = $st->fetch(PDO::FETCH_ASSOC);

        return $r === false ? null : $r;
    }

    private function findOrCreateAlamatIdFromInline(array $user, ?string $idLemLokasi, array $body): ?int
    {
        if (!$this->alamatRelOk()) {
            return null;
        }
        $scope = $this->titikLembagaScopeForList($user);
        if ($scope !== null && $scope !== [] && ($idLemLokasi === null || $idLemLokasi === '')) {
            return null;
        }
        $dusun = self::optStringAddr($body['dusun'] ?? null, 191);
        $rt = self::optStringAddr($body['rt'] ?? null, 32);
        $rw = self::optStringAddr($body['rw'] ?? null, 32);
        $desa = self::optStringAddr($body['desa'] ?? null, 191);
        $kecamatan = self::optStringAddr($body['kecamatan'] ?? null, 191);
        $kabupaten = self::optStringAddr($body['kabupaten'] ?? null, 191);
        $provinsi = self::optStringAddr($body['provinsi'] ?? null, 191);
        [$dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi] = ProperCaseHelper::normalizeAddrSeven(
            $dusun,
            $rt,
            $rw,
            $desa,
            $kecamatan,
            $kabupaten,
            $provinsi
        );
        if ($dusun === null && $rt === null && $rw === null && $desa === null && $kecamatan === null && $kabupaten === null && $provinsi === null) {
            return null;
        }
        try {
            $sel = $this->db->prepare(
                'SELECT id FROM absen___alamat WHERE dusun <=> ? AND rt <=> ? AND rw <=> ? AND desa <=> ? AND kecamatan <=> ? AND kabupaten <=> ? AND provinsi <=> ? LIMIT 1'
            );
            $sel->execute([$dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi]);
            $found = $sel->fetch(PDO::FETCH_ASSOC);
            if ($found !== false) {
                return (int) $found['id'];
            }
            $ins = $this->db->prepare(
                'INSERT INTO absen___alamat (dusun, rt, rw, desa, kecamatan, kabupaten, provinsi) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([$dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi]);

            return (int) $this->db->lastInsertId();
        } catch (\Throwable $e) {
            error_log('AbsenLokasiController::findOrCreateAlamatIdFromInline: ' . $e->getMessage());

            return null;
        }
    }

    /**
     * @return int 0 = tidak pakai alamat (null FK); >0 = id absen___alamat; -1 = tidak ditemukan/tidak berhak
     */
    private function resolveIdAbsenAlamatForLokasiSave(array $user, array $body, ?string $idLembagaLokasi, bool $isUpdate, ?array $rowLokasiExisting = null): int
    {
        if (!$this->alamatRelOk()) {
            return 0;
        }
        $req = isset($body['id_absen_alamat']) ? (int) $body['id_absen_alamat'] : 0;
        if ($req > 0) {
            $arow = $this->fetchAlamatRowVisibleToUser($req, $user);
            if ($arow === null) {
                return -1;
            }

            return $req;
        }
        if ($this->bodyHasExplicitClearAlamatLink($body) && !self::bodyMemintaPenyimpananAlamat($body)) {
            return 0;
        }
        if (self::bodyMemintaPenyimpananAlamat($body)) {
            $n = $this->findOrCreateAlamatIdFromInline($user, $idLembagaLokasi, $body);

            return $n !== null && $n > 0 ? $n : 0;
        }
        if ($isUpdate && $rowLokasiExisting !== null) {
            $cur = isset($rowLokasiExisting['id_absen_alamat']) ? (int) $rowLokasiExisting['id_absen_alamat'] : 0;

            return $cur > 0 ? $cur : 0;
        }

        return 0;
    }

    /**
     * GET /api/absen-lokasi/pratinjau-alamat?lat=&lng=&accuracy=
     * Titik aktif dalam radius yang **diizinkan lembaga token**; respons tanpa nama lokasi — alamat manual & jarak.
     */
    public function getPratinjauAlamat(Request $request, Response $response): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => true, 'data' => []], 200);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canPratinjauAlamatUmum($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak'], 403);
        }
        $params = $request->getQueryParams();
        $lat = self::floatCoord($params['lat'] ?? $params['latitude'] ?? null);
        $lng = self::floatCoord($params['lng'] ?? $params['longitude'] ?? null);
        if ($lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter lat dan lng wajib valid'], 400);
        }
        $accSlack = 0.0;
        if (isset($params['accuracy'])) {
            $a = (float) $params['accuracy'];
            if ($a > 0 && is_finite($a)) {
                $accSlack = min($a, 120.0);
            }
        }

        $scope = $this->titikLembagaScopeForList($user);
        [$scopeSql, $scopeBind] = $this->scopeLembagaSqlForTitik($scope, 'l');
        $joinAddr = '';
        $addrCols = '';
        if ($this->alamatRelOk()) {
            $joinAddr = ' LEFT JOIN absen___alamat adm ON adm.id = l.id_absen_alamat ';
            $addrCols = ', adm.dusun, adm.rt, adm.rw, adm.desa, adm.kecamatan, adm.kabupaten, adm.provinsi, adm.latitude AS alamat_lat, adm.longitude AS alamat_lng, adm.radius_meter AS alamat_radius';
        } elseif ($this->lokasiLegacyAlamatColumnsOk()) {
            $addrCols = ', l.dusun, l.rt, l.rw, l.desa, l.kecamatan, l.kabupaten, l.provinsi';
        }
        $sql = 'SELECT l.latitude, l.longitude, l.radius_meter' . $addrCols . '
            FROM absen___lokasi l ' . $joinAddr . '
            WHERE l.aktif = 1 ' . $scopeSql;

        try {
            $st = $this->db->prepare($sql);
            $st->execute($scopeBind);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('AbsenLokasiController::getPratinjauAlamat: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat titik lokasi'], 500);
        }

        $hits = [];
        foreach ($rows as $row) {
            $eff = AbsenLokasiGeo::effectiveCenterAndBaseRadius($row);
            if ($eff === null) {
                continue;
            }
            [$plat, $plng, $radBase] = $eff;
            $dist = self::haversineMetersPratinjau($lat, $lng, $plat, $plng);
            $rad = $radBase + $accSlack;
            if ($dist > $rad) {
                continue;
            }
            $alamat = $this->buildAlamatPayloadFromTitikRow($row);
            $hits[] = [
                'dist' => $dist,
                'alamat' => $alamat,
                'punya_alamat_manual' => $alamat !== [],
            ];
        }
        usort($hits, static fn (array $a, array $b): int => $a['dist'] <=> $b['dist']);
        $hits = array_slice($hits, 0, 12);

        $out = [];
        foreach ($hits as $h) {
            $out[] = [
                'jarak_meter' => round($h['dist'], 1),
                'alamat' => $h['alamat'],
                'punya_alamat_manual' => $h['punya_alamat_manual'],
            ];
        }

        return $this->json($response, ['success' => true, 'data' => $out], 200);
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
        $scope = $this->titikLembagaScopeForList($user);
        [$extraSql, $bind] = $this->scopeLembagaSqlForTitik($scope, 'l');
        $joinAddr = '';
        $addrCols = '';
        if ($this->alamatRelOk()) {
            $joinAddr = ' LEFT JOIN absen___alamat adm ON adm.id = l.id_absen_alamat ';
            $addrCols = ', adm.dusun, adm.rt, adm.rw, adm.desa, adm.kecamatan, adm.kabupaten, adm.provinsi, l.id_absen_alamat, adm.latitude AS alamat_latitude, adm.longitude AS alamat_longitude, adm.radius_meter AS alamat_radius_meter';
        } elseif ($this->lokasiLegacyAlamatColumnsOk()) {
            $addrCols = ', l.dusun, l.rt, l.rw, l.desa, l.kecamatan, l.kabupaten, l.provinsi';
        }
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
            FROM absen___lokasi l ' . $joinAddr . '
            LEFT JOIN lembaga lg ON lg.id = l.id_lembaga
            WHERE 1=1 ' . $extraSql . '
            ORDER BY l.sort_order ASC, l.id ASC';
        $st = $this->db->prepare($sql);
        $st->execute($bind);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        $pid = RoleHelper::getPengurusIdFromPayload($user);
        $strictMandiri = ($pid !== null && $pid > 0)
            ? RoleHelper::resolveAbsenMandiriLembagaScope($user, $pid)
            : null;
        foreach ($rows as &$row) {
            $row['mandiri_diizinkan'] = $this->rowMandiriDiizinkan($strictMandiri, $row);
        }
        unset($row);

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
        $nama = ProperCaseHelper::forBiodataField('nama', $nama) ?? '';
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
        [$dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi] = ProperCaseHelper::normalizeAddrSeven(
            $dusun,
            $rt,
            $rw,
            $desa,
            $kecamatan,
            $kabupaten,
            $provinsi
        );

        if ($nama === '' || $lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->json($response, ['success' => false, 'message' => 'nama, latitude, longitude wajib valid'], 400);
        }

        $scope = $this->titikLembagaScopeForList($user);
        if ($scope !== null && $idLembaga !== null) {
            if ($scope === [] || !in_array($idLembaga, $scope, true)) {
                return $this->json($response, ['success' => false, 'message' => 'Lembaga tidak dalam jangkauan Anda'], 403);
            }
        }
        if ($scope !== null && $scope !== [] && $idLembaga === null) {
            // non-super dengan scope: lokasi global (semua lembaga) tidak diperbolehkan
            return $this->json($response, ['success' => false, 'message' => 'Pilih lembaga untuk lokasi ini'], 400);
        }

        $wantsAlamatPayload = self::bodyMemintaPenyimpananAlamat($body)
            || $this->bodyHasExplicitClearAlamatLink($body)
            || (isset($body['id_absen_alamat']) && (int) $body['id_absen_alamat'] > 0);
        $useNewAlamat = $this->alamatRelOk();
        $useLegacyAlamatCols = !$useNewAlamat && $this->lokasiLegacyAlamatColumnsOk();
        if ($wantsAlamatPayload && !$useNewAlamat && !$useLegacyAlamatCols) {
            return $this->json($response, [
                'success' => false,
                'code' => 'absen_lokasi_alamat_migration_required',
                'message' => 'Basis data belum punya skema alamat absen (tabel absen___alamat). Jalankan migrasi Phinx di folder api '
                    . '(php vendor/bin/phinx migrate).',
            ], 503);
        }

        $idAbsenAlamatResolved = null;
        if ($useNewAlamat) {
            $resolved = $this->resolveIdAbsenAlamatForLokasiSave($user, $body, $idLembaga, false, null);
            if ($resolved === -1) {
                return $this->json($response, ['success' => false, 'message' => 'Alamat terpilih tidak ditemukan atau di luar jangkauan Anda'], 404);
            }
            if ($resolved === -2) {
                return $this->json($response, ['success' => false, 'message' => 'Alamat tidak selaras dengan lembaga titik lokasi'], 400);
            }
            $idAbsenAlamatResolved = $resolved > 0 ? $resolved : null;
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
            if ($useNewAlamat && $hasJam && $hasJamTelat) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order, id_absen_alamat,
                        jam_mulai_pagi, jam_telat_pagi, jam_mulai_sore, jam_telat_sore, jam_mulai_malam, jam_telat_malam)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort, $idAbsenAlamatResolved,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM,
                ]);
            } elseif ($useNewAlamat && $hasJam) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order, id_absen_alamat,
                        jam_mulai_pagi, jam_mulai_sore, jam_mulai_malam)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort, $idAbsenAlamatResolved,
                    $jmP, $jmS, $jmM,
                ]);
            } elseif ($useNewAlamat) {
                $ins = $this->db->prepare(
                    'INSERT INTO absen___lokasi (nama, latitude, longitude, radius_meter, id_lembaga, aktif, sort_order, id_absen_alamat)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([$nama, $lat, $lng, $radius, $idLembaga, $aktif, $sort, $idAbsenAlamatResolved]);
            } elseif ($useLegacyAlamatCols && $hasJam && $hasJamTelat) {
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
            } elseif ($useLegacyAlamatCols && $hasJam) {
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
            } elseif ($useLegacyAlamatCols) {
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
        $scope = $this->titikLembagaScopeForList($user);
        [$extraSql, $bindScope] = $this->scopeLembagaSqlForTitik($scope, 'l');

        $body = $this->requestJsonBody($request);
        $cur = $this->db->prepare('SELECT * FROM absen___lokasi l WHERE l.id = ?' . $extraSql);
        $cur->execute(array_merge([$id], $bindScope));
        $row = $cur->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return $this->json($response, ['success' => false, 'message' => 'Lokasi tidak ditemukan'], 404);
        }

        $nama = trim((string) ($body['nama'] ?? $row['nama'] ?? ''));
        $nama = ProperCaseHelper::forBiodataField('nama', $nama) ?? '';
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
        $rowAddr = $row;
        if ($this->alamatRelOk()) {
            $aid0 = isset($row['id_absen_alamat']) ? (int) $row['id_absen_alamat'] : 0;
            if ($aid0 > 0) {
                $adm = $this->fetchAlamatRowVisibleToUser($aid0, $user);
                if ($adm !== null) {
                    foreach (['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi'] as $k) {
                        $rowAddr[$k] = $adm[$k] ?? null;
                    }
                }
            }
        }
        $dusun = self::addrFromBodyOrRow($body, $rowAddr, 'dusun', 191);
        $rt = self::addrFromBodyOrRow($body, $rowAddr, 'rt', 32);
        $rw = self::addrFromBodyOrRow($body, $rowAddr, 'rw', 32);
        $desa = self::addrFromBodyOrRow($body, $rowAddr, 'desa', 191);
        $kecamatan = self::addrFromBodyOrRow($body, $rowAddr, 'kecamatan', 191);
        $kabupaten = self::addrFromBodyOrRow($body, $rowAddr, 'kabupaten', 191);
        $provinsi = self::addrFromBodyOrRow($body, $rowAddr, 'provinsi', 191);
        [$dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi] = ProperCaseHelper::normalizeAddrSeven(
            $dusun,
            $rt,
            $rw,
            $desa,
            $kecamatan,
            $kabupaten,
            $provinsi
        );

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

        $wantsAlamatPayload = self::bodyMemintaPenyimpananAlamat($body)
            || $this->bodyHasExplicitClearAlamatLink($body)
            || (isset($body['id_absen_alamat']) && (int) $body['id_absen_alamat'] > 0);
        $useNewAlamat = $this->alamatRelOk();
        $useLegacyAlamatCols = !$useNewAlamat && $this->lokasiLegacyAlamatColumnsOk();
        if ($wantsAlamatPayload && !$useNewAlamat && !$useLegacyAlamatCols) {
            return $this->json($response, [
                'success' => false,
                'code' => 'absen_lokasi_alamat_migration_required',
                'message' => 'Basis data belum punya skema alamat absen (tabel absen___alamat). Jalankan migrasi Phinx di folder api '
                    . '(php vendor/bin/phinx migrate).',
            ], 503);
        }

        $touchAlamat = array_key_exists('id_absen_alamat', $body)
            || self::bodyMemintaPenyimpananAlamat($body)
            || $this->bodyHasExplicitClearAlamatLink($body);
        $idAbsenAlamatResolved = null;
        if ($useNewAlamat) {
            if ($touchAlamat) {
                $resolved = $this->resolveIdAbsenAlamatForLokasiSave($user, $body, $idLembagaNew, true, $row);
                if ($resolved === -1) {
                    return $this->json($response, ['success' => false, 'message' => 'Alamat terpilih tidak ditemukan atau di luar jangkauan Anda'], 404);
                }
                if ($resolved === -2) {
                    return $this->json($response, ['success' => false, 'message' => 'Alamat tidak selaras dengan lembaga titik lokasi'], 400);
                }
                $idAbsenAlamatResolved = $resolved > 0 ? $resolved : null;
            } else {
                $curAid = isset($row['id_absen_alamat']) ? (int) $row['id_absen_alamat'] : 0;
                $idAbsenAlamatResolved = $curAid > 0 ? $curAid : null;
            }
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
            if ($useNewAlamat && $hasJam && $hasJamTelat) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?, id_absen_alamat = ?,
                     jam_mulai_pagi = ?, jam_telat_pagi = ?, jam_mulai_sore = ?, jam_telat_sore = ?, jam_mulai_malam = ?, jam_telat_malam = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort, $idAbsenAlamatResolved,
                    $jmP, $jtP, $jmS, $jtS, $jmM, $jtM, $id,
                ]);
            } elseif ($useNewAlamat && $hasJam) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?, id_absen_alamat = ?,
                     jam_mulai_pagi = ?, jam_mulai_sore = ?, jam_mulai_malam = ?
                     WHERE id = ?'
                );
                $upd->execute([
                    $nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort, $idAbsenAlamatResolved,
                    $jmP, $jmS, $jmM, $id,
                ]);
            } elseif ($useNewAlamat) {
                $upd = $this->db->prepare(
                    'UPDATE absen___lokasi SET nama = ?, latitude = ?, longitude = ?, radius_meter = ?,
                     id_lembaga = ?, aktif = ?, sort_order = ?, id_absen_alamat = ?
                     WHERE id = ?'
                );
                $upd->execute([$nama, $lat, $lng, $radius, $idLembagaNew, $aktif, $sort, $idAbsenAlamatResolved, $id]);
            } elseif ($useLegacyAlamatCols && $hasJam && $hasJamTelat) {
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
            } elseif ($useLegacyAlamatCols && $hasJam) {
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
            } elseif ($useLegacyAlamatCols) {
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
        $scope = $this->titikLembagaScopeForList($user);
        [$extraSql, $bindScope] = $this->scopeLembagaSqlForTitik($scope, 'l');
        $chk = $this->db->prepare('SELECT id FROM absen___lokasi l WHERE l.id = ?' . $extraSql);
        $chk->execute(array_merge([$id], $bindScope));
        if (!$chk->fetchColumn()) {
            return $this->json($response, ['success' => false, 'message' => 'Lokasi tidak ditemukan'], 404);
        }
        $this->db->prepare('DELETE FROM absen___lokasi WHERE id = ?')->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Lokasi dihapus'], 200);
    }
}
