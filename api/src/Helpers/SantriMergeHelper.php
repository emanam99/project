<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Logika pemaduan dua baris santri (utama + sekunder) — dipakai PendaftaranController::mergeSantri.
 * Mode parsial tidak menghapus baris sekunder; mode full menjalankan semua langkah lalu DELETE sekunder.
 */
final class SantriMergeHelper
{
    /**
     * Kolom biodata di tabel santri yang boleh dipadukan (selaras PendaftaranController::saveBiodata $allowedFields).
     * Dikecualikan: nis (identitas baris), id, id_user, timestamps — tidak boleh disalin antar baris.
     */
    public const BIODATA_MERGE_FIELDS = [
        'nama', 'nik', 'gender', 'tempat_lahir', 'tanggal_lahir', 'nisn', 'no_kk', 'kepala_keluarga',
        'anak_ke', 'jumlah_saudara', 'saudara_di_pesantren', 'hobi', 'cita_cita', 'kebutuhan_khusus',
        'ayah', 'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah',
        'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
        'ibu', 'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu',
        'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
        'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali',
        'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali',
        'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
        'madrasah', 'nama_madrasah', 'alamat_madrasah', 'lulus_madrasah',
        'sekolah', 'nama_sekolah', 'alamat_sekolah', 'lulus_sekolah', 'npsn', 'nsm',
        'no_telpon', 'email', 'riwayat_sakit', 'ukuran_baju', 'kip', 'pkh', 'kks',
        'status_nikah', 'pekerjaan', 'no_wa_santri',
        'status_pendaftar', 'status_murid',
        'id_kamar', 'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
        'id_lttq_tingkatan',
    ];

    /** Nilai dianggap kosong untuk merge fill_empty / sumber prefer_sekunder (termasuk placeholder tanggal MySQL). */
    private static function isEmptyForMerge($value): bool
    {
        if ($value === null) {
            return true;
        }
        if (is_string($value)) {
            $t = trim($value);
            if ($t === '') {
                return true;
            }
            if (strlen($t) >= 10 && substr($t, 0, 10) === '0000-00-00') {
                return true;
            }

            return false;
        }
        if (is_numeric($value)) {
            return ((int) $value) === 0;
        }

        return empty($value);
    }

    /**
     * @return list<int> id registrasi sekunder yang dihapus karena bentrok tahun dengan utama
     */
    public static function moveRegistrasi(PDO $db, int $idSantriUtama, int $idSantriSekunder): array
    {
        $removedRegistrasiIdsFromMerge = [];

        $sqlCheckConflict = 'SELECT r1.id as id_utama, r2.id as id_sekunder, r1.tahun_hijriyah, r1.tahun_masehi
                             FROM psb___registrasi r1
                             INNER JOIN psb___registrasi r2 ON (
                                 r1.id_santri = ? AND r2.id_santri = ? AND
                                 (r1.tahun_hijriyah = r2.tahun_hijriyah OR r1.tahun_masehi = r2.tahun_masehi)
                             )';
        $stmtCheckConflict = $db->prepare($sqlCheckConflict);
        $stmtCheckConflict->execute([$idSantriUtama, $idSantriSekunder]);
        $conflicts = $stmtCheckConflict->fetchAll(PDO::FETCH_ASSOC);

        if (count($conflicts) > 0) {
            $conflictIds = array_column($conflicts, 'id_sekunder');
            $removedRegistrasiIdsFromMerge = array_values(array_filter(array_map('intval', $conflictIds), function ($x) {
                return (int) $x > 0;
            }));
            $placeholders = implode(',', array_fill(0, count($conflictIds), '?'));

            $sqlDeleteDetail = "DELETE FROM psb___registrasi_detail WHERE id_registrasi IN ($placeholders)";
            $db->prepare($sqlDeleteDetail)->execute($conflictIds);

            $sqlDeleteTransaksi = "DELETE FROM psb___transaksi WHERE id_registrasi IN ($placeholders)";
            $db->prepare($sqlDeleteTransaksi)->execute($conflictIds);

            $sqlDeleteRegistrasi = "DELETE FROM psb___registrasi WHERE id IN ($placeholders)";
            $db->prepare($sqlDeleteRegistrasi)->execute($conflictIds);
        }

        $sqlUpdateRegistrasi = 'UPDATE psb___registrasi SET id_santri = ? WHERE id_santri = ?';
        $db->prepare($sqlUpdateRegistrasi)->execute([$idSantriUtama, $idSantriSekunder]);

        return $removedRegistrasiIdsFromMerge;
    }

