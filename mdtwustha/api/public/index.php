<?php

use Slim\Factory\AppFactory;
use App\Controllers\AuthController;
use App\Controllers\SantriController;
use Dotenv\Dotenv;

require __DIR__ . '/../vendor/autoload.php';

// Load .env
$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

// Set Custom Error Log
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../error.log');

// Instantiate App
$app = AppFactory::create();

// Add error middleware
$app->addErrorMiddleware(true, true, true);

// Add CORS middleware
$app->add(function ($request, $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        ->withHeader('Access-Control-Allow-Credentials', 'true');
});

// Handle Preflight OPTIONS
$app->options('/{routes:.+}', function ($request, $response, $args) {
    return $response;
});

// Set base path if needed depending on web server configuration
// For XAMPP, usually something like /mdtwustha/api/public
$basePath = str_replace('/index.php', '', $_SERVER['SCRIPT_NAME']);
$app->setBasePath($basePath);

// Routes
$app->post('/login', [new \App\Controllers\AuthController(), 'login']);
$app->post('/santri/get', [new \App\Controllers\SantriController(), 'index']); // Matching old frontend action
$app->get('/santri', [new \App\Controllers\SantriController(), 'index']);
$app->post('/santri/create', [new \App\Controllers\SantriController(), 'create']); // Matching old frontend
$app->post('/santri', [new \App\Controllers\SantriController(), 'create']);
$app->post('/santri/update', [new \App\Controllers\SantriController(), 'update']); // Matching old frontend
$app->put('/santri/{id}', [new \App\Controllers\SantriController(), 'update']);
$app->get('/santri/{id}/kelas-riwayat', [new \App\Controllers\SantriController(), 'kelasRiwayat']);

$app->get('/pengurus', [new \App\Controllers\PengurusController(), 'index']);
$app->post('/pengurus/reset-password', [new \App\Controllers\PengurusController(), 'resetPassword']);
$app->post('/pengurus', [new \App\Controllers\PengurusController(), 'create']);
$app->put('/pengurus/{id}/reset-password', [new \App\Controllers\PengurusController(), 'resetPassword']);
$app->put('/pengurus/{id}', [new \App\Controllers\PengurusController(), 'update']);

$app->get('/kelas', [new \App\Controllers\KelasController(), 'index']);
$app->post('/kelas', [new \App\Controllers\KelasController(), 'create']);
$app->put('/kelas/{id}', [new \App\Controllers\KelasController(), 'update']);
$app->delete('/kelas/{id}', [new \App\Controllers\KelasController(), 'delete']);

$app->get('/absen', [new \App\Controllers\AbsenController(), 'index']);
$app->get('/absen/rekap', [new \App\Controllers\AbsenController(), 'rekap']);
$app->put('/absen/jam', [new \App\Controllers\AbsenController(), 'updateJam']);

$absenRekapPublish = new \App\Controllers\AbsenRekapPublishController();
$app->get('/absen/rekap/publish/occupied', [$absenRekapPublish, 'occupied']);
$app->get('/absen/rekap/publish', [$absenRekapPublish, 'index']);
$app->get('/absen/rekap/publish/{id}', [$absenRekapPublish, 'show']);
$app->post('/absen/rekap/publish', [$absenRekapPublish, 'create']);
$app->put('/absen/rekap/publish/{id}', [$absenRekapPublish, 'update']);
$app->delete('/absen/rekap/publish/{id}', [$absenRekapPublish, 'delete']);

$guruRekapPublish = new \App\Controllers\AbsenGuruRekapPublishController();
$app->get('/absen/jurnal/rekap-absen-guru/publish/occupied', [$guruRekapPublish, 'occupied']);
$app->get('/absen/jurnal/rekap-absen-guru/publish', [$guruRekapPublish, 'index']);
$app->get('/absen/jurnal/rekap-absen-guru/publish/{id}', [$guruRekapPublish, 'show']);
$app->post('/absen/jurnal/rekap-absen-guru/publish', [$guruRekapPublish, 'create']);
$app->put('/absen/jurnal/rekap-absen-guru/publish/{id}', [$guruRekapPublish, 'update']);
$app->delete('/absen/jurnal/rekap-absen-guru/publish/{id}', [$guruRekapPublish, 'delete']);

$app->get('/nilai', [new \App\Controllers\NilaiController(), 'index']);
$app->get('/nilai/rekap', [new \App\Controllers\NilaiController(), 'rekap']);
$nilaiRekapPublish = new \App\Controllers\NilaiRekapPublishController();
$app->get('/nilai/rekap/publish/occupied', [$nilaiRekapPublish, 'occupied']);
$app->get('/nilai/rekap/publish', [$nilaiRekapPublish, 'index']);
$app->get('/nilai/rekap/publish/{id}', [$nilaiRekapPublish, 'show']);
$app->post('/nilai/rekap/publish', [$nilaiRekapPublish, 'create']);
$app->put('/nilai/rekap/publish/{id}', [$nilaiRekapPublish, 'update']);
$app->delete('/nilai/rekap/publish/{id}', [$nilaiRekapPublish, 'delete']);
$app->put('/nilai', [new \App\Controllers\NilaiController(), 'save']);
$app->put('/nilai/urutan', [new \App\Controllers\NilaiController(), 'reorder']);
$app->post('/nilai/ubah-tanggal', [new \App\Controllers\NilaiController(), 'ubahTanggal']);
$app->post('/nilai/hapus', [new \App\Controllers\NilaiController(), 'hapusBatch']);

