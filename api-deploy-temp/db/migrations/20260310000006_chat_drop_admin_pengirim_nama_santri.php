<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus kolom admin_pengirim dan nama_santri dari chat.
 * Pengirim hanya pakai id_pengurus; nama santri dari FK id_santri ke santri.
 */
final class ChatDropAdminPengirimNamaSantri extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $conn = $this->getAdapter()->getConnection();

        $tables = $conn->query("SHOW TABLES LIKE 'chat'")->fetchAll();
        if (empty($tables)) {
            return;
        }

        $cols = $conn->query("SHOW COLUMNS FROM chat")->fetchAll(\PDO::FETCH_ASSOC);
        $colNames = array_column($cols, 'Field');

        if (in_array('admin_pengirim', $colNames, true)) {
            $conn->exec('ALTER TABLE chat DROP COLUMN admin_pengirim');
        }

        if (in_array('nama_santri', $colNames, true)) {
            $conn->exec('ALTER TABLE chat DROP COLUMN nama_santri');
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $tables = $conn->query("SHOW TABLES LIKE 'chat'")->fetchAll();
        if (empty($tables)) {
            return;
        }

        $cols = $conn->query("SHOW COLUMNS FROM chat")->fetchAll(\PDO::FETCH_ASSOC);
        $colNames = array_column($cols, 'Field');

        if (!in_array('admin_pengirim', $colNames, true)) {
            $conn->exec("ALTER TABLE chat ADD COLUMN admin_pengirim VARCHAR(100) NULL AFTER nomor_aktif");
        }

        if (!in_array('nama_santri', $colNames, true)) {
            $conn->exec("ALTER TABLE chat ADD COLUMN nama_santri VARCHAR(255) NULL AFTER id_santri");
        }
    }
}
