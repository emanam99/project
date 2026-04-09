<?php

namespace App\Services\PaymentGateway;

use App\Database;
use App\Services\PaymentGateway\PaymentGatewayConfig;
use App\Services\PaymentGateway\PaymentGatewayLogger;
use App\Services\WhatsAppService;

/**
 * Service class untuk integrasi iPaymu Payment Gateway
 * Menangani semua komunikasi dengan API iPaymu
 * 
 * Reference: https://documenter.getpostman.com/view/40296808/2sB3WtseBT?version=latest
 */
class iPaymuService
{
    private $db;
    private $config;
    private $apiKey;
    private $apiBaseUrl;

    /**
     * Verbose log dimatikan default agar error.log tidak penuh.
     * Aktifkan hanya saat investigasi gateway: IPAYMU_VERBOSE_LOG=true
     */
    private function isVerboseLogEnabled(): bool
    {
        return filter_var((string)(getenv('IPAYMU_VERBOSE_LOG') ?: 'false'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @param array|null $configOverride Jika diberikan, pakai config ini (untuk force production/sandbox). Jika null, pakai konfigurasi aktif dari DB.
     */
    public function __construct(?array $configOverride = null)
    {
        $this->db = Database::getInstance()->getConnection();
        $this->loadConfig($configOverride);
    }

    /**
     * Load konfigurasi aktif atau gunakan override
     * @param array|null $configOverride Config dari PaymentGatewayConfig::getConfigByMode() atau getActiveConfig()
     */
    private function loadConfig(?array $configOverride = null): void
    {
        $this->config = $configOverride !== null ? $configOverride : PaymentGatewayConfig::getActiveConfig();
        if ($this->config) {
            // Trim whitespace dari API Key dan VA untuk memastikan tidak ada spasi yang tidak perlu
            $this->apiKey = trim($this->config['api_key'] ?? '');
            if (isset($this->config['va'])) {
                $this->config['va'] = trim($this->config['va']);
            }
            $productionMode = (bool)($this->config['production_mode'] ?? 0);
            $this->apiBaseUrl = PaymentGatewayConfig::getApiBaseUrl($productionMode);
        }
    }

    /**
     * Cek apakah service sudah dikonfigurasi
     */
    public function isConfigured(): bool
    {
        return !empty($this->apiKey) && !empty($this->apiBaseUrl);
    }

    /**
     * Dapatkan konfigurasi saat ini
     */
    public function getConfig(): array
    {
        return $this->config ?? [];
    }

    /**
     * Buat request ke API iPaymu
     * @param string $endpoint Endpoint API (tanpa base URL)
     * @param string $method HTTP method (GET, POST, PUT, DELETE)
     * @param array $data Data untuk request body
     * @return array Response dari API
     */
    private function makeRequest(string $endpoint, string $method = 'POST', array $data = []): array
    {
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'message' => 'Payment gateway belum dikonfigurasi'
            ];
        }

        $url = rtrim($this->apiBaseUrl, '/') . '/' . ltrim($endpoint, '/');
        $startTime = microtime(true);

        try {
            $ch = curl_init();
            
            // Set headers sesuai dokumentasi iPaymu API v2
            // Format: va, signature, timestamp
            $timestamp = date('YmdHis');
            
            // PENTING: JSON body untuk signature HARUS sama persis dengan yang dikirim
            // Urutkan data berdasarkan key untuk konsistensi (case-sensitive sort)
            // Gunakan SORT_STRING untuk memastikan urutan konsisten
            ksort($data, SORT_STRING);
            
            // Encode JSON tanpa whitespace tambahan
            // Gunakan JSON_UNESCAPED_SLASHES sesuai contoh resmi iPayMu
            // JANGAN gunakan JSON_PRETTY_PRINT karena akan menambahkan whitespace
            $jsonBody = json_encode($data, JSON_UNESCAPED_SLASHES);
            
            // Pastikan tidak ada whitespace di awal atau akhir JSON
            $jsonBody = trim($jsonBody);
            
            // Validasi JSON encoding
            if (json_last_error() !== JSON_ERROR_NONE) {
                error_log("iPaymuService::makeRequest - JSON encoding error: " . json_last_error_msg());
                return [
                    'success' => false,
                    'message' => 'Error encoding JSON: ' . json_last_error_msg(),
                    'http_code' => 0
                ];
            }
            
            // Generate signature menggunakan format resmi iPayMu v2 (HMAC-SHA256)
            $signature = $this->generateSignatureFromJson($jsonBody, $method);
            
            // Pastikan VA sudah di-trim (tidak ada whitespace)
            $va = trim($this->config['va'] ?? '');
            
            // Headers untuk iPayMu API v2 (sesuai contoh resmi)
            $headers = [
                'Accept: application/json',
                'Content-Type: application/json',
                'va: ' . $va,
                'signature: ' . $signature,
                'timestamp: ' . $timestamp
            ];
            
            // Validasi API Key dan VA untuk sandbox
            if (!($this->config['production_mode'] ?? false)) {
                // Cek apakah API Key dan VA sesuai dengan sandbox default
                $expectedSandboxApiKey = 'SANDBOX4DAB4D9D-CDC3-4E17-AA87-6FECF01E5C13';
                $expectedSandboxVA = '0000002232999921';
                
                if (($this->apiKey !== $expectedSandboxApiKey || $va !== $expectedSandboxVA) && $this->isVerboseLogEnabled()) {
                    error_log("WARNING: API Key atau VA tidak sesuai dengan sandbox default!");
                    error_log("Current API Key: " . substr($this->apiKey, 0, 20) . "...");
                    error_log("Current VA: {$va}");
                    error_log("Expected API Key: {$expectedSandboxApiKey}");
                    error_log("Expected VA: {$expectedSandboxVA}");
                }
            }
            
            // Log request detail untuk debugging (hanya di sandbox mode)
            if (!($this->config['production_mode'] ?? false) && $this->isVerboseLogEnabled()) {
                error_log("=== iPaymuService::makeRequest DEBUG ===");
                error_log("URL: {$url}");
                error_log("Method: {$method}");
                error_log("Headers: " . json_encode($headers, JSON_UNESCAPED_UNICODE));
                error_log("JSON Body: {$jsonBody}");
                error_log("=========================================");
            }

            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => '',
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_HTTPHEADER => $headers,
            ]);

            if (in_array($method, ['POST', 'PUT', 'PATCH']) && !empty($data)) {
                // Gunakan JSON body yang sama dengan yang digunakan untuk signature
                curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
            }

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            $executionTime = microtime(true) - $startTime;

            if ($error) {
                PaymentGatewayLogger::logError(null, $endpoint, $method, $error, $data);
                return [
                    'success' => false,
                    'message' => 'CURL Error: ' . $error,
                    'http_code' => 0
                ];
            }

            $responseData = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $responseData = ['raw_response' => $response];
            }

            // Log response dengan detail error jika ada
            PaymentGatewayLogger::logResponse(null, $endpoint, $method, $responseData, $httpCode, $executionTime);
            
            // Jika error (400, 401, dll), log detail error
            if ($httpCode >= 400) {
                error_log("iPaymuService::makeRequest Error - HTTP Code: {$httpCode}, Endpoint: {$endpoint}, Response: " . json_encode($responseData, JSON_UNESCAPED_UNICODE));
                
                // Extract error message dari response
                $errorMessage = 'Gagal membuat transaksi di iPayMu';
                if (isset($responseData['Status']) && $responseData['Status'] != 200) {
                    $errorMessage = $responseData['Message'] ?? $responseData['message'] ?? $errorMessage;
                } elseif (isset($responseData['status']) && $responseData['status'] != 200) {
                    $errorMessage = $responseData['message'] ?? $responseData['Message'] ?? $errorMessage;
                }
                
                return [
                    'success' => false,
                    'message' => $errorMessage,
                    'data' => $responseData,
                    'http_code' => $httpCode,
                    'execution_time' => $executionTime
                ];
            }

