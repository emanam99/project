<?php

namespace App\Controllers;

use App\Config\Database;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AbsenGuruRekapPublishController {
    private const TIMEZONE = 'Asia/Jakarta';

    public function occupied(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $kelasIds = $this->parseKelasIdsParam($params['kelas_ids'] ?? '');
        $excludeId = (int) ($params['exclude_id'] ?? 0);

        $db = Database::getInstance();
        if (count($kelasIds) === 0) {
            $kelasIds = $this->allKelasIds($db);
        }
        if (count($kelasIds) === 0) {
            return $this->jsonResponse($response, ['success' => true, 'data' => [], 'meta' => ['kelas_ids' => []]]);
        }

        $placeholders = implode(',', array_fill(0, count($kelasIds), '?'));
        $sql = "SELECT DISTINCT tanggal FROM pengurus___absen_rekap_publish_hari WHERE kelas_id IN ($placeholders)";
        $bind = $kelasIds;
        if ($excludeId > 0) {
            $sql .= ' AND publish_id <> ?';
            $bind[] = $excludeId;
        }
        $sql .= ' ORDER BY tanggal ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $dates = array_map(static fn($r) => (string) $r['tanggal'], $stmt->fetchAll());

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $dates,
            'meta' => ['kelas_ids' => array_map('strval', $kelasIds)],
        ]);
    }

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        $isAdmin = $this->isAdminAkses($akses);

        $db = Database::getInstance();
        $sql = '
            SELECT p.id, p.judul, p.catatan, p.tanggal_awal, p.tanggal_akhir,
                   p.hijri_awal, p.hijri_akhir, p.publish_at, p.published_by, p.semua_kelas,
                   p.created_at, p.updated_at,
                   pg.nama AS publisher_nama
            FROM pengurus___absen_rekap_publish p
            LEFT JOIN pengurus pg ON pg.id = p.published_by
            WHERE 1=1
        ';
        $bind = [];
        if (!$isAdmin) {
            $sql .= ' AND p.publish_at <= :now';
            $bind['now'] = $this->now()->format('Y-m-d H:i:s');
        }
        $sql .= ' ORDER BY p.publish_at DESC, p.id DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        $now = $this->now();
        foreach ($rows as &$row) {
            $row = $this->formatPublishRow($db, $row, $now, $isAdmin);
        }
        unset($row);

        return $this->jsonResponse($response, ['success' => true, 'data' => $rows]);
    }

    public function show(Request $request, Response $response, array $args): Response {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        $isAdmin = $this->isAdminAkses($akses);

        $db = Database::getInstance();
        $stmt = $db->prepare('
            SELECT p.id, p.judul, p.catatan, p.tanggal_awal, p.tanggal_akhir,
                   p.hijri_awal, p.hijri_akhir, p.publish_at, p.published_by, p.semua_kelas,
                   p.created_at, p.updated_at,
                   pg.nama AS publisher_nama
            FROM pengurus___absen_rekap_publish p
            LEFT JOIN pengurus pg ON pg.id = p.published_by
            WHERE p.id = :id
        ');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }

        $now = $this->now();
        $publishAt = new DateTimeImmutable((string) $row['publish_at'], new DateTimeZone(self::TIMEZONE));
        $isLive = $publishAt <= $now;
        if (!$isAdmin && !$isLive) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $this->formatPublishRow($db, $row, $now, false),
                'baris' => [],
                'meta' => [
                    'locked' => true,
                    'publish_at' => $publishAt->format('Y-m-d H:i:s'),
                    'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
                ],
            ]);
        }

        $stmtB = $db->prepare('
            SELECT id, pengurus_id, pengurus_nama, mengajar, ijin, sakit,
                   jam1_mengajar, jam1_ijin, jam1_sakit,
                   jam2_mengajar, jam2_ijin, jam2_sakit, urutan
            FROM pengurus___absen_rekap_publish_baris
            WHERE publish_id = :id
            ORDER BY urutan ASC, pengurus_nama ASC
        ');
        $stmtB->execute(['id' => $id]);
        $baris = $stmtB->fetchAll();
        foreach ($baris as &$b) {
            $b['pengurus_id'] = (string) $b['pengurus_id'];
            foreach ([
                'mengajar', 'ijin', 'sakit',
                'jam1_mengajar', 'jam1_ijin', 'jam1_sakit',
                'jam2_mengajar', 'jam2_ijin', 'jam2_sakit', 'urutan',
            ] as $k) {
                $b[$k] = (int) $b[$k];
            }
        }
        unset($b);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $this->formatPublishRow($db, $row, $now, $isAdmin),
            'baris' => $baris,
            'meta' => [
                'locked' => false,
                'publish_at' => $publishAt->format('Y-m-d H:i:s'),
                'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
            ],
        ]);
    }

    public function create(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request, true)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $data = $this->parseBody($request);
        $db = Database::getInstance();
        $parsed = $this->parsePublishPayload($db, $data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $overlap = $this->findOccupiedOverlap(
            $db,
            $parsed['kelas_ids'],
            $parsed['tanggal_awal'],
            $parsed['tanggal_akhir'],
            null
        );
        if ($overlap) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal bentrok dengan rekap guru yang sudah dipublish: '
                    . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO pengurus___absen_rekap_publish
                    (judul, catatan, tanggal_awal, tanggal_akhir, hijri_awal, hijri_akhir, publish_at, published_by, semua_kelas)
                VALUES
                    (:judul, :catatan, :tanggal_awal, :tanggal_akhir, :hijri_awal, :hijri_akhir, :publish_at, :published_by, :semua_kelas)
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'publish_at' => $parsed['publish_at'],
                'published_by' => $parsed['published_by'],
                'semua_kelas' => $parsed['semua_kelas'] ? 1 : 0,
            ]);
            $publishId = (int) $db->lastInsertId();

            $this->insertKelas($db, $publishId, $parsed['kelas_ids']);
            $this->insertHari($db, $publishId, $parsed['kelas_ids'], $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
            $this->insertBaris($db, $publishId, $parsed['baris']);

            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan publish: ' . $e->getMessage(),
            ], 500);
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Rekap guru berhasil dipublish',
            'data' => ['id' => $publishId],
        ]);
    }

    public function update(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request, true)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }
        $data = $this->parseBody($request);
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM pengurus___absen_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }

        $parsed = $this->parsePublishPayload($db, $data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $overlap = $this->findOccupiedOverlap(
            $db,
            $parsed['kelas_ids'],
            $parsed['tanggal_awal'],
            $parsed['tanggal_akhir'],
            $id
        );
        if ($overlap) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal bentrok dengan rekap lain: '
                    . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                UPDATE pengurus___absen_rekap_publish SET
                    judul = :judul,
                    catatan = :catatan,
                    tanggal_awal = :tanggal_awal,
                    tanggal_akhir = :tanggal_akhir,
                    hijri_awal = :hijri_awal,
                    hijri_akhir = :hijri_akhir,
                    publish_at = :publish_at,
                    semua_kelas = :semua_kelas
                WHERE id = :id
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'publish_at' => $parsed['publish_at'],
                'semua_kelas' => $parsed['semua_kelas'] ? 1 : 0,
                'id' => $id,
            ]);

            $db->prepare('DELETE FROM pengurus___absen_rekap_publish_hari WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM pengurus___absen_rekap_publish_kelas WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM pengurus___absen_rekap_publish_baris WHERE publish_id = :id')->execute(['id' => $id]);
            $this->insertKelas($db, $id, $parsed['kelas_ids']);
            $this->insertHari($db, $id, $parsed['kelas_ids'], $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
            $this->insertBaris($db, $id, $parsed['baris']);

            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui publish: ' . $e->getMessage(),
            ], 500);
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Rekap publish diperbarui',
            'data' => ['id' => $id],
        ]);
    }

    public function delete(Request $request, Response $response, array $args): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib'], 400);
        }
        $db = Database::getInstance();
        $stmt = $db->prepare('DELETE FROM pengurus___absen_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Rekap publish dihapus']);
    }

    /** @return array{error?:string}|array */
    private function parsePublishPayload(PDO $db, array $data): array {
        $judul = trim((string) ($data['judul'] ?? ''));
        $catatan = trim((string) ($data['catatan'] ?? ''));
        $tanggalAwal = trim((string) ($data['tanggal_awal'] ?? ''));
        $tanggalAkhir = trim((string) ($data['tanggal_akhir'] ?? ''));
        $hijriAwal = trim((string) ($data['hijri_awal'] ?? '')) ?: null;
        $hijriAkhir = trim((string) ($data['hijri_akhir'] ?? '')) ?: null;
        $publishAtRaw = trim((string) ($data['publish_at'] ?? ''));
        $publishedBy = isset($data['published_by']) && $data['published_by'] !== ''
            ? (int) $data['published_by']
            : null;
        $baris = $data['baris'] ?? [];
        $semuaKelas = !empty($data['semua_kelas']);
        $kelasIds = $this->parseKelasIdsParam($data['kelas_ids'] ?? []);

        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAwal) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAkhir)) {
            return ['error' => 'Tanggal harus format YYYY-MM-DD'];
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return ['error' => 'Tanggal awal tidak boleh setelah tanggal akhir'];
        }
        if ($publishAtRaw === '') {
            return ['error' => 'Tanggal & jam publish wajib'];
        }
        $publishAtRaw = str_replace('T', ' ', $publishAtRaw);
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $publishAtRaw)) {
            $publishAtRaw .= ':00';
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $publishAtRaw)) {
            return ['error' => 'Format publish_at tidak valid'];
        }

        if ($semuaKelas || count($kelasIds) === 0) {
            $kelasIds = $this->allKelasIds($db);
            $semuaKelas = true;
        }
        if (count($kelasIds) === 0) {
            return ['error' => 'Tidak ada kelas untuk dipublish'];
        }

        if (!is_array($baris) || count($baris) === 0) {
            return ['error' => 'Baris rekap wajib (minimal 1 guru)'];
        }

        $cleanBaris = [];
        foreach ($baris as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $pid = (int) ($b['pengurus_id'] ?? 0);
            if ($pid <= 0) {
                return ['error' => 'pengurus_id wajib pada baris'];
            }
            $cleanBaris[] = [
                'pengurus_id' => $pid,
                'pengurus_nama' => trim((string) ($b['pengurus_nama'] ?? '')) ?: '—',
                'mengajar' => max(0, (int) ($b['mengajar'] ?? 0)),
                'ijin' => max(0, (int) ($b['ijin'] ?? 0)),
                'sakit' => max(0, (int) ($b['sakit'] ?? 0)),
                'jam1_mengajar' => max(0, (int) ($b['jam1_mengajar'] ?? 0)),
                'jam1_ijin' => max(0, (int) ($b['jam1_ijin'] ?? 0)),
                'jam1_sakit' => max(0, (int) ($b['jam1_sakit'] ?? 0)),
                'jam2_mengajar' => max(0, (int) ($b['jam2_mengajar'] ?? 0)),
                'jam2_ijin' => max(0, (int) ($b['jam2_ijin'] ?? 0)),
                'jam2_sakit' => max(0, (int) ($b['jam2_sakit'] ?? 0)),
                'urutan' => (int) ($b['urutan'] ?? ($i + 1)),
            ];
        }
        if (count($cleanBaris) === 0) {
            return ['error' => 'Baris rekap kosong'];
        }

        return [
            'judul' => $judul,
            'catatan' => $catatan !== '' ? $catatan : null,
            'kelas_ids' => $kelasIds,
            'semua_kelas' => $semuaKelas,
            'tanggal_awal' => $tanggalAwal,
            'tanggal_akhir' => $tanggalAkhir,
            'hijri_awal' => $hijriAwal,
            'hijri_akhir' => $hijriAkhir,
            'publish_at' => $publishAtRaw,
            'published_by' => $publishedBy,
            'baris' => $cleanBaris,
        ];
    }

    /** @param int[] $kelasIds */
    private function insertKelas(PDO $db, int $publishId, array $kelasIds): void {
        $stmt = $db->prepare('
            INSERT INTO pengurus___absen_rekap_publish_kelas (publish_id, kelas_id)
            VALUES (:publish_id, :kelas_id)
        ');
        foreach ($kelasIds as $kid) {
            $stmt->execute(['publish_id' => $publishId, 'kelas_id' => $kid]);
        }
    }

    /** @param int[] $kelasIds */
    private function insertHari(PDO $db, int $publishId, array $kelasIds, string $awal, string $akhir): void {
        $stmt = $db->prepare('
            INSERT INTO pengurus___absen_rekap_publish_hari (publish_id, kelas_id, tanggal)
            VALUES (:publish_id, :kelas_id, :tanggal)
        ');
        foreach ($kelasIds as $kid) {
            foreach ($this->dateRange($awal, $akhir) as $tgl) {
                $stmt->execute([
                    'publish_id' => $publishId,
                    'kelas_id' => $kid,
                    'tanggal' => $tgl,
                ]);
            }
        }
    }

    private function insertBaris(PDO $db, int $publishId, array $baris): void {
        $stmt = $db->prepare('
            INSERT INTO pengurus___absen_rekap_publish_baris
                (publish_id, pengurus_id, pengurus_nama, mengajar, ijin, sakit,
                 jam1_mengajar, jam1_ijin, jam1_sakit, jam2_mengajar, jam2_ijin, jam2_sakit, urutan)
            VALUES
                (:publish_id, :pengurus_id, :pengurus_nama, :mengajar, :ijin, :sakit,
                 :jam1_mengajar, :jam1_ijin, :jam1_sakit, :jam2_mengajar, :jam2_ijin, :jam2_sakit, :urutan)
        ');
        foreach ($baris as $b) {
            $stmt->execute([
                'publish_id' => $publishId,
                'pengurus_id' => $b['pengurus_id'],
                'pengurus_nama' => $b['pengurus_nama'],
                'mengajar' => $b['mengajar'],
                'ijin' => $b['ijin'],
                'sakit' => $b['sakit'],
                'jam1_mengajar' => $b['jam1_mengajar'],
                'jam1_ijin' => $b['jam1_ijin'],
                'jam1_sakit' => $b['jam1_sakit'],
                'jam2_mengajar' => $b['jam2_mengajar'],
                'jam2_ijin' => $b['jam2_ijin'],
                'jam2_sakit' => $b['jam2_sakit'],
                'urutan' => $b['urutan'],
            ]);
        }
    }

    /** @param int[] $kelasIds @return string[] */
    private function findOccupiedOverlap(PDO $db, array $kelasIds, string $awal, string $akhir, ?int $excludeId): array {
        if (count($kelasIds) === 0) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($kelasIds), '?'));
        $sql = "
            SELECT DISTINCT tanggal FROM pengurus___absen_rekap_publish_hari
            WHERE kelas_id IN ($placeholders) AND tanggal BETWEEN ? AND ?
        ";
        $bind = array_merge($kelasIds, [$awal, $akhir]);
        if ($excludeId !== null && $excludeId > 0) {
            $sql .= ' AND publish_id <> ?';
            $bind[] = $excludeId;
        }
        $sql .= ' ORDER BY tanggal ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        return array_map(static fn($r) => (string) $r['tanggal'], $stmt->fetchAll());
    }

    private function formatPublishRow(PDO $db, array $row, DateTimeImmutable $now, bool $isAdmin): array {
        $publishAt = new DateTimeImmutable((string) $row['publish_at'], new DateTimeZone(self::TIMEZONE));
        $isLive = $publishAt <= $now;
        $kelas = $this->loadKelasForPublish($db, (int) $row['id']);
        $kelasLabels = array_map(static function ($k) {
            $nama = (string) ($k['nama_kelas'] ?? '');
            $kel = trim((string) ($k['kel'] ?? ''));
            return $kel !== '' ? "$nama · $kel" : $nama;
        }, $kelas);

        return [
            'id' => (string) $row['id'],
            'judul' => $row['judul'],
            'catatan' => $row['catatan'],
            'tanggal_awal' => $row['tanggal_awal'],
            'tanggal_akhir' => $row['tanggal_akhir'],
            'hijri_awal' => $row['hijri_awal'],
            'hijri_akhir' => $row['hijri_akhir'],
            'publish_at' => $publishAt->format('Y-m-d H:i:s'),
            'published_by' => $row['published_by'] !== null ? (string) $row['published_by'] : null,
            'publisher_nama' => $row['publisher_nama'] ?? null,
            'semua_kelas' => (int) ($row['semua_kelas'] ?? 0) === 1,
            'kelas_ids' => array_map(static fn($k) => (string) $k['kelas_id'], $kelas),
            'kelas_labels' => $kelasLabels,
            'kelas_label' => !empty($row['semua_kelas'])
                ? 'Semua kelas'
                : (count($kelasLabels) ? implode(', ', $kelasLabels) : '—'),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'is_live' => $isLive,
            'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
            'can_view_content' => $isAdmin || $isLive,
        ];
    }

    /** @return array<int, array{kelas_id:mixed,nama_kelas:mixed,kel:mixed}> */
    private function loadKelasForPublish(PDO $db, int $publishId): array {
        $stmt = $db->prepare('
            SELECT pk.kelas_id, kl.nama_kelas, kl.kel
            FROM pengurus___absen_rekap_publish_kelas pk
            INNER JOIN kelas kl ON kl.id = pk.kelas_id
            WHERE pk.publish_id = :id
            ORDER BY kl.nama_kelas ASC, kl.kel ASC
        ');
        $stmt->execute(['id' => $publishId]);
        return $stmt->fetchAll();
    }

    /** @return int[] */
    private function allKelasIds(PDO $db): array {
        $stmt = $db->query('SELECT id FROM kelas ORDER BY id ASC');
        return array_map(static fn($r) => (int) $r['id'], $stmt->fetchAll());
    }

    /** @param mixed $raw @return int[] */
    private function parseKelasIdsParam($raw): array {
        if (is_array($raw)) {
            $parts = $raw;
        } else {
            $str = trim((string) $raw);
            if ($str === '') {
                return [];
            }
            $parts = explode(',', $str);
        }
        $ids = [];
        foreach ($parts as $p) {
            $n = (int) $p;
            if ($n > 0) {
                $ids[$n] = $n;
            }
        }
        return array_values($ids);
    }

    /** @return string[] */
    private function dateRange(string $awal, string $akhir): array {
        $dates = [];
        $current = new DateTimeImmutable($awal);
        $end = new DateTimeImmutable($akhir);
        while ($current <= $end) {
            $dates[] = $current->format('Y-m-d');
            $current = $current->add(new DateInterval('P1D'));
        }
        return $dates;
    }

    private function now(): DateTimeImmutable {
        return new DateTimeImmutable('now', new DateTimeZone(self::TIMEZONE));
    }

    /** @return array{success:bool,message:string}|null */
    private function requireAdmin(Request $request, bool $fromBody = false): ?array {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        if ($akses === '' && $fromBody) {
            $data = $this->parseBody($request);
            $akses = (string) ($data['akses'] ?? '');
        }
        if (!$this->isAdminAkses($akses)) {
            return ['success' => false, 'message' => 'Akses ditolak (admin saja)'];
        }
        return null;
    }

    private function isAdminAkses(string $akses): bool {
        return in_array($akses, ['super_admin', 'admin'], true);
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
