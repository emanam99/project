<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Lembaga, role, alamat + data role & lembaga. Semua definisi di PHP (tanpa baca file SQL).
 */
final class LembagaRoleAlamat extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga')) {
            $this->table('lembaga', ['id' => false, 'primary_key' => ['id']])
            ->addColumn('id', 'string', ['limit' => 50])
            ->addColumn('nama', 'string', ['limit' => 255, 'null' => true])
            ->addColumn('kategori', 'string', ['limit' => 100, 'null' => true])
            ->addColumn('deskripsi', 'text', ['null' => true])
            ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true])
            ->addColumn('tanggal_update', 'timestamp', ['null' => true, 'update' => 'CURRENT_TIMESTAMP'])
            ->create();
        }

        if (!$this->hasTable('role')) {
            $this->table('role', ['id' => true, 'primary_key' => ['id']])
            ->addColumn('key', 'string', ['limit' => 50])
            ->addColumn('label', 'string', ['limit' => 255])
            ->addIndex(['key'], ['unique' => true])
            ->create();
        }

        if (!$this->hasTable('alamat')) {
            $this->table('alamat', ['id' => false, 'primary_key' => ['id']])
            ->addColumn('id', 'string', ['limit' => 50])
            ->addColumn('nama', 'string', ['limit' => 200])
            ->addColumn('tipe', 'enum', ['values' => ['provinsi', 'kabupaten', 'kecamatan', 'desa', 'dusun']])
            ->addColumn('kode_pos', 'string', ['limit' => 10, 'null' => true])
            ->addColumn('keterangan', 'text', ['null' => true])
            ->addIndex('nama')
            ->addIndex('tipe')
            ->addIndex('kode_pos')
            ->create();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        // Data role: isi via seed — php vendor/bin/phinx seed:run -s RoleSeed
        // Data lembaga: tetap di sini (master awal)
        $lembagaData = [
            ['Garda', 'Garda', 'Keamanan', '', '2026-01-26 12:13:05', null],
            ['Isti\'dadiyah', 'Isti\'dadiyah', 'Diniyah', null, '2025-12-16 18:33:08', '2025-12-29 19:03:06'],
            ['LPBA', 'LPBA', null, null, '2025-12-16 18:33:08', '2025-12-29 19:09:54'],
            ['LTTQ', 'LTTQ', null, null, '2025-12-16 18:33:08', '2025-12-29 19:18:00'],
            ['MTs', 'MTs', 'Formal', null, '2025-12-16 18:33:08', '2025-12-29 19:18:15'],
            ['Pasustren', 'Pasustren', 'Keamanan', '', '2026-01-25 22:08:37', null],
            ['PAUD', 'Paud', 'Formal', null, '2025-12-16 18:33:08', '2025-12-29 19:18:27'],
            ['Pesantren', 'Pesantren', null, null, '2025-12-17 09:16:57', '2026-01-02 09:02:27'],
            ['SMAI', 'SMAI', 'Formal', null, '2025-12-16 18:33:08', '2025-12-29 19:18:45'],
            ['SMP', 'SMP', 'Formal', null, '2025-12-16 18:33:08', '2025-12-29 19:18:59'],
            ['STAI', 'STAI', 'Formal', null, '2025-12-16 18:33:08', '2025-12-29 19:19:11'],
            ['Tepsom', 'Tepsom', '', '', '2026-01-26 12:42:37', null],
            ['UGT', 'Urusan Guru Tugas', null, null, '2025-12-16 18:33:08', '2026-01-02 09:03:12'],
            ['Ula', 'Ula', 'Diniyah', null, '2025-12-16 18:33:08', '2025-12-29 19:19:21'],
            ['Ulya', 'Ulya', 'Diniyah', null, '2025-12-16 18:33:08', '2025-12-29 19:00:30'],
            ['UWABA', 'UWABA Al-Utsmani', '', '', '2025-12-26 19:33:19', null],
            ['Wustha', 'Wustha', 'Diniyah', null, '2025-12-16 18:33:08', '2025-12-29 19:00:22'],
            ['yayasan', 'Yayasan Al-Utsmani', '', '', '2025-12-18 21:51:09', null],
        ];
        $conn = $this->getAdapter()->getConnection();
        foreach ($lembagaData as $l) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO lembaga (id, nama, kategori, deskripsi, tanggal_dibuat, tanggal_update) VALUES (%s, %s, %s, %s, %s, %s)",
                $conn->quote($l[0]),
                $conn->quote($l[1]),
                $l[2] === null ? 'NULL' : $conn->quote($l[2]),
                $l[3] === null ? 'NULL' : $conn->quote($l[3]),
                $l[4] === null ? 'NULL' : $conn->quote($l[4]),
                $l[5] === null ? 'NULL' : $conn->quote($l[5])
            ));
        }
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->table('alamat')->drop()->save();
        $this->table('role')->drop()->save();
        $this->table('lembaga')->drop()->save();
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
