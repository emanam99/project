<?php

namespace App\Helpers;

class SppgManifestHelper
{
    /**
     * @return array<string, mixed>
     */
    public static function build(array $sppg, string $publicOrigin, string $gambarBase, string $appVersion = '1'): array
    {
        $slug = (string) ($sppg['slug'] ?? 'sppg');
        $shortName = trim((string) ($sppg['pwa_short_name'] ?? ''));
        if ($shortName === '') {
            $shortName = trim((string) ($sppg['nama_unit'] ?? 'SPPG'));
        }
        $name = trim((string) ($sppg['nama_unit'] ?? $shortName));
        if ($name === '') {
            $name = 'SPPG';
        }
        if (strlen($shortName) > 12) {
            $shortName = mb_substr($shortName, 0, 12);
        }

        $origin = rtrim($publicOrigin, '/');
        $hasLogo = !empty($sppg['pwa_logo_path']);
        $logoUrl = $hasLogo
            ? $origin . '/api/public/sppg/pwa-logo?slug=' . rawurlencode($slug) . '&v=' . rawurlencode($appVersion)
            : null;

        $defaultIcons = [
            ['size' => '32', 'file' => 'sppg.v3.u32.png'],
            ['size' => '64', 'file' => 'sppg.v3.u64.png'],
            ['size' => '96', 'file' => 'sppg.v3.u96.png'],
            ['size' => '128', 'file' => 'sppg.v3.u128.png'],
            ['size' => '192', 'file' => 'sppg.v3.u192.png'],
            ['size' => '512', 'file' => 'sppg.v3.u512.png'],
        ];

        $icons = [];
        if ($logoUrl) {
            foreach (['192', '512'] as $sz) {
                $icons[] = [
                    'src' => $logoUrl,
                    'sizes' => $sz . 'x' . $sz,
                    'type' => (string) ($sppg['pwa_logo_tipe'] ?? 'image/png'),
                    'purpose' => 'any',
                ];
            }
            $icons[] = [
                'src' => $logoUrl,
                'sizes' => '512x512',
                'type' => (string) ($sppg['pwa_logo_tipe'] ?? 'image/png'),
                'purpose' => 'maskable',
            ];
        } else {
            $v = '?v=' . rawurlencode($appVersion);
            foreach ($defaultIcons as $item) {
                $dim = $item['size'] . 'x' . $item['size'];
                $icons[] = [
                    'src' => rtrim($gambarBase, '/') . '/icon/' . $item['file'] . $v,
                    'sizes' => $dim,
                    'type' => 'image/png',
                    'purpose' => 'any',
                ];
            }
            $icons[] = [
                'src' => rtrim($gambarBase, '/') . '/icon/sppg.v3.u512.png' . $v,
                'sizes' => '512x512',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ];
        }

        return [
            'id' => 'sppg-' . $slug,
            'name' => $name,
            'short_name' => $shortName,
            'description' => $name . ' — catatan belanja dapur santri',
            'theme_color' => '#2a96e0',
            'background_color' => '#2a96e0',
            'display' => 'minimal-ui',
            'scope' => '/',
            'start_url' => '/dashboard',
            'orientation' => 'portrait',
            'lang' => 'id',
            'dir' => 'ltr',
            'categories' => ['finance', 'productivity'],
            'icons' => $icons,
        ];
    }
}
