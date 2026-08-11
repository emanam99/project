<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Menggabungkan snapshot hak akses + konteks keuangan + konteks santri untuk Chat AI.
 */
final class AiChatPromptContextHelper
{
    /**
     * Tambahkan pada system prompt (mode API chat utama).
     */
    public static function augmentSystemPrompt(
        string $basePrompt,
        \PDO $db,
        array $userPayload,
        string $lastUserMessage,
        ?int $chatUsersId = null,
        ?string $chatSessionId = null,
        ?string $chatChannel = null
    ): string {
        $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        $prompt = $basePrompt;

        $resolvedUsersId = $chatUsersId ?? AiAgentUserHelper::resolveUsersId($userPayload, $db);
        if ($resolvedUsersId !== null && $resolvedUsersId > 0) {
            $prof = AiChatUserProfileHelper::tryBuildProfileContext($db, $resolvedUsersId, $chatChannel);
            if ($prof !== null && $prof !== '') {
                $prompt .= "\n\n--- KONTEKS PROFIL PENGGUNA (server; baca saja) ---\n" . $prof;
            }
        }

        $cap = AiChatUserCapabilityHelper::formatSnapshotForPrompt($snapshot, $userPayload);
        if ($cap !== '') {
            $prompt .= "\n\n--- HAK AKSES FITUR (server; selaras /api/v2/me/fitur-menu) ---\n" . $cap;
        }

        $fin = AiKeuanganChatContextHelper::tryBuildFinanceContext($db, $userPayload, $lastUserMessage, $snapshot);
        if ($fin !== null) {
            $prompt .= "\n\n--- KONTEKS DATA KEUANGAN (disisipkan server dari basis data; rahasia institusi) ---\n"
                . $fin
                . "\nGunakan angka di atas bila relevan. Jangan mengarang nominal di luar blok ini. "
                . 'Jika ada bagian RENCANA PENGELUARAN BELUM DI-APPROVE, itu daftar rencana (pending/draft/perbaikan), bukan realisasi; gunakan untuk menjawab pertanyaan tentang yang belum disetujui. '
                . 'Jika pengguna meminta detail yang tidak ada di ringkasan, arahkan ke halaman Aktivitas / Dashboard Keuangan atau minta mereka menyalin data lebih rinci.';
        }

        $renc = AiRencanaPengeluaranChatContextHelper::tryBuildRencanaPengeluaranAiContext($db, $userPayload, $lastUserMessage, $snapshot);
        if ($renc !== null) {
            $prompt .= "\n\n--- BANTU BUAT RENCANA PENGELUARAN (server; kebijakan lembaga & field API) ---\n"
                . $renc
                . "\nPatuhi cakupan lembaga di blok ini. Lengkapi field yang belum dijelaskan pengguna sebelum menyarankan submit atau tool agen.";
        }

        $san = AiSantriChatContextHelper::tryBuildSantriContext(
            $db,
            $userPayload,
            $lastUserMessage,
            $snapshot,
            $chatUsersId,
            $chatSessionId
        );
        if ($san !== null) {
            $prompt .= "\n\n--- KONTEKS DATA SANTRI (disisipkan server; baca saja; rahasia institusi) ---\n"
                . $san
                . "\nGunakan data di atas bila relevan. "
                . 'Jika ada catatan pemetaan ordinal (pilihan ke-1/2/3 dari daftar NIS di jawaban Anda sebelumnya), jawab sesuai santri itu tanpa meminta klarifikasi berulang. '
                . 'Jangan mengarang identitas, alamat orang tua/wali, atau nominal pembayaran di luar blok ini. '
                . 'Perubahan data arahkan ke halaman modul resmi (Santri, Domisili, UWABA, Perizinan, dll.) atau agen dengan konfirmasi bila tersedia.';
        }

        $sq = AiSantriQualityChatContextHelper::tryBuildSantriQualityContext($db, $userPayload, $lastUserMessage, $snapshot);
        if ($sq !== null) {
            $prompt .= "\n\n--- ANALISIS KUALITAS DATA SANTRI (disisipkan server; heuristik; baca saja) ---\n"
                . $sq
                . "\nAnda harus memakai temuan di atas untuk menjawab (prioritas, risiko, saran perbaikan). "
                . 'Jangan mengarang id/NIS di luar daftar pada blok ini. Sebut modul eBeddien yang relevan tanpa nama tabel basis data.';
        }

        $pend = AiPendaftarAnalisisChatContextHelper::tryBuildPendaftarAnalisisContext($db, $userPayload, $lastUserMessage, $snapshot);
        if ($pend !== null) {
            $prompt .= "\n\n--- ANALISIS DATA PENDAFTAR PSB (disisipkan server; agregat; baca saja) ---\n"
                . $pend
                . "\nPakai blok ini untuk menjawab tentang pembayaran PSB, pola hari pendaftaran, duplikasi/registrasi ganda, dan saran operasional. "
                . 'Jangan mengarang id registrasi/NIS di luar daftar. Nominal hanya dari blok ini.';
        }

        $wirid = AiWiridNailulMurodChatContextHelper::tryBuildWiridNailulMurodContext($db, $userPayload, $lastUserMessage, $snapshot);
        if ($wirid !== null) {
            $prompt .= "\n\n--- WIRID / NAILUL MUROD (disisipkan server; konten amaliyah; baca saja) ---\n"
                . $wirid
                . "\nGunakan cuplikan di atas untuk menjawab pertanyaan wirid/doa, arti, atau penjelasan yang selaras data Nailul Murod. "
                . 'Wajib sertakan tulisan Arab bacaan dari cuplikan (kolom Isi) sebagaimana di Nailul Murod, tidak hanya terjemahan. '
                . 'Jangan mengarang teks wirid panjang di luar cuplikan.';
        }

        $prompt = self::appendPublicKnowledgeBlocks($prompt, $db, $lastUserMessage);

        if ($chatChannel === 'wa') {
            $prompt .= "\n\n" . AiWhatsappThreadContextHelper::waThreadContextSystemBlock();
            $prompt .= "\n\n" . AiWhatsappReplyFormatHelper::systemPromptBlock();
        }

        return $prompt;
    }

