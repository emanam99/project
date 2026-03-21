<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Kelola ai___training & ai___training_sessions / ai___training_messages (super_admin).
 * Jawaban otomatis untuk sender "user" memakai bank Q&A + riwayat chat (tanpa API eksternal).
 */
class AiTrainingAdminController
{
    private function db(): \PDO
    {
        return Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withStatus($status);
    }

    private function getJsonBody(Request $request): array
    {
        $raw = (string) $request->getBody();
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function adminLabel(?array $user): string
    {
        if (!$user) {
            return 'admin';
        }
        $email = trim((string) ($user['email'] ?? ''));
        if ($email !== '') {
            return $email;
        }
        $nama = trim((string) ($user['nama'] ?? $user['name'] ?? ''));
        if ($nama !== '') {
            return $nama;
        }

        return trim((string) ($user['role_key'] ?? 'super_admin')) ?: 'admin';
    }

    private function resolveUsersId(?array $user, \PDO $pdo): ?int
    {
        if (!$user) {
            return null;
        }
        if (!empty($user['users_id']) && (int) $user['users_id'] > 0) {
            return (int) $user['users_id'];
        }
        $uid = (int) ($user['user_id'] ?? 0);
        if ($uid < 1) {
            return null;
        }
        $stmt = $pdo->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$uid]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row && !empty($row['id_user'])) {
            return (int) $row['id_user'];
        }
        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$uid]);

        return $stmt->fetch(\PDO::FETCH_ASSOC) ? $uid : null;
    }

    private function columnExists(\PDO $db, string $table, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $st->execute([$table, $column]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function normalizeText(string $text): string
    {
        return strtolower(trim(preg_replace('/[^\w\s]/u', '', $text)));
    }

    /**
     * @return string[]
     */
    private static function extractKeywords(string $text): array
    {
        $normalized = self::normalizeText($text);
        $words = preg_split('/\s+/', $normalized) ?: [];

        return array_values(array_filter($words, static function ($word) {
            return strlen((string) $word) > 2;
        }));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function findRelevantTrainingData(\PDO $pdo, string $question): array
    {
        $keywords = self::extractKeywords($question);
        $relevantData = [];
        foreach ($keywords as $keyword) {
            $stmt = $pdo->prepare('SELECT * FROM ai___training WHERE question LIKE ? OR answer LIKE ? LIMIT 3');
            $term = '%' . $keyword . '%';
            $stmt->execute([$term, $term]);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $result) {
                $relevantData[(int) $result['id']] = $result;
            }
        }

        return array_values($relevantData);
    }

    /**
     * @return array<int, array{question: string, answer: string, approved: bool}>
     */
    private function findRelevantTrainingMessages(\PDO $pdo, string $question): array
    {
        $keywords = self::extractKeywords($question);
        $out = [];
        foreach ($keywords as $keyword) {
            $stmt = $pdo->prepare(
                "SELECT * FROM ai___training_messages WHERE sender = 'user' AND message LIKE ? LIMIT 5"
            );
            $stmt->execute(['%' . $keyword . '%']);
            $userMessages = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($userMessages as $userMsg) {
                $stmt2 = $pdo->prepare(
                    "SELECT * FROM ai___training_messages WHERE parent_id = ? AND (sender = 'ai' OR sender = 'trainer') "
                    . 'ORDER BY approved_as_training DESC, id ASC LIMIT 1'
                );
                $stmt2->execute([(int) $userMsg['id']]);
                $answer = $stmt2->fetch(\PDO::FETCH_ASSOC);
                if ($answer) {
                    $out[] = [
                        'question' => (string) $userMsg['message'],
                        'answer' => (string) (($answer['feedback'] ?? '') !== '' ? $answer['feedback'] : $answer['message']),
                        'approved' => (int) ($answer['approved_as_training'] ?? 0) === 1,
                    ];
                }
            }
        }

        return $out;
    }

    private function buildLocalAiReply(\PDO $pdo, string $pertanyaan): string
    {
        $trainingData = $this->findRelevantTrainingData($pdo, $pertanyaan);
        $messagesData = $this->findRelevantTrainingMessages($pdo, $pertanyaan);

        if ($trainingData === [] && $messagesData === []) {
            return '_(Tidak ada jawaban otomatis dari bank training.)_ Silakan balas dengan peran **AI** atau **Trainer**, atau tambahkan pasangan Q&A di menu **Training**.';
        }

        $parts = [];
        if ($trainingData !== []) {
            $parts[] = "**Dari bank Q&A:**\n\n";
            foreach (array_slice($trainingData, 0, 4) as $item) {
                $parts[] = '• **Q:** ' . $item['question'] . "\n  **A:** " . $item['answer'] . "\n\n";
            }
        }
        if ($messagesData !== []) {
            $parts[] = "**Dari riwayat training chat:**\n\n";
            foreach (array_slice($messagesData, 0, 4) as $item) {
                $label = $item['approved'] ? ' _(disetujui)_' : '';
                $parts[] = '• **Q:** ' . $item['question'] . "\n  **A:** " . $item['answer'] . $label . "\n\n";
            }
        }

        return trim(implode('', $parts));
    }

    /** GET /api/ai-training/bank */
    public function listBank(Request $request, Response $response): Response
    {
        try {
            $pdo = $this->db();
            $stmt = $pdo->query('SELECT * FROM ai___training ORDER BY id DESC');
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::listBank ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat bank training'], 500);
        }
    }

    /** POST /api/ai-training/bank — body: id?, question, answer, category?, admin? */
    public function saveBank(Request $request, Response $response): Response
    {
        $body = $this->getJsonBody($request);
        $id = isset($body['id']) ? (int) $body['id'] : 0;
        $question = trim((string) ($body['question'] ?? ''));
        $answer = trim((string) ($body['answer'] ?? ''));
        $category = trim((string) ($body['category'] ?? 'Tentang Al-Utsmani'));
        $user = $request->getAttribute('user');
        $admin = trim((string) ($body['admin'] ?? ''));
        if ($admin === '') {
            $admin = $this->adminLabel(is_array($user) ? $user : null);
        }

        if ($question === '' || $answer === '') {
            return $this->json($response, ['success' => false, 'message' => 'Pertanyaan dan jawaban wajib diisi'], 400);
        }

        try {
            $pdo = $this->db();
            if ($id > 0) {
                $stmt = $pdo->prepare('UPDATE ai___training SET question=?, answer=?, category=?, admin=? WHERE id=?');
                $stmt->execute([$question, $answer, $category, $admin, $id]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO ai___training (question, answer, category, admin) VALUES (?, ?, ?, ?)');
                $stmt->execute([$question, $answer, $category, $admin]);
            }

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::saveBank ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan data'], 500);
        }
    }

    /** DELETE /api/ai-training/bank/{id} */
    public function deleteBank(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $stmt = $pdo->prepare('DELETE FROM ai___training WHERE id=?');
            $stmt->execute([$id]);

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::deleteBank ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus'], 500);
        }
    }

    /** GET /api/ai-training/sessions */
    public function listSessions(Request $request, Response $response): Response
    {
        try {
            $pdo = $this->db();
            $stmt = $pdo->query('SELECT * FROM ai___training_sessions ORDER BY created_at DESC');
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::listSessions ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat sesi'], 500);
        }
    }

    /** POST /api/ai-training/sessions — { title } */
    public function createSession(Request $request, Response $response): Response
    {
        $body = $this->getJsonBody($request);
        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            return $this->json($response, ['success' => false, 'message' => 'Judul sesi tidak boleh kosong'], 400);
        }

        $user = $request->getAttribute('user');
        $u = is_array($user) ? $user : null;
        $admin = $this->adminLabel($u);

        try {
            $pdo = $this->db();
            $usersId = $this->resolveUsersId($u, $pdo);
            if ($usersId !== null && $this->columnExists($pdo, 'ai___training_sessions', 'users_id')) {
                $stmt = $pdo->prepare('INSERT INTO ai___training_sessions (title, admin, users_id) VALUES (?, ?, ?)');
                $stmt->execute([$title, $admin, $usersId]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO ai___training_sessions (title, admin) VALUES (?, ?)');
                $stmt->execute([$title, $admin]);
            }
            $newId = (int) $pdo->lastInsertId();

            return $this->json($response, ['success' => true, 'data' => ['id' => $newId]], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::createSession ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat sesi'], 500);
        }
    }

    /** DELETE /api/ai-training/sessions/{id} */
    public function deleteSession(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID sesi tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $pdo->prepare('DELETE FROM ai___training_messages WHERE session_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM ai___training_sessions WHERE id=?')->execute([$id]);

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::deleteSession ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus sesi'], 500);
        }
    }

    /** GET /api/ai-training/sessions/{id}/messages */
    public function listMessages(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID sesi tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $stmt = $pdo->prepare('SELECT * FROM ai___training_messages WHERE session_id=? ORDER BY created_at ASC');
            $stmt->execute([$id]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::listMessages ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat pesan'], 500);
        }
    }

    /** POST /api/ai-training/messages — session_id, sender, message, parent_id? */
    public function sendMessage(Request $request, Response $response): Response
    {
        $body = $this->getJsonBody($request);
        $sid = (int) ($body['session_id'] ?? 0);
        $sender = trim((string) ($body['sender'] ?? ''));
        $msg = trim((string) ($body['message'] ?? ''));
        $parent = isset($body['parent_id']) && $body['parent_id'] !== null && $body['parent_id'] !== ''
            ? (int) $body['parent_id']
            : null;

        if ($sid < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Session ID tidak valid'], 400);
        }
        if (!in_array($sender, ['user', 'ai', 'trainer'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Sender harus user, ai, atau trainer'], 400);
        }
        if ($msg === '') {
            return $this->json($response, ['success' => false, 'message' => 'Pesan tidak boleh kosong'], 400);
        }

        $user = $request->getAttribute('user');
        $u = is_array($user) ? $user : null;
        $admin = $this->adminLabel($u);

        try {
            $pdo = $this->db();
            $chk = $pdo->prepare('SELECT id FROM ai___training_sessions WHERE id = ?');
            $chk->execute([$sid]);
            if (!$chk->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak ditemukan'], 404);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO ai___training_messages (session_id, sender, message, parent_id, admin) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$sid, $sender, $msg, $parent, $admin]);
            $userMsgId = (int) $pdo->lastInsertId();

            if ($sender === 'user') {
                $jawaban = $this->buildLocalAiReply($pdo, $msg);
                $stmt2 = $pdo->prepare(
                    'INSERT INTO ai___training_messages (session_id, sender, message, parent_id, admin) VALUES (?, \'ai\', ?, ?, ?)'
                );
                $stmt2->execute([$sid, $jawaban, $userMsgId, $admin]);
                $aiId = (int) $pdo->lastInsertId();

                return $this->json($response, [
                    'success' => true,
                    'data' => ['id' => $userMsgId, 'ai_id' => $aiId],
                ], 200);
            }

            return $this->json($response, ['success' => true, 'data' => ['id' => $userMsgId]], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::sendMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengirim pesan'], 500);
        }
    }

    /** PATCH /api/ai-training/messages/{id} — { message } */
    public function patchMessage(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $body = $this->getJsonBody($request);
        $message = trim((string) ($body['message'] ?? ''));
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID pesan tidak valid'], 400);
        }
        if ($message === '') {
            return $this->json($response, ['success' => false, 'message' => 'Isi pesan tidak boleh kosong'], 400);
        }
        try {
            $pdo = $this->db();
            $stmt = $pdo->prepare('SELECT id FROM ai___training_messages WHERE id=?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            $pdo->prepare('UPDATE ai___training_messages SET message=? WHERE id=?')->execute([$message, $id]);

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::patchMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui pesan'], 500);
        }
    }

    /** DELETE /api/ai-training/messages/{id} */
    public function deleteMessage(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID pesan tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $stmt = $pdo->prepare('SELECT id FROM ai___training_messages WHERE id=?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            $pdo->prepare('DELETE FROM ai___training_messages WHERE id=?')->execute([$id]);

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::deleteMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus pesan'], 500);
        }
    }

    /** POST /api/ai-training/messages/{id}/approve */
    public function approveMessage(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID pesan tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $pdo->prepare('UPDATE ai___training_messages SET approved_as_training=1 WHERE id=?')->execute([$id]);

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::approveMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyetujui'], 500);
        }
    }

    /** POST /api/ai-training/messages/{id}/feedback — { feedback } */
    public function feedbackMessage(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $body = $this->getJsonBody($request);
        $feedback = trim((string) ($body['feedback'] ?? ''));
        if ($id < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID pesan tidak valid'], 400);
        }
        try {
            $pdo = $this->db();
            $pdo->prepare('UPDATE ai___training_messages SET feedback=?, approved_as_training=0 WHERE id=?')->execute([$feedback, $id]);

            if ($feedback !== '') {
                $stmt = $pdo->prepare('SELECT parent_id FROM ai___training_messages WHERE id=?');
                $stmt->execute([$id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && !empty($row['parent_id'])) {
                    $parentId = (int) $row['parent_id'];
                    $stmt = $pdo->prepare('SELECT message FROM ai___training_messages WHERE id=?');
                    $stmt->execute([$parentId]);
                    $r = $stmt->fetch(\PDO::FETCH_ASSOC);
                    if ($r) {
                        $question = (string) $r['message'];
                        $chk = $pdo->prepare('SELECT id FROM ai___training WHERE question=? LIMIT 1');
                        $chk->execute([$question]);
                        if (!$chk->fetch()) {
                            $ins = $pdo->prepare(
                                "INSERT INTO ai___training (question, answer, category, admin) VALUES (?, ?, 'Lainnya', ?)"
                            );
                            $user = $request->getAttribute('user');
                            $ins->execute([$question, $feedback, $this->adminLabel(is_array($user) ? $user : null)]);
                        }
                    }
                }
            }

            return $this->json($response, ['success' => true], 200);
        } catch (\Throwable $e) {
            error_log('AiTrainingAdminController::feedbackMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan feedback'], 500);
        }
    }
}
