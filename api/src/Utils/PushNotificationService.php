<?php

namespace App\Utils;

use App\Database;
use App\Utils\VapidHelper;

/**
 * Service untuk mengirim Push Notifications ke subscribers
 * Menggunakan web-push library (perlu diinstall via Composer)
 */
class PushNotificationService
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Send push notification ke satu atau lebih pengurus
     * @param array $pengurusIds - Array of pengurus IDs
     * @param string $title - Judul notifikasi
     * @param string $body - Isi notifikasi
     * @param array $options - Opsi tambahan (url, icon, badge, data, dll)
     * @return array - Hasil pengiriman (success count, fail count, errors)
     */
    public function sendToPengurus(array $pengurusIds, string $title, string $body, array $options = []): array
    {
        error_log("PushNotificationService::sendToPengurus called for " . count($pengurusIds) . " pengurus");
        
        if (empty($pengurusIds)) {
            error_log("No pengurus IDs provided");
            return ['success' => 0, 'failed' => 0, 'errors' => []];
        }

        // Get semua subscriptions untuk pengurus yang ditargetkan
        $placeholders = implode(',', array_fill(0, count($pengurusIds), '?'));
        $sql = "SELECT endpoint, p256dh, auth 
                FROM pengurus___subscription 
                WHERE id_pengurus IN ($placeholders)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($pengurusIds);
        $subscriptions = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        error_log("Found " . count($subscriptions) . " subscriptions for pengurus IDs: " . json_encode($pengurusIds));

        if (empty($subscriptions)) {
            error_log("No subscriptions found in database");
            return ['success' => 0, 'failed' => 0, 'errors' => ['No subscriptions found']];
        }

        // Check apakah VAPID keys sudah dikonfigurasi
        if (!VapidHelper::isConfigured()) {
            $errorMsg = 'VAPID keys belum dikonfigurasi. Set VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY di .env';
            error_log("❌ " . $errorMsg);
            error_log("VAPID_PUBLIC_KEY: " . (VapidHelper::getPublicKey() ? 'SET' : 'EMPTY'));
            error_log("VAPID_PRIVATE_KEY: " . (VapidHelper::getPrivateKey() ? 'SET' : 'EMPTY'));
            return [
                'success' => 0,
                'failed' => count($subscriptions),
                'errors' => [$errorMsg]
            ];
        }
        
        error_log("VAPID keys configured, proceeding with push notification");

        // Prepare payload
        $payload = json_encode([
            'title' => $title,
            'body' => $body,
            'icon' => $options['icon'] ?? '/gambar/icon/icon192.png',
            'badge' => $options['badge'] ?? '/gambar/icon/icon128.png',
            'tag' => $options['tag'] ?? 'uwaba-notification',
            'data' => $options['data'] ?? [],
            'url' => $options['url'] ?? '/',
            'requireInteraction' => $options['requireInteraction'] ?? false,
            'vibrate' => $options['vibrate'] ?? [200, 100, 200],
            'silent' => $options['silent'] ?? false
        ]);

        $successCount = 0;
        $failCount = 0;
        $errors = [];

        error_log("Sending push notification to " . count($subscriptions) . " subscriptions");

        // Kirim ke setiap subscription
        foreach ($subscriptions as $index => $subscription) {
            try {
                error_log("Sending to subscription " . ($index + 1) . "/" . count($subscriptions) . " (endpoint: " . substr($subscription['endpoint'], 0, 50) . "...)");
                
                $result = $this->sendPushNotification(
                    $subscription['endpoint'],
                    $subscription['p256dh'],
                    $subscription['auth'],
                    $payload
                );

                if ($result['success']) {
                    $successCount++;
                    error_log("✅ Subscription " . ($index + 1) . " sent successfully");
                } else {
                    $failCount++;
                    $errorMsg = $result['error'] ?? 'Unknown error';
                    $errors[] = $errorMsg;
                    error_log("❌ Subscription " . ($index + 1) . " failed: " . $errorMsg);
                }
            } catch (\Exception $e) {
                $failCount++;
                $errorMsg = $e->getMessage();
                $errors[] = $errorMsg;
                error_log("❌ Subscription " . ($index + 1) . " exception: " . $errorMsg);
            }
        }

        error_log("Push notification summary: {$successCount} success, {$failCount} failed");

        return [
            'success' => $successCount,
            'failed' => $failCount,
            'errors' => $errors
        ];
    }

    /**
     * Send push notification ke satu subscription
     * @param string $endpoint - Push service endpoint
     * @param string $p256dh - P256DH public key
     * @param string $auth - Auth secret
     * @param string $payload - JSON payload
     * @return array - Hasil pengiriman
     */
    private function sendPushNotification(string $endpoint, string $p256dh, string $auth, string $payload): array
    {
        // Check apakah web-push library sudah terinstall
        if (!class_exists('\Minishlink\WebPush\WebPush')) {
            $error = 'Web-push library belum diinstall. Install dengan: composer require minishlink/web-push';
            error_log("❌ " . $error);
            return [
                'success' => false,
                'error' => $error
            ];
        }

        try {
            // Check apakah VAPID keys sudah dikonfigurasi
            if (!VapidHelper::isConfigured()) {
                $error = 'VAPID keys belum dikonfigurasi. Set VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY di .env';
                error_log("❌ " . $error);
                return [
                    'success' => false,
                    'error' => $error
                ];
            }

            $vapid = [
                'VAPID' => [
                    'subject' => VapidHelper::getSubject(),
                    'publicKey' => VapidHelper::getPublicKey(),
                    'privateKey' => VapidHelper::getPrivateKey()
                ]
            ];

            error_log("Creating WebPush instance...");
            $webPush = new \Minishlink\WebPush\WebPush($vapid);
            
            error_log("Creating Subscription object...");
            $subscription = \Minishlink\WebPush\Subscription::create([
                'endpoint' => $endpoint,
                'keys' => [
                    'p256dh' => $p256dh,
                    'auth' => $auth
                ]
            ]);

            error_log("Sending notification...");
            $result = $webPush->sendOneNotification($subscription, $payload);
            
            if ($result->isSuccess()) {
                error_log("✅ Notification sent successfully");
                return ['success' => true];
            } else {
                $error = $result->getReason();
                error_log("❌ Notification failed: " . $error);
                return [
                    'success' => false,
                    'error' => $error
                ];
            }
        } catch (\Exception $e) {
            $error = $e->getMessage();
            error_log("❌ Exception sending notification: " . $error);
            error_log("Stack trace: " . $e->getTraceAsString());
            return [
                'success' => false,
                'error' => $error
            ];
        }
    }

    /**
     * Send push notification ke semua pengurus dengan role tertentu
     * @param array $roles - Array of role keys (contoh: ['super_admin', 'admin_uwaba'])
     * @param string $title - Judul notifikasi
     * @param string $body - Isi notifikasi
     * @param array $options - Opsi tambahan
     * @return array - Hasil pengiriman
     */
    public function sendToRoles(array $roles, string $title, string $body, array $options = []): array
    {
        error_log("PushNotificationService::sendToRoles called with roles: " . json_encode($roles));
        
        if (empty($roles)) {
            error_log("No roles provided");
            return ['success' => 0, 'failed' => 0, 'errors' => []];
        }

        // Get pengurus IDs dengan role tertentu
        $placeholders = implode(',', array_fill(0, count($roles), '?'));
        $sql = "SELECT DISTINCT pr.pengurus_id 
                FROM pengurus___role pr
                INNER JOIN role r ON pr.role_id = r.id
                WHERE r.`key` IN ($placeholders)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($roles);
        $pengurusIds = array_column($stmt->fetchAll(\PDO::FETCH_ASSOC), 'pengurus_id');

        error_log("Found " . count($pengurusIds) . " pengurus with roles: " . json_encode($pengurusIds));

        if (empty($pengurusIds)) {
            error_log("No pengurus found with specified roles");
            return ['success' => 0, 'failed' => 0, 'errors' => ['No pengurus found with specified roles']];
        }

        return $this->sendToPengurus($pengurusIds, $title, $body, $options);
    }
}

