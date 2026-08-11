<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Field whitelist + normalisasi payload pengajuan edit profil madrasah (PJGT → UGT).
 */
final class MadrasahEditPengajuanHelper
{
    public const STATUS_MENUNGGU = 'menunggu';
    public const STATUS_DISETUJUI = 'disetujui';
    public const STATUS_DITOLAK = 'ditolak';

    public const ACTION_CODE = 'action.ugt.data_madrasah.pengajuan_edit';

    /** Kolom teks/angka yang boleh diajukan PJGT (bukan penugasan UGT). */
    public const FIELD_KEYS = [
        'nama',
        'identitas',
        'kategori',
        'id_alamat',
        'dusun',
        'rt',
        'rw',
        'desa',
        'kecamatan',
        'kabupaten',
        'provinsi',
        'kode_pos',
        'nama_pengasuh',
        'no_pengasuh',
        'nama_pjgt',
        'no_pjgt',
        'kepala',
        'sekretaris',
        'bendahara',
        'tingkatan',
        'kelas_tertinggi',
        'kurikulum',
        'jumlah_murid',
        'kegiatan_pagi',
        'kegiatan_sore',
        'kegiatan_malam',
        'kegiatan_mulai',
        'kegiatan_sampai',
        'kegiatan_pagi_mulai',
        'kegiatan_pagi_sampai',
        'kegiatan_sore_mulai',
        'kegiatan_sore_sampai',
        'kegiatan_malam_mulai',
        'kegiatan_malam_sampai',
        'tempat',
        'berdiri_tahun',
        'keterangan',
        'banin_banat',
        'seragam',
        'syahriah',
        'pengelola',
        'gedung_madrasah',
        'kantor',
        'bangku',
        'kamar_mandi_murid',
        'kamar_gt',
        'kamar_mandi_gt',
        'km_bersifat',
        'konsumsi',
        'kamar_gt_jarak',
        'masyarakat',
        'alumni',
        'jarak_md_lain',
    ];

    private const KATEGORI = ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya'];
    private const KURIKULUM = ['Depag', 'Diniyah (Mandiri)'];
    private const BOOL_KEYS = ['kegiatan_pagi', 'kegiatan_sore', 'kegiatan_malam'];
    private const INT_KEYS = ['jumlah_murid', 'berdiri_tahun'];

    public static function snapshotFromMadrasahRow(array $row): array
    {
        $out = [];
        foreach (self::FIELD_KEYS as $key) {
            if (!array_key_exists($key, $row)) {
                $out[$key] = null;
                continue;
            }
            $out[$key] = self::normalizeStoredValue($key, $row[$key]);
        }

        return $out;
    }

    /**
     * Ambil subset field dari request body (PJGT atau admin draft).
     *
     * @return array{ok:bool,data?:array,message?:string}
     */
    public static function extractPayload(array $data, bool $requireNama = true): array
    {
        $data = TextSanitizer::sanitizeStringValues($data, []);
        $out = [];

        foreach (self::FIELD_KEYS as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $out[$key] = self::normalizeInputValue($key, $data[$key]);
        }

        if (isset($data['tingkatan']) || isset($data['tingkatan_slugs']) || isset($data['tingkatan_json'])) {
            $tingkatanJson = MadrasahTingkatanHelper::parseFromRequest($data);
            $out['tingkatan'] = $tingkatanJson;
        }

        if ($requireNama) {
            $nama = trim((string) ($out['nama'] ?? $data['nama'] ?? ''));
            if ($nama === '') {
                return ['ok' => false, 'message' => 'Nama madrasah wajib diisi'];
            }
            $out['nama'] = $nama;
        }

        if (isset($out['kategori']) && $out['kategori'] !== null && !in_array($out['kategori'], self::KATEGORI, true)) {
            $out['kategori'] = null;
        }
        if (isset($out['kurikulum']) && $out['kurikulum'] !== null && !in_array($out['kurikulum'], self::KURIKULUM, true)) {
            $out['kurikulum'] = null;
        }

        $jam = self::parseKegiatanJam($out);
        foreach ($jam as $k => $v) {
            $out[$k] = $v;
        }

        return ['ok' => true, 'data' => $out];
    }

    /** Merge data_baru penuh: snapshot lama + override payload. */
    public static function mergeDataBaru(array $snapshotLama, array $partialBaru): array
    {
        $merged = $snapshotLama;
        foreach ($partialBaru as $k => $v) {
            if (in_array($k, self::FIELD_KEYS, true)) {
                $merged[$k] = $v;
            }
        }

        return self::snapshotFromMadrasahRow($merged);
    }

