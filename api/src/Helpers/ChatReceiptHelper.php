<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Hybrid receipt: bandingkan tanggal pesan dengan delivered_at / last_read_at per anggota (bukan per-baris pesan).
 */
final class ChatReceiptHelper
{
    /**
     * @param array<int, array{user_id:int, last_read_at:?string, delivered_at:?string}> $membersAll semua baris chat___member untuk conversation
     * @return array{status:string, delivered_count:int, read_count:int, recipient_count:int}
     */
    public static function statusForOwnMessage(
        string $messageCreatedAt,
        int $senderId,
        string $convType,
        array $membersAll
    ): array {
        $msgTs = strtotime($messageCreatedAt) ?: 0;
        $others = [];
        foreach ($membersAll as $m) {
            $uid = (int) ($m['user_id'] ?? 0);
            if ($uid > 0 && $uid !== $senderId) {
                $others[] = $m;
            }
        }
        $recipientCount = count($others);
        if ($recipientCount === 0) {
            return ['status' => 'read', 'delivered_count' => 0, 'read_count' => 0, 'recipient_count' => 0];
        }

        $delivered = 0;
        $read = 0;
        foreach ($others as $m) {
            $dr = isset($m['delivered_at']) && $m['delivered_at'] !== null ? strtotime((string) $m['delivered_at']) : false;
            $lr = isset($m['last_read_at']) && $m['last_read_at'] !== null ? strtotime((string) $m['last_read_at']) : false;
            if ($dr !== false && $dr >= $msgTs) {
                $delivered++;
            }
            if ($lr !== false && $lr >= $msgTs) {
                $read++;
            }
        }

        $status = 'sent';
        if ($delivered >= $recipientCount) {
            $status = 'delivered';
        }
        if ($read >= $recipientCount) {
            $status = 'read';
        }

        return [
            'status' => $status,
            'delivered_count' => $delivered,
            'read_count' => $read,
            'recipient_count' => $recipientCount,
        ];
    }
}
