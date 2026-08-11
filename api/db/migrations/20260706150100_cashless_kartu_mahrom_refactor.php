<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Hapus kartu WALI (CW); kartu MAHROM terhubung ke tabel mahrom. */
final class CashlessKartuMahromRefactor extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }

        $this->execute("DELETE FROM cashless___kartu WHERE card_type = 'WALI'");

        $table = $this->table('cashless___kartu');
        if ($table->hasColumn('wali_holder')) {
            $table->removeColumn('wali_holder')->update();
        }

        if (!$table->hasColumn('mahrom_id')) {
            $table->addColumn('mahrom_id', 'integer', [
                'null' => true,
                'default' => null,
                'signed' => true,
                'after' => 'user_id',
                'comment' => 'FK mahrom untuk kartu CM',
            ])->update();
        } else {
            // Selaraskan tipe dengan mahrom.id (signed int)
            $this->execute(
                'ALTER TABLE cashless___kartu
                 MODIFY COLUMN mahrom_id int(11) DEFAULT NULL COMMENT \'FK mahrom untuk kartu CM\''
            );
        }

        $this->execute(
            "ALTER TABLE cashless___kartu
             MODIFY COLUMN card_type enum('SANTRI','MAHROM') NOT NULL
             COMMENT 'CS=SANTRI transaksi, CM=MAHROM'"
        );

        $fkExists = $this->fetchRow(
            "SELECT 1 AS ok FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cashless___kartu'
               AND CONSTRAINT_NAME = 'fk_cashless___kartu_mahrom'
               AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
        );
        if (!$fkExists) {
            $this->execute(
                'ALTER TABLE cashless___kartu
                 ADD CONSTRAINT fk_cashless___kartu_mahrom
                 FOREIGN KEY (mahrom_id) REFERENCES mahrom(id)
                 ON DELETE SET NULL ON UPDATE CASCADE'
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        try {
            $this->execute('ALTER TABLE cashless___kartu DROP FOREIGN KEY fk_cashless___kartu_mahrom');
        } catch (\Throwable $e) {
            // abaikan
        }
        $table = $this->table('cashless___kartu');
        if ($table->hasColumn('mahrom_id')) {
            $table->removeColumn('mahrom_id')->update();
        }
        $this->execute(
            "ALTER TABLE cashless___kartu
             MODIFY COLUMN card_type enum('SANTRI','MAHROM','WALI') NOT NULL"
        );
    }
}
