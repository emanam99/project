/**
 * Judul header per rute (selaras pola eBeddien: grup + nama halaman).
 * Cocokkan dari yang paling spesifik dulu.
 * @param {string} pathname
 */
export function getRouteHeaderMeta(pathname) {
  const p = pathname || '/'

  if (p === '/') return { group: 'Workspace', title: 'Beranda' }
  if (p === '/profil') return { group: 'Workspace', title: 'Profil' }

  if (p.startsWith('/santri/biodata')) return { group: 'Santri', title: 'Biodata' }
  if (p.startsWith('/santri/riwayat-pembayaran/pendaftaran')) return { group: 'Santri', title: 'Riwayat — Pendaftaran' }
  if (p.startsWith('/santri/riwayat-pembayaran/uwaba')) return { group: 'Santri', title: 'Riwayat — UWABA' }
  if (p.startsWith('/santri/riwayat-pembayaran/khusus')) return { group: 'Santri', title: 'Riwayat — Khusus' }
  if (p.startsWith('/santri/riwayat-pembayaran/tunggakan')) return { group: 'Santri', title: 'Riwayat — Tunggakan' }
  if (p.startsWith('/santri/riwayat-pembayaran')) return { group: 'Santri', title: 'Riwayat pembayaran' }

  if (p.startsWith('/wali-santri')) return { group: 'Wali santri', title: 'Ringkasan' }
  if (p.startsWith('/toko/barang')) return { group: 'Toko', title: 'Data barang' }
  if (p.startsWith('/toko')) return { group: 'Toko', title: 'Dashboard toko' }
  if (p.startsWith('/pjgt')) return { group: 'PJGT', title: 'Beranda PJGT' }

  return { group: 'myBeddien', title: 'Halaman' }
}
