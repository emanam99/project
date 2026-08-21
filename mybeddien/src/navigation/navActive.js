/**
 * Aturan item nav aktif — dipakai Sidebar, BottomNav, MenuPage (selaras).
 */
export function isNavPathActive(pathname, path) {
  if (path === '/menu') return pathname === '/menu'
  if (path === '/profil') return pathname === '/profil'
  if (path === '/') return pathname === '/'
  if (path === '/wali-santri') return pathname === '/wali-santri'
  if (path === '/santri/riwayat-pembayaran') {
    return pathname === path || pathname.startsWith('/santri/riwayat-pembayaran/')
  }
  if (path === '/santri/riwayat-ijin') return pathname === '/santri/riwayat-ijin'
  if (path === '/santri/shohifah') return pathname === '/santri/shohifah'
  if (path === '/santri/riwayat-pelanggaran') return pathname === '/santri/riwayat-pelanggaran'
  if (path === '/toko/barang') return pathname === path || pathname.startsWith('/toko/barang')
  if (path === '/toko/penjualan') return pathname === path || pathname.startsWith('/toko/penjualan')
  if (path === '/toko/riwayat') return pathname === path || pathname.startsWith('/toko/riwayat')
  if (path === '/toko/saldo') return pathname === path || pathname.startsWith('/toko/saldo')
  if (path === '/toko') {
    return (
      pathname === '/toko' ||
      (pathname.startsWith('/toko/') &&
        !pathname.startsWith('/toko/barang') &&
        !pathname.startsWith('/toko/penjualan') &&
        !pathname.startsWith('/toko/riwayat') &&
        !pathname.startsWith('/toko/saldo'))
    )
  }
  if (path === '/pjgt/dashboard') return pathname === '/pjgt/dashboard'
  if (path === '/pjgt/madrasah') return pathname === '/pjgt/madrasah' || pathname.startsWith('/pjgt/madrasah/')
  if (path === '/pjgt/laporan') return pathname === path || pathname.startsWith('/pjgt/laporan')
  if (path === '/pjgt/guru-tugas') return pathname === path || pathname.startsWith('/pjgt/guru-tugas')
  if (path === '/pjgt/kompas') return pathname === path || pathname.startsWith('/pjgt/kompas')
  if (path === '/santri/laporan-gt') return pathname === path || pathname.startsWith('/santri/laporan-gt')
  if (path === '/santri/kompas') return pathname === path || pathname.startsWith('/santri/kompas')
  if (path === '/santri/e-rapor') return pathname === '/santri/e-rapor'
  if (path === '/santri/riwayat-diniyah-formal') return pathname === '/santri/riwayat-diniyah-formal'
  if (path === '/santri/riwayat-kamar') return pathname === '/santri/riwayat-kamar'
  if (path === '/santri/riwayat-lttq') return pathname === '/santri/riwayat-lttq'
  return pathname === path || pathname.startsWith(`${path}/`)
}
