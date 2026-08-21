/**
 * Judul header per rute (selaras pola eBeddien: grup + nama halaman).
 * `icon` dipakai ikon header (HP & desktop) di samping judul halaman.
 * Cocokkan dari yang paling spesifik dulu.
 * @param {string} pathname
 * @returns {{ group: string, title: string, icon: string }}
 */
export function getRouteHeaderMeta(pathname) {
  const p = pathname || '/'

  if (p === '/') return { group: 'Workspace', title: 'Beranda', icon: 'home' }
  if (p === '/menu') return { group: 'Workspace', title: 'Menu', icon: 'menu' }
  if (p === '/profil') return { group: 'Workspace', title: 'Profil', icon: 'profil' }

  if (p.startsWith('/santri/biodata')) return { group: 'Santri', title: 'Biodata', icon: 'biodata' }
  if (p.startsWith('/santri/riwayat-ijin')) {
    return { group: 'Santri', title: 'Riwayat Ijin', icon: 'ijin' }
  }
  if (p.startsWith('/santri/shohifah')) {
    return { group: 'Santri', title: 'Shohifah', icon: 'ijin' }
  }
  if (p.startsWith('/santri/riwayat-pelanggaran')) {
    return { group: 'Santri', title: 'Riwayat Pelanggaran', icon: 'pelanggaran' }
  }
  if (p.startsWith('/santri/riwayat-pembayaran/pendaftaran')) {
    return { group: 'Santri', title: 'Riwayat — Pendaftaran', icon: 'riwayat' }
  }
  if (p.startsWith('/santri/riwayat-pembayaran/uwaba')) {
    return { group: 'Santri', title: 'Riwayat — UWABA', icon: 'riwayat' }
  }
  if (p.startsWith('/santri/riwayat-pembayaran/khusus')) {
    return { group: 'Santri', title: 'Riwayat — Khusus', icon: 'riwayat' }
  }
  if (p.startsWith('/santri/riwayat-pembayaran/tunggakan')) {
    return { group: 'Santri', title: 'Riwayat — Tunggakan', icon: 'riwayat' }
  }
  if (p.startsWith('/santri/riwayat-pembayaran')) {
    return { group: 'Santri', title: 'Pembayaran', icon: 'riwayat' }
  }
  if (p.startsWith('/santri/laporan-gt')) {
    return { group: 'Santri', title: 'Laporan GT', icon: 'pjgt-laporan' }
  }
  if (p.startsWith('/santri/kompas')) {
    return { group: 'Santri', title: 'KOMMPAS', icon: 'kompas' }
  }
  if (p.startsWith('/santri/e-rapor')) {
    return { group: 'Santri', title: 'eRapor', icon: 'erapor' }
  }
  if (p.startsWith('/santri/riwayat-diniyah-formal')) {
    return { group: 'Santri', title: 'Diniyah & Formal', icon: 'diniyah-formal' }
  }
  if (p.startsWith('/santri/riwayat-kamar')) {
    return { group: 'Santri', title: 'Riwayat Kamar', icon: 'riwayat-kamar' }
  }
  if (p.startsWith('/santri/cashless')) {
    return { group: 'Santri', title: 'Cashless', icon: 'cashless' }
  }
  if (p.startsWith('/santri/riwayat-lttq')) {
    return { group: 'Santri', title: 'Riwayat LTTQ', icon: 'lttq' }
  }

  if (p.startsWith('/wali-santri')) return { group: 'Wali santri', title: 'Ringkasan', icon: 'wali' }
  if (p.startsWith('/toko/penjualan')) return { group: 'Toko', title: 'Penjualan', icon: 'kasir' }
  if (p.startsWith('/toko/barang')) return { group: 'Toko', title: 'Data barang', icon: 'barang' }
  if (p.startsWith('/toko/saldo')) return { group: 'Toko', title: 'Saldo', icon: 'cashless' }
  if (p.startsWith('/toko/riwayat')) return { group: 'Toko', title: 'Riwayat transaksi', icon: 'riwayat' }
  if (p.startsWith('/toko')) return { group: 'Toko', title: 'Dashboard toko', icon: 'toko' }
  if (p.startsWith('/pjgt/guru-tugas')) return { group: 'PJGT', title: 'Riwayat Guru Tugas', icon: 'pjgt-guru-tugas' }
  if (p.startsWith('/pjgt/kompas')) return { group: 'PJGT', title: 'KOMMPAS', icon: 'kompas' }
  if (p.startsWith('/pjgt/laporan')) return { group: 'PJGT', title: 'Laporan PJGT', icon: 'pjgt-laporan' }
  if (p.startsWith('/pjgt/madrasah/edit')) return { group: 'PJGT', title: 'Ajukan edit profil', icon: 'pjgt-madrasah' }
  if (p.startsWith('/pjgt/madrasah')) return { group: 'PJGT', title: 'Profil madrasah', icon: 'pjgt-madrasah' }
  if (p.startsWith('/pjgt/dashboard')) return { group: 'PJGT', title: 'Dashboard', icon: 'pjgt' }
  if (p.startsWith('/pjgt')) return { group: 'PJGT', title: 'Dashboard', icon: 'pjgt' }

  return { group: 'myBeddien', title: 'Halaman', icon: 'fallback' }
}
