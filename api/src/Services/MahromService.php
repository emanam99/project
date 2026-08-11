<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\MahromHelper;
use App\Helpers\NikHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\TahunAjaranActiveHelper;
use App\Helpers\TextSanitizer;
use PDO;
use PDOException;

/**
 * Master mahrom & relasi ke santri (santri___mahrom).
 */
class MahromService
{
    public const HUBUNGAN_OPTIONS = [
        'Ayah', 'Ibu', 'Wali', 'Paman', 'Bibi', 'Kakek', 'Nenek', 'Kakak', 'Saudara', 'Lainnya',
    ];

    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    /**
     * @param array{search?: string, page?: int, limit?: int, aktif?: int|null} $params
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int, total_pages: int}
     */
    public function list(array $params = []): array
    {
        $search = trim((string) ($params['search'] ?? ''));
        $page = max(1, (int) ($params['page'] ?? 1));
        $limit = min(max(1, (int) ($params['limit'] ?? 20)), 100);
        $offset = ($page - 1) * $limit;
        $aktif = array_key_exists('aktif', $params) ? $params['aktif'] : 1;

        $where = ['1=1'];
        $bind = [];
        if ($aktif !== null && $aktif !== '') {
            $where[] = 'm.aktif = ?';
            $bind[] = (int) $aktif === 1 ? 1 : 0;
        }
        if ($search !== '') {
            $where[] = '(m.nama LIKE ? OR m.nim LIKE ? OR m.nik LIKE ? OR m.no_wa LIKE ?)';
            $like = '%' . $search . '%';
            array_push($bind, $like, $like, $like, $like);
        }

        $whereSql = implode(' AND ', $where);
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM mahrom m WHERE {$whereSql}");
        $countStmt->execute($bind);
        $total = (int) $countStmt->fetchColumn();

        $sql = "SELECT m.*,
                (SELECT COUNT(*) FROM santri___mahrom sm WHERE sm.id_mahrom = m.id) AS jumlah_santri
                FROM mahrom m
                WHERE {$whereSql}
                ORDER BY m.nama ASC
                LIMIT {$limit} OFFSET {$offset}";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $items = [];
        $mahromIds = [];
        foreach ($rows as $row) {
            $items[] = $this->formatMahromRow($row, true);
            $mahromIds[] = (int) $row['id'];
        }

        if ($mahromIds !== []) {
            try {
                $kartuSvc = new CashlessKartuService($this->db);
                $summaries = $kartuSvc->cmSummaryByMahromIds(array_values(array_unique($mahromIds)));
                foreach ($items as &$item) {
                    $mid = (int) ($item['id'] ?? 0);
                    $item['kartu_cm'] = $summaries[$mid] ?? ['aktif' => 0, 'dicetak' => 0, 'per_santri' => []];
                }
                unset($item);
            } catch (\Throwable $e) {
                // tabel kartu belum ada
            }
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
     * @return array<string, mixed>|null
     */
    public function getById(int $id, bool $withRelasi = true): ?array
    {
        if ($id <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT * FROM mahrom WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $out = $this->formatMahromRow($row, false);
        if ($withRelasi) {
            $out['relasi_santri'] = $this->listSantriByMahrom($id);
        }
        return $out;
    }

    /**
     * Cari mahrom by NIK (normalized).
     *
     * @return array<string, mixed>|null
     */
    public function getByNik(string $nik, bool $withRelasi = true): ?array
    {
        $nikCheck = NikHelper::validate($nik);
        if (!$nikCheck['valid']) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id FROM mahrom WHERE nik = ? LIMIT 1');
        $stmt->execute([$nikCheck['normalized']]);
        $id = (int) $stmt->fetchColumn();
        if ($id <= 0) {
            return null;
        }
        return $this->getById($id, $withRelasi);
    }

    /**
     * @return array{success: bool, exists: bool, message?: string, data?: array<string, mixed>}
     */
    public function checkNik(string $nik, ?int $excludeMahromId = null): array
    {
        $nikCheck = NikHelper::validate($nik);
        if (!$nikCheck['valid']) {
            return ['success' => false, 'exists' => false, 'message' => NikHelper::INVALID_MESSAGE];
        }

        $sql = 'SELECT id FROM mahrom WHERE nik = ?';
        $params = [$nikCheck['normalized']];
        if ($excludeMahromId !== null && $excludeMahromId > 0) {
            $sql .= ' AND id != ?';
            $params[] = $excludeMahromId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $id = (int) $stmt->fetchColumn();
        if ($id <= 0) {
            return ['success' => true, 'exists' => false];
        }

        $detail = $this->getById($id, true);
        return [
            'success' => true,
            'exists' => true,
            'data' => $detail,
        ];
    }

    /**
     * Tautkan santri ke mahrom yang sudah ada (tanpa membuat record mahrom baru).
     *
     * @param list<array<string, mixed>> $relasiList
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function linkSantri(int $mahromId, array $relasiList): array
    {
        if ($mahromId <= 0) {
            return ['success' => false, 'message' => 'ID mahrom tidak valid'];
        }
        if ($this->getById($mahromId, false) === null) {
            return ['success' => false, 'message' => 'Mahrom tidak ditemukan'];
        }
        if ($relasiList === []) {
            return ['success' => false, 'message' => 'Tautkan minimal satu santri'];
        }

        try {
            $this->db->beginTransaction();
            $relasiErrors = $this->applyRelasiPayload($mahromId, $relasiList);
            if ($relasiErrors !== null) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $relasiErrors];
            }
            $this->db->commit();
            return ['success' => true, 'data' => $this->getById($mahromId)];
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('MahromService::linkSantri ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal menautkan santri ke mahrom'];
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function create(array $data): array
    {
        $parsed = $this->parseMahromPayload($data);
        if (!$parsed['success']) {
            return $parsed;
        }
        $fields = $parsed['fields'];

        if ($this->nikExists($fields['nik'], null)) {
            $existing = $this->getByNik($fields['nik'], true);
            return [
                'success' => false,
                'code' => 'NIK_EXISTS',
                'message' => 'NIK sudah terdaftar pada mahrom lain. Tautkan santri saja ke mahrom yang ada.',
                'existing' => $existing,
            ];
        }

        if ($fields['gender'] === null || $fields['gender'] === '') {
            return ['success' => false, 'message' => 'Jenis kelamin wajib diisi (untuk pembuatan NIM)'];
        }

        $taRow = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($this->db, date('Y-m-d'));
        $tahunAjaran = $taRow['tahun_ajaran'] ?? SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
        if (!$tahunAjaran) {
            return ['success' => false, 'message' => 'Tahun ajaran hijriyah aktif tidak ditemukan'];
        }

        try {
            $this->db->beginTransaction();
            $prefix = MahromHelper::parsePrefixFromGenderAndTahun($fields['gender'], $tahunAjaran);
            $fields['nim'] = MahromHelper::generateNextNim($this->db, $prefix);
            $stmt = $this->db->prepare(
                'INSERT INTO mahrom (
                    nim, nama, nik, tempat_lahir, tanggal_lahir, gender,
                    no_telpon, no_wa, email, pekerjaan, pendidikan,
                    dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos, aktif
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $stmt->execute([
                $fields['nim'], $fields['nama'], $fields['nik'], $fields['tempat_lahir'], $fields['tanggal_lahir'],
                $fields['gender'], $fields['no_telpon'], $fields['no_wa'], $fields['email'], $fields['pekerjaan'],
                $fields['pendidikan'], $fields['dusun'], $fields['rt'], $fields['rw'], $fields['desa'],
                $fields['kecamatan'], $fields['kabupaten'], $fields['provinsi'], $fields['kode_pos'], 1,
            ]);
            $mahromId = (int) $this->db->lastInsertId();

            $relasiErrors = $this->applyRelasiPayload($mahromId, $data['relasi'] ?? []);
            if ($relasiErrors !== null) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $relasiErrors];
            }

            $this->db->commit();
            $detail = $this->getById($mahromId);
            return ['success' => true, 'data' => $detail];
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('MahromService::create ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal menyimpan mahrom'];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('MahromService::create ' . $e->getMessage());
            $msg = $e instanceof \RuntimeException ? $e->getMessage() : 'Gagal menyimpan mahrom';
            return ['success' => false, 'message' => $msg];
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array{success: bool, message?: string, data?: array<string, mixed>}
     */
    public function update(int $id, array $data): array
    {
        if ($id <= 0) {
            return ['success' => false, 'message' => 'ID mahrom tidak valid'];
        }
        $existing = $this->getById($id, false);
        if ($existing === null) {
            return ['success' => false, 'message' => 'Mahrom tidak ditemukan'];
        }

        $parsed = $this->parseMahromPayload($data, false);
        if (!$parsed['success']) {
            return $parsed;
        }
        $fields = $parsed['fields'];

        if ($this->nikExists($fields['nik'], $id)) {
            return ['success' => false, 'message' => 'NIK sudah terdaftar pada mahrom lain'];
        }

        try {
            $this->db->beginTransaction();
            $stmt = $this->db->prepare(
                'UPDATE mahrom SET
                    nama = ?, nik = ?, tempat_lahir = ?, tanggal_lahir = ?, gender = ?,
                    no_telpon = ?, no_wa = ?, email = ?, pekerjaan = ?, pendidikan = ?,
                    dusun = ?, rt = ?, rw = ?, desa = ?, kecamatan = ?, kabupaten = ?, provinsi = ?, kode_pos = ?
                 WHERE id = ?'
            );
            $stmt->execute([
                $fields['nama'], $fields['nik'], $fields['tempat_lahir'], $fields['tanggal_lahir'], $fields['gender'],
                $fields['no_telpon'], $fields['no_wa'], $fields['email'], $fields['pekerjaan'], $fields['pendidikan'],
                $fields['dusun'], $fields['rt'], $fields['rw'], $fields['desa'], $fields['kecamatan'],
                $fields['kabupaten'], $fields['provinsi'], $fields['kode_pos'], $id,
            ]);

            if (array_key_exists('relasi', $data) && is_array($data['relasi'])) {
                $relasiErrors = $this->syncRelasiFromPayload($id, $data['relasi']);
                if ($relasiErrors !== null) {
                    $this->db->rollBack();
                    return ['success' => false, 'message' => $relasiErrors];
                }
            }

            $this->db->commit();
            return ['success' => true, 'data' => $this->getById($id)];
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('MahromService::update ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal memperbarui mahrom'];
        }
    }

    /**
     * @return array{success: bool, message?: string}
     */
    public function setAktif(int $id, bool $aktif): array
    {
        if ($id <= 0) {
            return ['success' => false, 'message' => 'ID mahrom tidak valid'];
        }
        $stmt = $this->db->prepare('UPDATE mahrom SET aktif = ? WHERE id = ?');
        $stmt->execute([$aktif ? 1 : 0, $id]);
        if ($stmt->rowCount() === 0) {
            return ['success' => false, 'message' => 'Mahrom tidak ditemukan'];
        }
        return ['success' => true];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listBySantri(int $santriId): array
    {
        if ($santriId <= 0) {
            return [];
        }
        $stmt = $this->db->prepare(
            'SELECT sm.id AS relasi_id, sm.hubungan, sm.is_utama, sm.keterangan AS relasi_keterangan,
                    m.id AS mahrom_id, m.nim, m.nama, m.nik, m.tempat_lahir, m.tanggal_lahir,
                    m.gender, m.no_telpon, m.no_wa, m.pekerjaan, m.foto_path,
                    m.dusun, m.rt, m.rw, m.desa, m.kecamatan, m.kabupaten, m.provinsi, m.kode_pos
             FROM santri___mahrom sm
             INNER JOIN mahrom m ON m.id = sm.id_mahrom
             WHERE sm.id_santri = ? AND m.aktif = 1
             ORDER BY sm.is_utama DESC, sm.hubungan ASC, m.nama ASC'
        );
        $stmt->execute([$santriId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'relasi_id' => (int) $row['relasi_id'],
                'mahrom_id' => (int) $row['mahrom_id'],
                'hubungan' => $row['hubungan'],
                'is_utama' => (int) $row['is_utama'] === 1,
                'nim' => $row['nim'],
                'nama' => $row['nama'],
                'nik' => $row['nik'],
                'tempat_lahir' => $row['tempat_lahir'],
                'tanggal_lahir' => $row['tanggal_lahir'],
                'gender' => $row['gender'],
                'no_telpon' => $row['no_telpon'],
                'no_wa' => $row['no_wa'],
                'pekerjaan' => $row['pekerjaan'],
                'foto_path' => !empty($row['foto_path']) ? (string) $row['foto_path'] : null,
                'dusun' => $row['dusun'],
                'rt' => $row['rt'],
                'rw' => $row['rw'],
                'desa' => $row['desa'],
                'kecamatan' => $row['kecamatan'],
                'kabupaten' => $row['kabupaten'],
                'provinsi' => $row['provinsi'],
                'kode_pos' => $row['kode_pos'],
                'label' => trim($row['hubungan'] . ': ' . ($row['nama'] ?? '')),
            ];
        }
        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listSantriByMahrom(int $mahromId): array
    {
        if ($mahromId <= 0) {
            return [];
        }
        $stmt = $this->db->prepare(
            'SELECT sm.id AS relasi_id, sm.hubungan, sm.is_utama, sm.keterangan,
                    s.id AS santri_id, s.nis, s.nama AS santri_nama
             FROM santri___mahrom sm
             INNER JOIN santri s ON s.id = sm.id_santri
             WHERE sm.id_mahrom = ?
             ORDER BY sm.is_utama DESC, s.nama ASC'
        );
        $stmt->execute([$mahromId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'relasi_id' => (int) $row['relasi_id'],
                'santri_id' => (int) $row['santri_id'],
                'nis' => $row['nis'] !== null ? (string) $row['nis'] : '',
                'santri_nama' => (string) ($row['santri_nama'] ?? ''),
                'hubungan' => (string) $row['hubungan'],
                'is_utama' => (int) $row['is_utama'] === 1,
                'keterangan' => $row['keterangan'],
            ];
        }
        return $out;
    }

    /**
     * @return list<array{id: int, nis: string, nama: string}>
     */
    public function searchSantriOptions(string $search, int $limit = 30): array
    {
        $limit = min(max(1, $limit), 100);
        $sql = 'SELECT s.id, s.nis, s.nama FROM santri s WHERE 1=1';
        $params = [];
        if ($search !== '') {
            $sql .= ' AND (s.nama LIKE ? OR CAST(s.nis AS CHAR) LIKE ?)';
            $like = '%' . $search . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $sql .= ' ORDER BY s.nama ASC LIMIT ' . $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int) $row['id'],
                'nis' => $row['nis'] !== null ? (string) $row['nis'] : '',
                'nama' => (string) ($row['nama'] ?? ''),
            ];
        }
        return $out;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getLinkedMahrom(int $santriId, int $mahromId): ?array
    {
        if ($santriId <= 0 || $mahromId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare(
            'SELECT sm.hubungan, sm.is_utama,
                    m.id, m.nim, m.nama, m.nik, m.tempat_lahir, m.tanggal_lahir, m.gender,
                    m.dusun, m.rt, m.rw, m.desa, m.kecamatan, m.kabupaten, m.provinsi, m.kode_pos
             FROM santri___mahrom sm
             INNER JOIN mahrom m ON m.id = sm.id_mahrom
             WHERE sm.id_santri = ? AND sm.id_mahrom = ? AND m.aktif = 1
             LIMIT 1'
        );
        $stmt->execute([$santriId, $mahromId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        return [
            'mahrom_id' => (int) $row['id'],
            'hubungan' => $row['hubungan'],
            'is_utama' => (int) $row['is_utama'] === 1,
            'nim' => $row['nim'],
            'nama' => $row['nama'],
            'nik' => $row['nik'],
            'tempat_lahir' => $row['tempat_lahir'],
            'tanggal_lahir' => $row['tanggal_lahir'],
            'gender' => $row['gender'],
            'dusun' => $row['dusun'],
            'rt' => $row['rt'],
            'rw' => $row['rw'],
            'desa' => $row['desa'],
            'kecamatan' => $row['kecamatan'],
            'kabupaten' => $row['kabupaten'],
            'provinsi' => $row['provinsi'],
            'kode_pos' => $row['kode_pos'],
        ];
    }

    public function defaultMahromIdForSantri(int $santriId): ?int
    {
        $list = $this->listBySantri($santriId);
        if ($list === []) {
            return null;
        }
        foreach ($list as $item) {
            if (!empty($item['is_utama'])) {
                return (int) $item['mahrom_id'];
            }
        }
        return (int) $list[0]['mahrom_id'];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{success: bool, message?: string, fields?: array<string, mixed>}
     */
    private function parseMahromPayload(array $data, bool $requireNama = true): array
    {
        $nama = TextSanitizer::cleanTextOrNull($data['nama'] ?? null);
        if ($requireNama && ($nama === null || $nama === '')) {
            return ['success' => false, 'message' => 'Nama wajib diisi'];
        }

        $nikRaw = trim((string) ($data['nik'] ?? ''));
        if ($nikRaw === '') {
            return ['success' => false, 'message' => 'NIK wajib diisi'];
        }
        $nikCheck = NikHelper::validate($nikRaw);
        if (!$nikCheck['valid']) {
            return ['success' => false, 'message' => NikHelper::INVALID_MESSAGE];
        }

        $gender = TextSanitizer::cleanTextOrNull($data['gender'] ?? null);
        if ($gender !== null && $gender !== '' && !in_array($gender, ['Laki-laki', 'Perempuan'], true)) {
            $gender = null;
        }

        $tanggalLahir = TextSanitizer::cleanTextOrNull($data['tanggal_lahir'] ?? null);
        if ($tanggalLahir !== null && $tanggalLahir !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalLahir)) {
            $tanggalLahir = null;
        }

        return [
            'success' => true,
            'fields' => [
                'nama' => $nama ?? '',
                'nik' => $nikCheck['normalized'],
                'tempat_lahir' => TextSanitizer::cleanTextOrNull($data['tempat_lahir'] ?? null),
                'tanggal_lahir' => $tanggalLahir ?: null,
                'gender' => $gender ?: null,
                'no_telpon' => TextSanitizer::cleanTextOrNull($data['no_telpon'] ?? null),
                'no_wa' => TextSanitizer::cleanTextOrNull($data['no_wa'] ?? null),
                'email' => TextSanitizer::cleanTextOrNull($data['email'] ?? null),
                'pekerjaan' => TextSanitizer::cleanTextOrNull($data['pekerjaan'] ?? null),
                'pendidikan' => TextSanitizer::cleanTextOrNull($data['pendidikan'] ?? null),
                'dusun' => TextSanitizer::cleanTextOrNull($data['dusun'] ?? null),
                'rt' => TextSanitizer::cleanTextOrNull($data['rt'] ?? null),
                'rw' => TextSanitizer::cleanTextOrNull($data['rw'] ?? null),
                'desa' => TextSanitizer::cleanTextOrNull($data['desa'] ?? null),
                'kecamatan' => TextSanitizer::cleanTextOrNull($data['kecamatan'] ?? null),
                'kabupaten' => TextSanitizer::cleanTextOrNull($data['kabupaten'] ?? null),
                'provinsi' => TextSanitizer::cleanTextOrNull($data['provinsi'] ?? null),
                'kode_pos' => TextSanitizer::cleanTextOrNull($data['kode_pos'] ?? null),
            ],
        ];
    }

    /**
     * @param list<array<string, mixed>> $relasiList
     */
    private function applyRelasiPayload(int $mahromId, array $relasiList): ?string
    {
        foreach ($relasiList as $rel) {
            if (!is_array($rel)) {
                continue;
            }
            $santriId = (int) ($rel['id_santri'] ?? $rel['santri_id'] ?? 0);
            if ($santriId <= 0) {
                continue;
            }
            $err = $this->linkSantriInternal($mahromId, $santriId, $rel);
            if ($err !== null) {
                return $err;
            }
        }
        return null;
    }

    /**
     * Sinkron relasi: tambah baru, update yang ada, hapus yang tidak ada di payload.
     *
     * @param list<array<string, mixed>> $relasiList
     */
    private function syncRelasiFromPayload(int $mahromId, array $relasiList): ?string
    {
        $keepIds = [];
        foreach ($relasiList as $rel) {
            if (!is_array($rel)) {
                continue;
            }
            $relasiId = (int) ($rel['relasi_id'] ?? 0);
            $santriId = (int) ($rel['id_santri'] ?? $rel['santri_id'] ?? 0);
            $hubungan = trim((string) ($rel['hubungan'] ?? ''));
            if ($hubungan === '') {
                return 'Hubungan dengan santri wajib diisi';
            }
            if (!in_array($hubungan, self::HUBUNGAN_OPTIONS, true)) {
                return 'Hubungan tidak valid';
            }
            $isUtama = !empty($rel['is_utama']) ? 1 : 0;
            $keterangan = TextSanitizer::cleanTextOrNull($rel['keterangan'] ?? null);

            if ($relasiId > 0) {
                $stmt = $this->db->prepare(
                    'UPDATE santri___mahrom SET hubungan = ?, is_utama = ?, keterangan = ?
                     WHERE id = ? AND id_mahrom = ?'
                );
                $stmt->execute([$hubungan, $isUtama, $keterangan, $relasiId, $mahromId]);
                $keepIds[] = $relasiId;
            } elseif ($santriId > 0) {
                $err = $this->linkSantriInternal($mahromId, $santriId, $rel);
                if ($err !== null) {
                    return $err;
                }
                $stmt = $this->db->prepare(
                    'SELECT id FROM santri___mahrom WHERE id_mahrom = ? AND id_santri = ? LIMIT 1'
                );
                $stmt->execute([$mahromId, $santriId]);
                $newId = (int) $stmt->fetchColumn();
                if ($newId > 0) {
                    $keepIds[] = $newId;
                }
            }
        }

        if ($keepIds !== []) {
            $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
            $params = array_merge([$mahromId], $keepIds);
            $this->db->prepare(
                "DELETE FROM santri___mahrom WHERE id_mahrom = ? AND id NOT IN ({$placeholders})"
            )->execute($params);
        } else {
            $this->db->prepare('DELETE FROM santri___mahrom WHERE id_mahrom = ?')->execute([$mahromId]);
        }

        return null;
    }

    /**
     * @param array<string, mixed> $rel
     */
    private function linkSantriInternal(int $mahromId, int $santriId, array $rel): ?string
    {
        $hubungan = trim((string) ($rel['hubungan'] ?? ''));
        if ($hubungan === '') {
            return 'Hubungan dengan santri wajib diisi';
        }
        if (!in_array($hubungan, self::HUBUNGAN_OPTIONS, true)) {
            return 'Hubungan tidak valid';
        }

        $stmt = $this->db->prepare('SELECT id FROM santri WHERE id = ? LIMIT 1');
        $stmt->execute([$santriId]);
        if (!$stmt->fetch()) {
            return 'Santri tidak ditemukan';
        }

        $isUtama = !empty($rel['is_utama']) ? 1 : 0;
        $keterangan = TextSanitizer::cleanTextOrNull($rel['keterangan'] ?? null);

        $stmt = $this->db->prepare(
            'SELECT id FROM santri___mahrom WHERE id_santri = ? AND id_mahrom = ? LIMIT 1'
        );
        $stmt->execute([$santriId, $mahromId]);
        $existingId = (int) $stmt->fetchColumn();

        if ($existingId > 0) {
            $this->db->prepare(
                'UPDATE santri___mahrom SET hubungan = ?, is_utama = ?, keterangan = ? WHERE id = ?'
            )->execute([$hubungan, $isUtama, $keterangan, $existingId]);
        } else {
            $this->db->prepare(
                'INSERT INTO santri___mahrom (id_santri, id_mahrom, hubungan, is_utama, keterangan)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([$santriId, $mahromId, $hubungan, $isUtama, $keterangan]);
        }

        if ($isUtama === 1) {
            $this->db->prepare(
                'UPDATE santri___mahrom SET is_utama = 0 WHERE id_santri = ? AND id_mahrom != ?'
            )->execute([$santriId, $mahromId]);
        }

        return null;
    }

    private function nikExists(string $nik, ?int $excludeId): bool
    {
        $sql = 'SELECT id FROM mahrom WHERE nik = ?';
        $params = [$nik];
        if ($excludeId !== null && $excludeId > 0) {
            $sql .= ' AND id != ?';
            $params[] = $excludeId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function formatMahromRow(array $row, bool $summary): array
    {
        $out = [
            'id' => (int) $row['id'],
            'nim' => (string) ($row['nim'] ?? ''),
            'nama' => (string) ($row['nama'] ?? ''),
            'nik' => $row['nik'] !== null ? (string) $row['nik'] : '',
            'gender' => $row['gender'],
            'no_wa' => $row['no_wa'],
            'no_telpon' => $row['no_telpon'],
            'pekerjaan' => $row['pekerjaan'],
            'aktif' => (int) ($row['aktif'] ?? 1) === 1,
            'foto_path' => !empty($row['foto_path']) ? (string) $row['foto_path'] : null,
            'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
            'tanggal_update' => $row['tanggal_update'] ?? null,
        ];
        if (isset($row['jumlah_santri'])) {
            $out['jumlah_santri'] = (int) $row['jumlah_santri'];
        }
        if (!$summary) {
            $out['tempat_lahir'] = $row['tempat_lahir'];
            $out['tanggal_lahir'] = $row['tanggal_lahir'];
            $out['email'] = $row['email'];
            $out['pendidikan'] = $row['pendidikan'];
            $out['dusun'] = $row['dusun'];
            $out['rt'] = $row['rt'];
            $out['rw'] = $row['rw'];
            $out['desa'] = $row['desa'];
            $out['kecamatan'] = $row['kecamatan'];
            $out['kabupaten'] = $row['kabupaten'];
            $out['provinsi'] = $row['provinsi'];
            $out['kode_pos'] = $row['kode_pos'];
        }
        return $out;
    }
}
