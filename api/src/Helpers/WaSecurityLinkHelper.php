<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Database;
use App\Services\WhatsAppService;

/**
 * Link keamanan WA (setup akun / password baru): TTL, edit pesan (ganti URL saja).
 */
final class WaSecurityLinkHelper
{
    /** Masa aktif link setup username/password & buat password baru. */
    public const LINK_TTL_MINUTES = 10;

    public const LABEL_DIPAKAI = '> token sudah dipakai.';
    public const LABEL_KADALUARSA = '> Token sudah kadaluarsa';

    public static function labelForReason(string $reason): string
    {
        return $reason === 'dipakai' ? self::LABEL_DIPAKAI : self::LABEL_KADALUARSA;
    }

    /**
     * Ganti URL http(s) pertama dengan label; isi pesan lain tetap.
     */
    public static function replaceSecurityUrlInBody(string $body, string $reason): string
    {
        $label = self::labelForReason($reason);
        $count = 0;
        $next = preg_replace('#https?://[^\s<>"\']+#u', $label, $body, 1, $count);
        if (is_string($next) && $count > 0) {
            return $next;
        }

        return $label;
    }

    /**
     * Edit pesan WA: ganti link jadi label (dipakai / kadaluarsa). Sisanya tetap.
     * Fallback: judul + label bila isi asli tidak ditemukan.
     */
    public static function editMessageInvalidated(
        string $nomorTujuan,
        string $waMessageId,
        string $reason,
        string $judulFallback = ''
    ): void {
        $nomor = WhatsAppService::formatPhoneNumber($nomorTujuan);
        $waMessageId = trim($waMessageId);
        if (strlen($nomor) < 10 || $waMessageId === '') {
            return;
        }

        $newBody = null;
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare(
                "SELECT isi_pesan FROM whatsapp WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL) LIMIT 1"
            );
            $stmt->execute([$waMessageId]);
            $isi = trim((string) ($stmt->fetchColumn() ?: ''));
            if ($isi !== '') {
                $newBody = self::replaceSecurityUrlInBody($isi, $reason);
            }
        } catch (\Throwable $e) {
            error_log('WaSecurityLinkHelper::editMessageInvalidated load: ' . $e->getMessage());
        }

        if ($newBody === null || $newBody === '') {
            $label = self::labelForReason($reason);
            $newBody = $judulFallback !== '' ? trim($judulFallback) . "\n\n" . $label : $label;
        }

        try {
            $result = WhatsAppService::editMessage($nomor, $waMessageId, $newBody);
            if (!$result['success']) {
                error_log('WaSecurityLinkHelper::editMessageInvalidated: ' . ($result['message'] ?? 'edit gagal'));
                return;
            }
            try {
                $db = Database::getInstance()->getConnection();
                $db->prepare(
                    "UPDATE whatsapp SET isi_pesan = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)"
                )->execute([$newBody, $waMessageId]);
            } catch (\Throwable $e) {
            }
        } catch (\Throwable $e) {
            error_log('WaSecurityLinkHelper::editMessageInvalidated: ' . $e->getMessage());
        }
    }

    /**
     * Token setup/reset sudah lewat expires_at: edit WA (ganti link) lalu kosongkan wa_message_id.
     *
     * @return int jumlah yang diproses
     */
    public static function sweepExpiredLinkMessages(?\PDO $db = null): int
    {
        $db = $db ?? Database::getInstance()->getConnection();
        $n = 0;

        try {
            if ($db->query("SHOW TABLES LIKE 'user___setup_tokens'")->rowCount() > 0
                && $db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'wa_message_id'")->rowCount() > 0) {
                $stmt = $db->query(
                    "SELECT id, wa_message_id, no_wa FROM user___setup_tokens
                     WHERE wa_message_id IS NOT NULL AND wa_message_id != ''
                       AND no_wa IS NOT NULL AND no_wa != ''
                       AND expires_at <= NOW()
                     LIMIT 40"
                );
                foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    self::editMessageInvalidated(
                        (string) $row['no_wa'],
                        (string) $row['wa_message_id'],
                        'kadaluarsa'
                    );
                    $db->prepare('UPDATE user___setup_tokens SET wa_message_id = NULL WHERE id = ?')
                        ->execute([(int) $row['id']]);
                    $n++;
                }
            }
        } catch (\Throwable $e) {
            error_log('WaSecurityLinkHelper::sweepExpired setup: ' . $e->getMessage());
        }

        try {
            if ($db->query("SHOW TABLES LIKE 'user___password_reset_tokens'")->rowCount() > 0
                && $db->query("SHOW COLUMNS FROM user___password_reset_tokens LIKE 'wa_message_id'")->rowCount() > 0) {
                $stmt = $db->query(
                    "SELECT id, wa_message_id, nomor_tujuan FROM user___password_reset_tokens
                     WHERE wa_message_id IS NOT NULL AND wa_message_id != ''
                       AND nomor_tujuan IS NOT NULL AND nomor_tujuan != ''
                       AND used_at IS NULL
                       AND expires_at <= NOW()
                     LIMIT 40"
                );
                foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    self::editMessageInvalidated(
                        (string) $row['nomor_tujuan'],
                        (string) $row['wa_message_id'],
                        'kadaluarsa'
                    );
                    $db->prepare(
                        'UPDATE user___password_reset_tokens SET wa_message_id = NULL, nomor_tujuan = NULL WHERE id = ?'
                    )->execute([(int) $row['id']]);
                    $n++;
                }
            }
        } catch (\Throwable $e) {
            error_log('WaSecurityLinkHelper::sweepExpired reset: ' . $e->getMessage());
        }

        return $n;
    }
}
