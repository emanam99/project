<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * AppFiturMenuSeed (pathToCode) menyisipkan menu.website.berita.kategori & .galeri.kategori;
 * migrasi Website memakai menu.website.berita_kategori & .galeri_kategori — path sama, dua baris → menu ganda di UI.
 * Hapus varian titik (seed) dan penugasan role-nya; canonical tetap kode dengan underscore dari migrasi.
 */
final class WebsiteMenuHapusDuplikatSeed extends AbstractMigration
{
    private const DUPLIKAT_CODES = [
        'menu.website.berita.kategori',
        'menu.website.galeri.kategori',
    ];

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $in = implode(',', array_map(static fn ($c) => $conn->quote($c), self::DUPLIKAT_CODES));

        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
             WHERE f.`id_app` = 1 AND f.`type` = 'menu' AND f.`code` IN ($in)"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` IN ($in)"
        );
    }

    public function down(): void
    {
        // Tidak mengembalikan baris duplikat — seed yang diperbaiki tidak akan membuatnya lagi.
    }
}
