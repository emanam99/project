<?php

namespace App\Helpers;

use App\Services\WhatsAppService;

/**
 * Deteksi login mencurigakan: saat percobaan login gagal ke-3 (salah username/password),
 * kirim notifikasi WA ke nomor yang dikonfigurasi dan catat di log WA.
 * Percobaan ke-5 tetap kena rate limit (middleware).
 */
class LoginSuspiciousHelper
{
    /** Endpoint login V2 */
    public const ENDPOINT_V2 = '/api/v2/auth/login';

    /** Endpoint login V1 */
    public const ENDPOINT_V1 = '/api/auth/login';

    /**
     * Cek jumlah gagal login saat ini untuk (ip, endpoint). Jika sudah 2 (artinya percobaan ini adalah yang ke-3),
     * kirim WA ke nomor login_alert_wa dan pastikan tercatat di tabel whatsapp.
     *
     * @param \PDO $db Koneksi database
     * @param string $ip IP client
     * @param string $endpoint ENDPOINT_V2 atau ENDPOINT_V1
     * @param string $identifier Username (V2) atau ID (V1) yang dipakai saat gagal
     */
    public static function notifyIfThirdFailure(\PDO $db, string $ip, string $endpoint, string $identifier): void
    {
        $config = require __DIR__ . '/../../config.php';
        $alertWa = trim($config['security']['login_alert_wa'] ?? '');
        if ($alertWa === '') {
            return;
        }

        try {
            $stmt = $db->prepare("
                SELECT attempt_count FROM rate_limits
                WHERE ip_address = ? AND endpoint = ?
            ");
            $stmt->execute([$ip, $endpoint]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $count = $row ? (int) $row['attempt_count'] : 0;

            // Saat ini akan jadi percobaan ke-3 jika count == 2 (middleware akan increment setelah response)
            if ($count !== 2) {
                return;
            }

            $waktu = date('d/m/Y H:i:s');
            $message = "⚠️ [UWABA] Login mencurigakan: 3x percobaan gagal.\n"
                . "IP: {$ip}\n"
                . "Login: " . (strlen($identifier) > 50 ? substr($identifier, 0, 47) . '...' : $identifier) . "\n"
                . "Waktu: {$waktu}\n"
                . "Percobaan ke-5 akan kena blokir sementara.";

            $logContext = [
                'id_santri' => null,
                'id_pengurus' => null,
                'tujuan' => 'admin',
                'id_pengurus_pengirim' => null,
                'kategori' => 'login_mencurigakan',
                'sumber' => 'auth',
            ];

            WhatsAppService::sendMessage($alertWa, $message, null, $logContext);
        } catch (\Throwable $e) {
            error_log('LoginSuspiciousHelper::notifyIfThirdFailure: ' . $e->getMessage());
        }
    }
}
