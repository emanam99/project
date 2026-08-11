<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveChatBroadcastHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ChatInviteController
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

    private function resolveToUsersId(\PDO $db, int $id): ?int
    {
        if ($id < 1) {
            return null;
        }
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        if ($stmt->fetch()) {
            return $id;
        }
        $stmt = $db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row && !empty($row['id_user']) ? (int) $row['id_user'] : null;
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

    private function generateUniqueCode(\PDO $db, int $length): string
    {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        $lenChars = strlen($chars);
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $code = '';
            $bytes = random_bytes(max(8, $length));
            for ($i = 0; $i < $length; $i++) {
                $code .= $chars[ord($bytes[$i % strlen($bytes)]) % $lenChars];
            }
            $stmt = $db->prepare('SELECT 1 FROM chat___invite WHERE code = ? LIMIT 1');
            $stmt->execute([$code]);
            if (!$stmt->fetch()) {
                return $code;
            }
        }
        throw new \RuntimeException('Gagal membuat kode undangan');
    }

    /** GET /api/chat/conversations/{id}/invites */
    public function listInvites(Request $request, Response $response, array $args): Response
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
            $stmt = $db->prepare('SELECT c.type FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ? LIMIT 1');
            $stmt->execute([$myUserId, $conversationId]);
            $conv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$conv || ($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Grup tidak ditemukan'], 404);
            }
            if ($this->hasMemberIsAdminColumn($db)) {
                $stmt = $db->prepare('SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
                $stmt->execute([$conversationId, $myUserId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row || (int) ($row['is_admin'] ?? 0) !== 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin'], 403);
                }
            }
            $stmt = $db->prepare('SELECT id, code, created_at, expires_at, revoked_at, max_uses, uses, created_by FROM chat___invite WHERE conversation_id = ? ORDER BY created_at DESC');
            $stmt->execute([$conversationId]);

            return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: []]);
        } catch (\Throwable $e) {
            error_log('ChatInviteController::listInvites ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** POST /api/chat/conversations/{id}/invites */
    public function createInvite(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $expiresAt = isset($body['expires_at']) ? trim((string) $body['expires_at']) : null;
        $maxUses = isset($body['max_uses']) ? (int) $body['max_uses'] : null;
        if ($maxUses !== null && $maxUses < 1) {
            $maxUses = null;
        }

        $config = require __DIR__ . '/../../config.php';
        $codeLen = (int) ($config['chat']['invite_code_length'] ?? 16);

        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
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
            if (!$conv || ($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Grup tidak ditemukan'], 404);
            }
            if ($this->hasMemberIsAdminColumn($db)) {
                $stmt = $db->prepare('SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
                $stmt->execute([$conversationId, $myUserId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row || (int) ($row['is_admin'] ?? 0) !== 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin'], 403);
                }
            }

            $code = $this->generateUniqueCode($db, $codeLen);
            $expSql = $expiresAt !== null && $expiresAt !== '' ? $expiresAt : null;
            $ins = $db->prepare('INSERT INTO chat___invite (conversation_id, code, created_by, created_at, expires_at, revoked_at, max_uses, uses) VALUES (?, ?, ?, NOW(), ?, NULL, ?, 0)');
            $ins->execute([$conversationId, $code, $myUserId, $expSql, $maxUses]);

            return $this->json($response, [
                'success' => true,
                'code' => $code,
                'expires_at' => $expSql,
                'max_uses' => $maxUses,
            ]);
        } catch (\Throwable $e) {
            error_log('ChatInviteController::createInvite ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat undangan'], 500);
        }
    }

    /** DELETE /api/chat/conversations/{id}/invites/{code} */
    public function revokeInvite(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $code = isset($args['code']) ? trim((string) $args['code']) : '';
        if ($conversationId < 1 || $code === '') {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if ($this->hasMemberIsAdminColumn($db)) {
                $stmt = $db->prepare('SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
                $stmt->execute([$conversationId, $myUserId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row || (int) ($row['is_admin'] ?? 0) !== 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin'], 403);
                }
            }
            $stmt = $db->prepare('UPDATE chat___invite SET revoked_at = NOW() WHERE conversation_id = ? AND code = ? AND revoked_at IS NULL LIMIT 1');
            $stmt->execute([$conversationId, $code]);

            return $this->json($response, ['success' => true, 'message' => 'Undangan dicabut']);
        } catch (\Throwable $e) {
            error_log('ChatInviteController::revokeInvite ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** GET /api/chat/invites/{code}/preview */
    public function previewInvite(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $code = isset($args['code']) ? trim((string) $args['code']) : '';
        if ($code === '') {
            return $this->json($response, ['success' => false, 'message' => 'Kode tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmt = $db->prepare('
                SELECT i.id, i.conversation_id, i.expires_at, i.revoked_at, i.max_uses, i.uses, c.type, c.name
                FROM chat___invite i
                INNER JOIN chat___conversation c ON c.id = i.conversation_id
                WHERE i.code = ? LIMIT 1
            ');
            $stmt->execute([$code]);
            $inv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$inv || ($inv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Undangan tidak ditemukan'], 404);
            }
            $revoked = !empty($inv['revoked_at']);
            $expired = false;
            if (!empty($inv['expires_at'])) {
                $expired = strtotime((string) $inv['expires_at']) < time();
            }
            $maxed = false;
            if (isset($inv['max_uses']) && $inv['max_uses'] !== null && (int) $inv['max_uses'] > 0) {
                $maxed = (int) $inv['uses'] >= (int) $inv['max_uses'];
            }
            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([(int) $inv['conversation_id'], $myUserId]);
            $alreadyMember = (bool) $stmt->fetch();
            $stmt = $db->prepare('SELECT COUNT(*) FROM chat___member WHERE conversation_id = ?');
            $stmt->execute([(int) $inv['conversation_id']]);
            $memberCount = (int) $stmt->fetchColumn();

            return $this->json($response, [
                'success' => true,
                'conversation_id' => (int) $inv['conversation_id'],
                'group_name' => trim((string) ($inv['name'] ?? '')) ?: 'Grup',
                'member_count' => $memberCount,
                'already_member' => $alreadyMember,
                'invite_valid' => !$revoked && !$expired && !$maxed,
                'revoked' => $revoked,
                'expired' => $expired,
                'max_uses_reached' => $maxed,
            ]);
        } catch (\Throwable $e) {
            error_log('ChatInviteController::previewInvite ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** POST /api/chat/invites/{code}/join */
    public function joinInvite(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $code = isset($args['code']) ? trim((string) $args['code']) : '';
        if ($code === '') {
            return $this->json($response, ['success' => false, 'message' => 'Kode tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmt = $db->prepare('
                SELECT i.id, i.conversation_id, i.expires_at, i.revoked_at, i.max_uses, i.uses
                FROM chat___invite i
                INNER JOIN chat___conversation c ON c.id = i.conversation_id AND c.type = \'group\'
                WHERE i.code = ? LIMIT 1
            ');
            $stmt->execute([$code]);
            $inv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$inv) {
                return $this->json($response, ['success' => false, 'message' => 'Undangan tidak ditemukan'], 404);
            }
            if (!empty($inv['revoked_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Undangan sudah dicabut'], 400);
            }
            if (!empty($inv['expires_at']) && strtotime((string) $inv['expires_at']) < time()) {
                return $this->json($response, ['success' => false, 'message' => 'Undangan kedaluwarsa'], 400);
            }
            if (isset($inv['max_uses']) && $inv['max_uses'] !== null && (int) $inv['max_uses'] > 0 && (int) $inv['uses'] >= (int) $inv['max_uses']) {
                return $this->json($response, ['success' => false, 'message' => 'Kuota undangan habis'], 400);
            }

            $convId = (int) $inv['conversation_id'];
            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$convId, $myUserId]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => true, 'conversation_id' => $convId, 'message' => 'Sudah menjadi anggota']);
            }

            $hasAdmin = $this->hasMemberIsAdminColumn($db);
            if ($hasAdmin) {
                $db->prepare('INSERT INTO chat___member (conversation_id, user_id, is_admin, joined_at) VALUES (?, ?, 0, NOW())')->execute([$convId, $myUserId]);
            } else {
                $db->prepare('INSERT INTO chat___member (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())')->execute([$convId, $myUserId]);
            }
            $db->prepare('UPDATE chat___invite SET uses = uses + 1 WHERE id = ?')->execute([(int) $inv['id']]);

            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([$convId]);
            $uids = array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []);
            LiveChatBroadcastHelper::emit('chat_invite_joined', $uids, [
                'conversation_id' => $convId,
                'user_id' => $myUserId,
            ]);

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $convId,
                'message' => 'Bergabung ke grup',
            ]);
        } catch (\Throwable $e) {
            error_log('ChatInviteController::joinInvite ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal bergabung'], 500);
        }
    }
}
