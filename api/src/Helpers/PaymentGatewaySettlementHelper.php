<?php

namespace App\Helpers;

use App\Services\PaymentGateway\iPaymuService;

/**
 * Settlement pembayaran gateway — delegasi ke iPaymuService (logika domain bersama iPayMu & Xendit).
 */
final class PaymentGatewaySettlementHelper
{
    public static function ensureUwabaKhususTunggakanBayarInserted(int $idPayment): void
    {
        (new iPaymuService())->ensureUwabaKhususTunggakanBayarInserted($idPayment);
    }

    public static function ensurePendaftaranTransactionInserted(int $idPayment): void
    {
        (new iPaymuService())->ensurePendaftaranTransactionInserted($idPayment);
    }

    public static function completePaidSettlement(int $transactionId, ?iPaymuService $service = null): void
    {
        $svc = $service ?? new iPaymuService();
        $svc->completePaidSettlement($transactionId);
    }
}
