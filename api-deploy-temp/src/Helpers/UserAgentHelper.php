<?php

namespace App\Helpers;

/**
 * Parse User-Agent string untuk device_type, browser, OS.
 * Untuk disimpan di user___sessions (aktivitas / sedang aktif di mana saja).
 */
class UserAgentHelper
{
    /**
     * Parse User-Agent dan return array device_type, browser_name, browser_version, os_name, os_version.
     *
     * @param string|null $userAgent
     * @return array{device_type: string|null, browser_name: string|null, browser_version: string|null, os_name: string|null, os_version: string|null}
     */
    public static function parse(?string $userAgent): array
    {
        $ua = $userAgent ?? '';
        $result = [
            'device_type' => self::detectDeviceType($ua),
            'browser_name' => null,
            'browser_version' => null,
            'os_name' => null,
            'os_version' => null,
        ];

        // Browser (order matters: Edge/Edg before Chrome)
        if (preg_match('/Edg\/([0-9.]+)/i', $ua, $m)) {
            $result['browser_name'] = 'Edge';
            $result['browser_version'] = $m[1];
        } elseif (preg_match('/OPR\/([0-9.]+)/i', $ua, $m)) {
            $result['browser_name'] = 'Opera';
            $result['browser_version'] = $m[1];
        } elseif (preg_match('/Chrome\/([0-9.]+)/i', $ua, $m) && !preg_match('/Chromium/i', $ua)) {
            $result['browser_name'] = 'Chrome';
            $result['browser_version'] = $m[1];
        } elseif (preg_match('/Firefox\/([0-9.]+)/i', $ua, $m)) {
            $result['browser_name'] = 'Firefox';
            $result['browser_version'] = $m[1];
        } elseif (preg_match('/Safari\/([0-9.]+)/i', $ua, $m) && !preg_match('/Chrome/i', $ua)) {
            $result['browser_name'] = 'Safari';
            $result['browser_version'] = $m[1];
        } elseif (preg_match('/MSIE\s+([0-9.]+)/i', $ua, $m)) {
            $result['browser_name'] = 'IE';
            $result['browser_version'] = $m[1];
        }

        // OS
        if (preg_match('/Windows NT ([0-9.]+)/i', $ua, $m)) {
            $result['os_name'] = 'Windows';
            $result['os_version'] = self::windowsVersion($m[1]);
        } elseif (preg_match('/Android(?:[\s/]+([0-9.]+))?/i', $ua, $m)) {
            $result['os_name'] = 'Android';
            $result['os_version'] = $m[1] ?? null;
        } elseif (preg_match('/iPhone OS ([0-9_]+)/i', $ua, $m) || preg_match('/CPU OS ([0-9_]+)/i', $ua, $m)) {
            $result['os_name'] = 'iOS';
            $result['os_version'] = str_replace('_', '.', $m[1] ?? '');
        } elseif (preg_match('/Mac OS X ([0-9_.]+)/i', $ua, $m)) {
            $result['os_name'] = 'macOS';
            $result['os_version'] = str_replace('_', '.', $m[1] ?? '');
        } elseif (preg_match('/Linux/i', $ua)) {
            $result['os_name'] = 'Linux';
        }

        return $result;
    }

    private static function detectDeviceType(string $ua): string
    {
        if (preg_match('/bot|crawler|spider|slurp/i', $ua)) {
            return 'bot';
        }
        if (preg_match('/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i', $ua)) {
            if (preg_match('/iPad|Tablet|PlayBook|Silk/i', $ua)) {
                return 'tablet';
            }
            return 'mobile';
        }
        return 'desktop';
    }

    private static function windowsVersion(string $nt): ?string
    {
        $map = [
            '10.0' => '10/11',
            '6.3' => '8.1',
            '6.2' => '8',
            '6.1' => '7',
        ];
        return $map[$nt] ?? $nt;
    }
}
