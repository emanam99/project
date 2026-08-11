<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\AlumniHelper;
use App\Helpers\NikHelper;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD alumni untuk staf eBeddien (JWT pengurus + fitur menu.alumni).
 */
class AlumniStaffController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** GET /api/alumni/staff */
    public function list(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $search = trim((string) ($q['q'] ?? ''));
            $status = strtolower(trim((string) ($q['status'] ?? '')));
            $kabupaten = trim((string) ($q['kabupaten'] ?? ''));
            $kecamatan = trim((string) ($q['kecamatan'] ?? ''));
            $desa = trim((string) ($q['desa'] ?? ''));
            $dusun = trim((string) ($q['dusun'] ?? ''));
            $page = max(1, (int) ($q['page'] ?? 1));
            $limit = (int) ($q['limit'] ?? 50);
            if ($limit < 1) {
                $limit = 50;
            }
            if ($limit > 500) {
                $limit = 500;
            }
            $sort = (string) ($q['sort'] ?? 'nama');
            $dir = strtolower((string) ($q['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';
            $allowedSort = [
                'nama', 'id_alumni', 'nik', 'gender', 'status', 'kabupaten', 'kecamatan', 'desa', 'dusun',
                'tahun_masuk_masehi', 'tahun_boyong_masehi', 'tanggal_dibuat',
            ];
            if (!in_array($sort, $allowedSort, true)) {
                $sort = 'nama';
            }

            $where = ['1=1'];
            $params = [];
            if ($search !== '') {
                $where[] = '(nama LIKE ? OR nik LIKE ? OR CAST(id_alumni AS CHAR) LIKE ? OR dusun LIKE ? OR desa LIKE ? OR kecamatan LIKE ? OR kabupaten LIKE ?)';
                $like = '%' . $search . '%';
                array_push($params, $like, $like, $like, $like, $like, $like, $like);
            }
            if ($status === 'hidup' || $status === 'wafat') {
                $where[] = 'status = ?';
                $params[] = $status;
            }
            if ($kabupaten !== '') {
                $where[] = 'kabupaten = ?';
                $params[] = $kabupaten;
            }
            if ($kecamatan !== '') {
                $where[] = 'kecamatan = ?';
                $params[] = $kecamatan;
            }
            if ($desa !== '') {
                $where[] = 'desa = ?';
                $params[] = $desa;
            }
            if ($dusun !== '') {
                $where[] = 'dusun = ?';
                $params[] = $dusun;
            }
            $whereSql = implode(' AND ', $where);

            $countStmt = $this->db->prepare("SELECT COUNT(*) FROM alumni WHERE {$whereSql}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            // NULL / kosong di akhir agar sortir tahun masuk/boyong lebih rapi
            $orderSql = "(`{$sort}` IS NULL OR TRIM(CAST(`{$sort}` AS CHAR)) = '') ASC, `{$sort}` {$dir}, `nama` ASC";
            $sql = "SELECT * FROM alumni WHERE {$whereSql} ORDER BY {$orderSql} LIMIT {$limit} OFFSET {$offset}";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $kabList = $this->distinctWilayahCounts('kabupaten');
            $kecList = $this->distinctWilayahCounts('kecamatan', array_filter([
                'kabupaten' => $kabupaten,
            ]));
            $desaList = $this->distinctWilayahCounts('desa', array_filter([
                'kabupaten' => $kabupaten,
                'kecamatan' => $kecamatan,
            ]));
            $dusunList = $this->distinctWilayahCounts('dusun', array_filter([
                'kabupaten' => $kabupaten,
                'kecamatan' => $kecamatan,
                'desa' => $desa,
            ]));

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'items' => array_map([$this, 'formatRow'], $rows),
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => $total,
                        'total_pages' => $limit > 0 ? (int) ceil($total / $limit) : 1,
                    ],
                    'filters' => [
                        'kabupaten' => $kabList,
                        'kecamatan' => $kecList,
                        'desa' => $desaList,
                        'dusun' => $dusunList,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniStaffController::list ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar alumni'], 500);
        }
    }

    /**
     * Opsi filter wilayah (nilai unik + jumlah), opsional disaring parent.
     *
     * @param array<string, string> $parentEq
     * @return list<array{value: string, total: int}>
     */
    private function distinctWilayahCounts(string $column, array $parentEq = []): array
    {
        $allowed = ['kabupaten', 'kecamatan', 'desa', 'dusun'];
        if (!in_array($column, $allowed, true)) {
            return [];
        }
        $where = ["`{$column}` IS NOT NULL", "TRIM(`{$column}`) <> ''"];
        $params = [];
        foreach ($parentEq as $col => $val) {
            if (!in_array($col, $allowed, true) || $val === '') {
                continue;
            }
            $where[] = "`{$col}` = ?";
            $params[] = $val;
        }
        $whereSql = implode(' AND ', $where);
        $sql = "SELECT `{$column}` AS value, COUNT(*) AS total FROM alumni
                WHERE {$whereSql}
                GROUP BY `{$column}` ORDER BY `{$column}` ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $r) {
            $out[] = [
                'value' => (string) $r['value'],
                // Kompatibilitas UI lama (kabupaten: key sama nama kolom)
                $column => (string) $r['value'],
                'total' => (int) $r['total'],
            ];
        }
        return $out;
    }

    /** GET /api/alumni/staff/{id} */
    public function getById(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $stmt = $this->db->prepare('SELECT * FROM alumni WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Alumni tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $this->formatRow($row)]);
        } catch (\Throwable $e) {
            error_log('AlumniStaffController::getById ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil data alumni'], 500);
        }
    }

    /** PUT /api/alumni/staff/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $data = $request->getParsedBody();
        $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, [
            'nama', 'nik', 'gender', 'status', 'nomor_hp', 'tempat_lahir', 'tanggal_lahir',
            'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
            'ayah', 'ibu', 'tahun_masuk_masehi', 'tahun_boyong_masehi',
        ]) : [];

        $nama = trim((string) ($data['nama'] ?? ''));
        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama wajib diisi'], 400);
        }
        $gender = AlumniHelper::normalizeGender($data['gender'] ?? null);
        if ($gender === null) {
            return $this->json($response, ['success' => false, 'message' => 'Gender wajib diisi'], 400);
        }
        $statusRaw = strtolower(trim((string) ($data['status'] ?? 'hidup')));
        $status = $statusRaw === 'wafat' ? 'wafat' : 'hidup';

        $nik = preg_replace('/\D/', '', (string) ($data['nik'] ?? ''));
        if (strlen($nik) === 16) {
            $nikCheck = NikHelper::validate($nik);
            if (!$nikCheck['valid']) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak valid'], 400);
            }
            $nik = $nikCheck['normalized'];
        } else {
            $nik = null;
        }

        $tahunBoyongM = AlumniHelper::normalizeYear($data['tahun_boyong_masehi'] ?? null);
        $tahunBoyongH = null;
        if ($tahunBoyongM !== null && strlen($tahunBoyongM) === 4) {
            $tahunBoyongH = AlumniHelper::masehiYearToHijriyahYear($this->db, (int) $tahunBoyongM);
        } else {
            $tahunBoyongM = null;
        }
        $tahunMasukM = AlumniHelper::normalizeYear($data['tahun_masuk_masehi'] ?? null);
        $tahunMasukH = null;
        if ($tahunMasukM !== null && strlen($tahunMasukM) === 4) {
            $tahunMasukH = AlumniHelper::masehiYearToHijriyahYear($this->db, (int) $tahunMasukM);
        } else {
            $tahunMasukM = null;
        }

        try {
            $stmt = $this->db->prepare('SELECT * FROM alumni WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$existing) {
                return $this->json($response, ['success' => false, 'message' => 'Alumni tidak ditemukan'], 404);
            }

            if ($nik !== null && $nik !== (string) $existing['nik']) {
                $dup = $this->db->prepare('SELECT id FROM alumni WHERE nik = ? AND id <> ? LIMIT 1');
                $dup->execute([$nik, $id]);
                if ($dup->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'NIK sudah dipakai alumni lain'], 409);
                }
            }

            $fields = [
                'nama' => $nama,
                'gender' => $gender,
                'status' => $status,
                'nomor_hp' => $this->nullIfEmpty($data['nomor_hp'] ?? null),
                'tempat_lahir' => $this->nullIfEmpty($data['tempat_lahir'] ?? null),
                'tanggal_lahir' => $this->normalizeDate($data['tanggal_lahir'] ?? null),
                'dusun' => $this->nullIfEmpty($data['dusun'] ?? null),
                'rt' => $this->nullIfEmpty($data['rt'] ?? null),
                'rw' => $this->nullIfEmpty($data['rw'] ?? null),
                'desa' => trim((string) ($data['desa'] ?? $existing['desa'] ?? '')),
                'kecamatan' => trim((string) ($data['kecamatan'] ?? $existing['kecamatan'] ?? '')),
                'kabupaten' => trim((string) ($data['kabupaten'] ?? $existing['kabupaten'] ?? '')),
                'provinsi' => trim((string) ($data['provinsi'] ?? $existing['provinsi'] ?? '')),
                'kode_pos' => $this->nullIfEmpty($data['kode_pos'] ?? null),
                'ayah' => $this->nullIfEmpty($data['ayah'] ?? null),
                'ibu' => $this->nullIfEmpty($data['ibu'] ?? null),
                'tahun_masuk_masehi' => $tahunMasukM,
                'tahun_masuk_hijriyah' => $tahunMasukH,
                'tahun_boyong_masehi' => $tahunBoyongM ?? $existing['tahun_boyong_masehi'],
                'tahun_boyong_hijriyah' => $tahunBoyongH ?? $existing['tahun_boyong_hijriyah'],
            ];
            if ($nik !== null) {
                $fields['nik'] = $nik;
            }

            $sets = [];
            $params = [];
            foreach ($fields as $col => $val) {
                $sets[] = "`{$col}` = ?";
                $params[] = $val;
            }
            $params[] = $id;
            $this->db->prepare('UPDATE alumni SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

            $stmtNew = $this->db->prepare('SELECT * FROM alumni WHERE id = ? LIMIT 1');
            $stmtNew->execute([$id]);
            $row = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'message' => 'Data alumni diperbarui',
                'data' => $this->formatRow($row),
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniStaffController::update ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui alumni'], 500);
        }
    }

    /** PATCH /api/alumni/staff/{id}/status  body: { status: hidup|wafat } */
    public function updateStatus(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $data = $request->getParsedBody();
        $statusRaw = strtolower(trim((string) (is_array($data) ? ($data['status'] ?? '') : '')));
        if ($statusRaw !== 'hidup' && $statusRaw !== 'wafat') {
            return $this->json($response, ['success' => false, 'message' => 'Status harus hidup atau wafat'], 400);
        }
        try {
            $stmt = $this->db->prepare('UPDATE alumni SET status = ? WHERE id = ?');
            $stmt->execute([$statusRaw, $id]);
            if ($stmt->rowCount() === 0) {
                $check = $this->db->prepare('SELECT id FROM alumni WHERE id = ? LIMIT 1');
                $check->execute([$id]);
                if (!$check->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Alumni tidak ditemukan'], 404);
                }
            }
            $stmtNew = $this->db->prepare('SELECT * FROM alumni WHERE id = ? LIMIT 1');
            $stmtNew->execute([$id]);
            $row = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            return $this->json($response, [
                'success' => true,
                'message' => 'Status diperbarui',
                'data' => $this->formatRow($row),
            ]);
        } catch (\Throwable $e) {
            error_log('AlumniStaffController::updateStatus ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah status'], 500);
        }
    }

    /** DELETE /api/alumni/staff/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $stmt = $this->db->prepare('DELETE FROM alumni WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Alumni tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'message' => 'Alumni dihapus']);
        } catch (\Throwable $e) {
            error_log('AlumniStaffController::delete ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus alumni'], 500);
        }
    }

    private function formatRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'id_alumni' => (int) $row['id_alumni'],
            'nama' => $row['nama'] ?? '',
            'nik' => $row['nik'] ?? '',
            'gender' => $row['gender'] ?? null,
            'status' => (($row['status'] ?? 'hidup') === 'wafat') ? 'wafat' : 'hidup',
            'nomor_hp' => $row['nomor_hp'] ?? null,
            'tempat_lahir' => $row['tempat_lahir'] ?? null,
            'tanggal_lahir' => $row['tanggal_lahir'] ?? null,
            'dusun' => $row['dusun'] ?? null,
            'rt' => $row['rt'] ?? null,
            'rw' => $row['rw'] ?? null,
            'desa' => $row['desa'] ?? null,
            'kecamatan' => $row['kecamatan'] ?? null,
            'kabupaten' => $row['kabupaten'] ?? null,
            'provinsi' => $row['provinsi'] ?? null,
            'kode_pos' => $row['kode_pos'] ?? null,
            'ayah' => $row['ayah'] ?? null,
            'ibu' => $row['ibu'] ?? null,
            'tahun_masuk_masehi' => $row['tahun_masuk_masehi'] ?? null,
            'tahun_masuk_hijriyah' => $row['tahun_masuk_hijriyah'] ?? null,
            'tahun_boyong_masehi' => $row['tahun_boyong_masehi'] ?? null,
            'tahun_boyong_hijriyah' => $row['tahun_boyong_hijriyah'] ?? null,
            'id_santri' => isset($row['id_santri']) && $row['id_santri'] !== null ? (int) $row['id_santri'] : null,
            'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
            'tanggal_update' => $row['tanggal_update'] ?? null,
        ];
    }

    private function nullIfEmpty($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        return $s === '' ? null : $s;
    }

    private function normalizeDate($value): ?string
    {
        $s = $this->nullIfEmpty($value);
        if ($s === null) {
            return null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            return $s;
        }
        $t = strtotime($s);
        return $t ? date('Y-m-d', $t) : null;
    }
}
