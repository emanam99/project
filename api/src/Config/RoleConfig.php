<?php

namespace App\Config;

/**
 * Konfigurasi Role dan Permissions
 * 
 * File ini berisi konfigurasi lengkap untuk:
 * - Role yang tersedia
 * - Aplikasi yang bisa diakses oleh setiap role
 * - Permissions untuk setiap role (untuk fitur-fitur)
 * 
 * Untuk menambah atau mengubah role/permission, edit file ini.
 */
class RoleConfig
{
    /**
     * Daftar aplikasi untuk akses multi-app (JWT/dll.). Selaras seed `AppSeed`: id 2–4 di tabel `app`.
     * Menu SPA eBeddien memakai `app.key` = ebeddien (id 1), terpisah dari daftar ini.
     */
    const APPS = [
        'uwaba' => 'Aplikasi UWABA',
        'mybeddian' => 'Aplikasi Mybeddian',
        'wa' => 'WhatsApp',
    ];

    /**
     * Konfigurasi role dan aplikasi yang bisa diakses
     * 
     * Format: 'role_key' => ['app1', 'app2', ...]
     */
    const ROLE_ALLOWED_APPS = [
        'super_admin' => ['uwaba', 'wa'],
        'admin_uwaba' => ['uwaba'],
        'petugas_uwaba' => ['uwaba'],
        'admin_lembaga' => [],
        /** Tarbiyah: akses menu Domisili + Lembaga di eBeddien (bukan UWABA pembayaran). */
        'tarbiyah' => ['uwaba'],
        /** Domisili/asrama: baseline sama tarbiyah; detail menu lewat Role & Akses (role___fitur). */
        'admin_daerah' => ['uwaba'],
        /** Admin Domisili: baseline akses app; menu/aksi lewat Role & Akses. */
        'admin_domisili' => ['uwaba'],
        'admin_diniyah' => [],
        'admin_formal' => [],
        'kapdar' => ['uwaba'],
        'wakapdar' => ['uwaba'],
        'wali_kelas' => [],
        'guru' => [],
        'waka_lembaga' => [],
        'ketua_lembaga' => [],
        'admin_umroh' => ['uwaba'],
        'petugas_umroh' => ['uwaba'],
        'user_umroh' => [],
        'admin_psb' => ['uwaba'],
        'petugas_psb' => ['uwaba'],
        'admin_ijin' => ['uwaba'],
        'petugas_ijin' => ['uwaba'],
        'admin_ugt' => ['uwaba'],
        'admin_kalender' => ['uwaba'],
        'koordinator_ugt' => ['uwaba'],
        /** Hanya modul keuangan eBeddien; scope lembaga lewat pengurus___role. */
        'petugas_keuangan' => [],
        'santri' => ['mybeddian'],
        'admin_wirid' => ['uwaba'],
    ];

    /**
     * Konfigurasi permissions untuk setiap role
     * 
     * Format: 'role_key' => ['permission1', 'permission2', ...]
     * 
     * Permission yang tersedia:
     * - manage_users: Mengelola pengguna
     * - manage_santri: Mengelola data santri
     * - manage_uwaba: Mengelola pembayaran UWABA (termasuk fitur umroh)
     * - manage_umroh: Mengelola data Umroh (Jamaah, Tabungan, Pengeluaran Umroh)
     * - manage_psb: Mengelola pendaftaran PSB (Penerimaan Santri Baru)
     * - manage_ijin: Mengelola data Ijin
     * - view_reports: Melihat laporan
     * - manage_finance: Mengelola keuangan (Pemasukan, Pengeluaran, Aktivitas)
     * - manage_settings: Mengelola pengaturan
     */
    const ROLE_PERMISSIONS = [
        'super_admin' => [
            'manage_users',
            'manage_santri',
            'manage_uwaba',
            'manage_umroh',
            'manage_psb',
            'view_reports',
            'manage_finance',
            'manage_settings'
        ],
        'admin_uwaba' => [
            'manage_santri',
            'manage_uwaba',
            'manage_umroh',
            'view_reports',
            'manage_finance'
        ],
        'petugas_uwaba' => [
            'manage_uwaba',
            'manage_umroh',
            'view_reports'
        ],
        'admin_lembaga' => [
            'manage_santri',
            'view_reports'
        ],
        'tarbiyah' => [
            'manage_santri',
            'view_reports'
        ],
        'admin_daerah' => [
            'manage_santri',
            'view_reports'
        ],
        'admin_domisili' => [
            'manage_santri',
            'view_reports'
        ],
        'admin_diniyah' => [],
        'admin_formal' => [],
        'kapdar' => [
            'manage_santri',
            'view_reports'
        ],
        'wakapdar' => [
            'manage_santri',
            'view_reports'
        ],
        'wali_kelas' => [
            'manage_santri',
            'view_reports'
        ],
        'guru' => [
            'view_reports'
        ],
        'waka_lembaga' => [
            'manage_santri',
            'view_reports',
            'manage_finance'
        ],
        'ketua_lembaga' => [
            'manage_santri',
            'view_reports',
            'manage_finance'
        ],
        'admin_umroh' => [
            'manage_uwaba',
            'manage_umroh',
            'view_reports',
            'manage_finance'
        ],
        'petugas_umroh' => [
            'manage_uwaba',
            'manage_umroh',
            'view_reports'
        ],
        'user_umroh' => [
            'view_reports'
        ],
        'admin_psb' => [
            'manage_santri',
            'manage_psb',
            'view_reports'
        ],
        'petugas_psb' => [
            'manage_psb',
            'view_reports'
        ],
        'admin_ijin' => [
            'manage_ijin',
            'view_reports'
        ],
        'petugas_ijin' => [
            'manage_ijin',
            'view_reports'
        ],
        'admin_ugt' => [
            'view_reports'
        ],
        'admin_kalender' => [
            'view_reports',
        ],
        'koordinator_ugt' => [
            'view_reports'
        ],
        'petugas_keuangan' => [
            'manage_finance',
            'view_reports',
        ],
        'santri' => [],
        'admin_wirid' => [
            'view_reports',
        ],
    ];

