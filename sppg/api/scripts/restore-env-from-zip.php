<?php
/** Pulihkan secret dari .env.zip bila .env production tertimpa kosong/salah. */
$envPath = $argv[1] ?? (__DIR__ . '/../.env');
$zipPath = dirname($envPath) . '/.env.zip';

if (!is_file($envPath)) {
    fwrite(STDERR, "Missing .env: {$envPath}\n");
    exit(1);
}

$bak = '';
if (is_file($zipPath) && class_exists(ZipArchive::class)) {
    $zip = new ZipArchive();
    if ($zip->open($zipPath) === true) {
        $bak = $zip->getFromName('.env') ?: '';
        $zip->close();
    }
}

if ($bak === '') {
    fwrite(STDERR, "No backup in {$zipPath}\n");
    exit(1);
}

function envget(string $text, string $key): string
{
    foreach (preg_split("/\r\n|\n|\r/", $text) as $line) {
        if (str_starts_with($line, $key . '=')) {
            return trim(substr($line, strlen($key) + 1), " \t\r\n\"'");
        }
    }
    return '';
}

$keys = ['DB_PASS', 'GOOGLE_CLIENT_SECRET', 'BNI_CRON_KEY', 'BNI_NOTIFY_IMAP_PASS'];
$fromBak = [];
foreach ($keys as $key) {
    $fromBak[$key] = envget($bak, $key);
}

$cur = file_get_contents($envPath);
$out = [];
$changed = [];
foreach (preg_split("/\r\n|\n|\r/", $cur) as $line) {
    $replaced = false;
    foreach ($keys as $key) {
        if (str_starts_with($line, $key . '=')) {
            $val = $fromBak[$key];
            if ($val !== '') {
                $out[] = $key . '=' . $val;
                $changed[] = $key;
            } else {
                $out[] = $line;
            }
            $replaced = true;
            break;
        }
    }
    if (!$replaced) {
        $out[] = $line;
    }
}

file_put_contents($envPath, implode("\n", $out) . "\n");
echo 'restored: ' . implode(', ', $changed) . "\n";
