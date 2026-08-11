<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Profil akun pengguna eBeddien (nama, username, peran) agar AI mengenali lawan bicara.
 */
final class AiChatUserProfileHelper
{
    /**
     * Blok teks untuk system prompt / giliran pengguna, atau null jika akun tidak ditemukan.
     *
     * @param 'web'|'wa'|null $channel saluran obrolan (opsional)
     */
    public static function tryBuildProfileContext(\PDO $db, int $usersId, ?string $channel = null): ?string
    {
        if ($usersId < 1) {
            return null;
        }
        $profile = self::fetchProfile($db, $usersId);
        if ($profile === null) {
            return null;
        }

        return self::formatForPrompt($profile, $channel);
    }

    /**
     * @return array{
     *   display_name: string,
     *   nama_inti: string,
     *   username: string,
     *   role_kind: string,
     *   gender_label: string,
     *   gender_norm: ?string,
     *   panggilan: ?string,
     *   role_labels: list<string>,
     *   jabatan: string
     * }|null
     */
    private static function fetchProfile(\PDO $db, int $usersId): ?array
    {
        try {
            $stmt = $db->prepare(
                'SELECT u.username, '
                . 'p.id AS pengurus_id, p.nama AS pengurus_nama, p.gender AS pengurus_gender, '
                . 'p.gelar_awal, p.gelar_akhir, p.jabatan AS pengurus_jabatan, '
                . 's.id AS santri_id, s.nama AS santri_nama, s.gender AS santri_gender, s.nis '
                . 'FROM users u '
                . 'LEFT JOIN pengurus p ON p.id_user = u.id '
                . 'LEFT JOIN santri s ON s.id_user = u.id '
                . 'WHERE u.id = ? LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return null;
            }

            $username = trim((string) ($row['username'] ?? ''));
            $pengurusId = (int) ($row['pengurus_id'] ?? 0);
            $santriId = (int) ($row['santri_id'] ?? 0);

            if ($pengurusId > 0) {
                $nama = trim((string) ($row['pengurus_nama'] ?? ''));
                $ga = trim((string) ($row['gelar_awal'] ?? ''));
                $gk = trim((string) ($row['gelar_akhir'] ?? ''));
                $display = self::composeDisplayName($nama, $ga, $gk, $username);
                $genderRaw = (string) ($row['pengurus_gender'] ?? '');
                $genderNorm = self::normalizeGender($genderRaw);
                $genderLabel = $genderNorm !== null
                    ? self::genderNormToLabel($genderNorm)
                    : (trim($genderRaw) !== '' ? trim($genderRaw) : 'tidak tercatat');

                return [
                    'display_name' => $display,
                    'nama_inti' => $nama !== '' ? $nama : $display,
                    'username' => $username,
                    'role_kind' => 'pengurus/staf eBeddien',
                    'gender_label' => $genderLabel,
                    'gender_norm' => $genderNorm,
                    'panggilan' => self::resolvePanggilanPengurus($genderNorm),
                    'role_labels' => self::fetchPengurusRoleLabels($pengurusId),
                    'jabatan' => trim((string) ($row['pengurus_jabatan'] ?? '')),
                ];
            }

            if ($santriId > 0) {
                $nama = trim((string) ($row['santri_nama'] ?? ''));
                $display = $nama !== '' ? $nama : ($username !== '' ? $username : 'Santri');
                $nis = trim((string) ($row['nis'] ?? ''));
                if ($nis !== '' && $display !== 'Santri') {
                    $display .= ' (NIS ' . $nis . ')';
                }
                $genderRaw = (string) ($row['santri_gender'] ?? '');
                $genderNorm = self::normalizeGender($genderRaw);
                $genderLabel = $genderNorm !== null
                    ? self::genderNormToLabel($genderNorm)
                    : (trim($genderRaw) !== '' ? trim($genderRaw) : 'tidak tercatat');

                return [
                    'display_name' => $display,
                    'nama_inti' => $nama !== '' ? $nama : $display,
                    'username' => $username,
                    'role_kind' => 'santri (akun terhubung; obrolan biasanya lewat MyBeddian)',
                    'gender_label' => $genderLabel,
                    'gender_norm' => $genderNorm,
                    'panggilan' => self::resolvePanggilanSantri($genderNorm),
                    'role_labels' => [],
                    'jabatan' => '',
                ];
            }

            return [
                'display_name' => $username !== '' ? $username : 'Pengguna',
                'nama_inti' => $username !== '' ? $username : 'Pengguna',
                'username' => $username,
                'role_kind' => 'akun eBeddien',
                'gender_label' => 'tidak tercatat',
                'gender_norm' => null,
                'panggilan' => null,
                'role_labels' => [],
                'jabatan' => '',
            ];
        } catch (\Throwable $e) {
            error_log('AiChatUserProfileHelper::fetchProfile ' . $e->getMessage());

            return null;
        }
    }

