<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Katalog master pelanggaran PPSA (Pasal II + Pasal I di Tindakan Menengah).
 *
 * - Jalankan pertama: nonaktifkan semua master lama, lalu insert katalog.
 * - Jalankan ulang: sync katalog (aktif + keterangan + urutan); tidak menonaktifkan jenis kustom.
 *
 * php vendor/bin/phinx seed:run -s PelanggaranPpsaSeed
 */
class PelanggaranPpsaSeed extends AbstractSeed
{
    private const MARKER = '<!--ppsa-seed-->';

    /**
     * @return list<array{kategori:string,nama:string,keterangan:string,urutan:int}>
     */
    private function catalog(): array
    {
        $berat = [
            ['Hubungan bukan mahram', 'Berhubungan dengan wanita yang bukan mahramnya (Pasal II Bagian 1 No. 1).'],
            ['Mencuri', 'Mengambil milik siapa saja dengan tidak seizin orangnya / mencuri (Pasal II Bagian 1 No. 3).'],
            ['Berkelahi', 'Berkelahi dengan sesama santri atau orang lain (Pasal II Bagian 1 No. 5).'],
            ['Membawa HP', 'Membawa HP, radio dan alat elektronik lainnya (Pasal II Bagian 1 No. 7).'],
            ['Homoseks', 'Hubungan mutamarrid/homoseks (Pasal II Bagian 1 No. 10).'],
            ['Menentang pengurus', 'Menentang pengurus yang sedang menjalankan tugas (Pasal II Bagian 1 No. 11).'],
            ['Cemarkan martabat', 'Melakukan hal-hal yang berakibat tercemarnya martabat pesantren baik di dalam maupun di luar (Pasal II Bagian 1 No. 21).'],
        ];

        $sedang = [
            ['Tidak mengaji/madrasah', 'Tidak mengaji atau bermadrasah (Pasal I Bagian 1; Tindakan Menengah).'],
            ['Tidak pengajian pagi', 'Tidak mengikuti pengajian kitab pagi (Pasal I Bagian 1; Tindakan Menengah).'],
            ['Tidak kegiatan ma\'hadiyah', 'Tidak mengikuti kegiatan ma\'hadiyah (Pasal I Bagian 1; Tindakan Menengah).'],
            ['Meninggalkan piket', 'Meninggalkan piket kebersihan atau piket malam (Pasal I Bagian 2; Tindakan Menengah).'],
            ['Keluar tanpa ijin', 'Keluar tanpa ijin resmi (Pasal I Bagian 2; Tindakan Menengah).'],
            ['Tidak bayar UWATA/Syahriyah', 'Tidak membayar UWATA dan Syahriyah (Pasal I Bagian 3; Tindakan Menengah).'],
            ['Ghasab', 'Ghasab berupa apa saja (Pasal II Bagian 1 No. 4).'],
            ['Senjata tajam', 'Menyimpan, menitipkan atau membawa senjata tajam atau alat yang bisa digunakan bertengkar (Pasal II Bagian 1 No. 6).'],
            ['Bermain/meminjam HP', 'Bermain atau meminjam HP, radio dan alat elektronik lainnya (Pasal II Bagian 1 No. 8).'],
            ['Buku/majalah terlarang', 'Membawa, membaca atau menyimpan buku, komik, majalah atau buku yang dilarang oleh pengurus (Pasal II Bagian 1 No. 9).'],
            ['Merugikan fasilitas', 'Merusak atau menghilangkan fasilitas pesantren atau melakukan perbuatan yang merugikan pesantren atau orang lain (Pasal II Bagian 1 No. 12).'],
            ['Jumpai tamu tetangga', 'Menjumpai tamu di rumah-rumah tetangga (Pasal II Bagian 1 No. 13).'],
            ['Olahraga salah tempat', 'Berolahraga tidak pada tempat dan waktunya (Pasal II Bagian 1 No. 14).'],
            ['Ganggu aliran listrik', 'Mengganggu atau menggunakan aliran listrik (Pasal II Bagian 1 No. 15).'],
            ['Kendaraan tanpa ijin', 'Mengemudikan kendaraan bermotor di lingkungan pengawasan pesantren tanpa ijin dari pengurus (Pasal II Bagian 1 No. 16).'],
            ['Daerah/kamar jam malam', 'Berada di daerah atau kamar lain pada jam malam (Pasal II Bagian 1 No. 18).'],
            ['Foto/gambar tidak sopan', 'Memasang atau menyimpan foto lawan jenis atau gambar yang tidak sopan (Pasal II Bagian 1 No. 19).'],
            ['Keluar batas pesantren', 'Keluar dari batas-batas pesantren yang ditetapkan oleh pengurus (Pasal II Bagian 1 No. 22).'],
            ['Telat kembali ijin', 'Telat kembali ke pesantren sesuai hari dan jam yang ditentukan ketika ijin pulang/pergi (Pasal II Bagian 1 No. 23).'],
            ['Larangan syariat', 'Mengerjakan/melakukan larangan-larangan syariat (Pasal II Bagian 2 No. 1).'],
            ['Bergurau melampaui batas', 'Bergurau yang melampaui batas, ramai atau mengeluarkan suara keras yang tidak ada manfaatnya (Pasal II Bagian 2 No. 3).'],
        ];

        $ringan = [
            ['Minuman memabukkan', 'Membawa minuman yang memabukkan atau semacamnya (Pasal II Bagian 1 No. 2).'],
            ['Jumpai tamu di asrama', 'Menjumpai tamu di asrama (Pasal II Bagian 1 No. 13).'],
            ['Merokok selain Jumat', 'Merokok selain hari Jumat (Pasal II Bagian 1 No. 17).'],
            ['Beli ke penjual liar', 'Membeli makanan atau lainnya kepada penjual yang masuk wilayah pesantren dan tidak memiliki tempat khusus (Pasal II Bagian 1 No. 20).'],
            ['Bahasa wajib', 'Tidak berbicara dengan pengurus atau dewan guru, kecuali dengan bahasa Arab, Madura halus, Indonesia atau Inggris (Pasal II Bagian 2 No. 2).'],
            ['Tidur sebelum belajar', 'Tidur sebelum selesai jam belajar (Pasal II Bagian 2 No. 4).'],
            ['Lewat kuburan', 'Lewat di kuburan, kecuali berziarah (Pasal II Bagian 2 No. 5).'],
        ];

        $out = [];
        $i = 1;
        foreach ($berat as [$nama, $ket]) {
            $out[] = ['kategori' => 'berat', 'nama' => $nama, 'keterangan' => $ket, 'urutan' => $i++];
        }
        $i = 1;
        foreach ($sedang as [$nama, $ket]) {
            $out[] = ['kategori' => 'sedang', 'nama' => $nama, 'keterangan' => $ket, 'urutan' => $i++];
        }
        $i = 1;
        foreach ($ringan as [$nama, $ket]) {
            $out[] = ['kategori' => 'ringan', 'nama' => $nama, 'keterangan' => $ket, 'urutan' => $i++];
        }

        return $out;
    }

