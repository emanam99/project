<?php
header('Content-Type: application/json');
require_once 'config.php';

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

function response($data) {
    echo json_encode($data);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($_POST['action'] ?? null);

// Log request for debugging
error_log("Training Chat API Request - Method: $method, Action: $action");

// GET requests
if ($method === 'GET') {
    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        if ($action === 'list_sessions') {
            $stmt = $pdo->query("SELECT * FROM ai___training_sessions ORDER BY created_at DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            response($result);
        }
        
        if ($action === 'list_messages' && isset($_GET['session_id'])) {
            $sid = intval($_GET['session_id']);
            $stmt = $pdo->prepare("SELECT * FROM ai___training_messages WHERE session_id=? ORDER BY created_at ASC");
            $stmt->execute([$sid]);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            response($result);
        }
        
        if ($action === 'all_messages') {
            $stmt = $pdo->query("SELECT * FROM ai___training_messages");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            response($result);
        }
        
        response(['error' => 'Aksi GET tidak valid', 'action' => $action]);
        
    } catch (PDOException $e) {
        error_log("Database error in GET action: " . $e->getMessage());
        response(['error' => 'Database error: ' . $e->getMessage()]);
    } catch (Exception $e) {
        error_log("General error in GET action: " . $e->getMessage());
        response(['error' => 'Error: ' . $e->getMessage()]);
    }
}

// POST requests
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        error_log("Invalid JSON input: " . file_get_contents('php://input'));
        response(['error' => 'Input JSON tidak valid', 'raw' => file_get_contents('php://input')]);
    }
    
    error_log("POST action: " . ($input['action'] ?? 'unknown'));
    
    try {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        if ($input['action'] === 'create_session') {
            $title = trim($input['title']);
            $admin = 'admin';
            
            if (empty($title)) {
                response(['error' => 'Judul sesi tidak boleh kosong']);
            }
            
            $stmt = $pdo->prepare("INSERT INTO ai___training_sessions (title, admin) VALUES (?, ?)");
            $stmt->execute([$title, $admin]);
            $sessionId = $pdo->lastInsertId();
            
            error_log("Created session with ID: $sessionId");
            response(['success' => true, 'id' => $sessionId]);
        }
        
        if ($input['action'] === 'send_message') {
            $sid = intval($input['session_id']);
            $sender = trim($input['sender']);
            $msg = trim($input['message']);
            $parent = isset($input['parent_id']) ? intval($input['parent_id']) : null;
            $admin = 'admin';
            
            error_log("Send message - Session ID: $sid, Sender: $sender, Message: $msg");
            
            // Validasi input
            if (empty($sid) || $sid <= 0) {
                response(['error' => 'Session ID tidak valid']);
            }
            
            if (empty($sender)) {
                response(['error' => 'Sender tidak boleh kosong']);
            }
            
            if (empty($msg)) {
                response(['error' => 'Pesan tidak boleh kosong']);
            }
            
            // Validasi session exists
            $stmt = $pdo->prepare("SELECT id FROM ai___training_sessions WHERE id = ?");
            $stmt->execute([$sid]);
            if (!$stmt->fetch()) {
                response(['error' => 'Session tidak ditemukan']);
            }
            
            try {
                $stmt = $pdo->prepare("INSERT INTO ai___training_messages (session_id, sender, message, parent_id, admin) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$sid, $sender, $msg, $parent, $admin]);
                $user_msg_id = $pdo->lastInsertId();
                
                error_log("Message inserted with ID: $user_msg_id");
                
                // Jika sender user, generate balasan AI
                if ($sender === 'user') {
                    error_log("Generating AI response for user message");
                    $jawaban = cari_jawaban($msg, $pdo);
                    error_log("AI response: $jawaban");
                    
                    $stmt2 = $pdo->prepare("INSERT INTO ai___training_messages (session_id, sender, message, parent_id, admin) VALUES (?, 'ai', ?, ?, ?)");
                    $stmt2->execute([$sid, $jawaban, $user_msg_id, $admin]);
                    $ai_msg_id = $pdo->lastInsertId();
                    
                    error_log("AI message inserted with ID: $ai_msg_id");
                    response(['success' => true, 'id' => $user_msg_id, 'ai_id' => $ai_msg_id]);
                } else {
                    response(['success' => true, 'id' => $user_msg_id]);
                }
            } catch (PDOException $e) {
                error_log("Database error in send_message: " . $e->getMessage());
                response(['error' => 'Database error: ' . $e->getMessage()]);
            }
        }
        
        if ($input['action'] === 'edit_message') {
            $id = intval($input['id']);
            $message = trim($input['message']);
            
            // Boleh edit pesan user, trainer, dan ai
            $stmt = $pdo->prepare("SELECT sender FROM ai___training_messages WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                response(['error' => 'Pesan tidak ditemukan']);
            }
            
            $stmt = $pdo->prepare("UPDATE ai___training_messages SET message=? WHERE id=?");
            $stmt->execute([$message, $id]);
            response(['success' => true]);
        }
        
        if ($input['action'] === 'delete_message') {
            $id = intval($input['id']);
            
            // Boleh hapus pesan user, trainer, dan ai
            $stmt = $pdo->prepare("SELECT sender FROM ai___training_messages WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                response(['error' => 'Pesan tidak ditemukan']);
            }
            
            $stmt = $pdo->prepare("DELETE FROM ai___training_messages WHERE id=?");
            $stmt->execute([$id]);
            response(['success' => true]);
        }
        
        if ($input['action'] === 'delete_session') {
            $id = intval($input['id']);
            
            // Hapus semua pesan di sesi
            $stmt1 = $pdo->prepare("DELETE FROM ai___training_messages WHERE session_id=?");
            $stmt2 = $pdo->prepare("DELETE FROM ai___training_sessions WHERE id=?");
            $stmt1->execute([$id]);
            $stmt2->execute([$id]);
            response(['success' => true]);
        }
        
        if ($input['action'] === 'approve_message') {
            $id = intval($input['id']);
            $stmt = $pdo->prepare("UPDATE ai___training_messages SET approved_as_training=1 WHERE id=?");
            $stmt->execute([$id]);
            response(['success' => true]);
        }
        
        if ($input['action'] === 'feedback_message') {
            $id = intval($input['id']);
            $feedback = trim($input['feedback']);
            
            $stmt = $pdo->prepare("UPDATE ai___training_messages SET feedback=?, approved_as_training=0 WHERE id=?");
            $stmt->execute([$feedback, $id]);
            
            // Jika ada koreksi, tambahkan ke ai___training
            if (strlen($feedback) > 0) {
                // Ambil pertanyaan user (parent_id)
                $stmt = $pdo->prepare("SELECT parent_id FROM ai___training_messages WHERE id=?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($row) {
                    $parent_id = intval($row['parent_id']);
                    $stmt = $pdo->prepare("SELECT message FROM ai___training_messages WHERE id=?");
                    $stmt->execute([$parent_id]);
                    $r = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($r) {
                        $question = $r['message'];
                        // Simpan ke QnA jika belum ada
                        $stmt = $pdo->prepare("SELECT id FROM ai___training WHERE question=?");
                        $stmt->execute([$question]);
                        
                        if (!$stmt->fetch()) {
                            $stmt = $pdo->prepare("INSERT INTO ai___training (question, answer, category, admin) VALUES (?, ?, 'Lainnya', 'admin')");
                            $stmt->execute([$question, $feedback]);
                        }
                    }
                }
            }
            response(['success' => true]);
        }
        
        if ($input['action'] === 'find_answer') {
            $pertanyaan = trim($input['question'] ?? '');
            
            // Cari di ai___training_messages (LIKE, pola tanya-jawab)
            $stmt = $pdo->prepare("SELECT id FROM ai___training_messages WHERE sender='user' AND message LIKE ? ORDER BY id DESC LIMIT 1");
            $stmt->execute(['%' . $pertanyaan . '%']);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($row) {
                $user_msg_id = $row['id'];
                $stmt = $pdo->prepare("SELECT message FROM ai___training_messages WHERE parent_id=? AND (sender='ai' OR sender='trainer') ORDER BY id ASC LIMIT 1");
                $stmt->execute([$user_msg_id]);
                $ans = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($ans) response(['answer' => $ans['message']]);
            }
            response(['answer' => null]);
        }
        
        response(['error' => 'Aksi tidak valid', 'input' => $input]);
        
    } catch (PDOException $e) {
        error_log("Database error in POST action: " . $e->getMessage());
        response(['error' => 'Database error: ' . $e->getMessage()]);
    } catch (Exception $e) {
        error_log("General error in POST action: " . $e->getMessage());
        response(['error' => 'Error: ' . $e->getMessage()]);
    }
}

