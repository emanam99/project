<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Controllers\PaymentController;
use App\Database;
use App\Helpers\BisyarohPotongKewajibanApplier;
use App\Helpers\TahunAjaranActiveHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Portal MyBeddien untuk akun staff eBeddien: taut santri sendiri, akses portal, potongan Bisyaroh per santri.
 */
final class MeMybeddianController
{
    private PDO $db;

    private string $mybeddianUrl;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $this->mybeddianUrl = rtrim((string) ($config['app']['mybeddian_url'] ?? 'http://localhost:5174'), '/');
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @param array<string, mixed> $payload */
    private function resolveUsersId(array $payload): ?int
    {
        if (isset($payload['users_id']) && (int) $payload['users_id'] > 0) {
            return (int) $payload['users_id'];
        }
        $pid = (int) ($payload['id_pengurus'] ?? $payload['user_id'] ?? 0);
        if ($pid <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT `id_user` FROM `pengurus` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$pid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (is_array($row) && !empty($row['id_user'])) {
            return (int) $row['id_user'];
        }

        return $pid;
    }

    private function bisyarohPotongSchemaReady(): bool
    {
        return BisyarohPotongKewajibanApplier::featureEnabled($this->db);
    }

    private static function digitsOnly(string $s): string
    {
        return preg_replace('/\D/', '', $s) ?? '';
    }

    private function isLocalDevAppUrl(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host === '' || $host === 'localhost' || $host === '127.0.0.1';
    }

    /** Selaraskan portal MyBeddien dengan host eBeddien pemanggil bila config masih localhost. */
    private function resolveMybeddianUrl(Request $request): string
    {
        $base = $this->mybeddianUrl;
        if (!$this->isLocalDevAppUrl($base)) {
            return $base;
        }
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin === '' || !preg_match('#^https?://#i', $origin)) {
            $referer = trim($request->getHeaderLine('Referer'));
            if ($referer !== '' && preg_match('#^https?://#i', $referer)) {
                $parts = parse_url($referer);
                if (is_array($parts) && !empty($parts['scheme']) && !empty($parts['host'])) {
                    $origin = $parts['scheme'] . '://' . $parts['host'];
                    if (!empty($parts['port'])) {
                        $origin .= ':' . $parts['port'];
                    }
                }
            }
        }
        if ($origin === '') {
            return $base;
        }
        $host = strtolower((string) parse_url($origin, PHP_URL_HOST));
        if ($host === 'ebeddien2.alutsmani.id' || $host === 'ebeddien2.alutsmani.my.id') {
            return 'https://mybeddien2.alutsmani.id';
        }
        if ($host === 'ebeddien.alutsmani.id' || $host === 'ebeddien.alutsmani.my.id') {
            return 'https://mybeddien.alutsmani.id';
        }

        return $base;
    }

