<?php

namespace App\Controllers;

use App\Helpers\AuthHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function redirect(Response $response, string $url, array $extraHeaders = []): Response
    {
        $response = $response->withHeader('Location', $url)->withStatus(302);
        foreach ($extraHeaders as $k => $v) {
            $response = $response->withHeader($k, $v);
        }
        return $response;
    }

    /** GET /auth/google?returnTo=/dashboard&frontend=http://192.168.x.x:5177 */
    public function googleStart(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $returnTo = (string) ($params['returnTo'] ?? '/tagihan');
        if ($returnTo === '' || $returnTo[0] !== '/') {
            $returnTo = '/tagihan';
        }
        $frontend = AuthHelper::resolveFrontendUrl($params['frontend'] ?? null);

        try {
            $url = AuthHelper::buildGoogleAuthUrl($returnTo, $frontend);
            return $this->redirect($response, $url);
        } catch (\Throwable $e) {
            $frontend = $frontend . '/login?error=' . rawurlencode($e->getMessage());
            return $this->redirect($response, $frontend);
        }
    }

    /** GET /auth/google/callback?code=&state= */
    public function googleCallback(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $state = AuthHelper::decodeOAuthState($params['state'] ?? null);
        $frontend = AuthHelper::resolveFrontendUrl($state['frontend'] ?? null);
        $returnTo = (string) ($state['returnTo'] ?? '/tagihan');
        if ($returnTo === '' || $returnTo[0] !== '/') {
            $returnTo = '/tagihan';
        }

        if (!empty($params['error'])) {
            $msg = (string) ($params['error_description'] ?? $params['error']);
            return $this->redirect($response, $frontend . '/login?error=' . rawurlencode($msg));
        }

        $code = (string) ($params['code'] ?? '');
        if ($code === '') {
            return $this->redirect($response, $frontend . '/login?error=' . rawurlencode('Kode Google tidak ditemukan'));
        }

        try {
            $profile = AuthHelper::exchangeGoogleCode($code);
            $user = AuthHelper::upsertGoogleUser($profile);
            $sessionId = AuthHelper::createSession((int) $user['id']);

            $target = $frontend . '/auth/callback'
                . '?token=' . rawurlencode($sessionId)
                . '&returnTo=' . rawurlencode($returnTo);

            return $this->redirect($response, $target, [
                'Set-Cookie' => AuthHelper::sessionCookieHeader($sessionId),
            ]);
        } catch (\Throwable $e) {
            return $this->redirect(
                $response,
                $frontend . '/login?error=' . rawurlencode($e->getMessage())
            );
        }
    }

    /** POST /auth/login  body: { email, password } */
    public function login(Request $request, Response $response): Response
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $email = (string) ($body['email'] ?? '');
        $password = (string) ($body['password'] ?? '');

        try {
            $result = AuthHelper::loginWithPassword($email, $password);
            $sessionId = $result['sessionId'];
            return $this->json($response, [
                'success' => true,
                'token' => $sessionId,
                'user' => AuthHelper::publicUser($result['user']),
            ])->withHeader('Set-Cookie', AuthHelper::sessionCookieHeader($sessionId));
        } catch (\Throwable $e) {
            return $this->json($response, [
                'success' => false,
                'message' => $e->getMessage(),
            ], 401);
        }
    }

    /** GET /auth/me */
    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!$user) {
            return $this->json($response, ['success' => false, 'message' => 'Belum login'], 401);
        }
        return $this->json($response, [
            'success' => true,
            'user' => AuthHelper::publicUser($user),
        ]);
    }

    /** POST /auth/logout */
    public function logout(Request $request, Response $response): Response
    {
        $sessionId = AuthHelper::extractSessionId($request);
        if ($sessionId) {
            AuthHelper::destroySession($sessionId);
        }
        return $this->json($response, ['success' => true, 'message' => 'Logout berhasil'])
            ->withHeader('Set-Cookie', AuthHelper::clearSessionCookieHeader());
    }
}
