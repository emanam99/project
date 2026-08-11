<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Guru FAN tambahan per baris wali kelas (banyak pengurus selain wali utama).
 */
final class LembagaWaliKelasGuruFan extends AbstractMigration
{
    public function change(): void
    {
        if (!$this->hasTable('lembaga___wali_kelas') || !$this->hasTable('pengurus')) {
            return;
        }
        if ($this->hasTable('lembaga___wali_kelas_guru_fan')) {
            return;
        }
        $this->table('lembaga___wali_kelas_guru_fan', ['id' => true, 'signed' => false])
            ->addColumn('id_wali_kelas', 'integer', ['signed' => true, 'null' => false])
            ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => false])
            ->addColumn('urutan', 'integer', ['signed' => false, 'default' => 0])
            ->addIndex(['id_wali_kelas'])
            ->addForeignKey('id_wali_kelas', 'lembaga___wali_kelas', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
            ->addForeignKey('id_pengurus', 'pengurus', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
            ->create();
    }
}
