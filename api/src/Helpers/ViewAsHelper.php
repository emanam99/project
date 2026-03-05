<?php

namespace App\Helpers;

use App\Database;
use App\Config\RoleConfig;

/**
 * Helper untuk fitur "coba sebagai" role (hanya super_admin).
 * Menyimpan dan mengambil pengaturan view_as dari tabel super_admin_view_as.
 */
class ViewAsHelper
{
    private static $db = null;

    private static function getDb(): \PDO
    {
        if (self::$db === null) {
            self::$db = Database::getInstance()->getConnection();
        }
        return self::$db;
    }

    /**
     * Ambil pengaturan view_as untuk pengurus (super_admin).
     *
     * @param int $pengurusId pengurus.id (user_id dari token)
     * @return array|null ['view_as_role' => string, 'view_as_lembaga_id' => int|null] atau null
     */
    public static function getViewAs(int $pengurusId): ?array
    {
        try {
            $db = self::getDb();
            $stmt = $db->prepare("SELECT view_as_role, view_as_lembaga_id FROM super_admin_view_as WHERE pengurus_id = ? LIMIT 1");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty(trim($row['view_as_role'] ?? ''))) {
                return null;
            }
            return [
                'view_as_role' => trim($row['view_as_role']),
                'view_as_lembaga_id' => isset($row['view_as_lembaga_id']) && $row['view_as_lembaga_id'] !== '' ? (int) $row['view_as_lembaga_id'] : null,
            ];
        } catch (\Throwable $e) {
            error_log('ViewAsHelper::getViewAs ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Set atau clear view_as. Hanya boleh dipanggil untuk user yang role-nya super_admin.
     *
     * @param int $pengurusId pengurus.id
     * @param string|null $roleKey role_key untuk "coba sebagai", null = clear
     * @param int|null $lembagaId lembaga_id untuk filter, null = tidak dibatasi
     * @return bool sukses
     */
    public static function setViewAs(int $pengurusId, ?string $roleKey, ?int $lembagaId = null): bool
    {
        try {
            $db = self::getDb();
            if ($roleKey === null || trim($roleKey) === '') {
                $stmt = $db->prepare("DELETE FROM super_admin_view_as WHERE pengurus_id = ?");
                $stmt->execute([$pengurusId]);
                return true;
            }
            $roleKey = trim(strtolower($roleKey));
            if (!RoleConfig::isValidRole($roleKey)) {
                return false;
            }
            $stmt = $db->prepare("
                INSERT INTO super_admin_view_as (pengurus_id, view_as_role, view_as_lembaga_id)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE view_as_role = VALUES(view_as_role), view_as_lembaga_id = VALUES(view_as_lembaga_id)
            ");
            $stmt->execute([$pengurusId, $roleKey, $lembagaId]);
            return true;
        } catch (\Throwable $e) {
            error_log('ViewAsHelper::setViewAs ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Merge payload user dengan identitas "view as" (role, lembaga, permissions, allowed_apps).
     * Mengubah role_key, role_label, lembaga_id, permissions, allowed_apps.
     * Menambah is_real_super_admin = true agar frontend tetap bisa menampilkan menu Role & Akses.
     *
     * @param array $payload user payload dari token (atau dari verify)
     * @return array payload yang sudah di-merge (jika view_as aktif)
     */
    public static function mergePayloadWithViewAs(array $payload): array
    {
        $roleKey = strtolower(trim($payload['role_key'] ?? $payload['user_role'] ?? ''));
        if ($roleKey !== 'super_admin') {
            return $payload;
        }
        $pengurusId = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);
        if ($pengurusId <= 0) {
            return $payload;
        }
        $viewAs = self::getViewAs($pengurusId);
        if ($viewAs === null) {
            $payload['is_real_super_admin'] = true;
            return $payload;
        }
        $effectiveRole = $viewAs['view_as_role'];
        $effectiveLembagaId = $viewAs['view_as_lembaga_id'];
        $payload['role_key'] = $effectiveRole;
        $payload['role_label'] = RoleConfig::getRoleLabel($effectiveRole);
        $payload['user_role'] = $effectiveRole;
        $payload['lembaga_id'] = $effectiveLembagaId;
        $payload['allowed_apps'] = RoleConfig::getAllowedApps($effectiveRole);
        $payload['permissions'] = RoleConfig::getPermissions($effectiveRole);
        $payload['all_roles'] = [$effectiveRole];
        $payload['is_real_super_admin'] = true;
        $payload['view_as_active'] = true; // Frontend: tampilkan banner "Melihat sebagai ..."
        return $payload;
    }
}
