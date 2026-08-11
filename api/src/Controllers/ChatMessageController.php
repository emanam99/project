<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveChatBroadcastHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ChatMessageController
{
    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus($status);
    }

    private function tokenToUserId(\PDO $db, int $id): ?int
    {
        if ($id < 1) {
            return null;
        }
        $stmt = $db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row && !empty($row['id_user'])) {
            return (int) $row['id_user'];
        }
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);

        return $stmt->fetch() ? $id : null;
    }

    private function getMyUserIdFromPayload(\PDO $db, array $payload): ?int
    {
        $usersId = isset($payload['users_id']) ? (int) $payload['users_id'] : 0;
        if ($usersId > 0) {
            return $usersId;
        }
        $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;

        return $userId > 0 ? $this->tokenToUserId($db, $userId) : null;
    }

    private function tableHasColumn(\PDO $db, string $table, string $column): bool
    {
        try {
            $stmt = $db->prepare('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '` LIKE ?');
            $stmt->execute([$column]);

            return (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** PUT /api/chat/messages/{id} */
    public function editMessage(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $messageId = isset($args['id']) ? (int) $args['id'] : 0;
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $newText = trim((string) ($body['message'] ?? ''));
        if ($messageId < 1 || $newText === '') {
            return $this->json($response, ['success' => false, 'message' => 'Pesan tidak valid'], 400);
        }

        $config = require __DIR__ . '/../../config.php';
        $editWindowMin = (int) ($config['chat']['edit_window_minutes'] ?? 15);

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if (!$this->tableHasColumn($db, 'chat', 'edited_at')) {
                return $this->json($response, ['success' => false, 'message' => 'Edit pesan belum didukung'], 400);
            }

            $stmt = $db->prepare('SELECT id, conversation_id, sender_id, message, tanggal_dibuat, deleted_at FROM chat WHERE id = ? LIMIT 1');
            $stmt->execute([$messageId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            if ((int) $row['sender_id'] !== $myUserId) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan pesan Anda'], 403);
            }
            if ($this->tableHasColumn($db, 'chat', 'deleted_at') && !empty($row['deleted_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan sudah dihapus'], 400);
            }

            $created = strtotime((string) $row['tanggal_dibuat']) ?: 0;
            if ((time() - $created) > $editWindowMin * 60) {
                return $this->json($response, ['success' => false, 'message' => 'Batas waktu edit habis'], 400);
            }

            $stmtMem = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmtMem->execute([(int) $row['conversation_id'], $myUserId]);
            if (!$stmtMem->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota percakapan'], 403);
            }

            $upd = $db->prepare('UPDATE chat SET message = ?, edited_at = NOW() WHERE id = ? LIMIT 1');
            $upd->execute([$newText, $messageId]);

            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([(int) $row['conversation_id']]);
            $uids = array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []);
            LiveChatBroadcastHelper::emit('message_updated', $uids, [
                'id' => $messageId,
                'conversation_id' => (int) $row['conversation_id'],
                'message' => $newText,
                'edited_at' => date('Y-m-d H:i:s'),
            ]);

            return $this->json($response, [
                'success' => true,
                'id' => $messageId,
                'message' => $newText,
                'edited_at' => date('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $e) {
            error_log('ChatMessageController::editMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** DELETE /api/chat/messages/{id} */
    public function deleteMessage(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $messageId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($messageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        $config = require __DIR__ . '/../../config.php';
        $deleteWindowMin = (int) ($config['chat']['delete_window_minutes'] ?? 60);

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if (!$this->tableHasColumn($db, 'chat', 'deleted_at')) {
                return $this->json($response, ['success' => false, 'message' => 'Hapus pesan belum didukung'], 400);
            }

            $stmt = $db->prepare('SELECT id, conversation_id, sender_id, tanggal_dibuat, deleted_at FROM chat WHERE id = ? LIMIT 1');
            $stmt->execute([$messageId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            if ((int) $row['sender_id'] !== $myUserId) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan pesan Anda'], 403);
            }
            if (!empty($row['deleted_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan sudah dihapus'], 400);
            }

            $created = strtotime((string) $row['tanggal_dibuat']) ?: 0;
            if ((time() - $created) > $deleteWindowMin * 60) {
                return $this->json($response, ['success' => false, 'message' => 'Batas waktu hapus habis'], 400);
            }

            $stmtMem = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmtMem->execute([(int) $row['conversation_id'], $myUserId]);
            if (!$stmtMem->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota percakapan'], 403);
            }

            $db->prepare('UPDATE chat SET deleted_at = NOW(), message = ? WHERE id = ? LIMIT 1')->execute(['', $messageId]);

            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([(int) $row['conversation_id']]);
            $uids = array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []);
            LiveChatBroadcastHelper::emit('message_deleted', $uids, [
                'id' => $messageId,
                'conversation_id' => (int) $row['conversation_id'],
                'deleted_at' => date('Y-m-d H:i:s'),
            ]);

            return $this->json($response, ['success' => true, 'message' => 'Pesan dihapus']);
        } catch (\Throwable $e) {
            error_log('ChatMessageController::deleteMessage ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }
}
