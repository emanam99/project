<?php

namespace App\Helpers;

use App\Database;
use App\Config\RoleConfig;

/**
 * Helper class untuk mengelola role pengurus
 */
class RoleHelper
{
    private static $db = null;

    /**
     * Gabungan scope lembaga (semua role setara; ambil yang paling luas).
     * Jika ada role global / lembaga_id kosong pada baris manapun → akses semua lembaga.
     * Jika semua baris terikat lembaga konkret → union id lembaga.
     *
     * @return array{lembaga_scope_all: bool, lembaga_ids: string[]}
     */
    public static function computeLembagaAccessUnion(int $pengurusId): array
    {
        $rows = self::getUserRoles($pengurusId);
        if ($rows === []) {
            return ['lembaga_scope_all' => false, 'lembaga_ids' => []];
        }
        foreach ($rows as $row) {
            $rk = str_replace(' ', '_', strtolower(trim((string)($row['role_key'] ?? ''))));
            if ($rk !== '' && RoleConfig::roleHasUnrestrictedLembagaScope($rk)) {
                return ['lembaga_scope_all' => true, 'lembaga_ids' => []];
            }
        }
        foreach ($rows as $row) {
            $lid = $row['lembaga_id'] ?? null;
            $lidStr = $lid !== null && $lid !== '' ? trim((string) $lid) : '';
            if ($lidStr === '') {
                return ['lembaga_scope_all' => true, 'lembaga_ids' => []];
            }
        }
        $ids = [];
        foreach ($rows as $row) {
            $lid = $row['lembaga_id'] ?? null;
            if ($lid !== null && $lid !== '') {
                $ids[trim((string) $lid)] = true;
            }
        }

        return ['lembaga_scope_all' => false, 'lembaga_ids' => array_keys($ids)];
    }

    /**
     * Filter SQL untuk list registrasi PSB (daftar_formal / daftar_diniyah = id lembaga).
     * null = tanpa filter. ['empty' => true] = tidak ada baris yang boleh ditampilkan.
     *
     * @return null|array{empty?: bool, clause?: string, params?: list<string>}
     */
    public static function buildPendaftarLembagaSqlFilter(int $pengurusId): ?array
    {
        $scope = self::computeLembagaAccessUnion($pengurusId);
        if ($scope['lembaga_scope_all']) {
            return null;
        }
        $ids = $scope['lembaga_ids'];
        if ($ids === []) {
            return ['empty' => true];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));

