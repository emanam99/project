<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * psb___kondisi_field, psb___kondisi_value, psb___item, psb___item_set, psb___item_set_kondisi_rel, psb___item_set_detail, psb___pengaturan.
 */
final class PsbKondisiItem extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___kondisi_field` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_name` varchar(50) NOT NULL COMMENT 'Nama field di tabel psb___registrasi (contoh: status_pendaftar, daftar_formal)',
  `field_label` varchar(100) NOT NULL COMMENT 'Label untuk tampilan (contoh: "Status Pendaftar", "Daftar Formal")',
  `field_type` enum('string','number','date') DEFAULT 'string' COMMENT 'Tipe data field',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Aktif/tidak aktif',
  `urutan` int(11) DEFAULT NULL COMMENT 'Urutan tampil',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_field_name` (`field_name`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_urutan` (`urutan`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___kondisi_value` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_field` int(11) NOT NULL COMMENT 'ID field dari psb___kondisi_field',
  `value` varchar(255) NOT NULL COMMENT 'Nilai kondisi (contoh: "Santri Baru", "SMAI", "Mukim")',
  `value_label` varchar(255) DEFAULT NULL COMMENT 'Label untuk tampilan (bisa berbeda dengan value)',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Aktif/tidak aktif',
  `urutan` int(11) DEFAULT NULL COMMENT 'Urutan tampil',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_field_value` (`id_field`,`value`),
  KEY `fk_kondisi_value_field` (`id_field`),
  KEY `idx_value` (`value`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_urutan` (`urutan`),
  CONSTRAINT `fk_kondisi_value_field` FOREIGN KEY (`id_field`) REFERENCES `psb___kondisi_field` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___item` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kategori` varchar(50) DEFAULT NULL,
  `urutan` int(11) DEFAULT NULL,
  `item` varchar(255) NOT NULL,
  `harga` int(10) DEFAULT NULL,
  `dari` date DEFAULT current_timestamp(),
  `sampai` date DEFAULT NULL,
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `kategori` (`kategori`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___item_set` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_set` varchar(255) NOT NULL COMMENT 'Nama set (contoh: "Santri Baru SMA Mukim")',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Aktif/tidak aktif (1=aktif, 0=nonaktif)',
  `urutan` int(11) DEFAULT NULL COMMENT 'Urutan prioritas (lebih kecil = lebih prioritas, untuk matching)',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan tambahan tentang set ini',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_urutan` (`urutan`),
  KEY `idx_nama_set` (`nama_set`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___item_set_kondisi_rel` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_item_set` int(11) NOT NULL COMMENT 'ID set dari psb___item_set',
  `id_kondisi_value` int(11) NOT NULL COMMENT 'ID value dari psb___kondisi_value',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_set_kondisi` (`id_item_set`,`id_kondisi_value`),
  KEY `fk_set_kondisi_set` (`id_item_set`),
  KEY `fk_set_kondisi_value` (`id_kondisi_value`),
  CONSTRAINT `fk_set_kondisi_set` FOREIGN KEY (`id_item_set`) REFERENCES `psb___item_set` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_set_kondisi_value` FOREIGN KEY (`id_kondisi_value`) REFERENCES `psb___kondisi_value` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1940 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___item_set_detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_item_set` int(11) NOT NULL COMMENT 'ID set dari psb___item_set',
  `id_item` int(11) NOT NULL COMMENT 'ID item dari psb___item',
  `urutan` int(11) DEFAULT NULL COMMENT 'Urutan item dalam set (untuk sorting)',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_set_item` (`id_item_set`,`id_item`),
  KEY `fk_item_set_detail_set` (`id_item_set`),
  KEY `fk_item_set_detail_item` (`id_item`),
  KEY `idx_urutan` (`urutan`),
  CONSTRAINT `fk_item_set_detail_item` FOREIGN KEY (`id_item`) REFERENCES `psb___item` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_item_set_detail_set` FOREIGN KEY (`id_item_set`) REFERENCES `psb___item_set` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2025 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___pengaturan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(100) NOT NULL COMMENT 'Key identifier pengaturan (unique)',
  `value` text DEFAULT NULL COMMENT 'Nilai pengaturan (bisa text, JSON, path file, dll)',
  `type` varchar(50) NOT NULL DEFAULT 'text' COMMENT 'Tipe pengaturan: text, image, number, json, boolean, dll',
  `label` varchar(255) NOT NULL COMMENT 'Label yang ditampilkan di form',
  `keterangan` text DEFAULT NULL COMMENT 'Deskripsi/keterangan pengaturan',
  `kategori` varchar(50) DEFAULT NULL COMMENT 'Kategori pengaturan untuk grouping',
  `urutan` int(11) DEFAULT 0 COMMENT 'Urutan tampil (untuk sorting)',
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_key` (`key`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_type` (`type`),
  KEY `idx_urutan` (`urutan`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
        ];

        foreach ($statements as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS psb___pengaturan');
        $this->execute('DROP TABLE IF EXISTS psb___item_set_detail');
        $this->execute('DROP TABLE IF EXISTS psb___item_set_kondisi_rel');
        $this->execute('DROP TABLE IF EXISTS psb___item_set');
        $this->execute('DROP TABLE IF EXISTS psb___item');
        $this->execute('DROP TABLE IF EXISTS psb___kondisi_value');
        $this->execute('DROP TABLE IF EXISTS psb___kondisi_field');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
