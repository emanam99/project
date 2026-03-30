<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class HariPentingController
{
    private $db;

    /** @var bool|null */
    private $hariPentingTargetTableExistsCache = null;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function hariPentingTargetTableExists(): bool
    {
        if ($this->hariPentingTargetTableExistsCache !== null) {
            return $this->hariPentingTargetTableExistsCache;
        }
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'psa___hari_penting_target'");
            $this->hariPentingTargetTableExistsCache = $stmt && $stmt->fetch(\PDO::FETCH_NUM) !== false;
        } catch (\Throwable $e) {
            $this->hariPentingTargetTableExistsCache = false;
        }

        return $this->hariPentingTargetTableExistsCache;
    }

    private static function isValidYmd(?string $s): bool
    {
        return $s !== null && $s !== '' && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $s);
    }

    /** Normalisasi ke H:i:s untuk kolom TIME, atau null jika kosong / tidak valid. */
    private static function normalizeTime(?string $s): ?string
    {
        if ($s === null) {
            return null;
        }
        $s = trim((string) $s);
        if ($s === '') {
            return null;
        }
        if (!preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
            return null;
        }
        $h = (int) $m[1];
        $i = (int) $m[2];
        $sec = isset($m[3]) ? (int) $m[3] : 0;
        if ($h < 0 || $h > 23 || $i < 0 || $i > 59 || $sec < 0 || $sec > 59) {
            return null;
        }

        return sprintf('%02d:%02d:%02d', $h, $i, $sec);
    }

    private function skipTargetFilter(?array $user): bool
    {
        if ($user === null) {
            return false;
        }

        return RoleHelper::tokenHasAnyRoleKey($user, ['super_admin', 'admin_kalender']);
    }

    private function resolveUsersIdForTargets(?array $user): ?int
    {
        if ($user === null || !is_array($user)) {
            return null;
        }
        if (isset($user['users_id']) && (int) $user['users_id'] > 0) {
            return (int) $user['users_id'];
        }
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid !== null && $pid > 0) {
            try {
                $stmt = $this->db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
                $stmt->execute([$pid]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && !empty($row['id_user'])) {
                    return (int) $row['id_user'];
                }
            } catch (\Throwable $e) {
            }
        }

        return null;
    }

    /**
     * Lembaga untuk cocokkan target hari penting: hanya dari jabatan aktif pengurus di DB.
     * Tidak memakai lembaga_scope_all / lembaga_ids di JWT — itu cakupan akses menu/role,
     * bukan keanggotaan; kalau dipakai, admin/staf dengan scope lebar akan melihat semua marker lembaga.
     *
     * @return string[]
     */
    private function resolveLembagaIdsForTargets(?array $user): array
    {
        if ($user === null || !is_array($user)) {
            return [];
        }
        $ids = [];
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid !== null && $pid > 0) {
            try {
                $stmt = $this->db->prepare(
                    'SELECT DISTINCT lembaga_id FROM pengurus___jabatan WHERE pengurus_id = ? AND lembaga_id IS NOT NULL AND TRIM(lembaga_id) <> \'\' AND (status IS NULL OR TRIM(COALESCE(status, \'\')) = \'\' OR LOWER(TRIM(status)) = \'aktif\')'
                );
                $stmt->execute([$pid]);
                foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                    $s = trim((string) ($r['lembaga_id'] ?? ''));
                    if ($s !== '') {
                        $ids[$s] = true;
                    }
                }
            } catch (\Throwable $e) {
            }
        }

        return array_keys($ids);
    }

    private function hariPentingActorBypassesTargetPolicy(?array $user): bool
    {
        return $user !== null && RoleHelper::tokenHasAnyRoleKey($user, ['super_admin', 'admin_kalender']);
    }

    private function tokenHasHariPentingAction(?array $user, string $code): bool
    {
        if ($user === null || !is_array($user)) {
            return false;
        }
        try {
            return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, $code);
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Lembaga dari jabatan aktif pengurus yang terikat users.id.
     *
     * @return list<string>
     */
    private function lembagaIdsForUsersId(int $usersId): array
    {
        if ($usersId <= 0) {
            return [];
        }
        try {
            $stmt = $this->db->prepare(
                'SELECT DISTINCT TRIM(pj.lembaga_id) AS lid
                FROM pengurus p
                INNER JOIN pengurus___jabatan pj ON pj.pengurus_id = p.id
                    AND pj.lembaga_id IS NOT NULL AND TRIM(pj.lembaga_id) <> \'\'
                    AND (pj.status IS NULL OR TRIM(COALESCE(pj.status, \'\')) = \'\' OR LOWER(TRIM(pj.status)) = \'aktif\')
                WHERE p.id_user = ?'
            );
            $stmt->execute([$usersId]);
            $out = [];
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $s = trim((string) ($r['lid'] ?? ''));
                if ($s !== '') {
                    $out[$s] = true;
                }
            }

            return array_keys($out);
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function userSharesLembagaWithActor(int $targetUsersId, array $actorLembagaIds): bool
    {
        if ($targetUsersId <= 0 || $actorLembagaIds === []) {
            return false;
        }
        $targetLem = $this->lembagaIdsForUsersId($targetUsersId);
        if ($targetLem === []) {
            return false;
        }
        $actorSet = array_fill_keys($actorLembagaIds, true);
        foreach ($targetLem as $lid) {
            if (isset($actorSet[$lid])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<string> $tlNorm
     * @param list<int>    $tuNorm
     */
    private function validateHariPentingTargetPolicy(?array $user, bool $targetGlobal, array $tlNorm, array $tuNorm): ?string
    {
        if ($this->hariPentingActorBypassesTargetPolicy($user)) {
            return null;
        }
        if ($targetGlobal) {
            if (!$this->tokenHasHariPentingAction($user, 'action.hari_penting.target.global')) {
                return 'Tidak punya izin menetapkan audiens global untuk hari penting';
            }

            return null;
        }
        $actorLem = $this->resolveLembagaIdsForTargets($user);
        $actorUsersId = $this->resolveUsersIdForTargets($user);

        if (count($tlNorm) > 0) {
            if (!$this->tokenHasHariPentingAction($user, 'action.hari_penting.target.lembaga')) {
                return 'Tidak punya izin menarget lembaga untuk hari penting';
            }
            if ($actorLem === []) {
                return 'Akun tidak punya jabatan lembaga aktif untuk menarget lembaga';
            }
            foreach ($tlNorm as $lid) {
                if (!in_array($lid, $actorLem, true)) {
                    return 'Salah satu lembaga target di luar jabatan aktif Anda';
                }
            }
        }

        if (count($tuNorm) > 0) {
            $onlySelf = count($tuNorm) === 1 && count($tlNorm) === 0
                && $actorUsersId !== null && (int) $tuNorm[0] === (int) $actorUsersId;
            if ($onlySelf) {
                if (!$this->tokenHasHariPentingAction($user, 'action.hari_penting.target.self')) {
                    return 'Tidak punya izin menarget hanya diri sendiri';
                }
            } else {
                if (!$this->tokenHasHariPentingAction($user, 'action.hari_penting.target.user_selembaga')) {
                    return 'Tidak punya izin menarget pengguna lain untuk hari penting';
                }
                if ($actorLem === []) {
                    return 'Akun tidak punya jabatan lembaga aktif untuk menarget pengguna selembaga';
                }
                foreach ($tuNorm as $uid) {
                    if ((int) $uid === (int) ($actorUsersId ?? 0)) {
                        continue;
                    }
                    if (!$this->userSharesLembagaWithActor((int) $uid, $actorLem)) {
                        return 'Setiap pengguna target harus punya jabatan di salah satu lembaga yang sama dengan Anda';
                    }
                }
            }
        }

        return null;
    }

    /**
     * GET /api/hari-penting - list (publik + filter target jika ada token opsional)
     * Query: include_targets=1 — lampirkan baris target (hanya admin_kalender / super_admin).
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : null;

            $filters = [];
            $bind = [];

            if (isset($params['tipe'])) {
                $filters[] = 'hp.tipe = ?';
                $bind[] = $params['tipe'];
            }

            if (isset($params['tahun']) && isset($params['bulan'])) {
                $tahun = (int) $params['tahun'];
                $bulan = (int) $params['bulan'];
                $monthStart = sprintf('%04d-%02d-01', $tahun, $bulan);
                $lastDay = (int) date('t', strtotime($monthStart . ' 12:00:00'));
                $monthEnd = sprintf('%04d-%02d-%02d', $tahun, $bulan, $lastDay);
                $hijriStart = sprintf('%04d-%02d-01', $tahun, $bulan);
                $hijriEnd = sprintf('%04d-%02d-30', $tahun, $bulan);
                $filters[] = '(((hp.tipe IS NULL OR hp.tipe <> ?) AND hp.bulan = ? AND (hp.tahun = ? OR hp.tahun IS NULL)) OR (hp.tipe = ? AND hp.kategori = ? AND hp.tanggal_dari IS NOT NULL AND hp.tanggal_sampai IS NOT NULL AND hp.tanggal_dari <= ? AND hp.tanggal_sampai >= ?) OR (hp.tipe = ? AND hp.kategori = ? AND hp.tanggal_dari IS NOT NULL AND hp.tanggal_sampai IS NOT NULL AND hp.tanggal_dari <= ? AND hp.tanggal_sampai >= ?))';
                $bind[] = 'dari_sampai';
                $bind[] = $bulan;
                $bind[] = $tahun;
                $bind[] = 'dari_sampai';
                $bind[] = 'masehi';
                $bind[] = $monthEnd;
                $bind[] = $monthStart;
                $bind[] = 'dari_sampai';
                $bind[] = 'hijriyah';
                $bind[] = $hijriEnd;
                $bind[] = $hijriStart;
            } else {
                if (isset($params['tahun'])) {
                    $filters[] = 'hp.tahun = ?';
                    $bind[] = $params['tahun'];
                }
                if (isset($params['bulan'])) {
                    $filters[] = 'hp.bulan = ?';
                    $bind[] = $params['bulan'];
                }
            }
            if (isset($params['tanggal'])) {
                $filters[] = 'hp.tanggal = ?';
                $bind[] = $params['tanggal'];
            }
            if (isset($params['hari_pekan'])) {
                $filters[] = 'hp.hari_pekan = ?';
                $bind[] = $params['hari_pekan'];
            }

            $wantTargets = isset($params['include_targets']) && ($params['include_targets'] === '1' || $params['include_targets'] === 'true');
            // Kalender (GET tanpa include_targets) selalu filter target — termasuk admin_kalender,
            // agar penanda hanya untuk audiens yang benar. Lewati filter hanya saat pengaturan meminta daftar penuh + baris target.
            $skipSqlTargetFilter = $this->skipTargetFilter($userArr) && $wantTargets;
            $targetTableOk = $this->hariPentingTargetTableExists();
            if ($targetTableOk && !$skipSqlTargetFilter) {
                if ($userArr === null) {
                    $filters[] = 'NOT EXISTS (SELECT 1 FROM psa___hari_penting_target xt WHERE xt.id_hari_penting = hp.id)';
                } else {
                    $usersId = $this->resolveUsersIdForTargets($userArr);
                    $lembagaIds = $this->resolveLembagaIdsForTargets($userArr);
                    $parts = ['NOT EXISTS (SELECT 1 FROM psa___hari_penting_target xt WHERE xt.id_hari_penting = hp.id)'];
                    if ($usersId !== null) {
                        $parts[] = 'EXISTS (SELECT 1 FROM psa___hari_penting_target ut WHERE ut.id_hari_penting = hp.id AND ut.id_user = ?)';
                        $bind[] = $usersId;
                    }
                    if (count($lembagaIds) > 0) {
                        $ph = implode(',', array_fill(0, count($lembagaIds), '?'));
                        $parts[] = "EXISTS (SELECT 1 FROM psa___hari_penting_target lt WHERE lt.id_hari_penting = hp.id AND lt.id_lembaga IN ($ph))";
                        foreach ($lembagaIds as $lid) {
                            $bind[] = $lid;
                        }
                    }
                    $filters[] = '(' . implode(' OR ', $parts) . ')';
                }
            }

            $sql = 'SELECT hp.* FROM psa___hari_penting hp';
            if (count($filters) > 0) {
                $sql .= ' WHERE ' . implode(' AND ', $filters);
            }
            $sql .= ' ORDER BY hp.id DESC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            if ($wantTargets && $targetTableOk && $this->skipTargetFilter($userArr) && count($rows) > 0) {
                try {
                    $this->attachTargetsToRows($rows);
                } catch (\Throwable $e) {
                    error_log('HariPenting attachTargets: ' . $e->getMessage());
                }
            }

            return $this->json($response, $rows);
        } catch (\Throwable $e) {
            error_log('HariPenting getList error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     */
    private function attachTargetsToRows(array &$rows): void
    {
        $ids = [];
        foreach ($rows as $r) {
            if (!empty($r['id'])) {
                $ids[(int) $r['id']] = true;
            }
        }
        $idList = array_keys($ids);
        if ($idList === []) {
            return;
        }
        $ph = implode(',', array_fill(0, count($idList), '?'));
        $sql = "SELECT t.id_hari_penting, t.id_lembaga, t.id_user, l.nama AS lembaga_nama,
            COALESCE(NULLIF(TRIM(p.nama), ''), NULLIF(TRIM(s.nama), ''), u.username) AS user_nama,
            u.username AS user_username
            FROM psa___hari_penting_target t
            LEFT JOIN lembaga l ON l.id = t.id_lembaga
            LEFT JOIN users u ON u.id = t.id_user
            LEFT JOIN pengurus p ON p.id_user = u.id
            LEFT JOIN santri s ON s.id_user = u.id
            WHERE t.id_hari_penting IN ($ph)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($idList);
        $trows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        $byHp = [];
        foreach ($trows as $t) {
            $hid = (int) ($t['id_hari_penting'] ?? 0);
            if ($hid <= 0) {
                continue;
            }
            if (!isset($byHp[$hid])) {
                $byHp[$hid] = [];
            }
            $byHp[$hid][] = [
                'id_lembaga' => $t['id_lembaga'] !== null && trim((string) $t['id_lembaga']) !== '' ? trim((string) $t['id_lembaga']) : null,
                'id_user' => $t['id_user'] !== null ? (int) $t['id_user'] : null,
                'lembaga_nama' => $t['lembaga_nama'] ?? null,
                'user_nama' => $t['user_nama'] ?? null,
                'user_username' => $t['user_username'] ?? null,
            ];
        }
        foreach ($rows as $i => $r) {
            $hid = (int) ($r['id'] ?? 0);
            $rows[$i]['targets'] = $byHp[$hid] ?? [];
        }
    }

    /**
     * GET /api/hari-penting/user-picker — admin_kalender (users terhubung pengurus).
     */
    public function getUserPicker(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $q = TextSanitizer::cleanText($params['search'] ?? '');
            $limit = min(50, max(1, (int) ($params['limit'] ?? 30)));

            $userAttr = $request->getAttribute('user');
            $userArr = is_array($userAttr) ? $userAttr : null;
            $actorLem = $this->resolveLembagaIdsForTargets($userArr);
            $restrictPicker = !$this->hariPentingActorBypassesTargetPolicy($userArr);

            $sql = 'SELECT DISTINCT u.id,
                COALESCE(NULLIF(TRIM(p.nama), \'\'), u.username) AS nama,
                u.username,
                p.nama AS pengurus_nama
                FROM users u
                INNER JOIN pengurus p ON p.id_user = u.id
                WHERE p.id_user IS NOT NULL';
            $bind = [];
            if ($restrictPicker) {
                if ($actorLem === []) {
                    return $this->json($response, ['data' => []]);
                }
                $ph = implode(',', array_fill(0, count($actorLem), '?'));
                $sql .= " AND EXISTS (
                    SELECT 1 FROM pengurus px
                    INNER JOIN pengurus___jabatan jx ON jx.pengurus_id = px.id
                        AND jx.lembaga_id IS NOT NULL AND TRIM(jx.lembaga_id) <> ''
                        AND (jx.status IS NULL OR TRIM(COALESCE(jx.status, '')) = '' OR LOWER(TRIM(jx.status)) = 'aktif')
                    WHERE px.id_user = u.id AND TRIM(jx.lembaga_id) IN ($ph)
                )";
                foreach ($actorLem as $lid) {
                    $bind[] = $lid;
                }
            }
            if ($q !== '') {
                $sql .= ' AND (p.nama LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.no_wa LIKE ?)';
                $term = '%' . $q . '%';
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
                $bind[] = $term;
            }
            $sql .= ' ORDER BY nama ASC LIMIT ' . $limit;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, ['data' => $data]);
        } catch (\Throwable $e) {
            error_log('HariPenting getUserPicker error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/hari-penting/lembaga-options — admin_kalender.
     */
    public function getLembagaOptions(Request $request, Response $response): Response
    {
        try {
            $userAttr = $request->getAttribute('user');
            $userArr = is_array($userAttr) ? $userAttr : null;
            if (!$this->hariPentingActorBypassesTargetPolicy($userArr)) {
                $ids = $this->resolveLembagaIdsForTargets($userArr);
                if ($ids === []) {
                    return $this->json($response, ['data' => []]);
                }
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $stmt = $this->db->prepare("SELECT id, nama FROM lembaga WHERE TRIM(id) IN ($ph) ORDER BY nama ASC");
                $stmt->execute($ids);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

                return $this->json($response, ['data' => $data]);
            }
            $stmt = $this->db->query('SELECT id, nama FROM lembaga ORDER BY nama ASC');
            $data = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];

            return $this->json($response, ['data' => $data]);
        } catch (\Exception $e) {
            error_log('HariPenting getLembagaOptions error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * @param array<string, mixed> $data
     */
    private function replaceTargets(int $hariPentingId, array $data): void
    {
        $this->db->prepare('DELETE FROM psa___hari_penting_target WHERE id_hari_penting = ?')->execute([$hariPentingId]);

        $lembaga = $data['target_lembaga_ids'] ?? [];
        $users = $data['target_user_ids'] ?? [];
        if (!is_array($lembaga)) {
            $lembaga = [];
        }
        if (!is_array($users)) {
            $users = [];
        }

        $ins = $this->db->prepare('INSERT INTO psa___hari_penting_target (id_hari_penting, id_lembaga, id_user) VALUES (?, ?, ?)');
        $chkL = $this->db->prepare('SELECT id FROM lembaga WHERE id = ? LIMIT 1');
        $chkU = $this->db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');

        foreach ($lembaga as $lid) {
            $lid = trim((string) $lid);
            if ($lid === '') {
                continue;
            }
            $chkL->execute([$lid]);
            if (!$chkL->fetch(\PDO::FETCH_ASSOC)) {
                continue;
            }
            $ins->execute([$hariPentingId, $lid, null]);
        }
        foreach ($users as $uid) {
            $uid = (int) $uid;
            if ($uid <= 0) {
                continue;
            }
            $chkU->execute([$uid]);
            if (!$chkU->fetch(\PDO::FETCH_ASSOC)) {
                continue;
            }
            $ins->execute([$hariPentingId, null, $uid]);
        }
    }

    /**
     * POST /api/hari-penting - create, update, or delete (admin_kalender only)
     */
    public function post(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                return $this->json($response, ['error' => 'Input harus JSON object'], 400);
            }
            if (!empty($data['delete']) && isset($data['id'])) {
                $old = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
                $old->execute([$data['id']]);
                $oldRow = $old->fetch(\PDO::FETCH_ASSOC);
                $stmt = $this->db->prepare('DELETE FROM psa___hari_penting WHERE id = ?');
                $stmt->execute([$data['id']]);
                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($oldRow && $pengurusId !== null) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'psa___hari_penting', $data['id'], $oldRow, null, $request);
                }
                return $this->json($response, ['message' => 'Hari penting berhasil dihapus']);
            }
            $nama_event = TextSanitizer::cleanText($data['nama_event'] ?? '');
            $kategori = $data['kategori'] ?? 'hijriyah';
            $tipe = $data['tipe'] ?? 'per_tahun';
            $hari_pekan = isset($data['hari_pekan']) ? (int) $data['hari_pekan'] : null;
            $tanggal = isset($data['tanggal']) ? (int) $data['tanggal'] : null;
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : null;
            $tahun = isset($data['tahun']) ? (int) $data['tahun'] : null;
            $tanggal_dari = isset($data['tanggal_dari']) ? trim((string) $data['tanggal_dari']) : null;
            $tanggal_sampai = isset($data['tanggal_sampai']) ? trim((string) $data['tanggal_sampai']) : null;
            if ($tanggal_dari === '') {
                $tanggal_dari = null;
            }
            if ($tanggal_sampai === '') {
                $tanggal_sampai = null;
            }
            if ($tipe === 'dari_sampai') {
                if (!self::isValidYmd($tanggal_dari) || !self::isValidYmd($tanggal_sampai)) {
                    return $this->json($response, ['error' => 'Tipe dari–sampai wajib tanggal_dari dan tanggal_sampai (format Y-m-d)'], 400);
                }
                if ($tanggal_dari > $tanggal_sampai) {
                    return $this->json($response, ['error' => 'tanggal_dari tidak boleh setelah tanggal_sampai'], 400);
                }
                $hari_pekan = null;
                $tanggal = null;
                $bulan = null;
                $tahun = null;
            } else {
                $tanggal_dari = null;
                $tanggal_sampai = null;
            }
            $warna_label = TextSanitizer::cleanTextOrNull($data['warna_label'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $aktif = isset($data['aktif']) ? (int) $data['aktif'] : 1;

            $jamMulai = self::normalizeTime(isset($data['jam_mulai']) ? (string) $data['jam_mulai'] : null);
            $jamSelesai = self::normalizeTime(isset($data['jam_selesai']) ? (string) $data['jam_selesai'] : null);
            if (($jamMulai === null) !== ($jamSelesai === null)) {
                return $this->json($response, ['error' => 'Jam: isi keduanya (mulai dan selesai) atau kosongkan keduanya'], 400);
            }
            if ($jamMulai !== null && $jamSelesai !== null && strcmp($jamMulai, $jamSelesai) > 0) {
                return $this->json($response, ['error' => 'jam_mulai tidak boleh setelah jam_selesai'], 400);
            }

            $tlRaw = $data['target_lembaga_ids'] ?? [];
            $tuRaw = $data['target_user_ids'] ?? [];
            $tlRaw = is_array($tlRaw) ? $tlRaw : [];
            $tuRaw = is_array($tuRaw) ? $tuRaw : [];
            $tlNorm = [];
            foreach ($tlRaw as $x) {
                $s = trim((string) $x);
                if ($s !== '') {
                    $tlNorm[] = $s;
                }
            }
            $tlNorm = array_values(array_unique($tlNorm));
            $tuNorm = [];
            foreach ($tuRaw as $x) {
                $u = (int) $x;
                if ($u > 0) {
                    $tuNorm[] = $u;
                }
            }
            $tuNorm = array_values(array_unique($tuNorm));

            if (!array_key_exists('target_global', $data) && !array_key_exists('target_lembaga_ids', $data) && !array_key_exists('target_user_ids', $data)) {
                $targetGlobal = true;
            } elseif (!empty($data['target_global'])) {
                $targetGlobal = true;
            } else {
                $targetGlobal = false;
                if (count($tlNorm) === 0 && count($tuNorm) === 0) {
                    return $this->json($response, ['error' => 'Target: pilih global, atau minimal satu lembaga / satu pengguna'], 400);
                }
            }

            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : null;
            $targetPolicyErr = $this->validateHariPentingTargetPolicy($userArr, $targetGlobal, $tlNorm, $tuNorm);
            if ($targetPolicyErr !== null) {
                return $this->json($response, ['error' => $targetPolicyErr], 403);
            }

            $pengurusId = is_array($user)
                ? (isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null))
                : null;
            if (isset($data['id']) && $data['id'] !== '' && $data['id'] !== null) {
                $oldStmt = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
                $oldStmt->execute([$data['id']]);
                $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC);
                $stmt = $this->db->prepare('UPDATE psa___hari_penting SET nama_event=?, kategori=?, tipe=?, hari_pekan=?, tanggal=?, bulan=?, tahun=?, tanggal_dari=?, tanggal_sampai=?, jam_mulai=?, jam_selesai=?, warna_label=?, keterangan=?, aktif=? WHERE id=?');
                $stmt->execute([$nama_event, $kategori, $tipe, $hari_pekan, $tanggal, $bulan, $tahun, $tanggal_dari, $tanggal_sampai, $jamMulai, $jamSelesai, $warna_label, $keterangan, $aktif, $data['id']]);
                $eventId = (int) $data['id'];
                if ($targetGlobal) {
                    $this->db->prepare('DELETE FROM psa___hari_penting_target WHERE id_hari_penting = ?')->execute([$eventId]);
                } else {
                    $this->replaceTargets($eventId, $data);
                }
                if ($pengurusId !== null) {
                    $newStmt = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
                    $newStmt->execute([$data['id']]);
                    $newRow = $newStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($oldRow && $newRow) {
                        UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'psa___hari_penting', $data['id'], $oldRow, $newRow, $request);
                    }
                }
                return $this->json($response, ['message' => 'Hari penting berhasil diupdate']);
            }
            $stmt = $this->db->prepare('INSERT INTO psa___hari_penting (nama_event, kategori, tipe, hari_pekan, tanggal, bulan, tahun, tanggal_dari, tanggal_sampai, jam_mulai, jam_selesai, warna_label, keterangan, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$nama_event, $kategori, $tipe, $hari_pekan, $tanggal, $bulan, $tahun, $tanggal_dari, $tanggal_sampai, $jamMulai, $jamSelesai, $warna_label, $keterangan, $aktif]);
            $newId = (int) $this->db->lastInsertId();
            if ($newId > 0) {
                if ($targetGlobal) {
                    $this->db->prepare('DELETE FROM psa___hari_penting_target WHERE id_hari_penting = ?')->execute([$newId]);
                } else {
                    $this->replaceTargets($newId, $data);
                }
            }
            if ($pengurusId !== null && $newId) {
                $newStmt = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
                $newStmt->execute([$newId]);
                $newRow = $newStmt->fetch(\PDO::FETCH_ASSOC);
                if ($newRow) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'psa___hari_penting', $newId, null, $newRow, $request);
                }
            }
            return $this->json($response, ['message' => 'Hari penting berhasil ditambah', 'id' => $newId]);
        } catch (\Exception $e) {
            error_log('HariPenting post error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/hari-penting/personal-self — tambah hari penting hanya untuk diri sendiri (users.id dari token).
     * Tanpa aksi admin kalender. Body sama seperti post (tanpa id/update); field target_* diabaikan.
     */
    public function postPersonalSelf(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data)) {
                return $this->json($response, ['error' => 'Input harus JSON object'], 400);
            }
            if (!empty($data['id'])) {
                return $this->json($response, ['error' => 'Gunakan endpoint admin untuk mengubah hari penting'], 400);
            }
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : null;
            $actorUsersId = $this->resolveUsersIdForTargets($userArr);
            if ($actorUsersId === null || $actorUsersId <= 0) {
                return $this->json($response, ['error' => 'Akun tidak terikat users.id — tidak bisa membuat jadwal pribadi'], 400);
            }

            $nama_event = TextSanitizer::cleanText($data['nama_event'] ?? '');
            if ($nama_event === '') {
                return $this->json($response, ['error' => 'nama_event wajib diisi'], 400);
            }
            $kategori = $data['kategori'] ?? 'hijriyah';
            if (!in_array($kategori, ['hijriyah', 'masehi'], true)) {
                return $this->json($response, ['error' => 'kategori harus hijriyah atau masehi'], 400);
            }
            $tipe = $data['tipe'] ?? 'per_tahun';
            $hari_pekan = isset($data['hari_pekan']) ? (int) $data['hari_pekan'] : null;
            $tanggal = isset($data['tanggal']) ? (int) $data['tanggal'] : null;
            $bulan = isset($data['bulan']) ? (int) $data['bulan'] : null;
            $tahun = isset($data['tahun']) ? (int) $data['tahun'] : null;
            $tanggal_dari = isset($data['tanggal_dari']) ? trim((string) $data['tanggal_dari']) : null;
            $tanggal_sampai = isset($data['tanggal_sampai']) ? trim((string) $data['tanggal_sampai']) : null;
            if ($tanggal_dari === '') {
                $tanggal_dari = null;
            }
            if ($tanggal_sampai === '') {
                $tanggal_sampai = null;
            }
            if ($tipe === 'dari_sampai') {
                if (!self::isValidYmd($tanggal_dari) || !self::isValidYmd($tanggal_sampai)) {
                    return $this->json($response, ['error' => 'Tipe dari–sampai wajib tanggal_dari dan tanggal_sampai (format Y-m-d)'], 400);
                }
                if ($tanggal_dari > $tanggal_sampai) {
                    return $this->json($response, ['error' => 'tanggal_dari tidak boleh setelah tanggal_sampai'], 400);
                }
                $hari_pekan = null;
                $tanggal = null;
                $bulan = null;
                $tahun = null;
            } else {
                $tanggal_dari = null;
                $tanggal_sampai = null;
            }

            $warna_label = TextSanitizer::cleanTextOrNull($data['warna_label'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $aktif = isset($data['aktif']) ? (int) $data['aktif'] : 1;

            $jamMulai = self::normalizeTime(isset($data['jam_mulai']) ? (string) $data['jam_mulai'] : null);
            $jamSelesai = self::normalizeTime(isset($data['jam_selesai']) ? (string) $data['jam_selesai'] : null);
            if (($jamMulai === null) !== ($jamSelesai === null)) {
                return $this->json($response, ['error' => 'Jam: isi keduanya (mulai dan selesai) atau kosongkan keduanya'], 400);
            }
            if ($jamMulai !== null && $jamSelesai !== null && strcmp($jamMulai, $jamSelesai) > 0) {
                return $this->json($response, ['error' => 'jam_mulai tidak boleh setelah jam_selesai'], 400);
            }

            $dataTargets = [
                'target_lembaga_ids' => [],
                'target_user_ids' => [$actorUsersId],
            ];

            $pengurusId = is_array($user)
                ? (isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null))
                : null;

            $stmt = $this->db->prepare('INSERT INTO psa___hari_penting (nama_event, kategori, tipe, hari_pekan, tanggal, bulan, tahun, tanggal_dari, tanggal_sampai, jam_mulai, jam_selesai, warna_label, keterangan, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$nama_event, $kategori, $tipe, $hari_pekan, $tanggal, $bulan, $tahun, $tanggal_dari, $tanggal_sampai, $jamMulai, $jamSelesai, $warna_label, $keterangan, $aktif]);
            $newId = (int) $this->db->lastInsertId();
            if ($newId > 0) {
                $this->replaceTargets($newId, $dataTargets);
            }
            if ($pengurusId !== null && $newId) {
                $newStmt = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
                $newStmt->execute([$newId]);
                $newRow = $newStmt->fetch(\PDO::FETCH_ASSOC);
                if ($newRow) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'psa___hari_penting', $newId, null, $newRow, $request);
                }
            }

            return $this->json($response, ['message' => 'Jadwal pribadi berhasil ditambah', 'id' => $newId]);
        } catch (\Exception $e) {
            error_log('HariPenting postPersonalSelf error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/hari-penting - delete by id in body (admin_kalender only)
     */
    public function delete(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (!is_array($data) || !isset($data['id'])) {
                return $this->json($response, ['error' => 'Input harus JSON dengan field id'], 400);
            }
            $oldStmt = $this->db->prepare('SELECT * FROM psa___hari_penting WHERE id = ?');
            $oldStmt->execute([$data['id']]);
            $oldRow = $oldStmt->fetch(\PDO::FETCH_ASSOC);
            $stmt = $this->db->prepare('DELETE FROM psa___hari_penting WHERE id = ?');
            $stmt->execute([$data['id']]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($oldRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'psa___hari_penting', $data['id'], $oldRow, null, $request);
            }
            return $this->json($response, ['message' => 'Hari penting berhasil dihapus']);
        } catch (\Exception $e) {
            error_log('HariPenting delete error: ' . $e->getMessage());
            return $this->json($response, ['error' => $e->getMessage()], 500);
        }
    }

    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
