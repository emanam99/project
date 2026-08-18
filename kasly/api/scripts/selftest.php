<?php

/**
 * Smoke test API Kasly (butuh DB + .env).
 * php scripts/selftest.php
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\BelanjaController;
use App\Controllers\DashboardController;
use App\Controllers\KategoriController;
use App\Helpers\AuthHelper;
use Dotenv\Dotenv;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Slim\Psr7\Response;

$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

function fail(string $msg): never
{
    fwrite(STDERR, "FAIL: $msg\n");
    exit(1);
}

function ok(string $msg): void
{
    echo "OK: $msg\n";
}

function jsonBody(string $json)
{
    $req = (new ServerRequestFactory())->createServerRequest('POST', '/');
    $stream = (new StreamFactory())->createStream($json);
    return $req->withHeader('Content-Type', 'application/json')->withBody($stream);
}

$pdo = AuthHelper::pdo();
$pdo->exec("DELETE FROM users WHERE email = 'kasly.selftest@example.com'");
$ins = $pdo->prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'super_admin')");
$ins->execute(['kasly.selftest@example.com', 'Selftest']);
$user = AuthHelper::getUserById((int) $pdo->lastInsertId());
if (!$user) {
    fail('gagal membuat user tes');
}

$reqFactory = new ServerRequestFactory();

$kategori = new KategoriController();
$res = $kategori->index($reqFactory->createServerRequest('GET', '/kategori')->withQueryParams(['jenis' => 'keluar']), new Response());
$payload = json_decode((string) $res->getBody(), true);
if (empty($payload['success']) || count($payload['data']) < 3) {
    fail('kategori keluar kosong');
}
ok('kategori keluar: ' . count($payload['data']) . ' item');

$belanja = new BelanjaController();
$createReq = jsonBody(json_encode([
    'tanggal' => date('Y-m-d'),
    'jenis' => 'keluar',
    'kategori' => 'Dapur',
    'keterangan' => 'Tes belanja rumah',
    'items' => [
        ['nama_barang' => 'Beras', 'qty' => 2, 'satuan' => 'kg', 'harga_satuan' => 15000],
        ['nama_barang' => 'Minyak', 'qty' => 1, 'satuan' => 'liter', 'harga_satuan' => 20000],
    ],
]))->withAttribute('user', $user);
$res = $belanja->create($createReq, new Response());
$payload = json_decode((string) $res->getBody(), true);
if (empty($payload['success']) || ($payload['data']['belanja']['total'] ?? null) != 50000) {
    fail('create belanja: ' . json_encode($payload));
}
$belanjaId = (int) $payload['data']['belanja']['id'];
ok("belanja keluar #$belanjaId total 50000");

$masukReq = jsonBody(json_encode([
    'tanggal' => date('Y-m-d'),
    'jenis' => 'masuk',
    'kategori' => 'Gaji',
    'keterangan' => 'Tes gaji',
    'items' => [
        ['nama_barang' => 'Gaji', 'qty' => 1, 'satuan' => 'pcs', 'harga_satuan' => 100000],
    ],
]))->withAttribute('user', $user);
$res = $belanja->create($masukReq, new Response());
$payload = json_decode((string) $res->getBody(), true);
if (empty($payload['success']) || (float) $payload['data']['belanja']['total'] !== 100000.0) {
    fail('create masuk: ' . json_encode($payload));
}
ok('uang masuk total 100000');

$listReq = $reqFactory->createServerRequest('GET', '/belanja')->withQueryParams(['jenis' => 'keluar'])->withAttribute('user', $user);
$res = $belanja->index($listReq, new Response());
$payload = json_decode((string) $res->getBody(), true);
if (empty($payload['data'])) {
    fail('list belanja kosong');
}
ok('list belanja keluar: ' . count($payload['data']));

$dash = new DashboardController();
$res = $dash->summary($reqFactory->createServerRequest('GET', '/dashboard/summary')->withAttribute('user', $user), new Response());
$payload = json_decode((string) $res->getBody(), true);
$data = $payload['data'] ?? [];
if (($data['masuk_hari_ini'] ?? 0) < 100000 || ($data['keluar_hari_ini'] ?? 0) < 50000) {
    fail('dashboard summary: ' . json_encode($data));
}
ok('dashboard saldo=' . $data['saldo'] . ' masuk_hari=' . $data['masuk_hari_ini'] . ' keluar_hari=' . $data['keluar_hari_ini']);

$delReq = $reqFactory->createServerRequest('DELETE', '/belanja/' . $belanjaId)->withAttribute('user', $user);
$res = $belanja->delete($delReq, new Response(), ['id' => $belanjaId]);
$payload = json_decode((string) $res->getBody(), true);
if (empty($payload['success'])) {
    fail('hapus belanja');
}
ok('hapus belanja keluar');

echo "Semua tes API lulus.\n";
