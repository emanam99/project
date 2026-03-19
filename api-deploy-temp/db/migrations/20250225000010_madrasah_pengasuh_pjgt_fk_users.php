<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * id_pengasuh dan id_pjgt di madrasah: FK dari pengurus.id diganti ke users.id.
 * Menampilkan user (username) yang sudah daftar.
 */
final class MadrasahPengasuhPjgtFkUsers extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $conn = $this->getAdapter()->getConnection();

        // Cek apakah FK ke pengurus ada (nama constraint bisa beda di env)
        $stmt = $conn->query("
            SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'madrasah'
            AND CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND CONSTRAINT_NAME IN ('fk_madrasah_pengasuh', 'fk_madrasah_pjgt')
        ");
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $name = $row['CONSTRAINT_NAME'];
            $col = $name === 'fk_madrasah_pengasuh' ? 'id_pengasuh' : 'id_pjgt';
            $this->execute("ALTER TABLE madrasah DROP FOREIGN KEY `{$name}`");
        }

        // Ubah tipe kolom ke int(11) agar cocok users.id
        $this->execute("ALTER TABLE madrasah MODIFY COLUMN id_pengasuh INT(11) NULL DEFAULT NULL COMMENT 'FK ke users.id'");
        $this->execute("ALTER TABLE madrasah MODIFY COLUMN id_pjgt INT(11) NULL DEFAULT NULL COMMENT 'FK ke users.id'");

        // Konversi nilai lama (pengurus.id) ke users.id via pengurus.id_user
        $this->execute("UPDATE madrasah m INNER JOIN pengurus p ON p.id = m.id_pengasuh SET m.id_pengasuh = p.id_user WHERE m.id_pengasuh IS NOT NULL AND p.id_user IS NOT NULL");
        $this->execute("UPDATE madrasah m INNER JOIN pengurus p ON p.id = m.id_pjgt SET m.id_pjgt = p.id_user WHERE m.id_pjgt IS NOT NULL AND p.id_user IS NOT NULL");
        // Set NULL jika nilai tidak ada di users (sisa pengurus id atau pengurus tanpa id_user)
        $this->execute("UPDATE madrasah m LEFT JOIN users u ON u.id = m.id_pengasuh SET m.id_pengasuh = NULL WHERE m.id_pengasuh IS NOT NULL AND u.id IS NULL");
        $this->execute("UPDATE madrasah m LEFT JOIN users u ON u.id = m.id_pjgt SET m.id_pjgt = NULL WHERE m.id_pjgt IS NOT NULL AND u.id IS NULL");

        $this->execute("ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_id_pengasuh_user FOREIGN KEY (id_pengasuh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE");
        $this->execute("ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_id_pjgt_user FOREIGN KEY (id_pjgt) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute("ALTER TABLE madrasah DROP FOREIGN KEY fk_madrasah_id_pengasuh_user");
        $this->execute("ALTER TABLE madrasah DROP FOREIGN KEY fk_madrasah_id_pjgt_user");

        $this->execute("ALTER TABLE madrasah MODIFY COLUMN id_pengasuh INT(7) NULL DEFAULT NULL COMMENT 'FK ke pengurus.id'");
        $this->execute("ALTER TABLE madrasah MODIFY COLUMN id_pjgt INT(7) NULL DEFAULT NULL COMMENT 'FK ke pengurus.id'");

        $this->execute("ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_pengasuh FOREIGN KEY (id_pengasuh) REFERENCES pengurus(id) ON DELETE SET NULL ON UPDATE CASCADE");
        $this->execute("ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_pjgt FOREIGN KEY (id_pjgt) REFERENCES pengurus(id) ON DELETE SET NULL ON UPDATE CASCADE");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
