<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Master aplikasi (tabel app).
 *
 * ID tetap: 1 = shell web eBeddien (menu SPA); 2–4 selaras RoleConfig::APPS.
 *
 * Cara pakai: php vendor/bin/phinx seed:run -s AppSeed
 * Aman berulang: INSERT IGNORE pada id + key unik.
 */
class AppSeed extends AbstractSeed
{
    /** [id, key, label, sort_order] */
    private array $entries = [
        [1, 'ebeddien', 'Aplikasi eBeddien', 0],
        [2, 'uwaba', 'Aplikasi UWABA', 10],
        [3, 'mybeddian', 'Aplikasi Mybeddian', 20],
        [4, 'wa', 'WhatsApp', 30],
    ];

    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();
        foreach ($this->entries as $row) {
            $this->execute(sprintf(
                'INSERT IGNORE INTO `app` (`id`, `key`, `label`, `sort_order`) VALUES (%d, %s, %s, %d)',
                $row[0],
                $conn->quote($row[1]),
                $conn->quote($row[2]),
                $row[3]
            ));
        }
    }
}
