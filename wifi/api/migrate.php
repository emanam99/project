<?php

require __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';
$db   = $_ENV['DB_NAME'] ?? 'wifi';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            migration VARCHAR(255) NOT NULL,
            run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");

    $stmt = $pdo->query("SELECT migration FROM migrations");
    $appliedMigrations = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $migrationsDir = __DIR__ . '/migrations';
    if (!is_dir($migrationsDir)) {
        mkdir($migrationsDir);
    }
    $files = glob($migrationsDir . '/*.sql');
    sort($files);

    foreach ($files as $file) {
        $migrationName = basename($file);
        if (!in_array($migrationName, $appliedMigrations, true)) {
            echo "Running migration: $migrationName...\n";
            $sql = file_get_contents($file);
            $pdo->exec($sql);

            $ins = $pdo->prepare("INSERT INTO migrations (migration) VALUES (:migration)");
            $ins->execute(['migration' => $migrationName]);

            echo "Migration $migrationName applied successfully.\n";
        }
    }

    echo "All migrations are up to date.\n";

    // Bootstrap akun fallback (email/password) bila env di-set
    $fallback = \App\Helpers\AuthHelper::ensureFallbackAdminFromEnv();
    if ($fallback) {
        echo "Fallback admin siap: " . ($fallback['email'] ?? '') . "\n";
    }
} catch (PDOException $e) {
    die("Database Error: " . $e->getMessage() . "\n");
}
