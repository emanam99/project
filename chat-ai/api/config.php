<?php
// Konfigurasi database
define('DB_HOST', 'localhost');
define('DB_NAME', 'u264984103_db');
define('DB_USER', 'u264984103_alutsmani');
define('DB_PASS', 'Beddian123');

// Menambahkan header CORS agar bisa diakses dari mana saja
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

// Tangani preflight OPTIONS request agar tidak error 403
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Aktifkan error reporting untuk debugging (Matikan di production)
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Function untuk mendapatkan koneksi PDO
function getPdoConnection() {
    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        throw new Exception("Database connection failed: " . $e->getMessage());
    }
}
?>
