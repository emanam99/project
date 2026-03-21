<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\AiTrainingRagHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DeepseekController
{
    private const BASE_URL = 'https://chat.deepseek.com/api/v0';

    private const HEADERS = [
        'User-Agent: DeepSeek/1.6.4 Android/35',
        'Accept: application/json',
        'x-client-platform: android',
        'x-client-version: 1.6.4',
        'x-client-locale: id',
        'x-client-bundle-id: com.deepseek.chat',
        'x-rangers-id: 7392079989945982465',
        'accept-charset: UTF-8',
        'Content-Type: application/json',
    ];

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withStatus($status);
    }

    /**
     * Eksekusi cURL POST JSON dengan retry ringan untuk jaringan local yang fluktuatif.
     *
     * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
     */
    private function curlPostJsonWithRetry(string $url, array $headers, array $payload): array
    {
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $attempts = 3;
        $last = [
            'raw' => false,
            'http_code' => 0,
            'curl_error' => 'unknown',
            'curl_errno' => -1,
        ];

        for ($i = 1; $i <= $attempts; $i++) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 60);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
            curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);

            $raw = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            $curlErrNo = curl_errno($ch);
            curl_close($ch);

            $last = [
                'raw' => $raw,
                'http_code' => $httpCode,
                'curl_error' => $curlErr,
                'curl_errno' => $curlErrNo,
            ];

            if ($raw !== false && $curlErr === '') {
                return $last;
            }

            // Retry hanya untuk masalah network/timeout.
            if (!in_array($curlErrNo, [6, 7, 28, 35, 52, 56], true)) {
                return $last;
            }
            usleep(300000 * $i); // 300ms, 600ms, 900ms
        }

        return $last;
    }

    /**
     * users.id untuk log ai___chat (kolom users_id → FK ke users.id, bukan PK; PK ai___chat adalah id).
     * Selaras AuthMiddleware (sesi V2): users_id JWT → pengurus.id_user → fallback user_id token.
     * Hanya mengembalikan id yang benar-benar ada di tabel users (hindari gagal FK / insert diam-diam).
     */
    private function resolveUsersId(array $payload, \PDO $db): ?int
    {
        $userIdFromToken = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);

        if (isset($payload['users_id']) && (int) $payload['users_id'] > 0) {
            $resolved = (int) $payload['users_id'];
        } elseif ($userIdFromToken > 0) {
            $stmt = $db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
            $stmt->execute([$userIdFromToken]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $resolved = ($row && !empty($row['id_user'])) ? (int) $row['id_user'] : $userIdFromToken;
        } else {
            return null;
        }

        if ($resolved < 1) {
            return null;
        }

        $stmt = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$resolved]);

        return $stmt->fetch(\PDO::FETCH_ASSOC) ? $resolved : null;
    }

    /**
     * Email + nama tampilan untuk ai___chat — tabel users tidak punya kolom nama; nama ada di pengurus (id_user).
     *
     * @return array{userName: string, userEmail: string}
     */
    private function fetchUserDisplayForAiChat(\PDO $db, int $usersId): array
    {
        try {
            $su = $db->prepare(
                'SELECT u.email AS email, u.username AS username, '
                . 'COALESCE(NULLIF(TRIM(p.nama), \'\'), NULLIF(TRIM(s.nama), \'\')) AS nama '
                . 'FROM users u '
                . 'LEFT JOIN pengurus p ON p.id_user = u.id '
                . 'LEFT JOIN santri s ON s.id_user = u.id '
                . 'WHERE u.id = ? LIMIT 1'
            );
            $su->execute([$usersId]);
            $ur = $su->fetch(\PDO::FETCH_ASSOC);
            if (!$ur) {
                return ['userName' => '', 'userEmail' => ''];
            }
            $userEmail = trim((string) ($ur['email'] ?? ''));
            $n = trim((string) ($ur['nama'] ?? ''));
            $u = trim((string) ($ur['username'] ?? ''));
            $userName = $n !== '' ? ($u !== '' ? $n . ' @' . $u : $n) : ($u !== '' ? $u : '');

            return ['userName' => $userName, 'userEmail' => $userEmail];
        } catch (\Throwable $e) {
            error_log('DeepseekController::fetchUserDisplayForAiChat ' . $e->getMessage());

            return ['userName' => '', 'userEmail' => ''];
        }
    }

    private function generateDeviceId(): string
    {
        $baseId = "BUelgEoBdkHyhwE8q/4YOodITQ1Ef99t7Y5KAR4CyHwdApr+lf4LJ+QAKXEUJ2lLtPQ+mmFtt6MpbWxpRmnWITA==";
        $chars = str_split($baseId);
        $start = 50;
        $end = 70;
        $possibleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        $changes = random_int(2, 4);

        for ($i = 0; $i < $changes; $i++) {
            $randomIndex = random_int($start, $end - 1);
            $chars[$randomIndex] = $possibleChars[random_int(0, strlen($possibleChars) - 1)];
        }

        return implode('', $chars);
    }

    /**
     * Cari token string secara rekursif dengan prioritas key umum auth.
     *
     * @param mixed $node
     */
    private function findTokenRecursive($node, int $depth = 0): ?string
    {
        if ($depth > 8) {
            return null;
        }
        if (!is_array($node)) {
            return null;
        }

        $priorityKeys = ['token', 'access_token', 'accessToken', 'jwt', 'jwt_token'];
        foreach ($priorityKeys as $k) {
            if (isset($node[$k]) && is_string($node[$k]) && trim($node[$k]) !== '') {
                return trim($node[$k]);
            }
        }

        foreach ($node as $value) {
            if (is_array($value)) {
                $found = $this->findTokenRecursive($value, $depth + 1);
                if ($found !== null && $found !== '') {
                    return $found;
                }
            }
        }
        return null;
    }

    /**
     * @return array{reply: string, thinking: string}
     */
    private function extractNodeChatPayload(array $result): array
    {
        $data = $result['data'] ?? null;
        if (!is_array($data)) {
            return ['reply' => '', 'thinking' => ''];
        }
        $reply = $data['response'] ?? $data['text'] ?? $data['content'] ?? '';
        if (!is_string($reply)) {
            $reply = is_scalar($reply) ? (string) $reply : '';
        }
        $thinking = isset($data['thinking']) && is_string($data['thinking']) ? $data['thinking'] : '';

        return ['reply' => $reply, 'thinking' => $thinking];
    }

    private function aiTablesReady(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___chat'");
            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Jumlah pasangan user→asisten terakhir dari ai___chat yang disisipkan ke konteks model. */
    private const RECENT_CHAT_CONTEXT_TURNS = 3;

    /**
     * Sesi tunggal chat utama (mode API) — satu utas per pengguna di klien eBeddien.
     */
    private const EBEDDIEN_MAIN_SESSION_ID = 'ebeddien-main';

    private function stripStoredAiResponseForContext(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return '';
        }
        $sep = "\n\n---\n[thinking]\n";
        $pos = strpos($s, $sep);
        if ($pos !== false) {
            return trim(substr($s, 0, $pos));
        }

        return $s;
    }

    /**
     * Pisahkan teks jawaban tersimpan (boleh berisi blok [thinking]) untuk tampilan UI.
     *
     * @return array{0: string, 1: string} [reply, thinking]
     */
    private function splitAiResponseForDisplay(string $full): array
    {
        $full = (string) $full;
        $sep = "\n\n---\n[thinking]\n";
        $pos = strpos($full, $sep);
        if ($pos !== false) {
            return [trim(substr($full, 0, $pos)), trim(substr($full, $pos + strlen($sep)))];
        }

        return [trim($full), ''];
    }

    /**
     * 3 percakapan terakhir (per baris ai___chat) untuk users_id + session_id, urutan kronologis.
     *
     * @return array<int, array{role:string,content:string}>
     */
    private function fetchLastNChatExchangesAsOpenAiMessages(\PDO $db, ?int $usersId, string $sessionId, int $n): array
    {
        if ($usersId === null || $usersId < 1 || $sessionId === '' || !$this->aiTablesReady($db)) {
            return [];
        }
        if (!$this->columnExists($db, 'ai___chat', 'users_id')) {
            return [];
        }

        $lim = max(1, min(20, $n));
        try {
            $sql = 'SELECT user_message, ai_response FROM ai___chat WHERE users_id = ? AND session_id = ? ORDER BY id DESC LIMIT ' . (int) $lim;
            $stmt = $db->prepare($sql);
            $stmt->execute([$usersId, $sessionId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if ($rows === []) {
                return [];
            }
            $rows = array_reverse($rows);
            $out = [];
            foreach ($rows as $row) {
                $u = trim((string) ($row['user_message'] ?? ''));
                $a = $this->stripStoredAiResponseForContext((string) ($row['ai_response'] ?? ''));
                if ($u === '' || $a === '') {
                    continue;
                }
                $out[] = ['role' => 'user', 'content' => $u];
                $out[] = ['role' => 'assistant', 'content' => $a];
            }

            return $out;
        } catch (\Throwable $e) {
            error_log('DeepseekController::fetchLastNChatExchangesAsOpenAiMessages ' . $e->getMessage());

            return [];
        }
    }

    /** Teks konteks percakapan untuk mode proxy (satu prompt). */
    private function buildRecentHistoryTextBlockForProxy(\PDO $db, ?int $usersId, string $sessionId, int $n): string
    {
        $msgs = $this->fetchLastNChatExchangesAsOpenAiMessages($db, $usersId, $sessionId, $n);
        if ($msgs === []) {
            return '';
        }
        $lines = ['[Ringkasan percakapan sebelumnya di sesi ini]'];
        foreach ($msgs as $m) {
            if ($m['role'] === 'user') {
                $lines[] = 'Pengguna: ' . $m['content'];
            } else {
                $lines[] = 'Asisten: ' . $m['content'];
            }
        }

        return implode("\n\n", $lines);
    }

    /**
     * Sesi DeepSeek → baris ai___training_sessions (deepseek_session_id unik).
     */
    private function ensureAiTrainingSession(\PDO $db, ?int $usersId, string $deepseekSessionId): ?int
    {
        if ($deepseekSessionId === '' || !$this->aiTablesReady($db)) {
            return null;
        }
        try {
            $chk = $db->prepare('SELECT id FROM ai___training_sessions WHERE deepseek_session_id = ? LIMIT 1');
            $chk->execute([$deepseekSessionId]);
            $row = $chk->fetch(\PDO::FETCH_ASSOC);
            if ($row && isset($row['id'])) {
                return (int) $row['id'];
            }

            $title = 'eBeddien';
            if ($usersId !== null && $usersId > 0) {
                $u = $db->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
                $u->execute([$usersId]);
                $ur = $u->fetch(\PDO::FETCH_ASSOC);
                if ($ur) {
                    $em = trim((string) ($ur['email'] ?? ''));
                    $title = $em !== '' ? 'eBeddien — ' . $em : 'eBeddien — user #' . $usersId;
                }
            }

            $hasUsersCol = $this->columnExists($db, 'ai___training_sessions', 'users_id');
            $hasDsCol = $this->columnExists($db, 'ai___training_sessions', 'deepseek_session_id');
            if (!$hasDsCol) {
                return null;
            }

            if ($hasUsersCol && $usersId !== null && $usersId > 0) {
                $ins = $db->prepare(
                    'INSERT INTO ai___training_sessions (title, status, users_id, deepseek_session_id) VALUES (?, \'draft\', ?, ?)'
                );
                $ins->execute([$title, $usersId, $deepseekSessionId]);
            } else {
                $ins = $db->prepare(
                    'INSERT INTO ai___training_sessions (title, status, deepseek_session_id) VALUES (?, \'draft\', ?)'
                );
                $ins->execute([$title, $deepseekSessionId]);
            }

            return (int) $db->lastInsertId();
        } catch (\Throwable $e) {
            error_log('DeepseekController::ensureAiTrainingSession ' . $e->getMessage());

            return null;
        }
    }

    private function columnExists(\PDO $db, string $table, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $st->execute([$table, $column]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Fallback jika jawaban tidak memuat `[kategori]`. */
    private const AI_CHAT_CATEGORY_DEFAULT = 'Lainnya';

    /**
     * Kategori untuk kolom ai___chat: isi dalam `[...]` di akhir jawaban, atau pasangan `[...]` terakhir.
     */
    private function extractCategoryFromAiReply(string $aiReply): string
    {
        $t = trim($aiReply);
        if ($t === '') {
            return self::AI_CHAT_CATEGORY_DEFAULT;
        }
        if (preg_match('/\[\s*([^\]]+)\s*\]\s*$/u', $t, $m)) {
            $c = trim($m[1]);
            if ($c !== '') {
                return $this->normalizeCategoryForDb($c);
            }
        }
        if (preg_match_all('/\[\s*([^\]]+)\s*\]/u', $t, $m)) {
            $last = end($m[1]);
            $c = trim((string) $last);
            if ($c !== '') {
                return $this->normalizeCategoryForDb($c);
            }
        }

        return self::AI_CHAT_CATEGORY_DEFAULT;
    }

    private function normalizeCategoryForDb(string $c): string
    {
        $c = trim($c);
        if ($c === '') {
            return self::AI_CHAT_CATEGORY_DEFAULT;
        }
        if (mb_strlen($c) > 255) {
            $c = mb_substr($c, 0, 252) . '...';
        }

        return $c;
    }

    /**
     * Log pasangan prompt + jawaban ke ai___chat dan (opsional) ai___training_messages.
     */
    private function persistAiExchange(
        \PDO $db,
        ?int $usersId,
        string $userDisplayName,
        string $userEmail,
        string $deepseekSessionId,
        string $prompt,
        string $aiReply,
        string $thinking
    ): void {
        if (!$this->aiTablesReady($db)) {
            return;
        }
        $fullAi = $aiReply;
        if ($thinking !== '') {
            $fullAi .= "\n\n---\n[thinking]\n" . $thinking;
        }
        $cat = $this->extractCategoryFromAiReply($aiReply);
        try {
            $hasUsersId = $this->columnExists($db, 'ai___chat', 'users_id');
            if ($hasUsersId && $usersId !== null && $usersId > 0) {
                $ins = $db->prepare(
                    'INSERT INTO ai___chat (users_id, user_message, ai_response, category, user_name, user_email, answer_type, session_id, model_used) '
                    . 'VALUES (?, ?, ?, ?, ?, ?, \'AI\', ?, \'ebeddien_assistant\')'
                );
                $ins->execute([
                    $usersId,
                    $prompt,
                    $fullAi,
                    $cat,
                    $userDisplayName !== '' ? $userDisplayName : null,
                    $userEmail !== '' ? $userEmail : null,
                    $deepseekSessionId !== '' ? $deepseekSessionId : null,
                ]);
            } else {
                $ins = $db->prepare(
                    'INSERT INTO ai___chat (user_message, ai_response, category, user_name, user_email, answer_type, session_id, model_used) '
                    . 'VALUES (?, ?, ?, ?, ?, \'AI\', ?, \'ebeddien_assistant\')'
                );
                $ins->execute([
                    $prompt,
                    $fullAi,
                    $cat,
                    $userDisplayName !== '' ? $userDisplayName : null,
                    $userEmail !== '' ? $userEmail : null,
                    $deepseekSessionId !== '' ? $deepseekSessionId : null,
                ]);
            }

            $internalSid = null;
            if ($this->columnExists($db, 'ai___training_sessions', 'deepseek_session_id')) {
                $q = $db->prepare('SELECT id FROM ai___training_sessions WHERE deepseek_session_id = ? LIMIT 1');
                $q->execute([$deepseekSessionId]);
                $r = $q->fetch(\PDO::FETCH_ASSOC);
                if ($r && isset($r['id'])) {
                    $internalSid = (int) $r['id'];
                }
            }
            if ($internalSid !== null && $internalSid > 0) {
                $m = $db->prepare(
                    'INSERT INTO ai___training_messages (session_id, sender, message, approved_as_training, created_at) VALUES (?, \'user\', ?, 0, NOW())'
                );
                $m->execute([$internalSid, $prompt]);
                $m2 = $db->prepare(
                    'INSERT INTO ai___training_messages (session_id, sender, message, approved_as_training, created_at) VALUES (?, \'ai\', ?, 0, NOW())'
                );
                $m2->execute([$internalSid, $fullAi]);
            }
        } catch (\Throwable $e) {
            $sqlState = $e instanceof \PDOException ? $e->errorInfo[0] ?? '' : '';
            error_log(
                'DeepseekController::persistAiExchange ' . $e->getMessage()
                . ($sqlState !== '' ? ' [SQLSTATE=' . $sqlState . ']' : '')
            );
        }
    }

    public function getAccount(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (!is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $db = Database::getInstance()->getConnection();
            $usersId = $this->resolveUsersId($payload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $stmt = $db->prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([$usersId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$user) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $email = trim((string) ($user['email'] ?? ''));
            if ($email === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Email di tabel users masih kosong. Isi email dulu untuk mode sambungan alternatif.',
                    'data' => ['user_id' => (int) $user['id'], 'email' => null],
                ], 400);
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'user_id' => (int) $user['id'],
                    'email' => $email,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('DeepseekController::getAccount ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    public function login(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (!is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $password = isset($body['password']) ? trim((string) $body['password']) : '';
            if ($password === '') {
                return $this->json($response, ['success' => false, 'message' => 'password wajib diisi'], 400);
            }

            $db = Database::getInstance()->getConnection();
            $usersId = $this->resolveUsersId($payload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $stmt = $db->prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([$usersId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            // Utamakan email dari users agar "langsung pilih email" dari akun login sekarang.
            $email = trim((string) ($user['email'] ?? ''));
            if ($email === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Email di tabel users masih kosong. Isi email dulu untuk mode sambungan alternatif.',
                ], 400);
            }

            $deepseekPayload = [
                'email' => $email,
                'password' => $password,
                'device_id' => $this->generateDeviceId(),
                'os' => 'android',
            ];

            $curlResult = $this->curlPostJsonWithRetry(self::BASE_URL . '/users/login', self::HEADERS, $deepseekPayload);
            $raw = $curlResult['raw'];
            $httpCode = $curlResult['http_code'];
            $curlErr = $curlResult['curl_error'];
            $curlErrNo = $curlResult['curl_errno'];
            $appEnv = strtolower((string) getenv('APP_ENV'));
            $isProduction = $appEnv === 'production';

            if ($raw === false || $curlErr !== '') {
                $payload502 = [
                    'success' => false,
                    'message' => 'Gagal menghubungi server penyedia (mode alternatif).',
                ];
                if (!$isProduction) {
                    $payload502['debug'] = [
                        'app_env' => $appEnv ?: 'unknown',
                        'curl_errno' => $curlErrNo,
                        'curl_error' => $curlErr,
                        'http_code' => $httpCode,
                    ];
                }
                return $this->json($response, $payload502, 502);
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                $payload502 = [
                    'success' => false,
                    'message' => 'Respons penyedia tidak valid',
                ];
                if (!$isProduction) {
                    $payload502['debug'] = [
                        'app_env' => $appEnv ?: 'unknown',
                        'http_code' => $httpCode,
                        'raw_preview' => substr($raw, 0, 600),
                    ];
                }
                return $this->json($response, $payload502, 502);
            }

            $bizCode = isset($decoded['data']['biz_code']) ? (int) $decoded['data']['biz_code'] : 0;
            if ($httpCode >= 400 || (isset($decoded['code']) && (int) $decoded['code'] !== 0) || $bizCode !== 0) {
                $bizMsg = isset($decoded['data']['biz_msg']) ? trim((string) $decoded['data']['biz_msg']) : '';
                $msg = isset($decoded['msg']) ? trim((string) $decoded['msg']) : '';
                if ($msg === '' && $bizMsg !== '') {
                    $msg = $bizMsg;
                }
                if ($msg === '') {
                    $msg = 'Login mode alternatif gagal';
                }
                if ($bizMsg === 'PASSWORD_OR_USER_NAME_IS_WRONG') {
                    $msg = 'Email akun users atau password penyedia salah.';
                }
                return $this->json($response, [
                    'success' => false,
                    'message' => $msg,
                    'deepseek_code' => $decoded['code'] ?? null,
                    'deepseek_biz_code' => $bizCode,
                ], 401);
            }

            $deepseekUser = $decoded['data']['biz_data']['user'] ?? null;
            $token = null;
            if (is_array($deepseekUser) && isset($deepseekUser['token']) && is_string($deepseekUser['token'])) {
                $token = trim($deepseekUser['token']);
            }
            if ($token === null || $token === '') {
                $candidates = [
                    $decoded['data']['biz_data']['token'] ?? null,
                    $decoded['data']['token'] ?? null,
                    $decoded['token'] ?? null,
                ];
                foreach ($candidates as $candidate) {
                    if (is_string($candidate) && trim($candidate) !== '') {
                        $token = trim($candidate);
                        break;
                    }
                }
            }
            if ($token === null || $token === '') {
                $token = $this->findTokenRecursive($decoded);
            }

            if ($token === null || $token === '') {
                $topKeys = implode(',', array_keys($decoded));
                error_log('DeepseekController::login token kosong. top_keys=' . $topKeys . ' raw=' . substr($raw, 0, 2000));
                $payload502 = [
                    'success' => false,
                    'message' => 'Login berhasil tetapi token tidak ditemukan dari respons penyedia. Coba login ulang.',
                ];
                if (!$isProduction) {
                    $payload502['debug'] = [
                        'app_env' => $appEnv ?: 'unknown',
                        'http_code' => $httpCode,
                        'top_keys' => array_keys($decoded),
                        'raw_preview' => substr($raw, 0, 600),
                    ];
                }
                return $this->json($response, $payload502, 502);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Login mode alternatif berhasil',
                'data' => [
                    'email' => $email,
                    'token' => $token,
                    'user' => $deepseekUser,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('DeepseekController::login ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * URL proxy Node internal (server → server). Default localhost:3456.
     * Set DEEPSEEK_PROXY_INTERNAL_URL di .env jika Node di host/port lain.
     */
    private function getNodeProxyBase(): string
    {
        $base = getenv('DEEPSEEK_PROXY_INTERNAL_URL');
        $base = is_string($base) ? trim($base) : '';
        if ($base === '') {
            $base = 'http://127.0.0.1:3456';
        }
        return rtrim($base, '/');
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    private function forwardPostToNode(string $path, array $payload, int $timeoutSeconds): ?array
    {
        $url = $this->getNodeProxyBase() . $path;
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return null;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json; charset=utf-8',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => 25,
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);

        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * POST /api/deepseek/proxy/session — body: { token }
     */
    public function proxySession(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $token = isset($body['token']) ? trim((string) $body['token']) : '';
            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'token wajib'], 400);
            }

            $result = $this->forwardPostToNode('/session', ['token' => $token], 120);
            if ($result === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Mode alternatif tidak terhubung. Pastikan layanan proxy (folder ai) berjalan di server.',
                ], 502);
            }

            if (!empty($result['success']) && !empty($result['data']['sessionId'])) {
                try {
                    $db = Database::getInstance()->getConnection();
                    $usersId = $this->resolveUsersId($userPayload, $db);
                    $this->ensureAiTrainingSession($db, $usersId, (string) $result['data']['sessionId']);
                } catch (\Throwable $e) {
                    error_log('DeepseekController::proxySession persist ' . $e->getMessage());
                }
            }

            return $this->json($response, $result, 200);
        } catch (\Throwable $e) {
            error_log('DeepseekController::proxySession ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * POST /api/deepseek/proxy/chat — body: token, sessionId, prompt, thinkingEnabled?, searchEnabled?
     */
    public function proxyChat(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }

            $token = isset($body['token']) ? trim((string) $body['token']) : '';
            $prompt = isset($body['prompt']) ? trim((string) $body['prompt']) : '';
            $sessionId = $body['sessionId'] ?? $body['chat_session_id'] ?? null;

            if ($token === '' || $prompt === '' || $sessionId === null || $sessionId === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'token, sessionId, dan prompt wajib diisi',
                ], 400);
            }

            $db = Database::getInstance()->getConnection();
            $usersIdForHistory = $this->resolveUsersId($userPayload, $db);
            $sessionStr = is_scalar($sessionId) ? (string) $sessionId : '';
            $historyBlock = $this->buildRecentHistoryTextBlockForProxy(
                $db,
                $usersIdForHistory,
                $sessionStr,
                self::RECENT_CHAT_CONTEXT_TURNS
            );

            $ragged = $prompt;
            try {
                $ragged = AiTrainingRagHelper::mergeIntoPrompt($db, $prompt);
            } catch (\Throwable $e) {
                error_log('DeepseekController::proxyChat RAG ' . $e->getMessage());
            }

            if ($historyBlock !== '') {
                $promptForModel = $historyBlock . "\n\n---\nPertanyaan saat ini:\n" . $ragged;
            } else {
                $promptForModel = $ragged;
            }

            $forward = [
                'token' => $token,
                'sessionId' => $sessionId,
                'prompt' => $promptForModel,
                'thinkingEnabled' => !empty($body['thinkingEnabled']),
                'searchEnabled' => !empty($body['searchEnabled']),
            ];
            $parentMid = $body['parentMessageId'] ?? $body['parent_message_id'] ?? null;
            if ($parentMid !== null && $parentMid !== '') {
                $forward['parentMessageId'] = is_scalar($parentMid) ? (string) $parentMid : '';
            }
            if (isset($forward['parentMessageId']) && $forward['parentMessageId'] === '') {
                unset($forward['parentMessageId']);
            }
            if (isset($body['clientUserTurn']) && is_numeric($body['clientUserTurn'])) {
                $forward['clientUserTurn'] = (int) $body['clientUserTurn'];
            }

            $result = $this->forwardPostToNode('/chat', $forward, 360);
            if ($result === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Mode alternatif tidak terhubung atau timeout. Pastikan layanan proxy (folder ai) berjalan.',
                ], 502);
            }

            if (!empty($result['success'])) {
                try {
                    $usersId = $this->resolveUsersId($userPayload, $db);
                    $userName = '';
                    $userEmail = '';
                    if ($usersId !== null && $usersId > 0) {
                        $disp = $this->fetchUserDisplayForAiChat($db, $usersId);
                        $userName = $disp['userName'];
                        $userEmail = $disp['userEmail'];
                    }
                    $extract = $this->extractNodeChatPayload($result);
                    $sessionStr = is_scalar($sessionId) ? (string) $sessionId : '';
                    $this->persistAiExchange(
                        $db,
                        $usersId,
                        $userName,
                        $userEmail,
                        $sessionStr,
                        $prompt,
                        $extract['reply'],
                        $extract['thinking']
                    );
                } catch (\Throwable $e) {
                    error_log('DeepseekController::proxyChat persist ' . $e->getMessage());
                }
            }

            return $this->json($response, $result, 200);
        } catch (\Throwable $e) {
            error_log('DeepseekController::proxyChat ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    private const DEEPSEEK_OPENAI_BASE = 'https://api.deepseek.com';

    /**
     * POST /api/deepseek/api-chat — superadmin only.
     * Memanggil https://api.deepseek.com/chat/completions (format OpenAI).
     *
     * Body JSON: { "model"?: "deepseek-chat"|"deepseek-reasoner", "messages": [...], "session_id"?: string }
     * atau { "prompt": "...", "model"?: ... } (satu giliran user).
     *
     * @param array<int, array{role:string,content:string}> $messages
     * @return array{raw:string|false,http_code:int,curl_error:string,curl_errno:int}
     */
    private function curlDeepseekOpenAiChat(string $apiKey, array $payload): array
    {
        $url = self::DEEPSEEK_OPENAI_BASE . '/chat/completions';
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($jsonPayload === false) {
            return [
                'raw' => false,
                'http_code' => 0,
                'curl_error' => 'json_encode failed',
                'curl_errno' => -2,
            ];
        }

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $apiKey,
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 180);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);

        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        $curlErrNo = curl_errno($ch);
        curl_close($ch);

        return [
            'raw' => $raw,
            'http_code' => $httpCode,
            'curl_error' => $curlErr,
            'curl_errno' => $curlErrNo,
        ];
    }

    /**
     * @param mixed $messages
     * @return array{0: bool, 1: string, 2: array<int, array{role:string,content:string}>|null}
     */
    private function normalizeOpenAiMessages($messages): array
    {
        if (!is_array($messages) || $messages === []) {
            return [false, 'messages harus array non-kosong dengan {role, content}', null];
        }
        $out = [];
        $maxItems = 40;
        $n = 0;
        foreach ($messages as $row) {
            if ($n >= $maxItems) {
                break;
            }
            if (!is_array($row)) {
                return [false, 'Setiap item messages harus object {role, content}', null];
            }
            $role = isset($row['role']) ? strtolower(trim((string) $row['role'])) : '';
            $content = isset($row['content']) ? trim((string) $row['content']) : '';
            if (!in_array($role, ['system', 'user', 'assistant'], true)) {
                return [false, 'role harus system, user, atau assistant', null];
            }
            if ($content === '') {
                return [false, 'content tidak boleh kosong', null];
            }
            if (mb_strlen($content) > 32000) {
                return [false, 'Satu pesan terlalu panjang (maks. 32000 karakter)', null];
            }
            $out[] = ['role' => $role, 'content' => $content];
            $n++;
        }
        if ($out === []) {
            return [false, 'messages kosong setelah normalisasi', null];
        }

        return [true, '', $out];
    }

    /**
     * POST /api/deepseek/api-chat
     */
    public function directApiChat(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $apiKey = trim((string) (getenv('DEEPSEEK_API_KEY') ?: ''));
            if ($apiKey === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kunci API asisten belum di-set di lingkungan server (.env API).',
                ], 503);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }

            $model = isset($body['model']) ? trim((string) $body['model']) : 'deepseek-chat';
            if ($model === '') {
                $model = 'deepseek-chat';
            }
            $allowedModels = ['deepseek-chat', 'deepseek-reasoner'];
            if (!in_array($model, $allowedModels, true)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Model tidak didukung untuk mode ini.',
                ], 400);
            }

            $messages = $body['messages'] ?? null;
            if ($messages === null && isset($body['prompt'])) {
                $p = trim((string) $body['prompt']);
                if ($p === '') {
                    return $this->json($response, ['success' => false, 'message' => 'prompt atau messages wajib'], 400);
                }
                $messages = [['role' => 'user', 'content' => $p]];
            }

            [$ok, $err, $normMessages] = $this->normalizeOpenAiMessages($messages);
            if (!$ok || $normMessages === null) {
                return $this->json($response, ['success' => false, 'message' => $err], 400);
            }

            $sessionKey = isset($body['session_id']) ? trim((string) $body['session_id']) : '';
            if ($sessionKey === '') {
                $sessionKey = self::EBEDDIEN_MAIN_SESSION_ID;
            }

            $db = Database::getInstance()->getConnection();
            $usersId = $this->resolveUsersId($userPayload, $db);

            /** Satu giliran user dari klien: sisipkan 3 percakapan terakhir dari ai___chat (users_id + session_id). */
            $singleUserTurn =
                count($normMessages) === 1
                && isset($normMessages[0]['role'])
                && $normMessages[0]['role'] === 'user';
            if ($singleUserTurn && $usersId !== null) {
                $hist = $this->fetchLastNChatExchangesAsOpenAiMessages(
                    $db,
                    $usersId,
                    $sessionKey,
                    self::RECENT_CHAT_CONTEXT_TURNS
                );
                if ($hist !== []) {
                    $normMessages = array_merge($hist, $normMessages);
                }
            }

            $lastUserIdx = null;
            for ($i = count($normMessages) - 1; $i >= 0; $i--) {
                if ($normMessages[$i]['role'] === 'user') {
                    $lastUserIdx = $i;
                    break;
                }
            }
            $lastUserOriginal = '';
            if ($lastUserIdx !== null) {
                $lastUserOriginal = $normMessages[$lastUserIdx]['content'];
                try {
                    $merged = AiTrainingRagHelper::mergeIntoPrompt($db, $normMessages[$lastUserIdx]['content']);
                    $normMessages[$lastUserIdx]['content'] = $merged;
                } catch (\Throwable $e) {
                    error_log('DeepseekController::directApiChat RAG ' . $e->getMessage());
                }
            }

            array_unshift($normMessages, [
                'role' => 'system',
                'content' => AiTrainingRagHelper::getEbeddienAssistantSystemPrompt(),
            ]);

            $temperature = $body['temperature'] ?? null;
            $payload = [
                'model' => $model,
                'messages' => $normMessages,
                'stream' => false,
            ];
            if (is_numeric($temperature)) {
                $t = (float) $temperature;
                if ($t >= 0 && $t <= 2) {
                    $payload['temperature'] = $t;
                }
            }

            $curlResult = $this->curlDeepseekOpenAiChat($apiKey, $payload);
            $raw = $curlResult['raw'];
            $httpCode = $curlResult['http_code'];
            $appEnv = strtolower((string) getenv('APP_ENV'));
            $isProduction = $appEnv === 'production';

            if ($raw === false || $curlResult['curl_error'] !== '') {
                $payloadErr = [
                    'success' => false,
                    'message' => 'Gagal menghubungi layanan asisten.',
                ];
                if (!$isProduction) {
                    $payloadErr['debug'] = [
                        'curl_errno' => $curlResult['curl_errno'],
                        'curl_error' => $curlResult['curl_error'],
                        'http_code' => $httpCode,
                    ];
                }
                return $this->json($response, $payloadErr, 502);
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Respons layanan asisten tidak valid.',
                ], 502);
            }

            if ($httpCode >= 400) {
                $errMsg = isset($decoded['error']['message']) ? (string) $decoded['error']['message'] : 'Layanan asisten mengembalikan error.';
                return $this->json($response, [
                    'success' => false,
                    'message' => $errMsg,
                    'provider_error' => $decoded['error'] ?? null,
                ], $httpCode >= 500 ? 502 : 400);
            }

            $choice = $decoded['choices'][0] ?? null;
            $msg = is_array($choice) ? ($choice['message'] ?? null) : null;
            $content = '';
            $reasoning = '';
            if (is_array($msg)) {
                if (isset($msg['content']) && is_string($msg['content'])) {
                    $content = $msg['content'];
                }
                if (isset($msg['reasoning_content']) && is_string($msg['reasoning_content'])) {
                    $reasoning = $msg['reasoning_content'];
                }
            }

            $usage = isset($decoded['usage']) && is_array($decoded['usage']) ? $decoded['usage'] : null;

            try {
                $userName = '';
                $userEmail = '';
                if ($usersId !== null && $usersId > 0) {
                    $disp = $this->fetchUserDisplayForAiChat($db, $usersId);
                    $userName = $disp['userName'];
                    $userEmail = $disp['userEmail'];
                }
                $lastUserText = $lastUserOriginal !== '' ? $lastUserOriginal : (isset($body['prompt']) ? trim((string) $body['prompt']) : '');
                $this->persistAiExchange(
                    $db,
                    $usersId,
                    $userName,
                    $userEmail,
                    $sessionKey,
                    $lastUserText !== '' ? $lastUserText : '(api-chat)',
                    $content,
                    $reasoning
                );
            } catch (\Throwable $e) {
                $sqlState = $e instanceof \PDOException ? $e->errorInfo[0] ?? '' : '';
                error_log(
                    'DeepseekController::directApiChat persist ' . $e->getMessage()
                    . ($sqlState !== '' ? ' [SQLSTATE=' . $sqlState . ']' : '')
                );
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'message' => $content,
                    'reasoning' => $reasoning !== '' ? $reasoning : null,
                    'model' => $model,
                    'usage' => $usage,
                    'raw_id' => $decoded['id'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('DeepseekController::directApiChat ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    private function trainingTableExists(\PDO $pdo, string $table): bool
    {
        try {
            $st = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $st->execute([$table]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * GET /api/deepseek/chat-history?limit=10&session_id=
     * Memuat pasangan pesan terakhir dari ai___chat untuk pengguna terautentikasi.
     * Tanpa session_id: 10 baris terakhir (semua session_id) — memuat riwayat lama + sesi utama.
     * Dengan session_id: filter ke utas itu (mode proxy / sesi tertentu).
     *
     * @return array{success:bool,data?:array{session_id:string,messages:array<int,array<string,mixed>>}}
     */
    public function chatHistory(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $params = $request->getQueryParams();
            $limit = isset($params['limit']) ? (int) $params['limit'] : 10;
            $limit = max(1, min(20, $limit));
            $sessionFilter = isset($params['session_id']) ? trim((string) $params['session_id']) : '';

            $db = Database::getInstance()->getConnection();
            $usersId = $this->resolveUsersId($userPayload, $db);

            if ($usersId === null || $usersId < 1 || !$this->aiTablesReady($db) || !$this->columnExists($db, 'ai___chat', 'users_id')) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'session_id' => $sessionFilter !== '' ? $sessionFilter : self::EBEDDIEN_MAIN_SESSION_ID,
                        'messages' => [],
                    ],
                ]);
            }

            if ($sessionFilter !== '') {
                $stmt = $db->prepare(
                    'SELECT id, user_message, ai_response FROM ai___chat WHERE users_id = ? AND session_id = ? ORDER BY id DESC LIMIT '
                    . (int) $limit
                );
                $stmt->execute([$usersId, $sessionFilter]);
            } else {
                $stmt = $db->prepare(
                    'SELECT id, user_message, ai_response FROM ai___chat WHERE users_id = ? ORDER BY id DESC LIMIT '
                    . (int) $limit
                );
                $stmt->execute([$usersId]);
            }

            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if ($rows === []) {
                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'session_id' => $sessionFilter !== '' ? $sessionFilter : self::EBEDDIEN_MAIN_SESSION_ID,
                        'messages' => [],
                    ],
                ]);
            }
            $rows = array_reverse($rows);

            $messages = [];
            foreach ($rows as $row) {
                $id = (int) ($row['id'] ?? 0);
                $u = trim((string) ($row['user_message'] ?? ''));
                $fullAi = (string) ($row['ai_response'] ?? '');
                [$reply, $thinking] = $this->splitAiResponseForDisplay($fullAi);
                if ($u === '') {
                    continue;
                }
                $messages[] = [
                    'id' => 'ebc-' . $id . '-u',
                    'role' => 'user',
                    'content' => $u,
                ];
                $messages[] = [
                    'id' => 'ebc-' . $id . '-a',
                    'role' => 'assistant',
                    'content' => $reply !== '' ? $reply : '_(kosong)_',
                    'thinking' => $thinking !== '' ? $thinking : null,
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'session_id' => $sessionFilter !== '' ? $sessionFilter : self::EBEDDIEN_MAIN_SESSION_ID,
                    'messages' => $messages,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('DeepseekController::chatHistory ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    /**
     * GET /api/deepseek/training-suggestions
     * Tiga pertanyaan acak dari bank Q&A (ai___training) saja — untuk tombol saran saat layar kosong.
     */
    public function trainingSuggestedPrompts(Request $request, Response $response): Response
    {
        try {
            $pdo = Database::getInstance()->getConnection();
            if (!$this->trainingTableExists($pdo, 'ai___training')) {
                return $this->json($response, ['success' => true, 'data' => []], 200);
            }
            $sql = 'SELECT TRIM(question) AS t FROM ai___training WHERE question IS NOT NULL AND TRIM(question) <> \'\' ORDER BY RAND() LIMIT 3';
            $stmt = $pdo->query($sql);
            $rows = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
            $out = [];
            foreach ($rows as $row) {
                $t = trim((string) ($row['t'] ?? ''));
                if ($t !== '') {
                    $out[] = $t;
                }
            }

            return $this->json($response, ['success' => true, 'data' => $out], 200);
        } catch (\Throwable $e) {
            error_log('DeepseekController::trainingSuggestedPrompts ' . $e->getMessage());

            return $this->json($response, ['success' => true, 'data' => []], 200);
        }
    }
}

