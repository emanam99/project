<?php

namespace App\Controllers;

use App\Config\Database;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AbsenRekapPublishController {
    private const TIMEZONE = 'Asia/Jakarta';

    public function occupied(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $kelasId = (int) ($request->getQueryParams()['kelas_id'] ?? 0);
        if ($kelasId <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_id wajib', 'data' => []]);
        }
        $excludeId = (int) ($request->getQueryParams()['exclude_id'] ?? 0);

        $db = Database::getInstance();
        $sql = 'SELECT tanggal, publish_id FROM santri___absen_rekap_publish_hari WHERE kelas_id = :kelas';
        $bind = ['kelas' => $kelasId];
        if ($excludeId > 0) {
            $sql .= ' AND publish_id <> :ex';
            $bind['ex'] = $excludeId;
        }
        $sql .= ' ORDER BY tanggal ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        $dates = array_map(static fn($r) => (string) $r['tanggal'], $rows);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $dates,
            'meta' => ['kelas_id' => $kelasId],
        ]);
    }

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $akses = (string) ($params['akses'] ?? '');
        $isAdmin = $this->isAdminAkses($akses);
        $kelasId = (int) ($params['kelas_id'] ?? 0);

        $db = Database::getInstance();
        $sql = '
            SELECT p.id, p.kelas_id, p.judul, p.catatan, p.tanggal_awal, p.tanggal_akhir,
                   p.hijri_awal, p.hijri_akhir, p.publish_at, p.published_by, p.created_at, p.updated_at,
                   kl.nama_kelas, kl.kel,
                   pg.nama AS publisher_nama
            FROM santri___absen_rekap_publish p
            INNER JOIN kelas kl ON kl.id = p.kelas_id
            LEFT JOIN pengurus pg ON pg.id = p.published_by
            WHERE 1=1
        ';
        $bind = [];
        if ($kelasId > 0) {
            $sql .= ' AND p.kelas_id = :kelas';
            $bind['kelas'] = $kelasId;
        }
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
            $row = $this->formatPublishRow($row, $now, $isAdmin);
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
            SELECT p.id, p.kelas_id, p.judul, p.catatan, p.tanggal_awal, p.tanggal_akhir,
                   p.hijri_awal, p.hijri_akhir, p.publish_at, p.published_by, p.created_at, p.updated_at,
                   kl.nama_kelas, kl.kel,
                   pg.nama AS publisher_nama
            FROM santri___absen_rekap_publish p
            INNER JOIN kelas kl ON kl.id = p.kelas_id
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
                'data' => $this->formatPublishRow($row, $now, false),
                'baris' => [],
                'meta' => [
                    'locked' => true,
                    'publish_at' => $publishAt->format('Y-m-d H:i:s'),
                    'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
                ],
            ]);
        }

        $stmtB = $db->prepare('
            SELECT id, santri_id, nomer_induk, nama, h, s, i, a,
                   jam1_h, jam1_s, jam1_i, jam1_a, jam2_h, jam2_s, jam2_i, jam2_a, urutan
            FROM santri___absen_rekap_publish_baris
            WHERE publish_id = :id
            ORDER BY urutan ASC, nama ASC
        ');
        $stmtB->execute(['id' => $id]);
        $baris = $stmtB->fetchAll();
        foreach ($baris as &$b) {
            $b['santri_id'] = (string) $b['santri_id'];
            foreach (['h', 's', 'i', 'a', 'jam1_h', 'jam1_s', 'jam1_i', 'jam1_a', 'jam2_h', 'jam2_s', 'jam2_i', 'jam2_a', 'urutan'] as $k) {
                $b[$k] = (int) $b[$k];
            }
        }
        unset($b);

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $this->formatPublishRow($row, $now, $isAdmin),
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
        $parsed = $this->parsePublishPayload($data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $db = Database::getInstance();
        if (!$this->kelasExists($db, $parsed['kelas_id'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kelas tidak ditemukan'], 404);
        }

        $overlap = $this->findOccupiedOverlap($db, $parsed['kelas_id'], $parsed['tanggal_awal'], $parsed['tanggal_akhir'], null);
        if ($overlap) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal bentrok dengan rekap yang sudah dipublish: ' . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___absen_rekap_publish
                    (kelas_id, judul, catatan, tanggal_awal, tanggal_akhir, hijri_awal, hijri_akhir, publish_at, published_by)
                VALUES
                    (:kelas_id, :judul, :catatan, :tanggal_awal, :tanggal_akhir, :hijri_awal, :hijri_akhir, :publish_at, :published_by)
            ');
            $stmt->execute([
                'kelas_id' => $parsed['kelas_id'],
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'publish_at' => $parsed['publish_at'],
                'published_by' => $parsed['published_by'],
            ]);
            $publishId = (int) $db->lastInsertId();

            $this->insertHari($db, $publishId, $parsed['kelas_id'], $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
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
            'message' => 'Rekap berhasil dipublish',
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
        $parsed = $this->parsePublishPayload($data, false);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id, kelas_id FROM santri___absen_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }

        $kelasId = $parsed['kelas_id'] ?? (int) $existing['kelas_id'];
        $overlap = $this->findOccupiedOverlap($db, $kelasId, $parsed['tanggal_awal'], $parsed['tanggal_akhir'], $id);
        if ($overlap) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal bentrok dengan rekap lain: ' . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                UPDATE santri___absen_rekap_publish SET
                    kelas_id = :kelas_id,
                    judul = :judul,
                    catatan = :catatan,
                    tanggal_awal = :tanggal_awal,
                    tanggal_akhir = :tanggal_akhir,
                    hijri_awal = :hijri_awal,
                    hijri_akhir = :hijri_akhir,
                    publish_at = :publish_at
                WHERE id = :id
            ');
            $stmt->execute([
                'kelas_id' => $kelasId,
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'publish_at' => $parsed['publish_at'],
                'id' => $id,
            ]);

            $db->prepare('DELETE FROM santri___absen_rekap_publish_hari WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___absen_rekap_publish_baris WHERE publish_id = :id')->execute(['id' => $id]);
            $this->insertHari($db, $id, $kelasId, $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
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
        $stmt = $db->prepare('DELETE FROM santri___absen_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Rekap publish dihapus']);
    }

    /** @return array{error?:string}|array */
    private function parsePublishPayload(array $data, bool $requireKelas = true): array {
        $judul = trim((string) ($data['judul'] ?? ''));
        $catatan = trim((string) ($data['catatan'] ?? ''));
        $kelasId = (int) ($data['kelas_id'] ?? 0);
        $tanggalAwal = trim((string) ($data['tanggal_awal'] ?? ''));
        $tanggalAkhir = trim((string) ($data['tanggal_akhir'] ?? ''));
        $hijriAwal = trim((string) ($data['hijri_awal'] ?? '')) ?: null;
        $hijriAkhir = trim((string) ($data['hijri_akhir'] ?? '')) ?: null;
        $publishAtRaw = trim((string) ($data['publish_at'] ?? ''));
        $publishedBy = isset($data['published_by']) && $data['published_by'] !== ''
            ? (int) $data['published_by']
            : null;
        $baris = $data['baris'] ?? [];

        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'];
        }
        if ($requireKelas && $kelasId <= 0) {
            return ['error' => 'Kelas wajib dipilih'];
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
        // Terima "Y-m-d H:i:s" atau "Y-m-d\TH:i"
        $publishAtRaw = str_replace('T', ' ', $publishAtRaw);
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $publishAtRaw)) {
            $publishAtRaw .= ':00';
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $publishAtRaw)) {
            return ['error' => 'Format publish_at tidak valid'];
        }
        if (!is_array($baris) || count($baris) === 0) {
            return ['error' => 'Baris rekap wajib (minimal 1 santri)'];
        }

        $cleanBaris = [];
        foreach ($baris as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $sid = (int) ($b['santri_id'] ?? 0);
            if ($sid <= 0) {
                return ['error' => 'santri_id wajib pada baris'];
            }
            $cleanBaris[] = [
                'santri_id' => $sid,
                'nomer_induk' => trim((string) ($b['nomer_induk'] ?? '')) ?: null,
                'nama' => trim((string) ($b['nama'] ?? '')) ?: '—',
                'h' => max(0, (int) ($b['h'] ?? 0)),
                's' => max(0, (int) ($b['s'] ?? 0)),
                'i' => max(0, (int) ($b['i'] ?? 0)),
                'a' => max(0, (int) ($b['a'] ?? 0)),
                'jam1_h' => max(0, (int) ($b['jam1_h'] ?? 0)),
                'jam1_s' => max(0, (int) ($b['jam1_s'] ?? 0)),
                'jam1_i' => max(0, (int) ($b['jam1_i'] ?? 0)),
                'jam1_a' => max(0, (int) ($b['jam1_a'] ?? 0)),
                'jam2_h' => max(0, (int) ($b['jam2_h'] ?? 0)),
                'jam2_s' => max(0, (int) ($b['jam2_s'] ?? 0)),
                'jam2_i' => max(0, (int) ($b['jam2_i'] ?? 0)),
                'jam2_a' => max(0, (int) ($b['jam2_a'] ?? 0)),
                'urutan' => (int) ($b['urutan'] ?? ($i + 1)),
            ];
        }
        if (count($cleanBaris) === 0) {
            return ['error' => 'Baris rekap kosong'];
        }

        return [
            'judul' => $judul,
            'catatan' => $catatan !== '' ? $catatan : null,
            'kelas_id' => $kelasId,
            'tanggal_awal' => $tanggalAwal,
            'tanggal_akhir' => $tanggalAkhir,
            'hijri_awal' => $hijriAwal,
            'hijri_akhir' => $hijriAkhir,
            'publish_at' => $publishAtRaw,
            'published_by' => $publishedBy,
            'baris' => $cleanBaris,
        ];
    }

    private function insertHari(PDO $db, int $publishId, int $kelasId, string $awal, string $akhir): void {
        $stmt = $db->prepare('
            INSERT INTO santri___absen_rekap_publish_hari (publish_id, kelas_id, tanggal)
            VALUES (:publish_id, :kelas_id, :tanggal)
        ');
        foreach ($this->dateRange($awal, $akhir) as $tgl) {
            $stmt->execute([
                'publish_id' => $publishId,
                'kelas_id' => $kelasId,
                'tanggal' => $tgl,
            ]);
        }
    }

    private function insertBaris(PDO $db, int $publishId, array $baris): void {
        $stmt = $db->prepare('
            INSERT INTO santri___absen_rekap_publish_baris
                (publish_id, santri_id, nomer_induk, nama, h, s, i, a,
                 jam1_h, jam1_s, jam1_i, jam1_a, jam2_h, jam2_s, jam2_i, jam2_a, urutan)
            VALUES
                (:publish_id, :santri_id, :nomer_induk, :nama, :h, :s, :i, :a,
                 :jam1_h, :jam1_s, :jam1_i, :jam1_a, :jam2_h, :jam2_s, :jam2_i, :jam2_a, :urutan)
        ');
        foreach ($baris as $b) {
            $stmt->execute([
                'publish_id' => $publishId,
                'santri_id' => $b['santri_id'],
                'nomer_induk' => $b['nomer_induk'],
                'nama' => $b['nama'],
                'h' => $b['h'],
                's' => $b['s'],
                'i' => $b['i'],
                'a' => $b['a'],
                'jam1_h' => $b['jam1_h'],
                'jam1_s' => $b['jam1_s'],
                'jam1_i' => $b['jam1_i'],
                'jam1_a' => $b['jam1_a'],
                'jam2_h' => $b['jam2_h'],
                'jam2_s' => $b['jam2_s'],
                'jam2_i' => $b['jam2_i'],
                'jam2_a' => $b['jam2_a'],
                'urutan' => $b['urutan'],
            ]);
        }
    }

    /** @return string[] */
    private function findOccupiedOverlap(PDO $db, int $kelasId, string $awal, string $akhir, ?int $excludeId): array {
        $sql = '
            SELECT tanggal FROM santri___absen_rekap_publish_hari
            WHERE kelas_id = :kelas AND tanggal BETWEEN :awal AND :akhir
        ';
        $bind = ['kelas' => $kelasId, 'awal' => $awal, 'akhir' => $akhir];
        if ($excludeId !== null && $excludeId > 0) {
            $sql .= ' AND publish_id <> :ex';
            $bind['ex'] = $excludeId;
        }
        $sql .= ' ORDER BY tanggal ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        return array_map(static fn($r) => (string) $r['tanggal'], $stmt->fetchAll());
    }

    private function formatPublishRow(array $row, DateTimeImmutable $now, bool $isAdmin): array {
        $publishAt = new DateTimeImmutable((string) $row['publish_at'], new DateTimeZone(self::TIMEZONE));
        $isLive = $publishAt <= $now;
        return [
            'id' => (string) $row['id'],
            'kelas_id' => (string) $row['kelas_id'],
            'judul' => $row['judul'],
            'catatan' => $row['catatan'],
            'tanggal_awal' => $row['tanggal_awal'],
            'tanggal_akhir' => $row['tanggal_akhir'],
            'hijri_awal' => $row['hijri_awal'],
            'hijri_akhir' => $row['hijri_akhir'],
            'publish_at' => $publishAt->format('Y-m-d H:i:s'),
            'published_by' => $row['published_by'] !== null ? (string) $row['published_by'] : null,
            'publisher_nama' => $row['publisher_nama'] ?? null,
            'nama_kelas' => $row['nama_kelas'] ?? null,
            'kel' => $row['kel'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'is_live' => $isLive,
            'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
            'can_view_content' => $isAdmin || $isLive,
        ];
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

    private function kelasExists(PDO $db, int $kelasId): bool {
        $stmt = $db->prepare('SELECT 1 FROM kelas WHERE id = :id');
        $stmt->execute(['id' => $kelasId]);
        return (bool) $stmt->fetchColumn();
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