    /**
     * GET /api/v2/me/mybeddian
     *
     * @param array<string, mixed> $user
     */
    public function get(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users — hubungi admin'], 400);
        }
        $stmt = $this->db->prepare(
            'SELECT `id`, COALESCE(`access_mybeddian_santri`, 1) AS `access_mybeddian_santri`
             FROM `users` WHERE `id` = ? LIMIT 1'
        );
        $stmt->execute([$usersId]);
        $urow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$urow) {
            return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
        }
        $santriStmt = $this->db->prepare('SELECT `id`, `nis`, `nama`, `nik` FROM `santri` WHERE `id_user` = ? ORDER BY `id` ASC');
        $santriStmt->execute([$usersId]);
        $santriRows = $santriStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!is_array($santriRows)) {
            $santriRows = [];
        }
        $santriIds = array_values(array_filter(array_map(static fn ($r) => (int) ($r['id'] ?? 0), $santriRows), static fn (int $x) => $x > 0));
        $uwabaRincianBySantri = $this->buildUwabaRincianMapForSantriIds($santriIds);
        $potongTa = null;
        foreach ($uwabaRincianBySantri as $ur) {
            if (is_array($ur) && !empty($ur['tahun_ajaran'])) {
                $potongTa = (string) $ur['tahun_ajaran'];
                break;
            }
        }
        $potongBulanBySantri = ($potongTa !== null && $potongTa !== '')
            ? BisyarohPotongKewajibanApplier::fetchPotongBulanMapForSantriIds($this->db, $santriIds, $potongTa)
            : [];
        $santriList = [];
        foreach ($santriRows as $r) {
            $sid = (int) ($r['id'] ?? 0);
            $santriList[] = [
                'id' => $sid,
                'nis' => $r['nis'] ?? null,
                'nama' => (string) ($r['nama'] ?? ''),
                'has_nik' => trim((string) ($r['nik'] ?? '')) !== '',
                'uwaba_rincian' => $uwabaRincianBySantri[$sid] ?? null,
                'potong_bulan' => $potongBulanBySantri[$sid] ?? null,
            ];
        }
        $bisyarohPotong = [];
        if ($this->bisyarohPotongSchemaReady()) {
            $q = <<<'SQL'
SELECT b.`id` AS bisyaroh_id, b.`nama` AS bisyaroh_nama,
       s.`id` AS id_santri, s.`nama` AS santri_nama, s.`nis`,
       CASE WHEN ps.`id_santri` IS NULL THEN 1 ELSE ps.`aktif` END AS potong_aktif
FROM `bisyaroh` b
INNER JOIN `santri` s ON s.`id_user` = ?
LEFT JOIN `bisyaroh___potong_santri` ps ON ps.`bisyaroh_id` = b.`id` AND ps.`id_santri` = s.`id`
WHERE b.`aktif` = 1
ORDER BY b.`id` ASC, s.`id` ASC
SQL;
            $st = $this->db->prepare($q);
            $st->execute([$usersId]);
            $byBid = [];
            while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
                $bid = (int) $row['bisyaroh_id'];
                if (!isset($byBid[$bid])) {
                    $byBid[$bid] = [
                        'bisyaroh_id' => $bid,
                        'nama' => (string) ($row['bisyaroh_nama'] ?? ''),
                        'potong_master_aktif' => true,
                        'santri' => [],
                    ];
                }
                $byBid[$bid]['santri'][] = [
                    'id_santri' => (int) $row['id_santri'],
                    'nama' => (string) ($row['santri_nama'] ?? ''),
                    'nis' => $row['nis'] ?? null,
                    'potong_aktif' => !empty($row['potong_aktif']),
                ];
            }
            foreach ($byBid as $bidKey => &$blockData) {
                $bidInt = (int) $bidKey;
                $blockData['potong_uwaba_preview'] = BisyarohPotongKewajibanApplier::previewPotongPerBulan($this->db, $bidInt, $usersId);
                $ids = [];
                foreach ($blockData['santri'] as $sr) {
                    $ids[] = (int) ($sr['id_santri'] ?? 0);
                }
                $lastMap = BisyarohPotongKewajibanApplier::lastPotongNominalPerSantri($this->db, $bidInt, $ids);
                $periodeRekap = (string) ($blockData['potong_uwaba_preview']['rekap_periode_bulan'] ?? '');
                $periodeOk = $periodeRekap !== '' && preg_match('/^\d{4}-\d{2}$/', $periodeRekap);
                foreach ($blockData['santri'] as &$sr2) {
                    $sid = (int) ($sr2['id_santri'] ?? 0);
                    $sr2['last_potong_rupiah'] = $sid > 0 && isset($lastMap[$sid]) ? $lastMap[$sid] : null;
                    $sr2['uwaba_bulan_rekap'] = ($periodeOk && $sid > 0)
                        ? BisyarohPotongKewajibanApplier::fetchUwabaTagihanForSantriMasehiPeriode($this->db, $sid, $periodeRekap)
                        : null;
                }
                unset($sr2);
            }
            unset($blockData);
            $bisyarohPotong = array_values($byBid);
        }

        return $this->json($response, [
            'success' => true,
            'data' => [
                'users_id' => $usersId,
                'mybeddian_url' => $this->resolveMybeddianUrl($request),
                'access_mybeddian_santri' => (int) ($urow['access_mybeddian_santri'] ?? 1),
                'santri_list' => $santriList,
                'bisyaroh_potong' => $bisyarohPotong,
            ],
        ]);
    }

    /**
     * @param list<int> $santriIds
     *
     * @return array<int, array{tahun_ajaran: string, total: array<string, int>, rincian: list<array<string, mixed>>}|null>
     */
    private function buildUwabaRincianMapForSantriIds(array $santriIds): array
    {
        if ($santriIds === []) {
            return [];
        }
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'uwaba'");
            if (!$stmt || $stmt->rowCount() === 0) {
                return [];
            }
        } catch (\Throwable $e) {
            return [];
        }
        $taCtx = TahunAjaranActiveHelper::resolveHijriyahKonteksForMasehiDate(
            $this->db,
            (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d')
        );
        $tahunAjaran = isset($taCtx['tahun_ajaran']) && trim((string) $taCtx['tahun_ajaran']) !== ''
            ? trim((string) $taCtx['tahun_ajaran'])
            : null;
        if ($tahunAjaran === null) {
            return [];
        }

        $pay = new PaymentController();
        $map = [];
        foreach ($santriIds as $sid) {
            $sid = (int) $sid;
            if ($sid <= 0) {
                continue;
            }
            try {
                $payload = $pay->getPublicUwabaRincianForTahun($sid, $tahunAjaran);
                $map[$sid] = [
                    'tahun_ajaran' => $tahunAjaran,
                    'total' => $payload['total'] ?? ['total' => 0, 'bayar' => 0, 'kurang' => 0],
                    'rincian' => $payload['rincian'] ?? [],
                ];
            } catch (\Throwable $e) {
                $map[$sid] = null;
            }
        }

        return $map;
    }

    /**
     * Cari santri yang bisa ditautkan berdasarkan NIK (hanya digit yang dibandingkan).
     *
     * @return list<array<string, mixed>>
     */
    private function findLinkableSantriByNikDigits(int $usersId, string $nikDigits): array
    {
        if ($nikDigits === '') {
            return [];
        }
        $stmt = $this->db->prepare(
            'SELECT `id`, `nik`, `nama`, `nis`, `id_user` FROM `santri`
            WHERE (`id_user` IS NULL OR `id_user` = ?)
            AND `nik` IS NOT NULL AND TRIM(`nik`) != \'\''
        );
        $stmt->execute([$usersId]);
        $matches = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (self::digitsOnly((string) ($r['nik'] ?? '')) === $nikDigits) {
                $matches[] = $r;
            }
        }

        return $matches;
    }

    /**
     * GET /api/v2/me/mybeddian/santri-by-nik?nik=
     *
     * @param array<string, mixed> $user
     */
    public function santriByNik(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $raw = trim((string) ($request->getQueryParams()['nik'] ?? ''));
        $digits = self::digitsOnly($raw);
        if (strlen($digits) < 10) {
            return $this->json($response, [
                'success' => true,
                'data' => ['status' => 'too_short', 'min_digits' => 10],
            ]);
        }
        $matches = $this->findLinkableSantriByNikDigits($usersId, $digits);
        if ($matches === []) {
            return $this->json($response, ['success' => true, 'data' => ['status' => 'not_found']]);
        }
        if (count($matches) > 1) {
            return $this->json($response, [
                'success' => true,
                'data' => ['status' => 'ambiguous', 'count' => count($matches)],
            ]);
        }
        $r = $matches[0];
        $sid = (int) $r['id'];
        $currentUid = $r['id_user'] !== null ? (int) $r['id_user'] : null;
        $santriOut = [
            'id' => $sid,
            'nama' => (string) ($r['nama'] ?? ''),
            'nis' => $r['nis'] ?? null,
        ];
        if ($currentUid !== null && $currentUid === $usersId) {
            return $this->json($response, [
                'success' => true,
                'data' => array_merge(['status' => 'already_linked'], ['santri' => $santriOut]),
            ]);
        }
        if ($currentUid !== null && $currentUid !== $usersId) {
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'status' => 'other_account',
                    'santri' => ['nama' => (string) ($r['nama'] ?? ''), 'nis' => $r['nis'] ?? null],
                ],
            ]);
        }

        return $this->json($response, [
            'success' => true,
            'data' => array_merge(['status' => 'can_link'], ['santri' => $santriOut]),
        ]);
    }

    /**
     * GET /api/v2/me/mybeddian/santri-search?q=
     *
     * @param array<string, mixed> $user
     */
    public function searchSantri(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $q = trim((string) ($request->getQueryParams()['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            return $this->json($response, ['success' => true, 'data' => []]);
        }
        $limit = 30;
        $like = '%' . $q . '%';
        $sql = 'SELECT `id`, `nis`, `nama`, `id_user` FROM `santri`
            WHERE (`id_user` IS NULL OR `id_user` = ?)
            AND (`nis` LIKE ? OR `nama` LIKE ?)
            ORDER BY `nama` ASC
            LIMIT ' . (int) $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$usersId, $like, $like]);
        $list = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $list[] = [
                'id' => (int) $r['id'],
                'nis' => $r['nis'] ?? null,
                'nama' => (string) ($r['nama'] ?? ''),
                'id_user' => $r['id_user'] !== null ? (int) $r['id_user'] : null,
            ];
        }

        return $this->json($response, ['success' => true, 'data' => $list]);
    }

    /**
     * PUT /api/v2/me/mybeddian/link-santri — body: nik (wajib, minimal 10 digit), atau santri_id + nik (legacy).
     *
     * @param array<string, mixed> $user
     */
    public function linkSantri(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $inNikDigits = self::digitsOnly(trim((string) ($body['nik'] ?? '')));
        $sid = isset($body['santri_id']) ? (int) $body['santri_id'] : 0;

        if ($sid <= 0) {
            if (strlen($inNikDigits) < 10) {
                return $this->json($response, ['success' => false, 'message' => 'NIK wajib diisi (minimal 10 digit)'], 400);
            }
            $matches = $this->findLinkableSantriByNikDigits($usersId, $inNikDigits);
            if ($matches === []) {
                return $this->json($response, ['success' => false, 'message' => 'Santri dengan NIK ini tidak ditemukan atau tidak bisa ditautkan mandiri'], 404);
            }
            if (count($matches) > 1) {
                return $this->json($response, ['success' => false, 'message' => 'Lebih dari satu santri memiliki NIK yang sama — hubungi admin'], 409);
            }
            $sid = (int) $matches[0]['id'];
        }

        $stmt = $this->db->prepare('SELECT `id`, `id_user`, `nik` FROM `santri` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$sid]);
        $s = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$s) {
            return $this->json($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
        }
        $currentUid = $s['id_user'] !== null ? (int) $s['id_user'] : null;
        if ($currentUid !== null && $currentUid === $usersId) {
            return $this->json($response, ['success' => true, 'message' => 'Santri sudah tertaut ke akun Anda']);
        }
        if ($currentUid !== null && $currentUid !== $usersId) {
            return $this->json($response, ['success' => false, 'message' => 'Santri sudah tertaut ke akun lain — hubungi admin'], 409);
        }
        $dbNik = trim((string) ($s['nik'] ?? ''));
        if ($dbNik !== '') {
            if ($inNikDigits === '' || $inNikDigits !== self::digitsOnly($dbNik)) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak cocok dengan data santri'], 400);
            }
        } else {
            return $this->json($response, ['success' => false, 'message' => 'Data santri belum memiliki NIK — hubungi admin'], 400);
        }
        $this->db->prepare('UPDATE `santri` SET `id_user` = ? WHERE `id` = ?')->execute([$usersId, $sid]);

        return $this->json($response, ['success' => true, 'message' => 'Santri berhasil ditautkan']);
    }

    /**
     * DELETE /api/v2/me/mybeddian/santri/{santriId}
     *
     * @param array<string, mixed> $user
     */
    public function unlinkSantri(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $sid = isset($args['santriId']) ? (int) $args['santriId'] : 0;
        if ($sid <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID santri tidak valid'], 400);
        }
        $up = $this->db->prepare('UPDATE `santri` SET `id_user` = NULL WHERE `id` = ? AND `id_user` = ?');
        $up->execute([$sid, $usersId]);
        if ($up->rowCount() === 0) {
            return $this->json($response, ['success' => false, 'message' => 'Santri tidak tertaut ke akun ini'], 404);
        }

        return $this->json($response, ['success' => true, 'message' => 'Tautan santri dilepas']);
    }

    /**
     * PUT /api/v2/me/mybeddian/portal-santri — body: access_mybeddian_santri (0|1).
     *
     * @param array<string, mixed> $user
     */
    public function putPortalSantri(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        if (!array_key_exists('access_mybeddian_santri', $body)) {
            return $this->json($response, ['success' => false, 'message' => 'access_mybeddian_santri wajib'], 400);
        }
        $v = (int) (bool) $body['access_mybeddian_santri'];
        $this->db->prepare('UPDATE `users` SET `access_mybeddian_santri` = ? WHERE `id` = ?')->execute([$v, $usersId]);

        return $this->json($response, ['success' => true, 'message' => 'Pengaturan portal disimpan']);
    }

    /**
     * PUT /api/v2/me/mybeddian/potong-uwaba-bulan — body: id_santri, tahun_ajaran, id_bulan (hijriyah UWABA: 11,12,1–8), aktif.
     * Pilih bulan UWABA tujuan potong Bisyaroh berikutnya (satu bulan per santri per TA).
     *
     * @param array<string, mixed> $user
     */
    public function putPotongUwabaBulan(Request $request, Response $response): Response
    {
        if (!BisyarohPotongKewajibanApplier::potongBulanSchemaReady($this->db)) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur potong bulan UWABA belum tersedia di database'], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        $usersId = $this->resolveUsersId($user);
        if ($usersId === null || $usersId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak dapat menentukan akun users'], 400);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $sid = isset($body['id_santri']) ? (int) $body['id_santri'] : 0;
        $ta = isset($body['tahun_ajaran']) ? trim((string) $body['tahun_ajaran']) : '';
        $idBulan = isset($body['id_bulan']) ? (int) $body['id_bulan'] : 0;
        $aktif = !empty($body['aktif']);
        if ($sid <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
        }
        if ($ta === '') {
            return $this->json($response, ['success' => false, 'message' => 'tahun_ajaran wajib'], 400);
        }
        if (!BisyarohPotongKewajibanApplier::isValidUwabaIdBulan($idBulan)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'id_bulan harus bulan syahriah UWABA (11, 12, atau 1–8) — sama dengan kolom uwaba.id_bulan',
            ], 400);
        }
        $stmt = $this->db->prepare('SELECT `id` FROM `santri` WHERE `id` = ? AND `id_user` = ? LIMIT 1');
        $stmt->execute([$sid, $usersId]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            return $this->json($response, ['success' => false, 'message' => 'Santri bukan milik akun Anda'], 400);
        }
        if ($aktif) {
            if (!BisyarohPotongKewajibanApplier::isUwabaBulanBelumLunas($this->db, $sid, $ta, $idBulan)) {
                return $this->json($response, ['success' => false, 'message' => 'Bulan UWABA sudah lunas atau belum ada tagihan wajib'], 400);
            }
            $ins = $this->db->prepare(
                'INSERT INTO `santri___potong_uwaba_bulan` (`id_santri`, `tahun_ajaran`, `id_bulan`) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE `id_bulan` = VALUES(`id_bulan`)'
            );
            $ins->execute([$sid, $ta, $idBulan]);
        } else {
            $del = $this->db->prepare(
                'DELETE FROM `santri___potong_uwaba_bulan` WHERE `id_santri` = ? AND `tahun_ajaran` = ?'
            );
            $del->execute([$sid, $ta]);
        }

        return $this->json($response, ['success' => true, 'message' => 'Pengaturan potong bulan disimpan']);
    }

    /**
     * @deprecated Gunakan putPotongUwabaBulan — body legacy: bisyaroh_id, santri_potong.
     *
     * @param array<string, mixed> $user
     */
    public function putBisyarohPotong(Request $request, Response $response): Response
    {
        return $this->json($response, [
            'success' => false,
            'message' => 'Endpoint usang. Gunakan PUT /api/v2/me/mybeddian/potong-uwaba-bulan (pilih bulan UWABA, bukan per set Bisyaroh).',
        ], 410);
    }
}
