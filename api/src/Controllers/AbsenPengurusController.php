<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
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

        $from = "
            FROM absen___pengurus a
            INNER JOIN pengurus p ON p.id = a.id_pengurus
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
