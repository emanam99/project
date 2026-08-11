<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Agen otomasi Chat AI: job konfirmasi + snapshot rollback.
 * Fitur eBeddien: action.chat_ai.agent.use | action.chat_ai.agent.confirm_write
 */
final class AiAgentJobsAndFitur extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            <<<SQL
CREATE TABLE IF NOT EXISTS `ai___agent_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `users_id` INT UNSIGNED NOT NULL COMMENT 'users.id pemilik job',
  `pengurus_id` INT UNSIGNED NULL COMMENT 'pengurus.id dari token',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation',
  `confirm_token_hash` CHAR(64) NOT NULL COMMENT 'sha256 hex',
  `confirm_expires_at` DATETIME NOT NULL,
  `rollback_until` DATETIME NULL,
  `model_used` VARCHAR(64) NULL,
  `user_prompt` TEXT NOT NULL,
  `assistant_raw` MEDIUMTEXT NULL,
  `actions_json` JSON NOT NULL,
  `summary_for_user` VARCHAR(512) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai___agent_jobs_user_status` (`users_id`, `status`),
  KEY `idx_ai___agent_jobs_confirm_exp` (`confirm_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
        );

        $this->execute(
            <<<SQL
CREATE TABLE IF NOT EXISTS `ai___agent_job_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `table_key` VARCHAR(64) NOT NULL,
  `row_key` VARCHAR(128) NOT NULL,
  `before_json` JSON NOT NULL,
  `after_json` JSON NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ai___agent_job_snapshots_job` (`job_id`),
  CONSTRAINT `fk_ai___agent_job_snapshots_job`
    FOREIGN KEY (`job_id`) REFERENCES `ai___agent_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
        );

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
            ['action.chat_ai.agent.use', 'Chat AI · Agen otomasi (usulkan aksi)', 62, $metaSuper],
            ['action.chat_ai.agent.confirm_write', 'Chat AI · Konfirmasi tulis agen', 64, $metaSuper],
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
        $this->execute('DROP TABLE IF EXISTS `ai___agent_job_snapshots`');
        $this->execute('DROP TABLE IF EXISTS `ai___agent_jobs`');
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.chat_ai.agent.use','action.chat_ai.agent.confirm_write')"
        );
    }
}
