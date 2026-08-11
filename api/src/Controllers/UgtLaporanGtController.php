<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\TahunAjaranActiveHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD laporan GT UGT (ugt___gt) + masalah (laporan_jenis gt).
 */
class UgtLaporanGtController
{
    private \PDO $db;
    private const LAPORAN_JENIS = 'gt';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
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

    /**
     * Konteks Mybeddian santri guru tugas: hanya rute /api/mybeddian/…
     * eBeddien /api/ugt/… memakai authContext pengurus (admin / koordinator).
     */
    private function mybeddianSantriGtScope(Request $request): ?int
    {
        $path = strtolower($request->getUri()->getPath());
        $isMybeddian = strpos($path, '/api/mybeddian/') !== false || strpos($path, 'mybeddian/') !== false;
        if (!$isMybeddian) {
            return null;
        }
        $userArr = $request->getAttribute('user');
        if (!is_array($userArr)) {
            return null;
        }
        $sid = isset($userArr['santri_id']) ? (int) $userArr['santri_id'] : 0;
        if ($sid <= 0 || !$this->santriIsGuruTugas($sid)) {
            return null;
        }

        return $sid;
    }

    private function santriIsGuruTugas(int $santriId): bool
    {
        if ($santriId <= 0) {
            return false;
        }
        $labels = SantriStatusHelper::currentStatusLabels($this->db, $santriId);

        return strtolower(trim($labels['status_santri'] ?? '')) === 'guru tugas';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPenugasanAktifForSantriTa(int $santriId, string $idTa): array
    {
        if ($santriId <= 0 || trim($idTa) === '') {
            return [];
        }
        $stmt = $this->db->prepare(
            'SELECT t.id_madrasah, m.nama AS madrasah_nama, t.id_tahun_ajaran, t.is_aktif
             FROM ugt___guru_tugas_tugasan t
             INNER JOIN madrasah m ON m.id = t.id_madrasah
             WHERE t.id_santri = ? AND t.id_tahun_ajaran = ?
             AND (t.is_aktif IS NULL OR t.is_aktif = 1)
             ORDER BY m.nama ASC'
        );
        $stmt->execute([$santriId, trim($idTa)]);

        return $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    }

    private function santriMayUseMadrasah(int $santriId, int $madrasahId, string $idTa): bool
    {
        foreach ($this->fetchPenugasanAktifForSantriTa($santriId, $idTa) as $p) {
            if ((int) ($p['id_madrasah'] ?? 0) === $madrasahId) {
                return true;
            }
        }

        return false;
    }

    private function userMayAccessLaporanRow(Request $request, array $row): bool
    {
        $santriScope = $this->mybeddianSantriGtScope($request);
        if ($santriScope !== null) {
            return (int) ($row['id_santri'] ?? 0) === $santriScope;
        }

        return $this->userMayAccessMadrasah($request, (int) ($row['id_madrasah'] ?? 0));
    }

    private function getPembuatPengurusId(Request $request): ?int
    {
        if ($this->mybeddianSantriGtScope($request) !== null) {
            return null;
        }
        $ctx = $this->authContext($request);
        $pid = $ctx['pengurus_id'];

        return $pid > 0 ? $pid : null;
    }

    private function userMayAccessMadrasah(Request $request, int $madrasahId, ?string $idTa = null): bool
    {
        if ($madrasahId <= 0) {
            return false;
        }
        $santriScope = $this->mybeddianSantriGtScope($request);
        if ($santriScope !== null) {
            $ta = $idTa !== null ? trim($idTa) : '';
            if ($ta !== '') {
                return $this->santriMayUseMadrasah($santriScope, $madrasahId, $ta);
            }
            $stmt = $this->db->prepare(
                'SELECT 1 FROM ugt___guru_tugas_tugasan
                 WHERE id_santri = ? AND id_madrasah = ? AND (is_aktif IS NULL OR is_aktif = 1) LIMIT 1'
            );
            $stmt->execute([$santriScope, $madrasahId]);

            return (bool) $stmt->fetchColumn();
        }
        $ctx = $this->authContext($request);
        if (!$ctx['apply_koordinator']) {
            return true;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM madrasah WHERE id = ? AND id_koordinator = ? LIMIT 1');
        $stmt->execute([$madrasahId, $ctx['pengurus_id']]);

        return (bool) $stmt->fetchColumn();
    }

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

    private function selectFromClause(): string
    {
        return 'FROM ugt___gt g
                INNER JOIN madrasah m ON m.id = g.id_madrasah
                INNER JOIN santri s ON s.id = g.id_santri
                LEFT JOIN pengurus pk ON pk.id = g.id_koordinator
                LEFT JOIN pengurus pbu ON pbu.id = g.id_pembuat';
    }

    private function selectColumns(): string
    {
        return 'SELECT g.*, m.nama AS madrasah_nama, s.nama AS santri_nama, s.nis AS santri_nis, pk.nama AS koordinator_nama, pbu.nama AS pembuat_nama';
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
                self::LAPORAN_JENIS,
                $it['masalah'],
                $it['solusi'],
                $it['saran'],
            ]);
        }
    }

    private function deleteMasalahForLaporan(int $idLaporan): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM ugt___masalah WHERE id_laporan = ? AND laporan_jenis = ?'
        );
        $stmt->execute([$idLaporan, self::LAPORAN_JENIS]);
    }

    /**
     * @return list<array{id: int, masalah: ?string, solusi: ?string, saran: ?string, tanggal_dibuat: string}>
     */
    private function fetchMasalahForLaporan(int $idLaporan): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, masalah, solusi, saran, tanggal_dibuat FROM ugt___masalah
             WHERE id_laporan = ? AND laporan_jenis = ? ORDER BY id ASC'
        );
        $stmt->execute([$idLaporan, self::LAPORAN_JENIS]);
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
        $row['masalah'] = $this->fetchMasalahForLaporan($id);

        return $row;
    }

    /**
     * GET /api/ugt/laporan-gt/santri-options?search=&limit=
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
            error_log('UgtLaporanGtController::getSantriOptions ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat daftar santri'], 500);
        }
    }

    /** @param array<string,mixed> $row */
    private function normalizeLaporanRow(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['id_madrasah'] = (int) $row['id_madrasah'];
        $row['id_santri'] = (int) $row['id_santri'];
        $row['bulan'] = (int) $row['bulan'];
        $row['pulang'] = (int) ($row['pulang'] ?? 0);
        $row['sakit'] = (int) ($row['sakit'] ?? 0);
        $row['udzur'] = (int) ($row['udzur'] ?? 0);
        $row['santri_nis'] = isset($row['santri_nis']) && $row['santri_nis'] !== null ? (string) $row['santri_nis'] : '';
        $row['id_koordinator'] = $row['id_koordinator'] !== null && $row['id_koordinator'] !== ''
            ? (int) $row['id_koordinator'] : null;
        $row['koordinator_nama'] = (string) ($row['koordinator_nama'] ?? '');
        $row['id_pembuat'] = $row['id_pembuat'] !== null && $row['id_pembuat'] !== ''
            ? (int) $row['id_pembuat'] : null;
        $row['pembuat_nama'] = (string) ($row['pembuat_nama'] ?? '');

        return $row;
    }

    private function fetchRowById(int $id): ?array
    {
        $sql = $this->selectColumns() . ' ' . $this->selectFromClause() . ' WHERE g.id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return $this->normalizeLaporanRow($row);
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
        $sql = 'SELECT id FROM ugt___gt WHERE id_madrasah = ? AND id_santri = ? AND id_tahun_ajaran = ? AND bulan = ?';
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

    private function nonNegInt($v, int $default = 0): int
    {
        if ($v === null || $v === '') {
            return $default;
        }
        $n = (int) $v;

        return max(0, min(999999, $n));
    }

    /** @param array<string,mixed> $data */
    private function extractGtFields(array $data, ?array $existing = null): array
    {
        $str = static function ($key, $default = null) use ($data, $existing): ?string {
            if (array_key_exists($key, $data)) {
                $t = trim((string) $data[$key]);

                return $t === '' ? null : $t;
            }
            if ($existing !== null && array_key_exists($key, $existing)) {
                $v = $existing[$key];
                if ($v === null || $v === '') {
                    return null;
                }

                return trim((string) $v) === '' ? null : (string) $v;
            }

            return $default;
        };

        $textLong = static function ($key) use ($data, $existing): ?string {
            if (array_key_exists($key, $data)) {
                $t = trim((string) $data[$key]);

                return $t === '' ? null : TextSanitizer::cleanMultilineMessage($t);
            }
            if ($existing !== null && array_key_exists($key, $existing)) {
                $v = $existing[$key];
                if ($v === null || $v === '') {
                    return null;
                }
                $t = trim((string) $v);

                return $t === '' ? null : TextSanitizer::cleanMultilineMessage($t);
            }

            return null;
        };

        return [
            'wali_kelas' => $str('wali_kelas'),
            'fan_kelas' => $str('fan_kelas'),
            'pulang' => array_key_exists('pulang', $data) ? $this->nonNegInt($data['pulang'], 0) : ($existing !== null ? $this->nonNegInt($existing['pulang'] ?? 0, 0) : 0),
            'sakit' => array_key_exists('sakit', $data) ? $this->nonNegInt($data['sakit'], 0) : ($existing !== null ? $this->nonNegInt($existing['sakit'] ?? 0, 0) : 0),
            'udzur' => array_key_exists('udzur', $data) ? $this->nonNegInt($data['udzur'], 0) : ($existing !== null ? $this->nonNegInt($existing['udzur'] ?? 0, 0) : 0),
            'banin_banat' => $str('banin_banat'),
            'muallim_quran' => $str('muallim_quran'),
            'waktu_muallim' => $str('waktu_muallim'),
            'ngaji_kitab' => $str('ngaji_kitab'),
            'waktu_ngaji' => $str('waktu_ngaji'),
            'imam' => $str('imam'),
            'ket_imam' => $str('ket_imam'),
            'tugas_selanjutnya' => $textLong('tugas_selanjutnya'),
            'usulan' => $textLong('usulan'),
        ];
    }

    /**
     * GET /api/ugt/laporan-gt?id_madrasah=&id_tahun_ajaran=&bulan=&id_koordinator=
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

            $santriScope = $this->mybeddianSantriGtScope($request);
            if ($santriScope !== null) {
                $idKoordinatorFilter = 0;
            }

            if ($idMadrasah > 0 && !$this->userMayAccessMadrasah($request, $idMadrasah, $idTa !== '' ? $idTa : null)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak untuk madrasah ini'], 403);
            }

            $canFilterSemuaKoordinator = RoleHelper::tokenUgtLaporanCanFilterSemuaKoordinator($this->db, $ctx['user']);
            $applyListKoordinator = RoleHelper::tokenUgtLaporanApplyKoordinatorListScope($this->db, $ctx['user']);
            if ($idKoordinatorFilter > 0 && $applyListKoordinator && !$canFilterSemuaKoordinator && $idKoordinatorFilter !== $ctx['pengurus_id']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $sql = $this->selectColumns() . ' ' . $this->selectFromClause() . ' WHERE 1=1';
            $params = [];
            if ($santriScope !== null) {
                $sql .= ' AND g.id_santri = ?';
                $params[] = $santriScope;
            } elseif ($applyListKoordinator) {
                $sql .= ' AND m.id_koordinator = ?';
                $params[] = $ctx['pengurus_id'];
            }
            if ($idMadrasah > 0) {
                $sql .= ' AND g.id_madrasah = ?';
                $params[] = $idMadrasah;
            }
            if ($idKoordinatorFilter > 0) {
                $sql .= ' AND g.id_koordinator = ?';
                $params[] = $idKoordinatorFilter;
            }
            if ($idTa !== '') {
                $sql .= ' AND g.id_tahun_ajaran = ?';
                $params[] = $idTa;
            }
            if ($bulan >= 1 && $bulan <= 12) {
                $sql .= ' AND g.bulan = ?';
                $params[] = $bulan;
            }
            $sql .= ' ORDER BY g.tanggal_dibuat DESC, g.id DESC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as &$row) {
                $row = $this->normalizeLaporanRow($row);
            }
            unset($row);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanGtController::getAll ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data laporan'], 500);
        }
    }

    /**
     * GET /api/ugt/laporan-gt/{id}
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
            if (!$this->userMayAccessLaporanRow($request, $row)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }
            $row = $this->attachMasalahToRow($row);

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanGtController::getById ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil laporan'], 500);
        }
    }

    /**
     * POST /api/ugt/laporan-gt
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $santriScope = $this->mybeddianSantriGtScope($request);
            if ($santriScope === null && !RoleHelper::tokenUgtLaporanCanTambah($this->db, $userArr, 'gt')) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak berhak menambah laporan GT',
                ], 403);
            }

            $raw = $request->getParsedBody();
            $data = is_array($raw) ? TextSanitizer::sanitizeUgtLaporanBody($raw) : [];

            $idMadrasah = isset($data['id_madrasah']) ? (int) $data['id_madrasah'] : 0;
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $idTa = isset($data['id_tahun_ajaran']) ? trim((string) $data['id_tahun_ajaran']) : '';
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : 0;

            if ($santriScope !== null) {
                $idSantri = $santriScope;
            }

            if ($idMadrasah <= 0 || $idSantri <= 0 || $idTa === '' || $bulan < 1 || $bulan > 12) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah, santri, tahun ajaran, dan bulan (1–12) wajib diisi',
                ], 400);
            }

            if ($santriScope !== null && $idSantri !== $santriScope) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            if (!$this->userMayAccessMadrasah($request, $idMadrasah, $idTa)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak untuk madrasah ini'], 403);
            }

            if ($santriScope !== null && !$this->santriMayUseMadrasah($santriScope, $idMadrasah, $idTa)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada penugasan guru tugas aktif di madrasah untuk tahun ajaran ini',
                ], 403);
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
                    'message' => 'Sudah ada laporan GT untuk madrasah, santri, tahun ajaran, dan bulan yang sama',
                ], 409);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);
            $idPembuat = $this->getPembuatPengurusId($request);
            $f = $this->extractGtFields($data, null);
            $masalahItems = $this->normalizeMasalahItemsFromBody($data);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'INSERT INTO ugt___gt (
                        id_madrasah, id_santri, id_koordinator, id_pembuat, id_tahun_ajaran, bulan,
                        wali_kelas, fan_kelas, pulang, sakit, udzur, banin_banat, muallim_quran, waktu_muallim,
                        ngaji_kitab, waktu_ngaji, imam, ket_imam, tugas_selanjutnya, usulan
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
                );
                $stmt->execute([
                    $idMadrasah,
                    $idSantri,
                    $idKord,
                    $idPembuat,
                    $idTa,
                    $bulan,
                    $f['wali_kelas'],
                    $f['fan_kelas'],
                    $f['pulang'],
                    $f['sakit'],
                    $f['udzur'],
                    $f['banin_banat'],
                    $f['muallim_quran'],
                    $f['waktu_muallim'],
                    $f['ngaji_kitab'],
                    $f['waktu_ngaji'],
                    $f['imam'],
                    $f['ket_imam'],
                    $f['tugas_selanjutnya'],
                    $f['usulan'],
                ]);
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
            error_log('UgtLaporanGtController::create ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan laporan'], 500);
        }
    }

    /**
     * PUT /api/ugt/laporan-gt/{id}
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
            if (!$this->userMayAccessLaporanRow($request, $existing)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $bulanGate = $this->rejectMybeddianMutateIfBukanBulanAktif($request, $response, $existing);
            if ($bulanGate !== null) {
                return $bulanGate;
            }

            $santriScope = $this->mybeddianSantriGtScope($request);

            $raw = $request->getParsedBody();
            $data = is_array($raw) ? TextSanitizer::sanitizeUgtLaporanBody($raw) : [];

            $idMadrasah = isset($data['id_madrasah']) ? (int) $data['id_madrasah'] : (int) $existing['id_madrasah'];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : (int) $existing['id_santri'];
            if ($santriScope !== null) {
                $idSantri = $santriScope;
                $idMadrasah = (int) $existing['id_madrasah'];
            }
            $idTa = isset($data['id_tahun_ajaran']) ? trim((string) $data['id_tahun_ajaran']) : (string) $existing['id_tahun_ajaran'];
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : (int) $existing['bulan'];

            if ($idMadrasah <= 0 || $idSantri <= 0 || $idTa === '' || $bulan < 1 || $bulan > 12) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Madrasah, santri, tahun ajaran, dan bulan (1–12) wajib valid',
                ], 400);
            }

            if (!$this->userMayAccessMadrasah($request, $idMadrasah, $idTa)) {
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
                    'message' => 'Sudah ada laporan lain untuk kombinasi yang sama',
                ], 409);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);
            $f = $this->extractGtFields($data, $existing);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'UPDATE ugt___gt SET id_madrasah = ?, id_santri = ?, id_koordinator = ?, id_tahun_ajaran = ?, bulan = ?,
                     wali_kelas = ?, fan_kelas = ?, pulang = ?, sakit = ?, udzur = ?, banin_banat = ?, muallim_quran = ?, waktu_muallim = ?,
                     ngaji_kitab = ?, waktu_ngaji = ?, imam = ?, ket_imam = ?, tugas_selanjutnya = ?, usulan = ?
                     WHERE id = ?'
                );
                $stmt->execute([
                    $idMadrasah,
                    $idSantri,
                    $idKord,
                    $idTa,
                    $bulan,
                    $f['wali_kelas'],
                    $f['fan_kelas'],
                    $f['pulang'],
                    $f['sakit'],
                    $f['udzur'],
                    $f['banin_banat'],
                    $f['muallim_quran'],
                    $f['waktu_muallim'],
                    $f['ngaji_kitab'],
                    $f['waktu_ngaji'],
                    $f['imam'],
                    $f['ket_imam'],
                    $f['tugas_selanjutnya'],
                    $f['usulan'],
                    $id,
                ]);

                if (array_key_exists('masalah_list', $data)) {
                    $masalahItems = $this->normalizeMasalahItemsFromBody($data);
                    $this->deleteMasalahForLaporan($id);
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
            error_log('UgtLaporanGtController::update ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui laporan'], 500);
        }
    }

    /**
     * DELETE /api/ugt/laporan-gt/{id}
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
            if (!$this->userMayAccessLaporanRow($request, $existing)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $bulanGate = $this->rejectMybeddianMutateIfBukanBulanAktif($request, $response, $existing);
            if ($bulanGate !== null) {
                return $bulanGate;
            }

            $this->deleteMasalahForLaporan($id);
            $stmt = $this->db->prepare('DELETE FROM ugt___gt WHERE id = ?');
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Laporan dihapus'], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanGtController::delete ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus laporan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/laporan-gt/konteks-sekarang
     * Tahun ajaran hijriyah + bulan hijriyah + penugasan guru tugas aktif (untuk santri Mybeddian).
     */
    public function getKonteksSekarang(Request $request, Response $response): Response
    {
        try {
            $santriScope = $this->mybeddianSantriGtScope($request);
            if ($santriScope === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
            }

            $params = $request->getQueryParams();
            $tanggal = isset($params['tanggal']) ? trim((string) $params['tanggal']) : date('Y-m-d');
            $waktu = isset($params['waktu']) ? trim((string) $params['waktu']) : date('H:i:s');

            $dt = \DateTime::createFromFormat('Y-m-d', $tanggal);
            if (!$dt || $dt->format('Y-m-d') !== $tanggal) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter tanggal harus format Y-m-d',
                ], 400);
            }

            $tanggalKalenderLookup = $tanggal;
            if ($this->isAfterMaghrib($waktu)) {
                $d = new \DateTime($tanggal);
                $d->add(new \DateInterval('P1D'));
                $tanggalKalenderLookup = $d->format('Y-m-d');
            }

            $bulanHijriyah = null;
            $stmtK = $this->db->prepare('SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1');
            $stmtK->execute([$tanggalKalenderLookup, $tanggalKalenderLookup]);
            $rowK = $stmtK->fetch(\PDO::FETCH_ASSOC);
            if ($rowK && isset($rowK['id_bulan']) && $rowK['id_bulan'] !== '' && $rowK['id_bulan'] !== null) {
                $bulanHijriyah = (int) $rowK['id_bulan'];
            }

            $taResolved = TahunAjaranActiveHelper::resolveHijriyahKonteksForMasehiDate($this->db, $tanggal);
            $rowTa = $taResolved['row'];
            if ($rowTa !== null) {
                $rowTa['kategori'] = 'hijriyah';
            }
            $warnings = $taResolved['warnings'];
            if ($bulanHijriyah === null || $bulanHijriyah < 1 || $bulanHijriyah > 12) {
                $warnings[] = 'Kalender (psa___kalender) tidak mencakup tanggal ini; bulan Hijriyah tidak bisa ditentukan.';
            }

            $idTa = $taResolved['tahun_ajaran'] ?? '';
            $penugasanAktif = $idTa !== '' ? $this->fetchPenugasanAktifForSantriTa($santriScope, (string) $idTa) : [];
            $idMadrasah = null;
            $madrasahNama = null;
            if (count($penugasanAktif) === 1) {
                $idMadrasah = (int) ($penugasanAktif[0]['id_madrasah'] ?? 0) ?: null;
                $madrasahNama = isset($penugasanAktif[0]['madrasah_nama']) ? trim((string) $penugasanAktif[0]['madrasah_nama']) : null;
            } elseif (count($penugasanAktif) === 0 && $idTa !== '') {
                $warnings[] = 'Belum ada penugasan guru tugas aktif untuk tahun ajaran ' . $idTa . '.';
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal_masehi' => $tanggal,
                    'waktu' => $waktu,
                    'id_tahun_ajaran' => $idTa !== '' ? $idTa : null,
                    'tahun_ajaran' => $rowTa ?: null,
                    'bulan_hijriyah' => ($bulanHijriyah !== null && $bulanHijriyah >= 1 && $bulanHijriyah <= 12) ? $bulanHijriyah : null,
                    'id_santri' => $santriScope,
                    'id_madrasah' => $idMadrasah,
                    'madrasah_nama' => $madrasahNama,
                    'penugasan_aktif' => $penugasanAktif,
                ],
                'warnings' => $warnings,
            ], 200);
        } catch (\Throwable $e) {
            error_log('UgtLaporanGtController::getKonteksSekarang ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghitung konteks tahun ajaran / bulan',
            ], 500);
        }
    }

    /** Sama seperti UgtLaporanPjgtController::isAfterMaghrib / KalenderController (batas 17:30). */
    private function isAfterMaghrib(string $waktu): bool
    {
        $parts = explode(':', substr($waktu, 0, 5));
        $jam = (int) ($parts[0] ?? 0);
        $menit = (int) ($parts[1] ?? 0);

        return ($jam * 60 + $menit) >= (17 * 60 + 30);
    }

    /**
     * MyBeddien: ubah/hapus hanya untuk laporan bulan + TA aktif.
     * @param array<string, mixed> $existing
     */
    private function rejectMybeddianMutateIfBukanBulanAktif(Request $request, Response $response, array $existing): ?Response
    {
        if ($this->mybeddianSantriGtScope($request) === null) {
            return null;
        }

        $tanggal = date('Y-m-d');
        $waktu = date('H:i:s');
        $tanggalKalenderLookup = $tanggal;
        if ($this->isAfterMaghrib($waktu)) {
            $d = new \DateTime($tanggal);
            $d->add(new \DateInterval('P1D'));
            $tanggalKalenderLookup = $d->format('Y-m-d');
        }

        $bulanAktif = null;
        $stmtK = $this->db->prepare('SELECT id_bulan FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1');
        $stmtK->execute([$tanggalKalenderLookup, $tanggalKalenderLookup]);
        $rowK = $stmtK->fetch(\PDO::FETCH_ASSOC);
        if ($rowK && isset($rowK['id_bulan']) && $rowK['id_bulan'] !== '' && $rowK['id_bulan'] !== null) {
            $bulanAktif = (int) $rowK['id_bulan'];
        }

        $taResolved = TahunAjaranActiveHelper::resolveHijriyahKonteksForMasehiDate($this->db, $tanggal);
        $taAktif = trim((string) ($taResolved['tahun_ajaran'] ?? ''));
        $rowBulan = (int) ($existing['bulan'] ?? 0);
        $rowTa = trim((string) ($existing['id_tahun_ajaran'] ?? ''));

        $okBulan = $bulanAktif !== null && $bulanAktif >= 1 && $bulanAktif <= 12 && $rowBulan === $bulanAktif;
        $okTa = $taAktif === '' || $rowTa === '' || $taAktif === $rowTa;
        if ($okBulan && $okTa) {
            return null;
        }

        return $this->jsonResponse($response, [
            'success' => false,
            'message' => 'Laporan bulan sebelumnya hanya bisa dilihat. Hanya laporan bulan aktif yang dapat diubah atau dihapus.',
        ], 403);
    }
}
