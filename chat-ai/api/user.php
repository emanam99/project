<?php
// Aktifkan error logging
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/error_log.txt');

// ===== Tambahan: Izinkan semua origin dan method (CORS) =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
// ============================================================

// Log request untuk debugging
error_log("=== REQUEST LOG ===");
error_log("Method: " . $_SERVER['REQUEST_METHOD']);
error_log("URL: " . $_SERVER['REQUEST_URI']);
error_log("Time: " . date('Y-m-d H:i:s'));

require_once 'config.php';

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

function sendResponse($success, $message, $data = null, $code = 200) {
    // Log response untuk debugging
    error_log("Response: " . json_encode([
        'success' => $success,
        'message' => $message,
        'code' => $code
    ]));
    
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit();
}

try {
    $pdo = getPdoConnection();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = [];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($contentType, 'application/json') !== false) {
            $input = json_decode(file_get_contents('php://input'), true);
        } else {
            $input = $_POST;
        }
        $action = $input['action'] ?? '';
        if ($action === 'check_user') {
            $userId = $input['user_id'] ?? '';
            if (empty($userId)) {
                echo json_encode(['exists' => false, 'message' => 'User ID required']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id FROM pengurus WHERE id = ?");
            $stmt->execute([$userId]);
            $exists = $stmt->fetch(PDO::FETCH_ASSOC) ? true : false;
            echo json_encode([
                'exists' => $exists,
                'message' => $exists ? 'User found' : 'User not found'
            ]);
            exit;
        } else if ($action === 'update_profile') {
            $userId = $input['user_id'] ?? '';
            $nama = $input['nama'] ?? '';
            $nik = $input['nik'] ?? '';
            $tempat_lahir = $input['tempat_lahir'] ?? '';
            $tanggal_lahir = $input['tanggal_lahir'] ?? '';
            $dusun = $input['dusun'] ?? '';
            $rt = $input['rt'] ?? '';
            $rw = $input['rw'] ?? '';
            $desa = $input['desa'] ?? '';
            $kecamatan = $input['kecamatan'] ?? '';
            $kabupaten = $input['kabupaten'] ?? '';
            $provinsi = $input['provinsi'] ?? '';
            $kode_pos = $input['kode_pos'] ?? '';
            // Password sekarang dihandle secara terpisah
            
            if (empty($userId)) {
                sendResponse(false, 'User ID required', null, 400);
                exit;
            }
            
            try {
                // Check if user exists
                $stmt = $pdo->prepare("SELECT id FROM pengurus WHERE id = ?");
                $stmt->execute([$userId]);
                if (!$stmt->fetch()) {
                    sendResponse(false, 'User tidak ditemukan', null, 404);
                    exit;
                }
                
                // Build update query
                $updateFields = [];
                $params = [];
                
                if (!empty($nama)) {
                    $updateFields[] = "nama = ?";
                    $params[] = $nama;
                }
                
                if (!empty($nik)) {
                    $updateFields[] = "nik = ?";
                    $params[] = $nik;
                }
                
                if (!empty($tempat_lahir)) {
                    $updateFields[] = "tempat_lahir = ?";
                    $params[] = $tempat_lahir;
                }
                
                if (!empty($tanggal_lahir)) {
                    $updateFields[] = "tanggal_lahir = ?";
                    $params[] = $tanggal_lahir;
                }
                
                if (!empty($dusun)) {
                    $updateFields[] = "dusun = ?";
                    $params[] = $dusun;
                }
                
                if (!empty($rt)) {
                    $updateFields[] = "rt = ?";
                    $params[] = $rt;
                }
                
                if (!empty($rw)) {
                    $updateFields[] = "rw = ?";
                    $params[] = $rw;
                }
                
                if (!empty($desa)) {
                    $updateFields[] = "desa = ?";
                    $params[] = $desa;
                }
                
                if (!empty($kecamatan)) {
                    $updateFields[] = "kecamatan = ?";
                    $params[] = $kecamatan;
                }
                
                if (!empty($kabupaten)) {
                    $updateFields[] = "kabupaten = ?";
                    $params[] = $kabupaten;
                }
                
                if (!empty($provinsi)) {
                    $updateFields[] = "provinsi = ?";
                    $params[] = $provinsi;
                }
                
                if (!empty($kode_pos)) {
                    $updateFields[] = "kode_pos = ?";
                    $params[] = $kode_pos;
                }
                
                // Password sekarang dihandle secara terpisah melalui action 'update_password'
                
                if (empty($updateFields)) {
                    sendResponse(false, 'Tidak ada data yang diubah', null, 400);
                    exit;
                }
                
                $params[] = $userId;
                $sql = "UPDATE pengurus SET " . implode(", ", $updateFields) . " WHERE id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                
                sendResponse(true, 'Profil berhasil diperbarui', null, 200);
                exit;
                
            } catch (Exception $e) {
                error_log("Update profile error: " . $e->getMessage());
                sendResponse(false, 'Gagal memperbarui profil: ' . $e->getMessage(), null, 500);
                exit;
            }
        } else if ($action === 'verify_password') {
            $userId = $input['user_id'] ?? '';
            $password = $input['password'] ?? '';
            
            // Log untuk debugging
            error_log("Verify password attempt - User ID: $userId");
            
            if (empty($userId) || empty($password)) {
                sendResponse(false, 'User ID dan password diperlukan', null, 400);
                exit;
            }
            
            try {
                $stmt = $pdo->prepare("SELECT id, pw FROM pengurus WHERE id = ?");
                $stmt->execute([$userId]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$user) {
                    sendResponse(false, 'User tidak ditemukan', null, 404);
                    exit;
                }
                
                // Verify password using SHA256 hash (same as login.php)
                $hashed_password = hash('sha256', $password);
                error_log("Password verification - Input hash: $hashed_password, DB hash: " . ($user['pw'] ?? 'NULL'));
                
                if ($user['pw'] === null || $user['pw'] === '') {
                    error_log("Password verification failed: Password not set");
                    sendResponse(false, 'Password belum diatur', null, 401);
                    exit;
                } else if ($hashed_password === $user['pw']) {
                    error_log("Password verification successful");
                    sendResponse(true, 'Verifikasi password berhasil', null, 200);
                    exit;
                } else {
                    error_log("Password verification failed: Hash mismatch");
                    sendResponse(false, 'Password salah', null, 401);
                    exit;
                }
                
            } catch (Exception $e) {
                error_log("Verify password error: " . $e->getMessage());
                sendResponse(false, 'Gagal verifikasi password: ' . $e->getMessage(), null, 500);
                exit;
            }
        } else if ($action === 'update_password') {
            $userId = $input['user_id'] ?? '';
            $newPassword = $input['new_password'] ?? '';
            
            if (empty($userId) || empty($newPassword)) {
                sendResponse(false, 'User ID dan password baru diperlukan', null, 400);
                exit;
            }
            
            // Tidak ada aturan minimal karakter untuk password
            // User bisa menggunakan password apa saja
            
            try {
                // Check if user exists
                $stmt = $pdo->prepare("SELECT id FROM pengurus WHERE id = ?");
                $stmt->execute([$userId]);
                if (!$stmt->fetch()) {
                    sendResponse(false, 'User tidak ditemukan', null, 404);
                    exit;
                }
                
                // Update password using SHA256 hash (same as login.php)
                $hashedPassword = hash('sha256', $newPassword);
                $stmt = $pdo->prepare("UPDATE pengurus SET pw = ? WHERE id = ?");
                $stmt->execute([$hashedPassword, $userId]);
                
                sendResponse(true, 'Password berhasil diubah', null, 200);
                exit;
                
            } catch (Exception $e) {
                error_log("Update password error: " . $e->getMessage());
                sendResponse(false, 'Gagal mengubah password: ' . $e->getMessage(), null, 500);
                exit;
            }
        } else {
            echo json_encode(['error' => 'Invalid action']);
            exit;
        }
    } else if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $id = $_GET['id'] ?? '';
        if (empty($id)) {
            echo json_encode(['success' => false, 'message' => 'ID parameter required']);
            exit;
        }
        $stmt = $pdo->prepare("SELECT id, nama, nik, tempat_lahir, tanggal_lahir, dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos, level FROM pengurus WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            echo json_encode([
                'success' => true,
                'user' => $user
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'User not found'
            ]);
        }
        exit;
    } else {
        error_log("Unsupported method: " . $_SERVER['REQUEST_METHOD']);
        sendResponse(false, 'Method tidak didukung', null, 405);
        exit;
    }
} catch (Exception $e) {
    error_log("User API Error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
    exit;
}
?> 