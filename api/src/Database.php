<?php

namespace App;

use PDO;
use PDOException;

class Database
{
    private static $instance = null;
    private $pdo;

    private function __construct()
    {
        $config = require __DIR__ . '/../config.php';
        $db = $config['database'];

        $dsn = "mysql:host={$db['host']};dbname={$db['dbname']};charset={$db['charset']}";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        // Hostinger kadang transient SQLSTATE[HY000] [2002] Operation not permitted
        // saat burst request (eBeddien chat/foto). Retry singkat mengurangi banjir 500.
        $attempts = 3;
        $last = null;
        for ($i = 1; $i <= $attempts; $i++) {
            try {
                $this->pdo = new PDO($dsn, $db['username'], $db['password'], $options);

                // Set timezone MySQL ke Asia/Jakarta (WIB)
                $this->pdo->exec("SET time_zone = '+07:00'");

                // Aktifkan foreign key checks untuk memastikan integritas referensial
                $this->pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
                return;
            } catch (PDOException $e) {
                $last = $e;
                error_log('Database connection error (try ' . $i . '/' . $attempts . '): ' . $e->getMessage());
                if ($i < $attempts) {
                    usleep(80000 * $i); // 80ms, 160ms
                }
            }
        }

        throw new \RuntimeException('Database connection failed: ' . ($last ? $last->getMessage() : 'unknown'));
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection(): PDO
    {
        return $this->pdo;
    }
}

