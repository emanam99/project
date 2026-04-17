<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Pengaturan absen global (absen___setting): jadwal default, sidik jari, dll.
 */
final class AbsenSettingController
{
    private PDO $db;

    /** @var list<string> */
    private const KEYS = ['jadwal_default', 'sidik_jari_default', 'akses_absen_mandiri'];

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

    private function hasMenuAbsen(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.absen');
    }

    private function isSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
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

    private function tableOk(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___setting' LIMIT 1"
            );

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Normalisasi "HH:MM" atau "HH:MM:SS" → "HH:MM" */
    private static function normalizeHm(mixed $v): ?string
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

        return sprintf('%02d:%02d', $h, $min);
    }

    /**
     * @param array<string, mixed> $in
     *
     * @return array{pagi: array{mulai: string}, sore: array{mulai: string}, malam: array{mulai: string}}
     */
    private function normalizeJadwalDefault(array $in): array
    {
        $out = [];
        foreach (['pagi', 'sore', 'malam'] as $sesi) {
            $sub = isset($in[$sesi]) && is_array($in[$sesi]) ? $in[$sesi] : [];
            $mulai = self::normalizeHm($sub['mulai'] ?? null);
            if ($mulai === null) {
                throw new \InvalidArgumentException('Jadwal ' . $sesi . ': mulai wajib (format HH:MM)');
            }
            $out[$sesi] = ['mulai' => $mulai];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $in
     *
     * @return array{ikut_jadwal_default: bool, toleransi_telat_menit: int}
     */
    private function normalizeSidikDefault(array $in): array
    {
        $ikut = array_key_exists('ikut_jadwal_default', $in)
            ? (bool) $in['ikut_jadwal_default']
            : true;
        $tol = isset($in['toleransi_telat_menit']) ? (int) $in['toleransi_telat_menit'] : 0;
        $tol = max(0, min(240, $tol));

        return [
            'ikut_jadwal_default' => $ikut,
            'toleransi_telat_menit' => $tol,
        ];
    }

    /**
     * Pembatas tambahan absen mandiri GPS: kosong = tidak filter peran (perilaku fitur seperti biasa).
     *
     * @return array{role_keys: list<string>}
     */
    private function normalizeAksesAbsenMandiri(array $in): array
    {
        $keys = $in['role_keys'] ?? [];
        if (!is_array($keys)) {
            $keys = [];
        }
        $validKeys = [];
        try {
            $st = $this->db->query('SELECT `key` FROM `role`');
            while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
                $k = str_replace(' ', '_', strtolower(trim((string) ($row['key'] ?? ''))));
                if ($k !== '') {
                    $validKeys[$k] = true;
                }
            }
        } catch (\Throwable $e) {
            $validKeys = [];
        }
        $out = [];
        foreach ($keys as $k) {
            $k = str_replace(' ', '_', strtolower(trim((string) $k)));
            if ($k !== '' && isset($validKeys[$k])) {
                $out[] = $k;
            }
        }

        return ['role_keys' => array_values(array_unique($out))];
    }

    /**
     * GET /api/absen-setting
     */
    public function getAll(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canRead($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak melihat pengaturan absen'], 403);
        }
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => true, 'data' => new \stdClass()], 200);
        }
        $ph = implode(',', array_fill(0, count(self::KEYS), '?'));
        $st = $this->db->prepare("SELECT `kunci`, `nilai` FROM `absen___setting` WHERE `kunci` IN ({$ph})");
        $st->execute(self::KEYS);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $data = [];
        foreach ($rows as $r) {
            $k = (string) ($r['kunci'] ?? '');
            $raw = (string) ($r['nilai'] ?? '');
            $decoded = json_decode($raw, true);
            $data[$k] = is_array($decoded) ? $decoded : [];
        }
        foreach (self::KEYS as $k) {
            if (!isset($data[$k])) {
                $data[$k] = [];
            }
        }
        if (!isset($data['akses_absen_mandiri']['role_keys']) || !is_array($data['akses_absen_mandiri']['role_keys'])) {
            $data['akses_absen_mandiri'] = ['role_keys' => []];
        }

        /** @var list<array{key: string, label: string}> $roleOptions */
        $roleOptions = [];
        try {
            $st = $this->db->query('SELECT `key`, `label` FROM `role` ORDER BY `label` ASC');
            while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
                $rk = str_replace(' ', '_', strtolower(trim((string) ($row['key'] ?? ''))));
                if ($rk === '') {
                    continue;
                }
                $roleOptions[] = [
                    'key' => $rk,
                    'label' => (string) ($row['label'] ?? $rk),
                ];
            }
        } catch (\Throwable $e) {
            $roleOptions = [];
        }
        $data['role_options_mandiri'] = $roleOptions;

        return $this->json($response, ['success' => true, 'data' => $data], 200);
    }

    /**
     * PUT /api/absen-setting — body: { "jadwal_default": {...}, "sidik_jari_default": {...} } (parsial diperbolehkan)
     */
    public function put(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canUbah($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengubah pengaturan absen'], 403);
        }
        if (!$this->tableOk()) {
            return $this->json($response, ['success' => false, 'message' => 'Tabel pengaturan absen belum tersedia'], 503);
        }
        $body = $this->requestJsonBody($request);
        $upsert = $this->db->prepare(
            'INSERT INTO `absen___setting` (`kunci`, `nilai`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `nilai` = VALUES(`nilai`)'
        );

        try {
            if (array_key_exists('jadwal_default', $body)) {
                $jd = $body['jadwal_default'];
                if (!is_array($jd)) {
                    return $this->json($response, ['success' => false, 'message' => 'jadwal_default harus objek'], 400);
                }
                $norm = $this->normalizeJadwalDefault($jd);
                $upsert->execute(['jadwal_default', json_encode($norm, JSON_UNESCAPED_UNICODE)]);
            }
            if (array_key_exists('sidik_jari_default', $body)) {
                $sd = $body['sidik_jari_default'];
                if (!is_array($sd)) {
                    return $this->json($response, ['success' => false, 'message' => 'sidik_jari_default harus objek'], 400);
                }
                $norm = $this->normalizeSidikDefault($sd);
                $upsert->execute(['sidik_jari_default', json_encode($norm, JSON_UNESCAPED_UNICODE)]);
            }
            if (array_key_exists('akses_absen_mandiri', $body)) {
                $am = $body['akses_absen_mandiri'];
                if (!is_array($am)) {
                    return $this->json($response, ['success' => false, 'message' => 'akses_absen_mandiri harus objek'], 400);
                }
                $norm = $this->normalizeAksesAbsenMandiri($am);
                $upsert->execute(['akses_absen_mandiri', json_encode($norm, JSON_UNESCAPED_UNICODE)]);
            }
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pengaturan'], 500);
        }

        return $this->json($response, ['success' => true, 'message' => 'Pengaturan disimpan'], 200);
    }
}
