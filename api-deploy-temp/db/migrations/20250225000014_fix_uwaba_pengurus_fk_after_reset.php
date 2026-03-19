<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Perbaikan: migrasi 20250225000013 memakai nama tabel salah untuk uwaba
 * (tunggakan, bayar_tunggakan, khusus, bayar_khusus instead of uwaba___*).
 * Tabel uwaba___tunggakan, uwaba___bayar_tunggakan, uwaba___khusus, uwaba___bayar_khusus
 * belum di-update id_admin-nya. Map old_id -> id baru via pengurus.nip (nip = id lama).
 */
final class FixUwabaPengurusFkAfterReset extends AbstractMigration
{
    /** @var array{table: string, column: string} */
    private const TABLES = [
        ['uwaba___tunggakan', 'id_admin'],
        ['uwaba___bayar_tunggakan', 'id_admin'],
        ['uwaba___khusus', 'id_admin'],
        ['uwaba___bayar_khusus', 'id_admin'],
    ];

    private function tableExists(string $table): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = ?
            LIMIT 1
        ");
        $stmt->execute([$table]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    private function columnExists(string $table, string $column): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
            LIMIT 1
        ");
        $stmt->execute([$table, $column]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        foreach (self::TABLES as [$table, $column]) {
            if (!$this->tableExists($table) || !$this->columnExists($table, $column)) {
                continue;
            }
            $t = '`' . str_replace('`', '``', $table) . '`';
            $c = '`' . str_replace('`', '``', $column) . '`';
            // id_admin masih berisi id lama; pengurus.nip = id lama, pengurus.id = id baru
            $this->execute("UPDATE {$t} t INNER JOIN pengurus p ON p.nip = t.{$c} SET t.{$c} = p.id");
        }
    }

    public function down(): void
    {
        // Tidak bisa mengembalikan tanpa simpan mapping id -> nip
        $this->execute('SELECT 1');
    }
}
