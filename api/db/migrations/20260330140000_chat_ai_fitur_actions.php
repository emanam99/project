<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Sub-fitur /chat-ai (type=action, parent menu eBeddien chat).
 * Default seed role: requiresSuperAdmin di meta (RoleFiturMenuSeed).
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class ChatAiFiturActions extends AbstractMigration
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
        $actions = [
            ['action.chat_ai.page.training_bank', 'Chat AI · Bank Q&A', 10, $metaSuper],
            ['action.chat_ai.page.training_chat', 'Chat AI · Training Chat', 20, $metaSuper],
            ['action.chat_ai.page.dashboard', 'Chat AI · Dashboard', 30, $metaSuper],
            ['action.chat_ai.page.riwayat', 'Chat AI · Riwayat', 40, $metaSuper],
            ['action.chat_ai.ui.user_ai_settings', 'Chat AI · Pengaturan User AI', 50, $metaSuper],
            ['action.chat_ai.ui.mode_alternatif', 'Chat AI · Mode alternatif (proxy)', 60, $metaSuper],
        ];

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'My Workspace\', ?, ?)'
        );

        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $a[3]]);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.chat_ai.%'"
        );
    }
}
