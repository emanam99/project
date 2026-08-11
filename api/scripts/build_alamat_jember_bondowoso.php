<?php

/**
 * Unduh desa/kecamatan Jember (3509) & Bondowoso (3511) dari CDN wilayah BPS,
 * lalu tulis JSON seed untuk migrasi tabel alamat.
 *
 * Jalankan: php scripts/build_alamat_jember_bondowoso.php
 */

declare(strict_types=1);

$base = 'https://cdn.jsdelivr.net/gh/izzulabadi/api-wilayah-indonesia-2026@v1.0.4/api';
$outFile = dirname(__DIR__) . '/db/data/alamat_jember_bondowoso.json';

function httpGetJson(string $url): ?array
{
    $ctx = stream_context_create([
        'http' => ['timeout' => 30, 'header' => "User-Agent: alutsmani-alamat-builder\r\n"],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

/** BPS compact → dotted Kemendagri-style (35.09.01.2001) */
function bpsToDot(string $bps): string
{
    $bps = preg_replace('/\D/', '', $bps);
    $len = strlen($bps);
    if ($len === 2) {
        return $bps;
    }
    if ($len === 4) {
        return substr($bps, 0, 2) . '.' . substr($bps, 2, 2);
    }
    if ($len === 6) {
        return substr($bps, 0, 2) . '.' . substr($bps, 2, 2) . '.' . substr($bps, 4, 2);
    }
    if ($len === 10) {
        return substr($bps, 0, 2) . '.' . substr($bps, 2, 2) . '.' . substr($bps, 4, 2) . '.' . substr($bps, 6, 4);
    }
    return $bps;
}

/** Kode pos per kecamatan (PT Pos / referensi umum) — desa mewarisi kode pos kecamatan. */
$kodePosKec = [
    // Jember
    '350901' => '68168', '350902' => '68167', '350903' => '68156', '350904' => '68165',
    '350905' => '68166', '350906' => '68155', '350907' => '68157', '350908' => '68164',
    '350909' => '68154', '350910' => '68161', '350911' => '68162', '350912' => '68172',
    '350913' => '68152', '350914' => '68153', '350915' => '68151', '350916' => '68171',
    '350917' => '68175', '350918' => '68173', '350919' => '68131', '350920' => '68111',
    '350921' => '68121', '350922' => '68191', '350923' => '68174', '350924' => '68181',
    '350925' => '68192', '350926' => '68182', '350927' => '68193', '350928' => '68196',
    '350929' => '68194', '350930' => '68184', '350931' => '68195',
    // Bondowoso
    '351101' => '68262', '351102' => '68263', '351103' => '68272', '351104' => '68287',
    '351105' => '68271', '351106' => '68261', '351107' => '68251', '351108' => '68281',
    '351109' => '68282', '351110' => '68283', '351111' => '68211', '351112' => '68252',
    '351113' => '68291', '351114' => '68284', '351115' => '68286', '351116' => '68285',
    '351117' => '68253', '351118' => '68287', '351119' => '68292', '351120' => '68251',
    '351121' => '68291', '351122' => '68283', '351123' => '68263',
];

$kabupatens = [
    ['bps' => '3509', 'name' => 'Jember'],
    ['bps' => '3511', 'name' => 'Bondowoso'],
];

$rows = [];
$rows[] = [
    'id' => '35',
    'nama' => 'Jawa Timur',
    'tipe' => 'provinsi',
    'kode_pos' => null,
];

foreach ($kabupatens as $kab) {
    $kabId = bpsToDot($kab['bps']);
    $rows[] = [
        'id' => $kabId,
        'nama' => $kab['name'],
        'tipe' => 'kabupaten',
        'kode_pos' => $kab['bps'] === '3509' ? '68111' : '68211',
    ];

    $districts = httpGetJson("{$base}/districts/{$kab['bps']}.json");
    if (!$districts) {
        fwrite(STDERR, "Gagal unduh districts {$kab['bps']}\n");
        exit(1);
    }

    foreach ($districts as $kec) {
        $kecBps = (string) $kec['id'];
        $kecId = bpsToDot($kecBps);
        $pos = $kodePosKec[$kecBps] ?? ($kab['bps'] === '3509' ? '68100' : '68200');
        $rows[] = [
            'id' => $kecId,
            'nama' => (string) $kec['name'],
            'tipe' => 'kecamatan',
            'kode_pos' => $pos,
        ];

        $villages = httpGetJson("{$base}/villages/{$kecBps}.json");
        if (!$villages) {
            fwrite(STDERR, "Gagal unduh villages {$kecBps}\n");
            continue;
        }
        foreach ($villages as $desa) {
            $desaBps = (string) $desa['id'];
            $rows[] = [
                'id' => bpsToDot($desaBps),
                'nama' => (string) $desa['name'],
                'tipe' => 'desa',
                'kode_pos' => $pos,
            ];
        }
        usleep(80000);
    }
}

$dir = dirname($outFile);
if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
}
file_put_contents($outFile, json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
echo 'OK: ' . count($rows) . " baris → {$outFile}\n";
