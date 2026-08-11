<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Batas "dianggap telat" terpisah dari jam mulai sesi (lokasi + jadwal default JSON).
 * Kolom jam_telat_* NULL = pakai nilai jadwal_default.sesi.telat (bukan override per titik).
 */
final class AbsenJamTelat extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $t = $this->table('absen___lokasi');
        if (!$t->hasColumn('jam_telat_pagi')) {
            $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD COLUMN `jam_telat_pagi` time DEFAULT NULL COMMENT 'NULL = pakai jadwal default (telat)' AFTER `jam_mulai_pagi`,
  ADD COLUMN `jam_telat_sore` time DEFAULT NULL COMMENT 'NULL = pakai jadwal default' AFTER `jam_mulai_sore`,
  ADD COLUMN `jam_telat_malam` time DEFAULT NULL COMMENT 'NULL = pakai jadwal default' AFTER `jam_mulai_malam`
SQL);
        }

        if ($this->hasTable('absen___setting')) {
            $row = $this->fetchRow("SELECT `id`, `nilai` FROM `absen___setting` WHERE `kunci` = 'jadwal_default' LIMIT 1");
            if (is_array($row) && isset($row['nilai'])) {
                $j = json_decode((string) $row['nilai'], true);
                if (is_array($j)) {
                    $changed = false;
                    foreach (['pagi', 'sore', 'malam'] as $k) {
                        if (!isset($j[$k]) || !is_array($j[$k])) {
                            continue;
                        }
                        if (!isset($j[$k]['telat']) || !is_string($j[$k]['telat']) || trim($j[$k]['telat']) === '') {
                            $m = $j[$k]['mulai'] ?? null;
                            if (is_string($m) && trim($m) !== '') {
                                $j[$k]['telat'] = trim($m);
                            } else {
                                $j[$k]['telat'] = match ($k) {
                                    'pagi' => '06:00',
                                    'sore' => '15:00',
                                    default => '19:00',
                                };
                            }
                            $changed = true;
                        }
                    }
                    if ($changed) {
                        $newJson = json_encode($j, JSON_UNESCAPED_UNICODE);
                        $pdo = $this->getAdapter()->getConnection();
                        $u = $pdo->prepare('UPDATE `absen___setting` SET `nilai` = ? WHERE `kunci` = ? LIMIT 1');
                        $u->execute([$newJson, 'jadwal_default']);
                    }
                }
            }
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $t = $this->table('absen___lokasi');
        if ($t->hasColumn('jam_telat_pagi')) {
            $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  DROP COLUMN `jam_telat_malam`,
  DROP COLUMN `jam_telat_sore`,
  DROP COLUMN `jam_telat_pagi`
SQL);
        }

        if ($this->hasTable('absen___setting')) {
            $row = $this->fetchRow("SELECT `id`, `nilai` FROM `absen___setting` WHERE `kunci` = 'jadwal_default' LIMIT 1");
            if (is_array($row) && isset($row['nilai'])) {
                $j = json_decode((string) $row['nilai'], true);
                if (is_array($j)) {
                    foreach (['pagi', 'sore', 'malam'] as $k) {
                        if (isset($j[$k]) && is_array($j[$k])) {
                            unset($j[$k]['telat']);
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
}
