<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Reply, forward, dan reaksi (suka) pada pesan chat.
 */
final class ChatMessageSocialHelper
{
    public static function hasReplyColumn(PDO $db): bool
    {
        return self::columnExists($db, 'chat', 'reply_to_message_id');
    }

    public static function hasForwardColumn(PDO $db): bool
    {
        return self::columnExists($db, 'chat', 'forwarded_from_message_id');
    }

    public static function hasReactionTable(PDO $db): bool
    {
        try {
            $stmt = $db->query("SHOW TABLES LIKE 'chat___message_reaction'");

            return (bool) $stmt->fetch(PDO::FETCH_NUM);
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function columnExists(PDO $db, string $table, string $column): bool
    {
        try {
            $stmt = $db->prepare('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '` LIKE ?');
            $stmt->execute([$column]);

            return (bool) $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array<string, mixed>|null baris chat sumber
     */
    public static function loadMessageIfMember(PDO $db, int $messageId, int $userId): ?array
    {
        if ($messageId < 1 || $userId < 1) {
            return null;
        }
        $stmt = $db->prepare(
            'SELECT ch.* FROM chat ch
             INNER JOIN chat___member m ON m.conversation_id = ch.conversation_id AND m.user_id = ?
             WHERE ch.id = ? LIMIT 1'
        );
        $stmt->execute([$userId, $messageId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row === false ? null : $row;
    }

    public static function displayNameForUser(PDO $db, int $userId): string
    {
        $stmt = $db->prepare(
            'SELECT u.username, p.nama AS nama_pengurus FROM users u
             LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $uRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $namaP = isset($uRow['nama_pengurus']) && trim((string) $uRow['nama_pengurus']) !== ''
            ? trim((string) $uRow['nama_pengurus'])
            : null;
        $username = trim((string) ($uRow['username'] ?? ''));

        if ($namaP !== null && $username !== '') {
            return $namaP . ' @' . $username;
        }
        if ($namaP !== null) {
            return $namaP;
        }
        if ($username !== '') {
            return '@' . $username;
        }

        return 'User ' . $userId;
    }

    private static function snippet(string $message, ?string $attachmentName, int $max = 120): string
    {
        $t = trim($message);
        if ($t === '' && $attachmentName !== null && trim($attachmentName) !== '') {
            return '[File] ' . trim($attachmentName);
        }
        if (mb_strlen($t) > $max) {
            return mb_substr($t, 0, $max - 1) . '…';
        }

        return $t;
    }

    /**
     * @param list<array<string, mixed>> $list
     * @return list<array<string, mixed>>
     */
    public static function enrichMessageList(PDO $db, array $list, int $myUserId): array
    {
        if ($list === []) {
            return $list;
        }
        $ids = [];
        foreach ($list as $row) {
            $mid = (int) ($row['id'] ?? 0);
            if ($mid > 0) {
                $ids[] = $mid;
            }
        }
        $ids = array_values(array_unique($ids));
        if ($ids === []) {
            return $list;
        }

        $replyMap = [];
        $forwardMap = [];
        $reactionMap = [];

        if (self::hasReplyColumn($db)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare(
                "SELECT ch.id, ch.reply_to_message_id FROM chat ch WHERE ch.id IN ({$ph}) AND ch.reply_to_message_id IS NOT NULL"
            );
            $stmt->execute($ids);
            $replyIds = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $rid = (int) ($r['reply_to_message_id'] ?? 0);
                if ($rid > 0) {
                    $replyIds[] = $rid;
                    $replyMap[(int) $r['id']] = $rid;
                }
            }
            $replyPreview = self::loadPreviewByIds($db, array_values(array_unique($replyIds)));
        } else {
            $replyPreview = [];
        }

        if (self::hasForwardColumn($db)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare(
                "SELECT ch.id, ch.forwarded_from_message_id FROM chat ch WHERE ch.id IN ({$ph}) AND ch.forwarded_from_message_id IS NOT NULL"
            );
            $stmt->execute($ids);
            $fwdIds = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $fid = (int) ($r['forwarded_from_message_id'] ?? 0);
                if ($fid > 0) {
                    $fwdIds[] = $fid;
                    $forwardMap[(int) $r['id']] = $fid;
                }
            }
            $forwardSource = self::loadPreviewByIds($db, array_values(array_unique($fwdIds)));
        } else {
            $forwardSource = [];
        }

        if (self::hasReactionTable($db)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare(
                "SELECT message_id, emoji, COUNT(*) AS cnt,
                        SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
                 FROM chat___message_reaction WHERE message_id IN ({$ph}) GROUP BY message_id, emoji"
            );
            $stmt->execute(array_merge([$myUserId], $ids));
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $mid = (int) ($r['message_id'] ?? 0);
                if ($mid < 1) {
                    continue;
                }
                if (!isset($reactionMap[$mid])) {
                    $reactionMap[$mid] = ['love_count' => 0, 'my_loved' => false];
                }
                if (($r['emoji'] ?? '') === 'love') {
                    $reactionMap[$mid]['love_count'] = (int) ($r['cnt'] ?? 0);
                    $reactionMap[$mid]['my_loved'] = ((int) ($r['mine'] ?? 0)) > 0;
                }
            }
        }

        foreach ($list as &$item) {
            $mid = (int) ($item['id'] ?? 0);
            if ($mid < 1) {
                continue;
            }
            if (isset($replyMap[$mid], $replyPreview[$replyMap[$mid]])) {
                $item['reply_preview'] = $replyPreview[$replyMap[$mid]];
            }
            if (isset($forwardMap[$mid], $forwardSource[$forwardMap[$mid]])) {
                $src = $forwardSource[$forwardMap[$mid]];
                $item['forward_from'] = [
                    'message_id' => (int) ($src['id'] ?? $forwardMap[$mid]),
                    'sender_display_name' => (string) ($src['sender_display_name'] ?? ''),
                    'message' => (string) ($src['message'] ?? ''),
                    'has_attachment' => !empty($src['has_attachment']),
                    'attachment_name' => $src['attachment_name'] ?? null,
                ];
            }
            if (isset($reactionMap[$mid])) {
                $item['reaction_summary'] = $reactionMap[$mid];
            }
        }
        unset($item);

        return $list;
    }

    /**
     * @param list<int> $ids
     * @return array<int, array<string, mixed>>
     */
    private static function loadPreviewByIds(PDO $db, array $ids): array
    {
        $ids = array_values(array_filter(array_unique(array_map('intval', $ids)), static fn (int $x) => $x > 0));
        if ($ids === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare(
            "SELECT ch.id, ch.sender_id, ch.message, ch.attachment_name, ch.deleted_at,
                    u.username AS sender_username, p.nama AS sender_nama_pengurus
             FROM chat ch
             LEFT JOIN users u ON u.id = ch.sender_id
             LEFT JOIN pengurus p ON p.id_user = u.id
             WHERE ch.id IN ({$ph})"
        );
        $stmt->execute($ids);
        $out = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $mid = (int) ($r['id'] ?? 0);
            if ($mid < 1) {
                continue;
            }
            $senderId = (int) ($r['sender_id'] ?? 0);
            $uName = trim((string) ($r['sender_username'] ?? ''));
            $namaP = isset($r['sender_nama_pengurus']) && trim((string) $r['sender_nama_pengurus']) !== ''
                ? trim((string) $r['sender_nama_pengurus'])
                : null;
            $display = self::displayNameForUser($db, $senderId);
            if ($namaP !== null && $uName !== '') {
                $display = $namaP . ' @' . $uName;
            } elseif ($namaP !== null) {
                $display = $namaP;
            } elseif ($uName !== '') {
                $display = '@' . $uName;
            }
            $body = trim((string) ($r['message'] ?? ''));
            if (!empty($r['deleted_at'])) {
                $body = '';
            }
            $att = isset($r['attachment_name']) ? (string) $r['attachment_name'] : null;
            $out[$mid] = [
                'id' => $mid,
                'sender_id' => $senderId,
                'sender_display_name' => $display,
                'message' => self::snippet($body, $att),
                'has_attachment' => $att !== null && $att !== '',
                'attachment_name' => $att,
            ];
        }

        return $out;
    }

    /**
     * @return array{0: list<string>, 1: list<int|string>}
     */
    public static function insertExtraColumns(
        PDO $db,
        ?int $replyToMessageId,
        ?int $forwardedFromMessageId
    ): array {
        $cols = [];
        $vals = [];
        if (self::hasReplyColumn($db) && $replyToMessageId !== null && $replyToMessageId > 0) {
            $cols[] = 'reply_to_message_id';
            $vals[] = $replyToMessageId;
        }
        if (self::hasForwardColumn($db) && $forwardedFromMessageId !== null && $forwardedFromMessageId > 0) {
            $cols[] = 'forwarded_from_message_id';
            $vals[] = $forwardedFromMessageId;
        }

        return [$cols, $vals];
    }

    public static function enrichOutgoingPayload(PDO $db, array $payload, int $messageId, int $myUserId): array
    {
        $rows = self::enrichMessageList($db, [['id' => $messageId] + $payload], $myUserId);
        if ($rows === []) {
            return $payload;
        }

        return array_merge($payload, $rows[0]);
    }
}
