<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class WaliKelasController
{
    private $db;
    private $guruFanTableExists = null;

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

    private function guruFanTableExists(): bool
    {
        if ($this->guruFanTableExists !== null) {
            return (bool) $this->guruFanTableExists;
        }

        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'lembaga___wali_kelas_guru_fan'");
            $this->guruFanTableExists = (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $this->guruFanTableExists = false;
        }

        return (bool) $this->guruFanTableExists;
    }

    /** @return array<int, array{id_pengurus:int, nama:string}> */
    private function fetchGuruFanForWali(int $idWaliKelas): array
    {
        if (!$this->guruFanTableExists()) {
            return [];
        }

        try {
            $stmt = $this->db->prepare('
                SELECT g.id_pengurus, p.nama AS nama
                FROM lembaga___wali_kelas_guru_fan g
                INNER JOIN pengurus p ON p.id = g.id_pengurus
                WHERE g.id_wali_kelas = ?
                ORDER BY g.urutan ASC, g.id ASC
            ');
            $stmt->execute([$idWaliKelas]);
            $out = [];
            while ($r = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $out[] = [
                    'id_pengurus' => (int) $r['id_pengurus'],
                    'nama' => (string) ($r['nama'] ?? ''),
                ];
            }

            return $out;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function attachGuruFan(array $rows): array
    {
        foreach ($rows as &$r) {
            $wid = isset($r['id']) ? (int) $r['id'] : 0;
            $r['guru_fan'] = $wid > 0 ? $this->fetchGuruFanForWali($wid) : [];
        }
        unset($r);

        return $rows;
    }

    private function getLembagaIdForRombel(int $idRombel): ?string
    {
        $stmt = $this->db->prepare('SELECT lembaga_id FROM lembaga___rombel WHERE id = ? LIMIT 1');
        $stmt->execute([$idRombel]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row || !isset($row['lembaga_id'])) {
            return null;
        }
        $lid = trim((string) $row['lembaga_id']);

        return $lid !== '' ? $lid : null;
    }

    private function isPengurusAktifDiLembaga(int $idPengurus, string $lembagaId): bool
    {
        $stmt = $this->db->prepare('
            SELECT 1 FROM pengurus p
            INNER JOIN pengurus___jabatan pj ON pj.pengurus_id = p.id
                AND (pj.status = \'aktif\' OR pj.status = \'active\' OR pj.status IS NULL OR TRIM(COALESCE(pj.status, \'\')) = \'\')
            INNER JOIN jabatan j ON j.id = pj.jabatan_id
            WHERE p.id = ?
            AND COALESCE(NULLIF(TRIM(pj.lembaga_id), \'\'), j.lembaga_id) = ?
            LIMIT 1
        ');
        $stmt->execute([$idPengurus, $lembagaId]);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * @param mixed $raw dari body JSON: array angka / string JSON array
     * @return int[] unik, > 0
     */
    private function parseIdPengurusFanList($raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }
        if (is_string($raw)) {
            $dec = json_decode($raw, true);
            if (is_array($dec)) {
                return $this->parseIdPengurusFanList($dec);
            }

            return [];
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $v) {
            $n = (int) $v;
            if ($n > 0) {
                $out[] = $n;
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * @param int[] $fanIds
     * @return int[] urutan stabil, unik
     *
     * @throws \InvalidArgumentException
     */
    private function normalizeFanPengurusIds(int $idKelasRombel, array $fanIds, ?int $idPengurusWali): array
    {
        if ($fanIds === []) {
            return [];
        }
        $lembagaId = $this->getLembagaIdForRombel($idKelasRombel);
        if ($lembagaId === null) {
            throw new \InvalidArgumentException('Rombel tidak memiliki lembaga');
        }
        $seen = [];
        $ordered = [];
        foreach ($fanIds as $pid) {
            if ($pid <= 0) {
                continue;
            }
            if ($idPengurusWali !== null && $pid === $idPengurusWali) {
                throw new \InvalidArgumentException('Guru FAN tidak boleh sama dengan wali kelas');
            }
            if (isset($seen[$pid])) {
                continue;
            }
            $seen[$pid] = true;
            if (!$this->isPengurusAktifDiLembaga($pid, $lembagaId)) {
                throw new \InvalidArgumentException('Guru FAN harus pengurus aktif di lembaga rombel ini');
            }
            $ordered[] = $pid;
        }

        return $ordered;
    }

    /** @param int[] $orderedPengurusIds hasil normalizeFanPengurusIds */
    private function writeGuruFanRows(int $idWaliKelas, array $orderedPengurusIds): void
    {
        if (!$this->guruFanTableExists()) {
            if ($orderedPengurusIds !== []) {
                error_log('WaliKelasController guru_fan table missing; skip write');
            }
            return;
        }

        $del = $this->db->prepare('DELETE FROM lembaga___wali_kelas_guru_fan WHERE id_wali_kelas = ?');
        $del->execute([$idWaliKelas]);
        if ($orderedPengurusIds === []) {
            return;
        }
        $ins = $this->db->prepare('INSERT INTO lembaga___wali_kelas_guru_fan (id_wali_kelas, id_pengurus, urutan) VALUES (?, ?, ?)');
        foreach ($orderedPengurusIds as $i => $pid) {
            $ins->execute([$idWaliKelas, $pid, $i]);
        }
    }

    /**
     * @param int[] $fanIds
     *
     * @throws \InvalidArgumentException
     */
    private function replaceGuruFanRows(int $idWaliKelas, int $idKelasRombel, array $fanIds, ?int $idPengurusWali): void
    {
        $ordered = $this->normalizeFanPengurusIds($idKelasRombel, $fanIds, $idPengurusWali);
        $this->writeGuruFanRows($idWaliKelas, $ordered);
    }

    /**
     * GET /api/wali-kelas - List wali kelas (filter: id_kelas, status, tahun_ajaran)
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idKelas = isset($params['id_kelas']) ? (int) $params['id_kelas'] : null;
            $status = $params['status'] ?? null;
            $tahunAjaran = $params['tahun_ajaran'] ?? null;

            $sql = "SELECT w.*, 
                    p.nama AS wali_nama,
                    sk.nama AS ketua_nama, sw.nama AS wakil_nama, 
                    ss.nama AS sekretaris_nama, sb.nama AS bendahara_nama
                    FROM lembaga___wali_kelas w
                    LEFT JOIN pengurus p ON p.id = w.id_pengurus
                    LEFT JOIN santri sk ON sk.id = w.id_ketua
                    LEFT JOIN santri sw ON sw.id = w.id_wakil
                    LEFT JOIN santri ss ON ss.id = w.id_sekretaris
                    LEFT JOIN santri sb ON sb.id = w.id_bendahara
                    WHERE 1=1";
            $bind = [];
            if ($idKelas !== null && $idKelas > 0) {
                $sql .= " AND w.id_kelas = ?";
                $bind[] = $idKelas;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND w.status = ?";
                $bind[] = $status;
            }
            if ($tahunAjaran !== null && $tahunAjaran !== '') {
                $sql .= " AND w.tahun_ajaran = ?";
                $bind[] = $tahunAjaran;
            }
            $sql .= " ORDER BY w.id_kelas, w.tahun_ajaran DESC, w.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $rows = $this->attachGuruFan($rows);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data wali kelas',
                'error' => null
            ], 500);
        }
    }

    /**
     * GET /api/wali-kelas/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("
                SELECT w.*, 
                p.nama AS wali_nama,
                sk.nama AS ketua_nama, sw.nama AS wakil_nama, 
                ss.nama AS sekretaris_nama, sb.nama AS bendahara_nama,
                r.lembaga_id, r.kelas AS kelas_nama, r.kel
                FROM lembaga___wali_kelas w
                LEFT JOIN lembaga___rombel r ON r.id = w.id_kelas
                LEFT JOIN pengurus p ON p.id = w.id_pengurus
                LEFT JOIN santri sk ON sk.id = w.id_ketua
                LEFT JOIN santri sw ON sw.id = w.id_wakil
                LEFT JOIN santri ss ON ss.id = w.id_sekretaris
                LEFT JOIN santri sb ON sb.id = w.id_bendahara
                WHERE w.id = ?
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }
            $row['guru_fan'] = $this->fetchGuruFanForWali((int) $row['id']);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data wali kelas',
                'error' => null
            ], 500);
        }
    }

    /**
     * POST /api/wali-kelas - Create (riwayat tidak dihapus)
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            if (empty($data['id_kelas'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kelas (rombel) wajib diisi'
                ], 400);
            }

            $idKelas = (int) $data['id_kelas'];
            $idPengurus = isset($data['id_pengurus']) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idKetua = isset($data['id_ketua']) && $data['id_ketua'] !== '' ? (int) $data['id_ketua'] : null;
            $idWakil = isset($data['id_wakil']) && $data['id_wakil'] !== '' ? (int) $data['id_wakil'] : null;
            $idSekretaris = isset($data['id_sekretaris']) && $data['id_sekretaris'] !== '' ? (int) $data['id_sekretaris'] : null;
            $idBendahara = isset($data['id_bendahara']) && $data['id_bendahara'] !== '' ? (int) $data['id_bendahara'] : null;
            $tahunAjaran = TextSanitizer::cleanTextOrNull($data['tahun_ajaran'] ?? null);
            $gedung = TextSanitizer::cleanTextOrNull($data['gedung'] ?? null);
            $ruang = TextSanitizer::cleanTextOrNull($data['ruang'] ?? null);
            $fanIds = $this->parseIdPengurusFanList($data['id_pengurus_fan'] ?? $data['idPengurusFan'] ?? null);
            try {
                $orderedFan = $this->normalizeFanPengurusIds($idKelas, $fanIds, $idPengurus);
            } catch (\InvalidArgumentException $e) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $e->getMessage(),
                ], 400);
            }

            // Wali baru selalu aktif; yang lama untuk rombel yang sama otomatis jadi nonaktif
            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmtDeactivate = $this->db->prepare("UPDATE lembaga___wali_kelas SET status = 'nonaktif' WHERE id_kelas = ?");
            $stmtDeactivate->execute([$idKelas]);

            $stmt = $this->db->prepare("
                INSERT INTO lembaga___wali_kelas 
                (id_kelas, id_pengurus, id_ketua, id_wakil, id_sekretaris, id_bendahara, tahun_ajaran, gedung, ruang, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?)
            ");
            $stmt->execute([
                $idKelas, $idPengurus, $idKetua, $idWakil, $idSekretaris, $idBendahara,
                $tahunAjaran, $gedung, $ruang, $waktu
            ]);
            $newId = (int) $this->db->lastInsertId();
            try {
                $this->writeGuruFanRows($newId, $orderedFan);
            } catch (\Throwable $e) {
                error_log('WaliKelasController create guru_fan: ' . $e->getMessage());
            }

            $newRow = [
                'id' => $newId,
                'id_kelas' => $idKelas,
                'id_pengurus' => $idPengurus,
                'id_ketua' => $idKetua,
                'id_wakil' => $idWakil,
                'id_sekretaris' => $idSekretaris,
                'id_bendahara' => $idBendahara,
                'tahun_ajaran' => $tahunAjaran,
                'gedung' => $gedung,
                'ruang' => $ruang,
                'status' => 'aktif',
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'lembaga___wali_kelas', (string) $newId, null, $newRow, $request);
            }
            $newRow['guru_fan'] = $this->fetchGuruFanForWali($newId);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Wali kelas berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("WaliKelasController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan wali kelas',
                'error' => null
            ], 500);
        }
    }

    /**
     * PUT /api/wali-kelas/{id} - Update
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $bodyContents = $request->getBody()->getContents();
                $data = (!empty($bodyContents) && json_decode($bodyContents, true) !== null)
                    ? (array) json_decode($bodyContents, true)
                    : [];
            }
            $idKelas = isset($data['id_kelas']) ? (int) $data['id_kelas'] : (int) $old['id_kelas'];
            $idPengurus = array_key_exists('id_pengurus', $data) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idKetua = array_key_exists('id_ketua', $data) && $data['id_ketua'] !== '' ? (int) $data['id_ketua'] : null;
            $idWakil = array_key_exists('id_wakil', $data) && $data['id_wakil'] !== '' ? (int) $data['id_wakil'] : null;
            $idSekretaris = array_key_exists('id_sekretaris', $data) && $data['id_sekretaris'] !== '' ? (int) $data['id_sekretaris'] : null;
            $idBendahara = array_key_exists('id_bendahara', $data) && $data['id_bendahara'] !== '' ? (int) $data['id_bendahara'] : null;
            $tahunAjaranSent = array_key_exists('tahun_ajaran', $data) || array_key_exists('tahunAjaran', $data);
            $tahunAjaranVal = $data['tahun_ajaran'] ?? $data['tahunAjaran'] ?? '';
            $tahunAjaran = $tahunAjaranSent
                ? (TextSanitizer::cleanText((string) $tahunAjaranVal) ?: null)
                : $old['tahun_ajaran'];
            $gedung = array_key_exists('gedung', $data) ? TextSanitizer::cleanTextOrNull($data['gedung']) : $old['gedung'];
            $ruang = array_key_exists('ruang', $data) ? TextSanitizer::cleanTextOrNull($data['ruang']) : $old['ruang'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];

            $stmt = $this->db->prepare("
                UPDATE lembaga___wali_kelas 
                SET id_kelas = ?, id_pengurus = ?, id_ketua = ?, id_wakil = ?, id_sekretaris = ?, id_bendahara = ?,
                    tahun_ajaran = ?, gedung = ?, ruang = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $idKelas, $idPengurus, $idKetua, $idWakil, $idSekretaris, $idBendahara,
                $tahunAjaran, $gedung, $ruang, $status, $id
            ]);

            $fanSent = array_key_exists('id_pengurus_fan', $data) || array_key_exists('idPengurusFan', $data);
            if ($fanSent) {
                $fanIds = $this->parseIdPengurusFanList($data['id_pengurus_fan'] ?? $data['idPengurusFan'] ?? null);
                try {
                    $this->replaceGuruFanRows($id, $idKelas, $fanIds, $idPengurus);
                } catch (\InvalidArgumentException $e) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => $e->getMessage(),
                    ], 400);
                }
            }

            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($new) {
                $new['guru_fan'] = $this->fetchGuruFanForWali((int) $id);
            }
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___wali_kelas', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Wali kelas berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate wali kelas',
                'error' => null
            ], 500);
        }
    }

    /**
     * PATCH /api/wali-kelas/{id}/status - Set status (aktif / nonaktif)
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wali kelas tidak valid'
                ], 400);
            }

            $data = $request->getParsedBody();
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : null;
            if ($status === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus aktif atau nonaktif'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Wali kelas tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE lembaga___wali_kelas SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM lembaga___wali_kelas WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga___wali_kelas', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Wali kelas diaktifkan' : 'Wali kelas dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("WaliKelasController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status wali kelas',
                'error' => null
            ], 500);
        }
    }
}
