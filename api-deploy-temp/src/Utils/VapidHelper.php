<?php

namespace App\Utils;

/**
 * Helper untuk VAPID keys dan push notification
 */
class VapidHelper
{
    /**
     * Get VAPID public key dari environment
     */
    public static function getPublicKey(): string
    {
        return getenv('VAPID_PUBLIC_KEY') ?: '';
    }

    /**
     * Get VAPID private key dari environment
     */
    public static function getPrivateKey(): string
    {
        return getenv('VAPID_PRIVATE_KEY') ?: '';
    }

    /**
     * Get VAPID subject dari environment
     */
    public static function getSubject(): string
    {
        return getenv('VAPID_SUBJECT') ?: 'mailto:admin@example.com';
    }

    /**
     * Check apakah VAPID keys sudah dikonfigurasi
     */
    public static function isConfigured(): bool
    {
        return !empty(self::getPublicKey()) && !empty(self::getPrivateKey());
    }
}

