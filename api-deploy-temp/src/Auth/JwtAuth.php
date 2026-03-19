<?php

namespace App\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtAuth
{
    private $secret;
    private $algorithm;
    private $expiration;

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $jwtConfig = $config['jwt'];
        
        $this->secret = $jwtConfig['secret'];
        $this->algorithm = $jwtConfig['algorithm'];
        $this->expiration = $jwtConfig['expiration'];
    }

    public function generateToken(array $payload): string
    {
        try {
            $issuedAt = time();
            $expire = $issuedAt + $this->expiration;

            $token = [
                'iat' => $issuedAt,
                'exp' => $expire,
                'data' => $payload
            ];

            return JWT::encode($token, $this->secret, $this->algorithm);
        } catch (\Exception $e) {
            error_log("JWT generation error: " . $e->getMessage());
            throw new \RuntimeException("Failed to generate token: " . $e->getMessage());
        }
    }

    public function validateToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->secret, $this->algorithm));
            return (array) $decoded->data;
        } catch (\Exception $e) {
            error_log("JWT validation error: " . $e->getMessage());
            return null;
        }
    }
}