    /**
     * @return list<string>
     */
    private static function fetchPengurusRoleLabels(int $pengurusId): array
    {
        if ($pengurusId < 1) {
            return [];
        }
        try {
            $labels = [];
            foreach (RoleHelper::getUserRoles($pengurusId) as $r) {
                $label = trim((string) ($r['role_label'] ?? ''));
                $key = trim((string) ($r['role_key'] ?? ''));
                if ($label !== '') {
                    $labels[] = $key !== '' ? $label . ' (' . $key . ')' : $label;
                } elseif ($key !== '') {
                    $labels[] = $key;
                }
            }

            return array_values(array_unique($labels));
        } catch (\Throwable $e) {
            return [];
        }
    }

    private static function composeDisplayName(string $nama, string $gelarAwal, string $gelarAkhir, string $username): string
    {
        $parts = array_filter([$gelarAwal, $nama, $gelarAkhir], static fn ($x) => trim((string) $x) !== '');
        $display = trim(implode(' ', $parts));
        if ($display !== '') {
            return $display;
        }

        return $username !== '' ? $username : 'Pengurus';
    }

    /**
     * @return 'laki-laki'|'perempuan'|null
     */
    private static function normalizeGender(?string $raw): ?string
    {
        $g = strtolower(trim((string) $raw));
        if ($g === '') {
            return null;
        }
        $first = $g[0] ?? '';
        if ($first === 'p' || str_contains($g, 'perempuan') || $g === 'wanita' || $g === 'female') {
            return 'perempuan';
        }
        if ($first === 'l' || str_contains($g, 'laki') || $g === 'pria' || $g === 'male') {
            return 'laki-laki';
        }

        return null;
    }

    private static function genderNormToLabel(string $norm): string
    {
        return $norm === 'perempuan' ? 'Perempuan' : 'Laki-laki';
    }

    private static function resolvePanggilanPengurus(?string $genderNorm): ?string
    {
        if ($genderNorm === 'laki-laki') {
            return 'Ustadz';
        }
        if ($genderNorm === 'perempuan') {
            return 'Ustadzah';
        }

        return null;
    }

    private static function resolvePanggilanSantri(?string $genderNorm): ?string
    {
        if ($genderNorm === 'laki-laki') {
            return 'Akhi';
        }
        if ($genderNorm === 'perempuan') {
            return 'Ukhti';
        }

        return null;
    }

    /**
     * @param array{
     *   display_name: string,
     *   nama_inti: string,
     *   username: string,
     *   role_kind: string,
     *   gender_label: string,
     *   gender_norm: ?string,
     *   panggilan: ?string,
     *   role_labels: list<string>,
     *   jabatan: string
     * } $profile
     * @param 'web'|'wa'|null $channel
     */
    private static function formatForPrompt(array $profile, ?string $channel): string
    {
        $lines = [];
        $lines[] = 'Pengguna yang SEDANG mengobrol dengan Anda (identitas dari server eBeddien — bukan tebakan model):';
        $lines[] = 'Nama lengkap / tampilan: ' . $profile['display_name'];
        if ($profile['nama_inti'] !== '' && $profile['nama_inti'] !== $profile['display_name']) {
            $lines[] = 'Nama inti (tanpa gelar): ' . $profile['nama_inti'];
        }
        if ($profile['username'] !== '') {
            $lines[] = 'Username login eBeddien: ' . $profile['username'];
        }
        $lines[] = 'Jenis akun: ' . $profile['role_kind'];
        if ($profile['jabatan'] !== '') {
            $lines[] = 'Jabatan (master pengurus): ' . $profile['jabatan'];
        }
        if ($profile['role_labels'] !== []) {
            $lines[] = 'Role penugasan di institusi: ' . implode(', ', $profile['role_labels']);
        }
        $lines[] = 'Jenis kelamin (basis data): ' . $profile['gender_label'];

        if ($channel === 'wa') {
            $lines[] = 'Saluran obrolan: WhatsApp (nomor WA pengguna sudah terverifikasi dan terhubung ke akun di atas).';
        } elseif ($channel === 'web') {
            $lines[] = 'Saluran obrolan: aplikasi web eBeddien (sesi login aktif).';
        }

        $lines[] = '';
        $lines[] = 'Instruksi identitas & sapaan:';
        $lines[] = '• Kenali lawan bicara sebagai orang di atas; boleh memakai nama (' . $profile['nama_inti'] . ') atau username bila relevan.';
        $lines[] = '• Jangan bertanya "Siapa Anda?" / minta identitas ulang kecuali urusan keamanan khusus.';
        $lines[] = '• Jangan mengarang nama, username, atau peran lain di luar blok ini.';

        $panggilan = $profile['panggilan'];
        $isPengurus = str_contains($profile['role_kind'], 'pengurus');
        if ($panggilan !== null && $panggilan !== '') {
            $lines[] = '• Panggilan hormat (pengurus): ' . $panggilan
                . ' — jangan "ustadz/ustadzah" atau dua gelar sekaligus; boleh "Halo, ' . $panggilan . ' ' . $profile['nama_inti'] . '."';
        } elseif ($isPengurus) {
            $lines[] = '• Jenis kelamin belum tercatat: sapa dengan nama (' . $profile['nama_inti'] . ') atau Bapak/Ibu; jangan "ustadz/ustadzah".';
        } else {
            $lines[] = '• Akun santri: jangan Ustadz/Ustadzah; sapa dengan nama'
                . ($panggilan !== null ? ' atau ' . $panggilan : '') . '.';
        }

        return implode("\n", $lines);
    }
}
