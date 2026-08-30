<?php

namespace App\Services;

use App\Helpers\TenantHostHelper;

/**
 * Provision subdomain tenant di Hostinger (cloudy.my.id).
 * Butuh HOSTINGER_API_TOKEN + HOSTINGER_ACCOUNT_USERNAME di .env server.
 */
class SubdomainProvisioner
{
    private string $username;
    private string $domain;
    private string $directory;
    private string $apiToken;
    private bool $enabled;

    public function __construct()
    {
        $this->enabled = trim((string) ($_ENV['HOSTINGER_PROVISION_ENABLED'] ?? '')) === '1';
        $this->username = trim((string) ($_ENV['HOSTINGER_ACCOUNT_USERNAME'] ?? 'u264984103'));
        $this->domain = trim((string) ($_ENV['HOSTINGER_DOMAIN'] ?? 'cloudy.my.id'));
        $this->directory = trim((string) ($_ENV['HOSTINGER_SUBDOMAIN_DIRECTORY'] ?? 'sppg'));
        $this->apiToken = trim((string) ($_ENV['HOSTINGER_API_TOKEN'] ?? ''));
    }

    public function isEnabled(): bool
    {
        return $this->enabled && $this->apiToken !== '';
    }

    /**
     * @return array{success:bool,message:string}
     */
    public function provision(string $subdomain): array
    {
        $sub = TenantHostHelper::normalizeSubdomain($subdomain);
        if (!TenantHostHelper::isValidSubdomainFormat($sub)) {
            return ['success' => false, 'message' => 'Format subdomain tidak valid'];
        }
        if (TenantHostHelper::isReservedSubdomain($sub)) {
            return ['success' => false, 'message' => 'Subdomain reserved'];
        }
        if (!$this->enabled) {
            return ['success' => true, 'message' => 'Provision dinonaktifkan (manual DNS)'];
        }
        if ($this->apiToken === '') {
            return ['success' => false, 'message' => 'HOSTINGER_API_TOKEN belum diatur'];
        }

        $payload = json_encode([
            'domain' => $this->domain,
            'subdomain' => $sub,
            'directory' => $this->directory,
        ], JSON_UNESCAPED_UNICODE);

        $url = 'https://developers.hostinger.com/api/hosting/v1/websites/' . rawurlencode($this->username) . '/subdomains';
        $ch = curl_init($url);
        if ($ch === false) {
            return ['success' => false, 'message' => 'Gagal init curl'];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiToken,
                'Accept: application/json',
            ],
        ]);

        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return ['success' => false, 'message' => 'Koneksi Hostinger gagal: ' . $err];
        }

        if ($code >= 200 && $code < 300) {
            return ['success' => true, 'message' => 'Subdomain dibuat'];
        }

        $decoded = json_decode((string) $body, true);
        $msg = is_array($decoded) ? (string) ($decoded['message'] ?? $decoded['error'] ?? $body) : (string) $body;

        // Subdomain sudah ada — anggap OK
        if ($code === 409 || stripos($msg, 'already') !== false || stripos($msg, 'exists') !== false) {
            return ['success' => true, 'message' => 'Subdomain sudah ada'];
        }

        error_log('[SPPG] Hostinger provision gagal (' . $code . '): ' . $msg);
        return ['success' => false, 'message' => 'Gagal buat subdomain: ' . $msg];
    }
}
