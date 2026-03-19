<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom madrasah: kepala, sekretaris, bendahara;
 * kegiatan belajar (pagi/sore/malam centang, mulai/sampai jam, tempat);
 * berdiri_tahun, kelas_tertinggi, keterangan;
 * banin_banat, seragam, syahriah, pengelola;
 * gedung_madrasah, kantor, bangku, kamar_mandi_murid, kamar_gt, kamar_mandi_gt;
 * km_bersifat, konsumsi, kamar_gt_jarak, masyarakat, alumni, jarak_md_lain.
 */
final class MadrasahKepalaKegiatanFasilitas extends AbstractMigration
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

    public function up(): void
    {
        // kelas_tertinggi setelah ma_had_ali (tingkatan)
        if (!$this->hasColumn('madrasah', 'kelas_tertinggi')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN kelas_tertinggi VARCHAR(100) NULL DEFAULT NULL COMMENT 'Setelah ula hingga mahad ali' AFTER ma_had_ali");
        }

        // Sisanya setelah foto_path
        $cols = [
            ['kepala', 'VARCHAR(255) NULL DEFAULT NULL COMMENT \'Nama kepala madrasah\'', 'foto_path'],
            ['sekretaris', 'VARCHAR(255) NULL DEFAULT NULL', 'kepala'],
            ['bendahara', 'VARCHAR(255) NULL DEFAULT NULL', 'sekretaris'],
            ['kegiatan_pagi', 'TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'Kegiatan belajar pagi (centang)\'', 'bendahara'],
            ['kegiatan_sore', 'TINYINT(1) NOT NULL DEFAULT 0', 'kegiatan_pagi'],
            ['kegiatan_malam', 'TINYINT(1) NOT NULL DEFAULT 0', 'kegiatan_sore'],
            ['kegiatan_mulai', 'VARCHAR(10) NULL DEFAULT NULL COMMENT \'Jam mulai (HH:MM)\'', 'kegiatan_malam'],
            ['kegiatan_sampai', 'VARCHAR(10) NULL DEFAULT NULL COMMENT \'Jam sampai (HH:MM)\'', 'kegiatan_mulai'],
            ['tempat', 'VARCHAR(255) NULL DEFAULT NULL COMMENT \'Tempat: masjid, musholla, gedung madrasah, rumah, dll\'', 'kegiatan_sampai'],
            ['berdiri_tahun', 'INT(4) NULL DEFAULT NULL COMMENT \'Tahun berdiri\'', 'tempat'],
            ['keterangan', 'TEXT NULL DEFAULT NULL COMMENT \'Keterangan (bisa banyak)\'', 'berdiri_tahun'],
            ['banin_banat', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'kumpul, tidak kumpul\'', 'keterangan'],
            ['seragam', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, ada tapi tidak aktif\'', 'banin_banat'],
            ['syahriah', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, ada tapi tidak aktif\'', 'seragam'],
            ['pengelola', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'yayasan, pesantren, perorangan\'', 'syahriah'],
            ['gedung_madrasah', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'pengelola'],
            ['kantor', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'gedung_madrasah'],
            ['bangku', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'kantor'],
            ['kamar_mandi_murid', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'bangku'],
            ['kamar_gt', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'kamar_mandi_murid'],
            ['kamar_mandi_gt', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, dalam proses\'', 'kamar_gt'],
            ['km_bersifat', 'VARCHAR(20) NULL DEFAULT NULL COMMENT \'khusus, umum (kamar mandi)\'', 'kamar_mandi_gt'],
            ['konsumsi', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'perorangan, bergantian\'', 'km_bersifat'],
            ['kamar_gt_jarak', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'dekat madrasah, jauh dari madrasah\'', 'konsumsi'],
            ['masyarakat', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'kota, desa, pegunungan\'', 'kamar_gt_jarak'],
            ['alumni', 'VARCHAR(50) NULL DEFAULT NULL COMMENT \'ada, tidak ada, sedikit\'', 'masyarakat'],
            ['jarak_md_lain', 'VARCHAR(20) NULL DEFAULT NULL COMMENT \'dekat, jauh\'', 'alumni'],
        ];

        foreach ($cols as [$name, $def, $after]) {
            if (!$this->hasColumn('madrasah', $name)) {
                $this->execute("ALTER TABLE madrasah ADD COLUMN {$name} {$def} AFTER {$after}");
            }
        }
    }

    public function down(): void
    {
        $cols = [
            'jarak_md_lain', 'alumni', 'masyarakat', 'kamar_gt_jarak', 'konsumsi', 'km_bersifat',
            'kamar_mandi_gt', 'kamar_gt', 'kamar_mandi_murid', 'bangku', 'kantor', 'gedung_madrasah',
            'pengelola', 'syahriah', 'seragam', 'banin_banat', 'keterangan', 'berdiri_tahun', 'tempat',
            'kegiatan_sampai', 'kegiatan_mulai', 'kegiatan_malam', 'kegiatan_sore', 'kegiatan_pagi',
            'bendahara', 'sekretaris', 'kepala', 'kelas_tertinggi'
        ];
        foreach ($cols as $col) {
            if ($this->hasColumn('madrasah', $col)) {
                $this->execute("ALTER TABLE madrasah DROP COLUMN " . $col);
            }
        }
    }
}
