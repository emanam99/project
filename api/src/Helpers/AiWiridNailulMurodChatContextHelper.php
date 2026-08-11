<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Menyisipkan cuplikan konten Wirid / Nailul Murod ke konteks Chat AI (baca saja).
 * Untuk pengguna terautentikasi; tidak memerlukan hak admin—konten sama dengan yang dibaca modul Nailul Murod.
 */
final class AiWiridNailulMurodChatContextHelper
{
    private const MAX_BLOCK_CHARS = 9500;

    private const MAX_ROWS_MATCH = 22;

    private const MAX_ROWS_FALLBACK = 18;

    private const SNIPPET_ISI_CHARS = 1400;

    private const SNIPPET_ARTI_CHARS = 900;

    /**
     * Kelompok sinonim / ejaan: jika salah satu muncul di pesan, semua dipakai sebagai kata kunci LIKE
     * agar "doa dhuha" cocok dengan judul "doa setelah dhuha", "qoshidah" dengan "qosidah", dll.
     *
     * @var list<list<string>>
     */
    private const SYNONYM_GROUPS = [
        ['duha', 'dhuha', 'sholat duha', 'salat duha', 'shalat dhuha', 'sesudah duha', 'setelah duha', 'setelah dhuha', 'sesudah dhuha'],
        ['qoshidah', 'qosidah', 'qosida', 'nasyid', 'nashid'],
        ['dzikir', 'zikir', 'tasbih', 'tahmid', 'tahlil', 'takbir'],
        ['shalawat', 'sholawat', 'salawat', 'selawat'],
        ['tahajud', 'tahajjud', 'witir', 'witr'],
        ['istighfar', 'astagfirullah'],
        ['munajat', 'doa', 'do\'a'],
        ['subuh', 'shubuh', 'maghrib', 'magrib', 'dzuhur', 'dhuhur', 'ashar', 'asar', 'isya', 'isya\''],
    ];