    /**
     * Konteks yang boleh dipakai siapa saja (tanpa login): biaya/item PSB, dll.
     */
    public static function appendPublicKnowledgeBlocks(
        string $prompt,
        \PDO $db,
        string $lastUserMessage
    ): string {
        $psbBiaya = AiPsbBiayaPendaftaranChatContextHelper::tryBuildPsbBiayaPendaftaranContext($db, $lastUserMessage);
        if ($psbBiaya !== null) {
            $prompt .= "\n\n--- BIAYA & ITEM PENDAFTARAN PSB (disisipkan server; publik; baca saja) ---\n"
                . $psbBiaya
                . "\nGunakan blok di atas untuk menjawab biaya, item, dan total wajib pendaftaran. "
                . 'Nominal dan nama item hanya dari blok ini (selaras items-by-kondisi). Jangan mengarang harga. '
                . 'Bila kondisi pendaftar belum jelas, tanyakan field yang relevan lalu pilih set yang cocok. '
                . 'Detail per santri (riwayat bayar, dll.) → arahkan https://mybeddien.alutsmani.id';
        }

        $uwabaBiaya = AiUwabaBiayaChatContextHelper::tryBuildUwabaBiayaContext($lastUserMessage);
        if ($uwabaBiaya !== null) {
            $prompt .= "\n\n--- TARIF UWABA / SYAHRIAH BULANAN (disisipkan server; publik; baca saja) ---\n"
                . $uwabaBiaya
                . "\nGunakan blok di atas untuk biaya UWABA per bulan (bukan PSB). "
                . 'Nominal hanya dari katalog uwaba-prices.json; jelaskan rincian dasar + tambahan − diskon saudara. '
                . 'Tanyakan status santri, kategori, diniyah, formal, LTTQ bila belum jelas. '
                . 'Detail per santri (riwayat UWABA/PSB, tunggakan) → arahkan https://mybeddien.alutsmani.id';
        }

        $mybeddian = AiMybeddianChatContextHelper::tryBuildMybeddianContext($lastUserMessage);
        if ($mybeddian !== null) {
            $prompt .= "\n\n--- PANDUAN MYBEDDien / APLIKASI SANTRI (disisipkan server; publik; baca saja) ---\n"
                . $mybeddian
                . "\nGunakan blok di atas untuk install, login, lupa NIS, cek tagihan (lewat login), dan fitur MyBeddian. "
                . 'Jangan mengarang langkah atau URL di luar blok ini.';
        }

        return $prompt;
    }

