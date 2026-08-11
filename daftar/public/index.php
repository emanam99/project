<?php
/**
 * Entry SPA daftar — injeksi title/OG agar preview share WhatsApp/Telegram
 * membedakan Pendataan Alumni vs Aplikasi Pendaftaran santri.
 *
 * Host alumni.alutsmani.id ATAU path /alumni → meta Pendataan Alumni.
 */
declare(strict_types=1);

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$host = preg_replace('/:\d+$/', '', $host) ?: $host;
$uriPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = is_string($uriPath) && $uriPath !== '' ? $uriPath : '/';

$isAlumniHost = ($host === 'alumni.alutsmani.id') || (bool) preg_match('/^alumni\d+\.alutsmani\.id$/', $host);
$isAlumniPath = (bool) preg_match('#^/alumni(/|$)#', $path);
$isAlumni = $isAlumniHost || $isAlumniPath;

$htmlFile = __DIR__ . '/index.html';
if (!is_readable($htmlFile)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'index.html tidak ditemukan.';
    exit;
}

$html = file_get_contents($htmlFile);
if ($html === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Gagal membaca index.html.';
    exit;
}

if ($isAlumni) {
    $title = 'Pendataan Alumni';
    $desc = 'Sensus Alumni Pesantren Salafiyah Al-Utsmani';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((string) ($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    $scheme = $https ? 'https' : 'http';
    $canonical = $isAlumniHost
        ? ($scheme . '://' . $host . '/')
        : ($scheme . '://' . $host . '/alumni');

    $html = preg_replace('/<title>[^<]*<\/title>/i', '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>', $html, 1) ?? $html;

    if (preg_match('/<meta\s+name=["\']description["\'][^>]*>/i', $html)) {
        $html = preg_replace(
            '/<meta\s+name=["\']description["\'][^>]*>/i',
            '<meta name="description" content="' . htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') . '" />',
            $html,
            1
        ) ?? $html;
    } else {
        $html = preg_replace(
            '/<\/head>/i',
            '  <meta name="description" content="' . htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') . '" />' . "\n</head>",
            $html,
            1
        ) ?? $html;
    }

    // Hapus og/twitter lama lalu sisipkan set alumni
    $html = preg_replace('/\s*<meta\s+property=["\']og:[^"\']+["\'][^>]*>/i', '', $html) ?? $html;
    $html = preg_replace('/\s*<meta\s+name=["\']twitter:[^"\']+["\'][^>]*>/i', '', $html) ?? $html;

    $og = [
        '  <meta property="og:type" content="website" />',
        '  <meta property="og:site_name" content="' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '" />',
        '  <meta property="og:title" content="' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '" />',
        '  <meta property="og:description" content="' . htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') . '" />',
        '  <meta property="og:url" content="' . htmlspecialchars($canonical, ENT_QUOTES, 'UTF-8') . '" />',
        '  <meta name="twitter:card" content="summary" />',
        '  <meta name="twitter:title" content="' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '" />',
        '  <meta name="twitter:description" content="' . htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') . '" />',
    ];
    $html = preg_replace('/<\/head>/i', implode("\n", $og) . "\n</head>", $html, 1) ?? $html;
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
echo $html;
