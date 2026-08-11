<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Flow login/isi ulang formulir pendaftaran lewat WA (pesan dari tombol wa.me di app daftar).
 * User kirim template berisi NIK + Nomor WA + Token → balasan 2 pesan (jeda 2 detik) + link sekali pakai.
 */
final class DaftarSantriWaFlow
{
    private const TRIGGER = 'daftar santri';

    /**
     * @return string|null Teks balasan (boleh SPLIT_MARKER) atau null
     */
    public static function handle(string $nomor, string $message, ?string $fromJid = null): ?string
    {
        $fromJid = $fromJid !== null && $fromJid !== '' ? trim($fromJid) : null;
        $sender = self::normalizeIncomingNumber($nomor, $fromJid);
        if (strlen($sender) < 8) {
            return null;
        }

        $messageTrim = trim($message);
        if (stripos($messageTrim, self::TRIGGER) === false) {
            return null;
        }

        if (!preg_match('/NIK\s*:\s*(\d{16})/iu', $messageTrim, $nm)) {
            return "Format tidak lengkap. Pastikan baris NIK berisi 16 angka seperti di aplikasi pendaftaran.";
        }
        if (!preg_match('/Nomor\s*WA\s*:\s*([0-9+\-\s]{8,20})/iu', $messageTrim, $wm)) {
            return "Format tidak lengkap. Pastikan baris Nomor WA terisi seperti di aplikasi pendaftaran.";
        }
        if (!preg_match('/Token\s*:\s*([a-fA-F0-9]{64})/u', $messageTrim, $tm)) {
            return "Format tidak lengkap. Pastikan baris Token berisi kode 64 karakter persis seperti di aplikasi.";
        }

        $nik = $nm[1];
        $claimedWa = WhatsAppService::formatPhoneNumber(preg_replace('/\D/', '', $wm[1]) ?? '');
        $plainToken = strtolower($tm[1]);
        $tokenHash = hash('sha256', $plainToken);

        try {
            $db = Database::getInstance()->getConnection();
            if ($db->query("SHOW TABLES LIKE 'daftar_santri_wa_tokens'")->rowCount() === 0) {
                error_log('DaftarSantriWaFlow: tabel daftar_santri_wa_tokens belum ada');
                return 'Sistem token belum siap. Silakan coba lagi nanti atau hubungi panitia.';
            }

            $stmt = $db->prepare(
                'SELECT id, nik, no_wa, used_at, expires_at, wa_verified_at
                 FROM daftar_santri_wa_tokens
                 WHERE token_hash = ?
                 LIMIT 1'
            );
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return 'Token tidak dikenali atau sudah tidak berlaku. Buka ulang aplikasi pendaftaran dan buat tautan WhatsApp baru.';
            }
            if (!empty($row['used_at'])) {
                return 'Token ini sudah dipakai. Untuk mengisi ulang formulir, buat tautan WhatsApp baru dari aplikasi pendaftaran.';
            }
            $expiresAt = strtotime((string) ($row['expires_at'] ?? ''));
            if ($expiresAt === false || $expiresAt < time()) {
                return 'Token sudah kedaluwarsa. Buka aplikasi pendaftaran, isi NIK & nomor WA, lalu kirim ulang lewat WhatsApp.';
            }
            if ((string) ($row['nik'] ?? '') !== $nik) {
                return 'NIK pada pesan tidak cocok dengan token. Pastikan menyalin teks lengkap dari aplikasi.';
            }
            $storedWa = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            if ($storedWa === '') {
                return 'Nomor WA token tidak valid. Buat tautan baru dari aplikasi pendaftaran.';
            }
            if ($claimedWa === '' || $storedWa !== $claimedWa) {
                return 'Nomor WA pada pesan tidak cocok dengan yang Anda isi di aplikasi. Periksa kembali.';
            }
            // Wajib kirim dari nomor yang sama (MSISDN atau LID yang terpetakan di kontak).
            $senderMsisdn = WhatsAppService::resolveInboundSenderToExpectedMsisdn($sender, $fromJid, $storedWa);
            if ($senderMsisdn === null) {
                return WhatsAppTemplates::pesanHarusDariNomorSama($storedWa, $sender);
            }

            $upd = $db->prepare(
                'UPDATE daftar_santri_wa_tokens
                 SET wa_verified_at = NOW(), sender_wa = ?
                 WHERE id = ? AND used_at IS NULL'
            );
            $upd->execute([$senderMsisdn, (int) $row['id']]);

            $link = self::buildLoginUrl($plainToken);
            $msg2 = "NIK: {$nik}\n"
                . "Nomor WA tercatat: {$claimedWa}\n"
                . "Nomor WA penirim: {$senderMsisdn}\n\n"
                . "Buka link berikut untuk masuk dashboard pendaftaran (sekali pakai):\n"
                . $link;

            return WhatsAppTemplates::prependPermintaanSedangDiprosesAck($db, $senderMsisdn, $msg2);
        } catch (\Throwable $e) {
            error_log('DaftarSantriWaFlow::handle ' . $e->getMessage());
            return 'Terjadi gangguan saat memverifikasi. Silakan coba lagi sebentar.';
        }
    }

    private static function buildLoginUrl(string $plainToken): string
    {
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim((string) ($config['daftar_app_url'] ?? 'https://daftar.alutsmani.id'), '/');
        return $base . '/login?wa_token=' . rawurlencode($plainToken);
    }

    private static function normalizeIncomingNumber(string $nomor, ?string $fromJid): string
    {
        $digits = preg_replace('/\D/', '', trim($nomor)) ?? '';
        $isLid = is_string($fromJid) && preg_match('/@lid$/i', trim($fromJid)) === 1;
        if ($isLid && $digits !== '') {
            return $digits;
        }
        return WhatsAppService::formatPhoneNumber($nomor);
    }
}
