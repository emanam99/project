<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Menu My Workspace: MyBeddien — mirror role___fitur dari yang punya menu.profil. */
final class MenuMybeddianWorkspace extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $conn->exec(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
             VALUES (1, NULL, 'menu', 'menu.mybeddian', 'MyBeddien', '/mybeddian', 'link', 'My Workspace', 16, NULL)"
        );
        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`id_app` = 1 AND fold.`type` = 'menu' AND fold.`code` = 'menu.profil'
INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1 AND fnew.`type` = 'menu' AND fnew.`code` = 'menu.mybeddian'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `role___fitur` WHERE `fitur_id` IN (SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.mybeddian')"
        );
        $this->execute("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.mybeddian'");
    }
}
