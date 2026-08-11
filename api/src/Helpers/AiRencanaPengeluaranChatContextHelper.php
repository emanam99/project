<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;

/**
 * Konteks Chat AI untuk membantu menyusun / membuat rencana pengeluaran:
 * cakupan lembaga pengguna, daftar kategori valid API, dan petunjuk mengisi field.
 */
final class AiRencanaPengeluaranChatContextHelper
{
    /** @var list<string> */
    public const KATEGORI_VALID = [
        'Bisyaroh', 'Acara', 'Pengadaan', 'Perbaikan', 'ATK', 'lainnya',
        'Listrik', 'Wifi', 'Langganan', 'Rapat', 'Setoran',
    ];

    private const MAX_BLOCK_CHARS = 5500;

    /**
     * @param array<string, mixed> $userPayload
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string}|null $snapshot
     */
    public static function tryBuildRencanaPengeluaranAiContext(
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?array $snapshot = null
    ): ?string {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsBuatRencanaPengeluaran($trimmed)) {
            return null;
        }
        if ($userPayload === []) {
            return null;
        }
        if ($snapshot === null) {
            $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        }
        $codes = $snapshot['codes'] ?? [];
        if (!self::userHasPengeluaranMenuPath($db, $userPayload, $codes)) {
            return null;
        }
        if (!self::userCanSimpanRencana($db, $userPayload)) {
            return null;
        }

        try {
            return self::trimBlock(self::buildBlock($db, $userPayload));
        } catch (\Throwable $e) {
            error_log('AiRencanaPengeluaranChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsBuatRencanaPengeluaran(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');
        if ($t === '') {
            return false;
        }
        $buat = (bool) preg_match(
            '/\b(buat(?:kan)?|tambah(?:kan)?|input|isi|draft|bantu|tolong|suruh|bikin|usulkan|generate)\b/i',
            $t
        );
        if (!$buat) {
            return false;
        }
        if (preg_match('/rencana\s+pengeluaran|pengeluaran\s+rencana/i', $t)) {
            return true;
        }
        if (preg_match('/\bbuat\s+rencana\b/i', $t) && preg_match('/pengeluaran|biaya|belanja|anggaran|keuangan/i', $t)) {
            return true;
        }

        return false;
    }