    public static function moveBerkas(PDO $db, int $idSantriUtama, int $idSantriSekunder): void
    {
        $sql = 'UPDATE santri___berkas SET id_santri = ? WHERE id_santri = ?';
        $db->prepare($sql)->execute([$idSantriUtama, $idSantriSekunder]);
    }

    /** UWABA: syahriah, tunggakan, khusus + tabel bayar terkait */
    public static function moveUwabaFamily(PDO $db, int $idSantriUtama, int $idSantriSekunder): void
    {
        $pairs = [
            ['uwaba', 'id_santri'],
            ['uwaba___bayar', 'id_santri'],
            ['uwaba___tunggakan', 'id_santri'],
            ['uwaba___bayar_tunggakan', 'id_santri'],
            ['uwaba___khusus', 'id_santri'],
            ['uwaba___bayar_khusus', 'id_santri'],
        ];
        foreach ($pairs as [$table, $col]) {
            $sql = "UPDATE `{$table}` SET `{$col}` = ? WHERE `{$col}` = ?";
            $db->prepare($sql)->execute([$idSantriUtama, $idSantriSekunder]);
        }
    }

    /** Referensi lain ke santri.id (agar tidak hangus saat DELETE sekunder) */
    public static function moveOtherSantriReferences(PDO $db, int $idSantriUtama, int $idSantriSekunder): void
    {
        $pairs = [
            ['payment', 'id_santri'],
            ['santri___ijin', 'id_santri'],
            ['santri___boyong', 'id_santri'],
            ['santri___juara', 'id_santri'],
            ['whatsapp', 'id_santri'],
            ['whatsapp___pending', 'id_santri'],
        ];
        foreach ($pairs as [$table, $col]) {
            try {
                $sql = "UPDATE `{$table}` SET `{$col}` = ? WHERE `{$col}` = ?";
                $db->prepare($sql)->execute([$idSantriUtama, $idSantriSekunder]);
            } catch (\Throwable $e) {
                // Tabel opsional / skema beda — abaikan agar merge tetap jalan
            }
        }
    }