    /**
     * @param array<string, mixed> $userPayload
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    public static function tryBuildWiridNailulMurodContext(
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?array $snapshot = null
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsWiridTopic($trimmed)) {
            return null;
        }
        if ($userPayload === []) {
            return null;
        }
        if (!self::tableExists($db)) {
            return null;
        }

        try {
            return self::trimBlock(self::buildBlock($db, $trimmed));
        } catch (\Throwable $e) {
            error_log('AiWiridNailulMurodChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsWiridTopic(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        if (preg_match(
            '/\bwirid\b|\bwirit\b|wiridan|nailul|nailul\s*murod|\bmurod\b|amaliyah|menu\s*wirid|halaman\s*wirid/i',
            $t
        )) {
            return true;
        }

        // Satu kata kunci amaliyah → selalu ambil konteks Nailul Murod (doa dhuha, qoshidah, dzikir pagi, dll.)
        if (preg_match(
            '/\b(doa|do\'a|dzikir|zikir|tasbih|shalawat|sholawat|salawat|selawat|istighfar|munajat|wird|wirid|wirit|'
            . 'qoshidah|qosidah|qosida|nasyid|nashid|maulid|maulud|burdah|barzanji|hizb|ratib|wird\s*latif|'
            . 'dhuha|duha|tahajud|tahajjud|witir|witr|qunut|bacaan|wiridan|zikiran|sholat|salat|shalat|sembahyang)\b/iu',
            $t
        )) {
            return true;
        }

        // Waktu / konteks shalat yang sering ada di judul wirid (tanpa kata "doa" eksplisit)
        if (preg_match(
            '/\b(sebelum|sesudah|setelah)\s+(subuh|shubuh|dzuhur|dhuhur|ashar|asar|maghrib|magrib|isya|dhuha|duha)/iu',
            $t
        )) {
            return true;
        }

        // Tetap: kombinasi lama (dzikir + minta jelaskan) — tidak wajib lagi, tapi tetap valid
        if (preg_match(
            '/\b(doa|dzikir|zikir|tasbih|shalawat|sholawat|salawat|istighfar|munajat|wird)\b/i',
            $t
        ) && preg_match(
            '/artikan|terjemah|jelaskan|apa\s+arti|tuliskan|bacakan|tampilkan|carikan|minta|tolong|ada\s+apa|yang\s+ada|di\s+database|konten|teks|arab|latin/i',
            $t
        )) {
            return true;
        }

        if (preg_match('/\bbab\s+[0-9a-z]/iu', $t)) {
            return true;
        }

        return (bool) preg_match(
            '/ayat\s+kursi|al[\-\s]?fatihah|surat\s+(pendek|yasin|ikhlas)|tahlil|tahmid|takbir/i',
            $t
        );
    }

    private static function tableExists(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'wirid___nailul_murod'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function buildBlock(\PDO $db, string $userMessage): string
    {
        $total = 0;
        try {
            $c = $db->query('SELECT COUNT(*) FROM `wirid___nailul_murod`');
            if ($c !== false) {
                $total = (int) $c->fetchColumn();
            }
        } catch (\Throwable $e) {
            $total = 0;
        }

        $terms = self::mergeTermsForSearch($userMessage);
        $rows = [];

        if ($terms !== [] && $total > 0) {
            $conds = [];
            $paramsWhere = [];
            $paramsScore = [];
            $scoreChunks = [];
            foreach ($terms as $term) {
                $like = '%' . $term . '%';
                $conds[] = '(`judul` LIKE ? OR `arti` LIKE ? OR `bab` LIKE ? OR `isi` LIKE ?)';
                array_push($paramsWhere, $like, $like, $like, $like);
                // Skor: judul & bab lebih penting agar "doa duha" naikkan entri "doa setelah dhuha"
                $scoreChunks[] = '(IF(`judul` LIKE ?, 6, 0) + IF(`bab` LIKE ?, 4, 0) + IF(`arti` LIKE ?, 2, 0) + IF(`isi` LIKE ?, 1, 0))';
                array_push($paramsScore, $like, $like, $like, $like);
            }
            $scoreExpr = implode(' + ', $scoreChunks);
            $sql = 'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan`, (' . $scoreExpr . ') AS `_rel` FROM `wirid___nailul_murod` WHERE '
                . implode(' OR ', $conds)
                . ' ORDER BY `_rel` DESC, `urutan` ASC, `id` ASC LIMIT ' . self::MAX_ROWS_MATCH;
            $stmt = $db->prepare($sql);
            // Placeholder: dulu ekspresi skor di SELECT, lalu kondisi WHERE
            $stmt->execute(array_merge($paramsScore, $paramsWhere));
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        if ($rows === [] && $total > 0) {
            $stmt = $db->query(
                'SELECT `id`, `bab`, `judul`, `isi`, `arti`, `urutan` FROM `wirid___nailul_murod` '
                . 'ORDER BY `urutan` ASC, `id` ASC LIMIT ' . self::MAX_ROWS_FALLBACK
            );
            $rows = $stmt !== false ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        }

        $lines = [];
        $lines[] = '=== KONTEN WIRID / NAILUL MUROD (sisipan server; baca saja) ===';
        $lines[] = 'Sumber: modul Wirid · Nailul Murod institusi (teks amaliyah/wirid yang dipublikasikan lewat eBeddien).';
        $lines[] = 'Jumlah entri dalam basis: ' . $total . '.';
        if ($terms !== []) {
            $lines[] = 'Kata kunci pencarian dari pertanyaan (disederhanakan): ' . implode(', ', $terms) . '.';
        }

        if ($rows === []) {
            $lines[] = '';
            $lines[] = '(Tidak ada baris konten Nailul Murod di basis data.)';
            $lines[] = '';
            $lines[] = 'Petunjuk untuk asisten: jawab bahwa konten belum diisi; boleh beri nasihat umum ringkas selaras pesantren jika pengguna meminta doa/wirid, tanpa mengaku sebagai teks resmi dari basis ini.';

            return implode("\n", $lines);
        }

        $lines[] = '';
        $lines[] = 'Cuplikan entri yang relevan atau urutan awal (maks. ' . \count($rows) . ' baris):';
        $n = 0;
        foreach ($rows as $row) {
            if ($n >= self::MAX_ROWS_MATCH) {
                break;
            }
            $id = (int) ($row['id'] ?? 0);
            $bab = trim((string) ($row['bab'] ?? ''));
            $judul = trim((string) ($row['judul'] ?? ''));
            $urutan = $row['urutan'] ?? '';
            $isiPlain = self::plainSnippet($row['isi'] ?? null, self::SNIPPET_ISI_CHARS);
            $artiPlain = self::plainSnippet($row['arti'] ?? null, self::SNIPPET_ARTI_CHARS);

            $lines[] = '---';
            $lines[] = '[ID ' . $id . '] Bab: ' . ($bab !== '' ? $bab : '—') . ' · Urutan: ' . ($urutan !== '' && $urutan !== null ? (string) $urutan : '—');
            $lines[] = 'Judul: ' . ($judul !== '' ? $judul : '—');
            if ($isiPlain !== '') {
                $lines[] = 'Isi bacaan (Arab/latin sesuai Nailul Murod; wajib disertakan ke pengguna): ' . $isiPlain;
            }
            if ($artiPlain !== '') {
                $lines[] = 'Arti / terjemahan (ringkas): ' . $artiPlain;
            }
            $n++;
        }

        $lines[] = '';
        $lines[] = '---';
        $lines[] = 'Petunjuk untuk asisten:';
        $lines[] = '(1) Utamakan menjawab dari cuplikan di atas untuk doa, dzikir, qoshidah, wirid, bacaan shalat, atau amaliyah lain yang relevan dengan Nailul Murod.';
        $lines[] = '(2) Cocokkan secara longgar: misalnya pengguna bertanya «doa duha» sedangkan di basis judulnya «doa setelah dhuha» — anggap sama kategori dan tampilkan cuplikan itu.';
        $lines[] = '(3) Jika beberapa entri relevan, prioritaskan yang paling selaras pertanyaan; boleh menyebut lebih dari satu cuplikan singkat jika membantu.';
        $lines[] = '(4) Wajib sertakan tulisan Arab bacaan (dan ejaan latin di cuplikan bila ada) persis seperti pada kolom «Isi bacaan» di atas — jangan hanya terjemahan Indonesia; urutan disarankan: teks bacaan dulu, lalu arti/penjelasan.';
        $lines[] = '(5) Jika diminta artikan atau jelaskan, gunakan kolom arti bila ada; tetap cantumkan teks Arab dari cuplikan, lalu penjelasan singkat sopan dalam Bahasa Indonesia.';
        $lines[] = '(6) Jangan mengarang teks Arab atau judul resmi yang tidak ada di cuplikan; jika tidak ada yang cocok, katakan tidak ditemukan di Nailul Murod ini dan tawarkan buka menu Wirid di eBeddien.';
        $lines[] = '(7) Jangan menyebut nama tabel basis data. Akhiri dengan kategori yang sesuai (mis. [Wirid]) mengikuti aturan sistem.';
        $lines[] = '(8) Hanya jika benar-benar tidak ada cuplikan yang masuk akal, boleh jawab ringkas menurut pengetahuan umum Islam tanpa mengklaim sebagai teks resmi institusi.';

        return implode("\n", $lines);
    }

    /**
     * @return list<string>
     */
    private static function extractSearchTerms(string $text): array
    {
        $t = mb_strtolower($text, 'UTF-8');
        $parts = preg_split('/[^\p{L}\p{N}]+/u', $t, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $stop = [
            'yang', 'dan', 'atau', 'untuk', 'dengan', 'dari', 'ini', 'itu', 'ada', 'tidak', 'bisa', 'tolong', 'minta', 'saya', 'kamu', 'kami', 'anda',
            'apa', 'bagaimana', 'kenapa', 'mengapa', 'di', 'ke', 'pada', 'adalah', 'akan', 'telah', 'sudah', 'juga', 'nya', 'lah', 'kah', 'deh', 'dong',
            'banget', 'aja', 'saja', 'gak', 'enggak', 'tidakkah', 'iya', 'ya', 'please', 'the', 'and', 'or', 'is', 'are', 'how', 'what', 'why', 'can', 'you',
            'me', 'my', 'show', 'tell', 'about', 'some', 'any', 'help',
        ];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p);
            if (mb_strlen($p, 'UTF-8') < 2) {
                continue;
            }
            if (\in_array($p, $stop, true)) {
                continue;
            }
            if (!isset($out[$p])) {
                $out[$p] = true;
            }
            if (\count($out) >= 14) {
                break;
            }
        }

