<?php
/**
 * File untuk menerima data dari mesin BioFinger AT-301
 * Domain: alutsmani.id
 * 
 * Protokol: iClock HTTP
 * Format: HTTP POST dengan data tab-separated
 */

// Include konfigurasi database
require_once 'config.php';

// Set timezone ke WIB (Waktu Indonesia Barat)
date_default_timezone_set('Asia/Jakarta');

// Set MySQL timezone ke WIB juga
try {
    $pdo->exec("SET time_zone = '+07:00'");
} catch (PDOException $e) {
    error_log("Failed to set MySQL timezone: " . $e->getMessage());
}

// Set header untuk response ke mesin
header('Content-Type: text/plain');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Konfigurasi file
$logFile = 'adms_raw.log';
$csvFile = 'absensi.csv';
$timestamp = date('Y-m-d\TH:i:s.000\Z');
$clientIP = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Log semua request untuk debugging
$requestData = file_get_contents('php://input');
$logEntry = "[$timestamp] [$clientIP] " . $_SERVER['REQUEST_METHOD'] . " " . $_SERVER['REQUEST_URI'] . "\n";
if (!empty($requestData)) {
    $logEntry .= "Body: $requestData\n";
}
file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

// Handle GET request (status check dari mesin)
if ($_SERVER['REQUEST_METHOD'] == 'GET') {
    echo "OK\n";
    exit();
}

// Handle POST request (data upload dari mesin)
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    // Parse URL parameters
    $sn = $_GET['SN'] ?? '';
    $table = $_GET['table'] ?? '';
    $stamp = $_GET['Stamp'] ?? $_GET['OpStamp'] ?? '';
    
    // Log request details
    $logEntry = "SN: $sn, Table: $table, Stamp: $stamp\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
    
    // Get data from POST body
    $data = file_get_contents('php://input');
    
    if ($table == 'ATTLOG' && !empty($data)) {
        // Parse attendance data (format tab-separated)
        $lines = explode("\n", $data);
        
        // Create CSV header if file doesn't exist
        if (!file_exists($csvFile)) {
            $header = "timestamp,user_id,status,verified,work_code,raw_data\n";
            file_put_contents($csvFile, $header);
        }
        
        $recordCount = 0;
        $dbRecordCount = 0;
        
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;
            
            // Parse tab-separated data
            // Format: PIN\tDateTime\tStatus\tVerified\tWorkCode\tReserved\t...
            $parts = explode("\t", $line);
            if (count($parts) >= 3) {
                $pin = trim($parts[0]);
                $dateTime = trim($parts[1]);
                $status = trim($parts[2]);
                $verified = trim($parts[3] ?? '0');
                $workCode = trim($parts[4] ?? '0');
                
                // Convert status: 0 = Masuk, 1 = Keluar
                $statusText = ($status == '0') ? 'Masuk' : 'Keluar';
                
                // Save to CSV
                $csvRow = "\"$dateTime\",\"$pin\",\"$statusText\",\"$verified\",\"$workCode\",\"$line\"\n";
                file_put_contents($csvFile, $csvRow, FILE_APPEND | LOCK_EX);
                
                // Save to Database
                try {
                    $stmt = $pdo->prepare("INSERT INTO absen___pengurus (timestamp, id_pengurus, status, verified, work_code, raw_data) VALUES (?, ?, ?, ?, ?, ?)");
                    $result = $stmt->execute([
                        $dateTime,
                        (int)$pin,
                        $statusText,
                        (int)$verified,
                        $workCode,
                        $line
                    ]);
                    
                    if ($result) {
                        $dbRecordCount++;
                        error_log("Database: Inserted attendance record for user $pin at $dateTime");
                    }
                } catch (PDOException $e) {
                    error_log("Database Error: " . $e->getMessage());
                    $logEntry = "DATABASE ERROR: " . $e->getMessage() . "\n";
                    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
                }
                
                $recordCount++;
                
                // Log individual record
                $logEntry = "ATTENDANCE: User $pin, Time $dateTime, Status $statusText\n";
                file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
            }
        }
        
        $logEntry = "Processed $recordCount attendance records (CSV: $recordCount, DB: $dbRecordCount)\n\n";
        file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
    }
    
    if ($table == 'OPERLOG' && !empty($data)) {
        // Parse operation log data
        $lines = explode("\n", $data);
        
        // Create CSV header if file doesn't exist
        if (!file_exists($csvFile)) {
            $header = "timestamp,user_id,status,verified,work_code,raw_data\n";
            file_put_contents($csvFile, $header);
        }
        
        $recordCount = 0;
        $dbRecordCount = 0;
        
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;
            
            // Parse OPLOG format: OPLOG PIN\tDateTime\tStatus\tVerified\tWorkCode\tReserved
            if (strpos($line, 'OPLOG') === 0) {
                $parts = explode("\t", $line);
                if (count($parts) >= 4) {
                    $pin = trim($parts[1]);
                    $dateTime = trim($parts[2]);
                    $status = trim($parts[3]);
                    $verified = trim($parts[4] ?? '0');
                    $workCode = trim($parts[5] ?? '0');
                    
                    // Save to CSV
                    $csvRow = "\"$dateTime\",\"$pin\",\"$status\",\"$verified\",\"$workCode\",\"$line\"\n";
                    file_put_contents($csvFile, $csvRow, FILE_APPEND | LOCK_EX);
                    
                    // Save to Database
                    try {
                        $stmt = $pdo->prepare("INSERT INTO absen___pengurus (timestamp, id_pengurus, status, verified, work_code, raw_data) VALUES (?, ?, ?, ?, ?, ?)");
                        $result = $stmt->execute([
                            $dateTime,
                            (int)$pin,
                            $status,
                            (int)$verified,
                            $workCode,
                            $line
                        ]);
                        
                        if ($result) {
                            $dbRecordCount++;
                            error_log("Database: Inserted operation record for user $pin at $dateTime");
                        }
                    } catch (PDOException $e) {
                        error_log("Database Error: " . $e->getMessage());
                        $logEntry = "DATABASE ERROR: " . $e->getMessage() . "\n";
                        file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
                    }
                    
                    $recordCount++;
                    
                    // Log individual record
                    $logEntry = "OPERATION: User $pin, Time $dateTime, Status $status\n";
                    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
                }
            }
        }
        
        $logEntry = "Processed $recordCount operation records (CSV: $recordCount, DB: $dbRecordCount)\n\n";
        file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
    }
    
    // Send OK response to mesin
    echo "OK\n";
}
?>
