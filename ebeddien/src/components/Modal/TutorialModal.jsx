import Modal from './Modal'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const tutorialContent = `# Tutorial Penggunaan eBeddien

Panduan lengkap untuk menggunakan eBeddien (Digital Service Center) dengan efektif.

---

## 🚀 Memulai

### Login ke Sistem
1. Buka aplikasi di browser (atau install sebagai PWA di mobile)
2. Masukkan **ID** dan **password** yang telah diberikan
3. Klik tombol **"Login"**
4. Setelah berhasil, Anda akan diarahkan ke halaman utama

**Catatan**: Jika lupa password, hubungi admin untuk reset.

---

## 📊 1. Dashboard

Dashboard adalah halaman utama yang menampilkan ringkasan penting dan statistik pembayaran.

### Fitur Dashboard

#### Statistik Utama
- **Total Santri**: Jumlah santri terdaftar di sistem
- **Total Pengurus**: Jumlah pengurus yang terdaftar
- **Rekap Status Santri**: Breakdown status santri (Mukim, Khoriji, Boyong, Guru Tugas, Pengurus)

#### Kelompok Data
- **Kelompokkan Berdasarkan**: Pilih pengelompokan data:
  - Lembaga
  - Tahun Ajaran
  - Keterangan 1
  - Keterangan 2
- **Kelompok Tunggakan**: Total, Bayar, dan Kurang per kelompok
- **Kelompok Khusus**: Total, Bayar, dan Kurang per kelompok
- **Kelompok Keuangan**: Breakdown keuangan per kelompok

#### Grafik & Visualisasi
- **Grafik Pembayaran Per Bulan**: Tren pembayaran 12 bulan terakhir
- **Komposisi Santri**: Pie chart komposisi santri berdasarkan status
- **Grafik Pembayaran Khusus**: Bar chart pembayaran khusus
- **Grafik Tunggakan**: Bar chart data tunggakan
- **Grafik Pembayaran Per Hari**: Line chart 15 hari terakhir

#### Quick Access
- **Pembayaran Khusus**: Tombol cepat ke halaman Pembayaran Khusus
- **Monitoring Pembayaran**: Tombol cepat ke halaman Monitoring Pembayaran

### Cara Menggunakan Dashboard
1. Klik menu **"Dashboard"** di sidebar (desktop) atau bottom nav (mobile)
2. Pilih **"Kelompokkan berdasarkan"** untuk mengubah cara pengelompokan data
3. Scroll untuk melihat semua grafik dan statistik
4. Gunakan tombol quick access untuk navigasi cepat

---

## 💰 2. Pembayaran Bulanan (Syahriah)

Sistem untuk mengelola pembayaran uang wajib bulanan santri.

### Fitur Pembayaran Bulanan

#### Manajemen Pembayaran Bulanan
- **Tahun Ajaran**: Pilih tahun ajaran yang ingin dilihat
- **Status Pembayaran**: 
  - **Lunas**: Sudah membayar penuh
  - **Belum Lunas**: Sudah membayar sebagian
  - **Belum Bayar**: Belum ada pembayaran
- **Detail Per Bulan**: Lihat detail pembayaran untuk setiap bulan
- **Riwayat Pembayaran**: Track semua pembayaran yang pernah dilakukan

#### Cara Menggunakan
1. Klik menu **"Pembayaran"** / **"UWABA"** di navigasi
2. Masukkan **NIS** (7 digit) di kolom pencarian
3. Pilih **Tahun Ajaran** yang ingin dilihat
4. Lihat rincian pembayaran per bulan:
   - **Wajib**: Jumlah yang harus dibayar
   - **Bayar**: Jumlah yang sudah dibayar
   - **Kurang**: Sisa yang belum dibayar
5. Klik item pembayaran untuk melihat detail dan menambah pembayaran baru
6. Gunakan tombol **"Bayar"** untuk mencatat pembayaran baru

#### Mencatat Pembayaran Bulanan
1. Klik item bulan yang ingin dibayar
2. Lihat riwayat pembayaran yang sudah ada
3. Klik **"Tambah Pembayaran"**
4. Masukkan:
   - **Nominal**: Jumlah yang dibayar
   - **Via**: Metode pembayaran (Cash, TF, Lembaga, Beasiswa)
5. Klik **"Bayar"** untuk menyimpan

---

## 📝 3. Tunggakan

Tunggakan adalah sistem untuk mengelola berbagai jenis tunggakan santri.

### Fitur Tunggakan

- **Manajemen Tunggakan**: Kelola berbagai jenis tunggakan
- **Detail Rincian**: Lihat detail lengkap tunggakan per santri
- **Pencatatan Pembayaran**: Catat pembayaran dengan berbagai metode
- **Tracking Status**: Monitor status pembayaran

### Cara Menggunakan Tunggakan
1. Klik menu **"Tunggakan"** di navigasi
2. Masukkan **NIS** (7 digit)
3. Lihat daftar tunggakan yang ada
4. Klik item tunggakan untuk melihat detail
5. Gunakan tombol **"Bayar"** untuk mencatat pembayaran

---

## ⭐ 4. Khusus

Khusus adalah sistem untuk mengelola pembayaran khusus santri.

### Fitur Khusus

- **Pembayaran Khusus**: UJBA, Guru Tugas, KKN, PLP/PPL, Skripsi, Wisuda
- **Filter Advanced**: Filter berdasarkan tahun ajaran dan status
- **Monitoring Detail**: Pantau pembayaran khusus dengan statistik

### Cara Menggunakan Khusus
1. Klik menu **"Khusus"** di navigasi
2. Pilih **Tahun Ajaran** dan filter lainnya
3. Lihat daftar pembayaran khusus
4. Klik item untuk melihat detail

---

## 📋 5. Laporan

Laporan adalah halaman untuk melihat dan export laporan pembayaran.

### Fitur Laporan

- **Laporan Detail**: Generate laporan pembayaran yang komprehensif
- **Multi-Tab Laporan**: Laporan untuk Tunggakan, Khusus, dan Pembayaran Bulanan
- **Filter Periode**: Filter berdasarkan tanggal dan tahun ajaran
- **Export & Print**: Export laporan ke format PDF atau langsung print

### Cara Menggunakan Laporan
1. Klik menu **"Laporan"** di navigasi
2. Pilih tab laporan yang ingin dilihat
3. Pilih periode dan filter lainnya
4. Klik **"Generate"** untuk membuat laporan
5. Gunakan tombol **"Export"** atau **"Print"** untuk export/print

---

## 💡 Tips & Trik

1. **Gunakan Pencarian**: Gunakan fitur pencarian untuk menemukan santri dengan cepat
2. **Filter Data**: Gunakan filter untuk melihat data yang spesifik
3. **Export Laporan**: Export laporan secara berkala untuk backup data
4. **Update Data**: Pastikan data santri selalu update untuk akurasi laporan

---

*Untuk bantuan lebih lanjut, hubungi tim IT pondok pesantren.*`

function TutorialModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tutorial Penggunaan"
      icon="📚"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{tutorialContent}</ReactMarkdown>
    </Modal>
  )
}

export default TutorialModal

