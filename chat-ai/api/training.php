<?php
require 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Ambil input JSON jika POST atau DELETE
$input = json_decode(file_get_contents("php://input"), true);

// GET: ambil semua data training
if ($method === 'GET') {
    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $stmt = $pdo->query("SELECT * FROM ai___training ORDER BY id DESC");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode($result);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
    exit;
}

// POST: tambahkan atau update data
if ($method === 'POST') {
    $id = isset($input['id']) ? intval($input['id']) : 0;
    $question = trim($input['question'] ?? '');
    $answer = trim($input['answer'] ?? '');
    $category = trim($input['category'] ?? 'Umum');
    $admin = trim($input['admin'] ?? '');

    if (!$question || !$answer) {
        http_response_code(400);
        echo json_encode(["error" => "Pertanyaan dan jawaban tidak boleh kosong."]);
        exit;
    }

    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        if ($id > 0) {
            // Update data
            $stmt = $pdo->prepare("UPDATE ai___training SET question=?, answer=?, category=?, admin=? WHERE id=?");
            $stmt->execute([$question, $answer, $category, $admin, $id]);
        } else {
            // Insert data baru
            $stmt = $pdo->prepare("INSERT INTO ai___training (question, answer, category, admin) VALUES (?, ?, ?, ?)");
            $stmt->execute([$question, $answer, $category, $admin]);
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
        
        $stmt = $pdo->prepare("DELETE FROM ai___training WHERE id=?");
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
