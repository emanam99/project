<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Rujukan rumus Bisyaroh ke kolom tabel pengurus, jabatan, dan pengurus___jabatan:
 * CONTAINS, ISEMPTY/BLANK, LEN, HASJABATAN, @pengurus[kolom], @jabatan[kolom], @pj[kolom].
 */
final class BisyarohPengurusFormulaHelper
{
    /**
     * Kolom pengurus yang boleh dipakai di rumus (keamanan + stabilitas skema).
     *
     * @var list<string>
     */
    private const WHITELIST = [
        'nama',
        'nip',
        'nik',
        'gelar_awal',
        'gelar_akhir',
        'gender',
        'tempat_lahir',
        'pendidikan_terakhir',
        'sekolah',
        'tahun_lulus',
        's1',
        's2',
        's3',
        'bidang_studi',
        'jurusan_title',
        'pekerjaan',
        'niy',
        'nidn',
        'nuptk',
        'npk',
        'email',
        'jabatan',
        'diniyah',
        'formal',
        'status',
        'hijriyah',
        'kategori',
        'jarak',
    ];

    /** @var list<string> */
    private const JABATAN_WHITELIST = [
        'nama',
        'tipe',
        'urutan',
        'lembaga_id',
        'status',
        'deskripsi',
        'bonus',
        'per_jp',
    ];

    /** Kolom jabatan numerik (Rupiah): dijumlahkan bila pengurus punya beberapa jabatan dalam scope lembaga. */
    private const JABATAN_CURRENCY_SUM_COLUMNS = ['bonus', 'per_jp'];

    /** @var list<string> */
    private const PJ_WHITELIST = [
        'tanggal_mulai',
        'tanggal_selesai',
        'status',
        'lembaga_id',
        'jabatan_id',
        'mengajar',
    ];

    /** Kolom pengurus boolean → token 1/0 di rumus. */
    private const PENGURUS_BOOLEAN_COLUMNS = [];

    /** Kolom pengurus___jabatan boolean → token 1/0; OR bila beberapa penugasan dalam scope. */
    private const PJ_BOOLEAN_COLUMNS = ['mengajar'];

    /** @var list<string>|null subset WHITELIST yang benar-benar ada di tabel `pengurus` */
    private static ?array $pengurusExistingWhitelistCols = null;

    /** @var list<string>|null */
    private static ?array $jabatanExistingCols = null;

    /** @var list<string>|null */
    private static ?array $pjExistingCols = null;

    /** @var array<string, string> key => label UI */
    private const LABELS = [
        'nama' => 'Nama',
        'nip' => 'NIP',
        'nik' => 'NIK',
        'gelar_awal' => 'Gelar depan',
        'gelar_akhir' => 'Gelar belakang',
        'gender' => 'Jenis kelamin',
        'tempat_lahir' => 'Tempat lahir',
        'pendidikan_terakhir' => 'Pendidikan terakhir',
        'sekolah' => 'Sekolah',
        'tahun_lulus' => 'Tahun lulus',
        's1' => 'S1 / strata 1',
        's2' => 'S2 / strata 2',
        's3' => 'S3 / strata 3',
        'bidang_studi' => 'Bidang studi',
        'jurusan_title' => 'Jurusan / gelar',
        'pekerjaan' => 'Pekerjaan',
        'niy' => 'NIY',
        'nidn' => 'NIDN',
        'nuptk' => 'NUPTK',
        'npk' => 'NPK',
        'email' => 'Email',
        'jabatan' => 'Jabatan (teks)',
        'diniyah' => 'Diniyah',
        'formal' => 'Formal',
        'status' => 'Status',
        'hijriyah' => 'Tanggal Hijriyah',
        'kategori' => 'Kategori',
        'jarak' => 'Jarak (km) dari yayasan',
    ];

    /** @var array<string, string> */
    private const JABATAN_LABELS = [
        'nama' => 'Nama jabatan',
        'tipe' => 'Tipe jabatan',
        'urutan' => 'Urutan',
        'lembaga_id' => 'ID lembaga jabatan',
        'status' => 'Status jabatan',
        'deskripsi' => 'Deskripsi jabatan',
        'bonus' => 'Bonus (Rp)',
        'per_jp' => 'Per JP (Rp)',
    ];