    /**
     * Label untuk setiap role
     */
    const ROLE_LABELS = [
        'super_admin' => 'Super Admin',
        'admin_uwaba' => 'Admin UWABA',
        'petugas_uwaba' => 'Petugas UWABA',
        'admin_lembaga' => 'Admin Lembaga',
        'tarbiyah' => 'Tarbiyah',
        'admin_daerah' => 'Admin Daerah',
        'admin_domisili' => 'Admin Domisili',
        'admin_diniyah' => 'Admin Diniyah',
        'admin_formal' => 'Admin Formal',
        'kapdar' => 'Kapdar',
        'wakapdar' => 'Wakapdar',
        'wali_kelas' => 'Wali Kelas',
        'guru' => 'Guru',
        'waka_lembaga' => 'Waka Lembaga',
        'ketua_lembaga' => 'Ketua Lembaga',
        'admin_umroh' => 'Admin Umroh',
        'petugas_umroh' => 'Petugas Umroh',
        'user_umroh' => 'User Umroh',
        'admin_psb' => 'Admin PSB',
        'petugas_psb' => 'Petugas PSB',
        'admin_ijin' => 'Admin Ijin',
        'petugas_ijin' => 'Petugas Ijin',
        'admin_ugt' => 'Admin UGT (Urusan Guru Tugas)',
        'admin_kalender' => 'Admin Kalender',
        'koordinator_ugt' => 'Koordinator UGT',
        'petugas_keuangan' => 'Petugas Keuangan',
        'santri' => 'Santri',
        /** Token JWT saat pengurus punya lebih dari satu role (bukan baris di tabel role). */
        'multi_role' => 'Beberapa role',
        'admin_wirid' => 'Admin Wirid',
    ];

    /**
     * Cek apakah role bisa mengakses aplikasi tertentu
     * 
     * @param string $roleKey Key role (contoh: 'super_admin')
     * @param string $appKey Key aplikasi (contoh: 'uwaba')
     * @return bool
     */
    public static function canAccessApp(string $roleKey, string $appKey): bool
    {
        $roleKey = strtolower($roleKey);
        $appKey = strtolower($appKey);
        
        if (!isset(self::ROLE_ALLOWED_APPS[$roleKey])) {
            return false;
        }
        
        return in_array($appKey, self::ROLE_ALLOWED_APPS[$roleKey]);
    }

    /**
     * Cek apakah role memiliki permission tertentu
     * 
     * @param string $roleKey Key role
     * @param string $permission Key permission
     * @return bool
     */
    public static function hasPermission(string $roleKey, string $permission): bool
    {
        $roleKey = strtolower($roleKey);
        $permission = strtolower($permission);
        
        if (!isset(self::ROLE_PERMISSIONS[$roleKey])) {
            return false;
        }
        
        return in_array($permission, self::ROLE_PERMISSIONS[$roleKey]);
    }

    /**
     * Dapatkan daftar aplikasi yang bisa diakses oleh role
     * 
     * @param string $roleKey Key role
     * @return array
     */
    public static function getAllowedApps(string $roleKey): array
    {
        $roleKey = strtolower($roleKey);
        
        return self::ROLE_ALLOWED_APPS[$roleKey] ?? [];
    }

    /**
     * Dapatkan daftar permissions untuk role
     * 
     * @param string $roleKey Key role
     * @return array
     */
    public static function getPermissions(string $roleKey): array
    {
        $roleKey = strtolower($roleKey);
        
        return self::ROLE_PERMISSIONS[$roleKey] ?? [];
    }

    /**
     * Dapatkan label role
     * 
     * @param string $roleKey Key role
     * @return string
     */
    public static function getRoleLabel(string $roleKey): string
    {
        $roleKey = strtolower($roleKey);
        
        return self::ROLE_LABELS[$roleKey] ?? $roleKey;
    }

    /**
     * Validasi apakah role key valid
     * 
     * @param string $roleKey Key role
     * @return bool
     */
    public static function isValidRole(string $roleKey): bool
    {
        $roleKey = strtolower($roleKey);
        
        return isset(self::ROLE_LABELS[$roleKey]);
    }

    /**
     * Role yang membuat baris pengurus___role dianggap "tidak dibatasi satu lembaga"
     * (gabungan multi-role: cukup satu role ini → akses semua lembaga untuk scope data).
     */
    private const ROLE_KEYS_UNRESTRICTED_LEMBAGA = [
        'super_admin',
        'admin_uwaba',
        'petugas_uwaba',
        'admin_ugt',
        'koordinator_ugt',
    ];

    /**
     * True jika role ini secara kebijakan tidak di-scope ke satu lembaga saja.
     */
    public static function roleHasUnrestrictedLembagaScope(string $roleKey): bool
    {
        $k = str_replace(' ', '_', strtolower(trim($roleKey)));

        return in_array($k, self::ROLE_KEYS_UNRESTRICTED_LEMBAGA, true);
    }
}

