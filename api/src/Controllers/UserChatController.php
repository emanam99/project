<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Utils\PushNotificationService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Chat antar users. Semua data chat pakai users.id (tidak ada kaitan dengan tabel pengurus).
 * - Load kontak (getChatUsers): murni SELECT dari users. Id = users.id.
 * - List conversation & pesan: conversation_id, sender_id, peer = users.id.
 * - Simpan pesan: from_user_id / to_user_id / sender_id = users.id (resolveToUsersId jika client kirim id pengurus).
 * Satu-satunya pakai pengurus: tokenToUserId (token bisa berisi id pengurus → resolve ke users.id) dan resolveToUsersId saat simpan.
 */
class UserChatController
{
    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus($status);
    }

    /**
     * Resolve token id ke users.id. Token bisa berisi pengurus.id (user_id) atau users.id.
     * Prioritas: cek pengurus dulu (agar pengurus id 1 → users id 3), baru users.
     * Kalau cek users dulu, id 1 bisa salah dianggap users.id 1 padahal itu pengurus.id 1.
     */
    private function tokenToUserId(\PDO $db, int $id): ?int
    {
        if ($id < 1) {
            return null;
        }
        $stmt = $db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row && !empty($row['id_user'])) {
            return (int) $row['id_user'];
        }
        $stmt = $db->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        return $stmt->fetch() ? $id : null;
    }

    /** Format tampilan: "nama @username" (nama dari pengurus, username dari users). */
    private function formatNamaUsername(?string $namaPengurus, ?string $username, int $userId): string
    {
        $nama = trim((string) ($namaPengurus ?? ''));
        $un = trim((string) ($username ?? ''));
        if ($un === '') {
            $un = 'User ' . $userId;
        }
        if ($nama !== '') {
            return $nama . ' @' . $un;
        }
        return $un;
    }

    /** Ambil users.id dari token: utamakan users_id, fallback tokenToUserId(user_id). */
    private function getMyUserIdFromPayload(\PDO $db, array $payload): ?int
    {
        $usersId = isset($payload['users_id']) ? (int) $payload['users_id'] : 0;
        if ($usersId > 0) {
            return $usersId;
        }
        $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        return $userId > 0 ? $this->tokenToUserId($db, $userId) : null;
    }

    private function userIdExists(\PDO $db, int $id): bool
    {
        if ($id < 1) {
            return false;
        }
        $stmt = $db->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        return (bool) $stmt->fetch();
    }

    /** Pastikan id yang dipakai untuk chat selalu users.id. Jika kirim id pengurus, resolve ke users.id. */
    private function resolveToUsersId(\PDO $db, int $id): ?int
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

    /**
     * Kirim Web Push ke penerima chat (jika punya subscription aktif).
     */
    private function sendPushForIncomingMessage(
        \PDO $db,
        int $fromUsersId,
        int $toUsersId,
        string $message,
        int $conversationId
    ): void {
        if ($fromUsersId < 1 || $toUsersId < 1 || $fromUsersId === $toUsersId) {
            return;
        }

        try {
            $stmtSender = $db->prepare("
                SELECT u.username, p.nama AS nama_pengurus
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE u.id = ?
                LIMIT 1
            ");
            $stmtSender->execute([$fromUsersId]);
            $sender = $stmtSender->fetch(\PDO::FETCH_ASSOC) ?: [];
            $senderName = $this->formatNamaUsername(
                isset($sender['nama_pengurus']) ? (string) $sender['nama_pengurus'] : null,
                isset($sender['username']) ? (string) $sender['username'] : '',
                $fromUsersId
            );

            $preview = mb_substr(trim($message), 0, 120);
            if ($preview === '') {
                $preview = '(pesan baru)';
            }

            $push = new PushNotificationService();
            $push->sendToUserIds(
                [$toUsersId],
                'Pesan baru',
                $preview,
                [
                    'tag' => 'chat-message-' . $conversationId,
                    'url' => '/chat?u=' . $fromUsersId,
                    'data' => [
                        'type' => 'chat_message',
                        'conversation_id' => $conversationId,
                        'from_user_id' => $fromUsersId,
                        'to_user_id' => $toUsersId,
                    ],
                    'requireInteraction' => false,
                    'sender_name' => $senderName,
                ]
            );
        } catch (\Throwable $e) {
            error_log('UserChatController::sendPushForIncomingMessage ' . $e->getMessage());
        }
    }

    /**
     * Jalankan push setelah respons HTTP ke server Live selesai (register_shutdown_function).
     */
    public function runDeferredChatPush(int $fromUsersId, int $toUsersId, string $message, int $conversationId): void
    {
        $db = Database::getInstance()->getConnection();
        $this->sendPushForIncomingMessage($db, $fromUsersId, $toUsersId, $message, $conversationId);
    }

    /** Ambil atau buat conversation private antara dua user. Boleh user1 === user2 (chat ke diri sendiri). */
    private function getOrCreatePrivateConversation(\PDO $db, int $user1, int $user2): ?int
    {
        if ($user1 === $user2) {
            return $this->getOrCreateSelfConversation($db, $user1);
        }
        $u1 = min($user1, $user2);
        $u2 = max($user1, $user2);
        $stmt = $db->prepare("
            SELECT c.id FROM chat___conversation c
            INNER JOIN chat___member m1 ON m1.conversation_id = c.id AND m1.user_id = ?
            INNER JOIN chat___member m2 ON m2.conversation_id = c.id AND m2.user_id = ?
            WHERE c.type = 'private' LIMIT 1
        ");
        $stmt->execute([$u1, $u2]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }
        $db->exec("INSERT INTO chat___conversation (type, created_at) VALUES ('private', NOW())");
        $convId = (int) $db->lastInsertId();
        $ins = $db->prepare("INSERT INTO chat___member (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())");
        $ins->execute([$convId, $u1]);
        $ins->execute([$convId, $u2]);
        return $convId;
    }

    /** Conversation "chat ke diri sendiri" (satu member). */
    private function getOrCreateSelfConversation(\PDO $db, int $userId): ?int
    {
        $stmt = $db->prepare("
            SELECT c.id FROM chat___conversation c
            INNER JOIN chat___member m ON m.conversation_id = c.id
            WHERE c.type = 'private'
            GROUP BY c.id
            HAVING COUNT(*) = 1 AND MAX(m.user_id) = ?
            LIMIT 1
        ");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }
        $db->exec("INSERT INTO chat___conversation (type, created_at) VALUES ('private', NOW())");
        $convId = (int) $db->lastInsertId();
        $db->prepare("INSERT INTO chat___member (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())")->execute([$convId, $userId]);
        return $convId;
    }

    public function getMe(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $tokenUserId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        $tokenUsersId = isset($payload['users_id']) ? (int) $payload['users_id'] : 0;
        if ($tokenUserId < 1 && $tokenUsersId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $tokenUsersId > 0 ? $tokenUsersId : $this->tokenToUserId($db, $tokenUserId);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }
            $stmt = $db->prepare("SELECT u.username, p.nama AS nama_pengurus FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");
            $stmt->execute([$myUserId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $username = $row && trim((string) ($row['username'] ?? '')) !== '' ? trim($row['username']) : 'User ' . $myUserId;
            $nama = $row && trim((string) ($row['nama_pengurus'] ?? '')) !== '' ? trim($row['nama_pengurus']) : null;
            $display_name = $this->formatNamaUsername($nama, $username, $myUserId);
            return $this->json($response, ['success' => true, 'my_user_id' => $myUserId, 'username' => $username, 'nama' => $nama, 'display_name' => $display_name]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getMe ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/conversations
     * Daftar conversation yang saya ikuti (dari chat___member). Termasuk last message, peer (private), unread count.
     */
    public function getConversations(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }

            $stmt = $db->prepare("
                SELECT m.conversation_id, c.type, c.name
                FROM chat___member m
                INNER JOIN chat___conversation c ON c.id = m.conversation_id
                WHERE m.user_id = ?
                ORDER BY m.conversation_id
            ");
            $stmt->execute([$myUserId]);
            $convs = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $list = [];
            $stmtLast = $db->prepare("
                SELECT id, sender_id, message, tanggal_dibuat
                FROM chat
                WHERE conversation_id = ?
                ORDER BY tanggal_dibuat DESC
                LIMIT 1
            ");
            $stmtPeer = $db->prepare("
                SELECT user_id FROM chat___member
                WHERE conversation_id = ? AND user_id != ?
                LIMIT 1
            ");
            $stmtUnread = $db->prepare("
                SELECT COUNT(*) AS cnt FROM chat ch
                INNER JOIN chat___member m ON m.conversation_id = ch.conversation_id AND m.user_id = ?
                WHERE ch.conversation_id = ? AND ch.sender_id != ?
                AND (m.last_read_at IS NULL OR ch.tanggal_dibuat > m.last_read_at)
            ");
            $stmtPeerName = $db->prepare("SELECT u.id, u.username, p.nama AS nama_pengurus FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");

            foreach ($convs as $conv) {
                $convId = (int) $conv['conversation_id'];
                $stmtLast->execute([$convId]);
                $last = $stmtLast->fetch(\PDO::FETCH_ASSOC);
                $peerId = null;
                $peerName = $conv['name']; // grup
                $isSelf = false;
                if ($conv['type'] === 'private') {
                    $stmtPeer->execute([$convId, $myUserId]);
                    $peerRow = $stmtPeer->fetch(\PDO::FETCH_ASSOC);
                    $peerId = $peerRow ? (int) $peerRow['user_id'] : null;
                    if ($peerId) {
                        $stmtPeerName->execute([$peerId]);
                        $un = $stmtPeerName->fetch(\PDO::FETCH_ASSOC);
                        $namaP = $un && trim((string) ($un['nama_pengurus'] ?? '')) !== '' ? trim($un['nama_pengurus']) : null;
                        $usernameP = $un && trim((string) ($un['username'] ?? '')) !== '' ? trim($un['username']) : '';
                        $peerName = $this->formatNamaUsername($namaP, $usernameP, $peerId);
                    } else {
                        // Chat ke diri sendiri (satu member): tampilkan nama saya
                        $peerId = $myUserId;
                        $isSelf = true;
                        $stmtPeerName->execute([$myUserId]);
                        $un = $stmtPeerName->fetch(\PDO::FETCH_ASSOC);
                        $namaP = $un && trim((string) ($un['nama_pengurus'] ?? '')) !== '' ? trim($un['nama_pengurus']) : null;
                        $usernameP = $un && trim((string) ($un['username'] ?? '')) !== '' ? trim($un['username']) : '';
                        $peerName = $this->formatNamaUsername($namaP, $usernameP, $myUserId);
                    }
                }
                $unread = 0;
                $stmtUnread->execute([$myUserId, $convId, $myUserId]);
                $ur = $stmtUnread->fetch(\PDO::FETCH_ASSOC);
                if ($ur && isset($ur['cnt'])) {
                    $unread = (int) $ur['cnt'];
                }

                $list[] = [
                    'conversation_id' => $convId,
                    'type' => $conv['type'],
                    'name' => $peerName,
                    'peer_id' => $peerId,
                    'peer_name' => $peerName,
                    'is_self' => $isSelf,
                    'last_message' => $last ? $last['message'] : null,
                    'last_at' => $last ? $last['tanggal_dibuat'] : null,
                    'unread_count' => $unread,
                ];
            }

            // Urutkan by last_at desc
            usort($list, function ($a, $b) {
                $ta = $a['last_at'] ? strtotime($a['last_at']) : 0;
                $tb = $b['last_at'] ? strtotime($b['last_at']) : 0;
                return $tb <=> $ta;
            });

            return $this->json($response, ['success' => true, 'data' => $list, 'my_user_id' => $myUserId]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getConversations ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/users — Load kontak yang bisa diajak chat.
     * Murni dari tabel users saja (tidak ada pengurus). Semua id = users.id.
     * Dipakai untuk "Pilih kontak" / chat baru; kirim pesan pakai users.id ini.
     */
    public function getChatUsers(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }
            $stmt = $db->prepare("
                SELECT u.id, u.username, u.last_seen_at, p.nama AS nama_pengurus
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE (u.is_active IS NULL OR u.is_active = 1)
                ORDER BY u.username ASC, u.id ASC
            ");
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = [];
            foreach ($rows as $row) {
                $id = (int) $row['id'];
                $username = trim((string) ($row['username'] ?? ''));
                $namaPengurus = isset($row['nama_pengurus']) && trim((string) $row['nama_pengurus']) !== '' ? trim($row['nama_pengurus']) : null;
                $list[] = [
                    'id' => $id,
                    'username' => $username,
                    'nama' => $namaPengurus,
                    'display_name' => $this->formatNamaUsername($namaPengurus, $username, $id),
                    'last_seen_at' => isset($row['last_seen_at']) && $row['last_seen_at'] !== null ? $row['last_seen_at'] : null,
                ];
            }
            return $this->json($response, ['success' => true, 'data' => $list]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getChatUsers ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/chat/messages
     * Query: conversation_id ATAU peer_id (untuk private: get-or-create conversation).
     * Update last_read_at member saat load. Return pesan dengan is_own = (sender_id = saya).
     */
    public function getMessages(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $params = $request->getQueryParams();
        $conversationId = isset($params['conversation_id']) ? (int) $params['conversation_id'] : 0;
        $peerId = isset($params['peer_id']) ? (int) $params['peer_id'] : 0;
        $limit = (int) ($params['limit'] ?? 20);
        $limit = min(max(1, $limit), 100);

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            if ($conversationId < 1 && $peerId > 0) {
                $conversationId = $this->getOrCreatePrivateConversation($db, $myUserId, $peerId);
                if ($conversationId === null) {
                    return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 400);
                }
            }
            if ($conversationId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'conversation_id atau peer_id wajib'], 400);
            }

            // Cek saya member
            $stmtMem = $db->prepare("SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtMem->execute([$conversationId, $myUserId]);
            if (!$stmtMem->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota conversation'], 403);
            }

            // Update last_read_at
            $db->prepare("UPDATE chat___member SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?")->execute([$conversationId, $myUserId]);

            $stmt = $db->prepare("
                SELECT id, conversation_id, sender_id, message, tanggal_dibuat
                FROM chat
                WHERE conversation_id = ?
                ORDER BY tanggal_dibuat DESC
                LIMIT " . $limit
            );
            $stmt->execute([$conversationId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Peer display name (private = satu user lain; group = nama conversation)
            $peerDisplayName = '';
            $peerUserId = null;
            $stmtConv = $db->prepare("SELECT type, name FROM chat___conversation WHERE id = ? LIMIT 1");
            $stmtConv->execute([$conversationId]);
            $convRow = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if ($convRow && $convRow['type'] === 'private') {
                $stmtOther = $db->prepare("SELECT user_id FROM chat___member WHERE conversation_id = ? AND user_id != ? LIMIT 1");
                $stmtOther->execute([$conversationId, $myUserId]);
                $other = $stmtOther->fetch(\PDO::FETCH_ASSOC);
                if ($other) {
                    $peerUserId = (int) $other['user_id'];
                    $stmtU = $db->prepare("SELECT u.username, p.nama AS nama_pengurus FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");
                    $stmtU->execute([$peerUserId]);
                    $uRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
                    $namaP = $uRow && trim((string) ($uRow['nama_pengurus'] ?? '')) !== '' ? trim($uRow['nama_pengurus']) : null;
                    $usernameP = $uRow && trim((string) ($uRow['username'] ?? '')) !== '' ? trim($uRow['username']) : '';
                    $peerDisplayName = $this->formatNamaUsername($namaP, $usernameP, $peerUserId);
                } else {
                    $peerUserId = $myUserId;
                    $stmtU = $db->prepare("SELECT u.username, p.nama AS nama_pengurus FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");
                    $stmtU->execute([$myUserId]);
                    $uRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
                    $namaP = $uRow && trim((string) ($uRow['nama_pengurus'] ?? '')) !== '' ? trim($uRow['nama_pengurus']) : null;
                    $usernameP = $uRow && trim((string) ($uRow['username'] ?? '')) !== '' ? trim($uRow['username']) : '';
                    $peerDisplayName = $this->formatNamaUsername($namaP, $usernameP, $myUserId);
                }
            } else {
                $peerDisplayName = $convRow && trim((string) ($convRow['name'] ?? '')) !== '' ? trim($convRow['name']) : 'Grup';
            }

            $list = [];
            foreach (array_reverse($rows) as $r) {
                $senderId = (int) $r['sender_id'];
                $list[] = [
                    'id' => (int) $r['id'],
                    'conversation_id' => (int) $r['conversation_id'],
                    'sender_id' => $senderId,
                    'message' => $r['message'],
                    'tanggal_dibuat' => $r['tanggal_dibuat'],
                    'created_at' => $r['tanggal_dibuat'],
                    'is_own' => $senderId === $myUserId,
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => $list,
                'my_user_id' => $myUserId,
                'conversation_id' => $conversationId,
                'peer_user_id' => $peerUserId,
                'peer_display_name' => $peerDisplayName,
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getMessages ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * POST /api/live/chat/message
     * Body: conversation_id + sender_id, ATAU from_user_id + to_user_id (private, get-or-create conv).
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
        $conversationId = isset($body['conversation_id']) ? (int) $body['conversation_id'] : 0;
        $senderId = isset($body['sender_id']) ? (int) $body['sender_id'] : 0;
        $fromId = isset($body['from_user_id']) ? (int) $body['from_user_id'] : 0;
        $toId = isset($body['to_user_id']) ? (int) $body['to_user_id'] : 0;
        $message = isset($body['message']) ? trim((string) $body['message']) : '';

        if ($message === '') {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'message wajib'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        try {
            $db = Database::getInstance()->getConnection();

            if ($conversationId > 0 && $senderId > 0) {
                $senderId = $this->resolveToUsersId($db, $senderId);
                if ($senderId === null) {
                    $response->getBody()->write(json_encode(['success' => false, 'message' => 'sender_id tidak valid (harus users.id)'], JSON_UNESCAPED_UNICODE));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
                }
                $stmt = $db->prepare("SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmt->execute([$conversationId, $senderId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['success' => false, 'message' => 'Bukan anggota conversation'], JSON_UNESCAPED_UNICODE));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
                }
            } elseif ($fromId > 0 && $toId > 0) {
                $fromIdResolved = $this->resolveToUsersId($db, $fromId);
                $toIdResolved = $this->resolveToUsersId($db, $toId);
                if ($fromIdResolved === null || $toIdResolved === null) {
                    $response->getBody()->write(json_encode(['success' => false, 'message' => 'from_user_id atau to_user_id tidak valid (harus users.id atau id pengurus yang terhubung users)'], JSON_UNESCAPED_UNICODE));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
                }
                $conversationId = $this->getOrCreatePrivateConversation($db, $fromIdResolved, $toIdResolved);
                $senderId = $fromIdResolved;
            } else {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Berikan conversation_id + sender_id, atau from_user_id + to_user_id',
                ], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
            }

            $stmt = $db->prepare("INSERT INTO chat (conversation_id, sender_id, message, tanggal_dibuat) VALUES (?, ?, ?, NOW())");
            $stmt->execute([$conversationId, $senderId, $message]);
            $id = (int) $db->lastInsertId();
            $db->prepare("UPDATE chat___conversation SET updated_at = NOW() WHERE id = ?")->execute([$conversationId]);
            $stmtDate = $db->prepare("SELECT tanggal_dibuat FROM chat WHERE id = ?");
            $stmtDate->execute([$id]);
            $row = $stmtDate->fetch(\PDO::FETCH_ASSOC);
            $tanggalDibuat = $row ? ($row['tanggal_dibuat'] ?? date('Y-m-d H:i:s')) : date('Y-m-d H:i:s');

            // Trigger PWA push untuk penerima (tetap bekerja saat app tidak dibuka).
            $recipientId = 0;
            if (isset($toIdResolved) && (int) $toIdResolved > 0) {
                $recipientId = (int) $toIdResolved;
            } elseif ($toId > 0) {
                $resolvedTo = $this->resolveToUsersId($db, $toId);
                if ($resolvedTo !== null) {
                    $recipientId = (int) $resolvedTo;
                }
            }
            // Web Push jangan blokir respons ke server Live (Socket.IO). Tanpa ini, setiap pesan menunggu
            // HTTP ke FCM/Web Push selesai dulu → chat terasa lambat.
            if ($recipientId > 0) {
                $sf = (int) $senderId;
                $rf = (int) $recipientId;
                $mf = $message;
                $cf = (int) $conversationId;
                register_shutdown_function(static function () use ($sf, $rf, $mf, $cf) {
                    try {
                        (new self())->runDeferredChatPush($sf, $rf, $mf, $cf);
                    } catch (\Throwable $e) {
                        error_log('UserChatController::deferredChatPush ' . $e->getMessage());
                    }
                });
            }

            $response->getBody()->write(json_encode([
                'success' => true,
                'id' => $id,
                'conversation_id' => $conversationId,
                'sender_id' => $senderId,
                'created_at' => $tanggalDibuat,
                'tanggal_dibuat' => $tanggalDibuat,
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        } catch (\Throwable $e) {
            error_log('UserChatController::saveMessage ' . $e->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Server error'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
    }

    /**
     * POST /api/live/presence — Update last_seen_at user (dipanggil live server saat connect_user).
     * Body: { user_id }. Header: X-API-Key = LIVE_SERVER_API_KEY.
     */
    public function updatePresence(Request $request, Response $response): Response
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
        $userId = isset($body['user_id']) ? (int) $body['user_id'] : 0;
        if ($userId < 1) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'user_id wajib'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        try {
            $db = Database::getInstance()->getConnection();
            $usersId = $this->resolveToUsersId($db, $userId);
            if ($usersId === null) {
                $response->getBody()->write(json_encode(['success' => false, 'message' => 'user_id tidak valid'], JSON_UNESCAPED_UNICODE));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
            $stmt = $db->prepare("UPDATE users SET last_seen_at = NOW() WHERE id = ?");
            $stmt->execute([$usersId]);
            $response->getBody()->write(json_encode(['success' => true], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        } catch (\Throwable $e) {
            error_log('UserChatController::updatePresence ' . $e->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Server error'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
    }
}
