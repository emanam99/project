<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul Website: daftarkan menu (grup "Website") + aksi granular
 * pada `app___fitur` (id_app = 1) dan bootstrap `role___fitur` untuk role baru
 * (super_admin, admin_web, petugas_web, conten_web).
 *
 * Penugasan default:
 * - super_admin & admin_web : SEMUA menu + aksi.
 * - petugas_web             : semua menu kecuali `menu.website.seo` + aksi tanpa `*.seo.*`.
 * - conten_web              : hanya menu Berita + Galeri + Halaman, tanpa aksi `*.publish` / `*.hapus` / `*.kelola` / `*.seo`.
 */
final class WebsiteMenuDanActions extends AbstractMigration
{
    private const ID_APP = 1;
    private const GROUP_LABEL = 'Website';

    /** @return list<array{code:string,label:string,path:string,icon:string,sort:int}> */
    private function menus(): array
    {
        return [
            ['code' => 'menu.website.dashboard',        'label' => 'Dashboard Website', 'path' => '/website/dashboard',        'icon' => 'dashboard',     'sort' => 2010],
            ['code' => 'menu.website.berita',           'label' => 'Berita',            'path' => '/website/berita',           'icon' => 'documentText',  'sort' => 2020],
            ['code' => 'menu.website.berita_kategori',  'label' => 'Kategori Berita',   'path' => '/website/berita/kategori',  'icon' => 'documentStack', 'sort' => 2030],
            ['code' => 'menu.website.banner',           'label' => 'Banner Beranda',    'path' => '/website/banner',           'icon' => 'badge',         'sort' => 2040],
            ['code' => 'menu.website.halaman',          'label' => 'Halaman Statis',    'path' => '/website/halaman',          'icon' => 'document',      'sort' => 2050],
            ['code' => 'menu.website.galeri',           'label' => 'Galeri Foto',       'path' => '/website/galeri',           'icon' => 'folder',        'sort' => 2060],
            ['code' => 'menu.website.galeri_kategori',  'label' => 'Kategori Galeri',   'path' => '/website/galeri/kategori',  'icon' => 'documentStack', 'sort' => 2070],
            ['code' => 'menu.website.seo',              'label' => 'Pengaturan SEO',    'path' => '/website/seo',              'icon' => 'cog',           'sort' => 2080],
        ];
    }

    /** @return list<array{parent:string,code:string,label:string,sort:int}> */
    private function actions(): array
    {
        return [
            ['parent' => 'menu.website.berita',  'code' => 'action.website.berita.publish',  'label' => 'Berita · Publikasikan / unpublish', 'sort' => 10],
            ['parent' => 'menu.website.berita',  'code' => 'action.website.berita.hapus',    'label' => 'Berita · Hapus',                     'sort' => 20],
            ['parent' => 'menu.website.banner',  'code' => 'action.website.banner.kelola',   'label' => 'Banner · Tambah / ubah / hapus',     'sort' => 10],
            ['parent' => 'menu.website.halaman', 'code' => 'action.website.halaman.publish', 'label' => 'Halaman · Publikasikan / unpublish', 'sort' => 10],
            ['parent' => 'menu.website.galeri',  'code' => 'action.website.galeri.kelola',   'label' => 'Galeri · Tambah / ubah / hapus',     'sort' => 10],
            ['parent' => 'menu.website.seo',     'code' => 'action.website.seo.ubah',        'label' => 'SEO · Ubah pengaturan global',       'sort' => 10],
        ];
    }

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        // 1) Menu utama
        $insMenu = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (?, NULL, 'menu', ?, ?, ?, ?, ?, ?, NULL)"
        );
        foreach ($this->menus() as $m) {
            $insMenu->execute([self::ID_APP, $m['code'], $m['label'], $m['path'], $m['icon'], self::GROUP_LABEL, $m['sort']]);
        }

        // 2) Aksi granular (anak dari menu)
        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = ? AND `code` = ? LIMIT 1');
        $insAction = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (?, ?, 'action', ?, ?, NULL, NULL, ?, ?, NULL)"
        );
        foreach ($this->actions() as $a) {
            $pidStmt->execute([self::ID_APP, $a['parent']]);
            $row = $pidStmt->fetch(\PDO::FETCH_ASSOC);
            if ($row === false || empty($row['id'])) {
                continue;
            }
            $insAction->execute([self::ID_APP, (int) $row['id'], $a['code'], $a['label'], self::GROUP_LABEL, $a['sort']]);
        }

        // 3) Bootstrap role___fitur
        // a. super_admin & admin_web: semua menu + aksi modul Website
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` IN ('super_admin','admin_web')
               AND f.`id_app` = " . self::ID_APP . "
               AND f.`type` IN ('menu','action')
               AND (f.`code` LIKE 'menu.website.%' OR f.`code` LIKE 'action.website.%')"
        );

        // b. petugas_web: semua menu kecuali SEO, semua aksi kecuali aksi SEO
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = 'petugas_web'
               AND f.`id_app` = " . self::ID_APP . "
               AND (
                    (f.`type` = 'menu'   AND f.`code` LIKE 'menu.website.%'   AND f.`code` <> 'menu.website.seo')
                 OR (f.`type` = 'action' AND f.`code` LIKE 'action.website.%' AND f.`code` NOT LIKE 'action.website.seo.%')
               )"
        );

        // c. conten_web: hanya menu Berita, Halaman, Galeri (+ kategori berita & galeri); tanpa aksi destruktif/publish
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = 'conten_web'
               AND f.`id_app` = " . self::ID_APP . "
               AND f.`type` = 'menu'
               AND f.`code` IN (
                    'menu.website.dashboard',
                    'menu.website.berita',
                    'menu.website.berita_kategori',
                    'menu.website.halaman',
                    'menu.website.galeri',
                    'menu.website.galeri_kategori'
               )"
        );
    }

    public function down(): void
    {
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
             WHERE f.`id_app` = " . self::ID_APP . "
               AND (f.`code` LIKE 'menu.website.%' OR f.`code` LIKE 'action.website.%')"
        );
        $this->execute(
            "DELETE FROM `app___fitur`
             WHERE `id_app` = " . self::ID_APP . "
               AND (`code` LIKE 'menu.website.%' OR `code` LIKE 'action.website.%')"
        );
    }
}
