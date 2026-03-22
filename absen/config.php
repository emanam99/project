<?php
// Aktifkan error reporting untuk debugging (Matikan di production)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Matikan display errors untuk production

// Konfigurasi database
$host = "localhost";
$database = "u264984103_db";
$username = "u264984103_alutsmani";
$password_db = "Beddian123";

// Menambahkan header CORS agar bisa diakses dari mana saja
// Note: Header Content-Type akan diatur oleh file yang memanggil config.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// Tangani preflight OPTIONS request agar tidak error 403
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Fungsi untuk membuat koneksi database PDO
function getPdoConnection() {
    global $host, $username, $password_db, $database;
    $dsn = "mysql:host=$host;dbname=$database;charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $username, $password_db, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        error_log("Database connection successful to $database on $host");
        return $pdo;
    } catch (PDOException $e) {
        error_log("PDO connection error: " . $e->getMessage());
        throw $e;
    }
}

// Buat koneksi PDO global untuk kompatibilitas dengan file lain
try {
    $pdo = getPdoConnection();
    error_log("Global PDO connection created successfully");
} catch (PDOException $e) {
    error_log("Failed to create global PDO connection: " . $e->getMessage());
    // Jangan exit di sini, biarkan file lain handle error
}

// Fungsi untuk response error
function sendErrorResponse($message, $code = 500) {
    http_response_code($code);
    echo json_encode([
        "success" => false,
        "message" => $message
    ]);
    exit();
}

// Fungsi untuk response success
function sendSuccessResponse($data = null, $message = "Success") {
    echo json_encode([
        "success" => true,
        "message" => $message,
        "data" => $data
    ]);
    exit();
}
?>
