<?php

declare(strict_types=1);

use App\Config\RolePolicyResolver;
use Phinx\Seed\AbstractSeed;

/**
 * Mengisi role___fitur untuk menu & action eBeddien (app___fitur id_app=1, type menu|action).
 * Aturan selaras Sidebar.jsx (non–super_admin): requiresRole dulu, lalu requiresSuperAdmin, lalu requiresPermission, else publik.
 * super_admin: semua menu kecuali /settings/role-akses hanya untuk super (hanya super_admin).
 *
 * Butuh: AppSeed, AppFiturMenuSeed, MenuActionsFiturSeed (aksi halaman; setelah menu), lalu seed ini.
 * Cara: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 * Atau seed:run tanpa -s (urutan: AppFiturMenuSeed → MenuActionsFiturSeed → RoleFiturMenuSeed).
 * Aman berulang: INSERT IGNORE pada (role_id, fitur_id).
 *
 * Setelah mengubah AppFiturMenuSeed atau logika di bawah: jalankan ulang seed ini
 * agar role___fitur mengikuti aturan baru (baris lama tetap ada; hapus manual di DB bila perlu).
 */
class RoleFiturMenuSeed extends AbstractSeed
{
    public function run(): void
    {
        require_once __DIR__ . '/../../vendor/autoload.php';

        $conn = $this->getAdapter()->getConnection();
        $roles = $conn->query('SELECT `id`, `key` FROM `role` ORDER BY `id`')->fetchAll(\PDO::FETCH_ASSOC);
        if ($roles === []) {
            return;
        }

        $fiturStmt = $conn->query(
            'SELECT `id`, `path`, `type`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `type` IN (\'menu\', \'action\') ORDER BY `sort_order`, `id`'
        );
        $fiturs = $fiturStmt ? $fiturStmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        if ($fiturs === []) {
            return;
        }

        foreach ($roles as $role) {
            $roleId = (int) $role['id'];
            $roleKey = (string) $role['key'];
            foreach ($fiturs as $f) {
                $fiturId = (int) $f['id'];
                $path = (string) $f['path'];
                $meta = $this->decodeMeta($f['meta_json'] ?? null);
                if (!$this->roleSeesMenu($roleKey, $meta, $path)) {
                    continue;
                }
                $this->execute(sprintf(
                    'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`) VALUES (%d, %d)',
                    $roleId,
                    $fiturId
                ));
            }
        }
    }

    private function decodeMeta(mixed $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        $decoded = json_decode((string) $raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param array<string, mixed>|null $meta
     */
    private function roleSeesMenu(string $roleKey, ?array $meta, string $path): bool
    {
        if ($path === '/settings/role-akses') {
            return $roleKey === 'super_admin';
        }
        if ($roleKey === 'super_admin') {
            return true;
        }

        $meta = $meta ?? [];
        // Action (widget Beranda, dll.): tanpa path; aturan sama seperti menu dari meta.
        if (!empty($meta['requiresRole']) && is_array($meta['requiresRole'])) {
            if (!in_array($roleKey, $meta['requiresRole'], true)) {
                return false;
            }
            if (!empty($meta['requiresPermission'])) {
                return RolePolicyResolver::hasPermission($roleKey, (string) $meta['requiresPermission']);
            }

            return true;
        }
        if (!empty($meta['requiresSuperAdmin'])) {
            return false;
        }
        if (!empty($meta['requiresPermission'])) {
            return RolePolicyResolver::hasPermission($roleKey, (string) $meta['requiresPermission']);
        }

        return true;
    }
}
