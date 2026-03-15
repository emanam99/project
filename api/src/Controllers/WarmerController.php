<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Warmer: pasangan nomor WA saling chat otomatis + pool pesan (template/import).
 * List/create/update/delete pairs; list/import messages; pick message untuk Node.
 */
class WarmerController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** Normalisasi kategori/tema: huruf/angka/underscore, max 50 char. */
    private function normalizeCategory(?string $category, string $default = 'education'): string
    {
        if ($category === null || $category === '') {
            return $default;
        }
        $s = preg_replace('/[^a-zA-Z0-9_\-\s]/', '', trim($category));
        $s = preg_replace('/[\s\-]+/', '_', $s);
        $s = substr($s, 0, 50);
        return $s !== '' ? strtolower($s) : $default;
    }

    /** Validasi isi pesan warmer: tidak kosong setelah clean, max 2000 karakter. */
    private function isContentValidForWarmer(string $text): bool
    {
        $cleaned = TextSanitizer::cleanText($text);
        if ($cleaned === '') {
            return false;
        }
        return mb_strlen($cleaned) <= 2000;
    }

    /**
     * GET /api/warmer/pairs
     */
    public function listPairs(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query('SELECT id, session_id_1, session_id_2, wait_min_sec, wait_max_sec, stop_after_conversations, rest_minutes, language, category, use_typing, is_active, created_at, updated_at FROM whatsapp___warmer_pair ORDER BY id ASC');
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::listPairs ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar pair'], 500);
        }
    }

    /**
     * POST /api/warmer/pairs
     * Body: session_id_1, session_id_2, wait_min_sec, wait_max_sec, stop_after_conversations, rest_minutes, language, category, use_typing, is_active
     */
    public function createPair(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $sessionId1 = TextSanitizer::cleanText($body['session_id_1'] ?? 'default') ?: 'default';
            $sessionId2 = TextSanitizer::cleanText($body['session_id_2'] ?? '');
            if ($sessionId2 === '' || $sessionId1 === $sessionId2) {
                return $this->json($response, ['success' => false, 'message' => 'Pilih dua session yang berbeda'], 400);
            }
            $waitMin = (int) ($body['wait_min_sec'] ?? 5);
            $waitMax = (int) ($body['wait_max_sec'] ?? 90);
            $stopAfter = (int) ($body['stop_after_conversations'] ?? 200);
            $restMin = (int) ($body['rest_minutes'] ?? 15);
            $language = in_array($body['language'] ?? 'id', ['en', 'id'], true) ? $body['language'] : 'id';
            $category = $this->normalizeCategory($body['category'] ?? null, 'education');
            $useTyping = !empty($body['use_typing']);
            $isActive = !empty($body['is_active']);

            $waitMin = max(5, min(90, $waitMin));
            $waitMax = max($waitMin, min(90, $waitMax));
            $stopAfter = max(1, min(10000, $stopAfter));
            $restMin = max(1, min(120, $restMin));

            $sql = 'INSERT INTO whatsapp___warmer_pair (session_id_1, session_id_2, wait_min_sec, wait_max_sec, stop_after_conversations, rest_minutes, language, category, use_typing, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$sessionId1, $sessionId2, $waitMin, $waitMax, $stopAfter, $restMin, $language, $category, $useTyping ? 1 : 0, $isActive ? 1 : 0]);
            $id = (int) $this->db->lastInsertId();
            return $this->json($response, ['success' => true, 'id' => $id, 'message' => 'Pair warmer berhasil ditambah'], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::createPair ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menambah pair'], 500);
        }
    }

    /**
     * PUT /api/warmer/pairs
     * Body: id, session_id_1?, session_id_2?, wait_min_sec?, wait_max_sec?, stop_after_conversations?, rest_minutes?, language?, category?, use_typing?, is_active?
     */
    public function updatePair(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $id = (int) ($body['id'] ?? 0);
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $allowed = ['session_id_1', 'session_id_2', 'wait_min_sec', 'wait_max_sec', 'stop_after_conversations', 'rest_minutes', 'language', 'category', 'use_typing', 'is_active'];
            $updates = [];
            $bind = [];
            foreach ($allowed as $k) {
                if (!array_key_exists($k, $body)) continue;
                if (in_array($k, ['language'], true)) {
                    $v = in_array($body[$k], ['en', 'id'], true) ? $body[$k] : null;
                    if ($v === null) continue;
                } elseif (in_array($k, ['category'], true)) {
                    $v = $this->normalizeCategory($body[$k] ?? null, 'education');
                    if ($v === '') continue;
                } elseif (in_array($k, ['use_typing', 'is_active'], true)) {
                    $v = !empty($body[$k]) ? 1 : 0;
                } else {
                    $v = $body[$k];
                }
                $updates[] = "`$k` = ?";
                $bind[] = $v;
            }
            if (empty($updates)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada field yang diubah'], 400);
            }
            $bind[] = $id;
            $stmt = $this->db->prepare('UPDATE whatsapp___warmer_pair SET ' . implode(', ', $updates) . ' WHERE id = ?');
            $stmt->execute($bind);
            return $this->json($response, ['success' => true, 'message' => 'Pair berhasil diubah'], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::updatePair ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah pair'], 500);
        }
    }

    /**
     * POST /api/warmer/pairs/delete
     * Body: { "id": 1 }
     */
    public function deletePair(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $id = (int) ($body['id'] ?? 0);
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM whatsapp___warmer_pair WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true, 'message' => 'Pair berhasil dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::deletePair ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus pair'], 500);
        }
    }

    /**
     * GET /api/warmer/categories (alias tema)
     * Daftar tema/kategori yang sudah ada di pool pesan warmer.
     */
    public function listCategories(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query('SELECT DISTINCT category FROM whatsapp___warmer WHERE category IS NOT NULL AND category != "" ORDER BY category ASC');
            $rows = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            return $this->json($response, ['success' => true, 'data' => array_values(array_filter($rows))], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::listCategories ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'data' => []], 500);
        }
    }

    /**
     * GET /api/warmer/themes — alias listCategories (daftar tema).
     */
    public function listThemes(Request $request, Response $response): Response
    {
        return $this->listCategories($request, $response);
    }

    /**
     * POST /api/warmer/themes/delete
     * Body: { "theme": "nama_tema" }. Hapus tema = hapus semua pesan dengan category tersebut.
     */
    public function deleteTheme(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $theme = isset($body['theme']) ? $this->normalizeCategory($body['theme'], '') : '';
            if ($theme === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama tema tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM whatsapp___warmer WHERE category = ?');
            $stmt->execute([$theme]);
            $deleted = $stmt->rowCount();
            return $this->json($response, ['success' => true, 'deleted' => $deleted, 'message' => 'Tema dihapus. ' . $deleted . ' pesan terhapus.'], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::deleteTheme ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus tema'], 500);
        }
    }

    /**
     * GET /api/warmer/messages
     * Query: category?, language?, source? (system|imported)
     */
    public function listMessages(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $category = isset($params['category']) ? trim((string) $params['category']) : null;
            $language = isset($params['language']) ? trim((string) $params['language']) : null;
            $source = isset($params['source']) ? trim((string) $params['source']) : null;

            $sql = 'SELECT id, source, category, language, conversation_id, sender, content, source_file, format, sort_order, created_at FROM whatsapp___warmer WHERE 1=1';
            $bind = [];
            if ($category !== null && $category !== '') {
                $sql .= ' AND category = ?';
                $bind[] = $category;
            }
            if ($language !== null && $language !== '') {
                $sql .= ' AND language = ?';
                $bind[] = $language;
            }
            if ($source !== null && $source !== '') {
                $sql .= ' AND source = ?';
                $bind[] = $source;
            }
            // Urutan: input paling awal dulu (created_at), lalu id
            $sql .= ' ORDER BY created_at ASC, id ASC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::listMessages ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar pesan'], 500);
        }
    }

    /**
     * GET /api/warmer/pick-message
     * Query: category, language — untuk Node warmer job (ambil satu pesan acak).
     */
    public function pickMessage(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $category = isset($params['category']) ? $this->normalizeCategory($params['category'], 'education') : 'education';
            $language = isset($params['language']) ? trim((string) $params['language']) : 'id';
            if (!in_array($language, ['en', 'id'], true)) $language = 'id';

            // Berurutan dari input paling awal: created_at, lalu sort_order/id (multi-import tema sama = urut pertama masuk)
            $index = max(0, (int) ($params['index'] ?? 0));
            $stmt = $this->db->prepare(
                'SELECT id, content FROM whatsapp___warmer WHERE (category = ? OR category IS NULL) AND (language = ? OR language IS NULL) AND content != "" ORDER BY created_at ASC, sort_order ASC, id ASC'
            );
            $stmt->execute([$category, $language]);
            $all = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if ($all === false || count($all) === 0) {
                $stmt = $this->db->prepare('SELECT id, content FROM whatsapp___warmer WHERE content != "" ORDER BY created_at ASC, sort_order ASC, id ASC');
                $stmt->execute([]);
                $all = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            $n = count($all);
            $row = $n > 0 ? $all[$index % $n] : null;
            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::pickMessage ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'data' => null], 500);
        }
    }

    /**
     * POST /api/warmer/messages/import
     * Body: format (txt|json), content (string) ATAU multipart file.
     * Optional: category, language (untuk tag import).
     */
    public function importMessages(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $format = isset($body['format']) ? strtolower(trim((string) $body['format'])) : 'txt';
            if (!in_array($format, ['txt', 'json'], true)) $format = 'txt';
            $category = isset($body['category']) ? $this->normalizeCategory($body['category'], '') : null;
            $language = isset($body['language']) ? trim((string) $body['language']) : null;
            if ($category === '') $category = null;
            if ($language !== null && !in_array($language, ['en', 'id'], true)) $language = null;

            $content = $body['content'] ?? '';
            $sourceFile = $body['source_file'] ?? 'import.' . $format;

            $uploadedFiles = $request->getUploadedFiles();
            if (isset($uploadedFiles['file']) && $uploadedFiles['file']->getError() === UPLOAD_ERR_OK) {
                $file = $uploadedFiles['file'];
                $sourceFile = $file->getClientFilename() ?: $sourceFile;
                $content = (string) $file->getStream()->getContents();
                $ext = strtolower(pathinfo($sourceFile, PATHINFO_EXTENSION));
                if ($ext === 'json') $format = 'json';
                elseif ($ext === 'txt') $format = 'txt';
            }

            // Skrip percakapan: tiap baris punya pengirim (wa1/wa2 atau 1/2). Satu file = satu conversation_id.
            $conversationId = 'conv_' . uniqid((string) time(), true);
            $items = []; // [ ['sender' => 1|2, 'text' => '...'], ... ]

            $skipped = 0;
            if ($format === 'txt') {
                $rawLines = array_map('trim', explode("\n", str_replace("\r", "\n", $content)));
                foreach ($rawLines as $line) {
                    if ($line === '') continue;
                    $sender = null;
                    $text = $line;
                    if (preg_match('/^(wa1|1)\s*:\s*(.*)/ui', $line, $m)) {
                        $sender = 1;
                        $text = trim($m[2]);
                    } elseif (preg_match('/^(wa2|2)\s*:\s*(.*)/ui', $line, $m)) {
                        $sender = 2;
                        $text = trim($m[2]);
                    }
                    $text = TextSanitizer::cleanText($text);
                    if (!$this->isContentValidForWarmer($text)) {
                        $skipped++;
                        continue;
                    }
                    $items[] = ['sender' => $sender, 'text' => $text];
                }
            } elseif ($format === 'json') {
                $dec = json_decode($content, true);
                if (is_array($dec)) {
                    foreach ($dec as $item) {
                        if (is_string($item)) {
                            $text = TextSanitizer::cleanText($item);
                            if (!$this->isContentValidForWarmer($text)) {
                                $skipped++;
                                continue;
                            }
                            $items[] = ['sender' => null, 'text' => $text];
                            continue;
                        }
                        if (!is_array($item)) {
                            $skipped++;
                            continue;
                        }
                        $from = $item['from'] ?? $item['sender'] ?? null;
                        $sender = null;
                        if ($from !== null && $from !== '') {
                            $f = is_string($from) ? strtolower(trim($from)) : (string) $from;
                            if (in_array($f, ['1', 'wa1'], true)) $sender = 1;
                            elseif (in_array($f, ['2', 'wa2'], true)) $sender = 2;
                        }
                        $text = $item['text'] ?? $item['content'] ?? $item['message'] ?? '';
                        $text = TextSanitizer::cleanText(is_string($text) ? $text : '');
                        if (!$this->isContentValidForWarmer($text)) {
                            $skipped++;
                            continue;
                        }
                        $items[] = ['sender' => $sender, 'text' => $text];
                    }
                }
            }

            $hasSender = false;
            foreach ($items as $it) {
                if ($it['sender'] !== null && $it['sender'] !== '') {
                    $hasSender = true;
                    break;
                }
            }
            if ($hasSender) {
                $last = 1;
                foreach ($items as $i => $it) {
                    if ($it['sender'] === null || $it['sender'] === '') {
                        $items[$i]['sender'] = $last;
                        $last = $last === 1 ? 2 : 1;
                    } else {
                        $last = (int) $it['sender'];
                    }
                }
            }

            $inserted = 0;
            $stmtSimple = $this->db->prepare('INSERT INTO whatsapp___warmer (source, category, language, content, source_file, format, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmtConv = $this->db->prepare('INSERT INTO whatsapp___warmer (source, category, language, conversation_id, sender, content, source_file, format, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

            if ($hasSender && count($items) > 0) {
                foreach ($items as $i => $it) {
                    $stmtConv->execute([
                        'imported',
                        $category,
                        $language,
                        $conversationId,
                        $it['sender'],
                        $it['text'],
                        $sourceFile,
                        $format,
                        $i,
                    ]);
                    $inserted++;
                }
            } else {
                // Tanpa prefix pengirim: simpan seperti dulu (satu baris = satu pesan, tanpa conversation).
                foreach ($items as $i => $it) {
                    $stmtSimple->execute(['imported', $category, $language, $it['text'], $sourceFile, $format, $i]);
                    $inserted++;
                }
            }

            $msg = $inserted . ' pesan diimpor.';
            if ($skipped > 0) {
                $msg .= ' ' . $skipped . ' baris dilewati (teks kosong atau tidak valid).';
            }
            return $this->json($response, ['success' => true, 'imported' => $inserted, 'skipped' => $skipped, 'message' => $msg], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::importMessages ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal import: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/warmer/messages/delete
     * Body: { "id": 1 }
     */
    public function deleteMessage(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $id = (int) ($body['id'] ?? 0);
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM whatsapp___warmer WHERE id = ? AND source = ?');
            $stmt->execute([$id, 'imported']);
            if ($stmt->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Pesan tidak ditemukan atau tidak boleh dihapus'], 404);
            }
            return $this->json($response, ['success' => true, 'message' => 'Pesan dihapus'], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::deleteMessage ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus'], 500);
        }
    }

    /**
     * GET /api/warmer/examples
     * Query: format (txt|json|excel) — contoh isi file untuk import.
     */
    public function examples(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $format = isset($params['format']) ? strtolower(trim((string) $params['format'])) : 'txt';

        $samples = [
            'txt' => "1: Salam\n2: Salam balik\n2: ada yg bisa saya bantu\n1: saya mau tanya.\n2: tanya tentang apa?",
            'json' => json_encode([
                ['from' => 1, 'text' => 'Salam'],
                ['from' => 2, 'text' => 'Salam balik'],
                ['from' => 2, 'text' => 'ada yg bisa saya bantu'],
                ['from' => 1, 'text' => 'saya mau tanya.'],
                ['from' => 2, 'text' => 'tanya tentang apa?'],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
            'excel' => "content\n\"Halo, apa kabar?\"\n\"Pendidikan membuka peluang.\"\n\"Tabungan rutin aman.\"",
        ];
        $data = $samples[$format] ?? $samples['txt'];
        return $this->json($response, ['success' => true, 'format' => $format, 'example' => $data], 200);
    }

    /**
     * GET /api/warmer/pick-conversation
     * Query: category, language. Mengembalikan satu skrip percakapan utuh: [ { from: 1|2, text: "..." }, ... ].
     */
    public function pickConversation(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $category = isset($params['category']) ? $this->normalizeCategory($params['category'], 'education') : 'education';
            $language = isset($params['language']) ? trim((string) $params['language']) : 'id';
            if (!in_array($language, ['en', 'id'], true)) $language = 'id';

            // Satu tema bisa banyak import: urutkan percakapan dari import pertama (MIN created_at), lalu putar dengan index
            $index = max(0, (int) ($params['index'] ?? 0));
            $stmt = $this->db->prepare(
                'SELECT conversation_id FROM whatsapp___warmer WHERE conversation_id IS NOT NULL AND (category = ? OR category IS NULL) AND (language = ? OR language IS NULL) AND content != "" AND sender IN (1, 2) GROUP BY conversation_id ORDER BY MIN(created_at) ASC, conversation_id ASC'
            );
            $stmt->execute([$category, $language]);
            $convs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if ($convs === false || count($convs) === 0) {
                return $this->json($response, ['success' => true, 'data' => []], 200);
            }
            $cid = $convs[$index % count($convs)]['conversation_id'];
            $stmt = $this->db->prepare('SELECT sender, content FROM whatsapp___warmer WHERE conversation_id = ? ORDER BY sort_order ASC, id ASC, created_at ASC');
            $stmt->execute([$cid]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = [];
            foreach ($rows as $r) {
                $sender = (int) $r['sender'];
                $text = trim((string) $r['content']);
                if ($text === '' || !in_array($sender, [1, 2], true)) continue;
                $list[] = ['from' => $sender, 'text' => $text];
            }
            return $this->json($response, ['success' => true, 'data' => $list], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::pickConversation ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'data' => []], 500);
        }
    }

    /**
     * GET /api/warmer/runner/pairs — untuk Node WA (header X-API-Key wajib).
     */
    public function runnerPairs(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        try {
            $stmt = $this->db->query('SELECT id, session_id_1, session_id_2, wait_min_sec, wait_max_sec, stop_after_conversations, rest_minutes, language, category, use_typing FROM whatsapp___warmer_pair WHERE is_active = 1 ORDER BY id ASC');
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return $this->json($response, ['success' => true, 'data' => $rows], 200);
        } catch (\Throwable $e) {
            error_log('WarmerController::runnerPairs ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'data' => []], 500);
        }
    }

    /**
     * GET /api/warmer/runner/pick-message — untuk Node WA (header X-API-Key wajib). Query: category, language.
     */
    public function runnerPickMessage(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        return $this->pickMessage($request, $response);
    }

    /**
     * GET /api/warmer/runner/pick-conversation — untuk Node WA (header X-API-Key wajib). Query: category, language.
     */
    public function runnerPickConversation(Request $request, Response $response): Response
    {
        $apiKey = $request->getHeaderLine('X-API-Key');
        $config = require __DIR__ . '/../../config.php';
        $expectedKey = getenv('WA_API_KEY') ?: ($config['whatsapp']['api_key'] ?? '');
        if ($expectedKey === '' || $apiKey !== $expectedKey) {
            $response->getBody()->write(json_encode(['success' => false, 'message' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        return $this->pickConversation($request, $response);
    }
}
