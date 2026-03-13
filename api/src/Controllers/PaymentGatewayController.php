<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Services\PaymentGateway\PaymentGatewayConfig;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PaymentGatewayController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/payment-gateway/config - Ambil semua konfigurasi payment gateway
     */
    public function getAllConfig(Request $request, Response $response): Response
    {
        try {
            $configs = PaymentGatewayConfig::getAllConfig();

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $configs
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting payment gateway config: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil konfigurasi payment gateway',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/payment-gateway/config/active - Ambil konfigurasi aktif
     */
    public function getActiveConfig(Request $request, Response $response): Response
    {
        try {
            $config = PaymentGatewayConfig::getActiveConfig();

            if (!$config) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada konfigurasi aktif'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $config
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting active payment gateway config: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil konfigurasi aktif',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/payment-gateway/config/{id} - Ambil konfigurasi berdasarkan ID
     */
    public function getConfigById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID konfigurasi tidak ditemukan'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM payment___config WHERE id = ?");
            $stmt->execute([$id]);
            $config = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$config) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Konfigurasi tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $config
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting payment gateway config by ID: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil konfigurasi',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/payment-gateway/config/{id} - Update konfigurasi
     */
    public function updateConfig(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID konfigurasi tidak ditemukan'
                ], 400);
            }

            $success = PaymentGatewayConfig::updateConfig($id, $input);

            if (!$success) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate atau terjadi kesalahan'
                ], 400);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Konfigurasi berhasil diupdate'
            ], 200);
        } catch (\Exception $e) {
            error_log("Error updating payment gateway config: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate konfigurasi',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/payment-gateway/config/switch-mode - Switch antara sandbox dan production
     */
    public function switchMode(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $input = is_array($input) ? TextSanitizer::sanitizeStringValues($input, []) : [];
            $productionMode = isset($input['production_mode']) ? (int)$input['production_mode'] : null;

            if ($productionMode === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'production_mode harus diisi (0 untuk sandbox, 1 untuk production)'
                ], 400);
            }

            $success = PaymentGatewayConfig::switchMode((bool)$productionMode);

            if (!$success) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada konfigurasi untuk mode ' . ($productionMode ? 'production' : 'sandbox')
                ], 400);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Mode berhasil diubah ke ' . ($productionMode ? 'Production' : 'Sandbox')
            ], 200);
        } catch (\Exception $e) {
            error_log("Error switching payment gateway mode: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah mode: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/payment-gateway/server-info - Ambil informasi server (IP, dll)
     */
    public function getServerInfo(Request $request, Response $response): Response
    {
        try {
            // Get server IP dari berbagai sumber
            $serverAddr = $_SERVER['SERVER_ADDR'] ?? null;
            
            // HTTP_HOST untuk mendapatkan domain
            $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
            
            // Coba dapatkan IP public untuk whitelist iPayMu
            // iPayMu memerlukan IP public server (bukan IP lokal)
            $publicIP = null;
            
            // Coba dari X-Forwarded-For (jika ada proxy/load balancer)
            if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                $forwardedIPs = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
                $firstIP = trim($forwardedIPs[0]);
                // Hanya ambil jika bukan IP lokal
                if (!preg_match('/^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $firstIP)) {
                    $publicIP = $firstIP;
                }
            }
            
            // Dari X-Real-IP (jika ada reverse proxy)
            if (!$publicIP && isset($_SERVER['HTTP_X_REAL_IP'])) {
                $realIP = $_SERVER['HTTP_X_REAL_IP'];
                if (!preg_match('/^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $realIP)) {
                    $publicIP = $realIP;
                }
            }
            
            // Coba dapatkan IP public dari eksternal service (opsional, bisa di-comment jika tidak diperlukan)
            // Note: Ini bisa lambat, jadi kita skip dulu
            // $externalIP = @file_get_contents('https://api.ipify.org');
            // if ($externalIP && filter_var(trim($externalIP), FILTER_VALIDATE_IP)) {
            //     $publicIP = trim($externalIP);
            // }
            
            // Jika masih belum ada, gunakan SERVER_ADDR (bisa IP lokal atau public)
            if (!$publicIP && $serverAddr) {
                $publicIP = $serverAddr;
            }
            
            // Get base URL untuk callback
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || 
                        (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')) 
                       ? 'https' : 'http';
            $baseUrl = $protocol . '://' . $host;
            
            // Get callback URL (full URL)
            $callbackUrl = $baseUrl . '/api/payment-transaction/callback';
            
            // Get notify URL (sama dengan callback)
            $notifyUrl = $callbackUrl;
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'server_ip' => $serverAddr,
                    'public_ip' => $publicIP,
                    'host' => $host,
                    'base_url' => $baseUrl,
                    'callback_url' => $callbackUrl,
                    'notify_url' => $notifyUrl,
                    'protocol' => $protocol,
                    'note' => $publicIP && preg_match('/^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $publicIP) 
                        ? 'IP yang ditampilkan adalah IP lokal. Untuk production, pastikan menggunakan IP public server yang dapat diakses dari internet.'
                        : 'IP ini dapat digunakan untuk whitelist di dashboard iPayMu.'
                ]
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting server info: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil informasi server',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