    public function run(): void
    {
        if (!$this->hasTable('pelanggaran')) {
            return;
        }

        $hasKet = $this->table('pelanggaran')->hasColumn('keterangan');
        if (!$hasKet) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $marker = self::MARKER;
        $already = $this->fetchRow(sprintf(
            'SELECT `id` FROM `pelanggaran` WHERE `keterangan` LIKE %s LIMIT 1',
            $conn->quote('%' . $marker . '%')
        ));
        $isFirst = empty($already['id']);

        if ($isFirst) {
            $this->execute('UPDATE `pelanggaran` SET `aktif` = 0');
        }

        foreach ($this->catalog() as $row) {
            $nama = $row['nama'];
            $kat = $row['kategori'];
            $ket = rtrim($row['keterangan']) . "\n" . $marker;
            $urutan = (int) $row['urutan'];

            $existing = $this->fetchRow(sprintf(
                'SELECT `id` FROM `pelanggaran` WHERE `nama` = %s AND `kategori` = %s LIMIT 1',
                $conn->quote($nama),
                $conn->quote($kat)
            ));

            if ($existing && !empty($existing['id'])) {
                $this->execute(sprintf(
                    'UPDATE `pelanggaran` SET `aktif` = 1, `urutan` = %d, `keterangan` = %s WHERE `id` = %d',
                    $urutan,
                    $conn->quote($ket),
                    (int) $existing['id']
                ));
                continue;
            }

            $this->execute(sprintf(
                'INSERT INTO `pelanggaran` (`kategori`, `nama`, `keterangan`, `urutan`, `aktif`) VALUES (%s, %s, %s, %d, 1)',
                $conn->quote($kat),
                $conn->quote($nama),
                $conn->quote($ket),
                $urutan
            ));
        }
    }
}
