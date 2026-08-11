<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul Website Pesantren: tabel master untuk konten web publik
 * (berita, kategori berita, banner home, halaman statis, galeri foto + kategorinya, dan SEO global).
 *
 * Idempoten: CREATE TABLE IF NOT EXISTS, semua FK didefinisikan inline dengan ON DELETE/UPDATE jelas.
 * FK author_pengurus_id ke `pengurus` (bukan ke `users`), selaras pola controller eBeddien lain.
 */
final class WebsiteTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___kategori_berita` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(120) NOT NULL,
  `nama` varchar(160) NOT NULL,
  `urutan` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_website_kategori_berita_slug` (`slug`),
  KEY `idx_website_kategori_berita_urutan` (`urutan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kategori berita untuk web publik'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___berita` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(200) NOT NULL,
  `judul` varchar(255) NOT NULL,
  `ringkasan` text DEFAULT NULL,
  `konten_html` longtext DEFAULT NULL,
  `cover_url` varchar(500) DEFAULT NULL,
  `kategori_id` int(11) DEFAULT NULL,
  `status` enum('draft','publish') NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `og_title` varchar(255) DEFAULT NULL,
  `og_description` varchar(500) DEFAULT NULL,
  `og_image` varchar(500) DEFAULT NULL,
  `author_pengurus_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_website_berita_slug` (`slug`),
  KEY `idx_website_berita_status_pub` (`status`, `published_at`),
  KEY `idx_website_berita_kategori` (`kategori_id`),
  KEY `idx_website_berita_author` (`author_pengurus_id`),
  CONSTRAINT `fk_website_berita_kategori` FOREIGN KEY (`kategori_id`) REFERENCES `website___kategori_berita` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_website_berita_pengurus` FOREIGN KEY (`author_pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Berita web publik (CRUD admin Website)'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___banner` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `judul` varchar(255) NOT NULL,
  `gambar_url` varchar(500) NOT NULL,
  `link_url` varchar(500) DEFAULT NULL,
  `urutan` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `periode_mulai` date DEFAULT NULL,
  `periode_akhir` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_website_banner_urutan` (`urutan`),
  KEY `idx_website_banner_aktif` (`aktif`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Banner beranda web publik'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___halaman` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(200) NOT NULL,
  `judul` varchar(255) NOT NULL,
  `konten_html` longtext DEFAULT NULL,
  `og_title` varchar(255) DEFAULT NULL,
  `og_description` varchar(500) DEFAULT NULL,
  `og_image` varchar(500) DEFAULT NULL,
  `status` enum('draft','publish') NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_website_halaman_slug` (`slug`),
  KEY `idx_website_halaman_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Halaman statis (Tentang, Kontak, dll)'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___kategori_galeri` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(120) NOT NULL,
  `nama` varchar(160) NOT NULL,
  `urutan` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_website_kategori_galeri_slug` (`slug`),
  KEY `idx_website_kategori_galeri_urutan` (`urutan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kategori album galeri'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___galeri` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `judul` varchar(255) NOT NULL,
  `deskripsi` text DEFAULT NULL,
  `gambar_url` varchar(500) NOT NULL,
  `kategori_id` int(11) DEFAULT NULL,
  `urutan` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_website_galeri_kategori` (`kategori_id`),
  KEY `idx_website_galeri_urutan` (`urutan`),
  CONSTRAINT `fk_website_galeri_kategori` FOREIGN KEY (`kategori_id`) REFERENCES `website___kategori_galeri` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Foto galeri web publik'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `website___seo_global` (
  `key` varchar(80) NOT NULL,
  `value` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pengaturan SEO global web publik (key-value)'
SQL);

        // Seed default SEO global (idempoten via INSERT IGNORE)
        $defaults = [
            ['site_title', 'Pesantren'],
            ['site_description', 'Website resmi Pondok Pesantren'],
            ['site_keywords', 'pesantren, pondok, santri, kajian'],
            ['og_default_title', 'Pondok Pesantren'],
            ['og_default_description', 'Pendidikan Islam terpadu, mencetak generasi berakhlak mulia.'],
            ['og_default_image', ''],
            ['twitter_handle', ''],
            ['favicon_url', ''],
        ];
        foreach ($defaults as [$k, $v]) {
            $kEsc = str_replace("'", "''", $k);
            $vEsc = str_replace("'", "''", $v);
            $this->execute("INSERT IGNORE INTO `website___seo_global` (`key`, `value`) VALUES ('{$kEsc}', '{$vEsc}')");
        }
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `website___galeri`');
        $this->execute('DROP TABLE IF EXISTS `website___kategori_galeri`');
        $this->execute('DROP TABLE IF EXISTS `website___halaman`');
        $this->execute('DROP TABLE IF EXISTS `website___banner`');
        $this->execute('DROP TABLE IF EXISTS `website___berita`');
        $this->execute('DROP TABLE IF EXISTS `website___kategori_berita`');
        $this->execute('DROP TABLE IF EXISTS `website___seo_global`');
    }
}
