<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Seed: isi tabel role (master role aplikasi).
 *
 * Cara pakai: php vendor/bin/phinx seed:run -s RoleSeed
 * Aman dijalankan berulang: pakai INSERT IGNORE (id + key unik), tidak timpa data yang sudah ada.
 * Role baru juga bisa ditambah dari eBeddien (Role & Akses → Tambah role) tanpa ubah kode;
 * entri di bawah hanya baseline instalasi awal.
 */
class RoleSeed extends AbstractSeed
{
    /** [id, key, label] — id sengaja tetap agar referensi (role_id) konsisten. */
    private array $entries = [
        [1, 'super_admin', 'Super Admin'],
        [2, 'admin_uwaba', 'Admin UWABA'],
        [3, 'admin_lembaga', 'Admin Lembaga'],
        [4, 'petugas_uwaba', 'Petugas UWABA'],
        [5, 'wali_kelas', 'Wali Kelas'],
        [6, 'guru', 'Guru'],
        [7, 'ketua_lembaga', 'Ketua Lembaga'],
        [8, 'admin_umroh', 'Admin Umroh'],
        [9, 'petugas_umroh', 'Petugas Umroh'],
        [10, 'user_umroh', 'User Umroh'],
        [15, 'admin_psb', 'Admin PSB'],
        [16, 'petugas_psb', 'Petugas PSB'],
        [17, 'waka_lembaga', 'Waka Lembaga'],
        [18, 'admin_ijin', 'Admin Ijin'],
        [19, 'petugas_ijin', 'Petugas Ijin'],
        [20, 'santri', 'Santri'],
        [21, 'wali_santri', 'Wali Santri'],
        [22, 'admin_kalender', 'Admin Kalender'],
        [23, 'admin_ugt', 'Admin UGT (Urusan Guru Tugas)'],
        [24, 'koordinator_ugt', 'Koordinator UGT'],
        [25, 'admin_cashless', 'Admin Cashless'],
        [26, 'petugas_cashless', 'Petugas Cashless'],
        [27, 'tarbiyah', 'Tarbiyah'],
        [28, 'petugas_keuangan', 'Petugas Keuangan'],
        [29, 'admin_daerah', 'Admin Daerah'],
        [30, 'kapdar', 'Kapdar'],
        [31, 'wakapdar', 'Wakapdar'],
        [32, 'admin_domisili', 'Admin Domisili'],
        [33, 'admin_wirid', 'Admin Wirid'],
    ];

    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();
        foreach ($this->entries as $r) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO role (id, `key`, label) VALUES (%d, %s, %s)",
                $r[0],
                $conn->quote($r[1]),
                $conn->quote($r[2])
            ));
        }
    }
}
