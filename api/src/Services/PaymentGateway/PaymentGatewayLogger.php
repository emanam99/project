<?php

namespace App\Services\PaymentGateway;

use App\Database;

/**
 * Logger untuk Payment Gateway
 * Menyimpan log request/response ke tabel payment___log
 */
class PaymentGatewayLogger
{
    private static $db = null;

    /**
     * Dapatkan koneksi database
     */
    private static function getDb()
    {
        if (self::$db === null) {
            self::$db = Database::getInstance()->getConnection();
        }
        return self::$db;
    }

    /**
     * Log request ke iPaymu
     * @param int|null $idPaymentTransaction ID payment transaction
     * @param string $endpoint Endpoint yang dipanggil
     * @param string $method HTTP method
     * @param array $requestData Data request
     * @param float|null $executionTime Waktu eksekusi dalam detik
     * @return int|false ID log yang dibuat atau false jika gagal
     */
    public static function logRequest(?int $idPaymentTransaction, string $endpoint, string $method, array $requestData, ?float $executionTime = null): int|false
    {
        return self::log('request', $idPaymentTransaction, $endpoint, $method, $requestData, null, null, null, $executionTime);
    }

    /**
     * Log response dari iPaymu
     * @param int|null $idPaymentTransaction ID payment transaction
     * @param string $endpoint Endpoint yang dipanggil
     * @param string $method HTTP method
     * @param array $responseData Data response
     * @param int|null $statusCode HTTP status code
     * @param float|null $executionTime Waktu eksekusi dalam detik
     * @return int|false ID log yang dibuat atau false jika gagal
     */
    public static function logResponse(?int $idPaymentTransaction, string $endpoint, string $method, array $responseData, ?int $statusCode = null, ?float $executionTime = null): int|false
    {
        return self::log('response', $idPaymentTransaction, $endpoint, $method, null, $responseData, $statusCode, null, $executionTime);
    }

    /**
     * Log error
     * @param int|null $idPaymentTransaction ID payment transaction
     * @param string $endpoint Endpoint yang dipanggil
     * @param string $method HTTP method
     * @param string $errorMessage Pesan error
     * @param array|null $requestData Data request (jika ada)
     * @return int|false ID log yang dibuat atau false jika gagal
     */
    public static function logError(?int $idPaymentTransaction, string $endpoint, string $method, string $errorMessage, ?array $requestData = null): int|false
    {
        return self::log('error', $idPaymentTransaction, $endpoint, $method, $requestData, null, null, $errorMessage);
    }

    /**
     * Log callback dari iPaymu
     * @param int|null $idPaymentTransaction ID payment transaction
     * @param array $callbackData Data callback
     * @return int|false ID log yang dibuat atau false jika gagal
     */
    public static function logCallback(?int $idPaymentTransaction, array $callbackData): int|false
    {
        return self::log('callback', $idPaymentTransaction, 'callback', 'POST', null, $callbackData, null, null, null);
    }

    /**
     * Internal method untuk log
     */
    private static function log(string $type, ?int $idPaymentTransaction, string $endpoint, string $method, ?array $requestData, ?array $responseData, ?int $statusCode, ?string $errorMessage, ?float $executionTime = null): int|false
    {
        try {
            $db = self::getDb();
            
            // Get IP address dan user agent
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

            $sql = "INSERT INTO payment___log (
                id_payment_transaction, type, endpoint, method, 
                request_data, response_data, status_code, error_message, 
                execution_time, ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmt = $db->prepare($sql);
            $stmt->execute([
                $idPaymentTransaction,
                $type,
                $endpoint,
                $method,
                $requestData ? json_encode($requestData, JSON_UNESCAPED_UNICODE) : null,
                $responseData ? json_encode($responseData, JSON_UNESCAPED_UNICODE) : null,
                $statusCode,
                $errorMessage,
                $executionTime,
                $ipAddress,
                $userAgent
            ]);

            return $db->lastInsertId();
        } catch (\Exception $e) {
            error_log("PaymentGatewayLogger::log error: " . $e->getMessage());
            return false;
        }
    }
}
