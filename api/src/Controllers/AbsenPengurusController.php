<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Support\AbsenPengurusSession;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Rekap absensi pengurus (sidik jari) — super_admin.
 */
class AbsenPengurusController
{
    private PDO $db;

    /** Durasi tampilan jika tidak ada pasangan absen keluar (kebijakan UI). */
    private const TANPA_KELUAR_DETIK_DEFAULT = 3600;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function sqlAbsenCalendarDateExpr(): string
    {
        return "DATE(COALESCE(
            NULLIF(STR_TO_DATE(TRIM(a.timestamp), '%Y-%m-%d %H:%i:%s'), '0000-00-00'),
            NULLIF(STR_TO_DATE(TRIM(a.timestamp), '%Y/%m/%d %H:%i:%s'), '0000-00-00'),
            a.tanggal_dibuat
        ))";
    }

    /**
     * Urutan tap masuk/keluar hari kalender tertentu (FIFO pasangan, selaras attachKeluarPairingAndSesi).
     *
     * @return list<array<string, mixed>>
     */
    private function fetchMasukKeluarEventsForCalendarDay(int $idPengurus, string $calendarDayYmd): array
    {
        $dateExpr = $this->sqlAbsenCalendarDateExpr();
        $sql = 'SELECT a.id, a.timestamp AS device_timestamp, a.tanggal_dibuat, a.status
            FROM absen___pengurus a
            WHERE a.id_pengurus = ?
              AND (' . $dateExpr . ") = ?
              AND (
                LOWER(COALESCE(a.status, '')) LIKE '%masuk%'
                OR LOWER(COALESCE(a.status, '')) LIKE '%keluar%'
              )
            ORDER BY COALESCE(
                STR_TO_DATE(NULLIF(TRIM(a.timestamp), ''), '%Y-%m-%d %H:%i:%s'),
                STR_TO_DATE(NULLIF(TRIM(a.timestamp), ''), '%Y/%m/%d %H:%i:%s'),
                a.tanggal_dibuat
            ) ASC, a.id ASC";
        try {
            $st = $this->db->prepare($sql);
            $st->execute([$idPengurus, $calendarDayYmd]);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('AbsenPengurusController::fetchMasukKeluarEventsForCalendarDay: ' . $e->getMessage());

            return [];
        }

        return is_array($rows) ? $rows : [];
    }

    /**
     * Aturan absen mandiri: satu siklus masuk→keluar per sesi (pagi/sore/malam) per hari;
     * jika ada masuk belum berpasangan (slot mana pun), tombol masuk untuk sesi berikutnya disembunyikan sampai keluar.
     *
     * @return array{
     *   tanggal:string,
     *   slot_sekarang:string,
     *   slot_label:string,
     *   boleh_masuk:bool,
     *   boleh_keluar:bool,
     *   masuk_terbuka: array{id:int,jam:string,sesi:string,sesi_label:string}|null
     * }
     */
    private function computeMandiriAbsenGate(int $idPengurus, int $nowUnix): array
    {
        $tanggal = AbsenPengurusSession::dayKeyForUnixTs($nowUnix);
        $slotSekarang = AbsenPengurusSession::sessionSlotForUnixTs($nowUnix);
        $slotLabel = AbsenPengurusSession::sesiLabelIndonesia($slotSekarang);

        $events = $this->fetchMasukKeluarEventsForCalendarDay($idPengurus, $tanggal);
        $queue = [];
        foreach ($events as $e) {
            $isMasuk = AbsenPengurusSession::isMasukStatus($e['status'] ?? null);
            $isKeluar = AbsenPengurusSession::isKeluarStatus($e['status'] ?? null);
            if ($isMasuk) {
                $queue[] = $e;
            } elseif ($isKeluar && $queue !== []) {
                array_shift($queue);
            }
        }

        $masukTerbuka = null;
        if ($queue !== []) {
            $open = $queue[0];
            $tsOpen = AbsenPengurusSession::resolveDisplayUnixTs($open);
            if ($tsOpen !== null) {
                $slotOpen = AbsenPengurusSession::sessionSlotForUnixTs($tsOpen);
                $masukTerbuka = [
                    'id' => (int) ($open['id'] ?? 0),
                    'jam' => date('H:i:s', $tsOpen),
                    'sesi' => $slotOpen,
                    'sesi_label' => AbsenPengurusSession::sesiLabelIndonesia($slotOpen),
                ];
            }
        }

        $bolehKeluar = $masukTerbuka !== null;

        $adaMasukDiSlotSekarang = false;
        foreach ($events as $e) {
            if (!AbsenPengurusSession::isMasukStatus($e['status'] ?? null)) {
                continue;
            }
            $ts = AbsenPengurusSession::resolveDisplayUnixTs($e);
            if ($ts === null) {
                continue;
            }
            if (AbsenPengurusSession::dayKeyForUnixTs($ts) !== $tanggal) {
                continue;
            }
            if (AbsenPengurusSession::sessionSlotForUnixTs($ts) === $slotSekarang) {
                $adaMasukDiSlotSekarang = true;
                break;
            }
        }

        $bolehMasuk = !$bolehKeluar && !$adaMasukDiSlotSekarang;

        return [
            'tanggal' => $tanggal,
            'slot_sekarang' => $slotSekarang,
            'slot_label' => $slotLabel,
            'boleh_masuk' => $bolehMasuk,
            'boleh_keluar' => $bolehKeluar,
            'masuk_terbuka' => $masukTerbuka,
        ];
    }

    /**
     * GET /api/absen-pengurus/mandiri-slot — status tombol masuk/keluar (pengurus login, hari & sesi berjalan).
     */
    public function getMandiriSlot(Request $request, Response $response): Response
    {
        if (!$this->tableExists()) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal' => date('Y-m-d'),
                    'slot_sekarang' => AbsenPengurusSession::sessionSlotForUnixTs(time()),
                    'slot_label' => AbsenPengurusSession::sesiLabelIndonesia(AbsenPengurusSession::sessionSlotForUnixTs(time())),
                    'boleh_masuk' => true,
                    'boleh_keluar' => false,
                    'masuk_terbuka' => null,
                ],
            ], 200);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canNgabsenLokasi($user)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak berhak'], 403);
        }
        $idPengurus = RoleHelper::getPengurusIdFromPayload($user);
        if ($idPengurus === null || $idPengurus <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Hanya akun pengurus'], 403);
        }

        $gate = $this->computeMandiriAbsenGate($idPengurus, time());

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => array_merge($gate, [
                'server_time' => date('Y-m-d H:i:s'),
            ]),
        ], 200);
    }

    private function formatDurasiIndonesia(int $detik): string
    {
        if ($detik <= 0) {
            return '0 dtk';
        }
        $j = intdiv($detik, 3600);
        $m = intdiv($detik % 3600, 60);
        $d = $detik % 60;
        $parts = [];
        if ($j > 0) {
            $parts[] = $j . ' jam';
        }
        if ($m > 0) {
            $parts[] = $m . ' mnt';
        }
        if ($d > 0 && $j === 0 && $m === 0) {
            $parts[] = $d . ' dtk';
        }
        if ($parts === []) {
            $parts[] = $d . ' dtk';
        }

        return implode(' ', $parts);
    }

    /**
     * Sesi (pagi/sore/malam), jam masuk dengan detik, pasangan keluar + durasi; tanpa keluar = 1 jam default.
     *
     * @param array<int, array<string, mixed>> $rows
     */
    private function attachKeluarPairingAndSesi(array &$rows): void
    {
        if ($rows === []) {
            return;
        }
        $pairSet = [];
        foreach ($rows as $r) {
            $day = $r['group_date'] ?? null;
            if ($day === null || $day === '') {
                continue;
            }
            $pairSet[(int) ($r['pengurus_id'] ?? 0) . '|' . $day] = true;
        }
        if ($pairSet === []) {
            foreach ($rows as &$row) {
                $this->applySesiAndDefaultDurasiRow($row);
            }
            unset($row);

            return;
        }
        $dateExpr = $this->sqlAbsenCalendarDateExpr();
        $orParts = [];
        $bind = [];
        foreach (array_keys($pairSet) as $key) {
            $parts = explode('|', $key, 2);
            $pidStr = $parts[0];
            $day = $parts[1] ?? '';
            $orParts[] = '(a.id_pengurus = ? AND ' . $dateExpr . ' = ?)';
            $bind[] = (int) $pidStr;
            $bind[] = $day;
        }
        $sql = 'SELECT a.id, a.timestamp AS device_timestamp, a.tanggal_dibuat, a.status, a.id_pengurus
            FROM absen___pengurus a
            WHERE (' . implode(' OR ', $orParts) . ')
              AND (
                LOWER(COALESCE(a.status, \'\')) LIKE \'%masuk%\'
                OR LOWER(COALESCE(a.status, \'\')) LIKE \'%keluar%\'
              )
            ORDER BY a.id_pengurus ASC, COALESCE(
                STR_TO_DATE(NULLIF(TRIM(a.timestamp), \'\'), \'%Y-%m-%d %H:%i:%s\'),
                STR_TO_DATE(NULLIF(TRIM(a.timestamp), \'\'), \'%Y/%m/%d %H:%i:%s\'),
                a.tanggal_dibuat
            ) ASC, a.id ASC';
        try {
            $st = $this->db->prepare($sql);
            $st->execute($bind);
            $events = $st->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('AbsenPengurusController::attachKeluarPairingAndSesi: ' . $e->getMessage());
            foreach ($rows as &$row) {
                $this->applySesiAndDefaultDurasiRow($row);
            }
            unset($row);

            return;
        }
        $byPair = [];
        foreach ($events as $e) {
            $ts = AbsenPengurusSession::resolveDisplayUnixTs($e);
            if ($ts === null) {
                continue;
            }
            $day = AbsenPengurusSession::dayKeyForUnixTs($ts);
            $k = (int) ($e['id_pengurus'] ?? 0) . '|' . $day;
            if (!isset($pairSet[$k])) {
                continue;
            }
            $isMasuk = AbsenPengurusSession::isMasukStatus($e['status'] ?? null);
            $isKeluar = AbsenPengurusSession::isKeluarStatus($e['status'] ?? null);
            if (!$isMasuk && !$isKeluar) {
                continue;
            }
            if (!isset($byPair[$k])) {
                $byPair[$k] = [];
            }
            $byPair[$k][] = [
                'row' => $e,
                'ts' => $ts,
                'masuk' => $isMasuk,
            ];
        }
        $masukIdToKeluarRow = [];
        foreach ($byPair as $list) {
            $queue = [];
            foreach ($list as $item) {
                if ($item['masuk']) {
                    $queue[] = $item;
                } elseif ($queue !== []) {
                    $m = array_shift($queue);
                    $masukIdToKeluarRow[(int) $m['row']['id']] = $item['row'];
                }
            }
        }
        foreach ($rows as &$row) {
            $mid = (int) ($row['id'] ?? 0);
            $tsMasuk = AbsenPengurusSession::resolveDisplayUnixTs($row);
            if ($tsMasuk !== null) {
                $slot = AbsenPengurusSession::sessionSlotForUnixTs($tsMasuk);
                $row['sesi'] = $slot;
                $row['sesi_label'] = AbsenPengurusSession::sesiLabelIndonesia($slot);
                $row['jam_masuk'] = date('H:i:s', $tsMasuk);
            } else {
                $row['sesi'] = null;
                $row['sesi_label'] = null;
                $row['jam_masuk'] = null;
            }
            $keluarRow = $masukIdToKeluarRow[$mid] ?? null;
            if ($keluarRow !== null) {
                $tsKeluar = AbsenPengurusSession::resolveDisplayUnixTs($keluarRow);
                $row['keluar_ada'] = true;
                $row['jam_keluar'] = $tsKeluar !== null ? date('H:i:s', $tsKeluar) : null;
                if ($tsMasuk !== null && $tsKeluar !== null && $tsKeluar >= $tsMasuk) {
                    $row['durasi_detik'] = $tsKeluar - $tsMasuk;
                    $row['durasi_label'] = $this->formatDurasiIndonesia($row['durasi_detik']);
                } else {
                    $row['durasi_detik'] = 0;
                    $row['durasi_label'] = '—';
                }
            } else {
                $row['keluar_ada'] = false;
                $row['jam_keluar'] = null;
                $row['durasi_detik'] = self::TANPA_KELUAR_DETIK_DEFAULT;
                $row['durasi_label'] = '1 jam (tanpa absen keluar)';
            }
            unset($row['device_timestamp']);
        }
        unset($row);
    }

    /** @param array<string, mixed> $row */
    private function applySesiAndDefaultDurasiRow(array &$row): void
    {
        $tsMasuk = AbsenPengurusSession::resolveDisplayUnixTs($row);
        if ($tsMasuk !== null) {
            $slot = AbsenPengurusSession::sessionSlotForUnixTs($tsMasuk);
            $row['sesi'] = $slot;
            $row['sesi_label'] = AbsenPengurusSession::sesiLabelIndonesia($slot);
            $row['jam_masuk'] = date('H:i:s', $tsMasuk);
        } else {
            $row['sesi'] = null;
            $row['sesi_label'] = null;
            $row['jam_masuk'] = null;
        }
        $row['keluar_ada'] = false;
        $row['jam_keluar'] = null;
        $row['durasi_detik'] = self::TANPA_KELUAR_DETIK_DEFAULT;
        $row['durasi_label'] = '1 jam (tanpa absen keluar)';
        unset($row['device_timestamp']);
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function tableExists(): bool
    {
        try {
            $stmt = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___pengurus' LIMIT 1"
            );
            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function absenPengurusHasLokasiColumns(): bool
    {
        try {
            $st = $this->db->query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
                 AND table_name = 'absen___pengurus' AND column_name = 'sumber_absen' LIMIT 1"
            );
            if (!$st->fetchColumn()) {
                return false;
            }
            $st2 = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___lokasi' LIMIT 1"
            );

            return (bool) $st2->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R = 6371000.0;
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $dphi = deg2rad($lat2 - $lat1);
        $dlambda = deg2rad($lon2 - $lon1);
        $a = sin($dphi / 2) ** 2 + cos($phi1) * cos($phi2) * sin($dlambda / 2) ** 2;

        return 2 * $R * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Absen mandiri GPS: jika ada aksi granular action.absen.lokasi.* → wajib action.absen.lokasi.absen;
     * selain itu perilaku lama (tab Ngabsen / tab Absen bila granular tab saja).
     */
    private function canNgabsenLokasi(array $user): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }
        if (!RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.absen')) {
            return false;
        }
        $hasTabGranular = RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.tab.');
        $hasLokasiGranular = RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.absen.lokasi.');
        if (!$hasTabGranular && !$hasLokasiGranular) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.absen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.tab.ngabsen')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.absen.lokasi.absen');
    }

    /** null = semua lembaga; [] = tidak ada scope */
    private function userLembagaScopeIds(array $user): ?array
    {
        if (!empty($user['is_real_super_admin'])) {
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
     * POST /api/absen-pengurus/lokasi — catat absen dari GPS (pengurus login).
     *
     * Body: latitude, longitude, status (Masuk|Keluar), id_lokasi (opsional)
     */
    public function postLokasi(Request $request, Response $response): Response
    {
        if (!$this->tableExists() || !$this->absenPengurusHasLokasiColumns()) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Fitur absen lokasi belum tersedia (jalankan migrasi basis data)',
            ], 503);
        }
        try {
            $chk = $this->db->query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'absen___lokasi' LIMIT 1"
            );
            if (!$chk->fetchColumn()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel lokasi absen belum ada',
                ], 503);
            }
        } catch (\Throwable $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Fitur absen lokasi belum tersedia',
            ], 503);
        }
        $user = $request->getAttribute('user');
        $user = is_array($user) ? $user : [];
        if (!$this->canNgabsenLokasi($user)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak berhak absen dari aplikasi'], 403);
        }
        $idPengurus = RoleHelper::getPengurusIdFromPayload($user);
        if ($idPengurus === null || $idPengurus <= 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Hanya akun pengurus yang dapat absen di sini',
            ], 403);
        }

        $parsed = $request->getParsedBody();
        $body = is_array($parsed) ? $parsed : [];
        $lat = isset($body['latitude']) ? (float) $body['latitude'] : null;
        $lng = isset($body['longitude']) ? (float) $body['longitude'] : null;
        $statusRaw = trim((string) ($body['status'] ?? 'Masuk'));
        $statusNorm = mb_stripos($statusRaw, 'keluar') !== false ? 'Keluar' : 'Masuk';
        $idLokasiReq = isset($body['id_lokasi']) ? (int) $body['id_lokasi'] : 0;

        if ($lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Koordinat tidak valid'], 400);
        }

        $accSlack = 0.0;
        if (isset($body['accuracy'])) {
            $a = (float) $body['accuracy'];
            if ($a > 0 && is_finite($a)) {
                $accSlack = min($a, 120.0);
            }
        }

        $scope = $this->userLembagaScopeIds($user);
        $st = $this->db->query(
            'SELECT id, nama, latitude, longitude, radius_meter, id_lembaga FROM absen___lokasi WHERE aktif = 1'
        );
        $lokasiRows = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
        $candidates = [];
        foreach ($lokasiRows as $L) {
            $lid = (int) $L['id'];
            $idLem = $L['id_lembaga'] !== null && $L['id_lembaga'] !== '' ? (string) $L['id_lembaga'] : null;
            if ($scope !== null && $scope !== []) {
                if ($idLem !== null && !in_array($idLem, $scope, true)) {
                    continue;
                }
            }
            if ($scope !== null && $scope === [] && $idLem !== null) {
                continue;
            }
            $dist = self::haversineMeters($lat, $lng, (float) $L['latitude'], (float) $L['longitude']);
            $rad = max(10, (int) $L['radius_meter']) + $accSlack;
            if ($dist <= $rad) {
                $candidates[] = ['row' => $L, 'dist' => $dist];
            }
        }
        if ($candidates === []) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Anda di luar zona lokasi absen yang aktif',
            ], 422);
        }
        usort($candidates, static fn (array $a, array $b): int => $a['dist'] <=> $b['dist']);
        $picked = null;
        if ($idLokasiReq > 0) {
            foreach ($candidates as $c) {
                if ((int) $c['row']['id'] === $idLokasiReq) {
                    $picked = $c['row'];
                    break;
                }
            }
            if ($picked === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Lokasi yang dipilih tidak valid atau Anda di luar radius',
                ], 422);
            }
        } else {
            $picked = $candidates[0]['row'];
        }

        $gate = $this->computeMandiriAbsenGate($idPengurus, time());
        if ($statusNorm === 'Masuk' && !$gate['boleh_masuk']) {
            $msg = 'Untuk sesi ' . ($gate['slot_label'] ?? '') . ' hari ini absen masuk sudah tercatat.';
            if (!empty($gate['masuk_terbuka'])) {
                $mt = $gate['masuk_terbuka'];
                $msg = 'Lakukan absen keluar terlebih dahulu (masuk tercatat sesi '
                    . ($mt['sesi_label'] ?? '') . ' pukul ' . ($mt['jam'] ?? '') . ').';
            }

            return $this->jsonResponse($response, ['success' => false, 'message' => trim($msg)], 409);
        }
        if ($statusNorm === 'Keluar' && !$gate['boleh_keluar']) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Absen keluar hanya setelah ada absen masuk hari ini yang belum berpasangan keluar.',
            ], 409);
        }

        $now = date('Y-m-d H:i:s');
        $meta = [
            'lat' => $lat,
            'lng' => $lng,
            'accuracy' => isset($body['accuracy']) ? (float) $body['accuracy'] : null,
            'lokasi_id' => (int) $picked['id'],
            'sumber' => 'lokasi_gps',
        ];
        $rawJson = json_encode($meta, JSON_UNESCAPED_UNICODE);

        try {
            $ins = $this->db->prepare(
                'INSERT INTO absen___pengurus (`timestamp`, id_pengurus, sumber_absen, id_absen_lokasi, status, verified, work_code, raw_data)
                 VALUES (?, ?, \'lokasi_gps\', ?, ?, 1, \'0\', ?)'
            );
            $ins->execute([$now, $idPengurus, (int) $picked['id'], $statusNorm, $rawJson]);
            $newId = (int) $this->db->lastInsertId();
        } catch (\Throwable $e) {
            error_log('AbsenPengurusController::postLokasi: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan absensi'], 500);
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Absensi tercatat',
            'data' => [
                'id' => $newId,
                'status' => $statusNorm,
                'lokasi_nama' => $picked['nama'] ?? '',
                'timestamp' => $now,
            ],
        ], 201);
    }

    /**
     * GET /api/absen-pengurus?q=&lembaga_id=&limit=50&offset=0
     */
    public function getList(Request $request, Response $response): Response
    {
        if (!$this->tableExists()) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [],
                'total' => 0,
                'limit' => 50,
                'offset' => 0,
            ], 200);
        }

        $params = $request->getQueryParams();
        $q = trim((string) ($params['q'] ?? $params['search'] ?? ''));
        $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
        $lembagaId = $lembagaId === '' ? null : $lembagaId;

        $limit = (int) ($params['limit'] ?? 50);
        if ($limit < 1) {
            $limit = 50;
        }
        if ($limit > 100) {
            $limit = 100;
        }
        $offset = (int) ($params['offset'] ?? 0);
        if ($offset < 0) {
            $offset = 0;
        }

        $where = ' WHERE 1=1 ';
        $bind = [];

        if ($lembagaId !== null && $lembagaId !== '') {
            $where .= " AND EXISTS (
                SELECT 1 FROM pengurus___jabatan pj
                WHERE pj.pengurus_id = p.id
                  AND pj.lembaga_id = ?
                  AND (pj.status = 'aktif' OR pj.status IS NULL OR TRIM(COALESCE(pj.status,'')) = '')
            )";
            $bind[] = $lembagaId;
        }

        if ($q !== '') {
            $q = str_replace(['%', '_'], '', $q);
        }
        if ($q !== '') {
            $like = '%' . $q . '%';
            $where .= ' AND (
                p.nama LIKE ?
                OR CAST(p.nip AS CHAR) LIKE ?
                OR a.status LIKE ?
                OR a.timestamp LIKE ?
                OR a.raw_data LIKE ?
            )';
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
        }

        $where .= " AND LOWER(COALESCE(a.status, '')) LIKE '%masuk%' ";

        $hasLoc = $this->absenPengurusHasLokasiColumns();
        $locJoin = $hasLoc ? ' LEFT JOIN absen___lokasi al ON al.id = a.id_absen_lokasi ' : '';
        $locFields = $hasLoc
            ? 'a.sumber_absen, a.id_absen_lokasi, al.nama AS lokasi_nama'
            : "NULL AS sumber_absen, NULL AS id_absen_lokasi, NULL AS lokasi_nama";

        $from = "
            FROM absen___pengurus a
            INNER JOIN pengurus p ON p.id = a.id_pengurus
            $locJoin
            $where
        ";

        try {
            $countStmt = $this->db->prepare("SELECT COUNT(*) $from");
            $countStmt->execute($bind);
            $total = (int) $countStmt->fetchColumn();

            $lembagaSub = "
                (SELECT GROUP_CONCAT(DISTINCT l.nama ORDER BY l.nama SEPARATOR ' · ')
                 FROM pengurus___jabatan pj2
                 LEFT JOIN lembaga l ON l.id = pj2.lembaga_id
                 WHERE pj2.pengurus_id = p.id
                   AND (pj2.status = 'aktif' OR pj2.status IS NULL OR TRIM(COALESCE(pj2.status,'')) = '')
                )
            ";

            $sql = "
                SELECT
                    a.id,
                    a.timestamp AS device_timestamp,
                    a.status,
                    a.verified,
                    a.work_code,
                    a.tanggal_dibuat,
                    $locFields,
                    p.id AS pengurus_id,
                    p.nama AS pengurus_nama,
                    p.nip AS pengurus_nip,
                    $lembagaSub AS lembaga_label
                $from
                ORDER BY COALESCE(
                    STR_TO_DATE(NULLIF(TRIM(a.timestamp), ''), '%Y-%m-%d %H:%i:%s'),
                    STR_TO_DATE(NULLIF(TRIM(a.timestamp), ''), '%Y/%m/%d %H:%i:%s'),
                    a.tanggal_dibuat
                ) DESC, a.id DESC
                LIMIT " . (int) $limit . " OFFSET " . (int) $offset . "
            ";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($rows as &$row) {
                $ts = AbsenPengurusSession::resolveDisplayUnixTs($row);
                $row['time_from_device'] = AbsenPengurusSession::displayTimeIsFromDevice($row);
                if ($ts === null) {
                    $row['display_at'] = null;
                    $row['group_date'] = null;
                } else {
                    $row['display_at'] = date('c', $ts);
                    $row['group_date'] = date('Y-m-d', $ts);
                }
            }
            unset($row);

            $this->attachKeluarPairingAndSesi($rows);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
            ], 200);
        } catch (\Throwable $e) {
            error_log('AbsenPengurusController::getList: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat data absensi',
            ], 500);
        }
    }

    /**
     * GET /api/absen-pengurus/rekap?from=YYYY-MM-DD&to=YYYY-MM-DD&lembaga_id=
     * Agregat per pengurus per hari kalender dalam rentang; filter lembaga = jabatan aktif (sama seperti getList).
     */
    public function getRekap(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $fromS = trim((string) ($params['from'] ?? ''));
        $toS = trim((string) ($params['to'] ?? ''));
        $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
        $lembagaId = $lembagaId === '' ? null : $lembagaId;

        $from = \DateTimeImmutable::createFromFormat('Y-m-d', $fromS);
        $to = \DateTimeImmutable::createFromFormat('Y-m-d', $toS);
        if ($from === false || $to === false) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Parameter from dan to wajib format YYYY-MM-DD',
            ], 400);
        }
        if ($from > $to) {
            $tmp = $from;
            $from = $to;
            $to = $tmp;
            $fromS = $from->format('Y-m-d');
            $toS = $to->format('Y-m-d');
        }
        $maxDays = 366;
        if ($from->diff($to)->days > $maxDays) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal maksimal ' . $maxDays . ' hari',
            ], 400);
        }

        $dates = [];
        for ($d = $from; $d <= $to; $d = $d->modify('+1 day')) {
            $dates[] = $d->format('Y-m-d');
        }

        if (!$this->tableExists()) {
            return $this->jsonResponse($response, [
                'success' => true,
                'from' => $fromS,
                'to' => $toS,
                'dates' => $dates,
                'total_taps_in_period' => 0,
                'total_sesi_masuk' => 0,
                'rows' => [],
            ], 200);
        }

        $lembagaSub = "
            (SELECT GROUP_CONCAT(DISTINCT l.nama ORDER BY l.nama SEPARATOR ' · ')
             FROM pengurus___jabatan pj2
             LEFT JOIN lembaga l ON l.id = pj2.lembaga_id
             WHERE pj2.pengurus_id = p.id
               AND (pj2.status = 'aktif' OR pj2.status IS NULL OR TRIM(COALESCE(pj2.status,'')) = '')
            )
        ";

        $agg = [];

        try {
            if ($lembagaId !== null) {
                $sqlP = "
                    SELECT DISTINCT p.id, p.nama, p.nip, $lembagaSub AS lembaga_label
                    FROM pengurus p
                    INNER JOIN pengurus___jabatan pj ON pj.pengurus_id = p.id
                        AND pj.lembaga_id = ?
                        AND (pj.status = 'aktif' OR pj.status IS NULL OR TRIM(COALESCE(pj.status,'')) = '')
                ";
                $stP = $this->db->prepare($sqlP);
                $stP->execute([$lembagaId]);
                while ($row = $stP->fetch(PDO::FETCH_ASSOC)) {
                    $pid = (int) $row['id'];
                    $agg[$pid] = [
                        'pengurus_id' => $pid,
                        'nama' => (string) ($row['nama'] ?? ''),
                        'nip' => $row['nip'] !== null && $row['nip'] !== '' ? (string) $row['nip'] : null,
                        'lembaga_label' => (string) ($row['lembaga_label'] ?? ''),
                        'total' => 0,
                        'days' => [],
                    ];
                }
            }

            // Kandidat lebar: backlog offline (tanggal simpan DB jauh dari tanggal kejadian di mesin).
            // Penempatan hari & sesi di PHP hanya dari parse `timestamp` mesin (AbsenPengurusSession).
            $whereAbsen = ' WHERE DATE(COALESCE(
                NULLIF(STR_TO_DATE(TRIM(a.timestamp), \'%Y-%m-%d %H:%i:%s\'), \'0000-00-00\'),
                NULLIF(STR_TO_DATE(TRIM(a.timestamp), \'%Y/%m/%d %H:%i:%s\'), \'0000-00-00\'),
                a.tanggal_dibuat
            )) >= DATE_SUB(?, INTERVAL 120 DAY)
            AND DATE(COALESCE(
                NULLIF(STR_TO_DATE(TRIM(a.timestamp), \'%Y-%m-%d %H:%i:%s\'), \'0000-00-00\'),
                NULLIF(STR_TO_DATE(TRIM(a.timestamp), \'%Y/%m/%d %H:%i:%s\'), \'0000-00-00\'),
                a.tanggal_dibuat
            )) <= DATE_ADD(?, INTERVAL 120 DAY) ';
            $bindAbsen = [$fromS, $toS];

            $whereAbsen .= " AND LOWER(COALESCE(a.status, '')) LIKE '%masuk%' ";

            if ($lembagaId !== null) {
                $whereAbsen .= " AND EXISTS (
                    SELECT 1 FROM pengurus___jabatan pj3
                    WHERE pj3.pengurus_id = p.id
                      AND pj3.lembaga_id = ?
                      AND (pj3.status = 'aktif' OR pj3.status IS NULL OR TRIM(COALESCE(pj3.status,'')) = '')
                )";
                $bindAbsen[] = $lembagaId;
            }

            $sqlA = "
                SELECT a.id_pengurus, a.timestamp AS device_timestamp, a.tanggal_dibuat, a.status,
                       p.nama, p.nip, $lembagaSub AS lembaga_label
                FROM absen___pengurus a
                INNER JOIN pengurus p ON p.id = a.id_pengurus
                $whereAbsen
            ";
            $stA = $this->db->prepare($sqlA);
            $stA->execute($bindAbsen);
            $dateSet = array_flip($dates);
            /** @var array<int, array<string, array<string, bool>>> $seenSlots pengurus_id => day => slot => true */
            $seenSlots = [];

            while ($row = $stA->fetch(PDO::FETCH_ASSOC)) {
                $pid = (int) $row['id_pengurus'];
                $info = AbsenPengurusSession::masukSessionFromRow($row, $pid);
                if ($info === null) {
                    continue;
                }
                $dayKey = $info['day'];
                if (!isset($dateSet[$dayKey])) {
                    continue;
                }
                $slot = $info['slot'];
                if ($lembagaId === null && !isset($agg[$pid])) {
                    $agg[$pid] = [
                        'pengurus_id' => $pid,
                        'nama' => (string) ($row['nama'] ?? ''),
                        'nip' => $row['nip'] !== null && $row['nip'] !== '' ? (string) $row['nip'] : null,
                        'lembaga_label' => (string) ($row['lembaga_label'] ?? ''),
                        'total' => 0,
                        'days' => [],
                    ];
                }
                if (!isset($agg[$pid])) {
                    continue;
                }
                if (!isset($seenSlots[$pid])) {
                    $seenSlots[$pid] = [];
                }
                if (!isset($seenSlots[$pid][$dayKey])) {
                    $seenSlots[$pid][$dayKey] = [];
                }
                $seenSlots[$pid][$dayKey][$slot] = true;
            }

            $totalSesi = 0;
            foreach ($agg as $pid => &$rowAgg) {
                $daysOut = [];
                $sum = 0;
                if (isset($seenSlots[$pid])) {
                    foreach ($seenSlots[$pid] as $d => $slots) {
                        $c = count($slots);
                        if ($c > 0) {
                            $daysOut[$d] = $c;
                            $sum += $c;
                        }
                    }
                    ksort($daysOut);
                }
                $rowAgg['days'] = $daysOut;
                $rowAgg['total'] = $sum;
                $totalSesi += $sum;
            }
            unset($rowAgg);

            $rows = array_values($agg);
            usort($rows, static function (array $a, array $b): int {
                return strcasecmp((string) $a['nama'], (string) $b['nama']);
            });

            return $this->jsonResponse($response, [
                'success' => true,
                'from' => $fromS,
                'to' => $toS,
                'dates' => $dates,
                'total_taps_in_period' => $totalSesi,
                'total_sesi_masuk' => $totalSesi,
                'rows' => $rows,
            ], 200);
        } catch (\Throwable $e) {
            error_log('AbsenPengurusController::getRekap: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat rekap absensi',
            ], 500);
        }
    }
}
