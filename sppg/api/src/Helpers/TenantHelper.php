<?php

namespace App\Helpers;

use Psr\Http\Message\ServerRequestInterface as Request;

class TenantHelper
{
    public static function getSppgIdFromUser(?array $user): int
    {
        $id = (int) ($user['sppg_id'] ?? 0);
        if ($id <= 0) {
            throw new \RuntimeException('Tenant tidak valid');
        }
        return $id;
    }

    public static function getSppgIdFromRequest(Request $request): int
    {
        return self::getSppgIdFromUser($request->getAttribute('user'));
    }

    public static function assertTenantRow(?array $row, int $sppgId): void
    {
        if (!$row || (int) ($row['sppg_id'] ?? 0) !== $sppgId) {
            throw new \RuntimeException('Data tidak ditemukan', 404);
        }
    }

    public static function subscriptionAllowsAppAccess(?array $sppg, ?array $subscription): bool
    {
        if (!$sppg) {
            return false;
        }
        $tenantStatus = (string) ($sppg['status'] ?? '');
        if (in_array($tenantStatus, ['suspended', 'cancelled', 'pending_dns'], true)) {
            return false;
        }
        if ($tenantStatus === 'active') {
            return true;
        }
        $subStatus = (string) ($subscription['status'] ?? '');
        return in_array($subStatus, ['active'], true);
    }

    /** Route pattern yang tetap boleh saat langganan belum aktif. */
    public const SUBSCRIPTION_BYPASS = [
        '/auth/me',
        '/auth/logout',
        '/auth/switch-tenant',
        '/sppg/profile',
        '/sppg/subscription',
        '/sppg/subscription/pay',
    ];
}
