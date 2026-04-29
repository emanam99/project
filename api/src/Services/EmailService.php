<?php

namespace App\Services;

use App\Database;
use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

class EmailService
{
    /**
     * Ambil konfigurasi email dari app___settings.
     *
     * @return array<string, string>
     */
    public static function getConfig(): array
    {
        $defaults = [
            'email_enabled' => '0',
            'email_smtp_host' => 'smtp.hostinger.com',
            'email_smtp_port' => '465',
            'email_smtp_username' => '',
            'email_smtp_password' => '',
            'email_smtp_encryption' => 'ssl',
            'email_from_address' => '',
            'email_from_name' => 'eBeddien',
            'email_otp_subject' => 'Kode OTP Konfirmasi',
        ];

        try {
            $db = Database::getInstance()->getConnection();
            $keys = array_keys($defaults);
            $placeholders = implode(',', array_fill(0, count($keys), '?'));
            $stmt = $db->prepare(
                "SELECT `key`, `value` FROM `app___settings` WHERE `key` IN ({$placeholders})"
            );
            $stmt->execute($keys);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $k = (string) ($row['key'] ?? '');
                if ($k === '' || !array_key_exists($k, $defaults)) {
                    continue;
                }
                $defaults[$k] = (string) ($row['value'] ?? '');
            }
        } catch (\Throwable $e) {
            error_log('EmailService::getConfig ' . $e->getMessage());
        }

        return $defaults;
    }

    /**
     * @return array{success:bool,message:string,error?:string}
     */
    public static function send(string $toEmail, string $subject, string $htmlBody, string $plainBody = ''): array
    {
        $toEmail = trim($toEmail);
        if ($toEmail === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => 'Email tujuan tidak valid'];
        }

        $cfg = self::getConfig();
        $enabled = strtolower(trim((string) ($cfg['email_enabled'] ?? '0')));
        if (!in_array($enabled, ['1', 'true', 'yes', 'on'], true)) {
            return ['success' => false, 'message' => 'Konfigurasi email belum diaktifkan'];
        }

        $host = trim((string) ($cfg['email_smtp_host'] ?? ''));
        $port = (int) ($cfg['email_smtp_port'] ?? 465);
        $username = trim((string) ($cfg['email_smtp_username'] ?? ''));
        $password = (string) ($cfg['email_smtp_password'] ?? '');
        $fromAddress = trim((string) ($cfg['email_from_address'] ?? ''));
        $fromName = trim((string) ($cfg['email_from_name'] ?? 'eBeddien'));
        $encryption = strtolower(trim((string) ($cfg['email_smtp_encryption'] ?? 'ssl')));

        if ($host === '') {
            $host = 'smtp.hostinger.com';
        }
        if ($fromAddress === '' && $username !== '' && filter_var($username, FILTER_VALIDATE_EMAIL)) {
            $fromAddress = $username;
        }
        if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
            return ['success' => false, 'message' => 'Konfigurasi SMTP belum lengkap'];
        }
        if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => 'Email pengirim tidak valid'];
        }

        try {
            $mail = new PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->SMTPAuth = true;
            $mail->Username = $username;
            $mail->Password = $password;
            $mail->Port = $port > 0 ? $port : 465;
            if ($encryption === 'tls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } elseif ($encryption === 'none' || $encryption === '') {
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = false;
            } else {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            }

            $mail->setFrom($fromAddress, $fromName !== '' ? $fromName : 'eBeddien');
            $mail->addAddress($toEmail);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $htmlBody;
            $mail->AltBody = $plainBody !== '' ? $plainBody : strip_tags(str_replace('<br>', "\n", $htmlBody));
            $mail->send();

            return ['success' => true, 'message' => 'Email berhasil dikirim'];
        } catch (PHPMailerException $e) {
            return ['success' => false, 'message' => 'Gagal mengirim email', 'error' => $e->getMessage()];
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => 'Gagal mengirim email', 'error' => $e->getMessage()];
        }
    }

    /**
     * @return array{success:bool,message:string,error?:string}
     */
    public static function sendOtpEmail(string $toEmail, string $otp, string $contextLabel = 'konfirmasi data'): array
    {
        $cfg = self::getConfig();
        $subject = trim((string) ($cfg['email_otp_subject'] ?? 'Kode OTP Konfirmasi'));
        if ($subject === '') {
            $subject = 'Kode OTP Konfirmasi';
        }

        $safeOtp = preg_replace('/\D/', '', $otp) ?: $otp;
        $safeContext = htmlspecialchars($contextLabel, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">'
            . '<p>Kode OTP untuk <strong>' . $safeContext . '</strong>:</p>'
            . '<p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:10px 0;">' . htmlspecialchars($safeOtp, ENT_QUOTES, 'UTF-8') . '</p>'
            . '<p>Kode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.</p>'
            . '</div>';
        $plain = "Kode OTP untuk {$contextLabel}: {$safeOtp}\nBerlaku 10 menit. Jangan bagikan kode ini.";

        return self::send($toEmail, $subject, $html, $plain);
    }
}
