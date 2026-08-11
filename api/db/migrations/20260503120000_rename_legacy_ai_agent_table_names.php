<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menyamakan penamaan dengan konvensi repo (grup kata pertama + ___ + sisa), mis. ai___chat.
 * Memindahkan ai_agent_* → ai___agent_* bila migrasi lama sudah pernah dijalankan.
 */
final class RenameLegacyAiAgentTableNames extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('ai___agent_jobs')) {
            return;
        }
        if (!$this->hasTable('ai_agent_jobs')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $dbName = $this->fetchDatabaseName($conn);
        if ($dbName === '') {
            return;
        }

        if ($this->hasTable('ai_agent_job_snapshots')) {
            foreach ($this->fetchForeignKeyNames($conn, $dbName, 'ai_agent_job_snapshots') as $fkName) {
                $safeFk = str_replace('`', '``', $fkName);
                $conn->exec("ALTER TABLE `ai_agent_job_snapshots` DROP FOREIGN KEY `{$safeFk}`");
            }
        }

        $conn->exec('RENAME TABLE `ai_agent_jobs` TO `ai___agent_jobs`');

        if ($this->hasTable('ai_agent_job_snapshots')) {
            $conn->exec('RENAME TABLE `ai_agent_job_snapshots` TO `ai___agent_job_snapshots`');
            $conn->exec(
                'ALTER TABLE `ai___agent_job_snapshots` '
                . 'ADD CONSTRAINT `fk_ai___agent_job_snapshots_job` '
                . 'FOREIGN KEY (`job_id`) REFERENCES `ai___agent_jobs` (`id`) ON DELETE CASCADE'
            );
        }
    }

    public function down(): void
    {
        if ($this->hasTable('ai_agent_jobs')) {
            return;
        }
        if (!$this->hasTable('ai___agent_jobs')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $dbName = $this->fetchDatabaseName($conn);
        if ($dbName === '') {
            return;
        }

        if ($this->hasTable('ai___agent_job_snapshots')) {
            foreach ($this->fetchForeignKeyNames($conn, $dbName, 'ai___agent_job_snapshots') as $fkName) {
                $safeFk = str_replace('`', '``', $fkName);
                $conn->exec("ALTER TABLE `ai___agent_job_snapshots` DROP FOREIGN KEY `{$safeFk}`");
            }
            $conn->exec('RENAME TABLE `ai___agent_job_snapshots` TO `ai_agent_job_snapshots`');
        }

        $conn->exec('RENAME TABLE `ai___agent_jobs` TO `ai_agent_jobs`');

        if ($this->hasTable('ai_agent_job_snapshots')) {
            $conn->exec(
                'ALTER TABLE `ai_agent_job_snapshots` '
                . 'ADD CONSTRAINT `fk_ai_agent_snapshots_job` '
                . 'FOREIGN KEY (`job_id`) REFERENCES `ai_agent_jobs` (`id`) ON DELETE CASCADE'
            );
        }
    }

    private function fetchDatabaseName(\PDO $conn): string
    {
        $row = $conn->query('SELECT DATABASE() AS db')->fetch(\PDO::FETCH_ASSOC);

        return isset($row['db']) ? trim((string) $row['db']) : '';
    }

    /**
     * @return list<string>
     */
    private function fetchForeignKeyNames(\PDO $conn, string $schema, string $table): array
    {
        $st = $conn->prepare(
            'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS '
            . 'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_TYPE = ?'
        );
        $st->execute([$schema, $table, 'FOREIGN KEY']);
        $out = [];
        while ($row = $st->fetch(\PDO::FETCH_ASSOC)) {
            $n = trim((string) ($row['CONSTRAINT_NAME'] ?? ''));
            if ($n !== '') {
                $out[] = $n;
            }
        }

        return $out;
    }
}
