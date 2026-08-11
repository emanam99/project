<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Pengaturan Chat AI — hak akses lewat Fitur (role___fitur).
 */
final class ChatAiTabPengaturanFitur extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.chat_ai']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];
        $metaSuper = '{"requiresSuperAdmin":true}';
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'My Workspace\', ?, ?)'
        );
        $ins->execute([
            $parentId,
            'action.chat_ai.page.pengaturan',
            'Chat AI · Tab · Pengaturan',
            45,
            $metaSuper,
        ]);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.chat_ai.page.pengaturan'"
        );
    }
}
