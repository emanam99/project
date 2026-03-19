<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom id_user di payment untuk notifikasi WA mybeddian (Uwaba/Khusus/Tunggakan).
 * Nomor WA diambil dari users.no_wa (nomor yang dipakai verifikasi login).
 */
final class PaymentAddIdUser extends AbstractMigration
{
    private function hasColumn(string $tableName, string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
            LIMIT 1
        ");
        $stmt->execute([$tableName, $columnName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        if (!$this->hasColumn('payment', 'id_user')) {
            $this->execute('ALTER TABLE payment ADD COLUMN id_user INT(11) NULL DEFAULT NULL COMMENT \'FK users.id - untuk notif WA mybeddian\' AFTER id_santri');
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        try {
            $this->execute('ALTER TABLE payment ADD CONSTRAINT fk_payment_id_user FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE');
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'Duplicate foreign key') === false) {
                throw $e;
            }
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('ALTER TABLE payment DROP FOREIGN KEY fk_payment_id_user');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
        if ($this->hasColumn('payment', 'id_user')) {
            $this->execute('ALTER TABLE payment DROP COLUMN id_user');
        }
    }
}
