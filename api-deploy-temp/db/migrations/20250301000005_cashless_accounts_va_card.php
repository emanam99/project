<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Perpanjang cashless___accounts: kode ala VA (panjang), tipe akun INCOME/EXPENSE/EQUITY, card_uid untuk kartu fisik.
 * Tambah tabel config untuk fee transaksi.
 */
final class CashlessAccountsVaCard extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE cashless___accounts MODIFY COLUMN code VARCHAR(32) NOT NULL");
        $this->execute("ALTER TABLE cashless___accounts MODIFY COLUMN type ENUM('ASSET','LIABILITY','INCOME','EXPENSE','EQUITY') NOT NULL");
        $this->execute("ALTER TABLE cashless___accounts ADD COLUMN card_uid VARCHAR(64) NULL AFTER balance_cached");
        $this->execute("ALTER TABLE cashless___accounts ADD KEY idx_card_uid (card_uid(20))");

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___config` (
  `kunci` varchar(64) NOT NULL,
  `nilai` text DEFAULT NULL,
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`kunci`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute("INSERT IGNORE INTO cashless___config (kunci, nilai) VALUES ('fee_percent', '0')");
    }

    public function down(): void
    {
        $this->execute('DELETE FROM cashless___config WHERE kunci = \'fee_percent\'');
        $this->execute('DROP TABLE IF EXISTS cashless___config');
        $this->execute('ALTER TABLE cashless___accounts DROP KEY idx_card_uid');
        $this->execute('ALTER TABLE cashless___accounts DROP COLUMN card_uid');
        $this->execute("ALTER TABLE cashless___accounts MODIFY COLUMN type ENUM('ASSET','LIABILITY') NOT NULL");
        $this->execute('ALTER TABLE cashless___accounts MODIFY COLUMN code VARCHAR(20) NOT NULL');
    }
}
