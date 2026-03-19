<?php

namespace App\Services\PaymentGateway;

use App\Database;

/**
 * Helper class untuk mengelola konfigurasi Payment Gateway
 * Mengambil dan menyimpan konfigurasi dari tabel payment___config
 */
class PaymentGatewayConfig
{
    private static $db = null;
    private static $configCache = null;

    /**
     * Dapatkan koneksi database
     */
    private static function getDb()
    {
        if (self::$db === null) {
            self::$db = Database::getInstance()->getConnection();
        }
        return self::$db;
    }

    /**
     * Clear cache config
     */
    public static function clearCache(): void
    {
        self::$configCache = null;
    }

    /**
     * Dapatkan konfigurasi aktif (sandbox atau production)
     * @return array|null Konfigurasi aktif atau null jika tidak ada
     */
    public static function getActiveConfig(): ?array
    {
        try {
            $db = self::getDb();
            $stmt = $db->prepare("SELECT * FROM payment___config WHERE is_active = 1 LIMIT 1");
            $stmt->execute();
            $config = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $config ?: null;
        } catch (\Exception $e) {
            error_log("PaymentGatewayConfig::getActiveConfig error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Dapatkan konfigurasi berdasarkan mode
     * @param bool $productionMode true untuk production, false untuk sandbox
     * @return array|null Konfigurasi atau null jika tidak ada
     */
    public static function getConfigByMode(bool $productionMode): ?array
    {
        try {
            $db = self::getDb();
            $mode = $productionMode ? 1 : 0;
            $stmt = $db->prepare("SELECT * FROM payment___config WHERE production_mode = ? LIMIT 1");
            $stmt->execute([$mode]);
            $config = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return $config ?: null;
        } catch (\Exception $e) {
            error_log("PaymentGatewayConfig::getConfigByMode error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Dapatkan semua konfigurasi
     * @return array Array konfigurasi
     */
    public static function getAllConfig(): array
    {
        try {
            $db = self::getDb();
            $stmt = $db->query("SELECT * FROM payment___config ORDER BY production_mode ASC");
            $configs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $configs ?: [];
        } catch (\Exception $e) {
            error_log("PaymentGatewayConfig::getAllConfig error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Update konfigurasi
     * @param int $id ID konfigurasi
     * @param array $data Data yang akan diupdate
     * @return bool true jika berhasil, false jika gagal
     */
    public static function updateConfig(int $id, array $data): bool
    {
        try {
            $db = self::getDb();
            $allowedFields = ['name', 'api_key', 'api_secret', 'va', 'production_mode', 'notify_url', 'return_url', 'cancel_url', 'expired', 'is_active', 'keterangan'];
            $updateFields = [];
            $updateValues = [];

            foreach ($allowedFields as $field) {
                if (isset($data[$field])) {
                    $updateFields[] = "`{$field}` = ?";
                    $updateValues[] = $data[$field];
                }
            }

            if (empty($updateFields)) {
                return false;
            }

            // Jika mengaktifkan satu config, nonaktifkan yang lain
            if (isset($data['is_active']) && $data['is_active'] == 1) {
                $db->prepare("UPDATE payment___config SET is_active = 0 WHERE id != ?")->execute([$id]);
            }

            $updateValues[] = $id;
            $sql = "UPDATE payment___config SET " . implode(', ', $updateFields) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($updateValues);

            self::clearCache();
            return true;
        } catch (\Exception $e) {
            error_log("PaymentGatewayConfig::updateConfig error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Switch mode (sandbox/production)
     * @param bool $productionMode true untuk production, false untuk sandbox
     * @return bool true jika berhasil, false jika gagal
     */
    public static function switchMode(bool $productionMode): bool
    {
        try {
            $db = self::getDb();
            $db->beginTransaction();

            // Nonaktifkan semua config
            $db->prepare("UPDATE payment___config SET is_active = 0")->execute();

            // Aktifkan config sesuai mode
            $mode = $productionMode ? 1 : 0;
            $stmt = $db->prepare("UPDATE payment___config SET is_active = 1 WHERE production_mode = ? LIMIT 1");
            $stmt->execute([$mode]);

            $affectedRows = $stmt->rowCount();
            if ($affectedRows === 0) {
                $db->rollBack();
                return false;
            }

            $db->commit();
            self::clearCache();
            return true;
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log("PaymentGatewayConfig::switchMode error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Dapatkan base URL API iPaymu berdasarkan mode
     * @param bool $productionMode true untuk production, false untuk sandbox
     * @return string Base URL API
     */
    public static function getApiBaseUrl(bool $productionMode): string
    {
        if ($productionMode) {
            return 'https://my.ipaymu.com/api/v2'; // Production URL
        }
        return 'https://sandbox.ipaymu.com/api/v2'; // Sandbox URL
    }
}
