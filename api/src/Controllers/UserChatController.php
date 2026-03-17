<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Chat antar user. Hanya pakai tabel users (from/to FK ke users.id).
 * List chat: semua yang from_user_id = saya atau to_user_id = saya.
 * Pesan keluar = from_user_id = users yang login; pesan masuk = to_user_id = users yang login (tampil kiri).
 * Nama/lawan dari users.username. Tabel pengurus tidak dipakai.
 */
class UserChatController
{
    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus($status);
    }

    /** Token bisa berisi users.id atau pengurus.id; kembalikan users.id (untuk siapa yang login). */
    private function tokenToUserId(\PDO $db, int $id): ?int
    {
        if ($id < 1) {
            return null;
        }
        $stmt = $db->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        if ($stmt->fetch()) {
            return $id;
        }
        $stmt = $db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row && !empty($row['id_user']) ? (int) $row['id_user'] : null;
    }

    /** Cek id ada di users (untuk from/to di body). Tidak pakai pengurus. */
    private function userIdExists(\PDO $db, int $id): bool
    {
        if ($id < 1) {
            return false;
        }
        $stmt = $db->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        return (bool) $stmt->fetch();
    }

    /**
     * GET /api/chat/me
     * Return users.id yang login (untuk daftar socket/presence agar receive_message sampai).
     */
    public function getMe(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $tokenId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($tokenId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->tokenToUserId($db, $tokenId);
            if ($myUserId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }
            return $this->json($response, ['success' => true, 'my_user_id' => $myUserId]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getMe ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/conversations
     * Load semua chat yang from_user_id = saya ATAU to_user_id = saya. Semua dari tabel users.
     */
    public function getConversations(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $tokenId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($tokenId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->tokenToUserId($db, $tokenId);
            if ($myUserId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }
            $stmt = $db->prepare("
                SELECT id, from_user_id, to_user_id, message, created_at
                FROM chat
                WHERE from_user_id = ? OR to_user_id = ?
                ORDER BY created_at DESC
            ");
            $stmt->execute([$myUserId, $myUserId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $byPeer = [];
            foreach ($rows as $r) {
                $peer = (int) $r['from_user_id'] === $myUserId ? (int) $r['to_user_id'] : (int) $r['from_user_id'];
                if ($peer === $myUserId) {
                    continue;
                }
                if (!isset($byPeer[$peer])) {
                    $byPeer[$peer] = [
                        'peer_id' => $peer,
                        'last_message' => $r['message'],
                        'last_at' => $r['created_at'],
                    ];
                }
            }
            $peerIds = array_keys($byPeer);
            if (empty($peerIds)) {
                return $this->json($response, ['success' => true, 'data' => [], 'my_user_id' => $myUserId]);
            }
            $placeholders = implode(',', array_fill(0, count($peerIds), '?'));
            $stmtName = $db->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
            $stmtName->execute(array_values($peerIds));
            while ($row = $stmtName->fetch(\PDO::FETCH_ASSOC)) {
                $id = (int) $row['id'];
                if (isset($byPeer[$id])) {
                    $byPeer[$id]['peer_name'] = trim((string) ($row['username'] ?? '')) !== '' ? trim($row['username']) : 'User ' . $id;
                }
            }
            $list = array_values($byPeer);
            foreach ($list as &$item) {
                if (empty($item['peer_name'])) {
                    $item['peer_name'] = 'User ' . $item['peer_id'];
                }
            }
            return $this->json($response, ['success' => true, 'data' => $list, 'my_user_id' => $myUserId]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getConversations ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/users — daftar user (users) untuk "tambah chat baru". Hanya tabel users.
     */
    public function getChatUsers(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $tokenId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($tokenId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->tokenToUserId($db, $tokenId);
            if ($myUserId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }
            $stmt = $db->prepare("
                SELECT id, username
                FROM users
                WHERE (is_active IS NULL OR is_active = 1) AND id != ?
                ORDER BY username ASC, id ASC
            ");
            $stmt->execute([$myUserId]);
            $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($list as &$row) {
                $row['nama'] = trim((string) ($row['username'] ?? '')) !== '' ? trim($row['username']) : 'User ' . ($row['id'] ?? '');
            }
            unset($row);
            return $this->json($response, ['success' => true, 'data' => $list]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getChatUsers ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/messages — riwayat dengan satu peer. peer_id = users.id.
     * is_own = (from_user_id = users yang login) = pesan keluar.
     */
    public function getMessages(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $tokenId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($tokenId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        $peerId = (int) ($request->getQueryParams()['peer_id'] ?? 0);
        if ($peerId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'peer_id wajib'], 400);
        }
        $limit = (int) ($request->getQueryParams()['limit'] ?? 20);
        $limit = min(max(1, $limit), 100);

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->tokenToUserId($db, $tokenId);
            if ($myUserId === null || !$this->userIdExists($db, $peerId)) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 400);
            }
            $stmt = $db->prepare("
                SELECT id, from_user_id, to_user_id, message, created_at
                FROM chat
                WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
                ORDER BY created_at DESC
                LIMIT " . (int) $limit
            );
            $stmt->execute([$myUserId, $peerId, $peerId, $myUserId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $stmtName = $db->prepare("SELECT username FROM users WHERE id = ? LIMIT 1");
            $stmtName->execute([$peerId]);
            $peerRow = $stmtName->fetch(\PDO::FETCH_ASSOC);
            $peerDisplayName = ($peerRow && trim((string) ($peerRow['username'] ?? '')) !== '') ? trim($peerRow['username']) : 'User ' . $peerId;

            $list = [];
            foreach (array_reverse($rows) as $r) {
                $from = (int) $r['from_user_id'];
                $list[] = [
                    'id' => (int) $r['id'],
                    'from_user_id' => $from,
                    'to_user_id' => (int) $r['to_user_id'],
                    'message' => $r['message'],
                    'created_at' => $r['created_at'],
                    'is_own' => $from === $myUserId,
                ];
            }
            return $this->json($response, [
                'success' => true,
                'data' => $list,
                'my_user_id' => $myUserId,
                'peer_user_id' => $peerId,
                'peer_display_name' => $peerDisplayName,
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getMessages ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * POST /api/live/chat/message — from_user_id dan to_user_id harus users.id (ada di tabel users).
     */
    public function saveMessage(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('LIVE_SERVER_API_KEY') ?: ($config['live_server']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $fromId = isset($body['from_user_id']) ? (int) $body['from_user_id'] : 0;
        $toId = isset($body['to_user_id']) ? (int) $body['to_user_id'] : 0;
        $message = isset($body['message']) ? trim((string) $body['message']) : '';

        if ($fromId < 1 || $toId < 1) {
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'from_user_id dan to_user_id wajib (integer positif)',
            ], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        if ($message === '') {
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'message wajib',
            ], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        try {
            $db = Database::getInstance()->getConnection();
            if (!$this->userIdExists($db, $fromId) || !$this->userIdExists($db, $toId)) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'from_user_id atau to_user_id tidak ada di tabel users.',
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
            if ($fromId === $toId) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Pengirim dan penerima tidak boleh sama.',
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
            $stmt = $db->prepare("INSERT INTO chat (from_user_id, to_user_id, message) VALUES (?, ?, ?)");
            $stmt->execute([$fromId, $toId, $message]);
            $id = (int) $db->lastInsertId();
            $stmtCreated = $db->prepare("SELECT created_at FROM chat WHERE id = ?");
            $stmtCreated->execute([$id]);
            $row = $stmtCreated->fetch(\PDO::FETCH_ASSOC);
            $createdAt = $row ? ($row['created_at'] ?? date('Y-m-d H:i:s')) : date('Y-m-d H:i:s');

            $response->getBody()->write(json_encode([
                'success' => true,
                'id' => $id,
                'created_at' => $createdAt,
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        } catch (\Throwable $e) {
            error_log('UserChatController::saveMessage ' . $e->getMessage());
            $code = $e->getCode();
            $msg = $e->getMessage();
            if ($code === '23000' || strpos($msg, 'foreign key constraint') !== false || strpos($msg, 'Integrity constraint violation') !== false) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'from_user_id atau to_user_id tidak valid (harus users.id).',
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Server error',
            ], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
    }
}
