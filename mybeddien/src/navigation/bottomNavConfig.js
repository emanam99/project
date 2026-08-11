import { ACCESS_GROUP, resolveAccessGroupKeys } from '../config/accessGroups'
import { ACCESS_MODE, getHomePathForAccess } from '../config/accessMode'
import { isNavPathActive } from './navActive'
import {
  HomeIcon,
  BiodataIcon,
  RiwayatPembayaranIcon,
  BarangIcon,
  KasirIcon,
  RiwayatTransaksiIcon,
  LaporanIcon,
  GuruTugasIcon,
  MadrasahProfilIcon,
} from './navIcons'

/** Halaman menu lengkap (mobile) */
export const BOTTOM_NAV_MENU_PATH = '/menu'

/**
 * Navigasi bawah (mobile): modul aktif saja (tanpa Profil — ada di header).
 * Mode santri: Beranda, Biodata, Pembayaran, Laporan (GT).
 * Mode toko: Beranda, Kasir, Riwayat, Barang.
 * Mode PJGT: Beranda, Profil madrasah, Guru tugas, Laporan.
 *
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string | null | undefined} activeAccess
 * @param {{ isGuruTugas?: boolean }} [opts]
 */
export function getBottomNavItems(user, activeAccess, opts = {}) {
  const isGuruTugas = opts.isGuruTugas === true
  const keys = resolveAccessGroupKeys(user)
  const hasSantri = Boolean(user?.santri_id)
  const hasToko = user?.has_toko === true
  const hasPjgt = keys.has(ACCESS_GROUP.pjgt)

  const homePath = activeAccess ? getHomePathForAccess(activeAccess) : '/'

  if (activeAccess === ACCESS_MODE.pjgt && hasPjgt) {
    return [
      { path: homePath, label: 'Beranda', icon: HomeIcon },
      { path: '/pjgt/madrasah', label: 'Profil madrasah', icon: MadrasahProfilIcon },
      { path: '/pjgt/guru-tugas', label: 'Guru tugas', icon: GuruTugasIcon },
      { path: '/pjgt/laporan', label: 'Laporan', icon: LaporanIcon },
    ]
  }

  /** Mode santri: Beranda, Biodata, Pembayaran, Laporan — tanpa Profil (ada di header). */
  if (activeAccess === ACCESS_MODE.santri && hasSantri) {
    const items = [
      { path: homePath, label: 'Beranda', icon: HomeIcon },
      { path: '/santri/biodata', label: 'Biodata', icon: BiodataIcon },
      { path: '/santri/riwayat-pembayaran', label: 'Pembayaran', icon: RiwayatPembayaranIcon },
    ]
    if (isGuruTugas) {
      items.push({ path: '/santri/laporan-gt', label: 'Laporan GT', icon: LaporanIcon })
    }
    return items
  }

  /** Mode toko: tanpa Profil di nav bawah (profil lewat header). */
  if (activeAccess === ACCESS_MODE.toko && hasToko) {
    return [
      { path: homePath, label: 'Beranda', icon: HomeIcon },
      { path: '/toko/penjualan', label: 'Kasir', icon: KasirIcon },
      { path: '/toko/riwayat', label: 'Riwayat', icon: RiwayatTransaksiIcon },
      { path: '/toko/barang', label: 'Barang', icon: BarangIcon },
    ]
  }

  return [{ path: homePath, label: 'Beranda', icon: HomeIcon }]
}

/**
 * Urutan path bottom nav + menu (mobile swipe geser kanan):
 * Beranda → … → (Laporan jika GT) → Menu.
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string | null | undefined} activeAccess
 * @param {{ isGuruTugas?: boolean }} [opts]
 * @returns {string[]}
 */
export function getBottomNavPaths(user, activeAccess, opts = {}) {
  const items = getBottomNavItems(user, activeAccess, opts)
  return [...items.map((i) => i.path), BOTTOM_NAV_MENU_PATH]
}

/**
 * @param {string} pathname
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string | null | undefined} activeAccess
 * @param {{ isGuruTugas?: boolean }} [opts]
 * @returns {number} -1 jika tidak terpetakan
 */
export function getBottomNavTabIndex(pathname, user, activeAccess, opts = {}) {
  const paths = getBottomNavPaths(user, activeAccess, opts)
  for (let i = 0; i < paths.length; i++) {
    if (isBottomNavPathActive(pathname, paths[i])) return i
  }
  return -1
}

/**
 * Tab tetangga untuk swipe kiri/kanan.
 * @param {string} pathname
 * @param {1 | -1} delta
 */
export function getAdjacentBottomNavPath(pathname, delta, user, activeAccess, opts = {}) {
  const paths = getBottomNavPaths(user, activeAccess, opts)
  const idx = getBottomNavTabIndex(pathname, user, activeAccess, opts)
  if (idx < 0) return null
  const next = idx + delta
  if (next < 0 || next >= paths.length) return null
  return paths[next]
}

/**
 * @param {string} pathname
 * @param {string} path
 */
export function isBottomNavPathActive(pathname, path) {
  return isNavPathActive(pathname, path)
}
