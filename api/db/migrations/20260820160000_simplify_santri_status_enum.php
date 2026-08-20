<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Status santri: enum string di kode (tanpa master tabel `status`).
 * - santri.status_santri + santri___status.status_santri
 * - drop id_status / FK / tabel status
 */
final class SimplifySantriStatusEnum extends AbstractMigration
{
    private const ALLOWED = ['Mukim', 'Boyong', 'Khoriji', 'Guru Tugas', 'Pengurus', 'Alumni'];

    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('santri') || !$this->hasTable('santri___status')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        if (!$this->table('santri___status')->hasColumn('status_santri')) {
            $this->table('santri___status')
                ->addColumn('status_santri', 'string', ['limit' => 50, 'null' => true, 'after' => 'id_santri'])
                ->addIndex(['status_santri'])
                ->update();
        }

        if (!$this->table('santri')->hasColumn('status_santri')) {
            $this->table('santri')
                ->addColumn('status_santri', 'string', ['limit' => 50, 'null' => true])
                ->addIndex(['status_santri'])
                ->update();
        }

        if ($this->hasTable('status') && $this->table('santri___status')->hasColumn('id_status')) {
            $this->execute('
                UPDATE santri___status ss
                INNER JOIN status st ON st.id = ss.id_status
                SET ss.status_santri = TRIM(st.status_santri)
                WHERE ss.status_santri IS NULL OR TRIM(ss.status_santri) = \'\'
            ');
        }

        if ($this->hasTable('status') && $this->table('santri')->hasColumn('id_status')) {
            $this->execute('
                UPDATE santri s
                INNER JOIN status st ON st.id = s.id_status
                SET s.status_santri = TRIM(st.status_santri)
                WHERE s.status_santri IS NULL OR TRIM(s.status_santri) = \'\'
            ');
        }

        $this->execute('
            UPDATE santri s
            INNER JOIN (
                SELECT ss.id_santri, ss.status_santri
                FROM santri___status ss
                INNER JOIN (
                    SELECT id_santri, MAX(id) AS max_id
                    FROM santri___status
                    WHERE sampai IS NULL
                    GROUP BY id_santri
                ) x ON x.max_id = ss.id
            ) act ON act.id_santri = s.id
            SET s.status_santri = act.status_santri
            WHERE act.status_santri IS NOT NULL AND TRIM(act.status_santri) <> \'\'
        ');

        // Normalisasi ejaan umum → enum kanonis
        $map = [
            'mukim' => 'Mukim',
            'boyong' => 'Boyong',
            'khoriji' => 'Khoriji',
            'guru tugas' => 'Guru Tugas',
            'pengurus' => 'Pengurus',
            'alumni' => 'Alumni',
        ];
        $conn = $this->getAdapter()->getConnection();
        $stmtSs = $conn->prepare('UPDATE santri___status SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
        $stmtS = $conn->prepare('UPDATE santri SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
        foreach ($map as $from => $to) {
            $stmtSs->execute([$to, $from]);
            $stmtS->execute([$to, $from]);
        }

        $allowedList = "'" . implode("','", self::ALLOWED) . "'";
        $this->execute("UPDATE santri___status SET status_santri = 'Mukim' WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN ({$allowedList})");
        $this->execute("UPDATE santri SET status_santri = 'Mukim' WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN ({$allowedList})");

        $this->dropFkOnColumn('santri', 'id_status');
        $this->dropFkOnColumn('santri___status', 'id_status');

        if ($this->table('santri')->hasColumn('id_status')) {
            $this->table('santri')->removeColumn('id_status')->update();
        }
        if ($this->table('santri___status')->hasColumn('id_status')) {
            $this->table('santri___status')->removeColumn('id_status')->update();
        }

        // Pastikan NOT NULL setelah backfill
        $this->execute('ALTER TABLE santri___status MODIFY status_santri VARCHAR(50) NOT NULL');

        if ($this->hasTable('status')) {
            $this->table('status')->drop()->save();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('status')) {
            $this->table('status', ['id' => true])
                ->addColumn('status_santri', 'string', ['limit' => 100, 'null' => false])
                ->addColumn('kategori', 'string', ['limit' => 100, 'null' => false, 'default' => 'Banin'])
                ->addColumn('status', 'string', ['limit' => 20, 'null' => false, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['status_santri', 'kategori'], ['unique' => true, 'name' => 'uq_status_santri_kategori'])
                ->create();
        }

        $conn = $this->getAdapter()->getConnection();
        $ins = $conn->prepare(
            'INSERT IGNORE INTO status (status_santri, kategori, status, tanggal_dibuat) VALUES (?, ?, \'aktif\', CURRENT_TIMESTAMP)'
        );
        foreach (self::ALLOWED as $label) {
            foreach (['Banin', 'Banat'] as $kat) {
                $ins->execute([$label, $kat]);
            }
        }

        if ($this->hasTable('santri___status') && !$this->table('santri___status')->hasColumn('id_status')) {
            $this->table('santri___status')
                ->addColumn('id_status', 'integer', ['signed' => true, 'null' => true, 'after' => 'id_santri'])
                ->update();
            $this->execute('
                UPDATE santri___status ss
                INNER JOIN status st ON st.status_santri = ss.status_santri AND st.kategori = \'Banin\'
                SET ss.id_status = st.id
            ');
            $this->execute('ALTER TABLE santri___status MODIFY id_status INT NOT NULL');
            $this->execute('ALTER TABLE santri___status ADD CONSTRAINT fk_santri_status_id_status FOREIGN KEY (id_status) REFERENCES status (id) ON DELETE RESTRICT ON UPDATE CASCADE');
        }

        if ($this->hasTable('santri') && !$this->table('santri')->hasColumn('id_status')) {
            $this->table('santri')
                ->addColumn('id_status', 'integer', ['signed' => true, 'null' => true])
                ->update();
            $this->execute('
                UPDATE santri s
                INNER JOIN status st ON st.status_santri = s.status_santri AND st.kategori = \'Banin\'
                SET s.id_status = st.id
            ');
            $this->execute('ALTER TABLE santri ADD CONSTRAINT fk_santri_id_status FOREIGN KEY (id_status) REFERENCES status (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    private function dropFkOnColumn(string $table, string $column): void
    {
        $rows = $this->fetchAll("
            SELECT CONSTRAINT_NAME AS cname
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = '{$table}'
              AND COLUMN_NAME = '{$column}'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        ");
        foreach ($rows as $row) {
            $name = $row['cname'] ?? $row['CNAME'] ?? null;
            if ($name) {
                $this->execute("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$name}`");
            }
        }
    }
}
