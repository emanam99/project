<?php

namespace App\Auth;

class PasswordHelper
{
    /**
     * Verify password - supports both SHA256 (legacy) and bcrypt (new)
     */
    public static function verifyPassword(string $password, string $hash): bool
    {
        // Cek apakah hash adalah bcrypt (dimulai dengan $2y$)
        if (strpos($hash, '$2y$') === 0) {
            return password_verify($password, $hash);
        }
        
        // Legacy: SHA256 hash
        $sha256Hash = hash('sha256', $password);
        return hash_equals($hash, $sha256Hash);
    }

    /**
     * Hash password menggunakan bcrypt
     */
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /**
     * Update password dari SHA256 ke bcrypt jika diperlukan
     */
    public static function shouldUpgradePassword(string $hash): bool
    {
        return strpos($hash, '$2y$') !== 0;
    }
}

