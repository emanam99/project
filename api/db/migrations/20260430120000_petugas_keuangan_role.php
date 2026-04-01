<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Role petugas_keuangan: akses modul keuangan eBeddien (selaras RoleConfig + route legacy).
 * Menyisipkan baris role dan menambah petugas_keuangan ke meta_json menu/aksi terkait.
 *
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class PetugasKeuanganRole extends AbstractMigration
{
    private const ROLE_ID = 28;

    private const MENU_PATHS = [
        '/dashboard-keuangan',
        '/pengeluaran',
        '/pemasukan',
        '/aktivitas',
        '/aktivitas-tahun-ajaran',
    ];

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $this->execute(sprintf(
            "INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (%d, 'petugas_keuangan', 'Petugas Keuangan')",
            self::ROLE_ID
        ));

        $sel = $conn->prepare('SELECT `id`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `type` = \'menu\' AND `path` = ? LIMIT 1');
        foreach (self::MENU_PATHS as $path) {
            $sel->execute([$path]);
            $row = $sel->fetch(\PDO::FETCH_ASSOC);
            if ($row === false) {
                continue;
            }
            $newMeta = $this->metaWithRole($row['meta_json'] ?? null, 'petugas_keuangan');
            if ($newMeta === null) {
                continue;
            }
            $u = $conn->prepare('UPDATE `app___fitur` SET `meta_json` = ? WHERE `id` = ?');
            $u->execute([$newMeta, (int) $row['id']]);
        }

        $this->mergeMetaForCode($conn, 'action.beranda.widget.ringkasan_keuangan', function (array $meta): array {
            $meta = $this->metaWithRoleArray($meta, 'petugas_keuangan');
            if (empty($meta['requiresPermission'])) {
                $meta['requiresPermission'] = 'manage_finance';
            }

            return $meta;
        });

        $actStmt = $conn->query(
            "SELECT `id`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.pengeluaran.%'"
        );
        $actions = $actStmt ? $actStmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        foreach ($actions as $row) {
            $newMeta = $this->metaWithRole($row['meta_json'] ?? null, 'petugas_keuangan');
            if ($newMeta === null) {
                continue;
            }
            $u = $conn->prepare('UPDATE `app___fitur` SET `meta_json` = ? WHERE `id` = ?');
            $u->execute([$newMeta, (int) $row['id']]);
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $sel = $conn->prepare('SELECT `id`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `type` = \'menu\' AND `path` = ? LIMIT 1');
        foreach (self::MENU_PATHS as $path) {
            $sel->execute([$path]);
            $row = $sel->fetch(\PDO::FETCH_ASSOC);
            if ($row === false) {
                continue;
            }
            $newMeta = $this->metaWithoutRole($row['meta_json'] ?? null, 'petugas_keuangan');
            if ($newMeta === null) {
                continue;
            }
            $u = $conn->prepare('UPDATE `app___fitur` SET `meta_json` = ? WHERE `id` = ?');
            $u->execute([$newMeta, (int) $row['id']]);
        }

        $this->mergeMetaForCode($conn, 'action.beranda.widget.ringkasan_keuangan', function (array $meta): array {
            return $this->metaWithoutRoleArray($meta, 'petugas_keuangan');
        });

        $actStmt = $conn->query(
            "SELECT `id`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.pengeluaran.%'"
        );
        $actions = $actStmt ? $actStmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        foreach ($actions as $row) {
            $newMeta = $this->metaWithoutRole($row['meta_json'] ?? null, 'petugas_keuangan');
            if ($newMeta === null) {
                continue;
            }
            $u = $conn->prepare('UPDATE `app___fitur` SET `meta_json` = ? WHERE `id` = ?');
            $u->execute([$newMeta, (int) $row['id']]);
        }

        $this->execute('DELETE FROM `role` WHERE `id` = ' . self::ROLE_ID . " AND `key` = 'petugas_keuangan'");
    }

    private function mergeMetaForCode(\PDO $conn, string $code, callable $fn): void
    {
        $stmt = $conn->prepare('SELECT `id`, `meta_json` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute([$code]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false) {
            return;
        }
        $raw = $row['meta_json'] ?? null;
        $meta = $this->decodeMeta($raw);
        if ($meta === null) {
            $meta = [];
        }
        $meta = $fn($meta);
        $enc = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $u = $conn->prepare('UPDATE `app___fitur` SET `meta_json` = ? WHERE `id` = ?');
        $u->execute([$enc, (int) $row['id']]);
    }

    private function metaWithRole(?string $raw, string $roleKey): ?string
    {
        $meta = $this->decodeMeta($raw);
        if ($meta === null && ($raw === null || $raw === '')) {
            return null;
        }
        $meta = $meta ?? [];
        $meta = $this->metaWithRoleArray($meta, $roleKey);

        return json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    private function metaWithRoleArray(array $meta, string $roleKey): array
    {
        $rr = $meta['requiresRole'] ?? [];
        if (!is_array($rr)) {
            $rr = [];
        }
        if (!in_array($roleKey, $rr, true)) {
            $rr[] = $roleKey;
            $meta['requiresRole'] = $rr;
        }

        return $meta;
    }

    private function metaWithoutRole(?string $raw, string $roleKey): ?string
    {
        $meta = $this->decodeMeta($raw);
        if ($meta === null) {
            return null;
        }
        $meta = $this->metaWithoutRoleArray($meta, $roleKey);

        return json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    private function metaWithoutRoleArray(array $meta, string $roleKey): array
    {
        $rr = $meta['requiresRole'] ?? [];
        if (!is_array($rr)) {
            return $meta;
        }
        $meta['requiresRole'] = array_values(array_filter($rr, static fn ($x) => (string) $x !== $roleKey));
        if ($meta['requiresRole'] === []) {
            unset($meta['requiresRole']);
        }

        return $meta;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeMeta(?string $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $d = json_decode($raw, true);

        return is_array($d) ? $d : null;
    }
}
