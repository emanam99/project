<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class SantriStatusNormalization extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $conn = $this->getAdapter()->getConnection();

        if (!$this->hasTable('santri')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        if (!$this->hasTable('status')) {
            $this->table('status', ['id' => true])
                ->addColumn('status_santri', 'string', ['limit' => 100, 'null' => false])
                ->addColumn('kategori', 'string', ['limit' => 100, 'null' => false])
                ->addColumn('status', 'string', ['limit' => 20, 'null' => false, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['status_santri', 'kategori'], ['unique' => true, 'name' => 'uq_status_santri_kategori'])
                ->addIndex(['status'])
                ->create();
            $this->execute('ALTER TABLE status CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        }

        if (!$this->table('santri')->hasColumn('id_status')) {
            $this->table('santri')
                ->addColumn('id_status', 'integer', ['signed' => true, 'null' => true])
                ->addIndex(['id_status'])
                ->update();
            $this->execute('ALTER TABLE santri ADD CONSTRAINT fk_santri_id_status FOREIGN KEY (id_status) REFERENCES status (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }

        if (!$this->hasTable('santri___status')) {
            $this->table('santri___status', ['id' => true])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_status', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('dari', 'datetime', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
                ->addColumn('sampai', 'datetime', ['null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_santri'])
                ->addIndex(['id_status'])
                ->addIndex(['id_pengurus'])
                ->addIndex(['id_santri', 'sampai'], ['name' => 'idx_santri_status_aktif'])
                ->create();
            $this->execute('ALTER TABLE santri___status CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE santri___status ADD CONSTRAINT fk_santri_status_id_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___status ADD CONSTRAINT fk_santri_status_id_status FOREIGN KEY (id_status) REFERENCES status (id) ON DELETE RESTRICT ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___status ADD CONSTRAINT fk_santri_status_id_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }

        $hasSantriStatus = $this->table('santri')->hasColumn('status_santri');
        $hasSantriKategori = $this->table('santri')->hasColumn('kategori');
        $hasKamarStatus = $this->hasTable('santri___kamar') && $this->table('santri___kamar')->hasColumn('status_santri');
        $hasKamarKategori = $this->hasTable('santri___kamar') && $this->table('santri___kamar')->hasColumn('kategori');

        if ($hasKamarStatus && $hasKamarKategori) {
            $conn->exec("
                INSERT IGNORE INTO status (status_santri, kategori, status, tanggal_dibuat)
                SELECT DISTINCT
                    TRIM(sk.status_santri),
                    TRIM(sk.kategori),
                    'aktif',
                    CURRENT_TIMESTAMP
                FROM santri___kamar sk
                WHERE sk.status_santri IS NOT NULL AND TRIM(sk.status_santri) <> ''
                  AND sk.kategori IS NOT NULL AND TRIM(sk.kategori) <> ''
            ");
        }

        if ($hasSantriStatus && $hasSantriKategori) {
            $conn->exec("
                INSERT IGNORE INTO status (status_santri, kategori, status, tanggal_dibuat)
                SELECT DISTINCT
                    TRIM(s.status_santri),
                    TRIM(s.kategori),
                    'aktif',
                    CURRENT_TIMESTAMP
                FROM santri s
                WHERE s.status_santri IS NOT NULL AND TRIM(s.status_santri) <> ''
                  AND s.kategori IS NOT NULL AND TRIM(s.kategori) <> ''
            ");
        }

        if ($hasKamarStatus && $hasKamarKategori) {
            $conn->exec("
                INSERT IGNORE INTO santri___status (id_santri, id_status, id_pengurus, dari, sampai, tanggal_dibuat)
                SELECT
                    sk.id_santri,
                    st.id,
                    sk.id_pengurus,
                    COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP),
                    NULL,
                    COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP)
                FROM santri___kamar sk
                INNER JOIN status st
                    ON st.status_santri = TRIM(COALESCE(sk.status_santri, ''))
                    AND st.kategori = TRIM(COALESCE(sk.kategori, ''))
                WHERE sk.id_santri IS NOT NULL
                  AND sk.status_santri IS NOT NULL AND TRIM(sk.status_santri) <> ''
                  AND sk.kategori IS NOT NULL AND TRIM(sk.kategori) <> ''
                ORDER BY sk.id_santri ASC, sk.tanggal_dibuat ASC, sk.id ASC
            ");
        }

        if ($hasSantriStatus && $hasSantriKategori) {
            $conn->exec("
                INSERT INTO santri___status (id_santri, id_status, id_pengurus, dari, sampai, tanggal_dibuat)
                SELECT
                    s.id,
                    st.id,
                    NULL,
                    COALESCE(s.tanggal_update, s.tanggal_dibuat, CURRENT_TIMESTAMP),
                    NULL,
                    COALESCE(s.tanggal_update, s.tanggal_dibuat, CURRENT_TIMESTAMP)
                FROM santri s
                INNER JOIN status st
                    ON st.status_santri = TRIM(COALESCE(s.status_santri, ''))
                    AND st.kategori = TRIM(COALESCE(s.kategori, ''))
                LEFT JOIN santri___status ss ON ss.id_santri = s.id
                WHERE ss.id IS NULL
                  AND s.status_santri IS NOT NULL AND TRIM(s.status_santri) <> ''
                  AND s.kategori IS NOT NULL AND TRIM(s.kategori) <> ''
            ");
        }

        $conn->exec("
            UPDATE santri___status ss
            INNER JOIN (
                SELECT id_santri, MAX(dari) AS max_dari
                FROM santri___status
                GROUP BY id_santri
            ) mx ON mx.id_santri = ss.id_santri
            SET ss.sampai = CASE WHEN ss.dari = mx.max_dari THEN NULL ELSE mx.max_dari END
        ");

        $conn->exec("
            UPDATE santri s
            LEFT JOIN (
                SELECT x.id_santri, x.id_status
                FROM santri___status x
                INNER JOIN (
                    SELECT id_santri, MAX(dari) AS max_dari
                    FROM santri___status
                    GROUP BY id_santri
                ) y ON y.id_santri = x.id_santri AND y.max_dari = x.dari
            ) act ON act.id_santri = s.id
            SET s.id_status = act.id_status
        ");

        if ($hasSantriStatus) {
            $this->table('santri')->removeColumn('status_santri')->update();
        }
        if ($hasSantriKategori) {
            $this->table('santri')->removeColumn('kategori')->update();
        }
        if ($hasKamarStatus) {
            $this->table('santri___kamar')->removeColumn('status_santri')->update();
        }
        if ($hasKamarKategori) {
            $this->table('santri___kamar')->removeColumn('kategori')->update();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('santri') && !$this->table('santri')->hasColumn('status_santri')) {
            $this->table('santri')
                ->addColumn('status_santri', 'string', ['limit' => 100, 'null' => true])
                ->update();
        }
        if ($this->hasTable('santri') && !$this->table('santri')->hasColumn('kategori')) {
            $this->table('santri')
                ->addColumn('kategori', 'string', ['limit' => 100, 'null' => true])
                ->update();
        }
        if ($this->hasTable('santri___kamar') && !$this->table('santri___kamar')->hasColumn('status_santri')) {
            $this->table('santri___kamar')
                ->addColumn('status_santri', 'string', ['limit' => 50, 'null' => true])
                ->update();
        }
        if ($this->hasTable('santri___kamar') && !$this->table('santri___kamar')->hasColumn('kategori')) {
            $this->table('santri___kamar')
                ->addColumn('kategori', 'string', ['limit' => 50, 'null' => true])
                ->update();
        }

        if ($this->hasTable('santri') && $this->table('santri')->hasColumn('id_status')) {
            $this->execute('UPDATE santri s LEFT JOIN status st ON st.id = s.id_status SET s.status_santri = st.status_santri, s.kategori = st.kategori');
            try {
                $this->execute('ALTER TABLE santri DROP FOREIGN KEY fk_santri_id_status');
            } catch (\Throwable $e) {
            }
            $this->table('santri')->removeColumn('id_status')->update();
        }

        if ($this->hasTable('santri___status')) {
            $this->table('santri___status')->drop()->save();
        }
        if ($this->hasTable('status')) {
            $this->table('status')->drop()->save();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