        return [
            'clause' => "(r.daftar_formal IN ($ph) OR r.daftar_diniyah IN ($ph))",
            'params' => array_merge(array_values($ids), array_values($ids)),
        ];
    }

    /**
     * Filter list pendaftar PSB dari gabungan scope lembaga semua role pengurus.
     *
     * @return null|array{empty?: bool, clause?: string, params?: list<string>}
     */
    public static function resolvePendaftarLembagaSqlFilter(?array $user, ?int $pengurusId): ?array
    {
        if ($pengurusId !== null && $pengurusId > 0) {
            return self::buildPendaftarLembagaSqlFilter($pengurusId);
        }

        return null;
    }

    /**
     * Daftar key role unik untuk token / verify — urutan alfabetis (hak akses = gabungan semua, urutan tidak penting).
     */
    public static function getAllRoleKeysNormalizedForPengurus(int $pengurusId): array
    {
        $rows = self::getUserRoles($pengurusId);
        $keys = [];
        foreach ($rows as $r) {
            $k = str_replace(' ', '_', strtolower(trim((string)($r['role_key'] ?? ''))));
            if ($k !== '') {
                $keys[$k] = true;
            }
        }
        $out = array_keys($keys);
        sort($out);
        return $out;
    }

    /** True jika pengurus memiliki role super_admin (salah satu dari banyak role). */
    public static function pengurusHasSuperAdminRole(int $pengurusId): bool
    {
        return in_array('super_admin', self::getAllRoleKeysNormalizedForPengurus($pengurusId), true);
    }

    /**
     * Union role dari payload JWT: role_key / user_role / level + all_roles (aman untuk multi_role).
     *
     * @return list<string>
     */
    public static function normalizeTokenRoleKeysUnion(array $user): array
    {
        $keys = [];
        foreach (['role_key', 'user_role', 'level', 'role'] as $field) {
            if (!isset($user[$field]) || $user[$field] === '' || $user[$field] === null) {
                continue;
            }
            $k = str_replace(' ', '_', strtolower(trim((string) $user[$field])));
            if ($k !== '') {
                $keys[$k] = true;
            }
        }
        if (!empty($user['all_roles']) && is_array($user['all_roles'])) {
            foreach ($user['all_roles'] as $r) {
                $k = str_replace(' ', '_', strtolower(trim((string) $r)));
                if ($k !== '') {
                    $keys[$k] = true;
                }
            }
        }
        $out = array_keys($keys);
        sort($out);

        return $out;
    }

    /** True jika salah satu role di token ada di $roleKeys (multi_role aman). */
    public static function tokenHasAnyRoleKey(array $user, array $roleKeys): bool
    {
        $want = [];
        foreach ($roleKeys as $rk) {
            $want[str_replace(' ', '_', strtolower(trim((string) $rk)))] = true;
        }
        if ($want === []) {
            return false;
        }
        foreach (self::normalizeTokenRoleKeysUnion($user) as $u) {
            if (isset($want[$u])) {
                return true;
            }
        }

        return false;
    }

    /** Role pengurus/staff (bukan konteks hanya-santri di app daftar). */
    private const TOKEN_STAFF_ROLE_KEYS = [
        'super_admin', 'admin_uwaba', 'petugas_uwaba', 'admin_lembaga', 'admin_psb', 'petugas_psb',
        'admin_ijin', 'petugas_ijin', 'admin_umroh', 'petugas_umroh', 'admin_ugt', 'koordinator_ugt',
        'admin_kalender', 'tarbiyah', 'wali_kelas', 'guru', 'waka_lembaga', 'ketua_lembaga',
        'admin_cashless', 'petugas_cashless', 'toko',
    ];

    /**
     * True jika token layaknya login aplikasi daftar (santri): user_id bukan pengurus.id.
     * Multi-role dengan staff apa pun → false.
     */
    public static function tokenIsSantriDaftarContext(array $user): bool
    {
        $union = self::normalizeTokenRoleKeysUnion($user);
        foreach ($union as $k) {
            if (in_array($k, self::TOKEN_STAFF_ROLE_KEYS, true)) {
                return false;
            }
        }
        if (!empty($user['santri_id'])) {
            return true;
        }

        return in_array('santri', $union, true);
    }

    /** Boleh query biodata/registrasi/transaksi santri lain (PSB + super_admin). */
    public static function tokenCanQueryAnyPendaftaranSantri(array $user): bool
    {
        return self::tokenHasAnyRoleKey($user, ['super_admin', 'admin_psb', 'petugas_psb']);
    }

    /**
     * Koordinator UGT dibatasi ke madrasah sendiri, kecuali ada super_admin / admin_ugt di token.
     */
    public static function tokenMadrasahApplyKoordinatorScope(array $user): bool
    {
        return self::tokenHasAnyRoleKey($user, ['koordinator_ugt'])
            && !self::tokenHasAnyRoleKey($user, ['super_admin', 'admin_ugt']);
    }

    /** True jika salah satu role di token boleh mengakses app (RoleConfig), aman multi_role / all_roles. */
    public static function tokenCanAccessAppFromRoleConfig(array $user, string $appKey): bool
    {
        $app = strtolower(trim($appKey));
        if ($app === '') {
            return false;
        }
        foreach (self::normalizeTokenRoleKeysUnion($user) as $k) {
            if ($k !== '' && RoleConfig::canAccessApp($k, $app)) {
                return true;
            }
        }

        return false;
    }

    /** True jika salah satu role di token punya permission menurut RoleConfig (gabungan union). */
    public static function tokenHasPermissionFromRoleConfig(array $user, string $permission): bool
    {
        $perm = strtolower(trim($permission));
        if ($perm === '') {
            return false;
        }
        foreach (self::normalizeTokenRoleKeysUnion($user) as $k) {
            if ($k !== '' && RoleConfig::hasPermission($k, $perm)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Dapatkan koneksi database
     */
    private static function getDb()
    {
        if (self::$db === null) {
            self::$db = Database::getInstance()->getConnection();
        }
        return self::$db;
    }

    /**
     * Dapatkan role aktif pengurus dari database
     * 
     * @param int $pengurusId ID pengurus
     * @return array|null Array dengan keys: role_key, role_label, lembaga_id, atau null jika tidak ada
     */
    public static function getUserRole(int $pengurusId): ?array
    {
        $all = self::getUserRoles($pengurusId);
        if ($all === []) {
            error_log("RoleHelper: Tidak ada role ditemukan untuk pengurus_id: $pengurusId");
            return null;
        }
        usort($all, function (array $a, array $b): int {
            return strcmp((string)($a['role_key'] ?? ''), (string)($b['role_key'] ?? ''));
        });
        $result = $all[0];
        $roleKey = trim(strtolower((string)($result['role_key'] ?? '')));
        error_log("RoleHelper::getUserRole - First alphabetical role for pengurus_id $pengurusId: role_key='$roleKey'");
        if ($roleKey === '') {
            error_log("RoleHelper::getUserRole - WARNING: role_key is empty after normalization for user ID: $pengurusId");
        }
        return [
            'role_key' => $roleKey,
            'role_label' => $result['role_label'] ?? '',
            'lembaga_id' => $result['lembaga_id'],
            'pengurus_role_id' => $result['pengurus_role_id']
        ];
    }

    /**
     * Resolve pengurus_id dari payload token (untuk lookup role).
     * Token bisa punya user_id = pengurus.id (login V1/V2 uwaba) atau user_id = users.id (santri-only V2).
     * 
     * @param array $user payload dari request->getAttribute('user')
     * @return int|null pengurus_id untuk getUserRoles, atau null
     */
    public static function getPengurusIdFromPayload(array $user): ?int
    {
        if (isset($user['id_pengurus']) && (int)$user['id_pengurus'] > 0) {
            return (int)$user['id_pengurus'];
        }
        $userId = isset($user['user_id']) ? (int)$user['user_id'] : (int)($user['id'] ?? 0);
        $usersId = isset($user['users_id']) ? (int)$user['users_id'] : null;
        if ($userId <= 0) {
            return null;
        }
        if ($usersId === null || $userId !== $usersId) {
            return $userId;
        }
        // user_id === users_id: token mungkin dari login multi-role (users.id). Resolve pengurus_id dari tabel pengurus.
        try {
            $db = self::getDb();
            $stmt = $db->prepare("SELECT id FROM pengurus WHERE id_user = ? LIMIT 1");
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && !empty($row['id'])) {
                return (int)$row['id'];
            }
        } catch (\Throwable $e) {
            // ignore
        }
        // Jangan pakai users.id sebagai pengurus_id (getUserRoles butuh pengurus.id)
        return null;
    }

    /**
     * Dapatkan semua role pengurus (jika bisa memiliki multiple role)
     * 
     * @param int $pengurusId ID pengurus
     * @return array Array of role data
     */
    public static function getUserRoles(int $pengurusId): array
    {
        try {
            $db = self::getDb();
            
            // Urutan baris stabil; hak akses = gabungan semua baris (tanpa role utama).
            $stmt = $db->prepare("
                SELECT 
                    r.`key` as role_key,
                    r.label as role_label,
                    pr.lembaga_id,
                    pr.id as pengurus_role_id
                FROM pengurus___role pr
                INNER JOIN role r ON pr.role_id = r.id
                WHERE pr.pengurus_id = ?
                ORDER BY pr.id ASC
            ");
            
            $stmt->execute([$pengurusId]);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Normalize role_key: lowercase + spasi jadi underscore (konsisten dengan RoleMiddleware)
            foreach ($results as &$result) {
                $k = trim(strtolower((string)($result['role_key'] ?? '')));
                $result['role_key'] = str_replace(' ', '_', $k);
            }
            unset($result); // Unset reference
            
            return $results;
        } catch (\Exception $e) {
            error_log("RoleHelper::getUserRoles error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Dapatkan informasi role lengkap untuk token payload
     * Menggabungkan allowed_apps dan permissions dari semua role yang dimiliki user
     * 
     * @param int $pengurusId ID pengurus
     * @return array Array dengan role_key, role_label, allowed_apps, permissions
     */
    public static function getRoleInfoForToken(int $pengurusId): array
    {
        $userRoles = self::getUserRoles($pengurusId);

        if (empty($userRoles)) {
            return [
                'role_key' => null,
                'role_label' => 'Tidak ada role',
                'allowed_apps' => [],
                'permissions' => [],
                'lembaga_id' => null,
                'lembaga_scope_all' => false,
                'lembaga_ids' => [],
            ];
        }

        $allAllowedApps = [];
        $allPermissions = [];

        foreach ($userRoles as $role) {
            $currentRoleKey = strtolower(trim((string)($role['role_key'] ?? '')));
            if ($currentRoleKey !== '') {
                $allAllowedApps = array_unique(array_merge($allAllowedApps, RoleConfig::getAllowedApps($currentRoleKey)));
                $allPermissions = array_unique(array_merge($allPermissions, RoleConfig::getPermissions($currentRoleKey)));
            }
        }

        $allAllowedApps = array_values($allAllowedApps);
        $allPermissions = array_values($allPermissions);

        $uniqueKeys = [];
        foreach ($userRoles as $role) {
            $k = strtolower(trim((string)($role['role_key'] ?? '')));
            if ($k !== '') {
                $uniqueKeys[$k] = true;
            }
        }
        $keyList = array_keys($uniqueKeys);
        sort($keyList);

        if (count($keyList) <= 1) {
            $roleKey = $keyList[0] ?? '';
            $roleLabel = $userRoles[0]['role_label'] ?? RoleConfig::getRoleLabel($roleKey);
        } else {
            $roleKey = 'multi_role';
            $roleLabel = 'Beberapa role';
        }

        $scope = self::computeLembagaAccessUnion($pengurusId);
        $lembagaIds = $scope['lembaga_ids'];
        $lembagaIdSingle = null;
        if (!$scope['lembaga_scope_all'] && count($lembagaIds) === 1) {
            $lembagaIdSingle = $lembagaIds[0];
        }

        error_log('RoleHelper::getRoleInfoForToken - pengurus_id=' . $pengurusId . ' keys=' . json_encode($keyList) . ' scope_all=' . ($scope['lembaga_scope_all'] ? '1' : '0'));

        return [
            'role_key' => $roleKey,
            'role_label' => $roleLabel,
            'allowed_apps' => $allAllowedApps,
            'permissions' => $allPermissions,
            'lembaga_id' => $lembagaIdSingle,
            'lembaga_scope_all' => $scope['lembaga_scope_all'],
            'lembaga_ids' => $lembagaIds,
        ];
    }

    /**
     * Cek apakah pengurus bisa mengakses aplikasi tertentu
     * Mengecek semua role yang dimiliki user
     * 
     * @param int $pengurusId ID pengurus
     * @param string $appKey Key aplikasi ('uwaba' atau 'lembaga')
     * @return bool
     */
    public static function canAccessApp(int $pengurusId, string $appKey): bool
    {
        $userRoles = self::getUserRoles($pengurusId);
        
        if (empty($userRoles)) {
            return false;
        }
        
        // Cek semua role - jika salah satu role bisa akses, return true
        foreach ($userRoles as $role) {
            $roleKey = strtolower(trim($role['role_key'] ?? ''));
            if (!empty($roleKey) && RoleConfig::canAccessApp($roleKey, $appKey)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Cek apakah pengurus memiliki permission tertentu
     * Mengecek semua role yang dimiliki user
     * 
     * @param int $pengurusId ID pengurus
     * @param string $permission Key permission
     * @return bool
     */
    public static function hasPermission(int $pengurusId, string $permission): bool
    {
        $userRoles = self::getUserRoles($pengurusId);
        
        if (empty($userRoles)) {
            return false;
        }
        
        // Cek semua role - jika salah satu role memiliki permission, return true
        foreach ($userRoles as $role) {
            $roleKey = strtolower(trim($role['role_key'] ?? ''));
            if (!empty($roleKey) && RoleConfig::hasPermission($roleKey, $permission)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Daftar lembaga PSB untuk pengurus (role admin_psb / petugas_psb), dikelompokkan by kategori.
     * Satu lembaga Formal → hanya akses daftar formal lembaga itu; satu Diniyah → hanya daftar diniyah.
     * Banyak lembaga → akses daftar formal (semua lembaga user yang Formal) + daftar diniyah (semua yang Diniyah).
     *
     * @param int $pengurusId ID pengurus
     * @return array { formal_lembaga_ids: string[], diniyah_lembaga_ids: string[], formal_lembaga: [{id, nama}], diniyah_lembaga: [{id, nama}] }
     */
    public static function getPsbLembagaForPengurus(int $pengurusId): array
    {
        $empty = [
            'formal_lembaga_ids' => [],
            'diniyah_lembaga_ids' => [],
            'formal_lembaga' => [],
            'diniyah_lembaga' => [],
        ];
        try {
            $db = self::getDb();
            $userRoles = self::getUserRoles($pengurusId);
            $psbLembagaIds = [];
            foreach ($userRoles as $role) {
                $roleKey = strtolower(trim($role['role_key'] ?? ''));
                if (!in_array($roleKey, ['admin_psb', 'petugas_psb'], true)) {
                    continue;
                }
                $lid = $role['lembaga_id'] ?? null;
                if ($lid !== null && $lid !== '') {
                    $psbLembagaIds[] = trim((string) $lid);
                }
            }
            $psbLembagaIds = array_values(array_unique($psbLembagaIds));
            if (empty($psbLembagaIds)) {
                return $empty;
            }
            $placeholders = implode(',', array_fill(0, count($psbLembagaIds), '?'));
            $stmt = $db->prepare("SELECT id, nama, kategori FROM lembaga WHERE id IN ($placeholders)");
            $stmt->execute($psbLembagaIds);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $formalIds = [];
            $diniyahIds = [];
            $formalList = [];
            $diniyahList = [];
            foreach ($rows as $row) {
                $id = $row['id'] ?? null;
                $nama = $row['nama'] ?? $id;
                $kategori = isset($row['kategori']) ? trim((string) $row['kategori']) : '';
                if ($id === null || $id === '') {
                    continue;
                }
                if (strtolower($kategori) === 'formal') {
                    $formalIds[] = $id;
                    $formalList[] = ['id' => $id, 'nama' => $nama];
                } elseif (strtolower($kategori) === 'diniyah') {
                    $diniyahIds[] = $id;
                    $diniyahList[] = ['id' => $id, 'nama' => $nama];
                }
            }
            return [
                'formal_lembaga_ids' => $formalIds,
                'diniyah_lembaga_ids' => $diniyahIds,
                'formal_lembaga' => $formalList,
                'diniyah_lembaga' => $diniyahList,
            ];
        } catch (\Exception $e) {
            error_log("RoleHelper::getPsbLembagaForPengurus error: " . $e->getMessage());
            return $empty;
        }
    }
}

