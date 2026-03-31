<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Flow aktivasi daftar eBeddien lewat WA (pesan template dari wa.me ke nomor QR).
 * 1) User kirim template berisi Token → simpan pending + minta konfirmasi simpan nomor.
 * 2) Jawaban "iya" → kirim link setup-akun (token masih valid sesuai expires_at di DB).
 */
class EbeddienDaftarWaFlow
{
    private const TRIGGER = 'aktifkan akun ebeddien';

    private const MSG_SIMPAN_NOMOR = "Sebelum melanjutkan dimohon untuk menyimpan nomor ini. Apakah Anda sudah menyimpannya?\n[iya/belum]";

    private static function normalizeIncomingNumber(string $nomor, ?string $fromJid): string
    {
        $digits = preg_replace('/\D/', '', trim($nomor)) ?? '';
        $isLid = is_string($fromJid) && preg_match('/@lid$/i', trim($fromJid)) === 1;
        if ($isLid && $digits !== '') {
            return $digits;
        }
        return WhatsAppService::formatPhoneNumber($nomor);
    }

    /**
     * @return string|null Teks balasan atau null jika bukan flow ini
     */
    public static function handle(string $nomor, string $message, ?string $fromJid = null): ?string
    {
        $fromJid = $fromJid !== null && $fromJid !== '' ? trim($fromJid) : null;
        $nomor = self::normalizeIncomingNumber($nomor, $fromJid);
        if (strlen($nomor) < 8) {
            return null;
        }

        $db = Database::getInstance()->getConnection();
        if ($db->query("SHOW TABLES LIKE 'ebeddien_daftar_wa_pending'")->rowCount() === 0) {
            return null;
        }

        $messageTrim = trim($message);
        $hasFromJidCol = self::tableHasColumn($db, 'ebeddien_daftar_wa_pending', 'from_jid');

        $row = false;
        $selectCols = $hasFromJidCol ? 'nomor, step, token_plain, from_jid' : 'nomor, step, token_plain';
        if ($hasFromJidCol && $fromJid !== null) {
            $stmt = $db->prepare('SELECT ' . $selectCols . ' FROM ebeddien_daftar_wa_pending WHERE from_jid = ? LIMIT 1');
            $stmt->execute([$fromJid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        }
        if ($row === false && $nomor !== '') {
            $stmt = $db->prepare('SELECT ' . $selectCols . ' FROM ebeddien_daftar_wa_pending WHERE nomor = ? LIMIT 1');
            $stmt->execute([$nomor]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        }

        if ($row !== false) {
            $pendingNomor = trim((string) ($row['nomor'] ?? ''));
            $tokenPlain = trim((string) ($row['token_plain'] ?? ''));
            $step = (int) ($row['step'] ?? 1);
            if ($pendingNomor === '' || strlen($tokenPlain) !== 64) {
                return null;
            }
            if ($step !== 1) {
                return null;
            }

            if (self::isJawabanYa($messageTrim)) {
                if (!self::setupTokenStillValid($db, $tokenPlain)) {
                    $stmtDel = $db->prepare('DELETE FROM ebeddien_daftar_wa_pending WHERE nomor = ?');
                    $stmtDel->execute([$pendingNomor]);
                    return "Token aktivasi sudah tidak berlaku. Silakan buka aplikasi eBeddien, isi ulang formulir daftar, dan minta token baru.";
                }
                $link = self::buildSetupUrl($tokenPlain);
                $stmtDel = $db->prepare('DELETE FROM ebeddien_daftar_wa_pending WHERE nomor = ?');
                $stmtDel->execute([$pendingNomor]);
                return "Silakan buka link berikut untuk mengatur username dan password (berlaku sesuai waktu di server):\n" . $link . "\n\nJangan bagikan link ini kepada siapa pun.";
            }

            if (self::isJawabanBelum($messageTrim)) {
                return self::MSG_SIMPAN_NOMOR;
            }

            return self::MSG_SIMPAN_NOMOR;
        }

        if (stripos($messageTrim, self::TRIGGER) === false) {
            return null;
        }

        if (!preg_match('/Token\s*:\s*([a-fA-F0-9]{64})/u', $messageTrim, $tm)) {
            error_log('EbeddienDaftarWaFlow: trigger tanpa token 64 hex');
            return "Format tidak lengkap. Pastikan baris Token berisi kode 64 karakter persis seperti di aplikasi.";
        }
        $plainToken = strtolower($tm[1]);
        if (!self::setupTokenStillValid($db, $plainToken)) {
            return "Token tidak valid atau sudah kedaluwarsa. Silakan kembali ke aplikasi eBeddien dan ulangi langkah daftar.";
        }

        $nama = null;
        $nikLine = null;
        $nomorLine = null;
        $lines = preg_split('/\r?\n/', $messageTrim, -1, PREG_SPLIT_NO_EMPTY);
        foreach ($lines as $line) {
            $line = trim($line);
            if (preg_match('/^Nama\s*:\s*(.+)$/iu', $line, $m)) {
                $nama = trim($m[1]);
            }
            if (preg_match('/^NIK\s*:\s*(.+)$/iu', $line, $m)) {
                $nikLine = trim($m[1]);
            }
            if (preg_match('/^Nomor\s*:\s*(.+)$/iu', $line, $m)) {
                $nomorLine = trim($m[1]);
            }
        }

        $nomorKontak = $nomorLine !== null && $nomorLine !== ''
            ? WhatsAppService::formatPhoneNumber($nomorLine)
            : $nomor;
        if (strlen($nomorKontak) >= 10) {
            $namaKontak = ($nama !== null && $nama !== '') ? $nama : 'Daftar eBeddien';
            WhatsAppService::ensureKontak($nomorKontak, 0, $namaKontak);
        }

        if ($hasFromJidCol && $fromJid !== null) {
            $stmtIns = $db->prepare('INSERT INTO ebeddien_daftar_wa_pending (nomor, from_jid, step, token_plain) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE step = 1, from_jid = VALUES(from_jid), token_plain = VALUES(token_plain), updated_at = NOW()');
            $stmtIns->execute([$nomor, $fromJid, $plainToken]);
        } else {
            $stmtIns = $db->prepare('INSERT INTO ebeddien_daftar_wa_pending (nomor, step, token_plain) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE step = 1, token_plain = VALUES(token_plain), updated_at = NOW()');
            $stmtIns->execute([$nomor, $plainToken]);
        }

        error_log('EbeddienDaftarWaFlow: pending created nomor=' . $nomor . ' nik_in_message=' . ($nikLine ?? ''));
        return self::MSG_SIMPAN_NOMOR;
    }

    private static function setupTokenStillValid(\PDO $db, string $plainToken): bool
    {
        $tokenHash = hash('sha256', $plainToken);
        try {
            $st = $db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'entity_type'");
            $hasEntity = $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            $hasEntity = false;
        }

        if ($hasEntity) {
            $stmt = $db->prepare("
                SELECT st.id FROM user___setup_tokens st
                INNER JOIN pengurus p ON st.entity_type = 'pengurus' AND p.id = st.entity_id AND p.id_user IS NULL
                WHERE st.token_hash = ? AND st.expires_at > NOW()
                LIMIT 1
            ");
        } else {
            $stmt = $db->prepare("
                SELECT st.id FROM user___setup_tokens st
                INNER JOIN pengurus p ON p.id = st.id_pengurus AND p.id_user IS NULL
                WHERE st.token_hash = ? AND st.expires_at > NOW()
                LIMIT 1
            ");
        }
        $stmt->execute([$tokenHash]);
        return (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
    }

    private static function buildSetupUrl(string $plainToken): string
    {
        $config = require __DIR__ . '/../../config.php';
        $base = trim((string) ($config['app']['ebeddien_url'] ?? ''));
        if ($base === '') {
            $base = trim((string) ($config['app']['url'] ?? ''));
        }
        $base = rtrim($base, '/');
        if ($base === '') {
            $base = 'https://ebeddien.alutsmani.id';
        }
        return $base . '/setup-akun?token=' . rawurlencode($plainToken);
    }

    private static function tableHasColumn(\PDO $db, string $table, string $column): bool
    {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE " . $db->quote($column));
            return $stmt !== false && $stmt->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function isJawabanYa(string $msg): bool
    {
        $msg = preg_replace('/\s+/', ' ', trim(strtolower($msg)));
        return in_array($msg, ['iya', 'ya', 'sudah', 'y', 'ok', 'oke', 'yes'], true)
            || preg_match('/^(iya|ya|sudah)\s*[\.\!]?$/i', trim($msg));
    }

    private static function isJawabanBelum(string $msg): bool
    {
        $msg = preg_replace('/\s+/', ' ', trim(strtolower($msg)));
        return in_array($msg, ['belum', 'blm', 'not yet', 'no', 'tidak', 'n'], true)
            || (strpos($msg, 'belum') === 0);
    }
}
