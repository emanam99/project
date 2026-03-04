<?php

namespace App\Helpers;

use App\Database;

class AuditLogger
{
    private static $db;

    public static function init(): void
    {
        try {
            self::$db = Database::getInstance()->getConnection();
            self::createTableIfNotExists();
        } catch (\Throwable $e) {
            error_log('AuditLogger::init error: ' . $e->getMessage());
            self::$db = null;
        }
    }

    /**
     * Catat aksi untuk audit (login, logout, ubah password, dll.).
     *
     * @param string $userId users.id atau '0' untuk aksi tanpa user (mis. login gagal)
     * @param string $action Nama aksi: login, login_failed, logout, revoke_session, logout_all, password_changed_reset, password_changed_profile, request_ubah_password, setup_akun, dll.
     * @param array $details Data tambahan (JSON): user_agent, session_id, username, dll. Jangan isi password/token.
     * @param string|null $ipAddress IP client; null = ambil dari REMOTE_ADDR
     * @param bool $success Apakah aksi berhasil
     */
    public static function log(string $userId, string $action, array $details = [], ?string $ipAddress = null, bool $success = true): void
    {
        try {
            if (!self::$db) {
                self::init();
            }
            if (!self::$db) {
                return;
            }

            $ip = $ipAddress ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $stmt = self::$db->prepare("
                INSERT INTO user___audit_logs (user_id, action, details, ip_address, success, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $userId,
                $action,
                json_encode($details, JSON_UNESCAPED_UNICODE),
                $ip,
                $success ? 1 : 0,
            ]);
        } catch (\Throwable $e) {
            error_log('AuditLogger::log error: ' . $e->getMessage());
        }
    }

    private static function createTableIfNotExists(): void
    {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS user___audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                action VARCHAR(255) NOT NULL,
                details TEXT,
                ip_address VARCHAR(45),
                success TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_action (action),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
            self::$db->exec($sql);
        } catch (\Throwable $e) {
            error_log('AuditLogger::createTableIfNotExists error: ' . $e->getMessage());
        }
    }
}
