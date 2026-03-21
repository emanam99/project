<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konteks RAG dari ai___training + ai___training_messages untuk asisten eBeddien.
 */
final class AiTrainingRagHelper
{
    private const MAX_CONTEXT_CHARS = 12000;

    /** Nama tampilan asisten AI di aplikasi. */
    public const ASSISTANT_NAME = 'eBeddien';

    /**
     * Instruksi agar jawaban diakhiri `[kategori]` — dipakai untuk kolom ai___chat.category.
     */
    public static function getCategoryClosingInstruction(): string
    {
        return 'WAJIB: Setelah isi jawaban selesai, tambahkan baris terakhir berupa SATU label kategori dalam format [Nama Kategori] '
            . '(hanya teks di dalam sepasang kurung siku, contoh: [Umum], [Tentang Al-Utsmani], [Pendaftaran], [Lainnya]). '
            . 'Jangan menambahkan teks apa pun setelah kurung siku penutup. Label harus singkat (maks. beberapa kata).';
    }

    /**
     * Pesan system untuk endpoint chat API (format OpenAI).
     */
    public static function getEbeddienAssistantSystemPrompt(): string
    {
        return 'Anda adalah ' . self::ASSISTANT_NAME . ', asisten resmi aplikasi eBeddien (Digital Service Center). '
            . 'Jawab dengan sopan, jelas, dan membantu. Utamakan Bahasa Indonesia jika pengguna memakai Bahasa Indonesia. '
            . 'Gunakan basis pengetahuan institusi yang disertakan pada pesan pengguna bila relevan; '
            . 'jangan menyebut nama tabel atau istilah teknis basis data. '
            . 'Jika informasi tidak tercakup di referensi, jawab ringkas berdasarkan pengetahuan umum yang selaras dengan konteks pesantren/lembaga. '
            . self::getCategoryClosingInstruction();
    }

    private static function normalizeText(string $text): string
    {
        return strtolower(trim(preg_replace('/[^\w\s]/u', '', $text)));
    }

    /**
     * @return string[]
     */
    private static function extractKeywords(string $text): array
    {
        $normalized = self::normalizeText($text);
        $words = preg_split('/\s+/', $normalized) ?: [];

        $out = array_values(array_filter($words, static function ($word) {
            return strlen((string) $word) > 2;
        }));

        if ($out === []) {
            $flat = trim(preg_replace('/\s+/u', ' ', $text));
            if (mb_strlen($flat) > 2) {
                $out[] = mb_substr($flat, 0, min(48, mb_strlen($flat)));
            }
        }

        return $out;
    }

    public static function tablesAvailable(\PDO $pdo): bool
    {
        try {
            $st = $pdo->query("SHOW TABLES LIKE 'ai___training'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function messagesTableExists(\PDO $pdo): bool
    {
        try {
            $st = $pdo->query("SHOW TABLES LIKE 'ai___training_messages'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function findBankRows(\PDO $pdo, string $question): array
    {
        $keywords = self::extractKeywords($question);
        $relevant = [];
        foreach ($keywords as $keyword) {
            $stmt = $pdo->prepare('SELECT id, question, answer, category FROM ai___training WHERE question LIKE ? OR answer LIKE ? LIMIT 4');
            $term = '%' . $keyword . '%';
            $stmt->execute([$term, $term]);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $relevant[(int) $row['id']] = $row;
            }
        }

        return array_values($relevant);
    }

    /**
     * @return array<int, array{q: string, a: string}>
     */
    private static function findChatPairs(\PDO $pdo, string $question): array
    {
        $keywords = self::extractKeywords($question);
        $pairs = [];
        foreach ($keywords as $keyword) {
            $stmt = $pdo->prepare(
                "SELECT id, message FROM ai___training_messages WHERE sender = 'user' AND message LIKE ? LIMIT 6"
            );
            $stmt->execute(['%' . $keyword . '%']);
            $userMessages = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($userMessages as $userMsg) {
                $stmt2 = $pdo->prepare(
                    "SELECT message, feedback, approved_as_training FROM ai___training_messages "
                    . "WHERE parent_id = ? AND (sender = 'ai' OR sender = 'trainer') "
                    . 'ORDER BY approved_as_training DESC, id ASC LIMIT 1'
                );
                $stmt2->execute([(int) $userMsg['id']]);
                $answer = $stmt2->fetch(\PDO::FETCH_ASSOC);
                if ($answer) {
                    $a = (string) (($answer['feedback'] ?? '') !== '' ? $answer['feedback'] : $answer['message']);
                    $pairs[] = ['q' => (string) $userMsg['message'], 'a' => $a];
                }
            }
        }

        return $pairs;
    }

    /**
     * Sisipkan referensi training ke prompt; jika kosong, kembalikan prompt asli.
     */
    private static function identityTagLine(): string
    {
        return '[Peran: Anda menjawab sebagai ' . self::ASSISTANT_NAME . '.]';
    }

    public static function mergeIntoPrompt(\PDO $pdo, string $userPrompt, ?int $maxChars = null): string
    {
        $userPrompt = trim($userPrompt);
        if ($userPrompt === '') {
            return $userPrompt;
        }

        $catInstr = "\n\n---\n" . self::getCategoryClosingInstruction();

        if (!self::tablesAvailable($pdo)) {
            return self::identityTagLine() . "\n\n" . $userPrompt . $catInstr;
        }

        $max = $maxChars ?? self::MAX_CONTEXT_CHARS;

        try {
            $bank = self::findBankRows($pdo, $userPrompt);
            $chats = self::messagesTableExists($pdo) ? self::findChatPairs($pdo, $userPrompt) : [];
        } catch (\Throwable $e) {
            error_log('AiTrainingRagHelper::mergeIntoPrompt ' . $e->getMessage());

            return self::identityTagLine() . "\n\n" . $userPrompt . $catInstr;
        }

        if ($bank === [] && $chats === []) {
            return self::identityTagLine() . "\n\n" . $userPrompt . $catInstr;
        }

        $parts = [];
        $parts[] = self::identityTagLine();
        $parts[] = '[Basis pengetahuan lembaga — gunakan jika relevan; jangan menyalin mentah jika tidak cocok.]';
        $parts[] = '';

        if ($bank !== []) {
            $parts[] = '## Bank pertanyaan & jawaban';
            foreach (array_slice($bank, 0, 8) as $row) {
                $parts[] = '- Q: ' . self::oneLine($row['question'] ?? '');
                $parts[] = '  A: ' . self::oneLine($row['answer'] ?? '');
                $parts[] = '';
            }
        }

        if ($chats !== []) {
            $parts[] = '## Cuplikan latihan chat (pertanyaan → jawaban)';
            $seen = [];
            foreach (array_slice($chats, 0, 8) as $p) {
                $k = md5($p['q'] . "\0" . $p['a']);
                if (isset($seen[$k])) {
                    continue;
                }
                $seen[$k] = true;
                $parts[] = '- Q: ' . self::oneLine($p['q']);
                $parts[] = '  A: ' . self::oneLine($p['a']);
                $parts[] = '';
            }
        }

        $parts[] = '---';
        $parts[] = 'Pertanyaan pengguna:';
        $parts[] = $userPrompt;
        $parts[] = '';
        $parts[] = '---';
        $parts[] = self::getCategoryClosingInstruction();

        $block = implode("\n", $parts);
        if (mb_strlen($block) > $max) {
            $block = mb_substr($block, 0, $max) . "\n…[referensi dipotong]";
        }

        return $block;
    }

    private static function oneLine(string $s): string
    {
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;

        return trim($s);
    }
}
