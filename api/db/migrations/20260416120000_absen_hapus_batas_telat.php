<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus kolom batas telat di titik lokasi; jadwal default hanya jam mulai per sesi.
 */
final class AbsenHapusBatasTelat extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('absen___lokasi')) {
            $t = $this->table('absen___lokasi');
            if ($t->hasColumn('jam_telat_pagi')) {
                $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  DROP COLUMN `jam_telat_malam`,
  DROP COLUMN `jam_telat_sore`,
  DROP COLUMN `jam_telat_pagi`
SQL);
            }
        }

        if ($this->hasTable('absen___setting')) {
            $row = $this->fetchRow("SELECT `id`, `nilai` FROM `absen___setting` WHERE `kunci` = 'jadwal_default' LIMIT 1");
            if (is_array($row) && isset($row['nilai'])) {
                $j = json_decode((string) $row['nilai'], true);
                if (is_array($j)) {
                    foreach (['pagi', 'sore', 'malam'] as $k) {
                        if (!isset($j[$k]) || !is_array($j[$k])) {
                            continue;
                        }
                        unset($j[$k]['telat']);
                        if (!isset($j[$k]['mulai']) || !is_string($j[$k]['mulai']) || trim($j[$k]['mulai']) === '') {
                            $j[$k]['mulai'] = match ($k) {
                                'pagi' => '06:00',
                                'sore' => '15:00',
                                default => '19:00',
                            };
                        }
                    }
                    $newJson = json_encode($j, JSON_UNESCAPED_UNICODE);
                    $pdo = $this->getAdapter()->getConnection();
                    $u = $pdo->prepare('UPDATE `absen___setting` SET `nilai` = ? WHERE `kunci` = ? LIMIT 1');
                    $u->execute([$newJson, 'jadwal_default']);
                }
            }
        }
    }

    public function down(): void
    {
        if ($this->hasTable('absen___lokasi')) {
            $t = $this->table('absen___lokasi');
            if (!$t->hasColumn('jam_telat_pagi') && $t->hasColumn('jam_mulai_pagi')) {
                $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD COLUMN `jam_telat_pagi` time DEFAULT NULL AFTER `jam_mulai_pagi`,
  ADD COLUMN `jam_telat_sore` time DEFAULT NULL AFTER `jam_mulai_sore`,
  ADD COLUMN `jam_telat_malam` time DEFAULT NULL AFTER `jam_mulai_malam`
SQL);
            }
        }
    }
}
