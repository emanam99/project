<?php

namespace App\Services\PaymentGateway;

use App\Database;

/**
 * Helper class untuk mengelola konfigurasi Payment Gateway
 * Mengambil dan menyimpan konfigurasi dari tabel payment___config
 */
class PaymentGatewayConfig
{
    public const PROVIDER_IPAYMU = 'ipaymu';
    public const PROVIDER_XENDIT = 'xendit';

    public const CONFIG_NAME_IPAYMU = 'iPaymu';
    public const CONFIG_NAME_XENDIT = 'Xendit';

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
    public static function getConfigByMode(bool $productionMode, ?string $providerName = self::CONFIG_NAME_IPAYMU): ?array
    {
        return self::getConfigByProviderAndMode($providerName, $productionMode);
    }

    /**
     * Konfigurasi per provider (iPaymu / Xendit) dan mode sandbox/production.
     */
    public static function getConfigByProviderAndMode(string $providerName, bool $productionMode): ?array
    {
        try {
            $db = self::getDb();
            $mode = $productionMode ? 1 : 0;
            $stmt = $db->prepare(
                'SELECT * FROM payment___config WHERE name = ? AND production_mode = ? LIMIT 1'
            );
            $stmt->execute([$providerName, $mode]);
            $config = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $config ?: null;
        } catch (\Exception $e) {
            error_log('PaymentGatewayConfig::getConfigByProviderAndMode error: ' . $e->getMessage());

            return null;
        }
    }

    public static function configNameForProvider(string $provider): string
    {
        return strtolower($provider) === self::PROVIDER_XENDIT
            ? self::CONFIG_NAME_XENDIT
            : self::CONFIG_NAME_IPAYMU;
    }

    public static function isProductionModeActive(): bool
    {
        $active = self::getActiveConfig();

        return $active && (int) ($active['production_mode'] ?? 0) === 1;
    }

    /**
     * @param bool $useSandbox true jika header staging / sandbox
     */
    public static function resolveProductionModeForRequest(bool $useSandbox): bool
    {
        if ($useSandbox) {
            return false;
        }

        return self::isProductionModeActive();
    }

    public static function isProviderConfigured(string $provider, bool $productionMode): bool
    {
        $name = self::configNameForProvider($provider);
        $cfg = self::getConfigByProviderAndMode($name, $productionMode);
        if (!$cfg) {
            return false;
        }

        if (trim((string) ($cfg['api_key'] ?? '')) === '') {
            return false;
        }

        // iPayMu v2: VA merchant wajib untuk signature & payment/direct (bukan nomor VA pelanggan).
        if (strtolower($provider) === self::PROVIDER_IPAYMU) {
            return trim((string) ($cfg['va'] ?? '')) !== '';
        }

        return true;
    }

    public static function getMybeddianPaymentProvider(): string
    {
        try {
            $db = self::getDb();
            $stmt = $db->prepare(
                "SELECT `value` FROM app___settings WHERE `key` = 'mybeddian_payment_provider' LIMIT 1"
            );
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $v = $row && isset($row['value']) ? strtolower(trim((string) $row['value'])) : '';

            return in_array($v, [self::PROVIDER_IPAYMU, self::PROVIDER_XENDIT], true)
                ? $v
                : self::PROVIDER_IPAYMU;
        } catch (\Exception $e) {
            error_log('PaymentGatewayConfig::getMybeddianPaymentProvider error: ' . $e->getMessage());

            return self::PROVIDER_IPAYMU;
        }
    }

    public static function setMybeddianPaymentProvider(string $provider): bool
    {
        $provider = strtolower(trim($provider));
        if (!in_array($provider, [self::PROVIDER_IPAYMU, self::PROVIDER_XENDIT], true)) {
            return false;
        }
        try {
            $db = self::getDb();
            $stmt = $db->prepare(
                'INSERT INTO app___settings (`key`, `value`) VALUES (?, ?) '
                . 'ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()'
            );
            $stmt->execute(['mybeddian_payment_provider', $provider, $provider]);

            return true;
        } catch (\Exception $e) {
            error_log('PaymentGatewayConfig::setMybeddianPaymentProvider error: ' . $e->getMessage());

            return false;
        }
    }

    /**
     * Pastikan baris iPayMu sandbox & production ada (instalasi lama bisa hanya satu baris).
     */
    public static function ensureIpaymuConfigRows(): void
    {
        $rows = [
            [0, 'Sandbox — API Key + VA (iPayMu)'],
            [1, 'Production — API Key + VA (iPayMu)'],
        ];
        try {
            $db = self::getDb();
            foreach ($rows as [$mode, $keterangan]) {
                $check = $db->prepare(
                    'SELECT id FROM payment___config WHERE name = ? AND production_mode = ? LIMIT 1'
                );
                $check->execute([self::CONFIG_NAME_IPAYMU, $mode]);
                if ($check->fetch(\PDO::FETCH_ASSOC)) {
                    continue;
                }
                $ins = $db->prepare(
                    'INSERT INTO payment___config '
                    . '(name, api_key, api_secret, va, production_mode, is_active, keterangan) '
                    . 'VALUES (?, NULL, NULL, NULL, ?, 0, ?)'
                );
                $ins->execute([self::CONFIG_NAME_IPAYMU, $mode, $keterangan]);
            }
            self::clearCache();
        } catch (\Exception $e) {
            error_log('PaymentGatewayConfig::ensureIpaymuConfigRows error: ' . $e->getMessage());
        }
    }

    /**
     * Dapatkan semua konfigurasi
     * @return array Array konfigurasi
     */
    public static function getAllConfig(): array
    {
        try {
            self::ensureIpaymuConfigRows();
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

            // Aktifkan semua config (iPaymu + Xendit) untuk mode yang dipilih
            $mode = $productionMode ? 1 : 0;
            $stmt = $db->prepare('UPDATE payment___config SET is_active = 1 WHERE production_mode = ?');
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
            return 'https://my.ipaymu.com/api/v2';
        }

        return 'https://sandbox.ipaymu.com/api/v2';
    }

    public static function getXenditApiBaseUrl(): string
    {
        return 'https://api.xendit.co';
    }
}
