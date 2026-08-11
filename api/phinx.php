<?php

/**
 * Phinx - Migrasi database via CLI saja (tidak ada endpoint public).
 * Konfigurasi dibaca dari .env lewat config.php (satu sumber kebenaran).
 *
 * Cara pakai (dari folder api):
 *   vendor\bin\phinx migrate        → jalankan migrasi tertunda (env dari APP_ENV atau default: development)
 *   vendor\bin\phinx migrate -e development  → idem, peringatan "no environment specified" hilang
 *   vendor\bin\phinx rollback       → mundur satu batch
 *   vendor\bin\phinx status         → lihat status migrasi
 *   vendor\bin\phinx create NamaMigrasi → buat file migrasi baru
 */

$config = require __DIR__ . '/config.php';
$db = $config['database'];

return [
    'paths' => [
        'migrations' => __DIR__ . '/db/migrations',
        'seeds' => __DIR__ . '/db/seeds',
    ],
    'environments' => [
        'default_migration_table' => 'phinxlog',
        'default_environment' => (getenv('APP_ENV') ?: 'development'),
        'development' => [
            'adapter' => 'mysql',
            'host' => $db['host'],
            'name' => $db['dbname'],
            'user' => $db['username'],
            'pass' => $db['password'],
            'port' => 3306,
            'charset' => $db['charset'],
        ],
        'production' => [
            'adapter' => 'mysql',
            'host' => $db['host'],
            'name' => $db['dbname'],
            'user' => $db['username'],
            'pass' => $db['password'],
            'port' => 3306,
            'charset' => $db['charset'],
        ],
    ],
];
