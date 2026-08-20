<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\KalenderHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\TextSanitizer;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Ujian per mapel (lembaga___kitab): jadwal Masehi + cache Hijriyah, absensi & nilai per santri.
 */
final class UjianController
{
    private const KEHADIRAN_ALLOWED = ['hadir', 'izin', 'sakit', 'alpha', 'terlambat'];

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array<string, mixed> */
    private function userPayload(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    private function idUserPembuat(Request $request): ?int
    {
        $u = $this->userPayload($request);
        $id = isset($u['user_id']) ? (int) $u['user_id'] : 0;

        return $id > 0 ? $id : null;
    }

    /**
     * ID santri yang saat ini berada di rombel (diniyah atau formal).
     *
     * @return list<int>
     */
    private function santriIdsForRombel(int $idRombel): array
    {
        $stmt = $this->db->prepare(
            'SELECT s.id FROM santri s WHERE s.id_diniyah = ? OR s.id_formal = ? ORDER BY s.nama'
        );
        $stmt->execute([$idRombel, $idRombel]);
        $out = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $out[] = (int) $row['id'];
        }

        return $out;
    }

    /** @return array<string, mixed>|null */
    private function loadLembagaKitabRow(int $idLembagaKitab): ?array
    {
        $sql = 'SELECT lk.*, r.id AS rombel_id, r.lembaga_id, r.kelas, r.kel,
                l.nama AS lembaga_nama, k.nama_indo AS kitab_nama, k.fan AS kitab_fan
            FROM lembaga___kitab lk
            INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
            LEFT JOIN lembaga l ON l.id = r.lembaga_id
            INNER JOIN kitab k ON k.id = lk.id_kitab
            WHERE lk.id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$idLembagaKitab]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row !== false ? $row : null;
    }

    /**
     * Rombel yang dipakai untuk gabungan peserta: rombel mapel terpilih + rombel lain (dari CSV)
     * yang punya baris lembaga___kitab dengan id_kitab sama.
     *
     * @return list<int>
     */
    private function rombelIdsForKitabContext(int $idLembagaKitab, ?string $idRombelIdsCsv): array
    {
        $mapel = $this->loadLembagaKitabRow($idLembagaKitab);
        if (!$mapel) {
            return [];
        }
        $primaryRombel = (int) $mapel['rombel_id'];
        $idKitab = (int) $mapel['id_kitab'];
        $csv = $idRombelIdsCsv !== null ? trim($idRombelIdsCsv) : '';
        if ($csv === '') {
            return [$primaryRombel];
        }
        $requested = array_values(array_filter(array_map(static function ($v) {
            $t = trim((string) $v);

            return ctype_digit($t) ? (int) $t : 0;
        }, explode(',', $csv)), static function (int $v): bool {
            return $v > 0;
        }));
        if ($requested === []) {
            return [$primaryRombel];
        }
        $ph = implode(',', array_fill(0, count($requested), '?'));
        $stmt = $this->db->prepare(
            "SELECT DISTINCT id_rombel FROM lembaga___kitab WHERE id_kitab = ? AND id_rombel IN ($ph)"
        );
        $stmt->execute(array_merge([$idKitab], $requested));
        $fromDb = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $fromDb[] = (int) $row['id_rombel'];
        }
        $set = [];
        foreach ($fromDb as $rid) {
            $set[$rid] = true;
        }
        $set[$primaryRombel] = true;

        return array_keys($set);
    }

    /**
     * Gabungan id_santri unik dari beberapa rombel (diniyah/formal).
     *
     * @param list<int> $rombelIds
     *
     * @return list<int>
     */
    private function santriIdsUnionRombels(array $rombelIds): array
    {
        $uniq = [];
        foreach ($rombelIds as $rid) {
            if ($rid < 1) {
                continue;
            }
            foreach ($this->santriIdsForRombel($rid) as $sid) {
                $uniq[$sid] = true;
            }
        }

        return array_keys($uniq);
    }

    /**
     * @return list<int>
     */
    private function parseRombelIdsCsv(?string $csv): array
    {
        if ($csv === null || trim((string) $csv) === '') {
            return [];
        }
        $parts = array_values(array_filter(array_map(static function ($v) {
            $t = trim((string) $v);

            return ctype_digit($t) ? (int) $t : 0;
        }, explode(',', $csv)), static function (int $v): bool {
            return $v > 0;
        }));

        return $parts;
    }

    /**
     * @param list<int> $ids
     */
    private function normalizeRombelIdsCsv(array $ids): string
    {
        $ids = array_values(array_unique(array_filter($ids, static fn (int $v): bool => $v > 0)));
        sort($ids);

        return implode(',', $ids);
    }

    /** @return array<int, true> */
    private function rombelFlipFromCsv(string $csv): array
    {
        $flip = [];
        foreach ($this->parseRombelIdsCsv($csv) as $rid) {
            $flip[$rid] = true;
        }

        return $flip;
    }

    /**
     * @param list<array{0: int, 1: string, 2: float|null, 3: string|null}> $rows
     */
    private function insertUjianRowWithPeserta(
        int $idGrup,
        int $idLk,
        string $judulMirror,
        ?string $jenisMirror,
        string $tanggalMasehi,
        ?string $jamMulai,
        ?string $jamSelesai,
        ?string $tanggalHijriyah,
        ?int $idUser,
        array $rows
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO ujian (id_ujian_grup, id_lembaga_kitab, judul, jenis, tanggal_masehi, jam_mulai, jam_selesai, tanggal_hijriyah, id_user_pembuat)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $idGrup,
            $idLk,
            $judulMirror,
            $jenisMirror,
            $tanggalMasehi,
            $jamMulai,
            $jamSelesai,
            $tanggalHijriyah,
            $idUser,
        ]);
        $ujianId = (int) $this->db->lastInsertId();
        $ins = $this->db->prepare(
            'INSERT INTO ujian___peserta (id_ujian, id_santri, kehadiran, nilai, catatan) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($rows as $r) {
            $ins->execute([$ujianId, $r[0], $r[1], $r[2], $r[3]]);
        }

        return $ujianId;
    }

    /**
     * @param array<int, mixed> $pesertaIn
     *
     * @return array{0: bool, 1?: string, 2?: list<array{0: int, 1: string, 2: float|null, 3: string|null}>}
     */
    private function normalizePesertaInput(array $pesertaIn, array $allowedSantriFlip): array
    {
        $rows = [];
        foreach ($pesertaIn as $p) {
            if (!is_array($p)) {
                continue;
            }
            $idSantri = isset($p['id_santri']) ? (int) $p['id_santri'] : 0;
            if ($idSantri < 1 || !isset($allowedSantriFlip[$idSantri])) {
                return [false, 'Santri tidak termasuk rombel mapel: ' . $idSantri];
            }
            $kehadiran = strtolower(trim((string) ($p['kehadiran'] ?? 'hadir')));
            if (!in_array($kehadiran, self::KEHADIRAN_ALLOWED, true)) {
                return [false, 'kehadiran tidak valid'];
            }
            $nilai = null;
            if (array_key_exists('nilai', $p) && $p['nilai'] !== '' && $p['nilai'] !== null) {
                $nilai = round((float) $p['nilai'], 2);
                if ($nilai < 0 || $nilai > 100) {
                    return [false, 'nilai 0–100'];
                }
            }
            $catatan = TextSanitizer::cleanTextOrNull($p['catatan'] ?? null);
            $rows[] = [$idSantri, $kehadiran, $nilai, $catatan];
        }
        if ($rows === []) {
            return [false, 'peserta tidak valid'];
        }

        return [true, '', $rows];
    }

    /**
     * GET /api/ujian/form-data?id_lembaga_kitab=
     */
    public function getFormData(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $idLk = isset($q['id_lembaga_kitab']) ? (int) $q['id_lembaga_kitab'] : 0;
            if ($idLk < 1) {
                return $this->json($response, ['success' => false, 'message' => 'id_lembaga_kitab wajib'], 400);
            }
            $mapel = $this->loadLembagaKitabRow($idLk);
            if (!$mapel) {
                return $this->json($response, ['success' => false, 'message' => 'Mapel tidak ditemukan'], 404);
            }
            $csv = isset($q['id_rombel_ids']) ? trim((string) $q['id_rombel_ids']) : '';
            $rombelIds = $this->rombelIdsForKitabContext($idLk, $csv !== '' ? $csv : null);
            $ids = $this->santriIdsUnionRombels($rombelIds);
            if ($ids === []) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'mapel' => $mapel,
                        'santri' => [],
                    ],
                ], 200);
            }
            sort($ids);
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->db->prepare(
                "SELECT s.id, s.nis, s.nama,
                    COALESCE(st.status_santri, s.status_santri, '') AS status_santri
                FROM santri s
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                WHERE s.id IN ($ph) ORDER BY s.nama"
            );
            $stmt->execute($ids);
            $santri = $stmt->fetchAll(PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'mapel' => $mapel,
                    'santri' => $santri,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::getFormData: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat data form'], 500);
        }
    }

    /**
     * GET /api/ujian
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
            $lembagaIdsCsv = isset($params['lembaga_ids']) ? trim((string) $params['lembaga_ids']) : '';
            $idRombel = isset($params['id_rombel']) ? (int) $params['id_rombel'] : 0;
            $idRombelIdsCsv = isset($params['id_rombel_ids']) ? trim((string) $params['id_rombel_ids']) : '';
            $idLk = isset($params['id_lembaga_kitab']) ? (int) $params['id_lembaga_kitab'] : 0;
            $qRaw = isset($params['q']) ? trim((string) $params['q']) : '';
            $page = isset($params['page']) ? max(1, (int) $params['page']) : 1;
            $limit = isset($params['limit']) ? max(1, min(200, (int) $params['limit'])) : 50;
            $offset = ($page - 1) * $limit;

            $where = ' WHERE 1=1';
            $bind = [];

            if ($lembagaIdsCsv !== '') {
                $lembagaIds = array_values(array_filter(array_map(static function ($v) {
                    return trim((string) $v);
                }, explode(',', $lembagaIdsCsv)), static function ($v) {
                    return $v !== '';
                }));
                if ($lembagaIds !== []) {
                    $ph = implode(',', array_fill(0, count($lembagaIds), '?'));
                    $where .= " AND r.lembaga_id IN ($ph)";
                    foreach ($lembagaIds as $lid) {
                        $bind[] = $lid;
                    }
                }
            } elseif ($lembagaId !== '') {
                $where .= ' AND r.lembaga_id = ?';
                $bind[] = $lembagaId;
            }
            if ($idRombelIdsCsv !== '') {
                $rombelIds = array_values(array_filter(array_map(static function ($v) {
                    return trim((string) $v);
                }, explode(',', $idRombelIdsCsv)), static function ($v) {
                    return $v !== '' && ctype_digit($v);
                }));
                if ($rombelIds !== []) {
                    $ph = implode(',', array_fill(0, count($rombelIds), '?'));
                    $where .= " AND r.id IN ($ph)";
                    foreach ($rombelIds as $rid) {
                        $bind[] = (int) $rid;
                    }
                }
            } elseif ($idRombel > 0) {
                $where .= ' AND r.id = ?';
                $bind[] = $idRombel;
            }
            if ($idLk > 0) {
                $where .= ' AND u.id_lembaga_kitab = ?';
                $bind[] = $idLk;
            }
            if ($qRaw !== '') {
                $like = '%' . addcslashes($qRaw, '\\%_') . '%';
                $where .= ' AND (u.judul LIKE ? OR COALESCE(u.jenis, \'\') LIKE ? OR g.judul LIKE ? OR COALESCE(g.jenis, \'\') LIKE ?)';
                $bind[] = $like;
                $bind[] = $like;
                $bind[] = $like;
                $bind[] = $like;
            }

            $base = "FROM ujian u
                INNER JOIN ujian_grup g ON g.id = u.id_ujian_grup
                INNER JOIN lembaga___kitab lk ON lk.id = u.id_lembaga_kitab
                INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                LEFT JOIN lembaga l ON l.id = r.lembaga_id
                INNER JOIN kitab k ON k.id = lk.id_kitab
                $where";

            $stmt = $this->db->prepare('SELECT COUNT(*) AS total ' . $base);
            $stmt->execute($bind);
            $total = (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

            $sql = "SELECT u.*, g.judul AS judul_grup, g.jenis AS jenis_grup, g.id_rombel_ids,
                    lk.id_rombel, lk.id_kitab, r.kelas, r.kel, r.lembaga_id,
                    l.nama AS lembaga_nama, k.nama_indo AS kitab_nama, k.fan AS kitab_fan
                $base
                ORDER BY g.id DESC, u.tanggal_masehi DESC, u.id DESC
                LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::getAll: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar ujian'], 500);
        }
    }

    /**
     * GET /api/ujian/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare(
                "SELECT u.*, lk.id_rombel, lk.id_kitab, r.kelas, r.kel, r.lembaga_id,
                    l.nama AS lembaga_nama, k.nama_indo AS kitab_nama, k.fan AS kitab_fan,
                    g.judul AS judul_grup, g.jenis AS jenis_grup, g.id_rombel_ids
                FROM ujian u
                INNER JOIN ujian_grup g ON g.id = u.id_ujian_grup
                INNER JOIN lembaga___kitab lk ON lk.id = u.id_lembaga_kitab
                INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                LEFT JOIN lembaga l ON l.id = r.lembaga_id
                INNER JOIN kitab k ON k.id = lk.id_kitab
                WHERE u.id = ? LIMIT 1"
            );
            $stmt->execute([$id]);
            $ujian = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ujian) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }
            $stmt = $this->db->prepare(
                'SELECT up.*, s.nis, s.nama FROM ujian___peserta up
                INNER JOIN santri s ON s.id = up.id_santri
                WHERE up.id_ujian = ? ORDER BY s.nama'
            );
            $stmt->execute([$id]);
            $peserta = $stmt->fetchAll(PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'ujian' => $ujian,
                    'peserta' => $peserta,
                    'grup' => [
                        'id' => (int) ($ujian['id_ujian_grup'] ?? 0),
                        'judul' => $ujian['judul_grup'] ?? '',
                        'jenis' => $ujian['jenis_grup'] ?? null,
                        'id_rombel_ids' => $ujian['id_rombel_ids'] ?? '',
                    ],
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::getById: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil data'], 500);
        }
    }

    /**
     * POST /api/ujian
     */
    public function create(Request $request, Response $response): Response
    {
        return $this->saveUjian($request, $response, null);
    }

    /**
     * PUT /api/ujian/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        return $this->saveUjian($request, $response, $id);
    }

    private function saveUjian(Request $request, Response $response, ?int $existingId): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $idLk = isset($body['id_lembaga_kitab']) ? (int) $body['id_lembaga_kitab'] : 0;
            if ($idLk < 1) {
                return $this->json($response, ['success' => false, 'message' => 'id_lembaga_kitab wajib'], 400);
            }
            $mapel = $this->loadLembagaKitabRow($idLk);
            if (!$mapel) {
                return $this->json($response, ['success' => false, 'message' => 'Mapel tidak ditemukan'], 400);
            }
            $csv = isset($body['id_rombel_ids']) ? trim((string) $body['id_rombel_ids']) : '';
            $rombelIds = $this->rombelIdsForKitabContext($idLk, $csv !== '' ? $csv : null);
            $allowedIds = $this->santriIdsUnionRombels($rombelIds);
            $allowedSantri = array_flip($allowedIds);

            $judul = TextSanitizer::cleanTextOrNull($body['judul'] ?? '') ?? '';
            $judul = trim($judul) !== '' ? trim($judul) : 'Ujian';
            $jenis = TextSanitizer::cleanTextOrNull($body['jenis'] ?? null);
            $tanggalMasehi = isset($body['tanggal_masehi']) ? trim((string) $body['tanggal_masehi']) : '';
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalMasehi)) {
                return $this->json($response, ['success' => false, 'message' => 'tanggal_masehi format Y-m-d'], 400);
            }
            $jamMulai = $this->normalizeTime($body['jam_mulai'] ?? null);
            $jamSelesai = $this->normalizeTime($body['jam_selesai'] ?? null);
            $waktuForKal = $jamMulai ?? '12:00:00';
            $hijri = KalenderHelper::masehiToHijriyah($this->db, $tanggalMasehi, $waktuForKal);

            $pesertaIn = $body['peserta'] ?? null;
            if (!is_array($pesertaIn) || $pesertaIn === []) {
                return $this->json($response, ['success' => false, 'message' => 'peserta tidak boleh kosong'], 400);
            }

            $norm = $this->normalizePesertaInput($pesertaIn, $allowedSantri);
            if ($norm[0] !== true) {
                return $this->json($response, ['success' => false, 'message' => $norm[1] ?? 'peserta tidak valid'], 400);
            }
            /** @var list<array{0: int, 1: string, 2: float|null, 3: string|null}> $rows */
            $rows = $norm[2] ?? [];

            $idUser = $this->idUserPembuat($request);
            $this->db->beginTransaction();
            try {
                if ($existingId !== null) {
                    $stmt = $this->db->prepare(
                        'SELECT u.id_ujian_grup, u.id_lembaga_kitab FROM ujian u WHERE u.id = ? LIMIT 1'
                    );
                    $stmt->execute([$existingId]);
                    $old = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$old) {
                        $this->db->rollBack();

                        return $this->json($response, ['success' => false, 'message' => 'Ujian tidak ditemukan'], 404);
                    }
                    if ((int) $old['id_lembaga_kitab'] !== $idLk) {
                        $this->db->rollBack();

                        return $this->json($response, ['success' => false, 'message' => 'id_lembaga_kitab tidak boleh diubah'], 400);
                    }
                    $idGrup = (int) $old['id_ujian_grup'];
                    $csvUp = isset($body['id_rombel_ids']) ? trim((string) $body['id_rombel_ids']) : '';
                    if ($csvUp !== '') {
                        $norm = $this->normalizeRombelIdsCsv($this->parseRombelIdsCsv($csvUp));
                        $this->db->prepare('UPDATE ujian_grup SET judul = ?, jenis = ?, id_rombel_ids = ? WHERE id = ?')->execute([
                            $judul,
                            $jenis,
                            $norm,
                            $idGrup,
                        ]);
                    } else {
                        $this->db->prepare('UPDATE ujian_grup SET judul = ?, jenis = ? WHERE id = ?')->execute([
                            $judul,
                            $jenis,
                            $idGrup,
                        ]);
                    }
                    $stmt = $this->db->prepare(
                        'UPDATE ujian SET judul = ?, jenis = ?, tanggal_masehi = ?, jam_mulai = ?, jam_selesai = ?, tanggal_hijriyah = ?
                        WHERE id = ?'
                    );
                    $stmt->execute([
                        $judul,
                        $jenis,
                        $tanggalMasehi,
                        $jamMulai,
                        $jamSelesai,
                        $hijri,
                        $existingId,
                    ]);
                    $this->db->prepare('DELETE FROM ujian___peserta WHERE id_ujian = ?')->execute([$existingId]);
                    $ujianId = $existingId;
                } else {
                    $primaryRombel = (int) $mapel['rombel_id'];
                    $csvBody = isset($body['id_rombel_ids']) ? trim((string) $body['id_rombel_ids']) : '';
                    $parsed = $this->parseRombelIdsCsv($csvBody !== '' ? $csvBody : null);
                    $rombelForGrup = $parsed !== [] ? $parsed : [$primaryRombel];
                    $normCsv = $this->normalizeRombelIdsCsv($rombelForGrup);
                    $stmt = $this->db->prepare(
                        'INSERT INTO ujian_grup (judul, jenis, id_rombel_ids, id_user_pembuat) VALUES (?, ?, ?, ?)'
                    );
                    $stmt->execute([$judul, $jenis, $normCsv, $idUser]);
                    $idGrup = (int) $this->db->lastInsertId();
                    $stmt = $this->db->prepare(
                        'INSERT INTO ujian (id_ujian_grup, id_lembaga_kitab, judul, jenis, tanggal_masehi, jam_mulai, jam_selesai, tanggal_hijriyah, id_user_pembuat)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([
                        $idGrup,
                        $idLk,
                        $judul,
                        $jenis,
                        $tanggalMasehi,
                        $jamMulai,
                        $jamSelesai,
                        $hijri,
                        $idUser,
                    ]);
                    $ujianId = (int) $this->db->lastInsertId();
                }

                $ins = $this->db->prepare(
                    'INSERT INTO ujian___peserta (id_ujian, id_santri, kehadiran, nilai, catatan) VALUES (?, ?, ?, ?, ?)'
                );
                foreach ($rows as $r) {
                    $ins->execute([$ujianId, $r[0], $r[1], $r[2], $r[3]]);
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->json($response, [
                'success' => true,
                'message' => $existingId !== null ? 'Ujian diperbarui' : 'Ujian disimpan',
                'data' => ['id' => $ujianId],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::saveUjian: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan ujian'], 500);
        }
    }

    private function normalizeTime(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $s = trim((string) $v);
        if (preg_match('/^\d{2}:\d{2}$/', $s) === 1) {
            return $s . ':00';
        }
        if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $s) === 1) {
            return $s;
        }

        return null;
    }

    /**
     * POST /api/ujian/grup
     */
    public function createGrup(Request $request, Response $response): Response
    {
        return $this->saveGrupTransaction($request, $response, null);
    }

    /**
     * PUT /api/ujian/grup/{id}
     */
    public function updateGrup(Request $request, Response $response, array $args): Response
    {
        $id = isset($args['id']) ? (int) $args['id'] : 0;
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID grup tidak valid'], 400);
        }

        return $this->saveGrupTransaction($request, $response, $id);
    }

    /**
     * GET /api/ujian/grup/{id}
     */
    public function getGrupById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID grup tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT * FROM ujian_grup WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $grup = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$grup) {
                return $this->json($response, ['success' => false, 'message' => 'Grup tidak ditemukan'], 404);
            }
            $stmt = $this->db->prepare(
                "SELECT u.*, lk.id_rombel, lk.id_kitab, r.kelas, r.kel, r.lembaga_id,
                    l.nama AS lembaga_nama, k.nama_indo AS kitab_nama, k.fan AS kitab_fan
                FROM ujian u
                INNER JOIN lembaga___kitab lk ON lk.id = u.id_lembaga_kitab
                INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                LEFT JOIN lembaga l ON l.id = r.lembaga_id
                INNER JOIN kitab k ON k.id = lk.id_kitab
                WHERE u.id_ujian_grup = ? ORDER BY u.id"
            );
            $stmt->execute([$id]);
            $ujianRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $ids = array_map(static fn ($r) => (int) $r['id'], $ujianRows);
            $pesertaByUjian = [];
            if ($ids !== []) {
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $stmt = $this->db->prepare(
                    "SELECT up.*, s.nis, s.nama FROM ujian___peserta up
                    INNER JOIN santri s ON s.id = up.id_santri
                    WHERE up.id_ujian IN ($ph) ORDER BY up.id_ujian, s.nama"
                );
                $stmt->execute($ids);
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $uid = (int) $row['id_ujian'];
                    if (!isset($pesertaByUjian[$uid])) {
                        $pesertaByUjian[$uid] = [];
                    }
                    $pesertaByUjian[$uid][] = $row;
                }
            }
            $items = [];
            foreach ($ujianRows as $u) {
                $uid = (int) $u['id'];
                $items[] = [
                    'ujian' => $u,
                    'peserta' => $pesertaByUjian[$uid] ?? [],
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'grup' => $grup,
                    'items' => $items,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::getGrupById: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil grup'], 500);
        }
    }

    /**
     * DELETE /api/ujian/grup/{id}
     */
    public function deleteGrup(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID grup tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM ujian_grup WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            return $this->json($response, ['success' => true, 'message' => 'Grup ujian dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::deleteGrup: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus grup'], 500);
        }
    }

    private function saveGrupTransaction(Request $request, Response $response, ?int $existingGrupId): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $judul = TextSanitizer::cleanTextOrNull($body['judul'] ?? '') ?? '';
            $judul = trim($judul) !== '' ? trim($judul) : 'Ujian';
            $jenis = TextSanitizer::cleanTextOrNull($body['jenis'] ?? null);
            $csvRombel = isset($body['id_rombel_ids']) ? trim((string) $body['id_rombel_ids']) : '';
            $rombelParsed = $this->parseRombelIdsCsv($csvRombel !== '' ? $csvRombel : null);
            if ($rombelParsed === []) {
                return $this->json($response, ['success' => false, 'message' => 'id_rombel_ids wajib (minimal satu rombel)'], 400);
            }
            $normRombelCsv = $this->normalizeRombelIdsCsv($rombelParsed);
            $rombelFlip = $this->rombelFlipFromCsv($normRombelCsv);

            $itemsIn = $body['items'] ?? null;
            if (!is_array($itemsIn) || $itemsIn === []) {
                return $this->json($response, ['success' => false, 'message' => 'items wajib berisi minimal satu jadwal'], 400);
            }

            $prepared = [];
            foreach ($itemsIn as $idx => $item) {
                if (!is_array($item)) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ' tidak valid'], 400);
                }
                $idLk = isset($item['id_lembaga_kitab']) ? (int) $item['id_lembaga_kitab'] : 0;
                if ($idLk < 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ': id_lembaga_kitab wajib'], 400);
                }
                $mapel = $this->loadLembagaKitabRow($idLk);
                if (!$mapel) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ': mapel tidak ditemukan'], 400);
                }
                $ridMapel = (int) $mapel['rombel_id'];
                if (!isset($rombelFlip[$ridMapel])) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Item #' . ($idx + 1) . ': mapel tidak termasuk rombel yang dipilih',
                    ], 400);
                }
                $tanggalMasehi = isset($item['tanggal_masehi']) ? trim((string) $item['tanggal_masehi']) : '';
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalMasehi)) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ': tanggal_masehi format Y-m-d'], 400);
                }
                $jamMulai = $this->normalizeTime($item['jam_mulai'] ?? null);
                $jamSelesai = $this->normalizeTime($item['jam_selesai'] ?? null);
                $waktuForKal = $jamMulai ?? '12:00:00';
                $hijri = KalenderHelper::masehiToHijriyah($this->db, $tanggalMasehi, $waktuForKal);
                $pesertaIn = $item['peserta'] ?? null;
                if (!is_array($pesertaIn) || $pesertaIn === []) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ': peserta tidak boleh kosong'], 400);
                }
                $romCtx = $this->rombelIdsForKitabContext($idLk, $normRombelCsv);
                $allowedFlip = array_flip($this->santriIdsUnionRombels($romCtx));
                $normP = $this->normalizePesertaInput($pesertaIn, $allowedFlip);
                if ($normP[0] !== true) {
                    return $this->json($response, ['success' => false, 'message' => 'Item #' . ($idx + 1) . ': ' . ($normP[1] ?? 'peserta tidak valid')], 400);
                }
                /** @var list<array{0: int, 1: string, 2: float|null, 3: string|null}> $pRows */
                $pRows = $normP[2] ?? [];
                $prepared[] = [$idLk, $tanggalMasehi, $jamMulai, $jamSelesai, $hijri, $pRows];
            }

            $idUser = $this->idUserPembuat($request);
            $this->db->beginTransaction();
            try {
                if ($existingGrupId !== null) {
                    $stmt = $this->db->prepare('SELECT id FROM ujian_grup WHERE id = ? LIMIT 1');
                    $stmt->execute([$existingGrupId]);
                    if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                        $this->db->rollBack();

                        return $this->json($response, ['success' => false, 'message' => 'Grup tidak ditemukan'], 404);
                    }
                    $this->db->prepare('DELETE FROM ujian WHERE id_ujian_grup = ?')->execute([$existingGrupId]);
                    $this->db->prepare('UPDATE ujian_grup SET judul = ?, jenis = ?, id_rombel_ids = ? WHERE id = ?')->execute([
                        $judul,
                        $jenis,
                        $normRombelCsv,
                        $existingGrupId,
                    ]);
                    $idGrup = $existingGrupId;
                } else {
                    $stmt = $this->db->prepare(
                        'INSERT INTO ujian_grup (judul, jenis, id_rombel_ids, id_user_pembuat) VALUES (?, ?, ?, ?)'
                    );
                    $stmt->execute([$judul, $jenis, $normRombelCsv, $idUser]);
                    $idGrup = (int) $this->db->lastInsertId();
                }

                $ujianIds = [];
                foreach ($prepared as $row) {
                    $ujianIds[] = $this->insertUjianRowWithPeserta(
                        $idGrup,
                        (int) $row[0],
                        $judul,
                        $jenis,
                        (string) $row[1],
                        $row[2],
                        $row[3],
                        $row[4],
                        $idUser,
                        $row[5]
                    );
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->json($response, [
                'success' => true,
                'message' => $existingGrupId !== null ? 'Kelompok ujian diperbarui' : 'Kelompok ujian disimpan',
                'data' => [
                    'id_ujian_grup' => $idGrup,
                    'id_ujian_list' => $ujianIds ?? [],
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::saveGrupTransaction: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan kelompok ujian'], 500);
        }
    }

    /**
     * DELETE /api/ujian/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT id_ujian_grup FROM ujian WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $gidRow = $stmt->fetch(PDO::FETCH_ASSOC);
            $idGrup = $gidRow !== false ? (int) ($gidRow['id_ujian_grup'] ?? 0) : 0;

            $stmt = $this->db->prepare('DELETE FROM ujian WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }
            if ($idGrup > 0) {
                $c = $this->db->prepare('SELECT COUNT(*) AS c FROM ujian WHERE id_ujian_grup = ?');
                $c->execute([$idGrup]);
                $cnt = (int) ($c->fetch(PDO::FETCH_ASSOC)['c'] ?? 0);
                if ($cnt === 0) {
                    $this->db->prepare('DELETE FROM ujian_grup WHERE id = ?')->execute([$idGrup]);
                }
            }

            return $this->json($response, ['success' => true, 'message' => 'Ujian dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('UjianController::delete: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus'], 500);
        }
    }
}