    /**
     * @param 'fill_empty'|'prefer_utama'|'prefer_sekunder' $strategy
     * @param 'auto'|'nullify_sekunder'|'random_placeholder_sekunder' $nikResolution dipakai jika akan menulis NIK ke utama dari sekunder sementara kedua baris masih ada
     */
    public static function mergeBiodata(
        PDO $db,
        int $idSantriUtama,
        int $idSantriSekunder,
        string $strategy,
        string $nikResolution
    ): void {
        $stmtS = $db->prepare('SELECT * FROM santri WHERE id = ?');
        $stmtS->execute([$idSantriSekunder]);
        $dataSekunder = $stmtS->fetch(PDO::FETCH_ASSOC);
        if ($dataSekunder === false) {
            return;
        }

        $stmtU = $db->prepare('SELECT * FROM santri WHERE id = ?');
        $stmtU->execute([$idSantriUtama]);
        $dataUtama = $stmtU->fetch(PDO::FETCH_ASSOC);
        if ($dataUtama === false) {
            return;
        }

        if ($strategy === 'prefer_utama') {
            return;
        }

        $updateFields = [];
        $updateValues = [];

        if ($strategy === 'fill_empty') {
            foreach (self::BIODATA_MERGE_FIELDS as $field) {
                $uVal = $dataUtama[$field] ?? null;
                $sVal = $dataSekunder[$field] ?? null;
                if (self::isEmptyForMerge($uVal) && !self::isEmptyForMerge($sVal)) {
                    if ($field === 'nik') {
                        self::resolveNikBeforeCopyUtama(
                            $db,
                            $idSantriUtama,
                            $idSantriSekunder,
                            (string) ($dataSekunder['nik'] ?? ''),
                            $nikResolution
                        );
                    }
                    $updateFields[] = "`{$field}` = ?";
                    $updateValues[] = ProperCaseHelper::forBiodataField($field, $sVal);
                }
            }
        } elseif ($strategy === 'prefer_sekunder') {
            $valuesFromSekunder = [];
            foreach (self::BIODATA_MERGE_FIELDS as $field) {
                $sVal = $dataSekunder[$field] ?? null;
                if (!self::isEmptyForMerge($sVal)) {
                    if ($field === 'nik' && trim((string) $sVal) === '') {
                        continue;
                    }
                    $valuesFromSekunder[$field] = $sVal;
                }
            }
            if (!empty($valuesFromSekunder['nik'])) {
                self::resolveNikBeforeCopyUtama(
                    $db,
                    $idSantriUtama,
                    $idSantriSekunder,
                    (string) $valuesFromSekunder['nik'],
                    $nikResolution
                );
            }
            $utamaNikBase = trim((string) ($dataUtama['nik'] ?? ''));
            foreach ($valuesFromSekunder as $field => $val) {
                if ($field === 'nik') {
                    $v = trim((string) $val);
                    if ($utamaNikBase !== '' && strcasecmp($utamaNikBase, $v) === 0) {
                        continue;
                    }
                }
                $updateFields[] = "`{$field}` = ?";
                $updateValues[] = ProperCaseHelper::forBiodataField($field, $val);
            }
        }

        if (count($updateFields) > 0) {
            $updateValues[] = $idSantriUtama;
            $sqlUpdateSantri = 'UPDATE santri SET ' . implode(', ', $updateFields) . ' WHERE id = ?';
            $db->prepare($sqlUpdateSantri)->execute($updateValues);
        }
    }

    private static function resolveNikBeforeCopyUtama(
        PDO $db,
        int $idSantriUtama,
        int $idSantriSekunder,
        string $sekunderNikValue,
        string $nikResolution
    ): void {
        $utamaNik = '';
        $st = $db->prepare('SELECT nik FROM santri WHERE id = ?');
        $st->execute([$idSantriUtama]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row !== false) {
            $utamaNik = trim((string) ($row['nik'] ?? ''));
        }
        $sek = trim((string) $sekunderNikValue);
        if ($sek === '') {
            return;
        }
        if ($utamaNik !== '' && strcasecmp($utamaNik, $sek) === 0) {
            return;
        }

        $mode = $nikResolution;
        if ($mode === 'auto') {
            $mode = 'nullify_sekunder';
        }

        if ($mode === 'random_placeholder_sekunder') {
            self::assignUniquePlaceholderNik($db, $idSantriSekunder);
            return;
        }

        // nullify_sekunder: kosongkan NIK di baris sekunder agar tidak bentrok UNIQUE saat utama menerima NIK yang sama
        $db->prepare('UPDATE santri SET nik = NULL WHERE id = ?')->execute([$idSantriSekunder]);
    }

    private static function assignUniquePlaceholderNik(PDO $db, int $idSantriSekunder): void
    {
        for ($i = 0; $i < 12; $i++) {
            $candidate = 'M' . strtoupper(bin2hex(random_bytes(5)));
            $chk = $db->prepare('SELECT id FROM santri WHERE nik = ? LIMIT 1');
            $chk->execute([$candidate]);
            if ($chk->fetch() === false) {
                $db->prepare('UPDATE santri SET nik = ? WHERE id = ?')->execute([$candidate, $idSantriSekunder]);
                return;
            }
        }
        $db->prepare('UPDATE santri SET nik = NULL WHERE id = ?')->execute([$idSantriSekunder]);
    }

    public static function deleteSantriSekunder(PDO $db, int $idSantriSekunder): void
    {
        $db->prepare('DELETE FROM santri WHERE id = ?')->execute([$idSantriSekunder]);
    }

    public static function touchSantriUtama(PDO $db, int $idSantriUtama): void
    {
        $db->prepare('UPDATE santri SET tanggal_update = CURRENT_TIMESTAMP WHERE id = ?')->execute([$idSantriUtama]);
    }
}
