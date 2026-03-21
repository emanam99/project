<?php
require 'config.php';

// Konfigurasi Gemini API
const GEMINI_API_KEY = "AIzaSyCt-NnICWDG_wW6zft1Ety3yNXt-grtrQY";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Fungsi untuk normalisasi teks
function normalizeText($text) {
    return strtolower(trim(preg_replace('/[^\w\s]/', '', $text)));
}

// Fungsi untuk ekstrak keywords yang lebih spesifik
function extractKeywords($text) {
    $normalized = normalizeText($text);
    $words = preg_split('/\s+/', $normalized);
    return array_filter($words, function($word) {
        return strlen($word) > 2;
    });
}

// Fungsi untuk mencari data training yang paling relevan
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

// Fungsi untuk mencari data training messages yang relevan
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

// Fungsi untuk memanggil Gemini API
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
    curl_setopt($ch, CURLOPT_URL, GEMINI_API_URL . '?key=' . GEMINI_API_KEY);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return ['error' => 'HTTP Error: ' . $httpCode];
    }
    
    $result = json_decode($response, true);
    return $result;
}

// Fungsi untuk menyimpan chat ke database
function saveChatToDatabase($pdo, $userMessage, $aiResponse, $answerType = 'AI', $category = '', $userName = '', $userEmail = '') {
    $stmt = $pdo->prepare("INSERT INTO ai___chat (user_message, ai_response, user_name, user_email, answer_type, category, timestamp, session_id, model_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    $timestamp = date('Y-m-d H:i:s');
    $sessionId = time();
    $modelUsed = 'gemini-2.0-flash';
    
    return $stmt->execute([
        $userMessage,
        $aiResponse,
        $userName,
        $userEmail,
        $answerType,
        $category,
        $timestamp,
        $sessionId,
        $modelUsed
    ]);
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $userMessage = trim($input['user_message'] ?? '');
    $userName = trim($input['user_name'] ?? '');
    $userEmail = trim($input['user_email'] ?? '');
    
    if (empty($userMessage)) {
        http_response_code(400);
        echo json_encode(['error' => 'Pesan user tidak boleh kosong']);
        exit;
    }
    
    try {
        // Koneksi PDO
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // 1. Cari data training yang relevan
        try {
            $trainingData = findRelevantTrainingData($pdo, $userMessage);
        } catch (Exception $e) {
            error_log("Error finding training data: " . $e->getMessage());
            $trainingData = [];
        }
        
        // 2. Cari data training messages yang relevan
        try {
            $messagesData = findRelevantTrainingMessages($pdo, $userMessage);
        } catch (Exception $e) {
            error_log("Error finding messages data: " . $e->getMessage());
            $messagesData = [];
        }
        
        // Debug: Log data yang ditemukan
        error_log("User Message: " . $userMessage);
        error_log("Training Data found: " . count($trainingData));
        error_log("Messages Data found: " . count($messagesData));
        
        // 3. Buat context yang lebih spesifik
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
        
        $context .= "PERTANYAAN USER: {$userMessage}\n\n";
        $context .= "JAWABAN:";
        
        error_log("Context: " . $context);
        
        // 4. Panggil Gemini untuk jawaban
        try {
            $result = callGeminiAPI($context);
            
            if (isset($result['error'])) {
                throw new Exception($result['error']);
            }
            
            $aiText = $result['candidates'][0]['content']['parts'][0]['text'] ?? 'Maaf, AI tidak dapat menjawab saat ini.';
        } catch (Exception $e) {
            error_log("Error calling Gemini API: " . $e->getMessage());
            $aiText = 'Maaf, terjadi kesalahan saat menghubungi AI. Silakan coba lagi.';
        }
        
        error_log("Gemini Response: " . $aiText);
        
        // 5. Tentukan kategori berdasarkan data training
        $categories = [];
        
        // Ambil kategori dari data training yang ditemukan
        foreach ($trainingData as $item) {
            if (!empty($item['category']) && $item['category'] !== 'Umum') {
                $categories[] = $item['category'];
            }
        }
        
        error_log("Available categories from training: " . implode(', ', array_unique($categories)));
        
        // Jika ada kategori dari training data, minta AI untuk memilih dan menambah
        if (!empty($categories)) {
            try {
                $uniqueCategories = array_unique($categories);
                $categoryPrompt = "Berdasarkan data training berikut, pilih 1 kategori yang paling sesuai dari: " . implode(', ', $uniqueCategories) . "\n";
                $categoryPrompt .= "Lalu tambahkan 2 kategori tambahan yang terkait (misal: usulan, saran, pertanyaan, kritik, dll).\n";
                $categoryPrompt .= "Format jawaban: kategori_pilihan, kategori_tambahan1, kategori_tambahan2 (3 kategori dipisahkan koma, tanpa penjelasan).\n";
                $categoryPrompt .= "Pertanyaan user: {$userMessage}\n";
                $categoryPrompt .= "Jawab hanya dengan daftar 3 kategori, tanpa penjelasan.";
                
                $categoryResult = callGeminiAPI($categoryPrompt, 0.2, 64);
                $finalCategories = 'Umum';
                
                if (!isset($categoryResult['error'])) {
                    $categoryText = $categoryResult['candidates'][0]['content']['parts'][0]['text'] ?? '';
                    $categoryArray = array_map('trim', explode(',', $categoryText));
                    $categoryArray = array_filter($categoryArray);
                    $finalCategories = implode(', ', array_slice($categoryArray, 0, 3));
                }
            } catch (Exception $e) {
                error_log("Error determining categories: " . $e->getMessage());
                $finalCategories = 'Umum';
            }
        } else {
            $finalCategories = 'Umum';
        }
        
        error_log("Final categories: " . $finalCategories);
        
        // 6. Simpan ke database
        try {
            saveChatToDatabase($pdo, $userMessage, $aiText, 'Gemini', $finalCategories, $userName, $userEmail);
        } catch (Exception $e) {
            error_log("Error saving to database: " . $e->getMessage());
            // Lanjutkan meskipun gagal save ke database
        }
        
        // 7. Return response
        echo json_encode([
            'success' => true,
            'ai_response' => $aiText,
            'training_data_count' => count($trainingData),
            'messages_data_count' => count($messagesData),
            'categories' => $finalCategories
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Terjadi kesalahan: ' . $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString()
        ]);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Metode tidak didukung']);
}
?> 