<?php

namespace App\Controllers;

use App\Config\Database;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController {
    public function login(Request $request, Response $response): Response {
        $data = json_decode((string)$request->getBody(), true);
        
        // Handle text/plain payload if frontend hasn't been fully updated yet
        if (!$data && $request->getBody()->getSize() > 0) {
            $data = json_decode((string)$request->getBody(), true);
        }

        if (!is_array($data)) {
            $data = [];
        }

        $nip = trim((string)($data['nip'] ?? ''));
        $password = (string)($data['password'] ?? '');

        if (!$nip || !$password) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'NIP dan password wajib diisi']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT * FROM pengurus WHERE nip = :nip');
        $stmt->execute(['nip' => $nip]);
        $user = $stmt->fetch();

        if ($user) {
            $currentPw = trim((string)($user['pw'] ?? ''));
            if (empty($currentPw) || strlen($currentPw) < 64) {
                // First login
                $hashed = hash('sha256', $password);
                $updateStmt = $db->prepare('UPDATE pengurus SET pw = :pw WHERE id = :id');
                $updateStmt->execute(['pw' => $hashed, 'id' => $user['id']]);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'firstLogin' => true,
                    'user' => [
                        'id' => $user['id'],
                        'nip' => $user['nip'],
                        'name' => $user['nama'],
                        'jabatan' => $user['jabatan'],
                        'akses' => $user['akses']
                    ]
                ]);
            } else {
                $inputHash = hash('sha256', $password);
                if ($inputHash === $user['pw']) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'firstLogin' => false,
                        'user' => [
                            'id' => $user['id'],
                            'nip' => $user['nip'],
                            'name' => $user['nama'],
                            'jabatan' => $user['jabatan'],
                            'akses' => $user['akses']
                        ]
                    ]);
                } else {
                    return $this->jsonResponse($response, ['success' => false, 'message' => 'Password salah']);
                }
            }
        }

        return $this->jsonResponse($response, ['success' => false, 'message' => 'NIP tidak ditemukan']);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