response(['error' => 'Aksi tidak valid', 'method' => $method, 'action' => $action]); 

function normalizeText($text) {
    return strtolower(trim(preg_replace('/[^\w\s]/', '', $text)));
}

function extractKeywords($text) {
    $normalized = normalizeText($text);
    $words = preg_split('/\s+/', $normalized);
    return array_filter($words, function($word) {
        return strlen($word) > 2;
    });
}

// Fungsi untuk mencari data training yang paling relevan (sama seperti gemini.php)
function findRelevantTrainingData($pdo, $question) {
    $keywords = extractKeywords($question);
    $relevantData = [];
    
    // Cari berdasarkan kata kunci yang paling spesifik
    foreach ($keywords as $keyword) {
        $stmt = $pdo->prepare("SELECT * FROM ai___training WHERE question LIKE ? OR answer LIKE ? LIMIT 3");
        $searchTerm = '%' . $keyword . '%';
        $stmt->execute([$searchTerm, $searchTerm]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($results as $result) {
            $relevantData[] = $result;
        }
    }
    
    // Hapus duplikat dan ambil yang paling relevan
    $uniqueData = [];
    foreach ($relevantData as $item) {
        $key = $item['id'];
        if (!isset($uniqueData[$key])) {
            $uniqueData[$key] = $item;
        }
    }
    
    return array_values($uniqueData);
}

// Fungsi untuk mencari data training messages yang relevan (sama seperti gemini.php)
function findRelevantTrainingMessages($pdo, $question) {
    $keywords = extractKeywords($question);
    $relevantMessages = [];
    
    foreach ($keywords as $keyword) {
        // Cari pesan user yang mengandung keyword
        $stmt = $pdo->prepare("SELECT * FROM ai___training_messages WHERE sender = 'user' AND message LIKE ? LIMIT 5");
        $searchTerm = '%' . $keyword . '%';
        $stmt->execute([$searchTerm]);
        $userMessages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($userMessages as $userMsg) {
            // Cari jawaban untuk pesan user ini
            $stmt = $pdo->prepare("SELECT * FROM ai___training_messages WHERE parent_id = ? AND (sender = 'ai' OR sender = 'trainer') ORDER BY approved_as_training DESC, id ASC LIMIT 1");
            $stmt->execute([$userMsg['id']]);
            $answer = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($answer) {
                $relevantMessages[] = [
                    'question' => $userMsg['message'],
                    'answer' => $answer['feedback'] ?: $answer['message'],
                    'approved' => $answer['approved_as_training'] == 1
                ];
            }
        }
    }
    
    return $relevantMessages;
}

// Fungsi untuk memanggil Gemini API (sama seperti gemini.php)
function callGeminiAPI($prompt, $temperature = 0.7, $maxTokens = 1024) {
    $payload = [
        'contents' => [
            [
                'role' => 'user',
                'parts' => [['text' => $prompt]]
            ]
        ],
        'generationConfig' => [
            'temperature' => $temperature,
            'topK' => 40,
            'topP' => 0.95,
            'maxOutputTokens' => $maxTokens
        ]
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyCt-NnICWDG_wW6zft1Ety3yNXt-grtrQY');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return 'Maaf, AI tidak dapat menjawab saat ini. Silakan coba lagi nanti.';
    }
    
    $result = json_decode($response, true);
    
    if (isset($result['candidates'][0]['content']['parts'][0]['text'])) {
        return $result['candidates'][0]['content']['parts'][0]['text'];
    } else {
        return 'Maaf, terjadi kesalahan dalam memproses jawaban AI.';
    }
}

function cari_jawaban($pertanyaan, $pdo) {
    error_log("Searching for answer to: $pertanyaan");
    
    // 1. Cari data training yang relevan (sama seperti gemini.php)
    $trainingData = findRelevantTrainingData($pdo, $pertanyaan);
    
    // 2. Cari data training messages yang relevan (sama seperti gemini.php)
    $messagesData = findRelevantTrainingMessages($pdo, $pertanyaan);
    
    // 3. Buat context yang lebih spesifik (sama seperti gemini.php)
    $context = "Berdasarkan data training berikut, jawablah pertanyaan user:\n\n";
    
    // Tambahkan data training
    if (!empty($trainingData)) {
        $context .= "DATA TRAINING:\n";
        foreach ($trainingData as $item) {
            $context .= "Q: {$item['question']}\nA: {$item['answer']}\n\n";
        }
    }
    
    // Tambahkan data messages
    if (!empty($messagesData)) {
        $context .= "DATA CHAT TRAINING:\n";
        foreach ($messagesData as $item) {
            $label = $item['approved'] ? ' [APPROVED]' : '';
            $context .= "Q: {$item['question']}\nA: {$item['answer']}{$label}\n\n";
        }
    }
    
    // Jika tidak ada data relevan, gunakan prompt umum
    if (empty($trainingData) && empty($messagesData)) {
        $context = "Anda adalah AI yang telah dilatih dengan data dari Pesantren Salafiyah Al-Utsmani. ";
        $context .= "Jawablah pertanyaan berikut berdasarkan pengetahuan Anda tentang pesantren dan Islam:\n\n";
    }
    
    $context .= "PERTANYAAN USER: {$pertanyaan}\n\n";
    $context .= "JAWABAN:";
    
    error_log("Context: " . $context);
    
    // 4. Panggil Gemini untuk jawaban (sama seperti gemini.php)
    $gemini_answer = callGeminiAPI($context);
    error_log("Gemini answer: $gemini_answer");
    return $gemini_answer;
}