    /** @var array<string, string> */
    private const PJ_LABELS = [
        'tanggal_mulai' => 'Tanggal mulai penugasan',
        'tanggal_selesai' => 'Tanggal selesai penugasan',
        'status' => 'Status penugasan',
        'lembaga_id' => 'Lembaga penugasan',
        'jabatan_id' => 'ID jabatan (penugasan)',
        'mengajar' => 'Mengajar di lembaga ini (1/0)',
    ];

    /**
     * @return list<array{key: string, label: string}>
     */
    public static function getFieldCatalog(?PDO $db = null): array
    {
        return self::buildCatalog(self::WHITELIST, self::LABELS, $db === null ? null : self::pengurusSelectableColumns($db));
    }

    /**
     * @return list<array{key: string, label: string}>
     */
    public static function getJabatanFieldCatalog(?PDO $db = null): array
    {
        return self::buildCatalog(self::JABATAN_WHITELIST, self::JABATAN_LABELS, $db === null ? null : self::jabatanSelectableColumns($db));
    }

    /**
     * @return list<array{key: string, label: string}>
     */
    public static function getPjFieldCatalog(?PDO $db = null): array
    {
        return self::buildCatalog(self::PJ_WHITELIST, self::PJ_LABELS, $db === null ? null : self::pjSelectableColumns($db));
    }

