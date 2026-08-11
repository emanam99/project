<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus kolom di tabel pengurus yang sudah ada di tabel lain:
 * password, remember_token, akses, email, whatsapp, daerah, no_kamar,
 * jabatan, diniyah, jabatan_diniyah, kelas_diniyah, kel_diniyah,
 * formal, jabatan_formal, kelas_formal, kel_formal, admin, pw, level.
 */
final class PengurusDropDuplicateColumns extends AbstractMigration
{
    private function hasColumn(string $tableName, string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
            LIMIT 1
        ");
        $stmt->execute([$tableName, $columnName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    private const COLUMNS_TO_DROP = [
        'password',
        'remember_token',
        'akses',
        'email',
        'whatsapp',
        'daerah',
        'no_kamar',
        'jabatan',
        'diniyah',
        'jabatan_diniyah',
        'kelas_diniyah',
        'kel_diniyah',
        'formal',
        'jabatan_formal',
        'kelas_formal',
        'kel_formal',
        'admin',
        'pw',
        'level',
    ];

    public function up(): void
    {
        $table = 'pengurus';
        $drops = [];
        foreach (self::COLUMNS_TO_DROP as $col) {
            if ($this->hasColumn($table, $col)) {
                $drops[] = 'DROP COLUMN `' . $col . '`';
            }
        }
        if ($drops !== []) {
            $this->execute('ALTER TABLE `pengurus` ' . implode(', ', $drops));
        }
    }

    public function down(): void
    {
        $defs = [
            'password' => 'VARCHAR(255) NULL DEFAULT NULL',
            'remember_token' => 'VARCHAR(255) NULL DEFAULT NULL',
            'akses' => 'VARCHAR(50) NULL DEFAULT NULL',
            'email' => 'VARCHAR(255) NULL DEFAULT NULL',
            'whatsapp' => 'VARCHAR(20) NULL DEFAULT NULL',
            'daerah' => 'VARCHAR(255) NULL DEFAULT NULL',
            'no_kamar' => 'VARCHAR(50) NULL DEFAULT NULL',
            'jabatan' => 'VARCHAR(255) NULL DEFAULT NULL',
            'diniyah' => 'VARCHAR(255) NULL DEFAULT NULL',
            'jabatan_diniyah' => 'VARCHAR(255) NULL DEFAULT NULL',
            'kelas_diniyah' => 'VARCHAR(255) NULL DEFAULT NULL',
            'kel_diniyah' => 'VARCHAR(255) NULL DEFAULT NULL',
            'formal' => 'VARCHAR(255) NULL DEFAULT NULL',
            'jabatan_formal' => 'VARCHAR(255) NULL DEFAULT NULL',
            'kelas_formal' => 'VARCHAR(50) NULL DEFAULT NULL',
            'kel_formal' => 'VARCHAR(50) NULL DEFAULT NULL',
            'admin' => 'VARCHAR(255) NULL DEFAULT NULL',
            'pw' => 'VARCHAR(255) NULL DEFAULT NULL',
            'level' => 'VARCHAR(255) NULL DEFAULT NULL',
        ];
        foreach ($defs as $col => $def) {
            if (!$this->hasColumn('pengurus', $col)) {
                $this->execute("ALTER TABLE `pengurus` ADD COLUMN `{$col}` {$def} AFTER `status`");
            }
        }
    }
}