            return [
                'success' => $httpCode >= 200 && $httpCode < 300,
                'data' => $responseData,
                'http_code' => $httpCode,
                'execution_time' => $executionTime
            ];
        } catch (\Exception $e) {
            $executionTime = microtime(true) - $startTime;
            PaymentGatewayLogger::logError(null, $endpoint, $method, $e->getMessage(), $data);
            
            return [
                'success' => false,
                'message' => $e->getMessage(),
                'http_code' => 0,
                'execution_time' => $executionTime
            ];
        }
    }

    /**
     * Generate signature untuk request iPaymu dari JSON body
     * Format signature sesuai dokumentasi resmi iPayMu v2:
     * 1. Hash SHA256 dari JSON body (lowercase)
     * 2. String to sign: POST:va:hash_sha256_json:apiKey
     * 3. Signature: HMAC-SHA256 dari string to sign dengan API Key sebagai key
     * 
     * Reference: https://github.com/ipaymu/ipaymu-payment-v2-sample-php
     * 
     * @param string $jsonBody JSON body yang akan dikirim (sudah di-encode)
     * @param string $method HTTP method (POST, GET, dll)
     * @return string Signature
     */
    private function generateSignatureFromJson(string $jsonBody, string $method = 'POST'): string
    {
        $va = trim($this->config['va'] ?? '');
        $apiKey = trim($this->apiKey ?? '');
        
        // Validasi VA dan API Key
        if (empty($va)) {
            error_log("iPaymuService::generateSignatureFromJson - ERROR: VA kosong!");
            throw new \Exception('VA (Virtual Account) belum dikonfigurasi');
        }
        if (empty($apiKey)) {
            error_log("iPaymuService::generateSignatureFromJson - ERROR: API Key kosong!");
            throw new \Exception('API Key belum dikonfigurasi');
        }
        
        // Step 1: Hash SHA256 dari JSON body (lowercase) - sesuai contoh resmi
        $requestBody = strtolower(hash('sha256', $jsonBody));
        
        // Step 2: String to sign: METHOD:va:hash_sha256_json:apiKey
        $stringToSign = strtoupper($method) . ':' . $va . ':' . $requestBody . ':' . $apiKey;
        
        // Step 3: HMAC-SHA256 dari string to sign dengan API Key sebagai key
        $signature = hash_hmac('sha256', $stringToSign, $apiKey);
        
        // Log untuk debugging (hanya di sandbox mode)
        if (!($this->config['production_mode'] ?? false) && $this->isVerboseLogEnabled()) {
            error_log("=== iPaymuService::generateSignatureFromJson DEBUG ===");
            error_log("Method: {$method}");
            error_log("VA: '{$va}' (length: " . strlen($va) . ")");
            error_log("JSON Body: '{$jsonBody}' (length: " . strlen($jsonBody) . ")");
            error_log("Request Body (SHA256): '{$requestBody}'");
            error_log("String To Sign: '{$stringToSign}'");
            error_log("API Key: '***' (length: " . strlen($apiKey) . ")");
            error_log("API Key (first 10 chars): " . substr($apiKey, 0, 10) . "...");
            error_log("Signature (HMAC-SHA256): {$signature}");
            error_log("Expected Format: HMAC-SHA256(POST:va:hash_sha256(jsonBody):apiKey, apiKey)");
            error_log("=====================================================");
        }
        
        return $signature;
    }

    /**
     * Verifikasi signature callback dari iPayMu (format v2: HMAC-SHA256).
     * StringToSign = METHOD:va:SHA256(rawBody):apiKey (sesuai dokumentasi iPayMu).
     * Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT
     *
     * @param string $method HTTP method (biasanya POST)
     * @param string $rawBody Raw request body persis seperti diterima (JSON atau form)
     * @param string $vaHeader Nilai header 'va' dari request
     * @param string $signatureHeader Nilai header 'signature' dari request
     * @return bool true jika signature valid
     */
    public function verifyCallbackSignature(string $method, string $rawBody, string $vaHeader, string $signatureHeader): bool
    {
        $va = trim($vaHeader);
        $apiKey = trim($this->apiKey ?? '');
        if (empty($apiKey) || empty($signatureHeader)) {
            return false;
        }
        $requestBodyHash = strtolower(hash('sha256', $rawBody));
        $stringToSign = strtoupper($method) . ':' . $va . ':' . $requestBodyHash . ':' . $apiKey;
        $expectedSignature = hash_hmac('sha256', $stringToSign, $apiKey);
        return hash_equals($expectedSignature, $signatureHeader);
    }
    
    /**
     * Generate signature untuk request iPaymu (deprecated - gunakan generateSignatureFromJson)
     * @param array $data Data request
     * @param string $method HTTP method
     * @return string Signature
     * @deprecated Gunakan generateSignatureFromJson untuk memastikan JSON body sama dengan request
     */
    private function generateSignature(array $data, string $method = 'POST'): string
    {
        // Urutkan array berdasarkan key untuk konsistensi
        ksort($data, SORT_STRING);
        
        // Pastikan format JSON sesuai dokumentasi iPayMu
        // Gunakan JSON_UNESCAPED_SLASHES sesuai contoh resmi
        $jsonBody = json_encode($data, JSON_UNESCAPED_SLASHES);
        
        // Validasi JSON encoding
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("iPaymuService::generateSignature - JSON encoding error: " . json_last_error_msg());
        }
        
        return $this->generateSignatureFromJson($jsonBody, $method);
    }

    /**
     * Expired (nilai + tipe) per method/channel sesuai ketentuan iPayMu.
     * BSI VA max 3 jam, BRI VA max 2 jam, BCA VA default 12 jam (tak bisa ubah),
     * CStore Alfamart/Indomaret default 24 jam, QRIS default 5 menit.
     * Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT
     *
     * @param string $paymentMethod va|cstore|qris|cod
     * @param string $paymentChannel bca|bri|bsi|alfamart|indomaret|...
     * @param array $paymentData data asli (untuk override expired dari input/config)
     * @return array { expired: int, expiredType: 'hours'|'minutes' }
     */
    public function getExpiredForChannel(string $paymentMethod, string $paymentChannel, array $paymentData = []): array
    {
        $channel = strtolower(trim($paymentChannel));
        if ($paymentMethod === 'qris') {
            return ['expired' => 5, 'expiredType' => 'minutes'];
        }
        if ($paymentMethod === 'cstore') {
            return ['expired' => 24, 'expiredType' => 'hours'];
        }
        if ($paymentMethod === 'va') {
            if ($channel === 'bri') {
                return ['expired' => 2, 'expiredType' => 'hours'];
            }
            if ($channel === 'bsi') {
                return ['expired' => 3, 'expiredType' => 'hours'];
            }
            if ($channel === 'bca') {
                return ['expired' => 12, 'expiredType' => 'hours'];
            }
            return ['expired' => (int)($paymentData['expired'] ?? $this->config['expired'] ?? 24), 'expiredType' => 'hours'];
        }
        return ['expired' => (int)($paymentData['expired'] ?? $this->config['expired'] ?? 24), 'expiredType' => 'hours'];
    }

    /**
     * Create payment/transaction di iPayMu (Payment Direct).
     * Request body mengikuti iPayMu Public API v2 (camelCase):
     * https://documenter.getpostman.com/view/40296808/2sB3WtseBT?version=latest
     *
     * Body yang dikirim (setelah ksort): amount, cancelUrl?, comments?, email, expired, expiredType,
     * name, notifyUrl, paymentChannel?, paymentMethod, phone, price?, product?, quantity?,
     * referenceId, returnUrl?
     * Header: Accept, Content-Type, va, signature, timestamp (signature = HMAC-SHA256).
     *
     * @param array $paymentData Data pembayaran
     * @return array Response dari iPayMu
     */
    public function createPayment(array $paymentData): array
    {
        // Validasi konfigurasi
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'message' => 'Payment gateway belum dikonfigurasi. Silakan konfigurasi API Key dan VA di pengaturan.'
            ];
        }
        
        // Validasi VA (Virtual Account)
        if (empty($this->config['va'])) {
            return [
                'success' => false,
                'message' => 'Virtual Account (VA) belum dikonfigurasi. Silakan konfigurasi VA di pengaturan.'
            ];
        }
        
        // Log request
        PaymentGatewayLogger::logRequest(null, 'payment/direct', 'POST', $paymentData);

        // Prepare data sesuai format iPaymu API v2
        // Pastikan semua field yang wajib terisi
        $amount = (float)($paymentData['amount'] ?? 0);
        // Tidak memaksa minimal Rp 100.000 di sini — nominal kecil (sisa tagihan PAUD/dll.) diteruskan ke API iPayMu.
        if ($amount <= 0) {
            return [
                'success' => false,
                'message' => 'Amount harus lebih dari 0'
            ];
        }

        $phone = $paymentData['phone'] ?? '';
        if (empty($phone)) {
            return [
                'success' => false,
                'message' => 'Phone wajib diisi'
            ];
        }

        // Format phone number untuk iPayMu: hapus semua karakter non-numeric
        // iPayMu memerlukan format: hanya angka (tanpa +62, spasi, atau karakter lain)
        $phone = preg_replace('/[^0-9]/', '', $phone);
        
        // Jika phone dimulai dengan 62 (kode negara Indonesia), hapus
        if (substr($phone, 0, 2) === '62') {
            $phone = substr($phone, 2);
        }
        
        // Jika phone dimulai dengan 0, hapus
        if (substr($phone, 0, 1) === '0') {
            $phone = substr($phone, 1);
        }
        
        // Validasi phone minimal 10 digit
        if (strlen($phone) < 10) {
            return [
                'success' => false,
                'message' => 'Nomor telepon tidak valid (minimal 10 digit)'
            ];
        }

        // Email: jika kosong, gunakan default email
        $email = $paymentData['email'] ?? '';
        if (empty($email)) {
            // Gunakan email default alutsmanipps@gmail.com
            $email = 'alutsmanipps@gmail.com';
        }
        
        // Validasi format email
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'success' => false,
                'message' => 'Format email tidak valid'
            ];
        }

        // Reference ID: pastikan tidak kosong dan unik
        $referenceId = $paymentData['reference_id'] ?? '';
        if (empty($referenceId)) {
            // Generate reference ID jika tidak ada
            $referenceId = 'PAY-' . date('YmdHis') . '-' . mt_rand(1000, 9999);
        }
        
        // Validasi reference ID (maksimal 50 karakter sesuai dokumentasi iPayMu)
        if (strlen($referenceId) > 50) {
            $referenceId = substr($referenceId, 0, 50);
        }

        // Build request data - urutkan sesuai abjad untuk konsistensi signature
        $paymentMethod = $paymentData['payment_method'] ?? 'va'; // va, cstore, qris, cod
        $paymentChannel = trim((string)($paymentData['payment_channel'] ?? ''));

        // Expired sesuai ketentuan iPayMu per method/channel (Ref: dokumentasi iPayMu API v2)
        // BSI VA max 3 jam, BRI VA max 2 jam, BCA VA default 12 jam (tak bisa ubah), CStore default 24 jam, QRIS default 5 menit
        $expiredRule = $this->getExpiredForChannel($paymentMethod, $paymentChannel, $paymentData);
        $requestData = [
            'amount' => $amount,
            'email' => $email,
            'expired' => $expiredRule['expired'],
            'expiredType' => $expiredRule['expiredType'],
            'name' => $paymentData['name'] ?? 'Pembayaran',
            'paymentMethod' => $paymentMethod,
            'phone' => $phone,
            'referenceId' => $referenceId,
        ];
        
        // NotifyUrl WAJIB diisi untuk iPayMu
        // Prioritas: 1. Dari paymentData, 2. Dari config, 3. Generate otomatis
        $notifyUrl = $paymentData['notify_url'] ?? $this->config['notify_url'] ?? '';
        
        // Jika masih kosong, generate otomatis berdasarkan base URL server
        if (empty($notifyUrl)) {
            // Deteksi protocol (https atau http)
            $protocol = 'https';
            if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
                // Cek juga X-Forwarded-Proto untuk reverse proxy
                if (!isset($_SERVER['HTTP_X_FORWARDED_PROTO']) || $_SERVER['HTTP_X_FORWARDED_PROTO'] !== 'https') {
                    $protocol = 'http';
                }
            }
            
            // Coba ambil host dari berbagai sumber
            $host = '';
            
            // Prioritas 1: HTTP_HOST (biasanya lebih akurat)
            if (!empty($_SERVER['HTTP_HOST'])) {
                $host = $_SERVER['HTTP_HOST'];
            }
            // Prioritas 2: SERVER_NAME
            elseif (!empty($_SERVER['SERVER_NAME'])) {
                $host = $_SERVER['SERVER_NAME'];
            }
            // Prioritas 3: HTTP_X_FORWARDED_HOST (untuk reverse proxy)
            elseif (!empty($_SERVER['HTTP_X_FORWARDED_HOST'])) {
                $host = $_SERVER['HTTP_X_FORWARDED_HOST'];
                // Ambil host pertama jika ada beberapa (dipisahkan koma)
                $host = trim(explode(',', $host)[0]);
            }
            
            // Jika masih kosong, gunakan default (untuk development)
            if (empty($host)) {
                $host = 'localhost';
            }
            
            // Hapus port jika ada (iPayMu mungkin tidak suka port di URL)
            $host = preg_replace('/:\d+$/', '', $host);
            
            // Generate notifyUrl
            $notifyUrl = $protocol . '://' . $host . '/api/payment-transaction/callback';
            
            // Log untuk debugging
            if (!($this->config['production_mode'] ?? false)) {
                error_log("iPaymuService::createPayment - Generate notifyUrl otomatis: {$notifyUrl}");
            }
        }
        
        // Pastikan notifyUrl tidak kosong dan valid
        if (empty($notifyUrl)) {
            error_log("iPaymuService::createPayment - ERROR: notifyUrl kosong!");
            return [
                'success' => false,
                'message' => 'Notify URL belum dikonfigurasi. Silakan set notify_url di pengaturan Payment Gateway.'
            ];
        }
        
        // Validasi format URL
        if (!filter_var($notifyUrl, FILTER_VALIDATE_URL)) {
            error_log("iPaymuService::createPayment - ERROR: notifyUrl tidak valid: {$notifyUrl}");
            return [
                'success' => false,
                'message' => 'Format Notify URL tidak valid: ' . $notifyUrl
            ];
        }
        
        // Selalu kirim notifyUrl ke iPayMu (wajib)
        $requestData['notifyUrl'] = $notifyUrl;

        // PaymentChannel: diperlukan untuk "va" dan "cstore"
        // Channel yang valid: 
        // - VA: bca, bni, bri, mandiri, permata, dll (lowercase)
        // - CStore: alfamart, indomaret (lowercase)
        // Jika paymentMethod adalah "va" dan payment_channel kosong, 
        // jangan kirim paymentChannel (biarkan iPayMu yang menentukan)
        if ($paymentMethod === 'va') {
            // Jika paymentMethod adalah "va", paymentChannel harus valid atau tidak dikirim sama sekali
            if (!empty($paymentChannel) && trim($paymentChannel) !== '') {
                // Pastikan paymentChannel dalam format lowercase sesuai dokumentasi iPayMu
                // Valid channel: bca, bni, bri, mandiri, permata, dll
                $requestData['paymentChannel'] = strtolower(trim($paymentChannel));
            }
            // Jika kosong, jangan kirim paymentChannel - iPayMu akan memberikan pilihan bank
        } elseif ($paymentMethod === 'cstore') {
            // Untuk CStore (Alfamart/Indomaret), paymentChannel WAJIB diisi
            if (empty($paymentChannel) || trim($paymentChannel) === '') {
                return [
                    'success' => false,
                    'message' => 'Payment channel wajib diisi untuk metode pembayaran CStore. Pilih Alfamart atau Indomaret.'
                ];
            }
            // Normalisasi channel untuk CStore (terima variasi input dari frontend/UI)
            $channelLower = strtolower(trim($paymentChannel));
            $cstoreAliases = [
                'alfa' => 'alfamart',
                'alfamart' => 'alfamart',
                'indo' => 'indomaret',
                'indomaret' => 'indomaret',
                'indomart' => 'indomaret',
            ];
            if (isset($cstoreAliases[$channelLower])) {
                $channelLower = $cstoreAliases[$channelLower];
            }
            $validCStoreChannels = ['alfamart', 'indomaret'];
            if (!in_array($channelLower, $validCStoreChannels)) {
                return [
                    'success' => false,
                    'message' => 'Payment channel tidak valid untuk CStore. Gunakan "alfamart" atau "indomaret". Input diterima: "' . $paymentChannel . '".'
                ];
            }
            $requestData['paymentChannel'] = $channelLower;
        } elseif ($paymentMethod === 'qris') {
            // Untuk QRIS, tidak perlu paymentChannel
            // QRIS mungkin tidak didukung di sandbox mode
            if (!($this->config['production_mode'] ?? false)) {
                error_log("WARNING: QRIS mungkin tidak didukung di sandbox mode iPayMu. Coba gunakan production mode atau metode pembayaran lain.");
            }
        } else {
            // Untuk paymentMethod lain (cod, dll), tidak perlu paymentChannel
            // Tapi jika ada, tetap kirim
            if (!empty($paymentChannel) && trim($paymentChannel) !== '') {
                $requestData['paymentChannel'] = strtolower(trim($paymentChannel));
            }
        }

        // Parameter "comments" — keterangan transaksi (ditampilkan di email/halaman iPayMu)
        if (isset($paymentData['comments']) && (string)$paymentData['comments'] !== '') {
            $requestData['comments'] = trim((string)$paymentData['comments']);
        }

        // Product/keterangan (array product, quantity, price) — opsional, bisa dipakai bersama/selain comments
        if (!empty($paymentData['product']) && is_array($paymentData['product'])) {
            if (isset($paymentData['product']['product']) && is_array($paymentData['product']['product'])) {
                $requestData['product'] = $paymentData['product']['product'];
                $requestData['quantity'] = $paymentData['product']['quantity'] ?? ['1'];
                $requestData['price'] = $paymentData['product']['price'] ?? [(string)(int)($amount)];
            } else {
                $requestData['product'] = $paymentData['product'];
            }
        }

        // returnUrl = redirect setelah pembayaran berhasil; cancelUrl = redirect saat user klik Batal di iPayMu
        // Penting untuk aplikasi daftar/mybeddian yang punya tombol cancel agar user kembali ke app
        // Tambahkan returnUrl dan cancelUrl hanya jika tidak kosong
        $returnUrl = $paymentData['return_url'] ?? $this->config['return_url'] ?? '';
        if (!empty($returnUrl)) {
            $requestData['returnUrl'] = $returnUrl;
        }
        $cancelUrl = $paymentData['cancel_url'] ?? $this->config['cancel_url'] ?? '';
        if (!empty($cancelUrl)) {
            $requestData['cancelUrl'] = $cancelUrl;
        }
        
        // PENTING: Urutkan berdasarkan key untuk memastikan konsistensi signature
        // Gunakan SORT_STRING untuk case-sensitive sort sesuai dokumentasi iPayMu
        ksort($requestData, SORT_STRING);
        
        // Hapus field kosong SETELAH sorting (iPayMu tidak menerima field kosong dalam signature)
        // Tapi jangan hapus nilai 0 atau false yang valid
        $requestData = array_filter($requestData, function($value) {
            // Hapus jika null atau empty string
            if ($value === null || $value === '') {
                return false;
            }
            // Untuk array, hapus jika kosong
            if (is_array($value)) {
                return !empty($value);
            }
            // Untuk boolean dan numeric, tetap kirim
            return true;
        }, ARRAY_FILTER_USE_BOTH);
        
        // Urutkan lagi setelah filter untuk memastikan konsistensi
        ksort($requestData, SORT_STRING);
        
        // Log untuk debugging (hanya di sandbox mode)
        if (!($this->config['production_mode'] ?? false) && $this->isVerboseLogEnabled()) {
            error_log("=== iPaymuService::createPayment DEBUG ===");
            error_log("Payment Method: {$paymentMethod}");
            error_log("Payment Channel Input: " . ($paymentChannel ?: '(kosong)'));
            error_log("Notify URL: {$notifyUrl}");
            error_log("Request Data keys: " . implode(', ', array_keys($requestData)));
            if (isset($requestData['paymentChannel'])) {
                error_log("PaymentChannel akan dikirim: '{$requestData['paymentChannel']}'");
            } else {
                error_log("PaymentChannel TIDAK dikirim (kosong atau tidak diperlukan)");
            }
            if (isset($requestData['returnUrl'])) {
                error_log("ReturnUrl akan dikirim: '{$requestData['returnUrl']}'");
            }
            if (isset($requestData['cancelUrl'])) {
                error_log("CancelUrl akan dikirim: '{$requestData['cancelUrl']}'");
            }
            error_log("=========================================");
        }

        $response = $this->makeRequest('payment/direct', 'POST', $requestData);

        return $response;
    }

    /**
     * Check status payment
     * @param string $sessionId Session ID dari iPaymu
     * @return array Response dari iPaymu
     */
    public function checkPaymentStatus(string $sessionId): array
    {
        $requestData = [
            'transactionId' => $sessionId
        ];

        PaymentGatewayLogger::logRequest(null, 'transaction', 'POST', $requestData);
        $response = $this->makeRequest('transaction', 'POST', $requestData);

        return $response;
    }

    /**
     * Get balance/cek saldo
     * @return array Response dari iPaymu
     */
    public function getBalance(): array
    {
        PaymentGatewayLogger::logRequest(null, 'balance', 'POST', []);
        $response = $this->makeRequest('balance', 'POST', []);

        return $response;
    }

    /**
     * Process callback dari iPaymu
     * @param array $callbackData Data callback dari iPaymu
     * @return array Hasil processing
     */
    public function processCallback(array $callbackData): array
    {
        try {
            // Normalisasi data callback dari iPayMu
            // iPayMu menggunakan 'sid' untuk session_id, 'via' untuk payment_method, 'channel' untuk payment_channel
            $sessionId = $callbackData['session_id'] ?? $callbackData['sid'] ?? null;
            $trxId = $callbackData['trx_id'] ?? null;
            $paymentMethod = $callbackData['payment_method'] ?? $callbackData['via'] ?? null;
            $paymentChannel = $callbackData['payment_channel'] ?? $callbackData['channel'] ?? null;
            $normalizedStatus = $this->mapStatusFromCallbackData($callbackData);

            // Idempotency: callback dengan session_id + trx_id sama hanya diproses sekali
            if ($sessionId !== null && $sessionId !== '' && $trxId !== null && $trxId !== '') {
                $stmt = $this->db->prepare("SELECT id FROM payment___callback WHERE session_id = ? AND trx_id = ? LIMIT 1");
                $stmt->execute([$sessionId, $trxId]);
                $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($existing) {
                    return [
                        'success' => true,
                        'callback_id' => (int) $existing['id'],
                        'message' => 'Callback sudah diproses (idempotent)'
                    ];
                }
            }

            // Log callback (jika error, jangan crash, lanjutkan proses)
            try {
                PaymentGatewayLogger::logCallback(null, $callbackData);
            } catch (\Exception $logError) {
                error_log("iPaymuService::processCallback - Logger error (non-fatal): " . $logError->getMessage());
            }
            
            // Parse paid_at dengan error handling
            $paidAt = null;
            if (isset($callbackData['paid_at']) && !empty($callbackData['paid_at'])) {
                try {
                    $paidAt = date('Y-m-d H:i:s', strtotime($callbackData['paid_at']));
                } catch (\Exception $e) {
                    error_log("iPaymuService::processCallback - Error parsing paid_at: " . $e->getMessage());
                }
            }

            // Simpan ke tabel payment___callback (termasuk fee, sub_total, total jika kolom ada - migrasi 56)
            $fee = $this->toNullableFloat($callbackData['fee'] ?? $callbackData['Fee'] ?? null);
            $subTotal = $this->toNullableFloat($callbackData['sub_total'] ?? $callbackData['SubTotal'] ?? null);
            $total = $this->toNullableFloat($callbackData['total'] ?? $callbackData['Total'] ?? null);

            $cols = $this->db->query("SHOW COLUMNS FROM payment___callback")->fetchAll(\PDO::FETCH_COLUMN);
            $hasFeeCols = in_array('fee', $cols, true) && in_array('sub_total', $cols, true) && in_array('total', $cols, true);

            if ($hasFeeCols) {
                $sql = "INSERT INTO payment___callback (
                    session_id, trx_id, reference_id, status, status_code, status_message,
                    amount, fee, sub_total, total, payment_method, payment_channel, paid_at, raw_data,
                    ip_address, user_agent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $params = [
                    $sessionId, $callbackData['trx_id'] ?? null, $callbackData['reference_id'] ?? null,
                    $normalizedStatus, $callbackData['status_code'] ?? $callbackData['Status'] ?? null, $callbackData['status_message'] ?? $callbackData['Message'] ?? null,
                    $callbackData['amount'] ?? null, $fee, $subTotal, $total,
                    $paymentMethod, $paymentChannel, $paidAt, json_encode($callbackData, JSON_UNESCAPED_UNICODE),
                    $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null
                ];
            } else {
                $sql = "INSERT INTO payment___callback (
                    session_id, trx_id, reference_id, status, status_code, status_message,
                    amount, payment_method, payment_channel, paid_at, raw_data,
                    ip_address, user_agent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $params = [
                    $sessionId, $callbackData['trx_id'] ?? null, $callbackData['reference_id'] ?? null,
                    $normalizedStatus, $callbackData['status_code'] ?? $callbackData['Status'] ?? null, $callbackData['status_message'] ?? $callbackData['Message'] ?? null,
                    $callbackData['amount'] ?? null, $paymentMethod, $paymentChannel, $paidAt,
                    json_encode($callbackData, JSON_UNESCAPED_UNICODE), $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null
                ];
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);

            $callbackId = $this->db->lastInsertId();
            error_log("iPaymuService::processCallback - Callback saved with ID: {$callbackId}");

            // Update payment transaction jika ada
            // iPayMu menggunakan 'sid' untuk session_id
            if ($sessionId) {
                error_log("iPaymuService::processCallback - Updating transaction for session_id: {$sessionId}");
                $this->updateTransactionFromCallback($callbackData);
            } else {
                error_log("iPaymuService::processCallback - No session_id found, skipping transaction update");
            }

            return [
                'success' => true,
                'callback_id' => $callbackId,
                'message' => 'Callback berhasil diproses'
            ];
        } catch (\PDOException $e) {
            error_log("iPaymuService::processCallback PDO error: " . $e->getMessage());
            error_log("iPaymuService::processCallback PDO error code: " . $e->getCode());
            return [
                'success' => false,
                'message' => 'Gagal memproses callback: ' . $e->getMessage()
            ];
        } catch (\Exception $e) {
            error_log("iPaymuService::processCallback error: " . $e->getMessage());
            error_log("iPaymuService::processCallback stack trace: " . $e->getTraceAsString());
            return [
                'success' => false,
                'message' => 'Gagal memproses callback: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Update payment transaction dari callback
     * @param array $callbackData Data callback
     */
    private function updateTransactionFromCallback(array $callbackData): void
    {
        try {
            // iPayMu menggunakan 'sid' untuk session_id
            $sessionId = $callbackData['session_id'] ?? $callbackData['sid'] ?? null;
            $referenceId = $callbackData['reference_id'] ?? null;
            
            if (!$sessionId && !$referenceId) {
                error_log("iPaymuService::updateTransactionFromCallback - session_id dan reference_id tidak ditemukan");
                return;
            }

            // Cari transaction berdasarkan session_id dulu, jika tidak ada cari berdasarkan reference_id
            $transaction = null;
            
            if ($sessionId) {
                $stmt = $this->db->prepare("SELECT id FROM payment___transaction WHERE session_id = ? LIMIT 1");
                $stmt->execute([$sessionId]);
                $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
                
                if ($transaction) {
                    error_log("iPaymuService::updateTransactionFromCallback - Transaction ditemukan berdasarkan session_id: {$sessionId}");
                }
            }
            
            // Jika tidak ditemukan berdasarkan session_id, coba berdasarkan reference_id
            if (!$transaction && $referenceId) {
                error_log("iPaymuService::updateTransactionFromCallback - Mencari transaction berdasarkan reference_id: {$referenceId}");
                $stmt = $this->db->prepare("SELECT id FROM payment___transaction WHERE reference_id = ? LIMIT 1");
                $stmt->execute([$referenceId]);
                $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
                
                if ($transaction) {
                    error_log("iPaymuService::updateTransactionFromCallback - Transaction ditemukan berdasarkan reference_id: {$referenceId}");
                    
                    // Update session_id di transaction jika belum ada
                    if ($sessionId) {
                        $updateSessionStmt = $this->db->prepare("UPDATE payment___transaction SET session_id = ? WHERE id = ?");
                        $updateSessionStmt->execute([$sessionId, $transaction['id']]);
                        error_log("iPaymuService::updateTransactionFromCallback - Session ID di-update: {$sessionId}");
                    }
                }
            }

            if (!$transaction) {
                error_log("iPaymuService::updateTransactionFromCallback - Transaction tidak ditemukan untuk session_id: " . ($sessionId ?? 'null') . ", reference_id: " . ($referenceId ?? 'null'));
                return;
            }

            $transactionId = $transaction['id'];
            $status = $this->mapStatusFromCallbackData($callbackData);

            // Validasi state: ambil status transaksi saat ini; hanya proses jika masih pending
            $stmtCurrent = $this->db->prepare("SELECT id, status FROM payment___transaction WHERE id = ? LIMIT 1");
            $stmtCurrent->execute([$transactionId]);
            $current = $stmtCurrent->fetch(\PDO::FETCH_ASSOC);
            $currentStatus = $current['status'] ?? 'pending';

            // Sudah paid: idempotent, hanya simpan notify_data (jangan kirim WA / update payment dua kali)
            if ($currentStatus === 'paid') {
                $this->db->prepare("UPDATE payment___transaction SET notify_data = ? WHERE id = ?")
                    ->execute([json_encode($callbackData, JSON_UNESCAPED_UNICODE), $transactionId]);
                return;
            }

            // Dibatalkan / kadaluarsa / gagal di aplikasi, tetapi iPayMu mengabarkan terbayar (user bayar pakai QR/VA yang sama)
            // → lanjut proses penuh di bawah agar pembayaran tercatat sukses.
            if (in_array($currentStatus, ['cancelled', 'expired', 'failed'], true) && $status === 'paid') {
                error_log("iPaymuService::updateTransactionFromCallback - Status lokal {$currentStatus} -> paid dari iPayMu, memproses pembayaran berhasil");
            } elseif (in_array($currentStatus, ['expired', 'failed', 'cancelled'], true)) {
                $this->db->prepare("UPDATE payment___transaction SET notify_data = ? WHERE id = ?")
                    ->execute([json_encode($callbackData, JSON_UNESCAPED_UNICODE), $transactionId]);
                return;
            }

            // Log untuk debugging
            error_log("iPaymuService::updateTransactionFromCallback - Transaction ID: {$transactionId}, Status: {$status} (from: " . ($callbackData['status'] ?? 'null') . ")");

            // Parse paid_at dari berbagai format
            $paidAt = null;
            if (isset($callbackData['paid_at'])) {
                try {
                    $paidAt = date('Y-m-d H:i:s', strtotime($callbackData['paid_at']));
                } catch (\Exception $e) {
                    error_log("iPaymuService::updateTransactionFromCallback - Error parsing paid_at: " . $e->getMessage());
                }
            }

            // Ambil settlement_status dari callback (settled/unsettled)
            $settlementStatus = $callbackData['settlement_status'] ?? null;
            $fee = isset($callbackData['fee']) ? (float) $callbackData['fee'] : null;
            $subTotal = isset($callbackData['sub_total']) ? (float) $callbackData['sub_total'] : null;
            $total = isset($callbackData['total']) ? (float) $callbackData['total'] : null;
            
            // Log untuk debugging
            error_log("iPaymuService::updateTransactionFromCallback - Settlement Status: " . ($settlementStatus ?? 'null'));

            // Update transaction (termasuk fee, sub_total, total dari callback iPayMu)
            $updateSql = "UPDATE payment___transaction SET 
                status = ?,
                status_code = ?,
                status_message = ?,
                paid_at = ?,
                notify_data = ?";
            
            $updateParams = [
                $status,
                $callbackData['status_code'] ?? null,
                $callbackData['status_message'] ?? $callbackData['status'] ?? null,
                $paidAt,
                json_encode($callbackData, JSON_UNESCAPED_UNICODE)
            ];
            
            // Kolom opsional: settlement_status, fee, sub_total, total (jika ada di DB)
            try {
                $cols = $this->db->query("SHOW COLUMNS FROM payment___transaction")->fetchAll(\PDO::FETCH_COLUMN);
                if (in_array('settlement_status', $cols, true)) {
                    $updateSql .= ", settlement_status = ?";
                    $updateParams[] = $settlementStatus;
                }
                if (in_array('fee', $cols, true)) {
                    $updateSql .= ", fee = ?";
                    $updateParams[] = $fee;
                }
                if (in_array('sub_total', $cols, true)) {
                    $updateSql .= ", sub_total = ?";
                    $updateParams[] = $subTotal;
                }
                if (in_array('total', $cols, true)) {
                    $updateSql .= ", total = ?";
                    $updateParams[] = $total;
                }
            } catch (\Exception $e) {
                // Kolom belum ada, skip
            }
            
            $updateSql .= " WHERE id = ?";
            $updateParams[] = $transactionId;

            $updateStmt = $this->db->prepare($updateSql);
            $updateStmt->execute($updateParams);

            // Update payment status berdasarkan status dan settlement_status.
            // Prinsip: kalau status = paid (terbayar), aplikasi langsung catat Success + insert psb___transaksi; tidak menunggu dana cair (settlement).
            // 1. Paid (settled/unsettled) → Update Success + insert psb___transaksi + WA (meski unsettled, tetap insert)
            // 2. Pending → tidak update payment status
            // 3. Expired/Failed → update ke Failed
            
            if ($status === 'paid') {
                // Paid = terbayar: langsung update Success + insert psb___transaksi (meski unsettled).
                $isSettled = ($settlementStatus === 'settled' || $settlementStatus === 'settle');
                $stmtCheck = $this->db->prepare("
                    SELECT p.id, p.tabel_referensi 
                    FROM payment p 
                    WHERE p.id = (SELECT id_payment FROM payment___transaction WHERE id = ?)
                ");
                $stmtCheck->execute([$transactionId]);
                $paymentData = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
                $alreadyHasTransaction = ($paymentData && $paymentData['tabel_referensi'] === 'psb___transaksi');

                if (!$alreadyHasTransaction) {
                    error_log("iPaymuService::updateTransactionFromCallback - Payment paid (" . ($isSettled ? 'settled' : 'unsettled') . "), updating to Success and inserting to psb___transaksi");
                    $this->updatePaymentStatus($transactionId, 'Success');
                } else {
                    error_log("iPaymuService::updateTransactionFromCallback - Payment paid, transaction already in psb___transaksi, ensuring status Success");
                    if ($paymentData) {
                        $this->db->prepare("UPDATE payment SET status = 'Success' WHERE id = ?")->execute([$paymentData['id']]);
                    }
                }
                $this->sendWaPembayaranBerhasilByTransactionId($transactionId);
            } elseif ($status === 'expired') {
                // 4. Expired - update payment status ke Failed + notif WA
                error_log("iPaymuService::updateTransactionFromCallback - Payment expired, updating to Failed");
                $this->updatePaymentStatusExpired($transactionId);
            } elseif ($status === 'failed') {
                // 5. Failed - update payment status ke Failed + notif WA
                error_log("iPaymuService::updateTransactionFromCallback - Payment failed, updating to Failed");
                $this->updatePaymentStatusFailed($transactionId);
            } elseif ($status === 'pending') {
                // 3. Pending - tidak perlu update payment status, tetap Pending
                error_log("iPaymuService::updateTransactionFromCallback - Payment still pending, no payment status update needed");
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updateTransactionFromCallback error: " . $e->getMessage());
            error_log("iPaymuService::updateTransactionFromCallback stack trace: " . $e->getTraceAsString());
        }
    }

    /**
     * Map status dari iPaymu ke status internal
     */
    private function mapStatus(string $ipaymuStatus): string
    {
        $statusMap = [
            'pending' => 'pending',
            'paid' => 'paid',
            'berhasil' => 'paid', // Status dari iPayMu dalam bahasa Indonesia
            'success' => 'paid',
            'expired' => 'expired',
            'failed' => 'failed',
            'gagal' => 'failed', // Status dari iPayMu dalam bahasa Indonesia
            'cancelled' => 'cancelled',
            'dibatalkan' => 'cancelled', // Status dari iPayMu dalam bahasa Indonesia
            'refunded' => 'refunded',
            'dikembalikan' => 'refunded', // Status dari iPayMu dalam bahasa Indonesia
            '1' => 'paid',
            '6' => 'paid',
            '0' => 'pending',
            '-1' => 'pending',
            '2' => 'cancelled',
            '3' => 'refunded',
        ];

        return $statusMap[strtolower($ipaymuStatus)] ?? 'pending';
    }

    /**
     * Normalisasi status callback iPayMu:
     * - Terima string (paid/success/berhasil, dll)
     * - Terima kode numerik status/status_code/transaction_status_code
     */
    private function mapStatusFromCallbackData(array $callbackData): string
    {
        $raw = $callbackData['status']
            ?? $callbackData['Status']
            ?? $callbackData['status_code']
            ?? $callbackData['transaction_status_code']
            ?? $callbackData['TransactionStatus']
            ?? $callbackData['PaymentStatus']
            ?? '';

        return $this->mapStatus((string) $raw);
    }

    private function toNullableFloat($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        return (float) $value;
    }

    /**
     * Update payment status berdasarkan payment ID
     * Public method untuk dipanggil dari controller
     * Method ini akan update payment status dan insert ke psb___transaksi jika perlu
     */
    public function updatePaymentStatusFromTransaction(int $idPayment): void
    {
        try {
            // Cari transaction berdasarkan id_payment dengan status paid
            $stmt = $this->db->prepare("SELECT id FROM payment___transaction WHERE id_payment = ? AND status = 'paid' ORDER BY id DESC LIMIT 1");
            $stmt->execute([$idPayment]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if ($transaction) {
                // Gunakan method updatePaymentStatus yang sudah ada
                $this->updatePaymentStatus($transaction['id'], 'Success');
            } else {
                // Jika tidak ada transaction dengan status paid, langsung update payment status saja
                // Ini untuk kasus di mana payment sudah di-update manual atau dari source lain
                $this->updatePaymentStatusDirect($idPayment, 'Success');
            }
            // Pastikan insert ke psb___transaksi (untuk fallback/sync dari API yang mungkin terlewat)
            $this->ensurePendaftaranTransactionInserted($idPayment);
            $this->ensureUwabaKhususTunggakanBayarInserted($idPayment);
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatusFromTransaction error: " . $e->getMessage());
        }
    }

    /**
     * Pastikan ada baris di tabel bayar (uwaba___bayar, uwaba___bayar_khusus, uwaba___bayar_tunggakan)
     * untuk payment Uwaba/Khusus/Tunggakan yang sudah Success/paid.
     * Dipanggil dari callback/sync setelah payment status Success.
     */
    public function ensureUwabaKhususTunggakanBayarInserted(int $idPayment): void
    {
        try {
            $cols = $this->db->query("SHOW COLUMNS FROM payment")->fetchAll(\PDO::FETCH_COLUMN);
            $hasTahunAjaranCol = in_array('tahun_ajaran', $cols, true);
            $sel = "SELECT id, status, jenis_pembayaran, id_referensi, tabel_referensi, id_santri, nominal" . ($hasTahunAjaranCol ? ", tahun_ajaran" : "") . " FROM payment WHERE id = ?";
            $stmt = $this->db->prepare($sel);
            $stmt->execute([$idPayment]);
            $p = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$p || (float)($p['nominal'] ?? 0) <= 0) {
                return;
            }
            $jenis = $p['jenis_pembayaran'] ?? '';
            $idReferensi = $p['id_referensi'] ?? null;
            $idSantri = $p['id_santri'] ?? null;
            $nominal = (float) $p['nominal'];
            // Untuk UWABA: tahun_ajaran format 1447-1448 (id_referensi INT hanya simpan 1447)
            $tahunAjaranPayment = $hasTahunAjaranCol && isset($p['tahun_ajaran']) && trim((string) $p['tahun_ajaran']) !== '' ? trim((string) $p['tahun_ajaran']) : null;

            if ($jenis === 'Pendaftaran') {
                return;
            }

            $paymentSuccess = (strtolower((string)($p['status'] ?? '')) === 'success');
            $stmtPt = $this->db->prepare("SELECT id FROM payment___transaction WHERE id_payment = ? AND status = 'paid' LIMIT 1");
            $stmtPt->execute([$idPayment]);
            $transactionPaid = (bool) $stmtPt->fetch(\PDO::FETCH_ASSOC);
            if (!$paymentSuccess && !$transactionPaid) {
                return;
            }

            if ($jenis === 'Uwaba' && $idSantri && ($tahunAjaranPayment !== null || $idReferensi !== null)) {
                $stmtCheck = $this->db->prepare("SELECT id FROM uwaba___bayar WHERE id_payment = ? LIMIT 1");
                $stmtCheck->execute([$idPayment]);
                if ($stmtCheck->fetch(\PDO::FETCH_ASSOC)) {
                    return;
                }
                // Prioritas kolom tahun_ajaran (1447-1448); fallback id_referensi (bisa 1447 karena INT)
                $tahunAjaran = $tahunAjaranPayment !== null ? $tahunAjaranPayment : (string) $idReferensi;
                $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM uwaba___bayar WHERE id_santri = ? AND tahun_ajaran = ?');
                $stmtCount->execute([$idSantri, $tahunAjaran]);
                $nomor = (int) $stmtCount->fetchColumn() + 1;
                $hijriyah = \App\Helpers\KalenderHelper::masehiToHijriyah($this->db, date('Y-m-d'), date('H:i:s'));
                $ins = $this->db->prepare("INSERT INTO uwaba___bayar (id_santri, tahun_ajaran, nominal, via, admin, id_admin, hijriyah, masehi, nomor, id_payment) VALUES (?, ?, ?, 'iPayMu', 'Online', NULL, ?, CURRENT_TIMESTAMP, ?, ?)");
                $ins->execute([$idSantri, $tahunAjaran, (int) round($nominal), $hijriyah, $nomor, $idPayment]);
                error_log("iPaymuService::ensureUwabaKhususTunggakanBayarInserted - Inserted uwaba___bayar for payment ID: {$idPayment}");
                return;
            }

            if ($jenis === 'Khusus' && $idReferensi && $idSantri) {
                $stmtCheck = $this->db->prepare("SELECT id FROM uwaba___bayar_khusus WHERE id_payment = ? LIMIT 1");
                $stmtCheck->execute([$idPayment]);
                if ($stmtCheck->fetch(\PDO::FETCH_ASSOC)) {
                    return;
                }
                $hijriyahK = \App\Helpers\KalenderHelper::masehiToHijriyah($this->db, date('Y-m-d'), date('H:i:s'));
                $ins = $this->db->prepare("INSERT INTO uwaba___bayar_khusus (id_khusus, id_santri, nominal, via, id_admin, admin, hijriyah, id_payment) VALUES (?, ?, ?, 'iPayMu', NULL, 'Online', ?, ?)");
                $ins->execute([$idReferensi, $idSantri, (int) round($nominal), $hijriyahK, $idPayment]);
                error_log("iPaymuService::ensureUwabaKhususTunggakanBayarInserted - Inserted uwaba___bayar_khusus for payment ID: {$idPayment}");
                return;
            }

            if ($jenis === 'Tunggakan' && $idReferensi && $idSantri) {
                $stmtCheck = $this->db->prepare("SELECT id FROM uwaba___bayar_tunggakan WHERE id_payment = ? LIMIT 1");
                $stmtCheck->execute([$idPayment]);
                if ($stmtCheck->fetch(\PDO::FETCH_ASSOC)) {
                    return;
                }
                $hijriyahT = \App\Helpers\KalenderHelper::masehiToHijriyah($this->db, date('Y-m-d'), date('H:i:s'));
                $ins = $this->db->prepare("INSERT INTO uwaba___bayar_tunggakan (id_tunggakan, id_santri, nominal, via, id_admin, admin, hijriyah, id_payment) VALUES (?, ?, ?, 'iPayMu', NULL, 'Online', ?, ?)");
                $ins->execute([$idReferensi, $idSantri, (int) round($nominal), $hijriyahT, $idPayment]);
                error_log("iPaymuService::ensureUwabaKhususTunggakanBayarInserted - Inserted uwaba___bayar_tunggakan for payment ID: {$idPayment}");
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::ensureUwabaKhususTunggakanBayarInserted error: " . $e->getMessage());
        }
    }

    /**
     * Pastikan ada baris di psb___transaksi untuk payment Pendaftaran yang sudah Success/paid.
     * Insert hanya jika: payment Pendaftaran + (payment.status = Success ATAU payment___transaction.status = paid).
     */
    public function ensurePendaftaranTransactionInserted(int $idPayment): void
    {
        try {
            $stmtCheck = $this->db->prepare("SELECT id FROM psb___transaksi WHERE id_payment = ? LIMIT 1");
            $stmtCheck->execute([$idPayment]);
            if ($stmtCheck->fetch(\PDO::FETCH_ASSOC)) {
                return; // sudah ada
            }
            $stmt = $this->db->prepare("SELECT id, status, jenis_pembayaran, id_referensi, tabel_referensi, id_santri, nominal FROM payment WHERE id = ?");
            $stmt->execute([$idPayment]);
            $p = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$p || ($p['jenis_pembayaran'] ?? '') !== 'Pendaftaran' || empty($p['id_referensi']) || (float)($p['nominal'] ?? 0) <= 0) {
                if ($p && ($p['jenis_pembayaran'] ?? '') === 'Pendaftaran') {
                    error_log("iPaymuService::ensurePendaftaranTransactionInserted - Skip: id_payment={$idPayment} tabel_referensi=" . ($p['tabel_referensi'] ?? 'null') . " nominal=" . ($p['nominal'] ?? 0));
                }
                return;
            }
            // id_referensi harus = id_registrasi (tabel_referensi psb___registrasi); kalau sudah psb___transaksi berarti sudah pernah insert
            if (($p['tabel_referensi'] ?? '') !== 'psb___registrasi') {
                return;
            }
            // Hanya insert jika pembayaran sudah berhasil: payment Success ATAU ada payment___transaction status paid
            $paymentSuccess = (strtolower((string)($p['status'] ?? '')) === 'success');
            $stmtPt = $this->db->prepare("SELECT id FROM payment___transaction WHERE id_payment = ? AND status = 'paid' LIMIT 1");
            $stmtPt->execute([$idPayment]);
            $transactionPaid = (bool) $stmtPt->fetch(\PDO::FETCH_ASSOC);
            if (!$paymentSuccess && !$transactionPaid) {
                error_log("iPaymuService::ensurePendaftaranTransactionInserted - Skip: id_payment={$idPayment} belum paid (payment.status=" . ($p['status'] ?? 'null') . ")");
                return;
            }
            // tabel_referensi boleh psb___registrasi atau belum di-update; id_referensi = id_registrasi
            $data = [
                'id_payment' => $idPayment,
                'id_registrasi' => $p['id_referensi'],
                'id_referensi' => $p['id_referensi'],
                'id_santri' => $p['id_santri'] ?? null,
                'nominal' => $p['nominal'],
            ];
            $this->insertToPendaftaranTransaction($data);
            error_log("iPaymuService::ensurePendaftaranTransactionInserted - Inserted to psb___transaksi for payment ID: {$idPayment}");
        } catch (\Exception $e) {
            error_log("iPaymuService::ensurePendaftaranTransactionInserted error: " . $e->getMessage());
        }
    }

    /**
     * Update payment status langsung tanpa transaction ID
     */
    private function updatePaymentStatusDirect(int $idPayment, string $status): void
    {
        try {
            // Get data payment
            $stmt = $this->db->prepare("SELECT jenis_pembayaran, id_referensi, tabel_referensi, id_santri, nominal FROM payment WHERE id = ?");
            $stmt->execute([$idPayment]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$data) {
                return;
            }

            $jenisPembayaran = $data['jenis_pembayaran'] ?? '';
            $nominal = $data['nominal'] ?? 0;
            $idReferensi = $data['id_referensi'] ?? null;
            $tabelReferensi = $data['tabel_referensi'] ?? '';
            $idSantri = $data['id_santri'] ?? null;

            // Update payment status
            $updateStmt = $this->db->prepare("UPDATE payment SET status = ? WHERE id = ?");
            $updateStmt->execute([$status, $idPayment]);

            // Jika status Success dan jenis_pembayaran adalah Pendaftaran, insert ke psb___transaksi
            if ($status === 'Success' && $jenisPembayaran === 'Pendaftaran') {
                // Jika tabel_referensi masih psb___registrasi, berarti belum ada transaksi
                // id_referensi adalah id_registrasi
                if ($tabelReferensi === 'psb___registrasi' && $idReferensi) {
                    $data['id_payment'] = $idPayment;
                    $data['id_registrasi'] = $idReferensi;
                    $this->insertToPendaftaranTransaction($data);
                }
            }
            if ($status === 'Success') {
                $this->ensureUwabaKhususTunggakanBayarInserted($idPayment);
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatusDirect error: " . $e->getMessage());
        }
    }

    /**
     * Update payment status untuk unsettled payment (berhasil tapi belum settled).
     * Tetap insert ke psb___transaksi karena pembayaran sudah berhasil (uang belum cair tapi sudah terbayar).
     */
    private function updatePaymentStatusUnsettled(int $transactionId): void
    {
        try {
            // Get id_payment dan data payment dari transaction
            $stmt = $this->db->prepare("
                SELECT pt.id_payment, p.jenis_pembayaran, p.id_referensi, p.tabel_referensi, 
                       p.id_santri, p.nominal
                FROM payment___transaction pt
                INNER JOIN payment p ON pt.id_payment = p.id
                WHERE pt.id = ?
            ");
            $stmt->execute([$transactionId]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$data || !$data['id_payment']) {
                return;
            }

            $idPayment = $data['id_payment'];

            // Update payment status ke Success
            $updateStmt = $this->db->prepare("UPDATE payment SET status = 'Success' WHERE id = ?");
            $updateStmt->execute([$idPayment]);

            // Meski unsettled, tetap insert ke psb___transaksi (pembayaran sudah berhasil)
            if (($data['jenis_pembayaran'] ?? '') === 'Pendaftaran' && ($data['tabel_referensi'] ?? '') === 'psb___registrasi' && !empty($data['id_referensi'])) {
                $data['id_payment'] = $idPayment;
                $data['id_registrasi'] = $data['id_referensi'];
                $this->insertToPendaftaranTransaction($data);
                error_log("iPaymuService::updatePaymentStatusUnsettled - Payment paid (unsettled), inserted to psb___transaksi for payment ID: {$idPayment}");
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatusUnsettled error: " . $e->getMessage());
        }
    }

    /**
     * Update payment status untuk expired payment
     */
    private function updatePaymentStatusExpired(int $transactionId): void
    {
        try {
            // Get id_payment dari transaction
            $stmt = $this->db->prepare("SELECT id_payment FROM payment___transaction WHERE id = ?");
            $stmt->execute([$transactionId]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$transaction || !$transaction['id_payment']) {
                return;
            }

            $idPayment = $transaction['id_payment'];

            // Update payment status ke Failed untuk expired
            $updateStmt = $this->db->prepare("UPDATE payment SET status = 'Failed' WHERE id = ?");
            $updateStmt->execute([$idPayment]);
            
            error_log("iPaymuService::updatePaymentStatusExpired - Payment status updated to Failed (expired) for payment ID: {$idPayment}");

            // Kirim WA notifikasi kadaluarsa: Pendaftaran -> santri; Uwaba/Khusus/Tunggakan -> users.no_wa (id_user)
            try {
                $stmtPay = $this->db->prepare("SELECT id_santri, jenis_pembayaran, id_user FROM payment WHERE id = ?");
                $stmtPay->execute([$idPayment]);
                $pay = $stmtPay->fetch(\PDO::FETCH_ASSOC);
                if (!$pay) {
                    // skip
                } elseif (in_array($pay['jenis_pembayaran'] ?? '', ['Uwaba', 'Khusus', 'Tunggakan'], true) && !empty($pay['id_user'])) {
                    $stmtU = $this->db->prepare("SELECT no_wa, username FROM users WHERE id = ? LIMIT 1");
                    $stmtU->execute([$pay['id_user']]);
                    $u = $stmtU->fetch(\PDO::FETCH_ASSOC);
                    $noWa = $u ? trim($u['no_wa'] ?? '') : '';
                    if ($noWa !== '') {
                        $nama = $u['username'] ?? 'Santri';
                        if (!empty($pay['id_santri'])) {
                            $stmtSn = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                            $stmtSn->execute([$pay['id_santri']]);
                            $sn = $stmtSn->fetch(\PDO::FETCH_ASSOC);
                            if ($sn && !empty($sn['nama'])) {
                                $nama = $sn['nama'];
                            }
                        }
                        WhatsAppService::sendPsbPembayaranKadaluarsa([$noWa], $nama, !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null);
                    }
                } elseif (($pay['jenis_pembayaran'] ?? '') === 'Pendaftaran' && !empty($pay['id_santri'])) {
                    $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                    $stmtSantri->execute([$pay['id_santri']]);
                    $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santri) {
                        $phoneNumbers = array_filter([trim($santri['no_telpon'] ?? ''), trim($santri['no_wa_santri'] ?? '')]);
                        WhatsAppService::sendPsbPembayaranKadaluarsa($phoneNumbers, $santri['nama'] ?? '', (int) $pay['id_santri']);
                    }
                }
            } catch (\Throwable $e) {
                error_log("iPaymuService::updatePaymentStatusExpired send WA error: " . $e->getMessage());
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatusExpired error: " . $e->getMessage());
        }
    }

    /**
     * Update payment status untuk failed payment + kirim WA notifikasi
     */
    private function updatePaymentStatusFailed(int $transactionId): void
    {
        try {
            $stmt = $this->db->prepare("SELECT id_payment FROM payment___transaction WHERE id = ?");
            $stmt->execute([$transactionId]);
            $transaction = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$transaction || !$transaction['id_payment']) {
                return;
            }
            $idPayment = $transaction['id_payment'];
            $this->db->prepare("UPDATE payment SET status = 'Failed' WHERE id = ?")->execute([$idPayment]);
            error_log("iPaymuService::updatePaymentStatusFailed - Payment status updated to Failed for payment ID: {$idPayment}");
            try {
                $stmtPay = $this->db->prepare("SELECT id_santri, jenis_pembayaran, id_user FROM payment WHERE id = ?");
                $stmtPay->execute([$idPayment]);
                $pay = $stmtPay->fetch(\PDO::FETCH_ASSOC);
                if (!$pay) {
                    // skip
                } elseif (in_array($pay['jenis_pembayaran'] ?? '', ['Uwaba', 'Khusus', 'Tunggakan'], true) && !empty($pay['id_user'])) {
                    $stmtU = $this->db->prepare("SELECT no_wa, username FROM users WHERE id = ? LIMIT 1");
                    $stmtU->execute([$pay['id_user']]);
                    $u = $stmtU->fetch(\PDO::FETCH_ASSOC);
                    $noWa = $u ? trim($u['no_wa'] ?? '') : '';
                    if ($noWa !== '') {
                        $nama = $u['username'] ?? 'Santri';
                        if (!empty($pay['id_santri'])) {
                            $stmtSn = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                            $stmtSn->execute([$pay['id_santri']]);
                            $sn = $stmtSn->fetch(\PDO::FETCH_ASSOC);
                            if ($sn && !empty($sn['nama'])) {
                                $nama = $sn['nama'];
                            }
                        }
                        WhatsAppService::sendPsbPembayaranGagal([$noWa], $nama, !empty($pay['id_santri']) ? (int) $pay['id_santri'] : null);
                    }
                } elseif (($pay['jenis_pembayaran'] ?? '') === 'Pendaftaran' && !empty($pay['id_santri'])) {
                    $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                    $stmtSantri->execute([$pay['id_santri']]);
                    $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santri) {
                        $phoneNumbers = array_filter([trim($santri['no_telpon'] ?? ''), trim($santri['no_wa_santri'] ?? '')]);
                        WhatsAppService::sendPsbPembayaranGagal($phoneNumbers, $santri['nama'] ?? '', (int) $pay['id_santri']);
                    }
                }
            } catch (\Throwable $e) {
                error_log("iPaymuService::updatePaymentStatusFailed send WA error: " . $e->getMessage());
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatusFailed error: " . $e->getMessage());
        }
    }

    /**
     * Kirim WA notifikasi pembayaran berhasil (dari callback) berdasarkan transaction id.
     * Pendaftaran -> santri no_telpon/no_wa_santri; Uwaba/Khusus/Tunggakan -> users.no_wa (id_user).
     */
    private function sendWaPembayaranBerhasilByTransactionId(int $transactionId): void
    {
        try {
            $cols = $this->db->query("SHOW COLUMNS FROM payment")->fetchAll(\PDO::FETCH_COLUMN);
            $hasIdUser = in_array('id_user', $cols, true);
            $sel = "SELECT pt.id_payment, p.nominal, p.jenis_pembayaran, p.id_santri" . ($hasIdUser ? ", p.id_user" : "") . " FROM payment___transaction pt INNER JOIN payment p ON pt.id_payment = p.id WHERE pt.id = ?";
            $stmt = $this->db->prepare($sel);
            $stmt->execute([$transactionId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return;
            }
            $nominal = (float) ($row['nominal'] ?? 0);
            $jenis = $row['jenis_pembayaran'] ?? '';
            $idSantri = !empty($row['id_santri']) ? (int) $row['id_santri'] : null;

            // Uwaba/Khusus/Tunggakan: prioritas users.no_wa (id_user), fallback ke santri no_telpon/no_wa_santri
            if (in_array($jenis, ['Uwaba', 'Khusus', 'Tunggakan'], true)) {
                $sent = false;
                if (!empty($row['id_user'])) {
                    $stmtU = $this->db->prepare("SELECT no_wa, username FROM users WHERE id = ? LIMIT 1");
                    $stmtU->execute([$row['id_user']]);
                    $u = $stmtU->fetch(\PDO::FETCH_ASSOC);
                    $noWa = $u ? trim($u['no_wa'] ?? '') : '';
                    if ($noWa !== '') {
                        $nama = $u['username'] ?? 'Santri';
                        if ($idSantri) {
                            $stmtSn = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                            $stmtSn->execute([$idSantri]);
                            $sn = $stmtSn->fetch(\PDO::FETCH_ASSOC);
                            if ($sn && !empty($sn['nama'])) {
                                $nama = $sn['nama'];
                            }
                        }
                        try {
                            WhatsAppService::sendPsbPembayaranBerhasil($noWa, $nama, $nominal, $idSantri);
                            $sent = true;
                        } catch (\Throwable $e) {
                            error_log("iPaymuService::sendWaPembayaranBerhasilByTransactionId (mybeddian): " . $e->getMessage());
                        }
                    }
                }
                if (!$sent && $idSantri) {
                    $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                    $stmtSantri->execute([$idSantri]);
                    $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santri) {
                        $phoneNumbers = WhatsAppService::getUniquePhoneNumbers([
                            trim($santri['no_telpon'] ?? ''),
                            trim($santri['no_wa_santri'] ?? ''),
                        ]);
                        if (!empty($phoneNumbers)) {
                            $nama = $santri['nama'] ?? '';
                            foreach ($phoneNumbers as $no) {
                                try {
                                    WhatsAppService::sendPsbPembayaranBerhasil($no, $nama, $nominal, $idSantri);
                                    $sent = true;
                                    break;
                                } catch (\Throwable $e) {
                                    error_log("iPaymuService::sendWaPembayaranBerhasilByTransactionId (fallback santri): " . $e->getMessage());
                                }
                            }
                        }
                    }
                }
                return;
            }

            if ($jenis !== 'Pendaftaran' || !$idSantri) {
                return;
            }
            $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
            $stmtSantri->execute([$idSantri]);
            $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return;
            }
            $phoneNumbers = WhatsAppService::getUniquePhoneNumbers([
                trim($santri['no_telpon'] ?? ''),
                trim($santri['no_wa_santri'] ?? ''),
            ]);
            if (empty($phoneNumbers)) {
                return;
            }
            $nama = $santri['nama'] ?? '';
            foreach ($phoneNumbers as $no) {
                try {
                    WhatsAppService::sendPsbPembayaranBerhasil($no, $nama, $nominal, $idSantri);
                } catch (\Throwable $e) {
                    error_log("iPaymuService::sendWaPembayaranBerhasilByTransactionId: " . $e->getMessage());
                }
            }
        } catch (\Throwable $e) {
            error_log("iPaymuService::sendWaPembayaranBerhasilByTransactionId error: " . $e->getMessage());
        }
    }

    /**
     * Update payment status berdasarkan transaction
     */
    private function updatePaymentStatus(int $transactionId, string $status): void
    {
        try {
            // Get id_payment dan data payment dari transaction
            $stmt = $this->db->prepare("
                SELECT pt.id_payment, p.jenis_pembayaran, p.id_referensi, p.tabel_referensi, 
                       p.id_santri, p.nominal
                FROM payment___transaction pt
                INNER JOIN payment p ON pt.id_payment = p.id
                WHERE pt.id = ?
            ");
            $stmt->execute([$transactionId]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$data || !$data['id_payment']) {
                return;
            }

            $idPayment = $data['id_payment'];
            $jenisPembayaran = $data['jenis_pembayaran'] ?? '';
            $nominal = $data['nominal'] ?? 0;
            $idReferensi = $data['id_referensi'] ?? null;
            $tabelReferensi = $data['tabel_referensi'] ?? '';

            // Update payment status
            $updateStmt = $this->db->prepare("UPDATE payment SET status = ? WHERE id = ?");
            $updateStmt->execute([$status, $idPayment]);

            // Jika status Success dan jenis_pembayaran adalah Pendaftaran, insert ke psb___transaksi
            if ($status === 'Success' && $jenisPembayaran === 'Pendaftaran') {
                // Jika tabel_referensi masih psb___registrasi, berarti belum ada transaksi
                // id_referensi adalah id_registrasi
                if ($tabelReferensi === 'psb___registrasi' && $idReferensi) {
                    $data['id_payment'] = $idPayment;
                    $data['id_registrasi'] = $idReferensi;
                    $this->insertToPendaftaranTransaction($data);
                }
            }
            if ($status === 'Success') {
                $this->ensureUwabaKhususTunggakanBayarInserted($idPayment);
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::updatePaymentStatus error: " . $e->getMessage());
        }
    }

    /**
     * Insert ke psb___transaksi ketika pembayaran iPayMu berhasil
     */
    private function insertToPendaftaranTransaction(array $paymentData): void
    {
        try {
            $idPayment = $paymentData['id_payment'] ?? null;
            $idRegistrasi = $paymentData['id_registrasi'] ?? $paymentData['id_referensi'] ?? null;
            $idSantri = $paymentData['id_santri'] ?? null;
            $nominal = $paymentData['nominal'] ?? 0;

            if (!$idPayment || !$idRegistrasi || $nominal <= 0) {
                error_log("iPaymuService::insertToPendaftaranTransaction: Missing required data. id_payment: {$idPayment}, id_registrasi: {$idRegistrasi}, nominal: {$nominal}");
                return;
            }

            // Cek apakah sudah ada transaksi untuk payment ini
            $stmtCheck = $this->db->prepare("SELECT id FROM psb___transaksi WHERE id_payment = ? LIMIT 1");
            $stmtCheck->execute([$idPayment]);
            $existing = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                // Sudah ada, skip
                error_log("iPaymuService::insertToPendaftaranTransaction: Transaction already exists for payment {$idPayment}");
                return;
            }

            // Jika id_santri belum ada, ambil dari registrasi
            if (!$idSantri) {
                $stmtGetSantri = $this->db->prepare("SELECT id_santri FROM psb___registrasi WHERE id = ?");
                $stmtGetSantri->execute([$idRegistrasi]);
                $registrasi = $stmtGetSantri->fetch(\PDO::FETCH_ASSOC);
                if ($registrasi) {
                    $idSantri = $registrasi['id_santri'] ?? null;
                }
            }

            // Get tanggal hijriyah dan masehi
            $masehi = date('Y-m-d');
            $hijriyah = null; // Bisa diambil dari API jika diperlukan

            $this->db->beginTransaction();

            try {
                // Insert ke psb___transaksi
                $sql = "INSERT INTO psb___transaksi (id_registrasi, id_santri, nominal, via, hijriyah, masehi, id_admin, pc, id_payment) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $idRegistrasi,
                    $idSantri,
                    $nominal,
                    'iPayMu',
                    $hijriyah,
                    $masehi,
                    null, // id_admin untuk iPayMu bisa null
                    'iPayMu',
                    $idPayment
                ]);

                $idTransaksi = $this->db->lastInsertId();

                // Update id_referensi di payment untuk link ke psb___transaksi
                $updateStmt = $this->db->prepare("UPDATE payment SET id_referensi = ?, tabel_referensi = 'psb___transaksi' WHERE id = ?");
                $updateStmt->execute([$idTransaksi, $idPayment]);

                // Update bayar, kurang, dan tanggal pembayaran pertama di psb___registrasi
                $sqlUpdate = "UPDATE psb___registrasi 
                             SET bayar = COALESCE(bayar, 0) + ?, 
                                 kurang = GREATEST(COALESCE(wajib, 0) - (COALESCE(bayar, 0) + ?), 0),
                                 keterangan_status = 'Belum Diverifikasi',
                                 tanggal_update = ?,
                                 tanggal_pembayaran_pertama = COALESCE(tanggal_pembayaran_pertama, ?)
                             WHERE id = ?";
                $stmtUpdate = $this->db->prepare($sqlUpdate);
                $tanggalUpdate = date('Y-m-d H:i:s');
                $stmtUpdate->execute([$nominal, $nominal, $tanggalUpdate, $tanggalUpdate, $idRegistrasi]);

                // Kirim notifikasi WA: pembayaran berhasil (nominal sudah terbayar)
                if ($idSantri) {
                    try {
                        $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                        $stmtSantri->execute([$idSantri]);
                        $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                        if ($santri) {
                            $noWa = trim($santri['no_wa_santri'] ?? '') ?: trim($santri['no_telpon'] ?? '');
                            if ($noWa !== '') {
                                WhatsAppService::sendPsbPembayaranBerhasil($noWa, $santri['nama'] ?? '', $nominal, $idSantri);
                            }
                        }
                    } catch (\Throwable $e) {
                        error_log("iPaymuService::insertToPendaftaranTransaction send WA error: " . $e->getMessage());
                    }
                }

                $this->db->commit();
                error_log("iPaymuService::insertToPendaftaranTransaction: Successfully inserted transaction {$idTransaksi} for payment {$idPayment}");
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }
        } catch (\Exception $e) {
            error_log("iPaymuService::insertToPendaftaranTransaction error: " . $e->getMessage());
        }
    }
}
