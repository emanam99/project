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
 * CRUD master alamat pratinjau absen (absen___alamat) — dipakai bersama titik lokasi GPS.
 */
final class AbsenAlamatController
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

    private function requestJsonBody(Request $request): array
    {
        $parsed = $request->getParsedBody();

        return is_array($parsed) ? $parsed : [];
    }

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

    private function isSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    /**
     * @return array{ok: true, latitude: ?float, longitude: ?float, radius_meter: ?int}|array{ok: false, message: string}
     */
    private function resolveAlamatGpsColumns(array $body, ?array $row, bool $isCreate): array
    {
        if ($isCreate) {
            $lat = array_key_exists('latitude', $body) ? AbsenLokasiGeo::floatCoord($body['latitude']) : null;
            $lng = array_key_exists('longitude', $body) ? AbsenLokasiGeo::floatCoord($body['longitude']) : null;
            $radRaw = $body['radius_meter'] ?? null;
            $rad = $radRaw === null || $radRaw === '' ? null : (int) $radRaw;
        } else {
            $touch = array_key_exists('latitude', $body)
                || array_key_exists('longitude', $body)
                || array_key_exists('radius_meter', $body);
            if (!$touch && $row !== null) {
                $lat = AbsenLokasiGeo::floatCoord($row['latitude'] ?? null);
                $lng = AbsenLokasiGeo::floatCoord($row['longitude'] ?? null);
                $rad = isset($row['radius_meter']) && $row['radius_meter'] !== null && $row['radius_meter'] !== ''
                    ? (int) $row['radius_meter'] : null;
            } else {
                $lat = array_key_exists('latitude', $body)
                    ? AbsenLokasiGeo::floatCoord($body['latitude'])
                    : ($row !== null ? AbsenLokasiGeo::floatCoord($row['latitude'] ?? null) : null);
                $lng = array_key_exists('longitude', $body)
                    ? AbsenLokasiGeo::floatCoord($body['longitude'])
                    : ($row !== null ? AbsenLokasiGeo::floatCoord($row['longitude'] ?? null) : null);
                $radRaw = array_key_exists('radius_meter', $body) ? $body['radius_meter'] : ($row['radius_meter'] ?? null);
                $rad = $radRaw === null || $radRaw === '' ? null : (int) $radRaw;
            }
        }
        if (($lat === null) !== ($lng === null)) {
            return ['ok' => false, 'message' => 'Latitude dan longitude wajib berpasangan, atau kosongkan keduanya'];
        }
        if ($lat === null && $lng === null) {
            return ['ok' => false, 'message' => 'Latitude dan longitude wajib diisi'];
        }
        if ($rad === null || $rad < 1) {
            $rad = 100;
        }
        $rad = min(25000, max(10, $rad));

        return ['ok' => true, 'latitude' => $lat, 'longitude' => $lng, 'radius_meter' => $rad];
    }

    private function hasMenuAbsen(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.absen');
    }

    private function apiHasLokasiGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.lokasi.');
    }

    private function apiHasTabGranular(array $user): bool
    {
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.tab.');
    }

    private function apiHasAnyAbsenActionGranular(array $user): bool
    {
        return $this->apiHasLokasiGranular($user) || $this->apiHasTabGranular($user);
    }

    private function hasKalenderLokasi(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.kalender.pengaturan.tab_lokasi')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.kalender.pengaturan');
    }

    private function canRead(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if ($this->hasKalenderLokasi($user)) {
            return true;
        }
        if (!$this->hasMenuAbsen($user)) {
            return false;
        }
        if (!$this->apiHasAnyAbsenActionGranular($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.list')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.tambah')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.ubah')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.hapus')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.pengaturan');
    }

    private function canTambah(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if ($this->hasKalenderLokasi($user)) {
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
        if ($this->hasKalenderLokasi($user)) {
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
        if ($this->hasKalenderLokasi($user)) {
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
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___alamat' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function countLokasiPakaiAlamat(int $alamatId): int
    {
        try {
            $st = $this->db->prepare('SELECT COUNT(*) FROM absen___lokasi WHERE id_absen_alamat = ?');
            $st->execute([$alamatId]);

            return (int) $st->fetchColumn();
        } catch (\Throwable $e) {
            return 999;
        }
    }

    /**
     * GET /api/absen-alamat — master alamat umum (tanpa id_lembaga; pemilahan lembaga di titik lokasi).
     */
    public function getList(Request $request, Response $response): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => true, 'data' => []], 200);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canRead($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak melihat alamat absen'], 403);
        }

        $sql = 'SELECT a.id, a.dusun, a.rt, a.rw, a.desa, a.kecamatan, a.kabupaten, a.provinsi,
                a.latitude, a.longitude, a.radius_meter
            FROM absen___alamat a
            ORDER BY a.id ASC';
        $st = $this->db->query($sql);
        $rows = $st === false ? [] : $st->fetchAll(PDO::FETCH_ASSOC);

        return $this->json($response, ['success' => true, 'data' => $rows], 200);
    }

    /**
     * POST /api/absen-alamat
     */
    public function create(Request $request, Response $response): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Tabel alamat absen belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canTambah($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak menambah alamat'], 403);
        }
        $body = $this->requestJsonBody($request);
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
            return $this->json($response, ['success' => false, 'message' => 'Isi minimal satu bagian alamat'], 400);
        }

        $gps = $this->resolveAlamatGpsColumns($body, null, true);
        if (!($gps['ok'] ?? false)) {
            return $this->json($response, ['success' => false, 'message' => (string) ($gps['message'] ?? 'Data GPS tidak valid')], 400);
        }

        try {
            $ins = $this->db->prepare(
                'INSERT INTO absen___alamat (dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, latitude, longitude, radius_meter)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi,
                $gps['latitude'],
                $gps['longitude'],
                $gps['radius_meter'],
            ]);
        } catch (\Throwable $e) {
            error_log('AbsenAlamatController::create: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan alamat'], 500);
        }
        $id = (int) $this->db->lastInsertId();

        return $this->json($response, ['success' => true, 'message' => 'Alamat disimpan', 'data' => ['id' => $id]], 201);
    }

    /**
     * PUT /api/absen-alamat/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Tabel alamat absen belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canUbah($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengubah alamat'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $cur = $this->db->prepare('SELECT * FROM absen___alamat a WHERE a.id = ?');
        $cur->execute([$id]);
        $row = $cur->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return $this->json($response, ['success' => false, 'message' => 'Alamat tidak ditemukan'], 404);
        }

        $body = $this->requestJsonBody($request);

        $dusun = array_key_exists('dusun', $body) ? self::optStringAddr($body['dusun'], 191) : self::optStringAddr($row['dusun'] ?? null, 191);
        $rt = array_key_exists('rt', $body) ? self::optStringAddr($body['rt'], 32) : self::optStringAddr($row['rt'] ?? null, 32);
        $rw = array_key_exists('rw', $body) ? self::optStringAddr($body['rw'], 32) : self::optStringAddr($row['rw'] ?? null, 32);
        $desa = array_key_exists('desa', $body) ? self::optStringAddr($body['desa'], 191) : self::optStringAddr($row['desa'] ?? null, 191);
        $kecamatan = array_key_exists('kecamatan', $body) ? self::optStringAddr($body['kecamatan'], 191) : self::optStringAddr($row['kecamatan'] ?? null, 191);
        $kabupaten = array_key_exists('kabupaten', $body) ? self::optStringAddr($body['kabupaten'], 191) : self::optStringAddr($row['kabupaten'] ?? null, 191);
        $provinsi = array_key_exists('provinsi', $body) ? self::optStringAddr($body['provinsi'], 191) : self::optStringAddr($row['provinsi'] ?? null, 191);

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
            return $this->json($response, ['success' => false, 'message' => 'Isi minimal satu bagian alamat'], 400);
        }

        $gps = $this->resolveAlamatGpsColumns($body, $row, false);
        if (!($gps['ok'] ?? false)) {
            return $this->json($response, ['success' => false, 'message' => (string) ($gps['message'] ?? 'Data GPS tidak valid')], 400);
        }

        try {
            $upd = $this->db->prepare(
                'UPDATE absen___alamat SET dusun = ?, rt = ?, rw = ?, desa = ?, kecamatan = ?, kabupaten = ?, provinsi = ?,
                 latitude = ?, longitude = ?, radius_meter = ? WHERE id = ?'
            );
            $upd->execute([
                $dusun, $rt, $rw, $desa, $kecamatan, $kabupaten, $provinsi,
                $gps['latitude'],
                $gps['longitude'],
                $gps['radius_meter'],
                $id,
            ]);
        } catch (\Throwable $e) {
            error_log('AbsenAlamatController::update: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui alamat'], 500);
        }

        return $this->json($response, ['success' => true, 'message' => 'Alamat diperbarui'], 200);
    }

    /**
     * DELETE /api/absen-alamat/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Tabel alamat absen belum tersedia'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canHapus($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak menghapus alamat'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $chk = $this->db->prepare('SELECT id FROM absen___alamat a WHERE a.id = ?');
        $chk->execute([$id]);
        if (!$chk->fetchColumn()) {
            return $this->json($response, ['success' => false, 'message' => 'Alamat tidak ditemukan'], 404);
        }
        if ($this->countLokasiPakaiAlamat($id) > 0) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Alamat masih dipakai oleh satu atau lebih titik lokasi — lepaskan tautan di titik lokasi dulu',
            ], 409);
        }
        $this->db->prepare('DELETE FROM absen___alamat WHERE id = ?')->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Alamat dihapus'], 200);
    }
}