    /**
     * @param list<string> $codes
     */
    private static function userHasPengeluaranMenuPath(\PDO $db, array $user, array $codes): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        if (RoleHelper::tokenHasPermissionFromRolePolicy($user, 'manage_finance')) {
            return true;
        }
        $legacyFinance = LegacyRouteRoles::forKey(LegacyRouteRoleKeys::FINANCE_MENUS);
        if ($legacyFinance !== [] && RoleHelper::tokenHasAnyRoleKey($user, $legacyFinance)) {
            return true;
        }
        if ($codes !== []) {
            foreach ($codes as $c) {
                $c = (string) $c;
                if (in_array($c, ['menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'], true)) {
                    return true;
                }
                if (str_starts_with($c, 'action.pengeluaran.')) {
                    return true;
                }
            }

            return false;
        }
        foreach (['menu.pengeluaran', 'menu.dashboard_keuangan', 'menu.aktivitas', 'menu.aktivitas_tahun_ajaran'] as $menuCode) {
            if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, $menuCode)) {
                return true;
            }
        }

        return false;
    }

    private static function userCanSimpanRencana(\PDO $db, array $user): bool
    {
        return RoleHelper::tokenPengeluaranActionAllowed($db, $user, 'action.pengeluaran.rencana.simpan')
            || RoleHelper::tokenPengeluaranActionAllowed($db, $user, 'action.pengeluaran.rencana.simpan_draft');
    }

    /**
     * @return list<array{id: string, nama: string}>
     */
    private static function fetchLembagaRows(\PDO $db, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $ids = array_values(array_unique(array_filter($ids, static fn ($x) => $x !== '')));
        if ($ids === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        try {
            $st = $db->prepare("SELECT id, nama, kategori FROM lembaga WHERE id IN ({$ph}) ORDER BY nama ASC");
            $st->execute($ids);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $r) {
            $id = isset($r['id']) ? trim((string) $r['id']) : '';
            if ($id === '') {
                continue;
            }
            $out[] = ['id' => $id, 'nama' => trim((string) ($r['nama'] ?? $id))];
        }

        return $out;
    }

    private static function buildBlock(\PDO $db, array $userPayload): string
    {
        $lines = [];
        $lines[] = '=== RENCANA PENGELUARAN — PANDUAN AI (server; selaras API POST /api/pengeluaran/rencana) ===';
        $lines[] = 'Gunakan blok ini untuk membantu pengguna menyusun rencana baru (dialog), atau menyusun payload untuk agen «create_rencana_pengeluaran» setelah semua field wajar terisi.';

        $semua = RoleHelper::tokenPengeluaranLembagaSemua($db, $userPayload, 'rencana');
        $scoped = RoleHelper::tokenPengeluaranApplyLembagaScope($db, $userPayload, 'rencana');
        $idsTok = RoleHelper::tokenPengeluaranLembagaIdsFromUser($userPayload);

        $lines[] = '';
        $lines[] = 'LEMBAGA:';
        if ($semua) {
            $lines[] = '- Pengguna punya akses «semua lembaga» untuk rencana — WAJIB minta pengguna menyebut ID atau nama lembaga secara eksplisit sebelum mengunci usulan tulis.';
            $lines[] = '- Jika ragukan ejaan, minta konfirmasi ID lembaga dari daftar di aplikasi (Pengaturan → Lembaga).';
        } elseif ($scoped && $idsTok !== []) {
            $rows = self::fetchLembagaRows($db, $idsTok);
            if (count($idsTok) === 1) {
                $only = $rows[0] ?? ['id' => $idsTok[0], 'nama' => $idsTok[0]];
                $lines[] = '- Pengguna hanya punya satu lembaga untuk rencana — gunakan otomatis lembaga `' . $only['id'] . '` (' . $only['nama'] . '). Jangan meminta memilih lembaga kecuali pengguna menyebut salah.';
            } else {
                $lines[] = '- Pengguna terbatas ke beberapa lembaga berikut (pilih salah satu sesuai permintaan pengguna; jika tidak disebut, tanyakan):';
                foreach ($rows as $r) {
                    $lines[] = '  · `' . $r['id'] . '` — ' . $r['nama'];
                }
                foreach ($idsTok as $id) {
                    $found = false;
                    foreach ($rows as $r) {
                        if ($r['id'] === $id) {
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $lines[] = '  · `' . $id . '` — (nama tidak terbaca dari basis)';
                    }
                }
            }
        } else {
            $lines[] = '- Cakupan lembaga: tidak dibatasi token khusus (super/admin luas) — tetap minta lembaga eksplisit bila tidak ada petunjuk.';
        }

        $mayDraft = RoleHelper::tokenPengeluaranActionAllowed($db, $userPayload, 'action.pengeluaran.rencana.simpan_draft');
        $mayPending = RoleHelper::tokenPengeluaranActionAllowed($db, $userPayload, 'action.pengeluaran.rencana.simpan');

        $lines[] = '';
        $lines[] = 'IZIN STATUS RENCANA (role pengguna ini):';
        if ($mayDraft && $mayPending) {
            $lines[] = '- Diizinkan menyimpan sebagai draft dan mengajukan pending (kirim).';
        } elseif ($mayDraft && !$mayPending) {
            $lines[] = '- HANYA diizinkan «draft» — tidak boleh mengajukan pending; jangan usulkan status pending, tool, atau langkah kirim persetujuan.';
        } elseif (!$mayDraft && $mayPending) {
            $lines[] = '- Diizinkan mengajukan «pending»; tanpa izin simpan_draft, hindari menyarankan menyimpan sebagai draft saja kecuali aplikasi tetap mengizinkan.';
        } else {
            $lines[] = '- Tidak terdeteksi izin simpan rencana — arahkan ke admin (anomali).';
        }

        $lines[] = '';
        if (RoleHelper::tokenMayToggleDraftNotifOnSave($db, $userPayload)) {
            $lines[] = 'NOTIFIKASI DRAFT (WA/Push):';
            $lines[] = '- Pengguna ini boleh set kirim_notifikasi_draft pada POST /api/pengeluaran/rencana (body JSON) atau argumen tool agen: true (default, kirim notifikasi) atau false (lewati notifikasi untuk simpan/update draft ini).';
            $lines[] = '- Hanya bermakna saat hasil akhir berstatus draft.';
        } else {
            $lines[] = 'NOTIFIKASI DRAFT: pengguna tidak punya akses mematikan notifikasi — kirim_notifikasi_draft diabaikan (perilaku bawaan server).';
        }

        $lines[] = '';
        $masehiHariIni = date('Y-m-d');
        $waktuServer = date('H:i:s');
        $taAktif = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($db, $masehiHariIni);
        $lines[] = 'TAHUN AJARAN HIJRIYAH AKTIF (server — rentang masehi di master tahun_ajaran vs tanggal hari ini):';
        if ($taAktif !== null) {
            $lines[] = '- tahun_ajaran: `' . $taAktif['tahun_ajaran'] . '` (masehi ' . $taAktif['dari'] . ' s.d. ' . $taAktif['sampai'] . ').';
            $lines[] = '- Untuk bantuan/agen: WAJIB pakai nilai ini pada field tahun_ajaran; jangan mengusulkan TA lain kecuali pengguna minta pengecualian eksplisit — arahkan isi manual di formulir.';
        } else {
            $fallbackTa = SantriRombelHelper::getDefaultTahunAjaran($db, 'hijriyah');
            if ($fallbackTa !== null && $fallbackTa !== '') {
                $lines[] = '- Tidak ada baris hijriyah yang rentangnya mencakup hari ini; fallback master terbaru: `' . $fallbackTa . '` (verifikasi di Pengaturan → Tahun Ajaran).';
            } else {
                $lines[] = '- Tidak terdeteksi TA hijriyah aktif untuk tanggal hari ini — arahkan cek master Tahun Ajaran (hijriyah + kolom dari/sampai masehi).';
            }
        }
        $hijriHariIni = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($db, $masehiHariIni, $waktuServer);
        if ($hijriHariIni !== null && $hijriHariIni !== '' && $hijriHariIni !== '0000-00-00') {
            $lines[] = '- hijriyah (tanggal kejadian, selaras kalender PSA): `' . $hijriHariIni . '` — untuk eksekusi tool server mengunci ke nilai ini (bukan dari tebakan model).';
        } else {
            $lines[] = '- hijriyah: server isi dari kalender PSA bila tersedia; jika kosong, field boleh null di basis.';
        }

        $lines[] = '';
        $lines[] = 'SUMBER UANG (aliran bantuan AI / agen):';
        $lines[] = '- Selalu «Cash» — jangan TF; tidak perlu menanyakan sumber uang ke pengguna untuk alur ini.';

        $lines[] = '';
        $lines[] = 'FIELD WAJIB / OPSIONAL (API):';
        $lines[] = '- keterangan (string, wajib): ringkas judul rencana.';
        $lines[] = '- details (array wajib): tiap elemen { item (nama), harga (nominal satuan), jumlah (integer ≥1) }; nominal baris = harga × jumlah. Nama item unik dalam satu rencana.';
        $lines[] = '- lembaga (string id): wajib jika pengguna ter-scope ke lembaga — isi sesuai aturan di atas.';
        $lines[] = '- kategori (opsional): salah satu persis: ' . implode(', ', self::KATEGORI_VALID) . '. Jika pengguna belum sebut, tanyakan atau sarankan yang paling cocok.';
        $lines[] = '- sumber_uang: untuk dialog, anggap «Cash»; pada eksekusi tool create_rencana_pengeluaran server memaksa Cash.';
        $lines[] = '- hijriyah, tahun_ajaran: diisi server saat eksekusi tool dari TA hijriyah aktif + tanggal hijri hari ini (lihat blok di atas); jangan meminta pengguna mengetik TA/hijriyah kecuali pengecualian manual di formulir.';
        $lines[] = '- status pengajuan: «draft» atau «pending» — wajib selaras «IZIN STATUS» di atas; jika hanya draft yang diizinkan, semua usulan harus draft.';
        $lines[] = '- kirim_notifikasi_draft (opsional boolean): hanya jika «NOTIFIKASI DRAFT» mengizinkan pengaturan — default true.';

        $lines[] = '';
        $lines[] = 'PERILAKU ASISTEN (mode chat biasa):';
        $lines[] = '(1) Susun daftar item dan nominal dari perintah pengguna; jika ada yang kurang (kategori, lembaga saat akses semua), tanyakan satu per satu — jangan tanyakan sumber uang atau TA hijriyah untuk alur AI.';
        $lines[] = '(2) Jangan mengarang nominal besar tanpa dasar dari pengguna; boleh menyarankan pemecahan item.';
        $lines[] = '(3) Untuk menulis ke basis data: arahkan ke tab Pengeluaran → Rencana di eBeddien, atau pakai Chat AI Agen (mode propose_actions) dengan tool create_rencana_pengeluaran setelah pengguna setuju dan punya izin konfirmasi tulis.';
        $lines[] = '(4) Akhiri dengan kategori [Keuangan] atau [Umum] sesuai aturan sistem.';

        return implode("\n", $lines);
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 24, 'UTF-8') . "\n…(dipotong)";
    }
}
