<?php

namespace App\Controllers;

use App\Config\Database;
use DateTimeImmutable;
use DateTimeZone;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class JurnalMengajarController {
    private const VALID_JAM = ['jam_1', 'jam_2'];
    private const VALID_STATUS = ['mengajar', 'ijin', 'sakit'];
    private const TIMEZONE = 'Asia/Jakarta';
    private const LOCK_HOUR = 24;

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $kelasId = $params['kelas_id'] ?? null;
        $pengurusId = $params['pengurus_id'] ?? null;
        $isAdmin = $this->isAdminAkses($params['akses'] ?? '');

        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter kelas wajib']);
        }
        if (!$pengurusId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID pengurus wajib']);
        }

        $tanggal = $this->todayString();
        $canEdit = !$this->isLocked();

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        $stmt = $db->prepare('
            SELECT j.id,
                   j.jam,
                   j.pengurus_id,
                   p.nama AS pengurus_nama,
                   j.status,
                   j.mapel_id,
                   j.deskripsi,
                   j.pelajaran,
                   j.alasan,
                   j.updated_at,
                   mp.dari AS mapel_dari,
                   mp.sampai AS mapel_sampai,
                   k.fan AS mapel_fan,
                   k.nama AS mapel_kitab,
                   k.musonnif AS mapel_musonnif
            FROM kelas___jurnal_mengajar j
            INNER JOIN pengurus p ON p.id = j.pengurus_id
            LEFT JOIN mapel mp ON mp.id = j.mapel_id
            LEFT JOIN kitab k ON k.id = mp.kitab_id
            WHERE j.kelas_id = :kelas_id AND j.tanggal = :tanggal
            ORDER BY j.jam ASC, p.nama ASC
        ');
        $stmt->execute(['kelas_id' => $kelasId, 'tanggal' => $tanggal]);
        $allRows = $stmt->fetchAll();

        $stmt = $db->prepare('
            SELECT mp.id, mp.kitab_id, mp.dari, mp.sampai,
                   k.fan, k.nama AS kitab_nama, k.musonnif
            FROM mapel mp
            INNER JOIN kitab k ON k.id = mp.kitab_id
            INNER JOIN kelas___mapel km ON km.mapel_id = mp.id
            WHERE km.kelas_id = :kelas_id
            ORDER BY k.fan ASC, k.nama ASC, mp.dari ASC
        ');
        $stmt->execute(['kelas_id' => $kelasId]);
        $mapelList = $stmt->fetchAll();

        $entries = ['jam_1' => [], 'jam_2' => []];
        $mine = ['jam_1' => null, 'jam_2' => null];
        $slots = [
            'jam_1' => ['occupied_by_other' => false, 'by_me' => false],
            'jam_2' => ['occupied_by_other' => false, 'by_me' => false],
        ];

        foreach ($allRows as $row) {
            $jam = $row['jam'];
            $item = $this->formatJurnalItem($row);

            $isMine = (string) $row['pengurus_id'] === (string) $pengurusId;
            if ($isMine) {
                $mine[$jam] = $item;
                $slots[$jam]['by_me'] = true;
            } elseif ($row['status'] === 'mengajar' && isset($slots[$jam])) {
                $slots[$jam]['occupied_by_other'] = true;
            }

            if ($isAdmin) {
                $entries[$jam][] = $item;
            }
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'entries' => $entries,
            'mine' => $mine,
            'slots' => $slots,
            'mapel_list' => $mapelList,
            'meta' => [
                'kelas_id' => $kelasId,
                'tanggal' => $tanggal,
                'can_edit' => $canEdit,
                'lock_hour' => self::LOCK_HOUR,
                'is_admin' => $isAdmin,
            ],
        ]);
    }

    public function save(Request $request, Response $response): Response {
        if ($this->isLocked()) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Jurnal hari ini sudah ditutup (setelah pukul 24.00). Silakan isi lagi besok.',
            ]);
        }

        $data = $this->parseBody($request);
        $kelasId = $data['kelas_id'] ?? null;
        $pengurusId = $data['pengurus_id'] ?? null;
        $jam = $data['jam'] ?? '';
        $status = strtolower(trim($data['status'] ?? ''));
        $mapelId = trim($data['mapel_id'] ?? '');
        $deskripsi = trim($data['deskripsi'] ?? '');
        $alasan = trim($data['alasan'] ?? '');
        $tanggal = $this->todayString();

        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID kelas wajib']);
        }
        if (!$pengurusId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID pengurus wajib']);
        }
        if (!in_array($jam, self::VALID_JAM, true)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kolom jam tidak valid']);
        }
        if (!in_array($status, self::VALID_STATUS, true)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Status jurnal tidak valid']);
        }

        $clientTanggal = trim($data['tanggal'] ?? '');
        if ($clientTanggal !== '' && $clientTanggal !== $tanggal) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Jurnal hanya dapat diisi untuk hari ini',
            ]);
        }

        if ($status === 'mengajar') {
            if ($mapelId === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Fan/mapel wajib dipilih']);
            }
            if ($deskripsi === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Deskripsi materi wajib diisi']);
            }
            $alasan = null;
        } else {
            if ($alasan === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Alasan wajib diisi']);
            }
            $mapelId = null;
            $deskripsi = null;
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan']);
        }

        if ($status === 'mengajar' && !$this->mapelAssignedToKelas($db, (int) $kelasId, (int) $mapelId)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Mapel tidak terdaftar di rombel ini']);
        }

        $stmt = $db->prepare('SELECT id FROM pengurus WHERE id = :id');
        $stmt->execute(['id' => $pengurusId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pengurus tidak ditemukan']);
        }

        $stmt = $db->prepare('
            SELECT id, pengurus_id FROM kelas___jurnal_mengajar
            WHERE kelas_id = :kelas_id AND tanggal = :tanggal AND jam = :jam AND pengurus_id = :pengurus_id
        ');
        $stmt->execute([
            'kelas_id' => $kelasId,
            'tanggal' => $tanggal,
            'jam' => $jam,
            'pengurus_id' => $pengurusId,
        ]);
        $existing = $stmt->fetch();

        if ($status === 'mengajar') {
            $stmt = $db->prepare('
                SELECT id, pengurus_id FROM kelas___jurnal_mengajar
                WHERE kelas_id = :kelas_id AND tanggal = :tanggal AND jam = :jam AND status = \'mengajar\'
            ');
            $stmt->execute([
                'kelas_id' => $kelasId,
                'tanggal' => $tanggal,
                'jam' => $jam,
            ]);
            $mengajarSlot = $stmt->fetch();
            if ($mengajarSlot && (string) $mengajarSlot['pengurus_id'] !== (string) $pengurusId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jurnal mengajar ' . str_replace('_', ' ', $jam) . ' sudah diisi guru lain',
                ]);
            }
        }

        if ($existing) {
            $stmt = $db->prepare('
                UPDATE kelas___jurnal_mengajar
                SET status = :status, mapel_id = :mapel_id, deskripsi = :deskripsi, pelajaran = NULL, alasan = :alasan
                WHERE id = :id
            ');
            $stmt->execute([
                'status' => $status,
                'mapel_id' => $mapelId,
                'deskripsi' => $deskripsi,
                'alasan' => $alasan,
                'id' => $existing['id'],
            ]);
        } else {
            $stmt = $db->prepare('
                INSERT INTO kelas___jurnal_mengajar (kelas_id, tanggal, jam, pengurus_id, status, mapel_id, deskripsi, alasan)
                VALUES (:kelas_id, :tanggal, :jam, :pengurus_id, :status, :mapel_id, :deskripsi, :alasan)
            ');
            $stmt->execute([
                'kelas_id' => $kelasId,
                'tanggal' => $tanggal,
                'jam' => $jam,
                'pengurus_id' => $pengurusId,
                'status' => $status,
                'mapel_id' => $mapelId,
                'deskripsi' => $deskripsi,
                'alasan' => $alasan,
            ]);
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Jurnal disimpan',
            'data' => [
                'kelas_id' => $kelasId,
                'tanggal' => $tanggal,
                'jam' => $jam,
                'pengurus_id' => $pengurusId,
                'status' => $status,
                'mapel_id' => $mapelId,
                'deskripsi' => $deskripsi,
                'alasan' => $alasan,
            ],
        ]);
    }

    public function rekapAbsenGuru(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $isAdmin = $this->isAdminAkses($params['akses'] ?? '');
        $selfPengurusId = trim((string) ($params['pengurus_id'] ?? ''));

        if (!$isAdmin && $selfPengurusId === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'ID pengurus wajib untuk rekap',
            ], 403);
        }

        $kelasIdsRaw = trim($params['kelas_ids'] ?? ($params['kelas_id'] ?? ''));
        $kelasIds = [];
        foreach (preg_split('/[,\s]+/', $kelasIdsRaw) as $part) {
            $id = (int) trim($part);
            if ($id > 0) {
                $kelasIds[$id] = $id;
            }
        }
        $kelasIds = array_values($kelasIds);

        $tanggalAwal = trim($params['tanggal_awal'] ?? '');
        $tanggalAkhir = trim($params['tanggal_akhir'] ?? '');

        $rangeError = $this->validateDateRange($tanggalAwal, $tanggalAkhir);
        if ($rangeError !== null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $rangeError]);
        }

        // +1 hari: toleransi Hijriyah setelah Maghrib
        $maxTanggal = $this->now()->modify('+1 day')->format('Y-m-d');
        if ($tanggalAkhir > $maxTanggal) {
            $tanggalAkhir = $maxTanggal;
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [],
                'meta' => $this->rekapMetaMulti($kelasIds, $tanggalAwal, $tanggalAkhir, 0),
            ]);
        }

        $db = Database::getInstance();
        $hariEfektif = $this->countDaysInclusive($tanggalAwal, $tanggalAkhir);

        $sql = '
            SELECT j.pengurus_id,
                   p.nama AS pengurus_nama,
                   j.jam,
                   j.status,
                   COUNT(*) AS cnt
            FROM kelas___jurnal_mengajar j
            INNER JOIN pengurus p ON p.id = j.pengurus_id
            WHERE j.tanggal BETWEEN :awal AND :akhir
        ';
        $bind = ['awal' => $tanggalAwal, 'akhir' => $tanggalAkhir];
        if (!empty($kelasIds)) {
            $placeholders = [];
            foreach ($kelasIds as $i => $kid) {
                $key = 'kelas_' . $i;
                $placeholders[] = ':' . $key;
                $bind[$key] = $kid;
            }
            $sql .= ' AND j.kelas_id IN (' . implode(',', $placeholders) . ')';
        }
        if (!$isAdmin) {
            $sql .= ' AND j.pengurus_id = :self_pengurus';
            $bind['self_pengurus'] = $selfPengurusId;
        }
        $sql .= ' GROUP BY j.pengurus_id, p.nama, j.jam, j.status ORDER BY p.nama ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $aggRows = $stmt->fetchAll();

        $map = [];
        foreach ($aggRows as $row) {
            $pid = (string) $row['pengurus_id'];
            if (!isset($map[$pid])) {
                $map[$pid] = [
                    'pengurus_id' => $pid,
                    'pengurus_nama' => $row['pengurus_nama'],
                    'jam_1' => ['mengajar' => 0, 'ijin' => 0, 'sakit' => 0],
                    'jam_2' => ['mengajar' => 0, 'ijin' => 0, 'sakit' => 0],
                ];
            }
            $jam = $row['jam'];
            $status = $row['status'];
            if (isset($map[$pid][$jam][$status])) {
                $map[$pid][$jam][$status] = (int) $row['cnt'];
            }
        }

        if ($isAdmin) {
            $stmt = $db->query('SELECT id, nama FROM pengurus ORDER BY nama ASC');
            $allPengurus = $stmt->fetchAll();
        } else {
            $stmt = $db->prepare('SELECT id, nama FROM pengurus WHERE id = :id');
            $stmt->execute(['id' => $selfPengurusId]);
            $allPengurus = $stmt->fetchAll();
        }

        $result = [];
        foreach ($allPengurus as $p) {
            $pid = (string) $p['id'];
            if (isset($map[$pid])) {
                $row = $map[$pid];
            } else {
                $row = [
                    'pengurus_id' => $pid,
                    'pengurus_nama' => $p['nama'],
                    'jam_1' => ['mengajar' => 0, 'ijin' => 0, 'sakit' => 0],
                    'jam_2' => ['mengajar' => 0, 'ijin' => 0, 'sakit' => 0],
                ];
            }
            $row['total'] = $this->sumJamCounts($row['jam_1'], $row['jam_2']);
            $result[] = $row;
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $result,
            'meta' => $this->rekapMetaMulti($kelasIds, $tanggalAwal, $tanggalAkhir, $hariEfektif),
        ]);
    }

    public function rekapJurnal(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $isAdmin = $this->isAdminAkses($params['akses'] ?? '');
        $kelasId = trim($params['kelas_id'] ?? '');
        $pengurusId = trim($params['pengurus_id'] ?? '');
        $tanggalAwal = trim($params['tanggal_awal'] ?? '');
        $tanggalAkhir = trim($params['tanggal_akhir'] ?? '');

        if (!$isAdmin && $pengurusId === '') {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'ID pengurus wajib untuk rekap',
            ], 403);
        }

        $rangeError = $this->validateDateRange($tanggalAwal, $tanggalAkhir);
        if ($rangeError !== null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $rangeError]);
        }

        $today = $this->todayString();
        if ($tanggalAkhir > $today) {
            $tanggalAkhir = $today;
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [],
                'meta' => $this->rekapMeta($kelasId, $tanggalAwal, $tanggalAkhir, 0, $pengurusId),
            ]);
        }

        $db = Database::getInstance();
        $hariEfektif = $this->countDaysInclusive($tanggalAwal, $tanggalAkhir);

        $sql = '
            SELECT j.tanggal,
                   j.jam,
                   j.status,
                   j.deskripsi,
                   j.pelajaran,
                   j.alasan,
                   j.mapel_id,
                   j.pengurus_id,
                   p.nama AS pengurus_nama,
                   j.kelas_id,
                   kl.nama_kelas,
                   kl.kel,
                   mp.dari AS mapel_dari,
                   mp.sampai AS mapel_sampai,
                   kb.fan AS mapel_fan,
                   kb.nama AS mapel_kitab,
                   kb.musonnif AS mapel_musonnif
            FROM kelas___jurnal_mengajar j
            INNER JOIN pengurus p ON p.id = j.pengurus_id
            INNER JOIN kelas kl ON kl.id = j.kelas_id
            LEFT JOIN mapel mp ON mp.id = j.mapel_id
            LEFT JOIN kitab kb ON kb.id = mp.kitab_id
            WHERE j.tanggal BETWEEN :awal AND :akhir
        ';
        $bind = ['awal' => $tanggalAwal, 'akhir' => $tanggalAkhir];
        if ($kelasId !== '') {
            $sql .= ' AND j.kelas_id = :kelas_id';
            $bind['kelas_id'] = $kelasId;
        }
        if ($pengurusId !== '') {
            $sql .= ' AND j.pengurus_id = :pengurus_id';
            $bind['pengurus_id'] = $pengurusId;
        }
        $sql .= ' ORDER BY j.tanggal DESC, kl.nama_kelas ASC, j.jam ASC, p.nama ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();

        $result = array_map(function (array $row): array {
            $item = $this->formatJurnalItem($row);
            $item['tanggal'] = $row['tanggal'];
            $item['kelas_id'] = $row['kelas_id'];
            $item['nama_kelas'] = $row['nama_kelas'];
            $item['kel'] = $row['kel'];
            return $item;
        }, $rows);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $result,
            'meta' => $this->rekapMeta($kelasId, $tanggalAwal, $tanggalAkhir, $hariEfektif, $pengurusId),
        ]);
    }

    private function formatJurnalItem(array $row): array {
        return [
            'id' => $row['id'] ?? null,
            'jam' => $row['jam'] ?? null,
            'pengurus_id' => $row['pengurus_id'],
            'pengurus_nama' => $row['pengurus_nama'],
            'status' => $row['status'],
            'mapel_id' => $row['mapel_id'] ?? null,
            'deskripsi' => $row['deskripsi'] ?? null,
            'pelajaran' => $row['pelajaran'] ?? null,
            'alasan' => $row['alasan'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'mapel_fan' => $row['mapel_fan'] ?? null,
            'mapel_kitab' => $row['mapel_kitab'] ?? null,
            'mapel_musonnif' => $row['mapel_musonnif'] ?? null,
            'mapel_dari' => $row['mapel_dari'] ?? null,
            'mapel_sampai' => $row['mapel_sampai'] ?? null,
        ];
    }

    private function mapelAssignedToKelas($db, int $kelasId, int $mapelId): bool {
        $stmt = $db->prepare('
            SELECT 1 FROM kelas___mapel WHERE kelas_id = :kelas_id AND mapel_id = :mapel_id
        ');
        $stmt->execute(['kelas_id' => $kelasId, 'mapel_id' => $mapelId]);
        return (bool) $stmt->fetch();
    }

    private function validateDateRange(string $awal, string $akhir): ?string {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $awal)) {
            return 'tanggal_awal harus format YYYY-MM-DD';
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $akhir)) {
            return 'tanggal_akhir harus format YYYY-MM-DD';
        }
        if ($awal > $akhir) {
            return 'tanggal_awal tidak boleh setelah tanggal_akhir';
        }
        return null;
    }

    private function rekapMeta(string $kelasId, string $awal, string $akhir, int $hariEfektif, string $pengurusId = ''): array {
        $meta = [
            'kelas_id' => $kelasId !== '' ? $kelasId : null,
            'tanggal_awal' => $awal,
            'tanggal_akhir' => $akhir,
            'hari_efektif' => $hariEfektif,
        ];
        if ($pengurusId !== '') {
            $meta['pengurus_id'] = $pengurusId;
        }
        return $meta;
    }

    /** @param list<int> $kelasIds */
    private function rekapMetaMulti(array $kelasIds, string $awal, string $akhir, int $hariEfektif): array {
        return [
            'kelas_id' => count($kelasIds) === 1 ? (string) $kelasIds[0] : null,
            'kelas_ids' => array_map('strval', $kelasIds),
            'tanggal_awal' => $awal,
            'tanggal_akhir' => $akhir,
            'hari_efektif' => $hariEfektif,
        ];
    }

    private function countDaysInclusive(string $awal, string $akhir): int {
        $start = new DateTimeImmutable($awal);
        $end = new DateTimeImmutable($akhir);
        if ($start > $end) {
            return 0;
        }
        return (int) $start->diff($end)->days + 1;
    }

    private function sumJamCounts(array $jam1, array $jam2): array {
        return [
            'mengajar' => (int) ($jam1['mengajar'] ?? 0) + (int) ($jam2['mengajar'] ?? 0),
            'ijin' => (int) ($jam1['ijin'] ?? 0) + (int) ($jam2['ijin'] ?? 0),
            'sakit' => (int) ($jam1['sakit'] ?? 0) + (int) ($jam2['sakit'] ?? 0),
        ];
    }

    private function isAdminAkses(string $akses): bool {
        return in_array($akses, ['super_admin', 'admin'], true);
    }

    private function now(): DateTimeImmutable {
        return new DateTimeImmutable('now', new DateTimeZone(self::TIMEZONE));
    }

    private function todayString(): string {
        return $this->now()->format('Y-m-d');
    }

    private function isLocked(): bool {
        return (int) $this->now()->format('G') >= self::LOCK_HOUR;
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
