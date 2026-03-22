<?php
/**
 * API untuk menyediakan data absensi dalam format JSON
 * Digunakan oleh dashboard.html
 */

// Disable error display untuk mencegah output yang merusak JSON
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Set header untuk JSON
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Include konfigurasi database
require_once 'config.php';

// Function untuk response error
function sendErrorResponse($message, $code = 500) {
    http_response_code($code);
    echo json_encode([
        "success" => false,
        "message" => $message,
        "data" => [],
        "stats" => [
            "total_records" => 0,
            "today_records" => 0,
            "db_error" => true
        ]
    ]);
    exit();
}

// Function untuk response success
function sendSuccessResponse($data, $stats) {
    echo json_encode([
        "success" => true,
        "message" => "Data loaded successfully",
        "data" => $data,
        "stats" => $stats
    ]);
    exit();
}

// Baca data dari Database (prioritas utama)
$data = [];
$stats = [
    "total_records" => 0,
    "today_records" => 0,
    "db_error" => false
];

// Cek apakah PDO tersedia
if (!isset($pdo)) {
    sendErrorResponse("Database connection not available");
}

try {
    // Query data absensi
    $stmt = $pdo->prepare("
        SELECT timestamp, id_pengurus, status, verified, work_code, raw_data 
        FROM absen___pengurus 
        ORDER BY timestamp DESC 
        LIMIT 1000
    ");
    $stmt->execute();
    $data = $stmt->fetchAll(PDO::FETCH_NUM);

    // Hitung statistik
    $stats["total_records"] = count($data);
    
    // Hitung data hari ini
    $today = date('Y-m-d');
    $todayCount = 0;
    foreach ($data as $row) {
        if (isset($row[0]) && strpos($row[0], $today) === 0) {
            $todayCount++;
        }
    }
    $stats["today_records"] = $todayCount;

} catch (PDOException $e) {
    error_log("Database Error: " . $e->getMessage());
    $stats["db_error"] = true;
    
    // Fallback ke CSV jika database error
    $csvFile = 'absensi.csv';
    if (file_exists($csvFile)) {
        $handle = fopen($csvFile, 'r');
        if ($handle) {
            $header = fgetcsv($handle); // Skip header
            while (($row = fgetcsv($handle)) !== FALSE) {
                $data[] = $row;
            }
            fclose($handle);
            
            $stats["total_records"] = count($data);
            
            // Hitung data hari ini dari CSV
            $today = date('Y-m-d');
            $todayCount = 0;
            foreach ($data as $row) {
                if (isset($row[0]) && strpos($row[0], $today) === 0) {
                    $todayCount++;
                }
            }
            $stats["today_records"] = $todayCount;
        }
    }
}

// Kirim response sukses
sendSuccessResponse($data, $stats);
?>
