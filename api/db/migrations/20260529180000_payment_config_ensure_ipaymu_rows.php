<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan baris konfigurasi iPayMu sandbox & production ada (mirip seed Xendit).
 * Beberapa instalasi lama hanya punya satu baris iPayMu sehingga mode Production
 * tidak punya form di eBeddien dan pembayaran daftar gagal (503).
 */
final class PaymentConfigEnsureIpaymuRows extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('payment___config')) {
            return;
        }

        $this->execute(
            "INSERT INTO `payment___config` "
            . "(`name`, `api_key`, `api_secret`, `va`, `production_mode`, `is_active`, `keterangan`) "
            . "SELECT 'iPaymu', NULL, NULL, NULL, 0, 0, 'Sandbox — API Key + VA (iPayMu)' "
            . "FROM DUAL WHERE NOT EXISTS ("
            . "SELECT 1 FROM `payment___config` WHERE `name` = 'iPaymu' AND `production_mode` = 0 LIMIT 1"
            . ')'
        );
        $this->execute(
            "INSERT INTO `payment___config` "
            . "(`name`, `api_key`, `api_secret`, `va`, `production_mode`, `is_active`, `keterangan`) "
            . "SELECT 'iPaymu', NULL, NULL, NULL, 1, 0, 'Production — API Key + VA (iPayMu)' "
            . "FROM DUAL WHERE NOT EXISTS ("
            . "SELECT 1 FROM `payment___config` WHERE `name` = 'iPaymu' AND `production_mode` = 1 LIMIT 1"
            . ')'
        );
    }

    public function down(): void
    {
        // Tidak menghapus baris — bisa berisi kredensial production.
    }
}
