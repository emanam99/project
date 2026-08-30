<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Default jam Istiwa’: koordinat pondok (Beddian) jika masih nilai kota Bondowoso / kosong.
 */
final class KalenderIstiwaDefaultPondok extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('app___settings')) {
            return;
        }

        $lat = '-7.9955854';
        $lng = '113.8443946';
        $oldLat = '-7.9138';
        $oldLng = '113.8214';

        $this->execute(
            "INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('kalender_istiwa_latitude', '{$lat}')"
        );
        $this->execute(
            "INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('kalender_istiwa_longitude', '{$lng}')"
        );

        $this->execute(
            "UPDATE `app___settings` SET `value` = '{$lat}', `updated_at` = NOW()
             WHERE `key` = 'kalender_istiwa_latitude'
               AND (
                 `value` IS NULL
                 OR TRIM(`value`) = ''
                 OR TRIM(`value`) = '{$oldLat}'
                 OR CAST(`value` AS DECIMAL(12,7)) = CAST('{$oldLat}' AS DECIMAL(12,7))
               )"
        );
        $this->execute(
            "UPDATE `app___settings` SET `value` = '{$lng}', `updated_at` = NOW()
             WHERE `key` = 'kalender_istiwa_longitude'
               AND (
                 `value` IS NULL
                 OR TRIM(`value`) = ''
                 OR TRIM(`value`) = '{$oldLng}'
                 OR CAST(`value` AS DECIMAL(12,7)) = CAST('{$oldLng}' AS DECIMAL(12,7))
               )"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('app___settings')) {
            return;
        }
        $this->execute(
            "UPDATE `app___settings` SET `value` = '-7.9138', `updated_at` = NOW()
             WHERE `key` = 'kalender_istiwa_latitude'
               AND CAST(`value` AS DECIMAL(12,7)) = CAST('-7.9955854' AS DECIMAL(12,7))"
        );
        $this->execute(
            "UPDATE `app___settings` SET `value` = '113.8214', `updated_at` = NOW()
             WHERE `key` = 'kalender_istiwa_longitude'
               AND CAST(`value` AS DECIMAL(12,7)) = CAST('113.8443946' AS DECIMAL(12,7))"
        );
    }
}
