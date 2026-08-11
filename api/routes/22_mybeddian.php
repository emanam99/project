<?php

declare(strict_types=1);

/**
 * Route khusus untuk aplikasi Mybeddian.
 * Menerima request dari frontend mybeddian; user yang login bisa role santri (id tercantum di tabel santri).
 * Prefix: /api/mybeddian
 */
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\AuthControllerV2;
use App\Controllers\MybeddianNisPengajuanController;
use App\Controllers\MybeddianProfilController;
use App\Controllers\MybeddianMadrasahEditPengajuanController;
use App\Controllers\MybeddianBarangController;
use App\Controllers\MybeddianPenjualanController;
use App\Controllers\MybeddianCashlessController;
use App\Controllers\UgtLaporanPjgtController;
use App\Controllers\UgtLaporanGtController;
use App\Controllers\UgtGuruTugasTugasanController;
use App\Controllers\MybeddianKompasController;

return function (\Slim\App $app): void {
    $group = $app->group('/api/mybeddian', function ($group) {
        // Auth: login, verify (tanpa middleware agar token santri bisa divalidasi), logout
        $group->post('/v2/auth/login', [AuthControllerV2::class, 'login']);
        $group->get('/v2/auth/verify', [AuthControllerV2::class, 'verifyMybeddian']);
        $group->post('/v2/auth/logout', [AuthControllerV2::class, 'logout'])->add(new AuthMiddleware());
        $group->post('/v2/auth/switch-santri', [AuthControllerV2::class, 'switchMybeddianSantri'])->add(new AuthMiddleware());

        // Daftar akun santri: NIS, NIK, No. HP
        $group->post('/v2/auth/daftar-check', [AuthControllerV2::class, 'daftarCheckSantri']);
        $group->post('/v2/auth/daftar-konfirmasi', [AuthControllerV2::class, 'daftarKonfirmasiSantri']);
        // Daftar PJGT: identitas madrasah, nama, No. HP (= no_pjgt di data)
        $group->post('/v2/auth/daftar-check-pjgt', [AuthControllerV2::class, 'daftarCheckMadrasahPjgt']);
        $group->get('/v2/auth/daftar-pjgt-lookup-madrasah', [AuthControllerV2::class, 'daftarLookupMadrasahPjgt']);
        $group->post('/v2/auth/daftar-konfirmasi-pjgt', [AuthControllerV2::class, 'daftarKonfirmasiMadrasahPjgt']);
        $group->post('/v2/auth/daftar-pjgt-hubung-akun', [AuthControllerV2::class, 'daftarPjgtHubungAkun']);
        $group->post('/v2/auth/daftar-santri-hubung-akun', [AuthControllerV2::class, 'daftarSantriHubungAkun']);
        // Daftar toko: kode_toko, nama_toko, No. HP (toko harus sudah ada di cashless___pedagang, id_users kosong)
        $group->post('/v2/auth/daftar-check-toko', [AuthControllerV2::class, 'daftarCheckToko']);
        $group->post('/v2/auth/daftar-konfirmasi-toko', [AuthControllerV2::class, 'daftarKonfirmasiToko']);
        $group->post('/v2/auth/daftar-toko-hubung-akun', [AuthControllerV2::class, 'daftarTokoHubungAkun']);
        $group->post('/v2/auth/tambah-akses-prepare', [AuthControllerV2::class, 'tambahAksesPrepare'])->add(new AuthMiddleware());
        $group->post('/v2/auth/tambah-akses-check-nis', [AuthControllerV2::class, 'tambahAksesCheckNis'])->add(new AuthMiddleware());
        $group->post('/v2/auth/tambah-akses-saudara-pengajuan', [MybeddianNisPengajuanController::class, 'createTambahAksesSaudara'])->add(new AuthMiddleware());
        $group->post('/v2/auth/tambah-akses-consume', [AuthControllerV2::class, 'tambahAksesConsume']);
        $group->get('/v2/auth/setup-token', [AuthControllerV2::class, 'getSetupTokenSantri']);
        $group->post('/v2/auth/setup-akun', [AuthControllerV2::class, 'postSetupAkunSantri']);
        $group->post('/v2/auth/lupa-password-request', [AuthControllerV2::class, 'lupaPasswordRequestSantri']);
        $group->post('/v2/auth/lupa-password-request-pjgt', [AuthControllerV2::class, 'lupaPasswordRequestPjgt']);
        $group->post('/v2/auth/lupa-password-request-toko', [AuthControllerV2::class, 'lupaPasswordRequestToko']);
        $group->post('/v2/auth/lupa-username-request', [AuthControllerV2::class, 'lupaUsernameRequest']);

        // Pengajuan NIS (lupa NIS) — publik
        $group->post('/v2/auth/nis-pengajuan/check', [MybeddianNisPengajuanController::class, 'check']);
        $group->post('/v2/auth/nis-pengajuan', [MybeddianNisPengajuanController::class, 'create']);
        $group->post('/v2/auth/nis-pengajuan/{id}/upload-kk', [MybeddianNisPengajuanController::class, 'uploadKk']);
        $group->post('/v2/auth/nis-pengajuan/{id}/prepare-wa', [MybeddianNisPengajuanController::class, 'prepareWa']);

        // Profil madrasah PJGT (biodata lengkap + foto/logo — serve dibawah)
        $group->get('/v2/madrasah-profil/foto', [MybeddianProfilController::class, 'serveMadrasahFoto'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/madrasah-profil/pengajuan', [MybeddianMadrasahEditPengajuanController::class, 'getPengajuan'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->post('/v2/madrasah-profil/pengajuan/upload', [MybeddianMadrasahEditPengajuanController::class, 'upload'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->post('/v2/madrasah-profil/pengajuan', [MybeddianMadrasahEditPengajuanController::class, 'postPengajuan'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/madrasah-profil', [MybeddianProfilController::class, 'getMadrasahProfil'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());

        // Profil akun portal (semua user Mybeddian terautentikasi — termasuk wali/pengurus)
        $group->get('/v2/profil', [MybeddianProfilController::class, 'getProfil'])
            ->add(new AuthMiddleware());
        $group->get('/v2/profil/foto', [MybeddianProfilController::class, 'serveFoto'])
            ->add(new AuthMiddleware());
        $group->post('/v2/profil/foto', [MybeddianProfilController::class, 'uploadFoto'])
            ->add(new AuthMiddleware());
        $group->delete('/v2/profil/foto', [MybeddianProfilController::class, 'deleteFoto'])
            ->add(new AuthMiddleware());

        // Biodata santri (struktur sama dengan public santri di Uwaba)
        $group->get('/v2/biodata', [MybeddianProfilController::class, 'getBiodata'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->patch('/v2/biodata/email', [MybeddianProfilController::class, 'patchBiodataEmail'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->patch('/v2/biodata/contact', [MybeddianProfilController::class, 'patchBiodataContact'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Riwayat ijin santri (baca saja)
        $group->get('/v2/ijin', [MybeddianProfilController::class, 'getRiwayatIjin'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Riwayat pelanggaran santri (baca saja)
        $group->get('/v2/pelanggaran', [MybeddianProfilController::class, 'getRiwayatPelanggaran'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Riwayat rombel (diniyah/formal) & kamar santri (baca saja)
        $group->get('/v2/riwayat-rombel', [MybeddianProfilController::class, 'getRiwayatRombel'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/riwayat-kamar', [MybeddianProfilController::class, 'getRiwayatKamar'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/riwayat-lttq', [MybeddianProfilController::class, 'getRiwayatLttq'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Data barang toko (hanya role toko)
        $group->get('/v2/barang', [MybeddianBarangController::class, 'list'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->get('/v2/barang/by-kode', [MybeddianPenjualanController::class, 'getBarangByKode'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->post('/v2/barang', [MybeddianBarangController::class, 'create'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->put('/v2/barang/{id}', [MybeddianBarangController::class, 'update'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->delete('/v2/barang/{id}', [MybeddianBarangController::class, 'delete'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->get('/v2/barang/{id}/stok', [MybeddianBarangController::class, 'listStok'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->post('/v2/barang/{id}/stok', [MybeddianBarangController::class, 'addStok'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());

        // Kasir penjualan toko
        $group->post('/v2/penjualan/checkout', [MybeddianPenjualanController::class, 'checkout'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->get('/v2/penjualan', [MybeddianPenjualanController::class, 'list'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->get('/v2/penjualan/{id}', [MybeddianPenjualanController::class, 'detail'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());

        // Cashless wallet santri
        $group->get('/v2/cashless/wallet', [MybeddianCashlessController::class, 'getWallet'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/cashless/transactions', [MybeddianCashlessController::class, 'getTransactions'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/cashless/transactions/{journalId}', [MybeddianCashlessController::class, 'getTransactionDetail'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/cashless/live-state', [MybeddianCashlessController::class, 'getLiveState'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/cashless/kartu-pin', [MybeddianCashlessController::class, 'getKartuPin'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->post('/v2/cashless/kartu-pin', [MybeddianCashlessController::class, 'setKartuPin'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->put('/v2/cashless/kartu-pin', [MybeddianCashlessController::class, 'changeKartuPin'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/cashless/wallet-lookup', [MybeddianCashlessController::class, 'lookupWallet'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->post('/v2/cashless/transfer', [MybeddianCashlessController::class, 'transfer'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Laporan PJGT UGT — sama logika dengan /api/ugt/laporan-pjgt, dibatasi ke madrasah di token PJGT
        $group->get('/v2/laporan-pjgt/tahun-ajaran-options', [UgtLaporanPjgtController::class, 'getTahunAjaranOptions'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-pjgt/santri-options', [UgtLaporanPjgtController::class, 'getSantriOptions'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-pjgt/konteks-sekarang', [UgtLaporanPjgtController::class, 'getKonteksSekarang'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-pjgt', [UgtLaporanPjgtController::class, 'getAll'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-pjgt/{id}', [UgtLaporanPjgtController::class, 'getById'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->post('/v2/laporan-pjgt', [UgtLaporanPjgtController::class, 'create'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->put('/v2/laporan-pjgt/{id}', [UgtLaporanPjgtController::class, 'update'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());
        $group->delete('/v2/laporan-pjgt/{id}', [UgtLaporanPjgtController::class, 'delete'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());

        // Riwayat penugasan Guru Tugas di madrasah PJGT (baca saja, scope madrasah_id token)
        $group->get('/v2/guru-tugas-riwayat', [UgtGuruTugasTugasanController::class, 'listMybeddianPjgt'])
            ->add(new RoleMiddleware(['pjgt']))->add(new AuthMiddleware());

        // Laporan GT — santri dengan status guru tugas (scope id_santri token + penugasan aktif)
        $group->get('/v2/laporan-gt/konteks-sekarang', [UgtLaporanGtController::class, 'getKonteksSekarang'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-gt', [UgtLaporanGtController::class, 'getAll'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->get('/v2/laporan-gt/{id}', [UgtLaporanGtController::class, 'getById'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->post('/v2/laporan-gt', [UgtLaporanGtController::class, 'create'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->put('/v2/laporan-gt/{id}', [UgtLaporanGtController::class, 'update'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());
        $group->delete('/v2/laporan-gt/{id}', [UgtLaporanGtController::class, 'delete'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // KOMMPAS — PJGT atau santri Guru Tugas (madrasah dari token / penugasan)
        $group->get('/v2/kompas', [MybeddianKompasController::class, 'overview'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->get('/v2/kompas/daftar/{id}', [MybeddianKompasController::class, 'getDaftar'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->post('/v2/kompas/daftar', [MybeddianKompasController::class, 'createDaftar'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->put('/v2/kompas/daftar/{id}', [MybeddianKompasController::class, 'updateDaftar'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->get('/v2/kompas/check-nik', [MybeddianKompasController::class, 'checkNik'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->post('/v2/kompas/upload', [MybeddianKompasController::class, 'upload'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
        $group->get('/v2/kompas/serve-file', [MybeddianKompasController::class, 'serve'])
            ->add(new RoleMiddleware(['pjgt', 'santri']))->add(new AuthMiddleware());
    });

    // Opsional: header X-App-Source: mybeddian bisa dipakai untuk log/analytics
};
