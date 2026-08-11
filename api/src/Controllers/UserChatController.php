<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\ChatMessageSocialHelper;
use App\Helpers\ChatReceiptHelper;
use App\Helpers\LiveChatBroadcastHelper;
use App\Helpers\LiveChatMessageNotifier;
use App\Utils\DeferredHttpTask;
use App\Utils\PushNotificationService;
use Nyholm\Psr7\Stream;
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
    /** Batas baca foto chat (byte) — hindari OOM / connection reset pada berkas sangat besar. */
    private const CHAT_PHOTO_MAX_BYTES = 8388608; // 8 MiB
    private const CHAT_ATTACHMENT_MAX_BYTES = 5242880; // 5 MiB

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

    /**
     * Path relatif foto profil untuk users.id: kolom users.foto_profil dulu (jika ada), lalu pengurus.
     * Aman terhadap skema production yang belum migrasi kolom foto_profil di users.
     */
    private function resolveUserProfilePhotoRelativePath(\PDO $db, int $userId): ?string
    {
        if ($userId < 1) {
            return null;
        }
        try {
            if ($this->tableHasColumn($db, 'users', 'foto_profil')) {
                $stmt = $db->prepare('SELECT foto_profil FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row) {
                    $p = trim((string) ($row['foto_profil'] ?? ''));
                    if ($p !== '') {
                        return $p;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('UserChatController::resolveUserProfilePhotoRelativePath users: ' . $e->getMessage());
        }
        try {
            if ($this->tableHasColumn($db, 'pengurus', 'foto_profil')) {
                $stmt = $db->prepare(
                    "SELECT foto_profil FROM pengurus WHERE id_user = ? AND foto_profil IS NOT NULL AND TRIM(foto_profil) <> '' ORDER BY id ASC LIMIT 1"
                );
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row) {
                    $p = trim((string) ($row['foto_profil'] ?? ''));
                    if ($p !== '') {
                        return $p;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('UserChatController::resolveUserProfilePhotoRelativePath pengurus: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Stream gambar dari disk ke klien (body = resource berkas, bukan buffer php://memory).
     * Menghindari OOM, mismatch panjang, dan isu emit besar pada beberapa stack Windows/Apache.
     */
    private function streamLocalImageToResponse(Response $response, string $fullPath): Response
    {
        $size = @filesize($fullPath);
        if ($size === false || $size < 1 || $size > self::CHAT_PHOTO_MAX_BYTES) {
            return $response->withStatus(204);
        }

        $mime = 'image/jpeg';
        if (function_exists('mime_content_type')) {
            $detected = @mime_content_type($fullPath);
            if (is_string($detected) && preg_match('#^image/(jpeg|pjpeg|png|gif|webp|svg\+xml)$#i', $detected)) {
                $low = strtolower($detected);
                $mime = $low === 'image/pjpeg' ? 'image/jpeg' : $low;
            }
        }

        $fh = @fopen($fullPath, 'rb');
        if ($fh === false) {
            return $response->withStatus(204);
        }

        try {
            $body = Stream::create($fh);
        } catch (\Throwable $e) {
            @fclose($fh);
            error_log('UserChatController::streamLocalImageToResponse ' . $e->getMessage());
            return $response->withStatus(204);
        }

        return $response
            ->withStatus(200)
            ->withBody($body)
            ->withHeader('Content-Type', $mime)
            ->withHeader('Content-Length', (string) $size);
    }

    private function getGroupUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'chat_groups';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function getChatAttachmentUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'chat_files';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function isAllowedAttachmentMime(string $mime): bool
    {
        $m = strtolower(trim($mime));
        return in_array($m, [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ], true);
    }

    private function isAllowedAttachmentExtension(string $filename): bool
    {
        $ext = strtolower(trim((string) pathinfo($filename, PATHINFO_EXTENSION)));
        return in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'], true);
    }

    private function sanitizeAttachmentName(string $name): string
    {
        $base = trim($name);
        if ($base === '') {
            return 'file';
        }
        $base = preg_replace('/[^\w\.\-\(\)\[\] ]+/u', '_', $base) ?? 'file';
        return trim($base) !== '' ? trim($base) : 'file';
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

    /** @return int[] */
    private function getConversationMemberUserIds(\PDO $db, int $conversationId): array
    {
        $stmt = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
        $stmt->execute([$conversationId]);

        return array_values(array_filter(array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN) ?: []), static fn (int $x) => $x > 0));
    }

    /** Lawan bicara pada chat private (users.id); 0 jika grup / tidak ditemukan. */
    private function resolvePrivateChatPeerUserId(\PDO $db, int $conversationId, int $myUserId): int
    {
        if ($conversationId < 1 || $myUserId < 1) {
            return 0;
        }
        try {
            $stmtType = $db->prepare('SELECT type FROM chat___conversation WHERE id = ? LIMIT 1');
            $stmtType->execute([$conversationId]);
            if ((string) ($stmtType->fetchColumn() ?: '') !== 'private') {
                return 0;
            }
            $stmtPeer = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ? AND user_id != ? LIMIT 1');
            $stmtPeer->execute([$conversationId, $myUserId]);
            $peer = $stmtPeer->fetchColumn();

            return $peer !== false ? (int) $peer : 0;
        } catch (\Throwable $e) {
            return 0;
        }
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
            $bodyLine = $senderName !== '' ? ($senderName . ': ' . $preview) : $preview;

            $push = new PushNotificationService();
            $push->sendToUserIds(
                [$toUsersId],
                'Pesan baru',
                $bodyLine,
                [
                    'tag' => 'chat-message-' . $conversationId,
                    'url' => '/chat?u=' . $fromUsersId,
                    'icon' => '/gambar/icon/icon192.png',
                    'badge' => '/gambar/icon/icon128.png',
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
                    'vibrate' => [200, 100, 200],
                    'sender_name' => $senderName,
                ]
            );
        } catch (\Throwable $e) {
            error_log('UserChatController::sendPushForIncomingMessage ' . $e->getMessage());
        }
    }

    /**
     * Jalankan push setelah respons HTTP (DeferredHttpTask / fastcgi_finish_request bila tersedia).
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
            $hasPriv = $this->tableHasColumn($db, 'users', 'privacy_show_last_seen');
            $selPriv = $hasPriv ? ', u.privacy_show_last_seen, u.privacy_show_read_receipt' : '';
            $stmt = $db->prepare("SELECT u.username, p.nama AS nama_pengurus {$selPriv} FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1");
            $stmt->execute([$myUserId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $username = $row && trim((string) ($row['username'] ?? '')) !== '' ? trim($row['username']) : 'User ' . $myUserId;
            $nama = $row && trim((string) ($row['nama_pengurus'] ?? '')) !== '' ? trim($row['nama_pengurus']) : null;
            $display_name = $this->formatNamaUsername($nama, $username, $myUserId);
            $out = ['success' => true, 'my_user_id' => $myUserId, 'username' => $username, 'nama' => $nama, 'display_name' => $display_name];
            if ($hasPriv) {
                $out['privacy_show_last_seen'] = isset($row['privacy_show_last_seen']) ? ((int) $row['privacy_show_last_seen'] === 1) : true;
                $out['privacy_show_read_receipt'] = isset($row['privacy_show_read_receipt']) ? ((int) $row['privacy_show_read_receipt'] === 1) : true;
            }

            return $this->json($response, $out);
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
        $params = $request->getQueryParams();
        $includeArchived = isset($params['include_archived']) && ((string) $params['include_archived'] === '1' || strtolower((string) $params['include_archived']) === 'true');
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 401);
            }

            $hasGroupPhoto = $this->hasConversationGroupPhotoColumn($db);
            $selectGroupPhoto = $hasGroupPhoto ? ", c.group_photo" : ", NULL AS group_photo";
            $extraM = '';
            if ($this->tableHasColumn($db, 'chat___member', 'archived_at')) {
                $extraM .= ', m.archived_at';
            }
            if ($this->tableHasColumn($db, 'chat___member', 'draft_text')) {
                $extraM .= ', m.draft_text';
            }
            if ($this->tableHasColumn($db, 'chat___member', 'draft_updated_at')) {
                $extraM .= ', m.draft_updated_at';
            }
            $stmt = $db->prepare("
                SELECT m.conversation_id, c.type, c.name {$selectGroupPhoto}{$extraM}
                FROM chat___member m
                INNER JOIN chat___conversation c ON c.id = m.conversation_id
                WHERE m.user_id = ?
                ORDER BY m.conversation_id
            ");
            $stmt->execute([$myUserId]);
            $convs = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $list = [];
            $delClause = $this->tableHasColumn($db, 'chat', 'deleted_at') ? ' AND deleted_at IS NULL' : '';
            $stmtLast = $db->prepare("
                SELECT id, sender_id, message, tanggal_dibuat
                FROM chat
                WHERE conversation_id = ?
                {$delClause}
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
                $archivedAt = isset($conv['archived_at']) && $conv['archived_at'] !== null && trim((string) $conv['archived_at']) !== '' ? $conv['archived_at'] : null;
                if (!$includeArchived && $archivedAt !== null) {
                    continue;
                }
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

                $item = [
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
                    'is_archived' => $archivedAt !== null,
                ];
                if (isset($conv['draft_text'])) {
                    $item['draft_text'] = $conv['draft_text'] !== null && trim((string) $conv['draft_text']) !== '' ? (string) $conv['draft_text'] : null;
                }
                if (isset($conv['draft_updated_at'])) {
                    $item['draft_updated_at'] = $conv['draft_updated_at'] !== null ? $conv['draft_updated_at'] : null;
                }
                $list[] = $item;
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

            $hasPriv = $this->tableHasColumn($db, 'users', 'privacy_show_last_seen');
            $hasLastSeen = $this->tableHasColumn($db, 'users', 'last_seen_at');
            $hasIsActive = $this->tableHasColumn($db, 'users', 'is_active');
            $hasPengurusFoto = $this->tableHasColumn($db, 'pengurus', 'foto_profil');

            $sel = ['u.id', 'u.username'];
            $sel[] = $hasLastSeen ? 'u.last_seen_at' : 'NULL AS last_seen_at';
            $sel[] = 'p.nama AS nama_pengurus';
            $sel[] = $hasPengurusFoto ? 'p.foto_profil' : 'NULL AS foto_profil';
            if ($hasPriv) {
                $sel[] = 'u.privacy_show_last_seen';
            }

            $whereActive = $hasIsActive ? '(u.is_active IS NULL OR u.is_active = 1)' : '1=1';

            // Satu baris per users.id (hindari duplikat jika banyak pengurus per user)
            $sql = 'SELECT ' . implode(', ', $sel) . '
                FROM users u
                LEFT JOIN (
                    SELECT id_user, MIN(id) AS min_id
                    FROM pengurus
                    WHERE id_user IS NOT NULL
                    GROUP BY id_user
                ) px ON px.id_user = u.id
                LEFT JOIN pengurus p ON p.id = px.min_id
                WHERE ' . $whereActive . '
                ORDER BY u.username ASC, u.id ASC';

            $stmt = $db->prepare($sql);
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = [];
            foreach ($rows as $row) {
                $id = (int) $row['id'];
                $username = trim((string) ($row['username'] ?? ''));
                $namaPengurus = isset($row['nama_pengurus']) && trim((string) $row['nama_pengurus']) !== '' ? trim($row['nama_pengurus']) : null;
                $hideSeen = $hasPriv && $id !== $myUserId && isset($row['privacy_show_last_seen']) && (int) $row['privacy_show_last_seen'] === 0;
                $list[] = [
                    'id' => $id,
                    'username' => $username,
                    'nama' => $namaPengurus,
                    'foto_profil' => isset($row['foto_profil']) && trim((string) $row['foto_profil']) !== '' ? trim((string) $row['foto_profil']) : null,
                    'display_name' => $this->formatNamaUsername($namaPengurus, $username, $id),
                    'last_seen_at' => $hideSeen ? null : (isset($row['last_seen_at']) && $row['last_seen_at'] !== null ? $row['last_seen_at'] : null),
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

            return $this->streamLocalImageToResponse($response, $fullPath);
        } catch (\Throwable $e) {
            error_log('UserChatController::getGroupPhoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * PATCH /api/chat/conversations/{id}
     * Admin grup: ubah nama dan/atau foto grup (multipart: name, group_photo).
     */
    public function updateGroupConversation(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID percakapan tidak valid'], 400);
        }

        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $nameProvided = array_key_exists('name', $body);
        $name = $nameProvided ? trim((string) ($body['name'] ?? '')) : null;
        if ($nameProvided && $name === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama grup wajib diisi'], 400);
        }

        $uploadedFiles = $request->getUploadedFiles();
        $photo = $uploadedFiles['group_photo'] ?? null;
        $hasPhotoUpload = $photo && $photo->getError() === UPLOAD_ERR_OK;
        if (!$nameProvided && !$hasPhotoUpload) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada perubahan'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $hasGroupPhoto = $this->hasConversationGroupPhotoColumn($db);
            if ($hasPhotoUpload && !$hasGroupPhoto) {
                return $this->json($response, ['success' => false, 'message' => 'Foto grup belum didukung di server ini'], 400);
            }

            $stmtConv = $db->prepare("
                SELECT c.type, c.name, c.group_photo
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtConv->execute([$myUserId, $conversationId]);
            $conv = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan ini bukan grup'], 400);
            }

            $hasMemberIsAdmin = $this->hasMemberIsAdminColumn($db);
            if ($hasMemberIsAdmin) {
                $stmtAdmin = $db->prepare('SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
                $stmtAdmin->execute([$conversationId, $myUserId]);
                $adminRow = $stmtAdmin->fetch(\PDO::FETCH_ASSOC);
                $isAdmin = $adminRow && ((int) ($adminRow['is_admin'] ?? 0) === 1);
                if (!$isAdmin) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat mengubah profil grup'], 403);
                }
            }

            $setParts = [];
            $params = [];
            $newPhotoPath = null;

            if ($nameProvided) {
                $setParts[] = 'name = ?';
                $params[] = $name;
            }

            if ($hasPhotoUpload) {
                $mediaType = (string) $photo->getClientMediaType();
                $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!in_array($mediaType, $allowed, true)) {
                    return $this->json($response, ['success' => false, 'message' => 'Format gambar grup tidak didukung'], 400);
                }
                $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m)
                    ? ($m[1] === 'jpeg' ? 'jpg' : $m[1])
                    : 'jpg';
                $fileName = 'g' . $conversationId . '_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getGroupUploadDir();
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
                $photo->moveTo($filePath);
                $newPhotoPath = 'uploads/chat_groups/' . $fileName;
                $setParts[] = 'group_photo = ?';
                $params[] = $newPhotoPath;
            }

            $setParts[] = 'updated_at = NOW()';
            $params[] = $conversationId;
            $db->prepare('UPDATE chat___conversation SET ' . implode(', ', $setParts) . ' WHERE id = ?')->execute($params);

            if ($newPhotoPath !== null) {
                $oldPath = isset($conv['group_photo']) ? trim((string) $conv['group_photo']) : '';
                if ($oldPath !== '') {
                    $oldFull = $this->resolveUploadFilePath($oldPath);
                    if (is_file($oldFull)) {
                        @unlink($oldFull);
                    }
                }
            }

            $outName = $nameProvided ? $name : trim((string) ($conv['name'] ?? ''));
            $outPhoto = $newPhotoPath ?? (isset($conv['group_photo']) && trim((string) $conv['group_photo']) !== ''
                ? trim((string) $conv['group_photo'])
                : null);

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'name' => $outName,
                'group_photo' => $outPhoto,
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::updateGroupConversation ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui grup'], 500);
        }
    }

    /**
     * GET /api/chat/conversations/{id}/members
     * Daftar anggota grup (hanya untuk member conversation tsb).
     */
    public function getConversationMembers(Request $request, Response $response, array $args): Response
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

            $stmtConv = $db->prepare("
                SELECT c.type, c.name
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtConv->execute([$myUserId, $conversationId]);
            $conv = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan ini bukan grup'], 400);
            }

            $hasMemberIsAdmin = $this->hasMemberIsAdminColumn($db);
            $hasLastSeen = $this->tableHasColumn($db, 'users', 'last_seen_at');
            $selectAdmin = $hasMemberIsAdmin ? "m.is_admin" : "0 AS is_admin";
            $selectLastSeen = $hasLastSeen ? 'u.last_seen_at' : 'NULL AS last_seen_at';
            $stmt = $db->prepare("
                SELECT
                    m.user_id,
                    {$selectAdmin},
                    m.joined_at,
                    u.username,
                    {$selectLastSeen},
                    p.nama AS nama_pengurus
                FROM chat___member m
                LEFT JOIN users u ON u.id = m.user_id
                LEFT JOIN (
                    SELECT id_user, MIN(id) AS min_id
                    FROM pengurus
                    WHERE id_user IS NOT NULL
                    GROUP BY id_user
                ) px ON px.id_user = u.id
                LEFT JOIN pengurus p ON p.id = px.min_id
                WHERE m.conversation_id = ?
                ORDER BY COALESCE(NULLIF(TRIM(p.nama), ''), NULLIF(TRIM(u.username), ''), CONCAT('User ', m.user_id)) ASC, m.user_id ASC
            ");
            $stmt->execute([$conversationId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $members = [];
            $selfIsAdmin = !$hasMemberIsAdmin;
            foreach ($rows as $row) {
                $uid = (int) ($row['user_id'] ?? 0);
                if ($uid < 1) {
                    continue;
                }
                $isAdmin = isset($row['is_admin']) ? ((int) $row['is_admin'] === 1) : false;
                if ($uid === $myUserId && $isAdmin) {
                    $selfIsAdmin = true;
                }
                $username = trim((string) ($row['username'] ?? ''));
                $namaPengurus = isset($row['nama_pengurus']) && trim((string) $row['nama_pengurus']) !== ''
                    ? trim((string) $row['nama_pengurus'])
                    : null;
                $members[] = [
                    'user_id' => $uid,
                    'is_admin' => $isAdmin,
                    'username' => $username !== '' ? $username : null,
                    'nama' => $namaPengurus,
                    'display_name' => $this->formatNamaUsername($namaPengurus, $username, $uid),
                    'last_seen_at' => isset($row['last_seen_at']) && $row['last_seen_at'] !== null ? $row['last_seen_at'] : null,
                    'joined_at' => isset($row['joined_at']) && $row['joined_at'] !== null ? $row['joined_at'] : null,
                    'is_self' => $uid === $myUserId,
                ];
            }

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'group_name' => isset($conv['name']) ? trim((string) $conv['name']) : '',
                'can_manage_members' => $selfIsAdmin,
                'members' => $members,
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getConversationMembers ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * POST /api/chat/conversations/{id}/members
     * Admin grup menambah anggota baru.
     */
    public function addConversationMembers(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID percakapan tidak valid'], 400);
        }

        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $memberIdsRaw = $body['member_user_ids'] ?? [];
        if (!is_array($memberIdsRaw) || count($memberIdsRaw) < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih minimal 1 anggota'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmtConv = $db->prepare("
                SELECT c.type
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtConv->execute([$myUserId, $conversationId]);
            $conv = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan ini bukan grup'], 400);
            }

            $hasMemberIsAdmin = $this->hasMemberIsAdminColumn($db);
            if ($hasMemberIsAdmin) {
                $stmtAdmin = $db->prepare("SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmtAdmin->execute([$conversationId, $myUserId]);
                $adminRow = $stmtAdmin->fetch(\PDO::FETCH_ASSOC);
                $isAdmin = $adminRow && ((int) ($adminRow['is_admin'] ?? 0) === 1);
                if (!$isAdmin) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat menambah anggota'], 403);
                }
            }

            $candidateIds = [];
            foreach ($memberIdsRaw as $id) {
                $uid = $this->resolveToUsersId($db, (int) $id);
                if ($uid !== null && $uid > 0 && $uid !== $myUserId) {
                    $candidateIds[$uid] = true;
                }
            }
            $finalIds = array_map('intval', array_keys($candidateIds));
            if (count($finalIds) < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada anggota valid untuk ditambahkan'], 400);
            }

            $stmtExists = $db->prepare("SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtInsert = $hasMemberIsAdmin
                ? $db->prepare("INSERT INTO chat___member (conversation_id, user_id, is_admin, joined_at) VALUES (?, ?, 0, NOW())")
                : $db->prepare("INSERT INTO chat___member (conversation_id, user_id, joined_at) VALUES (?, ?, NOW())");

            $added = 0;
            foreach ($finalIds as $uid) {
                $stmtExists->execute([$conversationId, $uid]);
                if ($stmtExists->fetch()) {
                    continue;
                }
                $stmtInsert->execute([$conversationId, $uid]);
                $added++;
            }

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'added_count' => $added,
                'message' => $added > 0 ? 'Anggota berhasil ditambahkan' : 'Semua user sudah menjadi anggota',
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::addConversationMembers ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menambah anggota'], 500);
        }
    }

    /**
     * DELETE /api/chat/conversations/{id}/members/{userId}
     * Admin grup mengeluarkan anggota.
     */
    public function removeConversationMember(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $targetUserId = isset($args['userId']) ? (int) $args['userId'] : 0;
        if ($conversationId < 1 || $targetUserId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter tidak valid'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmtConv = $db->prepare("
                SELECT c.type
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtConv->execute([$myUserId, $conversationId]);
            $conv = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan ini bukan grup'], 400);
            }
            if ($targetUserId === $myUserId) {
                return $this->json($response, ['success' => false, 'message' => 'Gunakan aksi keluar grup untuk diri sendiri'], 400);
            }

            $hasMemberIsAdmin = $this->hasMemberIsAdminColumn($db);
            if ($hasMemberIsAdmin) {
                $stmtAdmin = $db->prepare("SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmtAdmin->execute([$conversationId, $myUserId]);
                $adminRow = $stmtAdmin->fetch(\PDO::FETCH_ASSOC);
                $isAdmin = $adminRow && ((int) ($adminRow['is_admin'] ?? 0) === 1);
                if (!$isAdmin) {
                    return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat mengeluarkan anggota'], 403);
                }
                $stmtTargetAdmin = $db->prepare("SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmtTargetAdmin->execute([$conversationId, $targetUserId]);
                $targetAdminRow = $stmtTargetAdmin->fetch(\PDO::FETCH_ASSOC);
                if (!$targetAdminRow) {
                    return $this->json($response, ['success' => false, 'message' => 'Anggota tidak ditemukan'], 404);
                }
                if ((int) ($targetAdminRow['is_admin'] ?? 0) === 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Admin tidak bisa mengeluarkan admin lain'], 400);
                }
            } else {
                // Schema lama tanpa is_admin: izinkan member mana pun mengeluarkan anggota lain untuk kompatibilitas.
                $stmtTarget = $db->prepare("SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
                $stmtTarget->execute([$conversationId, $targetUserId]);
                if (!$stmtTarget->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Anggota tidak ditemukan'], 404);
                }
            }

            $stmtDelete = $db->prepare("DELETE FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtDelete->execute([$conversationId, $targetUserId]);
            if ($stmtDelete->rowCount() < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal mengeluarkan anggota'], 500);
            }

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'removed_user_id' => $targetUserId,
                'message' => 'Anggota berhasil dikeluarkan',
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::removeConversationMember ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengeluarkan anggota'], 500);
        }
    }

    /**
     * PATCH /api/chat/conversations/{id}/members/{userId}/admin
     * Admin grup mengubah status admin anggota.
     */
    public function setConversationMemberAdmin(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $targetUserId = isset($args['userId']) ? (int) $args['userId'] : 0;
        if ($conversationId < 1 || $targetUserId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter tidak valid'], 400);
        }

        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $setAdmin = isset($body['is_admin']) ? ((int) ((bool) $body['is_admin'])) : null;
        if ($setAdmin === null) {
            return $this->json($response, ['success' => false, 'message' => 'Field is_admin wajib diisi'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if (!$this->hasMemberIsAdminColumn($db)) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur admin grup belum didukung di database ini'], 400);
            }

            $stmtConv = $db->prepare("
                SELECT c.type
                FROM chat___conversation c
                INNER JOIN chat___member m ON m.conversation_id = c.id AND m.user_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtConv->execute([$myUserId, $conversationId]);
            $conv = $stmtConv->fetch(\PDO::FETCH_ASSOC);
            if (!$conv) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            if (($conv['type'] ?? '') !== 'group') {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan ini bukan grup'], 400);
            }

            $stmtMyAdmin = $db->prepare("SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtMyAdmin->execute([$conversationId, $myUserId]);
            $myAdminRow = $stmtMyAdmin->fetch(\PDO::FETCH_ASSOC);
            $isMyAdmin = $myAdminRow && ((int) ($myAdminRow['is_admin'] ?? 0) === 1);
            if (!$isMyAdmin) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya admin grup yang dapat mengubah admin'], 403);
            }

            $stmtTarget = $db->prepare("SELECT is_admin FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtTarget->execute([$conversationId, $targetUserId]);
            $targetRow = $stmtTarget->fetch(\PDO::FETCH_ASSOC);
            if (!$targetRow) {
                return $this->json($response, ['success' => false, 'message' => 'Anggota tidak ditemukan'], 404);
            }
            $targetIsAdminNow = ((int) ($targetRow['is_admin'] ?? 0) === 1);
            if ($targetIsAdminNow === ($setAdmin === 1)) {
                return $this->json($response, [
                    'success' => true,
                    'conversation_id' => $conversationId,
                    'user_id' => $targetUserId,
                    'is_admin' => $targetIsAdminNow,
                    'message' => 'Tidak ada perubahan',
                ]);
            }

            if ($setAdmin === 0 && $targetUserId === $myUserId) {
                $stmtAdminCount = $db->prepare("SELECT COUNT(*) FROM chat___member WHERE conversation_id = ? AND is_admin = 1");
                $stmtAdminCount->execute([$conversationId]);
                $adminCount = (int) $stmtAdminCount->fetchColumn();
                if ($adminCount <= 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Minimal harus ada 1 admin di grup'], 400);
                }
            }

            $stmtUpdate = $db->prepare("UPDATE chat___member SET is_admin = ? WHERE conversation_id = ? AND user_id = ? LIMIT 1");
            $stmtUpdate->execute([$setAdmin, $conversationId, $targetUserId]);

            return $this->json($response, [
                'success' => true,
                'conversation_id' => $conversationId,
                'user_id' => $targetUserId,
                'is_admin' => $setAdmin === 1,
                'message' => $setAdmin === 1 ? 'Anggota dijadikan admin' : 'Status admin diturunkan',
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::setConversationMemberAdmin ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah status admin'], 500);
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

            $path = $this->resolveUserProfilePhotoRelativePath($db, $targetUserId);
            if ($path === null || $path === '') {
                return $response->withStatus(204);
            }

            $fullPath = $this->resolveUploadFilePath($path);
            // Tolak path traversal di luar folder uploads
            $base = $this->uploadsBasePath;
            $realBase = realpath($base) ?: $base;
            $realFile = realpath($fullPath);
            if ($realFile === false || !is_file($realFile)) {
                return $response->withStatus(204);
            }
            $baseNorm = rtrim(str_replace('\\', '/', (string) $realBase), '/') . '/';
            $fileNorm = str_replace('\\', '/', $realFile);
            if (strpos($fileNorm, $baseNorm) !== 0 && $fileNorm !== rtrim($baseNorm, '/')) {
                return $response->withStatus(204);
            }

            return $this->streamLocalImageToResponse($response, $realFile);
        } catch (\Throwable $e) {
            // Avatar hilang / skema lama → 204 (bukan 500) agar frontend tidak banjir error merah
            error_log('UserChatController::getUserPhoto ' . $e->getMessage());
            return $response->withStatus(204);
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

            // Sebelum tandai baca: id pesan lawan pertama yang masih "belum dibaca" (untuk scroll + garis Pesan Baru di klien)
            $firstUnreadMessageId = null;
            $stmtFirstUnread = $db->prepare("
                SELECT ch.id FROM chat ch
                INNER JOIN chat___member m ON m.conversation_id = ch.conversation_id AND m.user_id = ?
                WHERE ch.conversation_id = ? AND ch.sender_id != ?
                AND (m.last_read_at IS NULL OR ch.tanggal_dibuat > m.last_read_at)
                ORDER BY ch.tanggal_dibuat ASC, ch.id ASC
                LIMIT 1
            ");
            $stmtFirstUnread->execute([$myUserId, $conversationId, $myUserId]);
            $fur = $stmtFirstUnread->fetch(\PDO::FETCH_ASSOC);
            if ($fur && isset($fur['id'])) {
                $firstUnreadMessageId = (int) $fur['id'];
            }

            // Update last_read_at
            $db->prepare("UPDATE chat___member SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?")->execute([$conversationId, $myUserId]);

            $stmtOtherReaders = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ? AND user_id != ?');
            $stmtOtherReaders->execute([$conversationId, $myUserId]);
            $otherIds = array_values(array_filter(array_map('intval', $stmtOtherReaders->fetchAll(\PDO::FETCH_COLUMN) ?: []), static fn (int $x) => $x > 0));
            if ($otherIds !== []) {
                LiveChatBroadcastHelper::emit('chat_receipt', $otherIds, [
                    'conversation_id' => $conversationId,
                    'kind' => 'read',
                    'user_id' => $myUserId,
                    'at' => date('c'),
                ]);
            }

            $hasEdited = $this->tableHasColumn($db, 'chat', 'edited_at');
            $hasDeleted = $this->tableHasColumn($db, 'chat', 'deleted_at');
            $hasAttachment = true;
            $hasDelivered = $this->tableHasColumn($db, 'chat___member', 'delivered_at');
            $extraCh = '';
            if ($hasEdited) {
                $extraCh .= ', ch.edited_at';
            }
            if ($hasDeleted) {
                $extraCh .= ', ch.deleted_at';
            }
            $extraCh .= ', ch.attachment_path, ch.attachment_name, ch.attachment_mime, ch.attachment_size';

            $stmtConvType = $db->prepare('SELECT type FROM chat___conversation WHERE id = ? LIMIT 1');
            $stmtConvType->execute([$conversationId]);
            $convTypeRow = $stmtConvType->fetch(\PDO::FETCH_ASSOC);
            $convTypeStr = $convTypeRow ? (string) ($convTypeRow['type'] ?? 'private') : 'private';

            $memberCols = 'user_id, last_read_at';
            if ($hasDelivered) {
                $memberCols .= ', delivered_at';
            }
            $stmtMembers = $db->prepare("SELECT {$memberCols} FROM chat___member WHERE conversation_id = ?");
            $stmtMembers->execute([$conversationId]);
            $memberRows = $stmtMembers->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $sql = "
                SELECT ch.id, ch.conversation_id, ch.sender_id, ch.message, ch.tanggal_dibuat{$extraCh},
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
            try {
                $stmt = $db->prepare($sql);
                $stmt->execute($bind);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (stripos($msg, 'attachment_') !== false || stripos($msg, 'Unknown column') !== false) {
                    $hasAttachment = false;
                    $extraCh = '';
                    if ($hasEdited) {
                        $extraCh .= ', ch.edited_at';
                    }
                    if ($hasDeleted) {
                        $extraCh .= ', ch.deleted_at';
                    }
                    $sql = "
                        SELECT ch.id, ch.conversation_id, ch.sender_id, ch.message, ch.tanggal_dibuat{$extraCh},
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
                } else {
                    throw $e;
                }
            }

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
                $isOwn = $senderId === $myUserId;
                $msgBody = $r['message'];
                if ($hasDeleted && !empty($r['deleted_at'])) {
                    $msgBody = '';
                }
                $item = [
                    'id' => (int) $r['id'],
                    'conversation_id' => (int) $r['conversation_id'],
                    'sender_id' => $senderId,
                    'message' => $msgBody,
                    'tanggal_dibuat' => $r['tanggal_dibuat'],
                    'created_at' => $r['tanggal_dibuat'],
                    'is_own' => $isOwn,
                    'sender_username' => $uName !== '' ? $uName : null,
                    'sender_display_name' => $senderDisplayName,
                ];
                if ($hasAttachment) {
                    $item['has_attachment'] = !empty($r['attachment_path']);
                    $item['attachment_name'] = isset($r['attachment_name']) ? (string) $r['attachment_name'] : null;
                    $item['attachment_mime'] = isset($r['attachment_mime']) ? (string) $r['attachment_mime'] : null;
                    $item['attachment_size'] = isset($r['attachment_size']) ? (int) $r['attachment_size'] : null;
                }
                if ($hasEdited) {
                    $item['edited_at'] = isset($r['edited_at']) && $r['edited_at'] !== null ? $r['edited_at'] : null;
                }
                if ($hasDeleted) {
                    $item['deleted_at'] = isset($r['deleted_at']) && $r['deleted_at'] !== null ? $r['deleted_at'] : null;
                    $item['is_deleted'] = !empty($r['deleted_at']);
                }
                if ($isOwn && $hasDelivered) {
                    $rec = ChatReceiptHelper::statusForOwnMessage(
                        (string) $r['tanggal_dibuat'],
                        $senderId,
                        $convTypeStr,
                        $memberRows
                    );
                    $item['receipt_status'] = $rec['status'];
                    $item['receipt_delivered_count'] = $rec['delivered_count'];
                    $item['receipt_read_count'] = $rec['read_count'];
                    $item['receipt_recipient_count'] = $rec['recipient_count'];
                }
                $list[] = $item;
            }

            $list = ChatMessageSocialHelper::enrichMessageList($db, $list, $myUserId);

            return $this->json($response, [
                'success' => true,
                'data' => $list,
                'my_user_id' => $myUserId,
                'conversation_id' => $conversationId,
                'peer_user_id' => $peerUserId,
                'peer_display_name' => $peerDisplayName,
                'first_unread_message_id' => $firstUnreadMessageId,
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
                DeferredHttpTask::runAfterResponse(static function () use ($sf, $rf, $mf, $cf): void {
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
        $uploadedFiles = $request->getUploadedFiles();
        $attachment = $uploadedFiles['file'] ?? null;
        $conversationId = isset($body['conversation_id']) ? (int) $body['conversation_id'] : 0;
        $toId = isset($body['to_user_id']) ? (int) $body['to_user_id'] : 0;
        $message = isset($body['message']) ? trim((string) $body['message']) : '';
        $replyToMessageId = isset($body['reply_to_message_id']) ? (int) $body['reply_to_message_id'] : 0;
        $forwardedFromMessageId = isset($body['forwarded_from_message_id']) ? (int) $body['forwarded_from_message_id'] : 0;
        $hasAttachment = $attachment && $attachment->getError() === UPLOAD_ERR_OK && $attachment->getSize() > 0;
        if ($message === '' && !$hasAttachment && $forwardedFromMessageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'message atau file wajib'], 400);
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
                $recipientId = $this->resolvePrivateChatPeerUserId($db, $conversationId, $senderId);
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

            if ($replyToMessageId > 0) {
                $replySrc = ChatMessageSocialHelper::loadMessageIfMember($db, $replyToMessageId, $senderId);
                if ($replySrc === null || (int) ($replySrc['conversation_id'] ?? 0) !== $conversationId) {
                    return $this->json($response, ['success' => false, 'message' => 'Pesan balasan tidak valid'], 400);
                }
            }
            if ($forwardedFromMessageId > 0) {
                $fwdSrc = ChatMessageSocialHelper::loadMessageIfMember($db, $forwardedFromMessageId, $senderId);
                if ($fwdSrc === null) {
                    return $this->json($response, ['success' => false, 'message' => 'Pesan terusan tidak valid'], 400);
                }
            }

            $attachmentPath = null;
            $attachmentName = null;
            $attachmentMime = null;
            $attachmentSize = null;
            if ($hasAttachment) {
                $size = (int) ($attachment->getSize() ?? 0);
                if ($size < 1 || $size > self::CHAT_ATTACHMENT_MAX_BYTES) {
                    return $this->json($response, ['success' => false, 'message' => 'Ukuran file maksimal 5MB'], 400);
                }
                $clientFilename = $attachment->getClientFilename() ?? 'file';
                $attachmentName = $this->sanitizeAttachmentName($clientFilename);
                $attachmentMime = strtolower(trim((string) ($attachment->getClientMediaType() ?? 'application/octet-stream')));
                $isAllowedMime = $this->isAllowedAttachmentMime($attachmentMime);
                $isAllowedExt = $this->isAllowedAttachmentExtension($attachmentName);
                if (!$isAllowedMime && !($attachmentMime === 'application/octet-stream' && $isAllowedExt)) {
                    return $this->json($response, ['success' => false, 'message' => 'Tipe file tidak didukung'], 400);
                }
                $ext = strtolower(pathinfo($attachmentName, PATHINFO_EXTENSION));
                $safeExt = $ext !== '' ? preg_replace('/[^a-z0-9]+/i', '', $ext) : '';
                $store = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
                if ($safeExt) {
                    $store .= '.' . $safeExt;
                }
                $attachmentPath = 'chat_files/' . $store;
                $target = $this->getChatAttachmentUploadDir() . DIRECTORY_SEPARATOR . $store;
                $attachment->moveTo($target);
                $attachmentSize = $size;
            }

            $hasAttachCols = false;
            if ($hasAttachment) {
                try {
                    $stmt = $db->prepare("INSERT INTO chat (conversation_id, sender_id, message, attachment_path, attachment_name, attachment_mime, attachment_size, tanggal_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
                    $stmt->execute([$conversationId, $senderId, $message, $attachmentPath, $attachmentName, $attachmentMime, $attachmentSize]);
                    $hasAttachCols = true;
                } catch (\Throwable $e) {
                    $msg = $e->getMessage();
                    if (stripos($msg, 'attachment_') !== false || stripos($msg, 'Unknown column') !== false) {
                        return $this->json($response, ['success' => false, 'message' => 'Fitur file belum aktif. Jalankan migrasi chat terbaru.'], 400);
                    }
                    throw $e;
                }
            } else {
                $hasAttachCols = $this->tableHasColumn($db, 'chat', 'attachment_path');
                $stmt = $db->prepare("INSERT INTO chat (conversation_id, sender_id, message, tanggal_dibuat) VALUES (?, ?, ?, NOW())");
                $stmt->execute([$conversationId, $senderId, $message]);
            }
            $id = (int) $db->lastInsertId();
            [$extraCols, $extraVals] = ChatMessageSocialHelper::insertExtraColumns(
                $db,
                $replyToMessageId > 0 ? $replyToMessageId : null,
                $forwardedFromMessageId > 0 ? $forwardedFromMessageId : null
            );
            if ($extraCols !== []) {
                $setParts = array_map(static fn (string $c): string => '`' . str_replace('`', '``', $c) . '` = ?', $extraCols);
                $extraVals[] = $id;
                $db->prepare('UPDATE chat SET ' . implode(', ', $setParts) . ' WHERE id = ?')->execute($extraVals);
            }
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
                DeferredHttpTask::runAfterResponse(static function () use ($sf, $rf, $mf, $cf): void {
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
            if ($hasAttachCols && $attachmentPath !== null) {
                $out['attachment_name'] = $attachmentName;
                $out['attachment_mime'] = $attachmentMime;
                $out['attachment_size'] = $attachmentSize;
                $out['has_attachment'] = true;
            }
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

            // Realtime Socket.IO: kirim receive_message ke anggota conversation (tanpa lewat Node saveMessage).
            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([$conversationId]);
            $notifyUserIds = array_values(array_filter(
                array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []),
                static fn (int $x): bool => $x > 0
            ));
            $payloadForLive = [
                'id' => $id,
                'conversation_id' => $conversationId,
                'sender_id' => $senderId,
                'from_user_id' => (string) $senderId,
                'to_user_id' => $recipientId > 0 ? (string) $recipientId : '0',
                'message' => $message,
                'created_at' => $tanggalDibuat,
            ];
            if ($hasAttachCols && $attachmentPath !== null) {
                $payloadForLive['attachment_name'] = $attachmentName;
                $payloadForLive['attachment_mime'] = $attachmentMime;
                $payloadForLive['attachment_size'] = $attachmentSize;
                $payloadForLive['has_attachment'] = true;
            }
            if (isset($out['sender_username'])) {
                $payloadForLive['sender_username'] = $out['sender_username'];
            }
            if (isset($out['sender_display_name'])) {
                $payloadForLive['sender_display_name'] = $out['sender_display_name'];
            }
            $enriched = ChatMessageSocialHelper::enrichMessageList($db, [
                [
                    'id' => $id,
                    'message' => $message,
                    'sender_id' => $senderId,
                    'conversation_id' => $conversationId,
                    'created_at' => $tanggalDibuat,
                ],
            ], $senderId);
            if ($enriched !== []) {
                foreach (['reply_preview', 'forward_from', 'reaction_summary'] as $ek) {
                    if (isset($enriched[0][$ek])) {
                        $out[$ek] = $enriched[0][$ek];
                        $payloadForLive[$ek] = $enriched[0][$ek];
                    }
                }
            }
            // Langsung kirim (bukan register_shutdown): di beberapa setup FPM shutdown tidak sempat
            // memanggil live server, sehingga lawan tidak dapat receive_message.
            if ($notifyUserIds !== []) {
                LiveChatMessageNotifier::emit($notifyUserIds, $payloadForLive);
            }

            if ($this->tableHasColumn($db, 'chat___member', 'draft_text')) {
                $db->prepare('UPDATE chat___member SET draft_text = NULL, draft_updated_at = NULL WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $senderId]);
                LiveChatBroadcastHelper::emit('chat_draft_updated', [$senderId], [
                    'conversation_id' => $conversationId,
                    'draft_text' => null,
                    'draft_updated_at' => null,
                ]);
            }

            return $this->json($response, $out);
        } catch (\Throwable $e) {
            error_log('UserChatController::sendMessageAuth ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** POST /api/chat/conversations/{id}/delivered — tandai pesan sampai ke perangkat ini */
    public function markConversationDelivered(Request $request, Response $response, array $args): Response
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
            if (!$this->tableHasColumn($db, 'chat___member', 'delivered_at')) {
                error_log('UserChatController::markConversationDelivered skipped: chat___member.delivered_at missing (run migration 20260507120100)');

                return $this->json($response, ['success' => true, 'message' => 'No-op']);
            }
            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$conversationId, $myUserId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota'], 403);
            }
            $db->prepare('UPDATE chat___member SET delivered_at = NOW() WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $myUserId]);

            $others = $this->getConversationMemberUserIds($db, $conversationId);
            $others = array_values(array_filter($others, static fn (int $id) => $id !== $myUserId));
            if ($others !== []) {
                LiveChatBroadcastHelper::emit('chat_receipt', $others, [
                    'conversation_id' => $conversationId,
                    'kind' => 'delivered',
                    'user_id' => $myUserId,
                    'at' => date('c'),
                ]);
            }

            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('UserChatController::markConversationDelivered ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** GET /api/chat/messages/{id}/receipts */
    public function getMessageReceipts(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $messageId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($messageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $stmt = $db->prepare('SELECT id, conversation_id, sender_id, tanggal_dibuat FROM chat WHERE id = ? LIMIT 1');
            $stmt->execute([$messageId]);
            $msg = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$msg) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            $convId = (int) $msg['conversation_id'];
            $senderId = (int) $msg['sender_id'];
            if ($senderId !== $myUserId) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya untuk pesan Anda'], 403);
            }
            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$convId, $myUserId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota'], 403);
            }

            $hasDelivered = $this->tableHasColumn($db, 'chat___member', 'delivered_at');
            $cols = 'm.user_id, m.last_read_at' . ($hasDelivered ? ', m.delivered_at' : '');
            $stmt = $db->prepare("SELECT {$cols}, u.username, p.nama AS nama_pengurus FROM chat___member m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN pengurus p ON p.id_user = u.id WHERE m.conversation_id = ? AND m.user_id != ?");
            $stmt->execute([$convId, $myUserId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $msgTs = strtotime((string) $msg['tanggal_dibuat']) ?: 0;
            $delivered = [];
            $read = [];
            foreach ($rows as $row) {
                $uid = (int) ($row['user_id'] ?? 0);
                if ($uid < 1) {
                    continue;
                }
                $username = trim((string) ($row['username'] ?? ''));
                $namaP = isset($row['nama_pengurus']) && trim((string) $row['nama_pengurus']) !== '' ? trim((string) $row['nama_pengurus']) : null;
                $displayName = $this->formatNamaUsername($namaP, $username, $uid);
                $dr = $hasDelivered && !empty($row['delivered_at']) ? strtotime((string) $row['delivered_at']) : false;
                $lr = !empty($row['last_read_at']) ? strtotime((string) $row['last_read_at']) : false;
                if ($hasDelivered && $dr !== false && $dr >= $msgTs) {
                    $delivered[] = ['user_id' => $uid, 'display_name' => $displayName, 'at' => $row['delivered_at']];
                }
                if ($lr !== false && $lr >= $msgTs) {
                    $read[] = ['user_id' => $uid, 'display_name' => $displayName, 'at' => $row['last_read_at']];
                }
            }

            return $this->json($response, [
                'success' => true,
                'message_id' => $messageId,
                'conversation_id' => $convId,
                'delivered' => $delivered,
                'read' => $read,
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::getMessageReceipts ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** GET /api/chat/messages/{id}/attachment */
    public function getMessageAttachment(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $messageId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($messageId < 1) {
            return $response->withStatus(404);
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $response->withStatus(401);
            }
            $stmt = $db->prepare('SELECT conversation_id, attachment_path, attachment_name, attachment_mime FROM chat WHERE id = ? LIMIT 1');
            try {
                $stmt->execute([$messageId]);
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (stripos($msg, 'attachment_') !== false || stripos($msg, 'Unknown column') !== false) {
                    return $response->withStatus(404);
                }
                throw $e;
            }
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['attachment_path'])) {
                return $response->withStatus(404);
            }
            $convId = (int) ($row['conversation_id'] ?? 0);
            $stmtMem = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmtMem->execute([$convId, $myUserId]);
            if (!$stmtMem->fetch()) {
                return $response->withStatus(403);
            }
            $pathRel = trim((string) $row['attachment_path']);
            $full = $this->resolveUploadFilePath($pathRel);
            if (!is_file($full)) {
                return $response->withStatus(404);
            }
            $size = @filesize($full);
            if ($size === false || $size < 1 || $size > self::CHAT_ATTACHMENT_MAX_BYTES) {
                return $response->withStatus(404);
            }
            $fh = @fopen($full, 'rb');
            if ($fh === false) {
                return $response->withStatus(404);
            }
            $mime = trim((string) ($row['attachment_mime'] ?? 'application/octet-stream'));
            if ($mime === '') {
                $mime = 'application/octet-stream';
            }
            $filename = $this->sanitizeAttachmentName((string) ($row['attachment_name'] ?? ('file_' . $messageId)));
            return $response
                ->withStatus(200)
                ->withBody(Stream::create($fh))
                ->withHeader('Content-Type', $mime)
                ->withHeader('Content-Length', (string) $size)
                ->withHeader('Content-Disposition', 'inline; filename="' . addslashes($filename) . '"');
        } catch (\Throwable $e) {
            error_log('UserChatController::getMessageAttachment ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /** GET /api/chat/conversations/{id}/search */
    public function searchConversationMessages(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $params = $request->getQueryParams();
        $q = isset($params['q']) ? trim((string) $params['q']) : '';
        $limit = min(max(1, (int) ($params['limit'] ?? 30)), 100);
        $beforeId = isset($params['before_id']) ? (int) $params['before_id'] : 0;
        if ($conversationId < 1 || $q === '') {
            return $this->json($response, ['success' => false, 'message' => 'Parameter tidak valid'], 400);
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
                return $this->json($response, ['success' => false, 'message' => 'Bukan anggota'], 403);
            }

            $delClause = $this->tableHasColumn($db, 'chat', 'deleted_at') ? ' AND deleted_at IS NULL' : '';
            $sql = 'SELECT id, sender_id, message, tanggal_dibuat FROM chat WHERE conversation_id = ? AND message LIKE ?' . $delClause;
            $bind = [$conversationId, '%' . $q . '%'];
            if ($beforeId > 0) {
                $sql .= ' AND id < ?';
                $bind[] = $beforeId;
            }
            $sql .= ' ORDER BY id DESC LIMIT ' . $limit;
            $stmt = $db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $list = [];
            foreach ($rows as $r) {
                $list[] = [
                    'id' => (int) $r['id'],
                    'sender_id' => (int) $r['sender_id'],
                    'message' => $r['message'],
                    'tanggal_dibuat' => $r['tanggal_dibuat'],
                    'created_at' => $r['tanggal_dibuat'],
                ];
            }

            return $this->json($response, ['success' => true, 'data' => $list]);
        } catch (\Throwable $e) {
            error_log('UserChatController::searchConversationMessages ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** POST /api/chat/conversations/{id}/archive */
    public function archiveConversation(Request $request, Response $response, array $args): Response
    {
        return $this->setConversationArchived($request, $response, $args, true);
    }

    /** DELETE /api/chat/conversations/{id}/archive */
    public function unarchiveConversation(Request $request, Response $response, array $args): Response
    {
        return $this->setConversationArchived($request, $response, $args, false);
    }

    private function setConversationArchived(Request $request, Response $response, array $args, bool $archive): Response
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
            $stmt = $db->prepare('SELECT 1 FROM chat___member WHERE conversation_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$conversationId, $myUserId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Percakapan tidak ditemukan'], 404);
            }
            try {
                if ($archive) {
                    $db->prepare('UPDATE chat___member SET archived_at = NOW() WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $myUserId]);
                } else {
                    $db->prepare('UPDATE chat___member SET archived_at = NULL WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $myUserId]);
                }
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (stripos($msg, 'archived_at') !== false || stripos($msg, 'Unknown column') !== false) {
                    return $this->json($response, ['success' => false, 'message' => 'Kolom archived_at belum ada. Jalankan migrasi chat terbaru.'], 400);
                }
                throw $e;
            }

            return $this->json($response, ['success' => true, 'is_archived' => $archive]);
        } catch (\Throwable $e) {
            error_log('UserChatController::setConversationArchived ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** PUT /api/chat/conversations/{id}/draft */
    public function setConversationDraft(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $conversationId = isset($args['id']) ? (int) $args['id'] : 0;
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        $text = isset($body['text']) ? (string) $body['text'] : '';
        if ($conversationId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
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
            $trim = trim($text);
            try {
                if ($trim === '') {
                    $db->prepare('UPDATE chat___member SET draft_text = NULL, draft_updated_at = NULL WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $myUserId]);
                } else {
                    $db->prepare('UPDATE chat___member SET draft_text = ?, draft_updated_at = NOW() WHERE conversation_id = ? AND user_id = ?')->execute([mb_substr($trim, 0, 8000), $conversationId, $myUserId]);
                }
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (stripos($msg, 'draft_text') !== false || stripos($msg, 'draft_updated_at') !== false || stripos($msg, 'Unknown column') !== false) {
                    return $this->json($response, ['success' => false, 'message' => 'Kolom draft chat belum ada. Jalankan migrasi chat terbaru.'], 400);
                }
                throw $e;
            }
            LiveChatBroadcastHelper::emit('chat_draft_updated', [$myUserId], [
                'conversation_id' => $conversationId,
                'draft_text' => $trim === '' ? null : mb_substr($trim, 0, 8000),
                'draft_updated_at' => $trim === '' ? null : date('c'),
            ]);

            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('UserChatController::setConversationDraft ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /** PUT /api/chat/me/privacy */
    public function putMyChatPrivacy(Request $request, Response $response): Response
    {
        $payload = $request->getAttribute('user');
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true) ?? [];
        }
        try {
            $db = Database::getInstance()->getConnection();
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            if (!$this->tableHasColumn($db, 'users', 'privacy_show_last_seen')) {
                return $this->json($response, ['success' => false, 'message' => 'Privasi belum didukung'], 400);
            }
            $showSeen = array_key_exists('show_last_seen', $body) ? (filter_var($body['show_last_seen'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0) : null;
            $showRead = array_key_exists('show_read_receipt', $body) ? (filter_var($body['show_read_receipt'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0) : null;
            if ($showSeen === null && $showRead === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada field yang diubah'], 400);
            }
            if ($showSeen !== null && $showRead !== null) {
                $db->prepare('UPDATE users SET privacy_show_last_seen = ?, privacy_show_read_receipt = ? WHERE id = ?')->execute([$showSeen, $showRead, $myUserId]);
            } elseif ($showSeen !== null) {
                $db->prepare('UPDATE users SET privacy_show_last_seen = ? WHERE id = ?')->execute([$showSeen, $myUserId]);
            } else {
                $db->prepare('UPDATE users SET privacy_show_read_receipt = ? WHERE id = ?')->execute([$showRead, $myUserId]);
            }

            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('UserChatController::putMyChatPrivacy ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * POST /api/chat/messages/{id}/reactions — toggle suka (love) pada pesan.
     */
    public function toggleMessageReaction(Request $request, Response $response, array $args): Response
    {
        $payload = $request->getAttribute('user');
        $messageId = isset($args['id']) ? (int) $args['id'] : 0;
        if ($messageId < 1) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        try {
            $db = Database::getInstance()->getConnection();
            if (!ChatMessageSocialHelper::hasReactionTable($db)) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur reaksi belum aktif'], 400);
            }
            $myUserId = $this->getMyUserIdFromPayload($db, $payload);
            if ($myUserId === null || $myUserId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $src = ChatMessageSocialHelper::loadMessageIfMember($db, $messageId, $myUserId);
            if ($src === null) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan'], 404);
            }
            $convId = (int) ($src['conversation_id'] ?? 0);
            $stmt = $db->prepare(
                'SELECT id FROM chat___message_reaction WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1'
            );
            $stmt->execute([$messageId, $myUserId, 'love']);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($existing) {
                $db->prepare('DELETE FROM chat___message_reaction WHERE id = ?')->execute([(int) $existing['id']]);
                $myLoved = false;
            } else {
                $db->prepare(
                    'INSERT INTO chat___message_reaction (message_id, user_id, emoji) VALUES (?, ?, ?)'
                )->execute([$messageId, $myUserId, 'love']);
                $myLoved = true;
            }
            $stmtCnt = $db->prepare(
                'SELECT COUNT(*) FROM chat___message_reaction WHERE message_id = ? AND emoji = ?'
            );
            $stmtCnt->execute([$messageId, 'love']);
            $loveCount = (int) $stmtCnt->fetchColumn();
            $stmtM = $db->prepare('SELECT user_id FROM chat___member WHERE conversation_id = ?');
            $stmtM->execute([$convId]);
            $memberIds = array_values(array_filter(
                array_map('intval', $stmtM->fetchAll(\PDO::FETCH_COLUMN) ?: []),
                static fn (int $x): bool => $x > 0
            ));
            if ($memberIds !== []) {
                LiveChatBroadcastHelper::emit('chat_reaction', $memberIds, [
                    'conversation_id' => $convId,
                    'message_id' => $messageId,
                    'emoji' => 'love',
                    'love_count' => $loveCount,
                    'user_id' => $myUserId,
                    'my_loved' => $myLoved,
                ]);
            }
            return $this->json($response, [
                'success' => true,
                'message_id' => $messageId,
                'love_count' => $loveCount,
                'my_loved' => $myLoved,
                'reaction_summary' => ['love_count' => $loveCount, 'my_loved' => $myLoved],
            ]);
        } catch (\Throwable $e) {
            error_log('UserChatController::toggleMessageReaction ' . $e->getMessage());
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
            if ($this->tableHasColumn($db, 'users', 'last_seen_at')) {
                $stmt = $db->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?');
                $stmt->execute([$usersId]);
            }
            $response->getBody()->write(json_encode(['success' => true], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        } catch (\Throwable $e) {
            error_log('UserChatController::updatePresence ' . $e->getMessage());
            // Presence opsional — jangan gagalkan socket connect di production skema lama
            $response->getBody()->write(json_encode(['success' => true, 'skipped' => true], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
    }
}
