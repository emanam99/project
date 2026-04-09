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
    private string $uploadsBasePath = '';

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

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

    private function resolveUploadFilePath(string $pathFile): string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        return $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
    }

    private function getGroupUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'chat_groups';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function hasConversationGroupPhotoColumn(\PDO $db): bool
    {
        try {
            $row = $this->fetchOne($db, "SHOW COLUMNS FROM `chat___conversation` LIKE 'group_photo'");
            return (bool) $row;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function hasMemberIsAdminColumn(\PDO $db): bool
    {
        try {
            $row = $this->fetchOne($db, "SHOW COLUMNS FROM `chat___member` LIKE 'is_admin'");
            return (bool) $row;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function fetchOne(\PDO $db, string $sql): ?array
    {
        $stmt = $db->query($sql);
        if (!$stmt) {
            return null;
        }
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
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
                    'actions' => [
                        ['action' => 'reply', 'title' => 'Balas'],
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

            $hasGroupPhoto = $this->hasConversationGroupPhotoColumn($db);
            $selectGroupPhoto = $hasGroupPhoto ? ", c.group_photo" : ", NULL AS group_photo";
            $stmt = $db->prepare("
                SELECT m.conversation_id, c.type, c.name {$selectGroupPhoto}
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
                    'group_photo' => isset($conv['group_photo']) && trim((string) $conv['group_photo']) !== '' ? trim((string) $conv['group_photo']) : null,
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
                SELECT u.id, u.username, u.last_seen_at, p.nama AS nama_pengurus, p.foto_profil
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
                    'foto_profil' => isset($row['foto_profil']) && trim((string) $row['foto_profil']) !== '' ? trim((string) $row['foto_profil']) : null,
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
     * POST /api/chat/groups
     * Body: { name: string, member_user_ids: number[] }, optional multipart file: group_photo
     */
    public function createGroup(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $name = trim((string) ($body['name'] ?? ''));
        $memberIdsRaw = $body['member_user_ids'] ?? [];
        if ($name === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama grup wajib diisi'], 400);
        }
        if (!is_array($memberIdsRaw) || count($memberIdsRaw) < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih minimal 1 anggota'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $hasGroupPhoto = $this->hasConversationGroupPhotoColumn($db);
            $hasMemberIsAdmin = $this->hasMemberIsAdminColumn($db);
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $memberIds = [];
            foreach ($memberIdsRaw as $id) {
                $uid = $this->resolveToUsersId($db, (int) $id);
                if ($uid !== null && $uid > 0 && $uid !== $myUserId) {
                    $memberIds[$uid] = true;
                }
            }
            $finalMembers = array_map('intval', array_keys($memberIds));
            if (count($finalMembers) < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Pilih minimal 1 anggota valid'], 400);
            }

            $db->beginTransaction();
            $stmtConv = $db->prepare("INSERT INTO chat___conversation (type, name, created_at, updated_at) VALUES ('group', ?, NOW(), NOW())");
            $stmtConv->execute([$name]);
            $conversationId = (int) $db->lastInsertId();

            $groupPhotoPath = null;
            $uploadedFiles = $request->getUploadedFiles();
            $photo = $uploadedFiles['group_photo'] ?? null;
            if ($hasGroupPhoto && $photo && $photo->getError() === UPLOAD_ERR_OK) {
                $mediaType = (string) $photo->getClientMediaType();
                $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!in_array($mediaType, $allowed, true)) {
                    throw new \RuntimeException('Format gambar grup tidak didukung');
                }
                $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m)
                    ? ($m[1] === 'jpeg' ? 'jpg' : $m[1])
                    : 'jpg';
                $fileName = 'g' . $conversationId . '_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getGroupUploadDir();
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
                $photo->moveTo($filePath);
                $groupPhotoPath = 'uploads/chat_groups/' . $fileName;
                $db->prepare("UPDATE chat___conversation SET group_photo = ? WHERE id = ?")->execute([$groupPhotoPath, $conversationId]);
            }

            if ($hasMemberIsAdmin) {
                $stmtMem = $db->prepare("INSERT INTO chat___member (conversation_id, user_id, is_admin, joined_at) VALUES (?, ?, ?, NOW())");
                $stmtMem->execute([$conversationId, $myUserId, 1]);
                foreach ($finalMembers as $uid) {
                    $stmtMem->execute([$conversationId, $uid, 0]);
                }
            } else {
                $stmtMem = $db->prepare("INSERT INTO chat___member (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())");
                $stmtMem->execute([$conversationId, $myUserId]);
                foreach ($finalMembers as $uid) {
                    $stmtMem->execute([$conversationId, $uid]);
                }
            }
            $db->commit();

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'name' => $name,
                'group_photo' => $groupPhotoPath,
                'member_user_ids' => array_merge([$myUserId], $finalMembers),
                'my_user_id' => $myUserId,
            ]);
        } catch (\Throwable $e) {
            if (isset($db) && $db instanceof \PDO && $db->inTransaction()) {
                $db->rollBack();
            }
            error_log('UserChatController::createGroup ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat grup'], 500);
        }
    }

    /**
     * GET /api/chat/users/{id}/photo
     * Stream foto profil user lain (blob auth) untuk avatar chat.
     */
    /**
     * GET /api/chat/conversations/{id}/photo
     * Stream foto grup (anggota conversation saja). Tanpa header auth, URL statis /uploads sering gagal di browser.
     */
    public function getGroupPhoto(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($conversationId < 1) {
            return $response->withStatus(400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $response->withStatus(401);
            }
            if (!$this->hasConversationGroupPhotoColumn($db)) {
                return $response->withStatus(204);
            }
            $stmt = $db->prepare("
                SELECT c.type, c.group_photo
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmt->execute([$myUserId, $conversationId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || ($row['type'] ?? '') !== 'group') {
                return $response->withStatus(404);
            }
            $path = isset($row['group_photo']) ? trim((string) $row['group_photo']) : '';
            if ($path === '') {
                return $response->withStatus(204);
            }
            $fullPath = $this->resolveUploadFilePath($path);
            if (!is_file($fullPath)) {
                return $response->withStatus(204);
            }
            $mime = mime_content_type($fullPath);
            if (!is_string($mime) || !preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }
            $response->getBody()->write((string) file_get_contents($fullPath));
            return $response->withHeader('Content-Type', $mime);
        } catch (\Throwable $e) {
            error_log('UserChatController::getGroupPhoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * DELETE /api/chat/conversations/{id}
     * Keluar dari percakapan (hapus baris member); jika tidak ada anggota, hapus conversation (pesan ikut CASCADE).
     */
    public function deleteConversation(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID percakapan tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$conversationId, $myUserId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }

            $del = $db->prepare('DELETE FROM chat___member WHERE conversation_id = ? AND user_id = ?');
            $del->execute([$conversationId, $myUserId]);

            $cntStmt = $db->prepare('SELECT COUNT(*) FROM chat___member WHERE conversation_id = ?');
            $cntStmt->execute([$conversationId]);
            $remaining = (int) $cntStmt->fetchColumn();
            if ($remaining === 0) {
                $delConv = $db->prepare('DELETE FROM chat___conversation WHERE id = ?');
                $delConv->execute([$conversationId]);
            }

            return $this->json($response, ['success' => true, 'message' => 'Percakapan dihapus']);
        } catch (\Throwable $e) {
            error_log('UserChatController::deleteConversation ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus percakapan'], 500);
        }
    }

    public function getUserPhoto(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $targetUserId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($targetUserId < 1) {
            return $response->withStatus(400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $response->withStatus(401);
            }

            $stmt = $db->prepare("
                SELECT p.foto_profil
                FROM users u
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE u.id = ?
                LIMIT 1
            ");
            $stmt->execute([$targetUserId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $path = isset($row['foto_profil']) ? trim((string) $row['foto_profil']) : '';
            if ($path === '') {
                return $response->withStatus(204);
            }

            $fullPath = $this->resolveUploadFilePath($path);
            if (!is_file($fullPath)) {
                return $response->withStatus(204);
            }

            $mime = mime_content_type($fullPath);
            if (!is_string($mime) || !preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }
            $response->getBody()->write((string) file_get_contents($fullPath));
            return $response->withHeader('Content-Type', $mime);
        } catch (\Throwable $e) {
            error_log('UserChatController::getUserPhoto ' . $e->getMessage());
            return $response->withStatus(500);
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
        $beforeId = isset($params['before_id']) ? (int) $params['before_id'] : 0;
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

            $sql = "
                SELECT ch.id, ch.conversation_id, ch.sender_id, ch.message, ch.tanggal_dibuat,
                       u.username AS sender_username,
                       p.nama AS sender_nama_pengurus
                FROM chat ch
                LEFT JOIN users u ON u.id = ch.sender_id
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE ch.conversation_id = ?
            ";
            $bind = [$conversationId];
            if ($beforeId > 0) {
                $sql .= " AND id < ? ";
                $bind[] = $beforeId;
            }
            $sql .= " ORDER BY tanggal_dibuat DESC, id DESC LIMIT " . $limit;
            $stmt = $db->prepare($sql);
            $stmt->execute($bind);
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
                $uName = trim((string) ($r['sender_username'] ?? ''));
                $namaP = isset($r['sender_nama_pengurus']) && trim((string) $r['sender_nama_pengurus']) !== ''
                    ? trim((string) $r['sender_nama_pengurus'])
                    : null;
                $senderDisplayName = $this->formatNamaUsername($namaP, $uName !== '' ? $uName : '', $senderId);
                $list[] = [
                    'id' => (int) $r['id'],
                    'conversation_id' => (int) $r['conversation_id'],
                    'sender_id' => $senderId,
                    'message' => $r['message'],
                    'tanggal_dibuat' => $r['tanggal_dibuat'],
                    'created_at' => $r['tanggal_dibuat'],
                    'is_own' => $senderId === $myUserId,
                    'sender_username' => $uName !== '' ? $uName : null,
                    'sender_display_name' => $senderDisplayName,
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
     * POST /api/chat/send (auth user)
     * Body: conversation_id + message (grup/private), atau to_user_id + message (private).
     * sender_id dari token login (users.id), bukan trust penuh dari client.
     */
    public function sendMessageAuth(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $conversationId = isset($body['conversation_id']) ? (int) $body['conversation_id'] : 0;
        $toId = isset($body['to_user_id']) ? (int) $body['to_user_id'] : 0;
        $message = isset($body['message']) ? trim((string) $body['message']) : '';
        if ($message === '') {
            return $this->json($response, ['success' => false, 'message' => 'message wajib'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $senderId = $this->getMyUserIdFromPayload($db, $payload);
            if ($senderId === null || $senderId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $recipientId = 0;
            if ($conversationId > 0) {
                $stmt = $db->prepare("SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmt->execute([$conversationId, $senderId]);
                if (!$stmt->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Bukan anggota conversation'], 400);
                }
            } elseif ($toId > 0) {
                $toResolved = $this->resolveToUsersId($db, $toId);
                if ($toResolved === null) {
                    return $this->json($response, ['success' => false, 'message' => 'to_user_id tidak valid'], 400);
                }
                $recipientId = (int) $toResolved;
                $conversationId = $this->getOrCreatePrivateConversation($db, $senderId, $recipientId);
            } else {
                return $this->json($response, ['success' => false, 'message' => 'Berikan conversation_id atau to_user_id'], 400);
            }

            $stmt = $db->prepare("INSERT INTO chat (conversation_id, sender_id, message, tanggal_dibuat) VALUES (?, ?, ?, NOW())");
            $stmt->execute([$conversationId, $senderId, $message]);
            $id = (int) $db->lastInsertId();
            $db->prepare("UPDATE chat___conversation SET updated_at = NOW() WHERE id = ?")->execute([$conversationId]);
            $stmtDate = $db->prepare("SELECT tanggal_dibuat FROM chat WHERE id = ?");
            $stmtDate->execute([$id]);
            $row = $stmtDate->fetch(\PDO::FETCH_ASSOC);
            $tanggalDibuat = $row ? ($row['tanggal_dibuat'] ?? date('Y-m-d H:i:s')) : date('Y-m-d H:i:s');

            // Push private chat tetap jalan; grup tidak kirim push per-member di endpoint ini.
            if ($recipientId > 0 && $recipientId !== $senderId) {
                $sf = (int) $senderId;
                $rf = (int) $recipientId;
                $mf = $message;
                $cf = (int) $conversationId;
                register_shutdown_function(static function () use ($sf, $rf, $mf, $cf) {
                    try {
                        (new self())->runDeferredChatPush($sf, $rf, $mf, $cf);
                    } catch (\Throwable $e) {
                        error_log('UserChatController::deferredChatPushAuth ' . $e->getMessage());
                    }
                });
            }

            $out = [
                'success' => true,
                'id' => $id,
                'conversation_id' => $conversationId,
                'sender_id' => $senderId,
                'created_at' => $tanggalDibuat,
                'tanggal_dibuat' => $tanggalDibuat,
            ];
            $stmtType = $db->prepare("SELECT type FROM chat___conversation WHERE id = ? LIMIT 1");
            $stmtType->execute([$conversationId]);
            $convType = $stmtType->fetchColumn();
            if ($convType === 'group') {
                $stmtU = $db->prepare("SELECT u.username, p.nama AS nama_pengurus FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");
                $stmtU->execute([$senderId]);
                $uRow = $stmtU->fetch(\PDO::FETCH_ASSOC) ?: [];
                $uName = trim((string) ($uRow['username'] ?? ''));
                $namaP = isset($uRow['nama_pengurus']) && trim((string) $uRow['nama_pengurus']) !== '' ? trim((string) $uRow['nama_pengurus']) : null;
                $out['sender_username'] = $uName !== '' ? $uName : null;
                $out['sender_display_name'] = $this->formatNamaUsername($namaP, $uName !== '' ? $uName : '', $senderId);
            }

            return $this->json($response, $out);
        } catch (\Throwable $e) {
            error_log('UserChatController::sendMessageAuth ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
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
