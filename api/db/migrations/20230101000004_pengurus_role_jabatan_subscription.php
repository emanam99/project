<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * pengurus___role, pengurus___jabatan, pengurus___subscription (versi ringkas).
 * Biasanya sudah ada dari migrasi 03; IF NOT EXISTS = aman. Semua definisi inline di PHP.
 */
final class PengurusRoleJabatanSubscription extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS pengurus___role (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pengurus_id INT NOT NULL,
  role_id INT NOT NULL,
  lembaga_id VARCHAR(50) NULL,
  id_admin INT NULL,
  tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pengurus (pengurus_id),
  INDEX idx_role_lembaga (role_id, lembaga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS pengurus___jabatan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pengurus_id INT NOT NULL,
  jabatan_id INT NOT NULL,
  lembaga_id VARCHAR(50) NULL,
  tanggal_mulai DATE,
  tanggal_selesai DATE,
  status VARCHAR(50),
  id_admin INT NULL,
  tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tanggal_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pengurus (pengurus_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS pengurus___subscription (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_pengurus INT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  user_agent VARCHAR(500),
  tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tanggal_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_endpoint (endpoint(255)),
  INDEX idx_pengurus (id_pengurus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS pengurus___subscription');
        $this->execute('DROP TABLE IF EXISTS pengurus___jabatan');
        $this->execute('DROP TABLE IF EXISTS pengurus___role');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
