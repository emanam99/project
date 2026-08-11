<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveChatBroadcastHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ChatPinnedController
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

    private function hasMemberIsAdminColumn(\PDO $db): bool
    {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM `chat___member` LIKE 'is_admin'");
            return (bool) ($stmt && $stmt->fetch(\PDO::FETCH_ASSOC));
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function canPin(\PDO $db, int $conversationId, int $myUserId, string $type): bool
    {
        if ($type === 'private') {
            return true;
        }
        if (!$this->hasMemberIsAdminColumn($db)) {
            return true;
        }
        $stmt = $db->prepare('SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$conversationId, $myUserId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row && ((int) ($row['is_admin'] ?? 0) === 1);
    }

    /** GET /api/chat/conversations/{id}/pins */
    public function listPins(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $stmt = $db->prepare('
                SELECT c.type FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ? LIMIT 1
            ');
            $stmt->execute([$myUserId, $conversationId]);
            $conv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            $stmt = $db->prepare('
                SELECT p.id, p.message_id, p.pinned_by, p.pinned_at, ch.message, ch.tanggal_dibuat
                FROM chat___pinned p
                INNER JOIN chat ch ON ch.id = p.message_id AND ch.conversation_id = ?
                WHERE p.conversation_id = ?
                ORDER BY p.pinned_at ASC
            ');
            $stmt->execute([$conversationId, $conversationId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $pins = [];
            foreach ($rows as $row) {
                $pins[] = [
                    'id' => (int) $row['id'],
                    'message_id' => (int) $row['message_id'],
                    'pinned_by' => (int) $row['pinned_by'],
                    'pinned_at' => $row['pinned_at'],
                    'message_preview' => mb_substr(trim((string) ($row['message'] ?? '')), 0, 120),
                    'tanggal_dibuat' => $row['tanggal_dibuat'],
                ];
            }

            return $this->json($response, ['success' => true, 'data' => $pins]);
        } catch (\Throwable $e) {
            error_log('ChatPinnedController::listPins ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** POST /api/chat/conversations/{id}/pins body: { message_id } */
    public function addPin(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $messageId = isset($body['message_id']) ? (int) $body['message_id'] : 0;
        if ($conversationId < 1 || $messageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
        }
        $config = require __DIR__ . '/../../config.php';
        $maxPins = (int) ($config['chat']['max_pins_per_conversation'] ?? 3);

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $stmt = $db->prepare('
                SELECT c.type FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ? LIMIT 1
            ');
            $stmt->execute([$myUserId, $conversationId]);
            $conv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            $type = (string) ($conv['type'] ?? '');
            if (!$this->canPin($db, $conversationId, $myUserId, $type)) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat menyematkan pesan'], 403);
            }
            $stmt = $db->prepare('SELECT id FROM chat WHERE id = ? AND conversation_id = ? LIMIT 1');
            $stmt->execute([$messageId, $conversationId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            $stmt = $db->prepare('SELECT COUNT(*) FROM chat___pinned WHERE conversation_id = ?');
            $stmt->execute([$conversationId]);
            $cnt = (int) $stmt->fetchColumn();
            if ($cnt >= $maxPins) {
                return $this->json($response, ['success' => false, 'message' => 'Jumlah sematan maksimum tercapai'], 400);
            }
            try {
                $ins = $db->prepare('INSERT INTO chat___pinned (conversation_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, NOW())');
                $ins->execute([$conversationId, $messageId, $myUserId]);
            } catch (\Throwable $e) {
                if (stripos($e->getMessage(), 'Duplicate') !== false) {
                    return $this->json($response, ['success' => false, 'message' => 'Pesan sudah disematkan'], 400);
                }
                throw $e;
            }

            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([$conversationId]);
            $uids = array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []);
            LiveChatBroadcastHelper::emit('chat_pinned_changed', $uids, [
                'conversation_id' => $conversationId,
                'action' => 'add',
                'message_id' => $messageId,
            ]);

            return $this->json($response, ['success' => true, 'message' => 'Disematkan']);
        } catch (\Throwable $e) {
            error_log('ChatPinnedController::addPin ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyematkan'], 500);
        }
    }

    /** DELETE /api/chat/conversations/{id}/pins/{messageId} */
    public function removePin(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $messageId = isset($args['messageId']) ? (int) $args['messageId'] : 0;
        if ($conversationId < 1 || $messageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $stmt = $db->prepare('SELECT c.type FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ? LIMIT 1');
            $stmt->execute([$myUserId, $conversationId]);
            $conv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (!$this->canPin($db, $conversationId, $myUserId, (string) ($conv['type'] ?? ''))) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat menghapus sematan'], 403);
            }
            $del = $db->prepare('DELETE FROM chat___pinned WHERE conversation_id = ? AND message_id = ? LIMIT 1');
            $del->execute([$conversationId, $messageId]);

            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([$conversationId]);
            $uids = array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []);
            LiveChatBroadcastHelper::emit('chat_pinned_changed', $uids, [
                'conversation_id' => $conversationId,
                'action' => 'remove',
                'message_id' => $messageId,
            ]);

            return $this->json($response, ['success' => true, 'message' => 'Sematan dihapus']);
        } catch (\Throwable $e) {
            error_log('ChatPinnedController::removePin ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }
}
