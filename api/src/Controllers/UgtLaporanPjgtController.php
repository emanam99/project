<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD laporan PJGT UGT (ugt___pjgt) + masalah (laporan_jenis pjgt).
 */
class UgtLaporanPjgtController
{
    private \PDO $db;
    private const LAPORAN_JENIS = 'pjgt';

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
        return 'FROM ugt___pjgt p
                INNER JOIN madrasah m ON m.id = p.id_madrasah
                INNER JOIN santri s ON s.id = p.id_santri
                LEFT JOIN pengurus pk ON pk.id = p.id_koordinator
                LEFT JOIN pengurus pbu ON pbu.id = p.id_pembuat';
    }

    private function selectColumns(): string
    {
        return 'SELECT p.*, m.nama AS madrasah_nama, s.nama AS santri_nama, s.nis AS santri_nis, pk.nama AS koordinator_nama, pbu.nama AS pembuat_nama';
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
     * GET /api/ugt/laporan-pjgt/santri-options?search=&limit=
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
            error_log('UgtLaporanPjgtController::getSantriOptions ' . $e->getMessage());

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
        $sql = $this->selectColumns() . ' ' . $this->selectFromClause() . ' WHERE p.id = ? LIMIT 1';
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
        $sql = 'SELECT id FROM ugt___pjgt WHERE id_madrasah = ? AND id_santri = ? AND id_tahun_ajaran = ? AND bulan = ?';
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

    /** @param array<string,mixed> $data */
    private function extractPjgtFields(array $data, ?array $existing = null): array
    {
        $rating = static function ($key) use ($data, $existing): ?string {
            if (array_key_exists($key, $data)) {
                $t = trim((string) $data[$key]);

                return $t === '' ? null : $t;
            }
            if ($existing !== null && array_key_exists($key, $existing)) {
                $v = $existing[$key];
                if ($v === null || $v === '') {
                    return null;
                }
                $t = trim((string) $v);

                return $t === '' ? null : $t;
            }

            return null;
        };

        $usulan = null;
        if (array_key_exists('usulan', $data)) {
            $t = trim((string) $data['usulan']);
            $usulan = $t === '' ? null : TextSanitizer::cleanMultilineMessage($t);
        } elseif ($existing !== null && array_key_exists('usulan', $existing)) {
            $v = $existing['usulan'];
            if ($v !== null && $v !== '') {
                $t = trim((string) $v);
                $usulan = $t === '' ? null : TextSanitizer::cleanMultilineMessage($t);
            }
        }

        return [
            'ubudiyah' => $rating('ubudiyah'),
            'murid' => $rating('murid'),
            'wali_murid' => $rating('wali_murid'),
            'pjgt' => $rating('pjgt'),
            'kepala' => $rating('kepala'),
            'guru' => $rating('guru'),
            'masyarakat' => $rating('masyarakat'),
            'usulan' => $usulan,
        ];
    }

    /**
     * GET /api/ugt/laporan-pjgt?id_madrasah=&id_tahun_ajaran=&bulan=&id_koordinator=
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

            $sql = $this->selectColumns() . ' ' . $this->selectFromClause() . ' WHERE 1=1';
            $params = [];
            if ($ctx['apply_koordinator']) {
                $sql .= ' AND m.id_koordinator = ?';
                $params[] = $ctx['pengurus_id'];
            }
            if ($idMadrasah > 0) {
                $sql .= ' AND p.id_madrasah = ?';
                $params[] = $idMadrasah;
            }
            if ($idKoordinatorFilter > 0) {
                $sql .= ' AND p.id_koordinator = ?';
                $params[] = $idKoordinatorFilter;
            }
            if ($idTa !== '') {
                $sql .= ' AND p.id_tahun_ajaran = ?';
                $params[] = $idTa;
            }
            if ($bulan >= 1 && $bulan <= 12) {
                $sql .= ' AND p.bulan = ?';
                $params[] = $bulan;
            }
            $sql .= ' ORDER BY p.tanggal_dibuat DESC, p.id DESC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as &$row) {
                $row = $this->normalizeLaporanRow($row);
            }
            unset($row);

            return $this->jsonResponse($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanPjgtController::getAll ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data laporan'], 500);
        }
    }

    /**
     * GET /api/ugt/laporan-pjgt/{id}
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
            error_log('UgtLaporanPjgtController::getById ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil laporan'], 500);
        }
    }

    /**
     * POST /api/ugt/laporan-pjgt
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
                    'message' => 'Sudah ada laporan PJGT untuk madrasah, santri, tahun ajaran, dan bulan yang sama',
                ], 409);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);
            $idPembuat = $this->getPembuatPengurusId($request);
            $f = $this->extractPjgtFields($data, null);
            $masalahItems = $this->normalizeMasalahItemsFromBody($data);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'INSERT INTO ugt___pjgt (
                        id_madrasah, id_santri, id_koordinator, id_pembuat, id_tahun_ajaran, bulan,
                        ubudiyah, murid, wali_murid, pjgt, kepala, guru, masyarakat, usulan
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
                );
                $stmt->execute([
                    $idMadrasah,
                    $idSantri,
                    $idKord,
                    $idPembuat,
                    $idTa,
                    $bulan,
                    $f['ubudiyah'],
                    $f['murid'],
                    $f['wali_murid'],
                    $f['pjgt'],
                    $f['kepala'],
                    $f['guru'],
                    $f['masyarakat'],
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
            error_log('UgtLaporanPjgtController::create ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan laporan'], 500);
        }
    }

    /**
     * PUT /api/ugt/laporan-pjgt/{id}
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
                    'message' => 'Sudah ada laporan lain untuk kombinasi yang sama',
                ], 409);
            }

            $idKord = $this->getMadrasahKoordinatorId($idMadrasah);
            $f = $this->extractPjgtFields($data, $existing);

            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare(
                    'UPDATE ugt___pjgt SET id_madrasah = ?, id_santri = ?, id_koordinator = ?, id_tahun_ajaran = ?, bulan = ?,
                     ubudiyah = ?, murid = ?, wali_murid = ?, pjgt = ?, kepala = ?, guru = ?, masyarakat = ?, usulan = ?
                     WHERE id = ?'
                );
                $stmt->execute([
                    $idMadrasah,
                    $idSantri,
                    $idKord,
                    $idTa,
                    $bulan,
                    $f['ubudiyah'],
                    $f['murid'],
                    $f['wali_murid'],
                    $f['pjgt'],
                    $f['kepala'],
                    $f['guru'],
                    $f['masyarakat'],
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
            error_log('UgtLaporanPjgtController::update ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui laporan'], 500);
        }
    }

    /**
     * DELETE /api/ugt/laporan-pjgt/{id}
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

            $this->deleteMasalahForLaporan($id);
            $stmt = $this->db->prepare('DELETE FROM ugt___pjgt WHERE id = ?');
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Laporan dihapus'], 200);
        } catch (\Exception $e) {
            error_log('UgtLaporanPjgtController::delete ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus laporan'], 500);
        }
    }
}
