<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Menu WhatsApp interaktif (pohon node + trigger). Dipakai untuk balasan otomatis dari WA server & WatZap.
 */
class WaInteractiveMenuService
{
    /**
     * Untuk chat @lid, simpan kunci sesi sesuai nomor mentah dari payload (tanpa normalisasi 62).
     */
    private static function normalizeIncomingNumber(string $nomor, ?string $fromJid): string
    {
        $digits = preg_replace('/\D/', '', trim($nomor)) ?? '';
        $isLid = is_string($fromJid) && preg_match('/@lid$/i', trim($fromJid)) === 1;
        if ($isLid && $digits !== '') {
            return $digits;
        }
        return WhatsAppService::formatPhoneNumber($nomor);
    }

    private const SETTING_KEY = 'wa_interactive_menu_enabled';

    public static function isEnabled(): bool
    {
        if (!self::tablesExist()) {
            return false;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare('SELECT `value` FROM app___settings WHERE `key` = ? LIMIT 1');
            $stmt->execute([self::SETTING_KEY]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $row !== false && trim((string) ($row['value'] ?? '')) === '1';
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function setEnabled(bool $on): void
    {
        if (!self::tablesExist()) {
            return;
        }
        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare('INSERT INTO app___settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()');
        $v = $on ? '1' : '0';
        $stmt->execute([self::SETTING_KEY, $v, $v]);
    }

    private static function tablesExist(): bool
    {
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->query("SHOW TABLES LIKE 'whatsapp___menu_node'");
            if ($stmt === false) {
                return false;
            }
            // PDO MySQL: rowCount() untuk SHOW TABLES sering 0; pakai fetch.
            return $stmt->fetch(\PDO::FETCH_NUM) !== false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return string|null Balasan teks atau null jika fitur mati / tidak ada respons
     */
    public static function handle(string $nomor, string $message, ?string $fromJid = null): ?string
    {
        if (!self::isEnabled() || trim($message) === '') {
            return null;
        }
        $fromJid = $fromJid !== null && $fromJid !== '' ? trim($fromJid) : null;
        $nomor = self::normalizeIncomingNumber($nomor, $fromJid);
        if (strlen($nomor) < 10) {
            return null;
        }
        $db = Database::getInstance()->getConnection();

        $input = self::normalizeInput($message);
        if ($input === '') {
            return null;
        }

        // Perintah global: kembali ke menu utama
        if (in_array($input, ['0', 'menu', 'utama', 'kembali', 'menu utama', 'home'], true)) {
            self::saveSession($db, $nomor, $fromJid, null);
            return self::buildMenuForParent($db, null);
        }

        $session = self::loadSession($db, $nomor, $fromJid);
        $currentId = $session !== null ? $session['current_node_id'] : null;

        $children = self::getChildren($db, $currentId);
        if ($children === []) {
            // Tidak ada definisi menu
            return null;
        }

        $matched = self::findMatchingChild($input, $children);
        if ($matched === null) {
            $menu = self::buildMenuForParent($db, $currentId);
            if ($menu === '') {
                return null;
            }
            return "Pilihan tidak dikenali. Balas dengan angka atau kata kunci yang tersedia.\n\n" . $menu;
        }

        $node = self::getNodeById($db, (int) $matched['id']);
        if ($node === null) {
            return null;
        }

        $sub = self::getChildren($db, (int) $node['id']);
        if ($sub !== []) {
            self::saveSession($db, $nomor, $fromJid, (int) $node['id']);
            return self::composeNodeMessage($db, $node, $sub);
        }

        // Daun: tampilkan teks, sesi kembali ke induk agar bisa pilih saudara atau 0 untuk utama
        $parentId = isset($node['parent_id']) && $node['parent_id'] !== null ? (int) $node['parent_id'] : null;
        self::saveSession($db, $nomor, $fromJid, $parentId);

        $body = trim((string) ($node['body_text'] ?? ''));
        if ($body === '') {
            $body = trim((string) ($node['title'] ?? ''));
        }
        $suffix = "\n\n*Ketik 0 untuk Menu Utama.*";
        return $body . $suffix;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function getAllNodesFlat(): array
    {
        if (!self::tablesExist()) {
            return [];
        }
        $db = Database::getInstance()->getConnection();
        $stmt = $db->query('SELECT id, parent_id, sort_order, title, body_text, triggers_json, action_type FROM whatsapp___menu_node ORDER BY parent_id IS NULL DESC, parent_id, sort_order, id');
        if ($stmt === false) {
            return [];
        }
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }

    /**
     * Ganti seluruh pohon (hapus sesi + node lalu sisipkan baru).
     *
     * @param list<array{parent_index: int|null, sort_order: int, title: string, body_text?: string|null, triggers: list<string>, action_type: string}> $nodes
     */
    public static function replaceTree(array $nodes): void
    {
        if (!self::tablesExist()) {
            throw new \RuntimeException(
                'Tabel menu WA belum ada. Dari folder api jalankan: php phinx.php migrate'
            );
        }
        $db = Database::getInstance()->getConnection();
        $db->beginTransaction();
        try {
            $db->exec('DELETE FROM whatsapp___menu_session');
            $db->exec('DELETE FROM whatsapp___menu_node');

            $ids = [];
            foreach ($nodes as $i => $n) {
                $title = trim((string) ($n['title'] ?? ''));
                if ($title === '') {
                    throw new \InvalidArgumentException('Setiap node wajib punya title');
                }
                $parentIndex = $n['parent_index'] ?? null;
                $parentId = null;
                if ($parentIndex !== null) {
                    $pi = (int) $parentIndex;
                    if ($pi < 0 || $pi >= $i || !isset($ids[$pi])) {
                        throw new \InvalidArgumentException('parent_index tidak valid pada indeks ' . $i);
                    }
                    $parentId = $ids[$pi];
                }
                $sort = (int) ($n['sort_order'] ?? 0);
                $body = isset($n['body_text']) ? (string) $n['body_text'] : '';
                $action = trim((string) ($n['action_type'] ?? 'menu'));
                if (!in_array($action, ['menu', 'reply', 'daftar_notif'], true)) {
                    $action = 'menu';
                }
                $triggers = $n['triggers'] ?? [];
                if (!is_array($triggers)) {
                    $triggers = [];
                }
                $triggerStrings = [];
                foreach ($triggers as $t) {
                    $s = trim((string) $t);
                    if ($s !== '') {
                        $triggerStrings[] = $s;
                    }
                }
                $triggersJson = json_encode(array_values($triggerStrings), JSON_UNESCAPED_UNICODE);

                $stmt = $db->prepare('INSERT INTO whatsapp___menu_node (parent_id, sort_order, title, body_text, triggers_json, action_type) VALUES (?, ?, ?, ?, ?, ?)');
                $stmt->execute([$parentId, $sort, $title, $body !== '' ? $body : null, $triggersJson ?: '[]', $action]);
                $ids[$i] = (int) $db->lastInsertId();
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function loadSession(\PDO $db, string $nomor, ?string $fromJid): ?array
    {
        $key = self::sessionKey($nomor, $fromJid);
        $stmt = $db->prepare('SELECT session_key, nomor, from_jid, current_node_id FROM whatsapp___menu_session WHERE session_key = ? LIMIT 1');
        $stmt->execute([$key]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false ? $row : null;
    }

    private static function saveSession(\PDO $db, string $nomor, ?string $fromJid, ?int $currentNodeId): void
    {
        $key = self::sessionKey($nomor, $fromJid);
        $stmt = $db->prepare('INSERT INTO whatsapp___menu_session (session_key, nomor, from_jid, current_node_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE current_node_id = VALUES(current_node_id), updated_at = NOW()');
        $stmt->execute([$key, $nomor, $fromJid, $currentNodeId]);
    }

    private static function sessionKey(string $nomor, ?string $fromJid): string
    {
        $j = $fromJid ?? '';
        $raw = $nomor . "\0" . $j;
        if (strlen($raw) <= 180) {
            return $raw;
        }
        return substr(hash('sha256', $raw), 0, 64);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function getChildren(\PDO $db, ?int $parentId): array
    {
        if ($parentId === null) {
            $stmt = $db->prepare('SELECT * FROM whatsapp___menu_node WHERE parent_id IS NULL ORDER BY sort_order ASC, id ASC');
            $stmt->execute();
        } else {
            $stmt = $db->prepare('SELECT * FROM whatsapp___menu_node WHERE parent_id = ? ORDER BY sort_order ASC, id ASC');
            $stmt->execute([$parentId]);
        }
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }

    /**
     * @param list<array<string, mixed>> $children
     */
    private static function findMatchingChild(string $inputNorm, array $children): ?array
    {
        foreach ($children as $idx => $child) {
            $i = $idx + 1;
            $triggers = self::decodeTriggers($child['triggers_json'] ?? null);
            $triggers[] = (string) $i;
            $triggers[] = $i . '.';
            $title = trim((string) ($child['title'] ?? ''));
            if ($title !== '') {
                $triggers[] = $title;
            }
            foreach (array_unique(array_filter(array_map('trim', $triggers))) as $tr) {
                if (self::triggerMatches($inputNorm, $tr)) {
                    return $child;
                }
            }
        }
        return null;
    }

    private static function triggerMatches(string $inputNorm, string $triggerRaw): bool
    {
        $t = self::normalizeInput($triggerRaw);
        if ($t === '') {
            return false;
        }
        if ($inputNorm === $t) {
            return true;
        }
        // angka: "1" vs "1."
        if (preg_match('/^\d+$/', $inputNorm) && preg_match('/^\d+\.?$/', $t)) {
            return (int) $inputNorm === (int) $t;
        }
        return false;
    }

    /**
     * @return list<string>
     */
    private static function decodeTriggers(?string $json): array
    {
        if ($json === null || $json === '') {
            return [];
        }
        $a = json_decode($json, true);
        return is_array($a) ? array_map('strval', $a) : [];
    }

    private static function normalizeInput(string $msg): string
    {
        $msg = trim($msg);
        $msg = preg_replace('/\s+/u', ' ', $msg) ?? $msg;
        return mb_strtolower($msg, 'UTF-8');
    }

    /**
     * @param array<string, mixed> $node
     * @param list<array<string, mixed>> $children
     */
    private static function composeNodeMessage(\PDO $db, array $node, array $children): string
    {
        $parts = [];
        $body = trim((string) ($node['body_text'] ?? ''));
        if ($body !== '') {
            $parts[] = $body;
        }
        $parts[] = self::formatChildMenuList($children);
        $parts[] = '0. Menu Utama';
        return implode("\n\n", array_filter($parts, static fn ($p) => $p !== ''));
    }

    private static function buildMenuForParent(\PDO $db, ?int $parentId): string
    {
        $children = self::getChildren($db, $parentId);
        if ($children === []) {
            return '';
        }
        return self::formatChildMenuList($children) . "\n\n0. Menu Utama";
    }

    /**
     * @param list<array<string, mixed>> $children
     */
    private static function formatChildMenuList(array $children): string
    {
        $lines = [];
        foreach ($children as $idx => $ch) {
            $n = $idx + 1;
            $title = trim((string) ($ch['title'] ?? ''));
            $lines[] = $n . '. ' . $title;
        }
        return implode("\n", $lines);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function getNodeById(\PDO $db, int $id): ?array
    {
        $stmt = $db->prepare('SELECT * FROM whatsapp___menu_node WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false ? $row : null;
    }
}
