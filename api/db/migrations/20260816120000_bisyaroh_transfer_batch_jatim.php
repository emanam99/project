<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Audit transfer Bisyaroh Bank Jatim: batch file + baris, status transfer per rekap_baris,
 * aksi upload/reconcile, tab Rilis.
 */
final class BisyarohTransferBatchJatim extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___rekap_baris') || !$this->hasTable('pengurus')) {
            return;
        }

        if (!$this->table('bisyaroh___rekap_baris')->hasColumn('transfer_status')) {
            $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh___rekap_baris`
  ADD COLUMN `transfer_status` enum('pending','berhasil','gagal') DEFAULT NULL
    COMMENT 'Status transfer Bank Jatim per baris' AFTER `catatan`,
  ADD COLUMN `transfer_at` timestamp NULL DEFAULT NULL AFTER `transfer_status`,
  ADD COLUMN `transfer_by_pengurus_id` int(7) DEFAULT NULL AFTER `transfer_at`,
  ADD KEY `idx_bisyaroh_rekap_transfer_status` (`transfer_status`)
SQL);
            try {
                $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh___rekap_baris`
  ADD CONSTRAINT `fk_bisyaroh_rekap_transfer_by`
  FOREIGN KEY (`transfer_by_pengurus_id`) REFERENCES `pengurus` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE
SQL);
            } catch (\Throwable $e) {
                /* FK opsional jika adapter tidak mendukung di ALTER */
            }
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___transfer_batch` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis` enum('export_upload','mutasi_hasil') NOT NULL,
  `periode_bulan` char(7) NOT NULL COMMENT 'YYYY-MM',
  `kalender` varchar(16) NOT NULL DEFAULT 'masehi',
  `source_account` varchar(32) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_sha256` char(64) NOT NULL,
  `storage_path` varchar(512) NOT NULL,
  `file_size` int(11) NOT NULL DEFAULT 0,
  `row_count` int(11) NOT NULL DEFAULT 0,
  `total_nominal` bigint(20) NOT NULL DEFAULT 0,
  `lembaga_ids_json` json DEFAULT NULL,
  `matched_export_batch_id` int(11) DEFAULT NULL,
  `status` enum('draft','exported','uploaded','reconciling','done','partial','failed') NOT NULL DEFAULT 'draft',
  `summary_json` json DEFAULT NULL,
  `uploaded_by_pengurus_id` int(7) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_transfer_batch_sha` (`jenis`,`file_sha256`),
  KEY `idx_bisyaroh_transfer_batch_periode` (`periode_bulan`,`kalender`),
  KEY `idx_bisyaroh_transfer_batch_matched` (`matched_export_batch_id`),
  KEY `idx_bisyaroh_transfer_batch_status` (`status`),
  CONSTRAINT `fk_bisyaroh_transfer_batch_uploader` FOREIGN KEY (`uploaded_by_pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_transfer_batch_matched` FOREIGN KEY (`matched_export_batch_id`) REFERENCES `bisyaroh___transfer_batch` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Header file CSV Bisyaroh Bank Jatim (export upload / mutasi hasil)'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___transfer_baris` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batch_id` int(11) NOT NULL,
  `line_no` int(11) NOT NULL,
  `rekening` varchar(32) NOT NULL DEFAULT '',
  `nama` varchar(255) NOT NULL DEFAULT '',
  `nominal` bigint(20) NOT NULL DEFAULT 0,
  `nip` varchar(32) DEFAULT NULL,
  `lembaga_id` varchar(50) DEFAULT NULL,
  `keterangan_2` varchar(128) DEFAULT NULL,
  `bisyaroh_id` int(11) DEFAULT NULL,
  `id_pengurus` int(7) DEFAULT NULL,
  `rekap_baris_id` int(11) DEFAULT NULL,
  `match_status` enum('pending','matched','unmatched','ambiguous','nominal_mismatch') NOT NULL DEFAULT 'pending',
  `transfer_status` enum('pending','berhasil','gagal') NOT NULL DEFAULT 'pending',
  `bank_ref` varchar(64) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `attempt_count` int(11) NOT NULL DEFAULT 0,
  `last_error` varchar(512) DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_transfer_baris_line` (`batch_id`,`line_no`),
  KEY `idx_bisyaroh_transfer_baris_rek` (`rekening`),
  KEY `idx_bisyaroh_transfer_baris_status` (`transfer_status`),
  KEY `idx_bisyaroh_transfer_baris_rekap` (`rekap_baris_id`),
  KEY `idx_bisyaroh_transfer_baris_pengurus` (`id_pengurus`),
  CONSTRAINT `fk_bisyaroh_transfer_baris_batch` FOREIGN KEY (`batch_id`) REFERENCES `bisyaroh___transfer_batch` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_transfer_baris_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_transfer_baris_rekap` FOREIGN KEY (`rekap_baris_id`) REFERENCES `bisyaroh___rekap_baris` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Baris CSV Bisyaroh Bank Jatim + hasil rekonsiliasi'
SQL);

        if (!$this->hasTable('app___fitur')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? AND `type` = \'menu\' LIMIT 1');
        $stmt->execute(['menu.bisyaroh']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $conn->exec(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.tab.rilis', 'Bisyaroh · Tab Rilis (arsip transfer)', NULL, NULL, 'Lembaga', 18, '{$metaEsc}')"
        );
        $conn->exec(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.transfer.upload', 'Bisyaroh · Upload mutasi Bank Jatim', NULL, NULL, 'Lembaga', 19, '{$metaEsc}')"
        );
        $conn->exec(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.transfer.reconcile', 'Bisyaroh · Rekonsiliasi & rilis transfer', NULL, NULL, 'Lembaga', 20, '{$metaEsc}')"
        );

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN (
  'action.bisyaroh.tab.rilis',
  'action.bisyaroh.transfer.upload',
  'action.bisyaroh.transfer.reconcile'
)
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN (
              'action.bisyaroh.tab.rilis',
              'action.bisyaroh.transfer.upload',
              'action.bisyaroh.transfer.reconcile'
            )"
        );
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___transfer_baris`');
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___transfer_batch`');
        if ($this->hasTable('bisyaroh___rekap_baris') && $this->table('bisyaroh___rekap_baris')->hasColumn('transfer_status')) {
            try {
                $this->execute('ALTER TABLE `bisyaroh___rekap_baris` DROP FOREIGN KEY `fk_bisyaroh_rekap_transfer_by`');
            } catch (\Throwable $e) {
            }
            $this->execute('ALTER TABLE `bisyaroh___rekap_baris` DROP COLUMN `transfer_by_pengurus_id`, DROP COLUMN `transfer_at`, DROP COLUMN `transfer_status`');
        }
    }
}
