import Modal from './Modal'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const aboutContent = `# Tentang Aplikasi Uwaba - Sistem Pembayaran Pesantren

Aplikasi **Uwaba** (Uang Wajib Bulanan) adalah sistem manajemen pembayaran yang dirancang khusus untuk mengelola pembayaran santri di Pesantren Salafiyah Al-Utsmani. Aplikasi ini menyediakan fitur-fitur komprehensif untuk mengelola berbagai jenis pembayaran, monitoring, dan pelaporan.

## Fitur Utama

### 📊 Dashboard Monitoring
- **Statistik Real-time**: Pantau total santri, pengurus, dan pembayaran secara real-time
- **Grafik Visual**: Visualisasi data pembayaran per bulan, komposisi santri, dan tren pembayaran
- **Kelompok Data**: Analisis data berdasarkan lembaga, tahun ajaran, atau keterangan
- **Rekap Status Santri**: Overview status santri (Mukim, Khoriji, Boyong, dll)
- **Quick Access**: Akses cepat ke Pembayaran Khusus dan Monitoring Uwaba

### 💰 Sistem Pembayaran Uwaba
- **Pembayaran Bulanan**: Kelola pembayaran uang wajib bulanan santri
- **Tracking Per Bulan**: Monitor pembayaran per bulan dengan detail lengkap
- **Status Pembayaran**: Tandai status lunas, belum lunas, atau belum bayar
- **Riwayat Pembayaran**: Track history pembayaran untuk setiap santri
- **Filter & Pencarian**: Filter berdasarkan tahun ajaran, status, dan kriteria lainnya

### 📝 Sistem Pembayaran Tunggakan
- **Manajemen Tunggakan**: Kelola berbagai jenis tunggakan santri
- **Detail Rincian**: Lihat detail lengkap tunggakan per santri
- **Pencatatan Pembayaran**: Catat pembayaran dengan berbagai metode (Cash, TF, Lembaga, Beasiswa)
- **Tracking Status**: Monitor status pembayaran (Total, Bayar, Kurang)
- **Riwayat Pembayaran**: Lihat riwayat lengkap pembayaran untuk setiap item tunggakan

### ⭐ Sistem Pembayaran Khusus
- **Pembayaran Khusus**: Kelola pembayaran khusus seperti UJBA, Guru Tugas, KKN, PLP/PPL, Skripsi, Wisuda
- **Filter Advanced**: Filter berdasarkan tahun ajaran, keterangan, dan status
- **Monitoring Detail**: Pantau pembayaran khusus dengan statistik lengkap
- **Export Data**: Kemampuan untuk export dan print laporan

### 📋 Laporan & Analisis
- **Laporan Detail**: Generate laporan pembayaran yang komprehensif
- **Multi-Tab Laporan**: Laporan untuk Tunggakan, Khusus, dan Uwaba
- **Filter Periode**: Filter berdasarkan tanggal, tahun ajaran, dan admin
- **Export & Print**: Export laporan ke format PDF atau langsung print
- **Summary Box**: Ringkasan total pembayaran dengan breakdown detail

### 👥 Manajemen Data Santri
- **Biodata Lengkap**: Kelola informasi lengkap santri (identitas, alamat, pendidikan)
- **Pencarian Cepat**: Cari santri berdasarkan ID atau nama
- **Update Data**: Update biodata santri dengan mudah
- **Integrasi WhatsApp**: Cek status nomor WhatsApp dan kirim pesan langsung
- **Riwayat Chat**: Track riwayat pesan WhatsApp yang dikirim ke santri

## Teknologi

Aplikasi ini dibangun menggunakan teknologi modern:

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: PHP dengan Slim Framework 4
- **Database**: MySQL
- **UI Framework**: Tailwind CSS
- **Icons**: Heroicons
- **Charts**: Chart.js
- **PWA Support**: Progressive Web App dengan manifest.json

## Keamanan

- **JWT Authentication**: Sistem login yang aman dengan JWT token
- **CSRF Protection**: Perlindungan terhadap Cross-Site Request Forgery
- **Input Validation**: Validasi dan sanitasi input di semua endpoint
- **Rate Limiting**: Membatasi percobaan login untuk mencegah brute force
- **Role-Based Authorization**: Kontrol akses berbasis role user
- **Production Error Handling**: Menyembunyikan detail error di production
- **Password Hashing**: Menggunakan bcrypt untuk keamanan password

## Struktur Navigasi

Aplikasi memiliki 5 tab navigasi utama:

1. **Dashboard** - Halaman utama dengan statistik dan monitoring
2. **Uwaba** - Sistem pembayaran bulanan
3. **Tunggakan** - Sistem pembayaran tunggakan
4. **Khusus** - Sistem pembayaran khusus
5. **Laporan** - Halaman laporan dan analisis

## Support

Untuk bantuan teknis atau pertanyaan, silakan hubungi tim IT pondok pesantren.

---

*Dikembangkan oleh Em Anam*`

function AboutModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tentang Aplikasi"
      icon="ℹ️"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{aboutContent}</ReactMarkdown>
    </Modal>
  )
}

export default AboutModal

