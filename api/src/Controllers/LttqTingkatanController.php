<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\SantriLttqHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class LttqTingkatanController
{
    private const FITUR_TINGKATAN_BERTUGAS = 'action.lttq.tingkatan.tingkatan_bertugas';

    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array<string, mixed> */
    private function userPayload(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    /** @param array<string, mixed> $user */
    private function isSuperAdminToken(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    /** @param array<string, mixed> $user */
    private function mustApplyTingkatanBertugasFilter(array $user): bool
    {
        if ($this->isSuperAdminToken($user)) {
            return false;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.lttq.tingkatan.tambah')) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, self::FITUR_TINGKATAN_BERTUGAS);
    }

    private function pengurusAmpuTingkatan(int $pengurusId, int $tingkatanId): bool
    {
        try {
            $stmt = $this->db->prepare('
                SELECT 1 FROM lttq___mualim m
                WHERE m.id_lttq_tingkatan = ? AND m.status = \'aktif\'
                  AND (m.id_pengurus = ? OR m.id_santri IN (
                    SELECT s.id FROM santri s INNER JOIN pengurus p ON p.id = ?
                    WHERE s.id = m.id_santri
                  ))
                LIMIT 1
            ');
            $stmt->execute([$tingkatanId, $pengurusId, $pengurusId]);

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $stmt = $this->db->prepare('
                SELECT 1 FROM lttq___mualim m
                WHERE m.id_lttq_tingkatan = ? AND m.status = \'aktif\' AND m.id_pengurus = ?
                LIMIT 1
            ');
            $stmt->execute([$tingkatanId, $pengurusId]);

            return (bool) $stmt->fetchColumn();
        }
    }

    /** @param array<string, mixed> $user */
    private function denyMasterMutationsForBertugas(Request $request, Response $response): ?Response
    {
        if ($this->mustApplyTingkatanBertugasFilter($this->userPayload($request))) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Akses tingkatan bertugas: tidak dapat mengubah master tingkatan',
            ], 403);
        }

        return null;
    }

    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
            $status = $params['status'] ?? null;
            $tingkatan = isset($params['tingkatan']) ? trim((string) $params['tingkatan']) : null;
            $search = isset($params['search']) ? trim((string) $params['search']) : null;
            $page = isset($params['page']) ? max(1, (int) $params['page']) : 1;
            $limit = isset($params['limit']) ? max(1, min(500, (int) $params['limit'])) : 50;
            $offset = ($page - 1) * $limit;

            $where = ' WHERE 1=1';
            $bind = [];
            if ($lembagaId !== '') {
                $where .= ' AND t.lembaga_id = ?';
                $bind[] = $lembagaId;
            }
            if ($status !== null && $status !== '') {
                $where .= ' AND t.status = ?';
                $bind[] = $status;
            }
            if ($tingkatan !== null && $tingkatan !== '') {
                $where .= ' AND TRIM(COALESCE(t.tingkatan, \'\')) = ?';
                $bind[] = $tingkatan;
            }
            if ($search !== null && $search !== '') {
                $where .= ' AND (t.tingkatan LIKE ? OR t.kelompok LIKE ? OR t.keterangan LIKE ? OR l.nama LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
            }

            $user = $this->userPayload($request);
            if ($this->mustApplyTingkatanBertugasFilter($user)) {
                $pid = RoleHelper::getPengurusIdFromPayload($user);
                if ($pid === null || $pid <= 0) {
                    $where .= ' AND 1=0';
                } else {
                    $where .= ' AND t.id IN (
                        SELECT m.id_lttq_tingkatan FROM lttq___mualim m
                        WHERE m.status = \'aktif\' AND m.id_pengurus = ?
                    )';
                    $bind[] = $pid;
                }
            }

            $baseSql = 'FROM lttq_tingkatan t LEFT JOIN lembaga l ON l.id = t.lembaga_id ' . $where;
            $stmt = $this->db->prepare('SELECT COUNT(*) AS total ' . $baseSql);
            $stmt->execute($bind);
            $total = (int) $stmt->fetch(\PDO::FETCH_ASSOC)['total'];

            $sql = "SELECT t.*, l.nama AS lembaga_nama,
                (SELECT COALESCE(p.nama, s.nama) FROM lttq___mualim m
                 LEFT JOIN pengurus p ON p.id = m.id_pengurus
                 LEFT JOIN santri s ON s.id = m.id_santri
                 WHERE m.id_lttq_tingkatan = t.id AND m.status = 'aktif'
                 ORDER BY m.id DESC LIMIT 1) AS mualim_aktif_nama,
                (SELECT COUNT(*) FROM santri s WHERE s.id_lttq_tingkatan = t.id) AS jumlah_santri
                $baseSql
                ORDER BY t.lembaga_id, t.tingkatan, t.kelompok
                LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset;
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
            error_log('LttqTingkatanController getAll: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data tingkatan LTTQ'], 500);
        }
    }

    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT t.*, l.nama AS lembaga_nama FROM lttq_tingkatan t LEFT JOIN lembaga l ON l.id = t.lembaga_id WHERE t.id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tingkatan tidak ditemukan'], 404);
            }
            $user = $this->userPayload($request);
            if ($this->mustApplyTingkatanBertugasFilter($user)) {
                $pid = RoleHelper::getPengurusIdFromPayload($user);
                if ($pid === null || $pid <= 0 || !$this->pengurusAmpuTingkatan((int) $pid, $id)) {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Tingkatan tidak ditemukan'], 404);
                }
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('LttqTingkatanController getById: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil data tingkatan'], 500);
        }
    }

    public function create(Request $request, Response $response): Response
    {
        try {
            $deny = $this->denyMasterMutationsForBertugas($request, $response);
            if ($deny !== null) {
                return $deny;
            }
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            $lembagaId = isset($data['lembaga_id']) ? trim((string) $data['lembaga_id']) : 'LTTQ';
            if ($lembagaId === '') {
                $lembagaId = 'LTTQ';
            }
            $tingkatan = isset($data['tingkatan']) ? TextSanitizer::cleanText((string) $data['tingkatan']) : '';
            $kelompok = isset($data['kelompok']) ? TextSanitizer::cleanText((string) $data['kelompok']) : '';
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true) ? $data['status'] : 'aktif';

            $stmt = $this->db->prepare('
                SELECT id FROM lttq_tingkatan
                WHERE lembaga_id = ? AND COALESCE(TRIM(tingkatan), \'\') = ? AND COALESCE(TRIM(kelompok), \'\') = ?
                LIMIT 1
            ');
            $stmt->execute([$lembagaId, $tingkatan, $kelompok]);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($existing) {
                $id = (int) $existing['id'];
                $this->db->prepare('UPDATE lttq_tingkatan SET status = \'aktif\', keterangan = COALESCE(?, keterangan) WHERE id = ?')
                    ->execute([$keterangan, $id]);
                $stmt = $this->db->prepare('SELECT * FROM lttq_tingkatan WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Tingkatan sudah ada, status diaktifkan kembali',
                    'data' => $row,
                ], 200);
            }

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $this->db->prepare('
                INSERT INTO lttq_tingkatan (lembaga_id, tingkatan, kelompok, keterangan, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?)
            ')->execute([$lembagaId, $tingkatan, $kelompok, $keterangan, $status, $waktu]);
            $newId = (int) $this->db->lastInsertId();
            $stmt = $this->db->prepare('SELECT * FROM lttq_tingkatan WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tingkatan berhasil ditambahkan',
                'data' => $row,
            ], 201);
        } catch (\Exception $e) {
            error_log('LttqTingkatanController create: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambahkan tingkatan'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $deny = $this->denyMasterMutationsForBertugas($request, $response);
            if ($deny !== null) {
                return $deny;
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT * FROM lttq_tingkatan WHERE id = ?');
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tingkatan tidak ditemukan'], 404);
            }
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            $lembagaId = $data['lembaga_id'] ?? $old['lembaga_id'];
            $tingkatan = isset($data['tingkatan']) ? TextSanitizer::cleanText((string) $data['tingkatan']) : ($old['tingkatan'] ?? '');
            $kelompok = isset($data['kelompok']) ? TextSanitizer::cleanText((string) ($data['kelompok'] ?? '')) : ($old['kelompok'] ?? '');
            $keterangan = array_key_exists('keterangan', $data) ? TextSanitizer::cleanTextOrNull($data['keterangan']) : ($old['keterangan'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true) ? $data['status'] : $old['status'];

            $this->db->prepare('
                UPDATE lttq_tingkatan SET lembaga_id = ?, tingkatan = ?, kelompok = ?, keterangan = ?, status = ? WHERE id = ?
            ')->execute([$lembagaId, $tingkatan, $kelompok, $keterangan, $status, $id]);
            $stmt = $this->db->prepare('SELECT * FROM lttq_tingkatan WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Tingkatan berhasil diupdate', 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('LttqTingkatanController update: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengupdate tingkatan'], 500);
        }
    }

    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $deny = $this->denyMasterMutationsForBertugas($request, $response);
            if ($deny !== null) {
                return $deny;
            }
            $id = (int) ($args['id'] ?? 0);
            $data = $request->getParsedBody();
            $status = is_array($data) && isset($data['status']) ? $data['status'] : null;
            if ($id <= 0 || !in_array($status, ['aktif', 'nonaktif'], true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
            }
            $this->db->prepare('UPDATE lttq_tingkatan SET status = ? WHERE id = ?')->execute([$status, $id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Status tingkatan diperbarui'], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengubah status'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $deny = $this->denyMasterMutationsForBertugas($request, $response);
            if ($deny !== null) {
                return $deny;
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $this->db->prepare('UPDATE lttq_tingkatan SET status = \'nonaktif\' WHERE id = ?')->execute([$id]);

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Tingkatan dinonaktifkan'], 200);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus tingkatan'], 500);
        }
    }

    /**
     * POST /api/lttq-tingkatan/lulus
     * Body: { id_lttq_tingkatan, tahun_ajaran, id_santri_list[] }
     * Catat riwayat LTTQ lalu kosongkan penempatan aktif (id_lttq_tingkatan = null).
     */
    public function lulusBulk(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody() ?? [];
            $idTingkatan = isset($body['id_lttq_tingkatan']) ? (int) $body['id_lttq_tingkatan'] : 0;
            $tahunAjaran = isset($body['tahun_ajaran']) ? trim((string) $body['tahun_ajaran']) : '';
            $idSantriList = isset($body['id_santri_list']) && is_array($body['id_santri_list'])
                ? array_values(array_unique(array_filter(array_map('intval', $body['id_santri_list']), static fn ($id) => $id > 0)))
                : [];

            if ($idTingkatan <= 0 || $tahunAjaran === '' || count($idSantriList) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_lttq_tingkatan, tahun_ajaran, dan id_santri_list (min 1) wajib diisi',
                ], 400);
            }

            $idPengurus = $this->resolveIdPengurusFromRequest($request, $body);
            if ($idPengurus <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_pengurus wajib diisi saat meluluskan santri (login sebagai pengurus).',
                ], 400);
            }

            $this->db->beginTransaction();
            $ok = 0;
            $stmtCheck = $this->db->prepare('SELECT id, nis FROM santri WHERE id = ? AND id_lttq_tingkatan = ?');
            $stmtClear = $this->db->prepare('UPDATE santri SET id_lttq_tingkatan = NULL WHERE id = ? AND id_lttq_tingkatan = ?');

            foreach ($idSantriList as $idSantri) {
                $stmtCheck->execute([$idSantri, $idTingkatan]);
                $row = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    continue;
                }
                $nim = isset($row['nis']) ? trim((string) $row['nis']) : null;
                SantriLttqHelper::appendLttqRiwayat($this->db, $idSantri, $idTingkatan, $tahunAjaran, $idPengurus, $nim ?: null);
                $stmtClear->execute([$idSantri, $idTingkatan]);
                if ($stmtClear->rowCount() > 0) {
                    $ok++;
                }
            }

            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $ok > 0 ? "{$ok} santri berhasil diluluskan dari tingkatan ini" : 'Tidak ada santri yang diproses',
                'data' => ['processed' => $ok],
            ], 200);
        } catch (\InvalidArgumentException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            return $this->jsonResponse($response, ['success' => false, 'message' => $e->getMessage()], 400);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('LttqTingkatanController lulusBulk: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal meluluskan santri'], 500);
        }
    }

    /** @param array<string, mixed> $body */
    private function resolveIdPengurusFromRequest(Request $request, array $body): int
    {
        if (isset($body['id_pengurus']) && $body['id_pengurus'] !== '' && $body['id_pengurus'] !== null) {
            return (int) $body['id_pengurus'];
        }
        $user = $this->userPayload($request);
        if (isset($user['id_pengurus']) && (int) $user['id_pengurus'] > 0) {
            return (int) $user['id_pengurus'];
        }
        $uid = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : 0);
        if ($uid <= 0) {
            return 0;
        }
        $st = $this->db->prepare('SELECT id FROM pengurus WHERE id = ? LIMIT 1');
        $st->execute([$uid]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }
        $st = $this->db->prepare('SELECT id FROM pengurus WHERE id_user = ? LIMIT 1');
        $st->execute([$uid]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);

        return $row ? (int) $row['id'] : 0;
    }
}
