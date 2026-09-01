<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Jadwal pelajaran per mapel (lembaga___kitab) — tabel lembaga___jadwal.
 */
class KurikulumJadwalController
{
    private $db;

    private const POLA = ['mingguan', 'bulanan', 'opsional'];

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

    private function selectBase(): string
    {
        return 'FROM lembaga___jadwal j
                INNER JOIN lembaga___kitab lk ON lk.id = j.id_lembaga_kitab
                INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                LEFT JOIN lembaga l ON l.id = r.lembaga_id
                INNER JOIN kitab k ON k.id = lk.id_kitab
                INNER JOIN pengurus p ON p.id = j.id_pengurus';
    }

    private function selectColumns(): string
    {
        return 'j.*,
                lk.id_rombel, lk.id_kitab,
                r.lembaga_id, r.kelas, r.kel,
                l.nama AS lembaga_nama,
                k.nama_indo AS kitab_nama, k.fan AS kitab_fan, k.nama_arab AS kitab_nama_arab,
                p.nama AS pengurus_nama, p.gelar_awal AS pengurus_gelar_awal, p.gelar_akhir AS pengurus_gelar_akhir';
    }

    /**
     * GET /api/kurikulum-jadwal
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
            $lembagaIdsCsv = isset($params['lembaga_ids']) ? trim((string) $params['lembaga_ids']) : '';
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $search = isset($params['search']) ? trim((string) $params['search']) : '';
            $page = isset($params['page']) ? max(1, (int) $params['page']) : 1;
            $limit = isset($params['limit']) ? max(1, min(500, (int) $params['limit'])) : 50;
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

            $idRombel = isset($params['id_rombel']) ? (int) $params['id_rombel'] : 0;
            if ($idRombel > 0) {
                $where .= ' AND lk.id_rombel = ?';
                $bind[] = $idRombel;
            }

            $idLembagaKitab = isset($params['id_lembaga_kitab']) ? (int) $params['id_lembaga_kitab'] : 0;
            if ($idLembagaKitab > 0) {
                $where .= ' AND j.id_lembaga_kitab = ?';
                $bind[] = $idLembagaKitab;
            }

            if ($status !== '') {
                $where .= ' AND j.status = ?';
                $bind[] = $status;
            }

            if ($search !== '') {
                $term = '%' . $search . '%';
                $where .= ' AND (
                    k.nama_indo LIKE ? OR k.nama_arab LIKE ? OR k.fan LIKE ?
                    OR r.kelas LIKE ? OR r.kel LIKE ? OR l.nama LIKE ?
                    OR p.nama LIKE ? OR j.pola LIKE ?
                )';
                for ($i = 0; $i < 8; $i++) {
                    $bind[] = $term;
                }
            }

            $base = $this->selectBase() . $where;

            $stmt = $this->db->prepare('SELECT COUNT(*) AS total ' . $base);
            $stmt->execute($bind);
            $total = (int) $stmt->fetch(\PDO::FETCH_ASSOC)['total'];

            $sql = 'SELECT ' . $this->selectColumns() . ' ' . $base . '
                    ORDER BY l.nama, r.kelas, r.kel, j.pola, j.hari, j.tanggal_bulan, j.tanggal, j.jam_mulai
                    LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
            ], 200);
        } catch (\Exception $e) {
            error_log('KurikulumJadwalController::getAll: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar jadwal',
                'error' => null,
            ], 500);
        }
    }

    /**
     * GET /api/kurikulum-jadwal/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $sql = 'SELECT ' . $this->selectColumns() . ' ' . $this->selectBase() . ' WHERE j.id = ?';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('KurikulumJadwalController::getById: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
            ], 500);
        }
    }

    /**
     * @return array{ok:true,values:array}|array{ok:false,message:string}
     */
    private function parsePayload(array $data): array
    {
        $idLembagaKitab = isset($data['id_lembaga_kitab']) ? (int) $data['id_lembaga_kitab'] : 0;
        $idPengurus = isset($data['id_pengurus']) ? (int) $data['id_pengurus'] : 0;
        $pola = strtolower(trim((string) ($data['pola'] ?? '')));
        $status = TextSanitizer::cleanTextOrNull($data['status'] ?? null) ?: 'aktif';
        if ($status !== 'nonaktif') {
            $status = 'aktif';
        }

        if ($idLembagaKitab < 1) {
            return ['ok' => false, 'message' => 'Mapel wajib dipilih'];
        }
        if ($idPengurus < 1) {
            return ['ok' => false, 'message' => 'Pengajar wajib dipilih'];
        }
        if (!in_array($pola, self::POLA, true)) {
            return ['ok' => false, 'message' => 'Pola jadwal tidak valid'];
        }

        $jamMulai = $this->normalizeTime($data['jam_mulai'] ?? null);
        $jamSelesai = $this->normalizeTime($data['jam_selesai'] ?? null);
        if ($jamMulai === null || $jamSelesai === null) {
            return ['ok' => false, 'message' => 'Jam mulai dan jam selesai wajib diisi'];
        }
        if ($this->timeToMinutes($jamSelesai) <= $this->timeToMinutes($jamMulai)) {
            return ['ok' => false, 'message' => 'Jam selesai harus setelah jam mulai'];
        }

        $jamJenis = strtolower(trim((string) ($data['jam_jenis'] ?? 'wib')));
        if ($jamJenis !== 'istiwa') {
            $jamJenis = 'wib';
        }

        $hari = null;
        $tanggalBulan = null;
        $tanggal = null;

        if ($pola === 'mingguan') {
            $hari = isset($data['hari']) ? (int) $data['hari'] : 0;
            if ($hari < 1 || $hari > 7) {
                return ['ok' => false, 'message' => 'Pilih hari (Senin–Minggu)'];
            }
        } elseif ($pola === 'bulanan') {
            $tanggalBulan = isset($data['tanggal_bulan']) ? (int) $data['tanggal_bulan'] : 0;
            if ($tanggalBulan < 1 || $tanggalBulan > 31) {
                return ['ok' => false, 'message' => 'Pilih tanggal 1–31'];
            }
        } else {
            $tanggalRaw = trim((string) ($data['tanggal'] ?? ''));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalRaw)) {
                return ['ok' => false, 'message' => 'Pilih tanggal tertentu'];
            }
            $dt = \DateTime::createFromFormat('Y-m-d', $tanggalRaw);
            if (!$dt || $dt->format('Y-m-d') !== $tanggalRaw) {
                return ['ok' => false, 'message' => 'Tanggal tidak valid'];
            }
            $tanggal = $tanggalRaw;
        }

        $stmt = $this->db->prepare('SELECT id FROM lembaga___kitab WHERE id = ?');
        $stmt->execute([$idLembagaKitab]);
        if (!$stmt->fetch()) {
            return ['ok' => false, 'message' => 'Mapel tidak ditemukan'];
        }

        $stmt = $this->db->prepare('SELECT id FROM pengurus WHERE id = ?');
        $stmt->execute([$idPengurus]);
        if (!$stmt->fetch()) {
            return ['ok' => false, 'message' => 'Pengurus tidak ditemukan'];
        }

        return [
            'ok' => true,
            'values' => [
                $idLembagaKitab,
                $idPengurus,
                $pola,
                $hari,
                $tanggalBulan,
                $tanggal,
                $jamMulai,
                $jamSelesai,
                $jamJenis,
                $status,
            ],
        ];
    }

    private function normalizeTime($raw): ?string
    {
        $s = trim((string) $raw);
        if ($s === '') {
            return null;
        }
        if (!preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
            return null;
        }
        $h = (int) $m[1];
        $min = (int) $m[2];
        $sec = isset($m[3]) ? (int) $m[3] : 0;
        if ($h > 23 || $min > 59 || $sec > 59) {
            return null;
        }

        return sprintf('%02d:%02d:%02d', $h, $min, $sec);
    }

    private function timeToMinutes(string $time): int
    {
        $parts = explode(':', $time);

        return ((int) ($parts[0] ?? 0)) * 60 + ((int) ($parts[1] ?? 0));
    }

    /**
     * POST /api/kurikulum-jadwal
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $parsed = $this->parsePayload($request->getParsedBody() ?? []);
            if (!$parsed['ok']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['message']], 400);
            }

            $stmt = $this->db->prepare(
                'INSERT INTO lembaga___jadwal
                    (id_lembaga_kitab, id_pengurus, pola, hari, tanggal_bulan, tanggal, jam_mulai, jam_selesai, jam_jenis, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute($parsed['values']);
            $newId = (int) $this->db->lastInsertId();

            return $this->getById($request, $response, ['id' => $newId]);
        } catch (\Exception $e) {
            error_log('KurikulumJadwalController::create: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan jadwal',
                'error' => null,
            ], 500);
        }
    }

    /**
     * PUT /api/kurikulum-jadwal/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM lembaga___jadwal WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            $parsed = $this->parsePayload($request->getParsedBody() ?? []);
            if (!$parsed['ok']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $parsed['message']], 400);
            }

            $vals = $parsed['values'];
            $vals[] = $id;
            $stmt = $this->db->prepare(
                'UPDATE lembaga___jadwal SET
                    id_lembaga_kitab = ?, id_pengurus = ?, pola = ?, hari = ?, tanggal_bulan = ?,
                    tanggal = ?, jam_mulai = ?, jam_selesai = ?, jam_jenis = ?, status = ?
                 WHERE id = ?'
            );
            $stmt->execute($vals);

            return $this->getById($request, $response, ['id' => $id]);
        } catch (\Exception $e) {
            error_log('KurikulumJadwalController::update: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui jadwal',
                'error' => null,
            ], 500);
        }
    }

    /**
     * DELETE /api/kurikulum-jadwal/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('DELETE FROM lembaga___jadwal WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jadwal dihapus',
            ], 200);
        } catch (\Exception $e) {
            error_log('KurikulumJadwalController::delete: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus',
            ], 500);
        }
    }
}
