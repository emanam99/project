<?php

namespace App\Helpers;

use App\Config\Database;
use App\Services\SppgService;
use PDO;

class TenantHostHelper
{
    /** @var list<string> */
    public const RESERVED_SUBDOMAINS = [
        'sppg',
        'adminsppg',
        'www',
        'api',
        'mail',
        'admin',
        'staging',
        'dev',
        'test',
        'ftp',
        'cpanel',
        'webmail',
    ];

    public static function tenantBaseDomain(): ?string
    {
        $d = strtolower(trim((string) ($_ENV['TENANT_BASE_DOMAIN'] ?? '')));
        return $d !== '' ? $d : null;
    }

    public static function landingHost(): ?string
    {
        $h = strtolower(trim((string) ($_ENV['LANDING_HOST'] ?? '')));
        return $h !== '' ? $h : null;
    }

    public static function normalizeSubdomain(string $sub): string
    {
        $sub = strtolower(trim($sub));
        $sub = preg_replace('/[^a-z0-9-]/', '', $sub) ?? '';
        $sub = preg_replace('/-+/', '-', $sub) ?? '';
        return trim($sub, '-');
    }

    public static function isValidSubdomainFormat(string $sub): bool
    {
        if ($sub === '' || strlen($sub) > 63) {
            return false;
        }
        return (bool) preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/', $sub);
    }

    public static function isReservedSubdomain(string $sub): bool
    {
        return in_array(strtolower($sub), self::RESERVED_SUBDOMAINS, true);
    }

    /**
     * @return 'landing'|'tenant'|'legacy'
     */
    public static function resolveHostMode(?string $host = null): string
    {
        $host = strtolower(trim((string) ($host ?? self::currentHost())));
        if ($host === '') {
            return 'legacy';
        }

        if (PlatformAdminHelper::isPlatformAdminHost($host)) {
            return 'admin';
        }

        $base = self::tenantBaseDomain();
        if ($base === null) {
            return 'legacy';
        }

        $landing = self::landingHost();
        if ($landing !== null && $host === $landing) {
            return 'landing';
        }

        $suffix = '.' . $base;
        if (str_ends_with($host, $suffix)) {
            $sub = substr($host, 0, -strlen($suffix));
            if ($sub !== '' && !str_contains($sub, '.')) {
                return 'tenant';
            }
        }

        return 'legacy';
    }

    public static function resolveSubdomainFromHost(?string $host = null): ?string
    {
        if (self::resolveHostMode($host) !== 'tenant') {
            return null;
        }
        $host = strtolower(trim((string) ($host ?? self::currentHost())));
        $base = self::tenantBaseDomain();
        if ($base === null) {
            return null;
        }
        $suffix = '.' . $base;
        if (!str_ends_with($host, $suffix)) {
            return null;
        }
        $sub = substr($host, 0, -strlen($suffix));
        return $sub !== '' ? $sub : null;
    }

    public static function tenantUrl(?string $subdomain): ?string
    {
        $sub = self::normalizeSubdomain((string) $subdomain);
        $base = self::tenantBaseDomain();
        if ($sub === '' || $base === null) {
            return null;
        }
        return 'https://' . $sub . '.' . $base;
    }

    public static function resolveSppgFromHost(?string $host = null): ?array
    {
        $sub = self::resolveSubdomainFromHost($host);
        if ($sub === null) {
            return null;
        }
        $sppg = (new SppgService())->findBySubdomain($sub);
        return $sppg ?: null;
    }

    public static function isCloudyOrigin(?string $origin): bool
    {
        $origin = rtrim(trim((string) $origin), '/');
        if ($origin === '') {
            return false;
        }
        $base = self::tenantBaseDomain();
        if ($base === null) {
            return false;
        }
        $parsed = parse_url($origin);
        $host = strtolower((string) ($parsed['host'] ?? ''));
        if ($host === $base || $host === self::landingHost()) {
            return true;
        }
        return str_ends_with($host, '.' . $base);
    }

    public static function currentHost(): string
    {
        $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '')));
        if (str_contains($host, ':')) {
            $host = explode(':', $host, 2)[0];
        }
        return $host;
    }
}
