<?php

namespace App\Controllers;

use App\Config\Database;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RekapPublishController {
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
        $sql = "SELECT DISTINCT tanggal FROM santri___rekap_publish_hari WHERE kelas_id IN ($placeholders)";
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
            SELECT p.*, pg.nama AS publisher_nama
            FROM santri___rekap_publish p
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
            SELECT p.*, pg.nama AS publisher_nama
            FROM santri___rekap_publish p
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
                'baris_nilai' => [],
                'baris_absen' => [],
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
            'baris_nilai' => $payload['baris_nilai'],
            'baris_absen' => $payload['baris_absen'],
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

        $unionDates = $this->unionDateRanges(
            $parsed['nilai_tanggal_awal'],
            $parsed['nilai_tanggal_akhir'],
            $parsed['absen_tanggal_awal'],
            $parsed['absen_tanggal_akhir']
        );
        $overlap = $this->findOccupiedOverlap($db, $parsed['kelas_ids'], $unionDates, null);
        if ($overlap) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Rentang tanggal bentrok dengan rekap yang sudah dipublish: '
                    . implode(', ', array_slice($overlap, 0, 5))
                    . (count($overlap) > 5 ? '…' : ''),
                'occupied' => $overlap,
            ], 409);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare('
                INSERT INTO santri___rekap_publish
                    (judul, catatan,
                     nilai_tanggal_awal, nilai_tanggal_akhir, nilai_hijri_awal, nilai_hijri_akhir,
                     absen_tanggal_awal, absen_tanggal_akhir, absen_hijri_awal, absen_hijri_akhir,
                     tampil_nilai, publish_at, published_by)
                VALUES
                    (:judul, :catatan,
                     :nilai_tanggal_awal, :nilai_tanggal_akhir, :nilai_hijri_awal, :nilai_hijri_akhir,
                     :absen_tanggal_awal, :absen_tanggal_akhir, :absen_hijri_awal, :absen_hijri_akhir,
                     :tampil_nilai, :publish_at, :published_by)
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'nilai_tanggal_awal' => $parsed['nilai_tanggal_awal'],
                'nilai_tanggal_akhir' => $parsed['nilai_tanggal_akhir'],
                'nilai_hijri_awal' => $parsed['nilai_hijri_awal'],
                'nilai_hijri_akhir' => $parsed['nilai_hijri_akhir'],
                'absen_tanggal_awal' => $parsed['absen_tanggal_awal'],
                'absen_tanggal_akhir' => $parsed['absen_tanggal_akhir'],
                'absen_hijri_awal' => $parsed['absen_hijri_awal'],
                'absen_hijri_akhir' => $parsed['absen_hijri_akhir'],
                'tampil_nilai' => $parsed['tampil_nilai'],
                'publish_at' => $parsed['publish_at'],
                'published_by' => $parsed['published_by'],
            ]);
            $publishId = (int) $db->lastInsertId();
            $this->insertKelas($db, $publishId, $parsed['kelas_ids']);
            $this->insertHari($db, $publishId, $parsed['kelas_ids'], $unionDates);
            $this->insertMapel($db, $publishId, $parsed['mapel']);
            $this->insertNilaiBarisAndSel($db, $publishId, $parsed['baris_nilai']);
            $this->insertAbsenBaris($db, $publishId, $parsed['baris_absen']);
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
            'message' => 'Rekap nilai & absen berhasil dipublish',
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

        $stmt = $db->prepare('SELECT id FROM santri___rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }

        $parsed = $this->parsePublishPayload($data);
        if (isset($parsed['error'])) {
            return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['error']], 400);
        }

        $unionDates = $this->unionDateRanges(
            $parsed['nilai_tanggal_awal'],
            $parsed['nilai_tanggal_akhir'],
            $parsed['absen_tanggal_awal'],
            $parsed['absen_tanggal_akhir']
        );
        $overlap = $this->findOccupiedOverlap($db, $parsed['kelas_ids'], $unionDates, $id);
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
                UPDATE santri___rekap_publish SET
                    judul = :judul,
                    catatan = :catatan,
                    nilai_tanggal_awal = :nilai_tanggal_awal,
                    nilai_tanggal_akhir = :nilai_tanggal_akhir,
                    nilai_hijri_awal = :nilai_hijri_awal,
                    nilai_hijri_akhir = :nilai_hijri_akhir,
                    absen_tanggal_awal = :absen_tanggal_awal,
                    absen_tanggal_akhir = :absen_tanggal_akhir,
                    absen_hijri_awal = :absen_hijri_awal,
                    absen_hijri_akhir = :absen_hijri_akhir,
                    tampil_nilai = :tampil_nilai,
                    publish_at = :publish_at
                WHERE id = :id
            ');
            $stmt->execute([
                'judul' => $parsed['judul'],
                'catatan' => $parsed['catatan'],
                'nilai_tanggal_awal' => $parsed['nilai_tanggal_awal'],
                'nilai_tanggal_akhir' => $parsed['nilai_tanggal_akhir'],
                'nilai_hijri_awal' => $parsed['nilai_hijri_awal'],
                'nilai_hijri_akhir' => $parsed['nilai_hijri_akhir'],
                'absen_tanggal_awal' => $parsed['absen_tanggal_awal'],
                'absen_tanggal_akhir' => $parsed['absen_tanggal_akhir'],
                'absen_hijri_awal' => $parsed['absen_hijri_awal'],
                'absen_hijri_akhir' => $parsed['absen_hijri_akhir'],
                'tampil_nilai' => $parsed['tampil_nilai'],
                'publish_at' => $parsed['publish_at'],
                'id' => $id,
            ]);

            $db->prepare('DELETE FROM santri___rekap_publish_nilai_sel WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___rekap_publish_nilai_baris WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___rekap_publish_nilai_mapel WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___rekap_publish_absen_baris WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___rekap_publish_hari WHERE publish_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM santri___rekap_publish_kelas WHERE publish_id = :id')->execute(['id' => $id]);

            $this->insertKelas($db, $id, $parsed['kelas_ids']);
            $this->insertHari($db, $id, $parsed['kelas_ids'], $unionDates);
            $this->insertMapel($db, $id, $parsed['mapel']);
            $this->insertNilaiBarisAndSel($db, $id, $parsed['baris_nilai']);
            $this->insertAbsenBaris($db, $id, $parsed['baris_absen']);
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
        $stmt = $db->prepare('DELETE FROM santri___rekap_publish WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Rekap publish tidak ditemukan'], 404);
        }
        return $this->jsonResponse($response, ['success' => true, 'message' => 'Rekap publish dihapus']);
    }

    /** @return array{mapel:array,baris_nilai:array,baris_absen:array} */
    private function loadDetailPayload(PDO $db, int $publishId): array {
        $stmtM = $db->prepare('
            SELECT mapel_id AS id, fan, kitab_nama, musonnif, dari, sampai, urutan
            FROM santri___rekap_publish_nilai_mapel
            WHERE publish_id = :id
            ORDER BY urutan ASC, fan ASC
        ');
        $stmtM->execute(['id' => $publishId]);
        $mapel = $stmtM->fetchAll();
        foreach ($mapel as &$m) {
            $m['id'] = (string) $m['id'];
            $m['kitab_id'] = '';
            $m['urutan'] = (int) $m['urutan'];
            $m['kelas_ids'] = [];
        }
        unset($m);

        // Lengkapi kelas_ids per mapel (untuk filter fan per kelas di hasil)
        if (count($mapel) > 0) {
            $mapelIds = array_map(static fn($m) => (int) $m['id'], $mapel);
            $kelasRows = $this->loadKelasForPublish($db, $publishId);
            $kelasIds = array_map(static fn($k) => (int) $k['kelas_id'], $kelasRows);
            if (count($kelasIds) > 0) {
                $phM = implode(',', array_fill(0, count($mapelIds), '?'));
                $phK = implode(',', array_fill(0, count($kelasIds), '?'));
                $stmtKm = $db->prepare("
                    SELECT mapel_id, kelas_id
                    FROM kelas___mapel
                    WHERE mapel_id IN ($phM) AND kelas_id IN ($phK)
                ");
                $stmtKm->execute(array_merge($mapelIds, $kelasIds));
                $byMapel = [];
                foreach ($stmtKm->fetchAll() as $row) {
                    $mid = (string) $row['mapel_id'];
                    $byMapel[$mid][] = (string) $row['kelas_id'];
                }
                foreach ($mapel as &$m) {
                    $m['kelas_ids'] = $byMapel[$m['id']] ?? [];
                }
                unset($m);
            }
        }

        $stmtB = $db->prepare('
            SELECT id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel, urutan
            FROM santri___rekap_publish_nilai_baris
            WHERE publish_id = :id
            ORDER BY urutan ASC, nama ASC
        ');
        $stmtB->execute(['id' => $publishId]);
        $barisRaw = $stmtB->fetchAll();

        $stmtS = $db->prepare('
            SELECT baris_id, mapel_id, nilai, absen, tanggal
            FROM santri___rekap_publish_nilai_sel
            WHERE publish_id = :id
        ');
        $stmtS->execute(['id' => $publishId]);
        $selMap = [];
        foreach ($stmtS->fetchAll() as $s) {
            $bid = (string) $s['baris_id'];
            $mid = (string) $s['mapel_id'];
            $selMap[$bid][$mid] = [
                'nilai' => $s['nilai'] === null ? null : (float) $s['nilai'],
                'absen' => $s['absen'],
                'tanggal' => $s['tanggal'],
            ];
        }

        $barisNilai = [];
        foreach ($barisRaw as $b) {
            $bid = (string) $b['id'];
            $cells = [];
            foreach ($mapel as $m) {
                $cells[$m['id']] = $selMap[$bid][$m['id']] ?? null;
            }
            $barisNilai[] = [
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

        $stmtA = $db->prepare('
            SELECT id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel,
                   h, s, i, a, jam1_h, jam1_s, jam1_i, jam1_a, jam2_h, jam2_s, jam2_i, jam2_a, urutan
            FROM santri___rekap_publish_absen_baris
            WHERE publish_id = :id
            ORDER BY urutan ASC, nama ASC
        ');
        $stmtA->execute(['id' => $publishId]);
        $barisAbsen = $stmtA->fetchAll();
        foreach ($barisAbsen as &$a) {
            $a['santri_id'] = (string) $a['santri_id'];
            $a['kelas_id'] = (string) $a['kelas_id'];
            foreach (['h', 's', 'i', 'a', 'jam1_h', 'jam1_s', 'jam1_i', 'jam1_a', 'jam2_h', 'jam2_s', 'jam2_i', 'jam2_a', 'urutan'] as $k) {
                $a[$k] = (int) $a[$k];
            }
        }
        unset($a);

        return ['mapel' => $mapel, 'baris_nilai' => $barisNilai, 'baris_absen' => $barisAbsen];
    }

    /** @return array{error?:string}|array */
    private function parsePublishPayload(array $data): array {
        $judul = trim((string) ($data['judul'] ?? ''));
        $catatan = trim((string) ($data['catatan'] ?? ''));
        $tampil = strtolower(trim((string) ($data['tampil_nilai'] ?? $data['tampil'] ?? 'nilai')));
        $publishAtRaw = trim((string) ($data['publish_at'] ?? ''));
        $publishedBy = isset($data['published_by']) && $data['published_by'] !== ''
            ? (int) $data['published_by']
            : null;
        $kelasIds = $this->parseKelasIdsParam($data['kelas_ids'] ?? []);

        $nilaiAwal = trim((string) ($data['nilai_tanggal_awal'] ?? ''));
        $nilaiAkhir = trim((string) ($data['nilai_tanggal_akhir'] ?? ''));
        $nilaiHijriAwal = trim((string) ($data['nilai_hijri_awal'] ?? '')) ?: null;
        $nilaiHijriAkhir = trim((string) ($data['nilai_hijri_akhir'] ?? '')) ?: null;
        $absenAwal = trim((string) ($data['absen_tanggal_awal'] ?? ''));
        $absenAkhir = trim((string) ($data['absen_tanggal_akhir'] ?? ''));
        $absenHijriAwal = trim((string) ($data['absen_hijri_awal'] ?? '')) ?: null;
        $absenHijriAkhir = trim((string) ($data['absen_hijri_akhir'] ?? '')) ?: null;

        $mapel = $data['mapel'] ?? [];
        $barisNilai = $data['baris_nilai'] ?? [];
        $barisAbsen = $data['baris_absen'] ?? [];

        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'];
        }
        if (count($kelasIds) === 0) {
            return ['error' => 'Minimal satu kelas wajib dipilih'];
        }
        foreach ([['nilai', $nilaiAwal, $nilaiAkhir], ['absen', $absenAwal, $absenAkhir]] as [$label, $a, $b]) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $a) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $b)) {
                return ['error' => "Tanggal $label harus format YYYY-MM-DD"];
            }
            if ($a > $b) {
                return ['error' => "Tanggal awal $label tidak boleh setelah tanggal akhir"];
            }
        }
        if (!in_array($tampil, self::TAMPIL, true)) {
            return ['error' => 'tampil_nilai tidak valid'];
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
            return ['error' => 'Kolom mapel wajib'];
        }
        if (!is_array($barisNilai) || count($barisNilai) === 0) {
            return ['error' => 'Baris nilai wajib'];
        }
        if (!is_array($barisAbsen) || count($barisAbsen) === 0) {
            return ['error' => 'Baris absen wajib'];
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

        $cleanNilai = [];
        foreach ($barisNilai as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $sid = (int) ($b['santri_id'] ?? 0);
            $kid = (int) ($b['kelas_id'] ?? 0);
            if ($sid <= 0 || $kid <= 0) {
                return ['error' => 'santri_id dan kelas_id wajib pada baris nilai'];
            }
            $cellsIn = is_array($b['cells'] ?? null) ? $b['cells'] : [];
            $cells = [];
            foreach ($cellsIn as $midKey => $cell) {
                $mid = (int) $midKey;
                if ($mid <= 0 || $cell === null || !is_array($cell)) {
                    continue;
                }
                $nilaiRaw = $cell['nilai'] ?? null;
                $nilai = ($nilaiRaw === null || $nilaiRaw === '') ? null : (float) $nilaiRaw;
                $absen = isset($cell['absen']) && $cell['absen'] !== ''
                    ? strtoupper(substr((string) $cell['absen'], 0, 1))
                    : null;
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
            $cleanNilai[] = [
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
        if (count($cleanNilai) === 0) {
            return ['error' => 'Baris nilai kosong'];
        }

        $cleanAbsen = [];
        foreach ($barisAbsen as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $sid = (int) ($b['santri_id'] ?? 0);
            $kid = (int) ($b['kelas_id'] ?? 0);
            if ($sid <= 0 || $kid <= 0) {
                return ['error' => 'santri_id dan kelas_id wajib pada baris absen'];
            }
            $cleanAbsen[] = [
                'santri_id' => $sid,
                'nomer_induk' => trim((string) ($b['nomer_induk'] ?? '')) ?: null,
                'nama' => trim((string) ($b['nama'] ?? '')) ?: '—',
                'kelas_id' => $kid,
                'nama_kelas' => trim((string) ($b['nama_kelas'] ?? '')) ?: null,
                'kel' => trim((string) ($b['kel'] ?? '')) ?: null,
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
        if (count($cleanAbsen) === 0) {
            return ['error' => 'Baris absen kosong'];
        }

        return [
            'judul' => $judul,
            'catatan' => $catatan !== '' ? $catatan : null,
            'kelas_ids' => $kelasIds,
            'nilai_tanggal_awal' => $nilaiAwal,
            'nilai_tanggal_akhir' => $nilaiAkhir,
            'nilai_hijri_awal' => $nilaiHijriAwal,
            'nilai_hijri_akhir' => $nilaiHijriAkhir,
            'absen_tanggal_awal' => $absenAwal,
            'absen_tanggal_akhir' => $absenAkhir,
            'absen_hijri_awal' => $absenHijriAwal,
            'absen_hijri_akhir' => $absenHijriAkhir,
            'tampil_nilai' => $tampil,
            'publish_at' => $publishAtRaw,
            'published_by' => $publishedBy,
            'mapel' => $cleanMapel,
            'baris_nilai' => $cleanNilai,
            'baris_absen' => $cleanAbsen,
        ];
    }

    /** @param int[] $kelasIds */
    private function insertKelas(PDO $db, int $publishId, array $kelasIds): void {
        $stmt = $db->prepare('
            INSERT INTO santri___rekap_publish_kelas (publish_id, kelas_id)
            VALUES (:publish_id, :kelas_id)
        ');
        foreach ($kelasIds as $kid) {
            $stmt->execute(['publish_id' => $publishId, 'kelas_id' => $kid]);
        }
    }

    /** @param int[] $kelasIds @param string[] $dates */
    private function insertHari(PDO $db, int $publishId, array $kelasIds, array $dates): void {
        $stmt = $db->prepare('
            INSERT INTO santri___rekap_publish_hari (publish_id, kelas_id, tanggal)
            VALUES (:publish_id, :kelas_id, :tanggal)
        ');
        foreach ($kelasIds as $kid) {
            foreach ($dates as $tgl) {
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
            INSERT INTO santri___rekap_publish_nilai_mapel
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

    private function insertNilaiBarisAndSel(PDO $db, int $publishId, array $baris): void {
        $stmtB = $db->prepare('
            INSERT INTO santri___rekap_publish_nilai_baris
                (publish_id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel, urutan)
            VALUES
                (:publish_id, :santri_id, :nomer_induk, :nama, :kelas_id, :nama_kelas, :kel, :urutan)
        ');
        $stmtS = $db->prepare('
            INSERT INTO santri___rekap_publish_nilai_sel
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

    private function insertAbsenBaris(PDO $db, int $publishId, array $baris): void {
        $stmt = $db->prepare('
            INSERT INTO santri___rekap_publish_absen_baris
                (publish_id, santri_id, nomer_induk, nama, kelas_id, nama_kelas, kel,
                 h, s, i, a, jam1_h, jam1_s, jam1_i, jam1_a, jam2_h, jam2_s, jam2_i, jam2_a, urutan)
            VALUES
                (:publish_id, :santri_id, :nomer_induk, :nama, :kelas_id, :nama_kelas, :kel,
                 :h, :s, :i, :a, :jam1_h, :jam1_s, :jam1_i, :jam1_a, :jam2_h, :jam2_s, :jam2_i, :jam2_a, :urutan)
        ');
        foreach ($baris as $b) {
            $stmt->execute([
                'publish_id' => $publishId,
                'santri_id' => $b['santri_id'],
                'nomer_induk' => $b['nomer_induk'],
                'nama' => $b['nama'],
                'kelas_id' => $b['kelas_id'],
                'nama_kelas' => $b['nama_kelas'],
                'kel' => $b['kel'],
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

    /** @param int[] $kelasIds @param string[] $dates @return string[] */
    private function findOccupiedOverlap(PDO $db, array $kelasIds, array $dates, ?int $excludeId): array {
        if (count($kelasIds) === 0 || count($dates) === 0) {
            return [];
        }
        $phKelas = implode(',', array_fill(0, count($kelasIds), '?'));
        $phDates = implode(',', array_fill(0, count($dates), '?'));
        $sql = "
            SELECT DISTINCT tanggal FROM santri___rekap_publish_hari
            WHERE kelas_id IN ($phKelas) AND tanggal IN ($phDates)
        ";
        $bind = array_merge($kelasIds, $dates);
        if ($excludeId !== null && $excludeId > 0) {
            $sql .= ' AND publish_id <> ?';
            $bind[] = $excludeId;
        }
        $sql .= ' ORDER BY tanggal ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        return array_map(static fn($r) => (string) $r['tanggal'], $stmt->fetchAll());
    }

    /** @return string[] */
    private function unionDateRanges(string $a1, string $a2, string $b1, string $b2): array {
        $set = [];
        foreach (array_merge($this->dateRange($a1, $a2), $this->dateRange($b1, $b2)) as $d) {
            $set[$d] = $d;
        }
        $out = array_values($set);
        sort($out);
        return $out;
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
            'nilai_tanggal_awal' => $row['nilai_tanggal_awal'],
            'nilai_tanggal_akhir' => $row['nilai_tanggal_akhir'],
            'nilai_hijri_awal' => $row['nilai_hijri_awal'],
            'nilai_hijri_akhir' => $row['nilai_hijri_akhir'],
            'absen_tanggal_awal' => $row['absen_tanggal_awal'],
            'absen_tanggal_akhir' => $row['absen_tanggal_akhir'],
            'absen_hijri_awal' => $row['absen_hijri_awal'],
            'absen_hijri_akhir' => $row['absen_hijri_akhir'],
            'tampil_nilai' => $row['tampil_nilai'] ?? 'nilai',
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
            FROM santri___rekap_publish_kelas pk
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
