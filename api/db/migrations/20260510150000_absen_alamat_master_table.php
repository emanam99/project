<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Master alamat absen terpisah dari titik GPS: hindari duplikasi isian dusun/RT/desa
 * bila beberapa titik memakai alamat administratif yang sama.
 *
 * Setelah migrasi: kolom alamat di absen___lokasi dihapus; gunakan absen___alamat + id_absen_alamat.
 */
final class AbsenAlamatMasterTable extends AbstractMigration
{
    private static function rowPunyaIsianAlamat(array $r): bool
    {
        foreach (['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi'] as $k) {
            $v = isset($r[$k]) ? trim((string) $r[$k]) : '';
            if ($v !== '') {
                return true;
            }
        }

        return false;
    }

    /** Kunci deduplikasi per lembaga + isian alamat */
    private static function sidikAlamat(array $r): string
    {
        $lem = $r['id_lembaga'] ?? null;
        $lemStr = $lem === null || $lem === '' ? "\0NULL" : trim((string) $lem);
        $parts = [$lemStr];
        foreach (['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi'] as $k) {
            $parts[] = isset($r[$k]) ? trim((string) $r[$k]) : '';
        }

        return implode("\x1e", $parts);
    }

    public function up(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }

        if (!$this->hasTable('absen___alamat')) {
            $this->execute(<<<'SQL'
CREATE TABLE `absen___alamat` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id_lembaga` varchar(50) DEFAULT NULL COMMENT 'Selaras absen___lokasi.id_lembaga / lembaga.id',
  `dusun` varchar(191) DEFAULT NULL,
  `rt` varchar(32) DEFAULT NULL,
  `rw` varchar(32) DEFAULT NULL,
  `desa` varchar(191) DEFAULT NULL,
  `kecamatan` varchar(191) DEFAULT NULL,
  `kabupaten` varchar(191) DEFAULT NULL,
  `provinsi` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_absen_alamat_lembaga` (`id_lembaga`),
  CONSTRAINT `fk_absen_alamat_lembaga` FOREIGN KEY (`id_lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Master alamat pratinjau absen — satu baris bisa dipakai banyak titik lokasi'
SQL);
        }

        $t = $this->table('absen___lokasi');
        if (!$t->hasColumn('id_absen_alamat')) {
            $this->execute(
                'ALTER TABLE `absen___lokasi` ADD COLUMN `id_absen_alamat` bigint(20) unsigned DEFAULT NULL AFTER `sort_order`'
            );
            $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD KEY `idx_absen_lokasi_alamat` (`id_absen_alamat`),
  ADD CONSTRAINT `fk_absen_lokasi_alamat` FOREIGN KEY (`id_absen_alamat`) REFERENCES `absen___alamat` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);
        }

        if (!$t->hasColumn('dusun')) {
            return;
        }

        $rows = $this->fetchAll('SELECT `id`, `id_lembaga`, `dusun`, `rt`, `rw`, `desa`, `kecamatan`, `kabupaten`, `provinsi` FROM `absen___lokasi` ORDER BY `id` ASC');
        $sidikToAlamatId = [];

        $pdo = $this->getAdapter()->getConnection();
        $ins = $pdo->prepare(
            'INSERT INTO `absen___alamat` (`id_lembaga`, `dusun`, `rt`, `rw`, `desa`, `kecamatan`, `kabupaten`, `provinsi`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($rows as $row) {
            if (!self::rowPunyaIsianAlamat($row)) {
                continue;
            }
            $sid = self::sidikAlamat($row);
            if (!isset($sidikToAlamatId[$sid])) {
                $idLem = $row['id_lembaga'] ?? null;
                $idLemVal = $idLem === null || $idLem === '' ? null : trim((string) $idLem);
                $ins->execute([
                    $idLemVal,
                    self::normNullable($row['dusun'] ?? null),
                    self::normNullable($row['rt'] ?? null),
                    self::normNullable($row['rw'] ?? null),
                    self::normNullable($row['desa'] ?? null),
                    self::normNullable($row['kecamatan'] ?? null),
                    self::normNullable($row['kabupaten'] ?? null),
                    self::normNullable($row['provinsi'] ?? null),
                ]);
                $sidikToAlamatId[$sid] = (int) $pdo->lastInsertId();
            }
            $aid = $sidikToAlamatId[$sid];
            $lid = (int) $row['id'];
            $pdo->prepare('UPDATE `absen___lokasi` SET `id_absen_alamat` = ? WHERE `id` = ?')->execute([$aid, $lid]);
        }

        $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  DROP COLUMN `dusun`,
  DROP COLUMN `rt`,
  DROP COLUMN `rw`,
  DROP COLUMN `desa`,
  DROP COLUMN `kecamatan`,
  DROP COLUMN `kabupaten`,
  DROP COLUMN `provinsi`
SQL);
    }

    private static function normNullable(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);

        return $s === '' ? null : $s;
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $t = $this->table('absen___lokasi');
        if (!$t->hasColumn('id_absen_alamat')) {
            return;
        }

        if (!$t->hasColumn('dusun')) {
            $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD COLUMN `dusun` varchar(191) DEFAULT NULL COMMENT 'Alamat pratinjau (opsional)' AFTER `sort_order`,
  ADD COLUMN `rt` varchar(32) DEFAULT NULL AFTER `dusun`,
  ADD COLUMN `rw` varchar(32) DEFAULT NULL AFTER `rt`,
  ADD COLUMN `desa` varchar(191) DEFAULT NULL AFTER `rw`,
  ADD COLUMN `kecamatan` varchar(191) DEFAULT NULL AFTER `desa`,
  ADD COLUMN `kabupaten` varchar(191) DEFAULT NULL AFTER `kecamatan`,
  ADD COLUMN `provinsi` varchar(191) DEFAULT NULL AFTER `kabupaten`
SQL);
        }

        if ($this->hasTable('absen___alamat')) {
            $this->execute(<<<'SQL'
UPDATE `absen___lokasi` l
INNER JOIN `absen___alamat` a ON a.id = l.id_absen_alamat
SET
  l.dusun = a.dusun,
  l.rt = a.rt,
  l.rw = a.rw,
  l.desa = a.desa,
  l.kecamatan = a.kecamatan,
  l.kabupaten = a.kabupaten,
  l.provinsi = a.provinsi
WHERE l.id_absen_alamat IS NOT NULL
SQL);
        }

        try {
            $this->execute('ALTER TABLE `absen___lokasi` DROP FOREIGN KEY `fk_absen_lokasi_alamat`');
        } catch (\Throwable $e) {
            // constraint name may differ on some installs
        }
        try {
            $this->execute('ALTER TABLE `absen___lokasi` DROP INDEX `idx_absen_lokasi_alamat`');
        } catch (\Throwable $e) {
        }
        if ($t->hasColumn('id_absen_alamat')) {
            $this->execute('ALTER TABLE `absen___lokasi` DROP COLUMN `id_absen_alamat`');
        }
        if ($this->hasTable('absen___alamat')) {
            $this->execute('DROP TABLE IF EXISTS `absen___alamat`');
        }
    }
}
