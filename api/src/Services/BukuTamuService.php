<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * Buku tamu mahrom — scan kartu CM, catat kunjungan ke santri terkait.
 */
class BukuTamuService
{
    private PDO $db;
    private MahromService $mahromSvc;
    private CashlessKartuService $kartuSvc;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->mahromSvc = new MahromService($db);
        $this->kartuSvc = new CashlessKartuService($db);
    }

    /**
     * @param array{tanggal?: string, search?: string, page?: int, limit?: int} $params
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int, total_pages: int}
     */
    public function list(array $params = []): array
    {
        $tanggal = trim((string) ($params['tanggal'] ?? ''));
        if ($tanggal === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            $tanggal = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
        }
        $search = trim((string) ($params['search'] ?? ''));
        $page = max(1, (int) ($params['page'] ?? 1));
        $limit = min(max(1, (int) ($params['limit'] ?? 30)), 100);
        $offset = ($page - 1) * $limit;

        $where = ['DATE(bt.waktu_datang) = ?'];
        $bind = [$tanggal];
        if ($search !== '') {
            $where[] = '(m.nama LIKE ? OR m.nim LIKE ? OR m.nik LIKE ? OR EXISTS (
                SELECT 1 FROM buku_tamu___santri bts
                INNER JOIN santri s ON s.id = bts.id_santri
                WHERE bts.buku_tamu_id = bt.id AND (s.nama LIKE ? OR CAST(s.nis AS CHAR) LIKE ?)
            ))';
            $like = '%' . $search . '%';
            array_push($bind, $like, $like, $like, $like, $like);
        }
        $whereSql = implode(' AND ', $where);

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM buku_tamu bt
             INNER JOIN mahrom m ON m.id = bt.id_mahrom
             WHERE {$whereSql}"
        );
        $countStmt->execute($bind);
        $total = (int) $countStmt->fetchColumn();

        $sql = "SELECT bt.id, bt.id_mahrom, bt.id_kartu, bt.waktu_datang, bt.id_petugas,
                       m.nim, m.nama AS mahrom_nama, m.nik AS mahrom_nik, m.gender AS mahrom_gender,
                       p.nama AS petugas_nama
                FROM buku_tamu bt
                INNER JOIN mahrom m ON m.id = bt.id_mahrom
                LEFT JOIN pengurus p ON p.id = bt.id_petugas
                WHERE {$whereSql}
                ORDER BY bt.waktu_datang DESC, bt.id DESC
                LIMIT {$limit} OFFSET {$offset}";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $items = [];
        $ids = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $ids[] = $id;
            $items[] = [
                'id' => $id,
                'id_mahrom' => (int) $row['id_mahrom'],
                'id_kartu' => $row['id_kartu'] !== null ? (int) $row['id_kartu'] : null,
                'waktu_datang' => $row['waktu_datang'],
                'id_petugas' => $row['id_petugas'] !== null ? (int) $row['id_petugas'] : null,
                'petugas_nama' => $row['petugas_nama'],
                'mahrom' => [
                    'nim' => (string) ($row['nim'] ?? ''),
                    'nama' => (string) ($row['mahrom_nama'] ?? ''),
                    'nik' => (string) ($row['mahrom_nik'] ?? ''),
                    'gender' => $row['mahrom_gender'],
                ],
                'santri_didatangi' => [],
            ];
        }

        if ($ids !== []) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $sStmt = $this->db->prepare(
                "SELECT bts.buku_tamu_id, bts.hubungan, s.id AS santri_id, s.nis, s.nama AS santri_nama
                 FROM buku_tamu___santri bts
                 INNER JOIN santri s ON s.id = bts.id_santri
                 WHERE bts.buku_tamu_id IN ({$ph})
                 ORDER BY s.nama ASC"
            );
            $sStmt->execute($ids);
            $grouped = [];
            while ($sr = $sStmt->fetch(PDO::FETCH_ASSOC)) {
                $bid = (int) $sr['buku_tamu_id'];
                $grouped[$bid][] = [
                    'santri_id' => (int) $sr['santri_id'],
                    'nis' => $sr['nis'] !== null ? (string) $sr['nis'] : '',
                    'santri_nama' => (string) ($sr['santri_nama'] ?? ''),
                    'hubungan' => (string) ($sr['hubungan'] ?? ''),
                ];
            }
            foreach ($items as &$item) {
                $item['santri_didatangi'] = $grouped[$item['id']] ?? [];
            }
            unset($item);
        }

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => $total > 0 ? (int) ceil($total / $limit) : 0,
        ];
    }

    /**
     * Scan QR kartu CM → biodata mahrom + KTP + catat kunjungan.
     *
     * @param list<int>|null $santriIds kosong = semua santri terhubung
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function scanAndRecord(string $token, ?array $santriIds, ?int $petugasId): array
    {
        $token = trim($token);
        if ($token === '') {
            return ['success' => false, 'message' => 'Token QR kosong'];
        }

        $tokenResult = $this->kartuSvc->resolveMahromTokenForBukuTamu($token);
        if (!$tokenResult['ok']) {
            return [
                'success' => false,
                'code' => $tokenResult['code'],
                'message' => $tokenResult['message'],
            ];
        }

        $resolved = $tokenResult['card'];
        $mahromId = (int) ($resolved['mahrom_id'] ?? 0);
        if ($mahromId <= 0) {
            return ['success' => false, 'message' => 'Kartu tidak terhubung ke data mahrom'];
        }

        $mahrom = $this->mahromSvc->getById($mahromId, true);
        if ($mahrom === null || empty($mahrom['aktif'])) {
            return ['success' => false, 'message' => 'Data mahrom tidak ditemukan atau tidak aktif'];
        }

        $relasi = is_array($mahrom['relasi_santri'] ?? null) ? $mahrom['relasi_santri'] : [];
        if ($relasi === []) {
            return ['success' => false, 'message' => 'Mahrom belum ditautkan ke santri manapun'];
        }

        $allowedIds = array_map(static fn (array $r): int => (int) ($r['santri_id'] ?? 0), $relasi);
        $allowedIds = array_values(array_filter($allowedIds, static fn (int $id): bool => $id > 0));

        $selectedIds = $this->normalizeSantriSelection($santriIds, $allowedIds);
        if ($selectedIds === []) {
            return ['success' => false, 'message' => 'Pilih minimal satu santri yang didatangi'];
        }

        $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
        $kartuId = (int) ($resolved['kartu_id'] ?? 0);

        try {
            $this->db->beginTransaction();
            $ins = $this->db->prepare(
                'INSERT INTO buku_tamu (id_mahrom, id_kartu, waktu_datang, id_petugas) VALUES (?, ?, ?, ?)'
            );
            $ins->execute([
                $mahromId,
                $kartuId > 0 ? $kartuId : null,
                $waktu,
                $petugasId !== null && $petugasId > 0 ? $petugasId : null,
            ]);
            $entryId = (int) $this->db->lastInsertId();
            $this->syncEntrySantri($entryId, $selectedIds, $relasi);
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('BukuTamuService::scanAndRecord ' . $e->getMessage());

            return ['success' => false, 'message' => 'Gagal mencatat buku tamu'];
        }

        $entry = $this->getEntryById($entryId);

        return [
            'success' => true,
            'message' => 'Kunjungan tercatat',
            'data' => [
                'entry' => $entry,
                'mahrom' => $mahrom,
                'ktp_berkas' => $this->fetchKtpBerkas($mahromId),
                'santri_options' => $relasi,
                'selected_santri_ids' => $selectedIds,
            ],
        ];
    }

    /**
     * @param list<int> $santriIds
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function updateEntrySantri(int $entryId, array $santriIds): array
    {
        if ($entryId <= 0) {
            return ['success' => false, 'message' => 'ID kunjungan tidak valid'];
        }
        $entry = $this->getEntryById($entryId);
        if ($entry === null) {
            return ['success' => false, 'message' => 'Kunjungan tidak ditemukan'];
        }
        $mahromId = (int) ($entry['id_mahrom'] ?? 0);
        $relasi = $this->mahromSvc->listSantriByMahrom($mahromId);
        if ($relasi === []) {
            return ['success' => false, 'message' => 'Tidak ada santri terhubung'];
        }
        $allowedIds = array_map(static fn (array $r): int => (int) ($r['santri_id'] ?? 0), $relasi);
        $selectedIds = $this->normalizeSantriSelection($santriIds, $allowedIds);
        if ($selectedIds === []) {
            return ['success' => false, 'message' => 'Pilih minimal satu santri'];
        }

        try {
            $this->db->beginTransaction();
            $this->syncEntrySantri($entryId, $selectedIds, $relasi);
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('BukuTamuService::updateEntrySantri ' . $e->getMessage());

            return ['success' => false, 'message' => 'Gagal memperbarui santri kunjungan'];
        }

        return [
            'success' => true,
            'message' => 'Santri kunjungan diperbarui',
            'data' => ['entry' => $this->getEntryById($entryId)],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function getEntryById(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT bt.id, bt.id_mahrom, bt.id_kartu, bt.waktu_datang, bt.id_petugas,
                    m.nim, m.nama AS mahrom_nama, m.nik AS mahrom_nik
             FROM buku_tamu bt
             INNER JOIN mahrom m ON m.id = bt.id_mahrom
             WHERE bt.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        $sStmt = $this->db->prepare(
            'SELECT bts.hubungan, s.id AS santri_id, s.nis, s.nama AS santri_nama
             FROM buku_tamu___santri bts
             INNER JOIN santri s ON s.id = bts.id_santri
             WHERE bts.buku_tamu_id = ?
             ORDER BY s.nama ASC'
        );
        $sStmt->execute([$id]);
        $santri = [];
        while ($sr = $sStmt->fetch(PDO::FETCH_ASSOC)) {
            $santri[] = [
                'santri_id' => (int) $sr['santri_id'],
                'nis' => $sr['nis'] !== null ? (string) $sr['nis'] : '',
                'santri_nama' => (string) ($sr['santri_nama'] ?? ''),
                'hubungan' => (string) ($sr['hubungan'] ?? ''),
            ];
        }

        return [
            'id' => (int) $row['id'],
            'id_mahrom' => (int) $row['id_mahrom'],
            'id_kartu' => $row['id_kartu'] !== null ? (int) $row['id_kartu'] : null,
            'waktu_datang' => $row['waktu_datang'],
            'id_petugas' => $row['id_petugas'] !== null ? (int) $row['id_petugas'] : null,
            'mahrom' => [
                'nim' => (string) ($row['nim'] ?? ''),
                'nama' => (string) ($row['mahrom_nama'] ?? ''),
                'nik' => (string) ($row['mahrom_nik'] ?? ''),
            ],
            'santri_didatangi' => $santri,
        ];
    }

    /**
     * @param list<int>|null $requested
     * @param list<int> $allowed
     * @return list<int>
     */
    private function normalizeSantriSelection(?array $requested, array $allowed): array
    {
        $allowed = array_values(array_unique(array_filter($allowed, static fn (int $id): bool => $id > 0)));
        if ($allowed === []) {
            return [];
        }
        if ($requested === null || $requested === []) {
            return $allowed;
        }
        $set = [];
        foreach ($requested as $raw) {
            $id = (int) $raw;
            if ($id > 0 && in_array($id, $allowed, true)) {
                $set[$id] = $id;
            }
        }

        return array_values($set);
    }

    /**
     * @param list<int> $selectedIds
     * @param list<array<string, mixed>> $relasi
     */
    private function syncEntrySantri(int $entryId, array $selectedIds, array $relasi): void
    {
        $hubMap = [];
        foreach ($relasi as $r) {
            $sid = (int) ($r['santri_id'] ?? 0);
            if ($sid > 0) {
                $hubMap[$sid] = (string) ($r['hubungan'] ?? '');
            }
        }

        $del = $this->db->prepare('DELETE FROM buku_tamu___santri WHERE buku_tamu_id = ?');
        $del->execute([$entryId]);

        $ins = $this->db->prepare(
            'INSERT INTO buku_tamu___santri (buku_tamu_id, id_santri, hubungan) VALUES (?, ?, ?)'
        );
        foreach ($selectedIds as $sid) {
            $ins->execute([$entryId, $sid, $hubMap[$sid] ?? null]);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchKtpBerkas(int $mahromId): ?array
    {
        if ($mahromId <= 0 || !$this->hasMahromBerkasTable()) {
            return null;
        }
        $stmt = $this->db->prepare(
            "SELECT id, jenis_berkas, nama_file, path_file, tipe_file, ukuran_file
             FROM mahrom___berkas
             WHERE id_mahrom = ? AND jenis_berkas = 'KTP' AND status_tidak_ada = 0
             ORDER BY tanggal_dibuat DESC, id DESC
             LIMIT 1"
        );
        $stmt->execute([$mahromId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'jenis_berkas' => (string) $row['jenis_berkas'],
            'nama_file' => (string) $row['nama_file'],
            'path_file' => (string) $row['path_file'],
            'tipe_file' => $row['tipe_file'],
            'ukuran_file' => $row['ukuran_file'] !== null ? (int) $row['ukuran_file'] : null,
        ];
    }

    private function hasMahromBerkasTable(): bool
    {
        try {
            $stmt = $this->db->query(
                "SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mahrom___berkas' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }
}
