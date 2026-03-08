<?php
/**
 * Script sekali pakai: cek trigger di database dan tabel lembaga___wali_kelas.
 * Jalankan: php check_triggers.php
 * Hapus file ini setelah selesai.
 */
$config = require __DIR__ . '/config.php';
$db = $config['database'];
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
    $db['host'],
    $db['port'] ?? 3306,
    $db['dbname'],
    $db['charset'] ?? 'utf8mb4'
);
try {
    $pdo = new PDO($dsn, $db['username'], $db['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Exception $e) {
    fwrite(STDERR, "Koneksi DB gagal: " . $e->getMessage() . "\n");
    exit(1);
}

echo "=== TRIGGER di database (semua tabel) ===\n";
$stmt = $pdo->query("
    SELECT TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE()
    ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME
");
$triggers = $stmt->fetchAll(PDO::FETCH_ASSOC);
if (empty($triggers)) {
    echo "Tidak ada trigger.\n";
} else {
    foreach ($triggers as $t) {
        echo sprintf("  %s | %s | %s | %s | %s\n", $t['TRIGGER_SCHEMA'], $t['TRIGGER_NAME'], $t['ACTION_TIMING'], $t['EVENT_MANIPULATION'], $t['EVENT_OBJECT_TABLE']);
    }
}

echo "\n=== Trigger khusus tabel lembaga___wali_kelas ===\n";
$stmt = $pdo->query("
    SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'lembaga___wali_kelas'
");
$waliTriggers = $stmt->fetchAll(PDO::FETCH_ASSOC);
if (empty($waliTriggers)) {
    echo "Tidak ada trigger pada lembaga___wali_kelas.\n";
} else {
    foreach ($waliTriggers as $t) {
        echo "  " . $t['TRIGGER_NAME'] . " | " . $t['ACTION_TIMING'] . " " . $t['EVENT_MANIPULATION'] . "\n";
        echo "  Statement: " . substr($t['ACTION_STATEMENT'], 0, 500) . "\n";
    }
}

echo "\n=== Kolom default / definisi tabel lembaga___wali_kelas ===\n";
$stmt = $pdo->query("SHOW CREATE TABLE lembaga___wali_kelas");
$row = $stmt->fetch(PDO::FETCH_NUM);
echo $row[1] . "\n";

echo "\nSelesai.\n";