$app->get('/absen/jurnal', [new \App\Controllers\JurnalMengajarController(), 'index']);
$app->put('/absen/jurnal', [new \App\Controllers\JurnalMengajarController(), 'save']);
$app->get('/absen/jurnal/rekap-absen-guru', [new \App\Controllers\JurnalMengajarController(), 'rekapAbsenGuru']);
$app->get('/absen/jurnal/rekap', [new \App\Controllers\JurnalMengajarController(), 'rekapJurnal']);

$app->get('/mapel', [new \App\Controllers\MapelController(), 'index']);
$app->get('/mapel/{id}', [new \App\Controllers\MapelController(), 'show']);
$app->post('/mapel', [new \App\Controllers\MapelController(), 'create']);
$app->put('/mapel/{id}', [new \App\Controllers\MapelController(), 'update']);
$app->delete('/mapel/{id}', [new \App\Controllers\MapelController(), 'delete']);

$app->get('/kitab', [new \App\Controllers\KitabController(), 'index']);
$app->post('/kitab', [new \App\Controllers\KitabController(), 'create']);
$app->put('/kitab/{id}', [new \App\Controllers\KitabController(), 'update']);
$app->delete('/kitab/{id}', [new \App\Controllers\KitabController(), 'delete']);
$app->get('/kelas/{id}/mapel', [new \App\Controllers\MapelController(), 'listForKelas']);
$app->put('/kelas/{id}/mapel', [new \App\Controllers\MapelController(), 'syncKelasMapel']);

$app->get('/kalender', [new \App\Controllers\KalenderProxyController(), 'proxy']);

$rekapPublish = new \App\Controllers\RekapPublishController();
$app->get('/rekap/publish/occupied', [$rekapPublish, 'occupied']);
$app->get('/rekap/publish', [$rekapPublish, 'index']);
$app->get('/rekap/publish/{id}', [$rekapPublish, 'show']);
$app->post('/rekap/publish', [$rekapPublish, 'create']);
$app->put('/rekap/publish/{id}', [$rekapPublish, 'update']);
$app->delete('/rekap/publish/{id}', [$rekapPublish, 'delete']);

$jadwal = new \App\Controllers\JadwalController();
$app->get('/jadwal', [$jadwal, 'index']);
$app->get('/jadwal/{id}', [$jadwal, 'show']);
$app->post('/jadwal', [$jadwal, 'create']);
$app->put('/jadwal/{id}', [$jadwal, 'update']);
$app->delete('/jadwal/{id}', [$jadwal, 'delete']);

$app->get('/dashboard', [new \App\Controllers\DashboardController(), 'index']);

$syahriah = new \App\Controllers\SyahriahController();
$app->get('/syahriah/tahun-ajaran', [$syahriah, 'listTahunAjaran']);
$app->post('/syahriah/tahun-ajaran', [$syahriah, 'createTahunAjaran']);
$app->put('/syahriah/tahun-ajaran/{id}', [$syahriah, 'updateTahunAjaran']);
$app->get('/syahriah/bulan', [$syahriah, 'bulanAkademik']);
$app->get('/syahriah/ringkas', [$syahriah, 'ringkas']);
$app->post('/syahriah/wajib/batch', [$syahriah, 'batchWajib']);
$app->put('/syahriah/wajib/{id}', [$syahriah, 'updateWajib']);
$app->get('/syahriah/bayar', [$syahriah, 'listBayar']);
$app->post('/syahriah/bayar', [$syahriah, 'createBayar']);
$app->post('/syahriah/bayar/preview', [$syahriah, 'previewAlokasi']);
$app->delete('/syahriah/bayar/{id}', [$syahriah, 'deleteBayar']);
$app->get('/syahriah/khusus', [$syahriah, 'listKhusus']);
$app->post('/syahriah/khusus/batch', [$syahriah, 'batchKhusus']);
$app->post('/syahriah/khusus/batch-update', [$syahriah, 'batchUpdateKhusus']);
$app->post('/syahriah/khusus/batch-delete', [$syahriah, 'batchDeleteKhusus']);
$app->delete('/syahriah/khusus/{id}', [$syahriah, 'deleteKhusus']);
$app->post('/syahriah/khusus/bayar', [$syahriah, 'createKhususBayar']);
$app->delete('/syahriah/khusus/bayar/{id}', [$syahriah, 'deleteKhususBayar']);

$app->run();
