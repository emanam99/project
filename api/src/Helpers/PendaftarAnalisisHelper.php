<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Agregat analisis data pendaftar PSB per tahun ajaran (selaras GET analisis-pendaftar).
 */
final class PendaftarAnalisisHelper
{
    private const MAX_SAMPLE_BELUM_BAYAR = 36;

    private const MAX_SAMPLE_KURANG_BAYAR = 22;

    private const MAX_DISTRIBUSI_HARI = 28;

    /** @var array<string, true>|null */
    private static ?array $psbRegistrasiColumns = null;

    /**
     * Kolom psb___registrasi (cache per-request) — menghindari error 500 bila migrasi belum menambah kolom opsional.
     *
     * @return array<string, true>
     */
    private static function psbRegistrasiColumnSet(\PDO $db): array
    {
        if (self::$psbRegistrasiColumns !== null) {
            return self::$psbRegistrasiColumns;
        }
        $set = [];
        try {
            $st = $db->query('SHOW COLUMNS FROM `psb___registrasi`');
            if ($st !== false) {
                while ($row = $st->fetch(\PDO::FETCH_ASSOC)) {
                    $f = isset($row['Field']) ? trim((string) $row['Field']) : '';
                    if ($f !== '') {
                        $set[$f] = true;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('PendaftarAnalisisHelper::psbRegistrasiColumnSet: ' . $e->getMessage());
        }
        self::$psbRegistrasiColumns = $set;

        return $set;
    }

    public static function registrasiTableExists(\PDO $db): bool
    {
        try {
            $chk = $db->query("SHOW TABLES LIKE 'psb___registrasi'");

            return $chk !== false && $chk->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function emptyPayloadNoTable(string $tahunHijriyah, string $tahunMasehi): array
    {
        return [
            'tahun_hijriyah' => $tahunHijriyah,
            'tahun_masehi' => $tahunMasehi,
            'ringkasan_pembayaran' => [
                'total_registrasi' => 0,
                'lunas' => 0,
                'belum_bayar' => 0,
                'kurang_bayar' => 0,
                'tanpa_tagihan' => 0,
                'total_wajib_rp' => 0.0,
                'total_bayar_rp' => 0.0,
                'total_kurang_rp' => 0.0,
            ],
            'breakdown_formal' => [],
            'breakdown_diniyah' => [],
            'registrasi_ganda_per_santri' => [],
            'potensi_duplikasi_orang_sama' => [],
            'distribusi_hari_pendaftar' => [],
            'keterangan' => 'Tabel psb___registrasi tidak ada.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function emptyPayloadNoLembagaAccess(string $tahunHijriyah, string $tahunMasehi): array
    {
        return [
            'tahun_hijriyah' => $tahunHijriyah,
            'tahun_masehi' => $tahunMasehi,
            'ringkasan_pembayaran' => [
                'total_registrasi' => 0,
                'lunas' => 0,
                'belum_bayar' => 0,
                'kurang_bayar' => 0,
                'tanpa_tagihan' => 0,
                'total_wajib_rp' => 0.0,
                'total_bayar_rp' => 0.0,
                'total_kurang_rp' => 0.0,
            ],
            'breakdown_formal' => [],
            'breakdown_diniyah' => [],
            'registrasi_ganda_per_santri' => [],
            'potensi_duplikasi_orang_sama' => [],
            'distribusi_hari_pendaftar' => [],
            'message' => 'Tidak ada akses lembaga untuk data ini',
        ];
    }

    /**
     * Snapshot analisis untuk satu pasangan tahun ajaran + filter lembaga pengguna.
     *
     * @param array<string, mixed>|null $userPayload Atribut user dari request / JWT
     * @return array<string, mixed>
     */
    public static function buildSnapshot(
        \PDO $db,
        ?array $userPayload,
        string $tahunHijriyah,
        string $tahunMasehi,
        bool $includeDetailSamples = false
    ): array {
        $whereConditions = ['r.tahun_hijriyah = ?', 'r.tahun_masehi = ?'];
        $params = [$tahunHijriyah, $tahunMasehi];

        $pidFilter = is_array($userPayload) ? RoleHelper::getPengurusIdFromPayload($userPayload) : null;
        $pf = RoleHelper::resolvePendaftarLembagaSqlFilter(is_array($userPayload) ? $userPayload : null, $pidFilter);
        if ($pf !== null) {
            if (!empty($pf['empty'])) {
                return self::emptyPayloadNoLembagaAccess($tahunHijriyah, $tahunMasehi);
            }
            if (!empty($pf['clause']) && isset($pf['params']) && is_array($pf['params'])) {
                $whereConditions[] = $pf['clause'];
                foreach ($pf['params'] as $p) {
                    $params[] = $p;
                }
            }
        }

        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);

        $regCols = self::psbRegistrasiColumnSet($db);
        $tanggalBiodataSql = isset($regCols['tanggal_biodata_simpan'])
            ? "                    r.tanggal_biodata_simpan,\n"
            : '';

        $sql = "SELECT
                    r.id AS id_registrasi,
                    r.id_santri,
                    r.tanggal_dibuat,
$tanggalBiodataSql
                    s.nis,
                    s.nama,
                    s.nik,
                    s.tanggal_lahir,
                    s.no_telpon,
                    s.no_wa_santri,
                    s.no_kk,
                    r.daftar_formal,
                    r.daftar_diniyah,
                    (SELECT COALESCE(SUM(i.harga), 0) FROM psb___registrasi_detail rd
                     INNER JOIN psb___item i ON rd.id_item = i.id WHERE rd.id_registrasi = r.id) AS wajib_from_detail,
                    r.wajib,
                    r.bayar
                FROM psb___registrasi r
                INNER JOIN santri s ON r.id_santri = s.id
                $whereClause";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rawRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $ring = [
            'total_registrasi' => \count($rawRows),
            'lunas' => 0,
            'belum_bayar' => 0,
            'kurang_bayar' => 0,
            'tanpa_tagihan' => 0,
            'total_wajib_rp' => 0.0,
            'total_bayar_rp' => 0.0,
            'total_kurang_rp' => 0.0,
        ];

        $formalCount = [];
        $diniyahCount = [];
        $perSantriRegs = [];

        $byNamaTgl = [];
        $byPhone = [];
        $byKk = [];
        $byDay = [];

        $samplesBelum = [];
        $samplesKurang = [];

        foreach ($rawRows as $raw) {
            $idReg = (int) ($raw['id_registrasi'] ?? 0);
            $idSantri = (int) ($raw['id_santri'] ?? 0);
            $wDetail = (float) ($raw['wajib_from_detail'] ?? 0);
            $wCol = isset($raw['wajib']) ? (float) $raw['wajib'] : 0.0;
            $wEff = $wDetail > 0 ? $wDetail : $wCol;
            $bayar = isset($raw['bayar']) ? (float) $raw['bayar'] : 0.0;
            $kurang = $wEff > 0 ? max(0.0, $wEff - $bayar) : 0.0;

            if ($wEff <= 0) {
                $ring['tanpa_tagihan']++;
                $status = 'tanpa_tagihan';
            } elseif ($bayar >= $wEff) {
                $ring['lunas']++;
                $status = 'lunas';
            } elseif ($bayar <= 0) {
                $ring['belum_bayar']++;
                $status = 'belum_bayar';
            } else {
                $ring['kurang_bayar']++;
                $status = 'kurang_bayar';
            }

            $ring['total_wajib_rp'] += $wEff;
            $ring['total_bayar_rp'] += $bayar;
            $ring['total_kurang_rp'] += $kurang;

            $dayKey = self::registrasiDayKey($raw);
            if ($dayKey !== null) {
                $byDay[$dayKey] = ($byDay[$dayKey] ?? 0) + 1;
            }

            $fKey = trim((string) ($raw['daftar_formal'] ?? ''));
            if ($fKey === '') {
                $fKey = '-';
            }
            $formalCount[$fKey] = ($formalCount[$fKey] ?? 0) + 1;

            $dKey = trim((string) ($raw['daftar_diniyah'] ?? ''));
            if ($dKey === '') {
                $dKey = '-';
            }
            $diniyahCount[$dKey] = ($diniyahCount[$dKey] ?? 0) + 1;

            if (!isset($perSantriRegs[$idSantri])) {
                $perSantriRegs[$idSantri] = [];
            }
            $perSantriRegs[$idSantri][] = $idReg;

            $lite = [
                'id_registrasi' => $idReg,
                'id_santri' => $idSantri,
                'nis' => $raw['nis'] !== null && $raw['nis'] !== '' ? (string) $raw['nis'] : null,
                'nama' => (string) ($raw['nama'] ?? ''),
                'nik' => $raw['nik'] !== null ? (string) $raw['nik'] : '',
                'tanggal_lahir' => $raw['tanggal_lahir'] ?? null,
                'no_telpon' => $raw['no_telpon'] ?? null,
                'no_wa_santri' => $raw['no_wa_santri'] ?? null,
                'no_kk' => $raw['no_kk'] ?? null,
                'wajib' => $wEff,
                'bayar' => $bayar,
                'kurang' => $kurang,
                'status_pembayaran' => $status,
            ];

            if ($includeDetailSamples) {
                if ($status === 'belum_bayar' && \count($samplesBelum) < self::MAX_SAMPLE_BELUM_BAYAR) {
                    $samplesBelum[] = [
                        'id_registrasi' => $idReg,
                        'id_santri' => $idSantri,
                        'nis' => $lite['nis'],
                        'nama' => $lite['nama'],
                        'wajib_rp' => round($wEff),
                        'bayar_rp' => round($bayar),
                        'kurang_rp' => round($kurang),
                    ];
                }
                if ($status === 'kurang_bayar' && \count($samplesKurang) < self::MAX_SAMPLE_KURANG_BAYAR) {
                    $samplesKurang[] = [
                        'id_registrasi' => $idReg,
                        'id_santri' => $idSantri,
                        'nis' => $lite['nis'],
                        'nama' => $lite['nama'],
                        'wajib_rp' => round($wEff),
                        'bayar_rp' => round($bayar),
                        'kurang_rp' => round($kurang),
                    ];
                }
            }

            $nn = self::normalizeNama((string) ($raw['nama'] ?? ''));
            $tl = self::normalizeTgl($raw['tanggal_lahir'] ?? null);
            if ($nn !== '' && $tl !== null) {
                $kNt = $nn . '|' . $tl;
                $byNamaTgl[$kNt][] = $lite;
            }

            $ph = self::normalizePhone($raw['no_telpon'] ?? null)
                ?? self::normalizePhone($raw['no_wa_santri'] ?? null);
            if ($ph !== null) {
                $byPhone[$ph][] = $lite;
            }

            $kk = self::normalizeKk($raw['no_kk'] ?? null);
            if ($kk !== null) {
                $byKk[$kk][] = $lite;
            }
        }

        $breakdownFormal = [];
        foreach ($formalCount as $kode => $jumlah) {
            $breakdownFormal[] = ['kode' => $kode, 'jumlah' => $jumlah];
        }
        usort($breakdownFormal, static fn (array $a, array $b): int => ($b['jumlah'] ?? 0) <=> ($a['jumlah'] ?? 0));

        $breakdownDiniyah = [];
        foreach ($diniyahCount as $kode => $jumlah) {
            $breakdownDiniyah[] = ['kode' => $kode, 'jumlah' => $jumlah];
        }
        usort($breakdownDiniyah, static fn (array $a, array $b): int => ($b['jumlah'] ?? 0) <=> ($a['jumlah'] ?? 0));

        $registrasiGanda = [];
        foreach ($perSantriRegs as $sid => $ids) {
            if (\count($ids) > 1) {
                $registrasiGanda[] = [
                    'id_santri' => $sid,
                    'jumlah_registrasi' => \count($ids),
                    'id_registrasi' => array_values(array_unique($ids)),
                ];
            }
        }
        usort($registrasiGanda, static fn (array $a, array $b): int => ($b['jumlah_registrasi'] ?? 0) <=> ($a['jumlah_registrasi'] ?? 0));

        $potensi = [];
        $appendPotensi = static function (string $jenis, string $deskripsi, string $kunciRingkas, array $anggota) use (&$potensi): void {
            $sidMap = [];
            foreach ($anggota as $m) {
                $sidMap[(int) ($m['id_santri'] ?? 0)] = true;
            }
            unset($sidMap[0]);
            if (\count($sidMap) < 2) {
                return;
            }
            $nikCanon = [];
            foreach ($anggota as $m) {
                $nk = preg_replace('/\D/', '', (string) ($m['nik'] ?? ''));
                if ($nk !== '') {
                    $nikCanon[$nk] = true;
                }
            }
            $potensi[] = [
                'jenis' => $jenis,
                'deskripsi' => $deskripsi,
                'kunci_ringkas' => $kunciRingkas,
                'nik_unik_berbeda' => \count($nikCanon) > 1,
                'anggota' => array_values($anggota),
            ];
        };

        foreach ($byNamaTgl as $k => $members) {
            if (\count($members) < 2) {
                continue;
            }
            $appendPotensi(
                'nama_tanggal_lahir',
                'Nama dan tanggal lahir sama pada beberapa santri berbeda — cek kemungkinan pendaftar ganda (mis. NIK beda).',
                (string) $k,
                $members
            );
        }
        foreach ($byPhone as $k => $members) {
            if (\count($members) < 2) {
                continue;
            }
            // Kunci numerik (nomor kanonik) jadi int di PHP — wajib string untuk closure bertipe string
            $appendPotensi(
                'nomor_hp_wa',
                'Nomor telepon/WA sama untuk beberapa santri berbeda.',
                (string) $k,
                $members
            );
        }
        foreach ($byKk as $k => $members) {
            if (\count($members) < 2) {
                continue;
            }
            $appendPotensi(
                'no_kk',
                'Nomor KK sama untuk beberapa santri berbeda (bisa sah keluarga besar — atau entri ganda).',
                (string) $k,
                $members
            );
        }

        $distribusiHari = [];
        foreach ($byDay as $tanggal => $jumlah) {
            $distribusiHari[] = ['tanggal' => $tanggal, 'jumlah' => $jumlah];
        }
        usort($distribusiHari, static function (array $a, array $b): int {
            $cj = ($b['jumlah'] ?? 0) <=> ($a['jumlah'] ?? 0);
            if ($cj !== 0) {
                return $cj;
            }

            return strcmp((string) ($b['tanggal'] ?? ''), (string) ($a['tanggal'] ?? ''));
        });
        $distribusiHari = array_slice($distribusiHari, 0, self::MAX_DISTRIBUSI_HARI);

        $out = [
            'tahun_hijriyah' => $tahunHijriyah,
            'tahun_masehi' => $tahunMasehi,
            'ringkasan_pembayaran' => $ring,
            'breakdown_formal' => $breakdownFormal,
            'breakdown_diniyah' => $breakdownDiniyah,
            'registrasi_ganda_per_santri' => $registrasiGanda,
            'potensi_duplikasi_orang_sama' => $potensi,
            'distribusi_hari_pendaftar' => $distribusiHari,
            'keterangan' => 'Potensi duplikasi bersifat heuristik (nama+tgl lahir, HP/WA, KK). Verifikasi manual sebelum padukan data.',
        ];

        if ($includeDetailSamples) {
            $out['detail_samples'] = [
                'belum_bayar' => $samplesBelum,
                'kurang_bayar' => $samplesKurang,
            ];
        }

        return $out;
    }

    /**
     * Tahun ajaran (hijriyah+masehi) dengan registrasi terbanyak dalam lingkup filter pengguna.
     *
     * @param array<string, mixed>|null $userPayload
     *
     * @return array{hijriyah: string, masehi: string}|null
     */
    public static function resolveDominantTahunAjaran(\PDO $db, ?array $userPayload): ?array
    {
        if (!self::registrasiTableExists($db)) {
            return null;
        }

        $whereConditions = ['1=1'];
        $params = [];

        $pidFilter = is_array($userPayload) ? RoleHelper::getPengurusIdFromPayload($userPayload) : null;
        $pf = RoleHelper::resolvePendaftarLembagaSqlFilter(is_array($userPayload) ? $userPayload : null, $pidFilter);
        if ($pf !== null) {
            if (!empty($pf['empty'])) {
                return null;
            }
            if (!empty($pf['clause']) && isset($pf['params']) && is_array($pf['params'])) {
                $whereConditions[] = $pf['clause'];
                foreach ($pf['params'] as $p) {
                    $params[] = $p;
                }
            }
        }

        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
        $sql = "SELECT r.tahun_hijriyah AS th, r.tahun_masehi AS tm, COUNT(*) AS c
                FROM psb___registrasi r
                $whereClause
                AND TRIM(COALESCE(r.tahun_hijriyah, '')) <> ''
                AND TRIM(COALESCE(r.tahun_masehi, '')) <> ''
                GROUP BY r.tahun_hijriyah, r.tahun_masehi
                ORDER BY c DESC, r.tahun_masehi DESC, r.tahun_hijriyah DESC
                LIMIT 1";

        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('PendaftarAnalisisHelper::resolveDominantTahunAjaran: ' . $e->getMessage());

            return null;
        }

        if ($row === false || $row === null) {
            return null;
        }
        $th = trim((string) ($row['th'] ?? ''));
        $tm = trim((string) ($row['tm'] ?? ''));
        if ($th === '' || $tm === '') {
            return null;
        }

        return ['hijriyah' => $th, 'masehi' => $tm];
    }

    /**
     * @param array<string, mixed> $raw Baris SELECT registrasi + santri
     */
    private static function registrasiDayKey(array $raw): ?string
    {
        $ts = $raw['tanggal_biodata_simpan'] ?? null;
        if ($ts === null || trim((string) $ts) === '') {
            $ts = $raw['tanggal_dibuat'] ?? null;
        }
        if ($ts === null || trim((string) $ts) === '') {
            return null;
        }
        $t = strtotime((string) $ts);

        return $t !== false ? date('Y-m-d', $t) : null;
    }

    private static function normalizeNama(string $nama): string
    {
        $s = mb_strtolower(trim($nama), 'UTF-8');
        $s = preg_replace('/[^\p{L}\p{N}\s]/u', '', $s) ?? '';
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';

        return trim($s);
    }

    /**
     * @return ?string format Y-m-d
     */
    private static function normalizeTgl($tanggalLahir): ?string
    {
        if ($tanggalLahir === null || $tanggalLahir === '') {
            return null;
        }
        $ts = strtotime((string) $tanggalLahir);

        return $ts !== false ? date('Y-m-d', $ts) : null;
    }

    /**
     * Nomor kanonik minimal 9 digit (HP Indonesia).
     */
    private static function normalizePhone($phone): ?string
    {
        if ($phone === null || trim((string) $phone) === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', (string) $phone);
        if ($digits === '') {
            return null;
        }
        if (\strlen($digits) >= 11 && str_starts_with($digits, '62')) {
            $digits = '0' . substr($digits, 2);
        }
        if (\strlen($digits) >= 10) {
            return substr($digits, -10);
        }

        return \strlen($digits) >= 9 ? $digits : null;
    }

    private static function normalizeKk($noKk): ?string
    {
        if ($noKk === null || trim((string) $noKk) === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', (string) $noKk);

        return \strlen($digits) >= 8 ? $digits : null;
    }
}
