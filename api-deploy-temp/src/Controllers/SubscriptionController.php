<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;

class SubscriptionController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Helper untuk JSON response
     */
    private function jsonResponse(Response $response, array $data, int $statusCode = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($statusCode);
    }

    /**
     * POST /api/subscription - Save subscription
     */
    public function saveSubscription(Request $request, Response $response): Response
    {
        try {
            error_log("=== Save Subscription Request ===");
            $data = $request->getParsedBody();
            error_log("Request data: " . json_encode($data));
            $user = $request->getAttribute('user');
            error_log("User: " . json_encode($user));
            
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            error_log("ID Pengurus: " . $idPengurus);
            
            if (!$idPengurus) {
                error_log("❌ User tidak terautentikasi");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak terautentikasi'
                ], 401);
            }

            $endpoint = $data['endpoint'] ?? null;
            $p256dh = $data['keys']['p256dh'] ?? null;
            $auth = $data['keys']['auth'] ?? null;
            $userAgent = $request->getHeaderLine('User-Agent');
            
            error_log("Endpoint: " . ($endpoint ? substr($endpoint, 0, 50) . '...' : 'NULL'));
            error_log("P256DH: " . ($p256dh ? 'SET' : 'NULL'));
            error_log("Auth: " . ($auth ? 'SET' : 'NULL'));

            if (!$endpoint || !$p256dh || !$auth) {
                error_log("❌ Data subscription tidak lengkap");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data subscription tidak lengkap'
                ], 400);
            }

            // Cek apakah endpoint sudah ada
            $sqlCheck = "SELECT id, id_pengurus FROM pengurus___subscription WHERE endpoint = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$endpoint]);
            $existing = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                error_log("✅ Endpoint sudah ada, updating...");
                // Update jika endpoint sudah ada (bisa dari user lain atau user yang sama)
                if ($existing['id_pengurus'] != $idPengurus) {
                    // Update ownership ke user yang sedang login
                    $sqlUpdate = "UPDATE pengurus___subscription 
                                 SET id_pengurus = ?, p256dh = ?, auth = ?, user_agent = ?
                                 WHERE endpoint = ?";
                    $stmtUpdate = $this->db->prepare($sqlUpdate);
                    $stmtUpdate->execute([$idPengurus, $p256dh, $auth, $userAgent, $endpoint]);
                    error_log("✅ Subscription ownership updated");
                } else {
                    // Update data subscription
                    $sqlUpdate = "UPDATE pengurus___subscription 
                                 SET p256dh = ?, auth = ?, user_agent = ?
                                 WHERE endpoint = ?";
                    $stmtUpdate = $this->db->prepare($sqlUpdate);
                    $stmtUpdate->execute([$p256dh, $auth, $userAgent, $endpoint]);
                    error_log("✅ Subscription data updated");
                }
                
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Subscription berhasil diupdate'
                ], 200);
            } else {
                error_log("📝 Endpoint baru, inserting...");
                // Insert baru
                $sqlInsert = "INSERT INTO pengurus___subscription (id_pengurus, endpoint, p256dh, auth, user_agent) 
                             VALUES (?, ?, ?, ?, ?)";
                $stmtInsert = $this->db->prepare($sqlInsert);
                $stmtInsert->execute([$idPengurus, $endpoint, $p256dh, $auth, $userAgent]);
                error_log("✅ Subscription inserted successfully, ID: " . $this->db->lastInsertId());
                
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Subscription berhasil disimpan'
                ], 201);
            }

        } catch (\Exception $e) {
            error_log("Save subscription error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan subscription: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/subscription - Get subscriptions untuk user yang sedang login
     */
    public function getSubscriptions(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            
            if (!$idPengurus) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak terautentikasi'
                ], 401);
            }

            $sql = "SELECT id, endpoint, p256dh, auth, user_agent, tanggal_dibuat, tanggal_update
                   FROM pengurus___subscription
                   WHERE id_pengurus = ?
                   ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idPengurus]);
            $subscriptions = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $subscriptions
            ], 200);

        } catch (\Exception $e) {
            error_log("Get subscriptions error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil subscriptions: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/subscription/{id} - Delete subscription
     */
    public function deleteSubscription(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            
            if (!$idPengurus) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak terautentikasi'
                ], 401);
            }

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID subscription tidak valid'
                ], 400);
            }

            // Cek ownership
            $sqlCheck = "SELECT id FROM pengurus___subscription WHERE id = ? AND id_pengurus = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$id, $idPengurus]);
            $subscription = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$subscription) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Subscription tidak ditemukan atau tidak memiliki akses'
                ], 404);
            }

            // Delete
            $sqlDelete = "DELETE FROM pengurus___subscription WHERE id = ?";
            $stmtDelete = $this->db->prepare($sqlDelete);
            $stmtDelete->execute([$id]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Subscription berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete subscription error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus subscription: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/subscription/endpoint - Delete subscription by endpoint
     */
    public function deleteSubscriptionByEndpoint(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $endpoint = $data['endpoint'] ?? null;
            $user = $request->getAttribute('user');
            $idPengurus = $user['user_id'] ?? $user['id'] ?? null;
            
            if (!$idPengurus) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak terautentikasi'
                ], 401);
            }

            if (!$endpoint) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Endpoint tidak valid'
                ], 400);
            }

            // Delete by endpoint (user bisa delete subscription mereka sendiri)
            $sqlDelete = "DELETE FROM pengurus___subscription WHERE endpoint = ? AND id_pengurus = ?";
            $stmtDelete = $this->db->prepare($sqlDelete);
            $stmtDelete->execute([$endpoint, $idPengurus]);

            if ($stmtDelete->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Subscription berhasil dihapus'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Subscription tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Delete subscription by endpoint error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus subscription: ' . $e->getMessage()
            ], 500);
        }
    }
}

