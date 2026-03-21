<?php
require 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Ambil input JSON jika POST atau DELETE
$input = json_decode(file_get_contents("php://input"), true);

// GET: ambil semua data chat untuk analytics
if ($method === 'GET') {
    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $stmt = $pdo->query("SELECT * FROM ai___chat ORDER BY timestamp DESC");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode($result);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// POST: tambahkan atau update data chat
if ($method === 'POST') {
    $id = isset($input['id']) ? intval($input['id']) : 0;
    $user_message = trim($input['user_message'] ?? '');
    $ai_response = trim($input['ai_response'] ?? '');
    $user_name = trim($input['user_name'] ?? '');
    $user_email = trim($input['user_email'] ?? '');
    $answer_type = trim($input['answer_type'] ?? 'AI');
    $category = trim($input['category'] ?? '');
    $timestamp = isset($input['timestamp']) ? trim($input['timestamp']) : date('Y-m-d H:i:s');
    $session_id = isset($input['session_id']) ? trim($input['session_id']) : '';
    $model_used = isset($input['model_used']) ? trim($input['model_used']) : '';

    if (!$user_message || !$ai_response) {
        http_response_code(400);
        echo json_encode(["error" => "Pesan user dan respons AI tidak boleh kosong."]);
        exit;
    }

    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        if ($id > 0) {
            // Update data
            $stmt = $pdo->prepare("UPDATE ai___chat SET user_message=?, ai_response=?, user_name=?, user_email=?, answer_type=?, category=?, timestamp=?, session_id=?, model_used=? WHERE id=?");
            $stmt->execute([$user_message, $ai_response, $user_name, $user_email, $answer_type, $category, $timestamp, $session_id, $model_used, $id]);
        } else {
            // Insert data baru
            $stmt = $pdo->prepare("INSERT INTO ai___chat (user_message, ai_response, user_name, user_email, answer_type, category, timestamp, session_id, model_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$user_message, $ai_response, $user_name, $user_email, $answer_type, $category, $timestamp, $session_id, $model_used]);
        }

        echo json_encode(["success" => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// DELETE: hapus data berdasarkan id
if ($method === 'DELETE') {
    $id = isset($input['id']) ? intval($input['id']) : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["error" => "ID tidak valid."]);
        exit;
    }

    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $stmt = $pdo->prepare("DELETE FROM ai___chat WHERE id=?");
        $stmt->execute([$id]);
        
        echo json_encode(["success" => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// Jika metode tidak dikenali
http_response_code(405);
echo json_encode(["error" => "Metode tidak didukung."]);
exit;
?>