<?php

namespace App\Controllers;

use App\Config\Database;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class NilaiRekapPublishController {
    private const TIMEZONE = 'Asia/Jakarta';
    private const TAMPIL = ['nilai', 'absen', 'keduanya'];

    public function occupied(Request $request, Response $response): Response {
        if ($err = $this->requireAdmin($request)) {
            return $this->jsonResponse($response, $err, 403);
        }
        $params = $request->getQueryParams();
        $kelasIds = $this->parseKelasIdsParam($params['kelas_ids'] ?? '');
        $excludeId = (int) ($params['exclude_id'] ?? 0);
        if (count($kelasIds) === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'kelas_ids wajib', 'data' => []], 400);
        }

        $db = Database::getInstance();
        $placeholders = implode(',', array_fill(0, count($kelasIds), '?'));
        $sql = "SELECT DISTINCT tanggal FROM santri___nilai_rekap_publish_hari WHERE kelas_id IN ($placeholders)";
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
                   p.hijri_awal, p.hijri_akhir, p.tampil, p.publish_at, p.published_by,
                   p.created_at, p.updated_at,
                   pg.nama AS publisher_nama
            FROM santri___nilai_rekap_publish p
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
                   p.hijri_awal, p.hijri_akhir, p.tampil, p.publish_at, p.published_by,
                   p.created_at, p.updated_at,
                   pg.nama AS publisher_nama
            FROM santri___nilai_rekap_publish p
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
                'mapel' => [],
                'baris' => [],
                'meta' => [
                    'locked' => true,
                    'publish_at' => $publishAt->format('Y-m-d H:i:s'),
                    'seconds_until' => max(0, $publishAt->getTimestamp() - $now->getTimestamp()),
                ],
            ]);
        }

        $payload = $this->loadDetailPayload($db, $id);
        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $this->formatPublishRow($db, $row, $now, $isAdmin),
            'mapel' => $payload['mapel'],
            'baris' => $payload['baris'],
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
        $parsed = $this->parsePublishPayload($data);
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
                'message' => 'Rentang tanggal bentrok dengan rekap nilai yang sudah dipublish: '
                    . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___nilai_rekap_publish
                    (judul, catatan, tanggal_awal, tanggal_akhir, hijri_awal, hijri_akhir, tampil, publish_at, published_by)
                VALUES
                    (:judul, :catatan, :tanggal_awal, :tanggal_akhir, :hijri_awal, :hijri_akhir, :tampil, :publish_at, :published_by)
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'tampil' => $parsed['tampil'],
                'publish_at' => $parsed['publish_at'],
                'published_by' => $parsed['published_by'],
            ]);
            $publishId = (int) $db->lastInsertId();
            $this->insertKelas($db, $publishId, $parsed['kelas_ids']);
            $this->insertHari($db, $publishId, $parsed['kelas_ids'], $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
            $this->insertMapel($db, $publishId, $parsed['mapel']);
            $this->insertBarisAndSel($db, $publishId, $parsed['baris']);
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
            'message' => 'Rekap nilai berhasil dipublish',
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

        $stmt = $db->prepare('SELECT id FROM santri___nilai_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }

        $parsed = $this->parsePublishPayload($data);
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
                UPDATE santri___nilai_rekap_publish SET
                    judul = :judul,
                    catatan = :catatan,
                    tanggal_awal = :tanggal_awal,
                    tanggal_akhir = :tanggal_akhir,
                    hijri_awal = :hijri_awal,
                    hijri_akhir = :hijri_akhir,
                    tampil = :tampil,
                    publish_at = :publish_at
                WHERE id = :id
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'tanggal_awal' => $parsed['tanggal_awal'],
                'tanggal_akhir' => $parsed['tanggal_akhir'],
                'hijri_awal' => $parsed['hijri_awal'],
                'hijri_akhir' => $parsed['hijri_akhir'],
                'tampil' => $parsed['tampil'],
                'publish_at' => $parsed['publish_at'],
                'id' => $id,
            ]);

            $db->prepare('DELETE FROM santri___nilai_rekap_publish_sel WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___nilai_rekap_publish_baris WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___nilai_rekap_publish_mapel WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___nilai_rekap_publish_hari WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___nilai_rekap_publish_kelas WHERE publish_id = :id')->execute(['id' => $id]);

            $this->insertKelas($db, $id, $parsed['kelas_ids']);
            $this->insertHari($db, $id, $parsed['kelas_ids'], $parsed['tanggal_awal'], $parsed['tanggal_akhir']);
            $this->insertMapel($db, $id, $parsed['mapel']);
            $this->insertBarisAndSel($db, $id, $parsed['baris']);
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
        $stmt = $db->prepare('DELETE FROM santri___nilai_rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Rekap publish dihapus']);
    }

    /** @return array{mapel:array,baris:array} */
    private function loadDetailPayload(PDO $db, int $publishId): array {
        $stmtM = $db->prepare('
            SELECT mapel_id AS id, fan, kitab_nama, musonnif, dari, sampai, urutan
            FROM santri___nilai_rekap_publish_mapel
            WHERE publish_id = :id
            ORDER BY urutan ASC, fan ASC
        ');
        $stmtM->execute(['id' => $publishId]);
        $mapel = $stmtM->fetchAll();
        foreach ($mapel as &$m) {
            $m['id'] = (string) $m['id'];
            $m['kitab_id'] = '';
            $m['urutan'] = (int) $m['urutan'];
        }
        unset($m);

        $stmtB = $db->prepare('
            SELECT id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel, urutan
            FROM santri___nilai_rekap_publish_baris
            WHERE publish_id = :id
            ORDER BY urutan ASC, nama ASC
        ');
        $stmtB->execute(['id' => $publishId]);
        $barisRaw = $stmtB->fetchAll();

        $stmtS = $db->prepare('
            SELECT baris_id, mapel_id, nilai, absen, tanggal
            FROM santri___nilai_rekap_publish_sel
            WHERE publish_id = :id
        ');
        $stmtS->execute(['id' => $publishId]);
        $selRows = $stmtS->fetchAll();
        $selMap = [];
        foreach ($selRows as $s) {
            $bid = (string) $s['baris_id'];
            $mid = (string) $s['mapel_id'];
            $selMap[$bid][$mid] = [
                'nilai' => $s['nilai'] === null ? null : (float) $s['nilai'],
                'absen' => $s['absen'],
                'tanggal' => $s['tanggal'],
            ];
        }

        $baris = [];
        foreach ($barisRaw as $b) {
            $bid = (string) $b['id'];
            $cells = [];
            foreach ($mapel as $m) {
                $mid = $m['id'];
                $cells[$mid] = $selMap[$bid][$mid] ?? null;
            }
            $baris[] = [
                'id' => $bid,
                'santri_id' => (string) $b['santri_id'],
                'nomer_induk' => $b['nomer_induk'],
                'nama' => $b['nama'],
                'kelas_id' => (string) $b['kelas_id'],
                'nama_kelas' => $b['nama_kelas'],
                'kel' => $b['kel'],
                'urutan' => (int) $b['urutan'],
                'cells' => $cells,
            ];
        }

        return ['mapel' => $mapel, 'baris' => $baris];
    }

    /** @return array{error?:string}|array */
    private function parsePublishPayload(array $data): array {
        $judul = trim((string) ($data['judul'] ?? ''));
        $catatan = trim((string) ($data['catatan'] ?? ''));
        $tanggalAwal = trim((string) ($data['tanggal_awal'] ?? ''));
        $tanggalAkhir = trim((string) ($data['tanggal_akhir'] ?? ''));
        $hijriAwal = trim((string) ($data['hijri_awal'] ?? '')) ?: null;
        $hijriAkhir = trim((string) ($data['hijri_akhir'] ?? '')) ?: null;
        $tampil = strtolower(trim((string) ($data['tampil'] ?? 'nilai')));
        $publishAtRaw = trim((string) ($data['publish_at'] ?? ''));
        $publishedBy = isset($data['published_by']) && $data['published_by'] !== ''
            ? (int) $data['published_by']
            : null;
        $kelasIds = $this->parseKelasIdsParam($data['kelas_ids'] ?? []);
        $mapel = $data['mapel'] ?? [];
        $baris = $data['baris'] ?? [];

        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'];
        }
        if (count($kelasIds) === 0) {
            return ['error' => 'Minimal satu kelas wajib dipilih'];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAwal) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAkhir)) {
            return ['error' => 'Tanggal harus format YYYY-MM-DD'];
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return ['error' => 'Tanggal awal tidak boleh setelah tanggal akhir'];
        }
        if (!in_array($tampil, self::TAMPIL, true)) {
            return ['error' => 'Tampil tidak valid'];
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
        if (!is_array($mapel) || count($mapel) === 0) {
            return ['error' => 'Kolom mapel wajib (minimal 1)'];
        }
        if (!is_array($baris) || count($baris) === 0) {
            return ['error' => 'Baris santri wajib (minimal 1)'];
        }

        $cleanMapel = [];
        foreach ($mapel as $i => $m) {
            if (!is_array($m)) {
                continue;
            }
            $mid = (int) ($m['id'] ?? $m['mapel_id'] ?? 0);
            if ($mid <= 0) {
                return ['error' => 'mapel id wajib'];
            }
            $cleanMapel[] = [
                'mapel_id' => $mid,
                'fan' => trim((string) ($m['fan'] ?? '')),
                'kitab_nama' => trim((string) ($m['kitab_nama'] ?? $m['kitab'] ?? '')),
                'musonnif' => trim((string) ($m['musonnif'] ?? '')),
                'dari' => trim((string) ($m['dari'] ?? '')),
                'sampai' => trim((string) ($m['sampai'] ?? '')),
                'urutan' => (int) ($m['urutan'] ?? ($i + 1)),
            ];
        }
        if (count($cleanMapel) === 0) {
            return ['error' => 'Kolom mapel kosong'];
        }

        $cleanBaris = [];
        foreach ($baris as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $sid = (int) ($b['santri_id'] ?? 0);
            $kid = (int) ($b['kelas_id'] ?? 0);
            if ($sid <= 0 || $kid <= 0) {
                return ['error' => 'santri_id dan kelas_id wajib pada baris'];
            }
            $cellsIn = $b['cells'] ?? [];
            if (!is_array($cellsIn)) {
                $cellsIn = [];
            }
            $cells = [];
            foreach ($cellsIn as $midKey => $cell) {
                $mid = (int) $midKey;
                if ($mid <= 0) {
                    continue;
                }
                if ($cell === null || !is_array($cell)) {
                    $cells[$mid] = null;
                    continue;
                }
                $nilaiRaw = $cell['nilai'] ?? null;
                $nilai = ($nilaiRaw === null || $nilaiRaw === '') ? null : (float) $nilaiRaw;
                $absen = isset($cell['absen']) && $cell['absen'] !== '' ? strtoupper(substr((string) $cell['absen'], 0, 1)) : null;
                if ($absen !== null && !in_array($absen, ['H', 'S', 'I', 'A'], true)) {
                    $absen = null;
                }
                $tgl = trim((string) ($cell['tanggal'] ?? ''));
                if ($tgl !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tgl)) {
                    $tgl = '';
                }
                $cells[$mid] = [
                    'nilai' => $nilai,
                    'absen' => $absen,
                    'tanggal' => $tgl !== '' ? $tgl : null,
                ];
            }
            $cleanBaris[] = [
                'santri_id' => $sid,
                'nomer_induk' => trim((string) ($b['nomer_induk'] ?? '')) ?: null,
                'nama' => trim((string) ($b['nama'] ?? '')) ?: '—',
                'kelas_id' => $kid,
                'nama_kelas' => trim((string) ($b['nama_kelas'] ?? '')) ?: null,
                'kel' => trim((string) ($b['kel'] ?? '')) ?: null,
                'urutan' => (int) ($b['urutan'] ?? ($i + 1)),
                'cells' => $cells,
            ];
        }
        if (count($cleanBaris) === 0) {
            return ['error' => 'Baris santri kosong'];
        }

        return [
            'judul' => $judul,
            'catatan' => $catatan !== '' ? $catatan : null,
            'kelas_ids' => $kelasIds,
            'tanggal_awal' => $tanggalAwal,
            'tanggal_akhir' => $tanggalAkhir,
            'hijri_awal' => $hijriAwal,
            'hijri_akhir' => $hijriAkhir,
            'tampil' => $tampil,
            'publish_at' => $publishAtRaw,
            'published_by' => $publishedBy,
            'mapel' => $cleanMapel,
            'baris' => $cleanBaris,
        ];
    }

    /** @param int[] $kelasIds */
    private function insertKelas(PDO $db, int $publishId, array $kelasIds): void {
        $stmt = $db->prepare('
            INSERT INTO santri___nilai_rekap_publish_kelas (publish_id, kelas_id)
            VALUES (:publish_id, :kelas_id)
        ');
        foreach ($kelasIds as $kid) {
            $stmt->execute(['publish_id' => $publishId, 'kelas_id' => $kid]);
        }
    }

    /** @param int[] $kelasIds */
    private function insertHari(PDO $db, int $publishId, array $kelasIds, string $awal, string $akhir): void {
        $stmt = $db->prepare('
            INSERT INTO santri___nilai_rekap_publish_hari (publish_id, kelas_id, tanggal)
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

    private function insertMapel(PDO $db, int $publishId, array $mapel): void {
        $stmt = $db->prepare('
            INSERT INTO santri___nilai_rekap_publish_mapel
                (publish_id, mapel_id, fan, kitab_nama, musonnif, dari, sampai, urutan)
            VALUES
                (:publish_id, :mapel_id, :fan, :kitab_nama, :musonnif, :dari, :sampai, :urutan)
        ');
        foreach ($mapel as $m) {
            $stmt->execute([
                'publish_id' => $publishId,
                'mapel_id' => $m['mapel_id'],
                'fan' => $m['fan'],
                'kitab_nama' => $m['kitab_nama'],
                'musonnif' => $m['musonnif'],
                'dari' => $m['dari'],
                'sampai' => $m['sampai'],
                'urutan' => $m['urutan'],
            ]);
        }
    }

    private function insertBarisAndSel(PDO $db, int $publishId, array $baris): void {
        $stmtB = $db->prepare('
            INSERT INTO santri___nilai_rekap_publish_baris
                (publish_id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel, urutan)
            VALUES
                (:publish_id, :santri_id, :nomer_induk, :nama, :kelas_id, :nama_kelas, :kel, :urutan)
        ');
        $stmtS = $db->prepare('
            INSERT INTO santri___nilai_rekap_publish_sel
                (publish_id, baris_id, mapel_id, nilai, absen, tanggal)
            VALUES
                (:publish_id, :baris_id, :mapel_id, :nilai, :absen, :tanggal)
        ');
        foreach ($baris as $b) {
            $stmtB->execute([
                'publish_id' => $publishId,
                'santri_id' => $b['santri_id'],
                'nomer_induk' => $b['nomer_induk'],
                'nama' => $b['nama'],
                'kelas_id' => $b['kelas_id'],
                'nama_kelas' => $b['nama_kelas'],
                'kel' => $b['kel'],
                'urutan' => $b['urutan'],
            ]);
            $barisId = (int) $db->lastInsertId();
            foreach ($b['cells'] as $mid => $cell) {
                if ($cell === null) {
                    continue;
                }
                $stmtS->execute([
                    'publish_id' => $publishId,
                    'baris_id' => $barisId,
                    'mapel_id' => (int) $mid,
                    'nilai' => $cell['nilai'],
                    'absen' => $cell['absen'],
                    'tanggal' => $cell['tanggal'],
                ]);
            }
        }
    }

    /** @param int[] $kelasIds @return string[] */
    private function findOccupiedOverlap(PDO $db, array $kelasIds, string $awal, string $akhir, ?int $excludeId): array {
        if (count($kelasIds) === 0) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($kelasIds), '?'));
        $sql = "
            SELECT DISTINCT tanggal FROM santri___nilai_rekap_publish_hari
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
            'tampil' => $row['tampil'] ?? 'nilai',
            'publish_at' => $publishAt->format('Y-m-d H:i:s'),
            'published_by' => $row['published_by'] !== null ? (string) $row['published_by'] : null,
            'publisher_nama' => $row['publisher_nama'] ?? null,
            'kelas_ids' => array_map(static fn($k) => (string) $k['kelas_id'], $kelas),
            'kelas_labels' => $kelasLabels,
            'kelas_label' => count($kelasLabels) ? implode(', ', $kelasLabels) : '—',
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
            FROM santri___nilai_rekap_publish_kelas pk
            INNER JOIN kelas kl ON kl.id = pk.kelas_id
            WHERE pk.publish_id = :id
            ORDER BY kl.nama_kelas ASC, kl.kel ASC
        ');
        $stmt->execute(['id' => $publishId]);
        return $stmt->fetchAll();
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
