<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Riwayat kamar: id_pengurus boleh NULL = perubahan oleh santri sendiri (mis. aplikasi daftar).
 */
final class SantriKamarIdPengurusNullable extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___kamar')) {
            return;
        }
        $table = $this->table('santri___kamar');
        $table->dropForeignKey('id_pengurus')->save();
        $table->changeColumn('id_pengurus', 'integer', ['signed' => true, 'null' => true])->save();
        $table->addForeignKey('id_pengurus', 'pengurus', 'id', [
            'delete' => 'RESTRICT',
            'update' => 'CASCADE',
        ])->save();
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___kamar')) {
            return;
        }
        $conn = $this->getAdapter()->getConnection();
        $row = $conn->query('SELECT id FROM pengurus ORDER BY id ASC LIMIT 1')->fetch(\PDO::FETCH_ASSOC);
        $fallback = $row ? (int) $row['id'] : 1;
        $this->execute('UPDATE santri___kamar SET id_pengurus = ' . $fallback . ' WHERE id_pengurus IS NULL');

        $table = $this->table('santri___kamar');
        $table->dropForeignKey('id_pengurus')->save();
        $table->changeColumn('id_pengurus', 'integer', ['signed' => true, 'null' => false])->save();
        $table->addForeignKey('id_pengurus', 'pengurus', 'id', [
            'delete' => 'RESTRICT',
            'update' => 'CASCADE',
        ])->save();
    }
}
