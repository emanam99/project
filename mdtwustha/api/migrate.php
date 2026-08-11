<?php

require __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';
$db   = $_ENV['DB_NAME'] ?? 'mdtw';

try {
    // 1. Connect directly to existing DB
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. Create migrations table if not exists
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            migration VARCHAR(255) NOT NULL,
            run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");

    // 3. Get applied migrations
    $stmt = $pdo->query("SELECT migration FROM migrations");
    $appliedMigrations = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // 4. Run pending migrations
    $migrationsDir = __DIR__ . '/migrations';
    if (!is_dir($migrationsDir)) {
        mkdir($migrationsDir);
    }
    $files = glob($migrationsDir . '/*.sql');
    sort($files);

    foreach ($files as $file) {
        $migrationName = basename($file);
        if (!in_array($migrationName, $appliedMigrations)) {
            echo "Running migration: $migrationName...\n";
            $sql = file_get_contents($file);
            
            // Execute the queries
            $pdo->exec($sql);
            
            // Record migration
            $stmt = $pdo->prepare("INSERT INTO migrations (migration) VALUES (:migration)");
            $stmt->execute(['migration' => $migrationName]);
            
            echo "Migration $migrationName applied successfully.\n";
        }
    }

    echo "All migrations are up to date.\n";

} catch (PDOException $e) {
    die("Database Error: " . $e->getMessage() . "\n");
}