        return array_keys($out);
    }

    /**
     * Token dari pesan + frasa pendek + sinonim (dhuha/duha, qoshidah/qosidah, …).
     *
     * @return list<string>
     */
    private static function mergeTermsForSearch(string $userMessage): array
    {
        $t = mb_strtolower(trim($userMessage), 'UTF-8');
        $fromTokens = self::extractSearchTerms($userMessage);
        $merged = [];
        foreach ($fromTokens as $w) {
            $merged[$w] = true;
        }

        foreach (self::synonymTermsTriggeredByMessage($t) as $w) {
            $merged[$w] = true;
        }

        foreach (self::extractShortPhrases($t) as $w) {
            if (mb_strlen($w, 'UTF-8') >= 3) {
                $merged[$w] = true;
            }
        }

        $list = array_keys($merged);
        if (\count($list) > 24) {
            $list = \array_slice($list, 0, 24);
        }

        return $list;
    }

    /**
     * @return list<string>
     */
    private static function synonymTermsTriggeredByMessage(string $lowerMessage): array
    {
        $out = [];
        foreach (self::SYNONYM_GROUPS as $group) {
            $hit = false;
            foreach ($group as $phrase) {
                $p = mb_strtolower($phrase, 'UTF-8');
                if ($p === '') {
                    continue;
                }
                if (mb_strpos($lowerMessage, $p) !== false) {
                    $hit = true;
                    break;
                }
            }
            if ($hit) {
                foreach ($group as $phrase) {
                    $out[mb_strtolower($phrase, 'UTF-8')] = true;
                }
            }
        }

        return array_keys($out);
    }

    /**
     * Frasa dua kata penting (menghindari stop words di tengah) untuk LIKE.
     *
     * @return list<string>
     */
    private static function extractShortPhrases(string $lowerMessage): array
    {
        $out = [];
        if (preg_match_all('/\b(doa|dzikir|zikir|shalawat|sholawat|qoshidah|qosidah|wirid|bacaan)\s+([a-zà-ž]{2,20})\b/iu', $lowerMessage, $m)) {
            for ($i = 0; $i < \count($m[0]); $i++) {
                $pair = trim($m[1][$i] . ' ' . $m[2][$i]);
                if ($pair !== '') {
                    $out[$pair] = true;
                }
            }
        }

        return array_keys($out);
    }

    private static function plainSnippet(?string $html, int $maxChars): string
    {
        if ($html === null || trim($html) === '') {
            return '';
        }
        $t = strip_tags((string) $html);
        $t = html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $t = preg_replace('/\s+/u', ' ', $t) ?? '';
        $t = trim($t);
        if (mb_strlen($t, 'UTF-8') > $maxChars) {
            $t = mb_substr($t, 0, $maxChars - 1, 'UTF-8') . '…';
        }

        return $t;
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 40, 'UTF-8') . "\n…(konten wirid dipotong; minta pengguna menyempitkan pertanyaan atau buka modul Nailul Murod).";
    }
}
