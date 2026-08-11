<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konteks halaman eBeddien dari klien (mis. panel Chat AI header) — disisipkan aman ke prompt.
 */
final class AiClientNavigationContextHelper
{
    private const ALLOWED_SOURCES = ['header_offcanvas', 'page', 'client'];

    /**
     * @param mixed $raw Dari body JSON navigation_context
     *
     * @return array<string, mixed>|null
     */
    public static function normalize($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }

        $path = isset($raw['pathname']) ? trim((string) $raw['pathname']) : '';
        if ($path === '' || mb_strlen($path) > 512) {
            return null;
        }
        $path = str_replace("\0", '', $path);
        if ($path[0] !== '/') {
            $path = '/' . $path;
        }
        if (!preg_match('#^/[\w\./\-]*$#', $path)) {
            return null;
        }

        $search = isset($raw['search']) ? trim((string) $raw['search']) : '';
        if (strlen($search) > 512) {
            $search = substr($search, 0, 512);
        }
        if ($search !== '' && $search[0] !== '?') {
            $search = '?' . ltrim($search, '?');
        }

        $menuLabel = isset($raw['menu_label']) ? trim((string) $raw['menu_label']) : '';
        if (mb_strlen($menuLabel) > 200) {
            $menuLabel = mb_substr($menuLabel, 0, 200);
        }

        $headerGroup = isset($raw['header_group']) ? trim((string) $raw['header_group']) : '';
        if (mb_strlen($headerGroup) > 120) {
            $headerGroup = mb_substr($headerGroup, 0, 120);
        }

        $source = isset($raw['source']) ? trim((string) $raw['source']) : '';
        if (!in_array($source, self::ALLOWED_SOURCES, true)) {
            $source = 'client';
        }

        $panelPinned = !empty($raw['panel_pinned']);

        return [
            'pathname' => $path,
            'search' => $search,
            'menu_label' => $menuLabel,
            'header_group' => $headerGroup,
            'source' => $source,
            'panel_pinned' => $panelPinned,
        ];
    }

    /**
     * Prefiks teks untuk digabung ke pesan pengguna (setelah RAG merge bila ada).
     */
    public static function formatPromptPrefix(?array $ctx): string
    {
        if ($ctx === null) {
            return '';
        }

        $lines = [
            '[KONTEKS_NAVIGASI_UI]',
            'Pengguna sedang memakai aplikasi eBeddien. Gunakan blok ini bila pengguna merujuk «halaman ini», «layar ini», «tab ini», atau meminta arahan di modul yang sedang dibuka.',
            '- Path halaman: ' . ($ctx['pathname'] ?? ''),
        ];
        if (($ctx['search'] ?? '') !== '') {
            $lines[] = '- Query URL: ' . ($ctx['search'] ?? '');
        }
        if (($ctx['menu_label'] ?? '') !== '') {
            $lines[] = '- Judul menu (perkiraan dari katalog): ' . ($ctx['menu_label'] ?? '');
        }
        if (($ctx['header_group'] ?? '') !== '') {
            $lines[] = '- Grup menu: ' . ($ctx['header_group'] ?? '');
        }
        $src = (string) ($ctx['source'] ?? '');
        if ($src === 'header_offcanvas') {
            $lines[] = '- Panel obrolan AI dibuka dari ikon header (offcanvas kanan).';
        }
        if (!empty($ctx['panel_pinned'])) {
            $lines[] = '- Panel obrolan dipin di desktop; konten utama tetap tampil di kiri panel.';
        }
        $lines[] = 'Berikan arahan konkret (menu sidebar/header, nama tab, urutan langkah) yang selaras modul eBeddien; jangan mengarang rute atau fitur yang tidak ada.';

        return implode("\n", $lines);
    }
}