    public static function normalizeUploadPath(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }
        $path = trim(str_replace('\\', '/', $path));
        if ($path === '' || preg_match('/\.\./', $path)) {
            return null;
        }
        if (stripos($path, 'uploads/') === 0) {
            $path = substr($path, strlen('uploads/'));
        }
        $path = ltrim($path, '/');
        if ($path === '' || !str_starts_with($path, 'ugt/')) {
            return null;
        }

        return 'uploads/' . $path;
    }

    public static function encodeJson(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    public static function decodeJson($raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    public static function canReviewPengajuan(\PDO $db, array $user): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }
        if (!RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($db, $user, 'action.ugt.data_madrasah.')) {
            return RoleHelper::tokenHasAnyRoleKey($user, ['admin_ugt', 'koordinator_ugt', 'super_admin']);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::ACTION_CODE);
    }

    private static function normalizeStoredValue(string $key, $value)
    {
        if ($value === null || $value === '') {
            if (in_array($key, self::BOOL_KEYS, true)) {
                return 0;
            }

            return null;
        }
        if (in_array($key, self::BOOL_KEYS, true)) {
            return (int) (bool) $value;
        }
        if (in_array($key, self::INT_KEYS, true)) {
            return (int) $value;
        }
        if ($key === 'tingkatan') {
            if (is_array($value)) {
                return MadrasahTingkatanHelper::encode($value);
            }

            return is_string($value) ? $value : null;
        }

        return is_scalar($value) ? (string) $value : null;
    }

    private static function normalizeInputValue(string $key, $value)
    {
        if ($value === null || $value === '') {
            if (in_array($key, self::BOOL_KEYS, true)) {
                return 0;
            }

            return null;
        }
        if (in_array($key, self::BOOL_KEYS, true)) {
            return (int) (bool) $value;
        }
        if (in_array($key, self::INT_KEYS, true)) {
            return (int) $value;
        }
        if ($key === 'tingkatan') {
            return null; // diisi lewat parseFromRequest
        }
        $s = trim((string) $value);

        return $s === '' ? null : $s;
    }

    private static function parseKegiatanJam(array $data): array
    {
        $opt = static function (string $key, int $maxLen = 10) use ($data): ?string {
            if (!isset($data[$key])) {
                return null;
            }
            $v = trim((string) $data[$key]);

            return $v === '' ? null : substr($v, 0, $maxLen);
        };

        $pagi = isset($data['kegiatan_pagi']) ? (int) (bool) $data['kegiatan_pagi'] : 0;
        $sore = isset($data['kegiatan_sore']) ? (int) (bool) $data['kegiatan_sore'] : 0;
        $malam = isset($data['kegiatan_malam']) ? (int) (bool) $data['kegiatan_malam'] : 0;

        $pagiMulai = $pagi ? $opt('kegiatan_pagi_mulai') : null;
        $pagiSampai = $pagi ? $opt('kegiatan_pagi_sampai') : null;
        $soreMulai = $sore ? $opt('kegiatan_sore_mulai') : null;
        $soreSampai = $sore ? $opt('kegiatan_sore_sampai') : null;
        $malamMulai = $malam ? $opt('kegiatan_malam_mulai') : null;
        $malamSampai = $malam ? $opt('kegiatan_malam_sampai') : null;

        $legacyMulai = $opt('kegiatan_mulai');
        $legacySampai = $opt('kegiatan_sampai');
        if ($legacyMulai === null && $pagiMulai !== null) {
            $legacyMulai = $pagiMulai;
        }
        if ($legacySampai === null && $pagiSampai !== null) {
            $legacySampai = $pagiSampai;
        }

        return [
            'kegiatan_pagi' => $pagi,
            'kegiatan_sore' => $sore,
            'kegiatan_malam' => $malam,
            'kegiatan_mulai' => $legacyMulai,
            'kegiatan_sampai' => $legacySampai,
            'kegiatan_pagi_mulai' => $pagiMulai,
            'kegiatan_pagi_sampai' => $pagiSampai,
            'kegiatan_sore_mulai' => $soreMulai,
            'kegiatan_sore_sampai' => $soreSampai,
            'kegiatan_malam_mulai' => $malamMulai,
            'kegiatan_malam_sampai' => $malamSampai,
        ];
    }
}
