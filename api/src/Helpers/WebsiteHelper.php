<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Helper bersama untuk modul Website Pesantren:
 * - response JSON konsisten
 * - generator slug aman
 * - gate fitur (action.website.*) memanfaatkan RoleHelper
 */
final class WebsiteHelper
{
    /**
     * Bentuk slug URL-friendly. Jika $base kosong, kembalikan string kosong (caller wajib validasi).
     */
    public static function slugify(string $base): string
    {
        $s = mb_strtolower(trim($base), 'UTF-8');
        $s = preg_replace('/[^\p{L}\p{N}\s\-]+/u', '', $s) ?? '';
        $s = preg_replace('/[\s_-]+/u', '-', $s) ?? '';
        $s = trim($s, '-');
        return $s === '' ? '' : substr($s, 0, 200);
    }

    /**
     * Pastikan slug unik di tabel; jika sudah dipakai, tambahkan -2, -3, dst.
     * $exceptId = id baris yang sedang di-update (boleh slug yang sama).
     */
    public static function uniqueSlug(\PDO $db, string $table, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'item';
        $candidate = $base;
        $i = 1;
        while (true) {
            $sql = "SELECT id FROM `{$table}` WHERE slug = ?";
            $params = [$candidate];
            if ($exceptId !== null) {
                $sql .= ' AND id <> ?';
                $params[] = $exceptId;
            }
            $sql .= ' LIMIT 1';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            if (!$stmt->fetchColumn()) {
                return $candidate;
            }
            $i++;
            $candidate = $base . '-' . $i;
        }
    }

    /**
     * Slug unik: jika $base sudah dipakai, coba $base-YYYY-MM-DD (WIB), lalu $base-YYYY-MM-DD-2, dst.
     * Dipakai berita website agar duplikat judul tidak hanya -2, -3.
     */
    public static function uniqueSlugWithDateSuffix(\PDO $db, string $table, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'item';
        if (!self::slugRowExists($db, $table, $base, $exceptId)) {
            return $base;
        }
        $date = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
        $datedBase = $base . '-' . $date;
        $candidate = $datedBase;
        $i = 1;
        while (self::slugRowExists($db, $table, $candidate, $exceptId)) {
            $i++;
            $candidate = $datedBase . '-' . $i;
        }

        return $candidate;
    }

    private static function slugRowExists(\PDO $db, string $table, string $slug, ?int $exceptId): bool
    {
        $sql = "SELECT id FROM `{$table}` WHERE slug = ?";
        $params = [$slug];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * Apakah pengguna pemegang token boleh mengakses minimal satu menu/aksi modul Website
     * (dipakai oleh route admin sebagai gate kasar; aksi spesifik dicek per-endpoint).
     */
    public static function canAccessAdminWebsite(\PDO $db, array $user): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        return RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($db, $user, 'menu.website.');
    }

    /**
     * Boleh menulis (create/update) untuk modul tertentu — selama punya menu modulnya.
     * Aksi destruktif/publish dicek terpisah lewat needAction().
     */
    public static function canWriteModule(\PDO $db, array $user, string $menuCode): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, $menuCode);
    }

    /**
     * True bila user punya aksi tertentu (atau super_admin).
     */
    public static function hasAction(\PDO $db, array $user, string $actionCode): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, $actionCode);
    }
}