    /**
     * @param list<string> $whitelist
     * @param array<string, string> $labels
     * @param list<string>|null $existing
     * @return list<array{key: string, label: string}>
     */
    private static function buildCatalog(array $whitelist, array $labels, ?array $existing): array
    {
        $out = [];
        foreach ($whitelist as $k) {
            if ($existing !== null && !in_array($k, $existing, true)) {
                continue;
            }
            $out[] = ['key' => $k, 'label' => $labels[$k] ?? $k];
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    public static function pengurusSelectableColumns(PDO $db): array
    {
        if (self::$pengurusExistingWhitelistCols !== null) {
            return self::$pengurusExistingWhitelistCols;
        }
        self::$pengurusExistingWhitelistCols = self::filterWhitelistByTable($db, 'pengurus', self::WHITELIST);

        return self::$pengurusExistingWhitelistCols;
    }

    /**
     * @return list<string>
     */
    public static function jabatanSelectableColumns(PDO $db): array
    {
        if (self::$jabatanExistingCols !== null) {
            return self::$jabatanExistingCols;
        }
        self::$jabatanExistingCols = self::filterWhitelistByTable($db, 'jabatan', self::JABATAN_WHITELIST);

        return self::$jabatanExistingCols;
    }

    /**
     * @return list<string>
     */
    public static function pjSelectableColumns(PDO $db): array
    {
        if (self::$pjExistingCols !== null) {
            return self::$pjExistingCols;
        }
        self::$pjExistingCols = self::filterWhitelistByTable($db, 'pengurus___jabatan', self::PJ_WHITELIST);

        return self::$pjExistingCols;
    }

    /**
     * @param list<string> $whitelist
     * @return list<string>
     */
    private static function filterWhitelistByTable(PDO $db, string $table, array $whitelist): array
    {
        try {
            $stmt = $db->query('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '`');
            $have = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (!empty($r['Field'])) {
                    $have[(string) $r['Field']] = true;
                }
            }
            $cols = [];
            foreach ($whitelist as $k) {
                if (isset($have[$k])) {
                    $cols[] = $k;
                }
            }

            return $cols !== [] ? $cols : [$whitelist[0]];
        } catch (\Throwable $e) {
            return [$whitelist[0]];
        }
    }

    /**
     * @return array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}
     */
    public static function emptyFormulaContext(): array
    {
        return [
            'pengurus' => self::emptyPengurusMap(),
            'jabatan' => self::emptyNamedMap(self::JABATAN_WHITELIST),
            'pj' => self::emptyNamedMap(self::PJ_WHITELIST),
        ];
    }

    /**
     * Konteks dummy untuk validasi sintaks rumus (bukan nilai rekap nyata).
     *
     * @return array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}
     */
    public static function dummyFormulaContextForValidation(): array
    {
        $dummyDate = '2024-06-15';
        $pengurus = self::fillNamedMap(self::WHITELIST, '1');
        $pengurus['hijriyah'] = $dummyDate;
        $jabatan = self::fillNamedMap(self::JABATAN_WHITELIST, '1');
        $pj = self::fillNamedMap(self::PJ_WHITELIST, '1');
        $pj['tanggal_mulai'] = $dummyDate;
        $pj['tanggal_selesai'] = '2025-06-15';

        return [
            'pengurus' => $pengurus,
            'jabatan' => $jabatan,
            'pj' => $pj,
        ];
    }

    /**
     * @param list<string> $keys
     * @return array<string, string>
     */
    private static function fillNamedMap(array $keys, string $value): array
    {
        $m = [];
        foreach ($keys as $k) {
            $m[$k] = $value;
        }

        return $m;
    }

    /**
     * @return array<string, string>
     */
    public static function emptyPengurusMap(): array
    {
        return self::emptyNamedMap(self::WHITELIST);
    }

    /**
     * @param list<string> $keys
     * @return array<string, string>
     */
    private static function emptyNamedMap(array $keys): array
    {
        $m = [];
        foreach ($keys as $k) {
            $m[$k] = '';
        }

        return $m;
    }

    public static function isAllowedColumn(string $col): bool
    {
        return in_array($col, self::WHITELIST, true);
    }

    public static function isAllowedJabatanColumn(string $col): bool
    {
        return in_array($col, self::JABATAN_WHITELIST, true);
    }

    public static function isAllowedPjColumn(string $col): bool
    {
        return in_array($col, self::PJ_WHITELIST, true);
    }

    /**
     * Konteks lengkap untuk preprocess rumus (pengurus + jabatan ter-scope lembaga).
     *
     * @param list<string>|null $lembagaIds filter lembaga rekap (satu atau banyak); null = semua jabatan aktif
     * @return array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}
     */
    public static function loadFormulaContext(
        PDO $db,
        int $idPengurus,
        ?string $lembagaId = null,
        ?array $lembagaIds = null
    ): array {
        $pengurus = self::loadPengurusStringMap($db, $idPengurus);
        $scopedIds = self::normalizeLembagaScope($lembagaId, $lembagaIds);
        [$jabatan, $pj] = self::loadJabatanMapsForPengurus($db, $idPengurus, $scopedIds);

        return [
            'pengurus' => $pengurus,
            'jabatan' => $jabatan,
            'pj' => $pj,
        ];
    }

    /**
     * @param list<string>|null $lembagaIds
     * @return list<string>|null null = tanpa filter lembaga
     */
    private static function normalizeLembagaScope(?string $lembagaId, ?array $lembagaIds): ?array
    {
        $ids = [];
        if ($lembagaIds !== null) {
            foreach ($lembagaIds as $lid) {
                $t = trim((string) $lid);
                if ($t !== '') {
                    $ids[] = $t;
                }
            }
        }
        if ($lembagaId !== null) {
            $t = trim($lembagaId);
            if ($t !== '' && !in_array($t, $ids, true)) {
                $ids[] = $t;
            }
        }
        $ids = array_values(array_unique($ids));

        return $ids === [] ? null : $ids;
    }

    /**
     * @param list<string>|null $lembagaIds
     * @return array{0: array<string, string>, 1: array<string, string>}
     */
    private static function loadJabatanMapsForPengurus(PDO $db, int $idPengurus, ?array $lembagaIds): array
    {
        $jabatanMap = self::emptyNamedMap(self::JABATAN_WHITELIST);
        $pjMap = self::emptyNamedMap(self::PJ_WHITELIST);
        if ($idPengurus <= 0) {
            return [$jabatanMap, $pjMap];
        }

        $jCols = self::jabatanSelectableColumns($db);
        $pjCols = self::pjSelectableColumns($db);
        $selectParts = [];
        foreach ($jCols as $c) {
            $selectParts[] = 'j.`' . str_replace('`', '``', $c) . '` AS `j_' . str_replace('`', '``', $c) . '`';
        }
        foreach ($pjCols as $c) {
            $selectParts[] = 'pj.`' . str_replace('`', '``', $c) . '` AS `pj_' . str_replace('`', '``', $c) . '`';
        }
        if ($selectParts === []) {
            return [$jabatanMap, $pjMap];
        }

        $sql = 'SELECT ' . implode(', ', $selectParts)
            . ' FROM `pengurus___jabatan` pj'
            . ' INNER JOIN `jabatan` j ON j.`id` = pj.`jabatan_id`'
            . ' WHERE pj.`pengurus_id` = ? AND pj.`status` = \'aktif\'';
        $params = [$idPengurus];

        if ($lembagaIds !== null) {
            $ph = implode(',', array_fill(0, count($lembagaIds), '?'));
            $sql .= ' AND (COALESCE(pj.`lembaga_id`, j.`lembaga_id`) IN (' . $ph . '))';
            $params = array_merge($params, $lembagaIds);
        }

        $sql .= ' ORDER BY j.`urutan` ASC, j.`nama` ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!is_array($rows) || $rows === []) {
            return [$jabatanMap, $pjMap];
        }

        /** @var array<string, list<string>> $jabatanAgg */
        $jabatanAgg = [];
        foreach (self::JABATAN_WHITELIST as $k) {
            $jabatanAgg[$k] = [];
        }
        /** @var array<string, list<string>> $pjAgg */
        $pjAgg = [];
        foreach (self::PJ_WHITELIST as $k) {
            $pjAgg[$k] = [];
        }

        foreach ($rows as $row) {
            foreach ($jCols as $k) {
                $v = $row['j_' . $k] ?? '';
                if ($v !== null && trim((string) $v) !== '') {
                    $jabatanAgg[$k][] = trim((string) $v);
                }
            }
            foreach ($pjCols as $k) {
                $v = $row['pj_' . $k] ?? '';
                if (in_array($k, self::PJ_BOOLEAN_COLUMNS, true)) {
                    $pjAgg[$k][] = PengurusBooleanHelper::toFormulaToken($v);
                    continue;
                }
                if ($v !== null && trim((string) $v) !== '') {
                    $pjAgg[$k][] = trim((string) $v);
                }
            }
        }

        foreach (self::JABATAN_WHITELIST as $k) {
            if (in_array($k, self::JABATAN_CURRENCY_SUM_COLUMNS, true)) {
                $jabatanMap[$k] = self::sumNumericValuesAsToken($jabatanAgg[$k] ?? []);
            } else {
                $jabatanMap[$k] = self::joinUniqueValues($jabatanAgg[$k] ?? []);
            }
        }
        foreach (self::PJ_WHITELIST as $k) {
            if (in_array($k, self::PJ_BOOLEAN_COLUMNS, true)) {
                $pjMap[$k] = self::booleanOrValuesAsToken($pjAgg[$k] ?? []);
            } else {
                $pjMap[$k] = self::joinUniqueValues($pjAgg[$k] ?? []);
            }
        }

        return [$jabatanMap, $pjMap];
    }

    /**
     * @param list<string> $values
     */
    /**
     * @param list<string> $values
     */
    private static function sumNumericValuesAsToken(array $values): string
    {
        $sum = 0.0;
        foreach ($values as $v) {
            if ($v === '' || !is_numeric($v)) {
                continue;
            }
            $n = (float) $v;
            if (is_finite($n)) {
                $sum += $n;
            }
        }

        return self::coerceToNumericToken((string) $sum);
    }

    /**
     * @param list<string> $values
     */
    private static function joinUniqueValues(array $values): string
    {
        $seen = [];
        $out = [];
        foreach ($values as $v) {
            $t = trim($v);
            if ($t === '' || isset($seen[$t])) {
                continue;
            }
            $seen[$t] = true;
            $out[] = $t;
        }

        return implode(', ', $out);
    }

    /**
     * @param list<string> $values
     */
    private static function booleanOrValuesAsToken(array $values): string
    {
        foreach ($values as $v) {
            if (PengurusBooleanHelper::isTruthy($v)) {
                return '1';
            }
        }

        return '0';
    }

    /**
     * @return array<string, string> kolom => nilai string (kosong jika NULL)
     */
    public static function loadPengurusStringMap(PDO $db, int $idPengurus): array
    {
        if ($idPengurus <= 0) {
            return array_fill_keys(self::WHITELIST, '');
        }
        $cols = self::pengurusSelectableColumns($db);
        if ($cols === []) {
            return array_fill_keys(self::WHITELIST, '');
        }
        $fields = array_map(static fn (string $c): string => '`' . str_replace('`', '``', $c) . '`', $cols);
        $sql = 'SELECT ' . implode(', ', $fields) . ' FROM `pengurus` WHERE `id` = ? LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute([$idPengurus]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return array_fill_keys(self::WHITELIST, '');
        }
        $map = [];
        foreach (self::WHITELIST as $k) {
            $v = $row[$k] ?? null;
            if ($v === null) {
                $map[$k] = '';
            } elseif (in_array($k, self::PENGURUS_BOOLEAN_COLUMNS, true)) {
                $map[$k] = PengurusBooleanHelper::toFormulaToken($v);
            } elseif (is_numeric($v)) {
                $map[$k] = (string) $v;
            } else {
                $map[$k] = trim((string) $v);
            }
        }

        return $map;
    }

    /**
     * Normalisasi konteks: terima map pengurus lama atau struktur lengkap.
     *
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $context
     * @return array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>}
     */
    private static function normalizeContext(array $context): array
    {
        if (isset($context['pengurus']) || isset($context['jabatan']) || isset($context['pj'])) {
            $empty = self::emptyFormulaContext();

            return [
                'pengurus' => array_merge($empty['pengurus'], $context['pengurus'] ?? []),
                'jabatan' => array_merge($empty['jabatan'], $context['jabatan'] ?? []),
                'pj' => array_merge($empty['pj'], $context['pj'] ?? []),
            ];
        }

        return [
            'pengurus' => array_merge(self::emptyPengurusMap(), $context),
            'jabatan' => self::emptyNamedMap(self::JABATAN_WHITELIST),
            'pj' => self::emptyNamedMap(self::PJ_WHITELIST),
        ];
    }

    /**
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $context
     */
    public static function preprocessFormula(string $formula, array $context): string
    {
        $ctx = self::normalizeContext($context);
        $pengurusMap = $ctx['pengurus'];
        $jabatanMap = $ctx['jabatan'];
        $pjMap = $ctx['pj'];

        $out = self::preprocessEqualityStringRefs($formula);

        $out = preg_replace_callback(
            '/\bHASJABATAN\s*\(\s*"((?:\\\\.|[^"\\\\])*)"\s*\)/i',
            static function (array $m) use ($jabatanMap): string {
                $needle = self::unescapeQuotedString($m[1]);
                $haystack = $jabatanMap['nama'] ?? '';
                if ($needle === '') {
                    return '0';
                }
                if (function_exists('mb_stripos')) {
                    $hit = mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
                } else {
                    $hit = stripos($haystack, $needle) !== false;
                }

                return $hit ? '1' : '0';
            },
            $out
        );
        if (!is_string($out)) {
            throw new \InvalidArgumentException('Rumus tidak valid setelah HASJABATAN.');
        }

        $out = self::preprocessContainsRefs($out, 'pengurus', $pengurusMap, [self::class, 'isAllowedColumn']);
        $out = self::preprocessContainsRefs($out, 'jabatan', $jabatanMap, [self::class, 'isAllowedJabatanColumn']);
        $out = self::preprocessContainsRefs($out, 'pj', $pjMap, [self::class, 'isAllowedPjColumn']);

        $out = self::preprocessEmptyRefs($out, 'pengurus', $pengurusMap, [self::class, 'isAllowedColumn']);
        $out = self::preprocessEmptyRefs($out, 'jabatan', $jabatanMap, [self::class, 'isAllowedJabatanColumn']);
        $out = self::preprocessEmptyRefs($out, 'pj', $pjMap, [self::class, 'isAllowedPjColumn']);

        $out = self::preprocessLenRefs($out, 'pengurus', $pengurusMap, [self::class, 'isAllowedColumn']);
        $out = self::preprocessLenRefs($out, 'jabatan', $jabatanMap, [self::class, 'isAllowedJabatanColumn']);
        $out = self::preprocessLenRefs($out, 'pj', $pjMap, [self::class, 'isAllowedPjColumn']);

        $out = self::substituteDirectRefs($out, 'pengurus', $pengurusMap, [self::class, 'isAllowedColumn']);
        $out = self::substituteDirectRefs($out, 'jabatan', $jabatanMap, [self::class, 'isAllowedJabatanColumn']);
        $out = self::substituteDirectRefs($out, 'pj', $pjMap, [self::class, 'isAllowedPjColumn']);
        $out = self::substituteDirectRefs($out, 'pengurus_jabatan', $pjMap, [self::class, 'isAllowedPjColumn']);

        return $out;
    }

    /**
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $formulaContext
     * @param array<string, string> $colTextEnv
     */
    public static function preprocessDateFunctions(string $formula, array $colTextEnv, array $formulaContext): string
    {
        $ctx = self::normalizeContext($formulaContext);

        return BisyarohFormulaDateHelper::preprocessDateFunctions($formula, $colTextEnv, $ctx);
    }

    /**
     * Cek kesalahan sintaks umum sebelum evaluasi (pesan lebih jelas dari «Fungsi tidak dikenal: LEN»).
     */
    public static function assertNoCommonFormulaMistakes(string $formula): void
    {
        $f = trim($formula);
        if ($f === '') {
            return;
        }
        if (preg_match(
            '/\bLEN\s*\(\s*(?:@\[([a-zA-Z_][a-zA-Z0-9_]*)\]|@(pengurus|jabatan|pj|pengurus_jabatan)\[([a-zA-Z_][a-zA-Z0-9_]*)\])\s*[><=!]/i',
            $f,
            $m
        )) {
            $ref = isset($m[1]) && $m[1] !== '' ? '@[' . $m[1] . ']' : '@' . ($m[2] ?? '') . '[' . ($m[3] ?? '') . ']';
            throw new \InvalidArgumentException(
                'LEN(' . $ref . '…): operator perbandingan (> < >= <=) harus di luar kurung LEN. '
                . 'Contoh benar: IF(LEN(' . $ref . ') > 8; 10000; 0) — bukan IF(LEN(' . $ref . '>8); …).'
            );
        }
    }

    /**
     * Preprocess fungsi teks untuk @[col_key] spreadsheet (kolom input/rumus di atas).
     * CONTAINS, ISEMPTY/BLANK, LEN, dan @[k] = "teks".
     *
     * @param array<string, string> $colTextEnv
     */
    public static function preprocessColTextRefs(string $formula, array $colTextEnv): string
    {
        $out = self::preprocessColEqualityStringRefs($formula, $colTextEnv);
        $out = self::preprocessContainsColRefs($out, $colTextEnv);
        $out = self::preprocessEmptyColRefs($out, $colTextEnv);
        $out = self::preprocessLenColRefs($out, $colTextEnv);

        return $out;
    }

    /**
     * @param array<string, string> $colTextEnv
     */
    private static function preprocessColEqualityStringRefs(string $formula, array $colTextEnv): string
    {
        $pattern = '/@\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*={1,2}\s*"((?:\\\\.|[^"\\\\])*)"/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($colTextEnv): string {
                $col = $m[1];
                $haystack = self::resolveColTextForFormula($col, $colTextEnv, 'perbandingan teks');
                $needle = self::unescapeQuotedString($m[2]);

                return self::textContains($haystack, $needle) ? '1' : '0';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $colTextEnv
     */
    private static function preprocessContainsColRefs(string $formula, array $colTextEnv): string
    {
        $pattern = '/CONTAINS\s*\(\s*@\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*[,;]\s*"((?:\\\\.|[^"\\\\])*)"\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($colTextEnv): string {
                $col = $m[1];
                $haystack = self::resolveColTextForFormula($col, $colTextEnv, 'CONTAINS');
                $needle = self::unescapeQuotedString($m[2]);

                return self::textContains($haystack, $needle) ? '1' : '0';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $colTextEnv
     */
    private static function preprocessEmptyColRefs(string $formula, array $colTextEnv): string
    {
        $pattern = '/\b(?:ISEMPTY|BLANK)\s*\(\s*@\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($colTextEnv): string {
                $col = $m[1];
                $raw = self::resolveColTextForFormula($col, $colTextEnv, 'ISEMPTY');

                return self::isEffectivelyEmptyString($raw) ? '1' : '0';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * LEN(@[col_key]) — panjang teks kolom input/rumus di atas (UTF-8).
     *
     * @param array<string, string> $colTextEnv
     */
    private static function preprocessLenColRefs(string $formula, array $colTextEnv): string
    {
        $pattern = '/\bLEN\s*\(\s*@\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($colTextEnv): string {
                $col = $m[1];
                $raw = self::resolveColTextForFormula($col, $colTextEnv, 'LEN');

                return (string) self::stringLengthUtf8($raw);
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $colTextEnv
     */
    private static function resolveColTextForFormula(string $col, array $colTextEnv, string $fnLabel): string
    {
        if (!array_key_exists($col, $colTextEnv)) {
            throw new \InvalidArgumentException(
                'Referensi @[' . $col . '] belum tersedia untuk ' . $fnLabel . ' (isi kolom di atas / urutan kolom).'
            );
        }

        return (string) ($colTextEnv[$col] ?? '');
    }

    private static function textContains(string $haystack, string $needle): bool
    {
        if ($needle === '') {
            return false;
        }
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
        }

        return stripos($haystack, $needle) !== false;
    }

    /**
     * @jabatan[tipe] = "guru" (atau ==) → CONTAINS(@jabatan[tipe]; "guru") — teks tidak bisa dibandingkan dengan = di evaluator angka.
     */
    private static function preprocessEqualityStringRefs(string $formula): string
    {
        $pattern = '/@(jabatan|pengurus|pj|pengurus_jabatan)\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*={1,2}\s*"((?:\\\\.|[^"\\\\])*)"/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m): string {
                $ns = strtolower($m[1]);
                if ($ns === 'pengurus_jabatan') {
                    $ns = 'pengurus_jabatan';
                }
                $col = $m[2];
                $quoted = $m[3];

                return 'CONTAINS(@' . $ns . '[' . $col . ']; "' . $quoted . '")';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $map
     * @param callable(string): bool $isAllowed
     */
    private static function preprocessContainsRefs(string $formula, string $ns, array $map, callable $isAllowed): string
    {
        $pattern = '/CONTAINS\s*\(\s*@' . preg_quote($ns, '/') . '\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*[,;]\s*"((?:\\\\.|[^"\\\\])*)"\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($map, $isAllowed, $ns): string {
                $col = $m[1];
                if (!$isAllowed($col)) {
                    throw new \InvalidArgumentException('Kolom ' . $ns . ' tidak diizinkan di CONTAINS: ' . $col);
                }
                $needle = self::unescapeQuotedString($m[2]);
                $haystack = $map[$col] ?? '';
                if ($needle === '') {
                    $hit = false;
                } else {
                    $hit = self::textContains($haystack, $needle);
                }

                return $hit ? '1' : '0';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $map
     * @param callable(string): bool $isAllowed
     */
    private static function preprocessEmptyRefs(string $formula, string $ns, array $map, callable $isAllowed): string
    {
        $pattern = '/\b(?:ISEMPTY|BLANK)\s*\(\s*@' . preg_quote($ns, '/') . '\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($map, $isAllowed, $ns): string {
                $col = $m[1];
                if (!$isAllowed($col)) {
                    throw new \InvalidArgumentException('Kolom ' . $ns . ' tidak diizinkan di ISEMPTY: ' . $col);
                }
                $raw = $map[$col] ?? '';

                return self::isEffectivelyEmptyString($raw) ? '1' : '0';
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * @param array<string, string> $map
     * @param callable(string): bool $isAllowed
     */
    private static function preprocessLenRefs(string $formula, string $ns, array $map, callable $isAllowed): string
    {
        $pattern = '/\bLEN\s*\(\s*@' . preg_quote($ns, '/') . '\[([a-zA-Z_][a-zA-Z0-9_]*)\]\s*\)/i';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($map, $isAllowed, $ns): string {
                $col = $m[1];
                if (!$isAllowed($col)) {
                    throw new \InvalidArgumentException('Kolom ' . $ns . ' tidak diizinkan di LEN: ' . $col);
                }
                $raw = $map[$col] ?? '';

                return (string) self::stringLengthUtf8($raw);
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    /**
     * Evaluasi rumus kolom tipe Teks: gabung & , literal "…", @pengurus/@jabatan/@pj, @[kolom].
     *
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $context
     * @param array<string, string> $colTextEnv
     */
    public static function evaluateTextFormula(string $formula, array $context, array $colTextEnv): string
    {
        return BisyarohTextFormulaEvaluator::evaluate($formula, self::normalizeContext($context), $colTextEnv);
    }

    /**
     * Rumus satu referensi teks (@pengurus[nama], @jabatan[tipe], …) — untuk kolom rumus tipe tampilan teks.
     *
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>} $context
     */
    public static function resolveTextLiteralFormula(string $formula, array $context): ?string
    {
        $formula = trim($formula);
        if ($formula === '') {
            return null;
        }
        if (!preg_match('/^@(pengurus|jabatan|pj|pengurus_jabatan)\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/', $formula, $m)) {
            return null;
        }
        $ctx = self::normalizeContext($context);
        $ns = strtolower($m[1]);
        $col = $m[2];
        if ($ns === 'pengurus') {
            if (!self::isAllowedColumn($col)) {
                throw new \InvalidArgumentException('Kolom pengurus tidak diizinkan: ' . $col);
            }

            return $ctx['pengurus'][$col] ?? '';
        }
        if ($ns === 'jabatan') {
            if (!self::isAllowedJabatanColumn($col)) {
                throw new \InvalidArgumentException('Kolom jabatan tidak diizinkan: ' . $col);
            }

            return $ctx['jabatan'][$col] ?? '';
        }
        if ($ns === 'pj' || $ns === 'pengurus_jabatan') {
            if (!self::isAllowedPjColumn($col)) {
                throw new \InvalidArgumentException('Kolom penugasan tidak diizinkan: ' . $col);
            }

            return $ctx['pj'][$col] ?? '';
        }

        return null;
    }

    /**
     * @param array<string, string> $map
     * @param callable(string): bool $isAllowed
     */
    private static function substituteDirectRefs(string $formula, string $ns, array $map, callable $isAllowed): string
    {
        $pattern = '/@' . preg_quote($ns, '/') . '\[([a-zA-Z_][a-zA-Z0-9_]*)\]/';
        $out = preg_replace_callback(
            $pattern,
            static function (array $m) use ($map, $isAllowed, $ns): string {
                $col = $m[1];
                if (!$isAllowed($col)) {
                    throw new \InvalidArgumentException('Kolom ' . $ns . ' tidak diizinkan: ' . $col);
                }
                $raw = $map[$col] ?? '';

                return self::coerceToNumericToken($raw);
            },
            $formula
        );

        return is_string($out) ? $out : $formula;
    }

    private static function unescapeQuotedString(string $s): string
    {
        return stripcslashes($s);
    }

    /**
     * Kosong: null/'' setelah trim, hanya spasi, atau hanya tanda strip/tiret (placeholder form).
     */
    private static function isEffectivelyEmptyString(string $raw): bool
    {
        $t = trim($raw);
        if ($t === '') {
            return true;
        }

        return (bool) preg_match('/^[\s\x{00A0}\x{2007}\x{202F}\-\x{2013}\x{2014}]+$/u', $t);
    }

    private static function stringLengthUtf8(string $s): int
    {
        if (function_exists('mb_strlen')) {
            return mb_strlen($s, 'UTF-8');
        }

        return strlen($s);
    }

    private static function coerceToNumericToken(string $raw): string
    {
        $t = trim($raw);
        if ($t === '') {
            return '0';
        }
        $lower = strtolower($t);
        if (
            in_array($lower, PengurusBooleanHelper::TRUTHY_STRINGS, true)
            || in_array($lower, PengurusBooleanHelper::FALSY_STRINGS, true)
        ) {
            return PengurusBooleanHelper::toFormulaToken($t);
        }
        if (is_numeric($t)) {
            $n = (float) $t;
            if (!is_finite($n)) {
                return '0';
            }

            return rtrim(rtrim(sprintf('%.12F', $n), '0'), '.');
        }
        $norm = str_replace(["\xc2\xa0", ' '], '', $t);
        $norm = str_replace(',', '.', $norm);
        if ($norm !== '' && is_numeric($norm)) {
            $n = (float) $norm;

            return rtrim(rtrim(sprintf('%.12F', $n), '0'), '.');
        }

        return '0';
    }
}
