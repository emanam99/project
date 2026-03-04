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
        try {
            $db = self::getDb();
            
            // Cek apakah tabel pengurus___role dan role ada
            $tablesCheck = $db->query("SHOW TABLES LIKE 'pengurus___role'")->fetch();
            if (!$tablesCheck) {
                error_log("RoleHelper: Table pengurus___role tidak ditemukan");
                return null;
            }
            
            $tablesCheck2 = $db->query("SHOW TABLES LIKE 'role'")->fetch();
            if (!$tablesCheck2) {
                error_log("RoleHelper: Table role tidak ditemukan");
                return null;
            }
            
            // Query role dari tabel pengurus___role
            $stmt = $db->prepare("
                SELECT 
                    r.`key` as role_key,
                    r.label as role_label,
                    pr.lembaga_id,
                    pr.id as pengurus_role_id
                FROM pengurus___role pr
                INNER JOIN role r ON pr.role_id = r.id
                WHERE pr.pengurus_id = ?
                ORDER BY pr.tanggal_dibuat DESC
                LIMIT 1
            ");
            
            $stmt->execute([$pengurusId]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$result) {
                error_log("RoleHelper: Tidak ada role ditemukan untuk pengurus_id: $pengurusId");
                return null;
            }
            
            // Normalize role_key (trim dan lowercase untuk konsistensi)
            $roleKey = trim(strtolower($result['role_key'] ?? ''));
            
            // Log untuk debugging
            error_log("RoleHelper::getUserRole - Found role for user ID $pengurusId: role_key='$roleKey', label='{$result['role_label']}'");
            
            if (empty($roleKey)) {
                error_log("RoleHelper::getUserRole - WARNING: role_key is empty after normalization for user ID: $pengurusId");
            }
            
            return [
                'role_key' => $roleKey,
                'role_label' => $result['role_label'] ?? '',
                'lembaga_id' => $result['lembaga_id'],
                'pengurus_role_id' => $result['pengurus_role_id']
            ];
        } catch (\Exception $e) {
            error_log("RoleHelper::getUserRole error: " . $e->getMessage());
            error_log("RoleHelper::getUserRole stack trace: " . $e->getTraceAsString());
            return null;
        }
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
            
            $stmt = $db->prepare("
                SELECT 
                    r.`key` as role_key,
                    r.label as role_label,
                    pr.lembaga_id,
                    pr.id as pengurus_role_id
                FROM pengurus___role pr
                INNER JOIN role r ON pr.role_id = r.id
                WHERE pr.pengurus_id = ?
                ORDER BY pr.tanggal_dibuat DESC
            ");
            
            $stmt->execute([$pengurusId]);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Normalize role_key untuk semua hasil
            foreach ($results as &$result) {
                $result['role_key'] = trim(strtolower($result['role_key'] ?? ''));
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
        // Ambil semua role user (bukan hanya yang pertama)
        $userRoles = self::getUserRoles($pengurusId);
        
        if (empty($userRoles)) {
            // Fallback: jika tidak ada role di database, return default
            return [
                'role_key' => null,
                'role_label' => 'Tidak ada role',
                'allowed_apps' => [],
                'permissions' => [],
                'lembaga_id' => null
            ];
        }
        
        // Role pertama (terbaru) digunakan untuk role_key dan role_label (backward compatibility)
        $primaryRole = $userRoles[0];
        $roleKey = strtolower(trim($primaryRole['role_key'] ?? ''));
        
        // Gabungkan allowed_apps dari semua role
        $allAllowedApps = [];
        $allPermissions = [];
        
        foreach ($userRoles as $role) {
            $currentRoleKey = strtolower(trim($role['role_key'] ?? ''));
            if (!empty($currentRoleKey)) {
                $apps = RoleConfig::getAllowedApps($currentRoleKey);
                $perms = RoleConfig::getPermissions($currentRoleKey);
                
                // Merge apps (unique)
                $allAllowedApps = array_unique(array_merge($allAllowedApps, $apps));
                
                // Merge permissions (unique)
                $allPermissions = array_unique(array_merge($allPermissions, $perms));
            }
        }
        
        // Convert back to indexed array
        $allAllowedApps = array_values($allAllowedApps);
        $allPermissions = array_values($allPermissions);
        
        // Log untuk debugging
        error_log("RoleHelper::getRoleInfoForToken - User ID: $pengurusId, Total roles: " . count($userRoles));
        error_log("RoleHelper::getRoleInfoForToken - Primary role_key: $roleKey");
        error_log("RoleHelper::getRoleInfoForToken - All role keys: " . json_encode(array_column($userRoles, 'role_key')));
        error_log("RoleHelper::getRoleInfoForToken - Combined allowed_apps: " . json_encode($allAllowedApps));
        error_log("RoleHelper::getRoleInfoForToken - Combined permissions: " . json_encode($allPermissions));
        
        return [
            'role_key' => $roleKey,
            'role_label' => $primaryRole['role_label'] ?? '',
            'allowed_apps' => $allAllowedApps,
            'permissions' => $allPermissions,
            'lembaga_id' => $primaryRole['lembaga_id'] ?? null
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
}

