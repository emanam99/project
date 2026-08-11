<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Reset id pengurus menjadi 1, 2, 3, ... dan update semua FK di tabel lain.
 * - Buat mapping old_id -> new_id (urut berdasarkan id).
 * - Update semua kolom yang mereferensi pengurus.id ke new_id.
 * - Update pengurus.id ke new_id (pakai shift sementara agar tidak bentrok unique).
 * NIP tidak diubah.
 */
final class PengurusResetIdFromOne extends AbstractMigration
{
    /** @var array{table: string, column: string} */
    private const FK_COLUMNS = [
        ['madrasah', 'id_koordinator'],
        // id_pengasuh, id_pjgt di madrasah FK ke users, bukan pengurus
        ['pengurus___role', 'pengurus_id'],
        ['pengurus___role', 'id_admin'],
        ['pengurus___jabatan', 'pengurus_id'],
        ['pengurus___jabatan', 'id_admin'],
        ['pengurus___subscription', 'id_pengurus'],
        ['user___setup_tokens', 'id_pengurus'],
        ['user___aktivitas', 'pengurus_id'],
        ['pengeluaran___rencana', 'id_admin'],
        ['pengeluaran___rencana_detail', 'id_admin'],
        ['pengeluaran___rencana_file', 'id_admin'],
        ['pengeluaran___viewer', 'id_admin'],
        ['pengeluaran___komentar', 'id_admin'],
        ['pengeluaran', 'id_penerima'],
        ['pengeluaran', 'id_admin'],
        ['pengeluaran', 'id_admin_approve'],
        ['pengeluaran___detail', 'id_admin'],
        ['pemasukan', 'id_admin'],
        ['santri___berkas', 'id_admin'],
        ['santri___boyong', 'id_pengurus'],
        ['psb___registrasi', 'id_admin'],
        ['psb___registrasi', 'id_pengurus_verifikasi'],
        ['psb___registrasi', 'id_pengurus_aktif'],
        ['psb___transaksi', 'id_admin'],
        ['psb___registrasi_detail', 'id_admin'],
        ['uwaba___bayar', 'id_admin'],
        ['uwaba___tunggakan', 'id_admin'],
        ['uwaba___bayar_tunggakan', 'id_admin'],
        ['uwaba___khusus', 'id_admin'],
        ['uwaba___bayar_khusus', 'id_admin'],
        ['payment', 'id_admin'],
        ['umroh___jamaah', 'id_admin'],
        ['umroh___tabungan', 'id_admin'],
        ['umroh___pengeluaran', 'id_admin'],
        ['umroh___pengeluaran', 'id_admin_approve'],
        ['umroh___pengeluaran___detail', 'id_admin'],
        ['whatsapp', 'id_pengurus'],
        ['whatsapp', 'id_pengurus_pengirim'],
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
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // 1) Mapping old_id -> new_id (1, 2, 3, ...) urut by id
        $this->execute('DROP TABLE IF EXISTS _pengurus_id_map');
        $this->execute(<<<'SQL'
            CREATE TEMPORARY TABLE _pengurus_id_map (
                old_id INT NOT NULL PRIMARY KEY,
                new_id INT NOT NULL,
                UNIQUE KEY u_new (new_id)
            )
SQL);
        $this->execute(<<<'SQL'
            INSERT INTO _pengurus_id_map (old_id, new_id)
            SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM pengurus
SQL);

        // 2) Update semua tabel anak: set FK ke new_id
        foreach (self::FK_COLUMNS as [$table, $column]) {
            if (!$this->tableExists($table) || !$this->columnExists($table, $column)) {
                continue;
            }
            $t = '`' . str_replace('`', '``', $table) . '`';
            $c = '`' . str_replace('`', '``', $column) . '`';
            $this->execute("UPDATE {$t} t INNER JOIN _pengurus_id_map m ON m.old_id = t.{$c} SET t.{$c} = m.new_id");
        }

        // 3) Update pengurus.id ke new_id: shift dulu ke 1000000+ agar tidak bentrok
        $this->execute(<<<'SQL'
            UPDATE pengurus p
            INNER JOIN _pengurus_id_map m ON p.id = m.old_id
            SET p.id = 1000000 + m.new_id
SQL);
        $this->execute('UPDATE pengurus SET id = id - 1000000');

        // 4) AUTO_INCREMENT berikutnya
        $this->execute('ALTER TABLE pengurus AUTO_INCREMENT = 1');

        $this->execute('DROP TABLE IF EXISTS _pengurus_id_map');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        // Tidak bisa mengembalikan id lama tanpa menyimpan mapping; biarkan kosong atau throw.
        $this->execute('SELECT 1'); // no-op, rollback id tidak diimplementasi
    }
}