    /**
     * Sisipkan di giliran pengguna (agen / proxy): hak akses + ringkasan server + pertanyaan asli.
     */
    public static function mergeIntoUserTurn(
        \PDO $db,
        array $userPayload,
        string $userText,
        ?int $chatUsersId = null,
        ?string $chatSessionId = null
    ): string {
        $snapshot = AiChatUserCapabilityHelper::fetchEbeddienSnapshot($db, $userPayload);
        $chunks = [];
        $cap = AiChatUserCapabilityHelper::formatSnapshotForPrompt($snapshot, $userPayload);
        if ($cap !== '') {
            $chunks[] = $cap;
        }
        $resolvedUsersId = $chatUsersId ?? AiAgentUserHelper::resolveUsersId($userPayload, $db);
        if ($resolvedUsersId !== null && $resolvedUsersId > 0) {
            $prof = AiChatUserProfileHelper::tryBuildProfileContext($db, $resolvedUsersId, null);
            if ($prof !== null && $prof !== '') {
                $chunks[] = $prof;
            }
        }
        $fin = AiKeuanganChatContextHelper::tryBuildFinanceContext($db, $userPayload, $userText, $snapshot);
        if ($fin !== null) {
            $chunks[] = $fin;
        }
        $renc = AiRencanaPengeluaranChatContextHelper::tryBuildRencanaPengeluaranAiContext($db, $userPayload, $userText, $snapshot);
        if ($renc !== null) {
            $chunks[] = $renc;
        }
        $san = AiSantriChatContextHelper::tryBuildSantriContext(
            $db,
            $userPayload,
            $userText,
            $snapshot,
            $chatUsersId,
            $chatSessionId
        );
        if ($san !== null) {
            $chunks[] = $san;
        }
        $sq = AiSantriQualityChatContextHelper::tryBuildSantriQualityContext($db, $userPayload, $userText, $snapshot);
        if ($sq !== null) {
            $chunks[] = $sq;
        }
        $pend = AiPendaftarAnalisisChatContextHelper::tryBuildPendaftarAnalisisContext($db, $userPayload, $userText, $snapshot);
        if ($pend !== null) {
            $chunks[] = $pend;
        }
        $wirid = AiWiridNailulMurodChatContextHelper::tryBuildWiridNailulMurodContext($db, $userPayload, $userText, $snapshot);
        if ($wirid !== null) {
            $chunks[] = $wirid;
        }
        $psbBiaya = AiPsbBiayaPendaftaranChatContextHelper::tryBuildPsbBiayaPendaftaranContext($db, $userText);
        if ($psbBiaya !== null) {
            $chunks[] = $psbBiaya;
        }
        $uwabaBiaya = AiUwabaBiayaChatContextHelper::tryBuildUwabaBiayaContext($userText);
        if ($uwabaBiaya !== null) {
            $chunks[] = $uwabaBiaya;
        }
        $mybeddian = AiMybeddianChatContextHelper::tryBuildMybeddianContext($userText);
        if ($mybeddian !== null) {
            $chunks[] = $mybeddian;
        }
        if ($chunks === []) {
            return $userText;
        }

        return implode("\n\n---\n\n", $chunks) . "\n\n---\n\nPertanyaan pengguna:\n" . $userText;
    }
}
