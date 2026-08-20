<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan setiap santri punya status_santri wajib (enum), histori terbuka, kolom NOT NULL.
 */
final class EnforceSantriStatusNotEmpty extends AbstractMigration
{
    private const ALLOWED = ['Mukim', 'Boyong', 'Khoriji', 'Guru Tugas', 'Pengurus', 'Alumni'];

    public function up(): void
    {
        if (!$this->hasTable('santri') || !$this->table('santri')->hasColumn('status_santri')) {
            return;
        }

        $allowedList = "'" . implode("','", self::ALLOWED) . "'";
        $conn = $this->getAdapter()->getConnection();

        // Sync dari histori terbuka
        $this->execute("
            UPDATE santri s
            INNER JOIN (
                SELECT ss.id_santri, ss.status_santri
                FROM santri___status ss
                INNER JOIN (
                    SELECT id_santri, MAX(id) AS max_id
                    FROM santri___status WHERE sampai IS NULL GROUP BY id_santri
                ) x ON x.max_id = ss.id
            ) act ON act.id_santri = s.id
            SET s.status_santri = act.status_santri
            WHERE act.status_santri IS NOT NULL AND TRIM(act.status_santri) <> ''
        ");

        $map = [
            'mukim' => 'Mukim',
            'boyong' => 'Boyong',
            'khoriji' => 'Khoriji',
            'guru tugas' => 'Guru Tugas',
            'pengurus' => 'Pengurus',
            'alumni' => 'Alumni',
        ];
        $st = $conn->prepare('UPDATE santri SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
        $st2 = $conn->prepare('UPDATE santri___status SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
        foreach ($map as $from => $to) {
            $st->execute([$to, $from]);
            $st2->execute([$to, $from]);
        }

        if ($this->hasTable('santri___boyong')) {
            $this->execute("
                UPDATE santri s
                INNER JOIN (SELECT id_santri FROM santri___boyong GROUP BY id_santri) b ON b.id_santri = s.id
                SET s.status_santri = 'Boyong'
                WHERE s.status_santri IS NULL OR TRIM(s.status_santri) = '' OR s.status_santri NOT IN ({$allowedList})
            ");
        }

        $this->execute("
            UPDATE santri SET status_santri = 'Mukim'
            WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN ({$allowedList})
        ");

        // Satu baris terbuka per santri
        $this->execute('
            UPDATE santri___status ss
            INNER JOIN (
                SELECT id_santri, MAX(id) AS keep_id
                FROM santri___status WHERE sampai IS NULL GROUP BY id_santri
            ) k ON k.id_santri = ss.id_santri
            SET ss.sampai = CURRENT_TIMESTAMP
            WHERE ss.sampai IS NULL AND ss.id <> k.keep_id
        ');

        $this->execute("
            INSERT INTO santri___status (id_santri, status_santri, id_pengurus, dari, sampai, tanggal_dibuat)
            SELECT s.id, s.status_santri, NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
            FROM santri s
            WHERE NOT EXISTS (
                SELECT 1 FROM santri___status ss WHERE ss.id_santri = s.id AND ss.sampai IS NULL
            )
              AND s.status_santri IS NOT NULL AND TRIM(s.status_santri) <> ''
        ");

        $this->execute("
            UPDATE santri___status ss
            INNER JOIN santri s ON s.id = ss.id_santri
            SET ss.status_santri = s.status_santri
            WHERE ss.sampai IS NULL
              AND ss.id = (
                SELECT MAX(ss2.id) FROM santri___status ss2
                WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL
              )
              AND ss.status_santri <> s.status_santri
        ");

        $this->execute("ALTER TABLE santri MODIFY status_santri VARCHAR(50) NOT NULL DEFAULT 'Mukim'");
        $this->execute('ALTER TABLE santri___status MODIFY status_santri VARCHAR(50) NOT NULL');
    }

    public function down(): void
    {
        if ($this->hasTable('santri') && $this->table('santri')->hasColumn('status_santri')) {
            $this->execute('ALTER TABLE santri MODIFY status_santri VARCHAR(50) NULL');
        }
    }
}
