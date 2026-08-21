import { ACCESS_GROUP, resolveAccessGroupKeys } from '../config/accessGroups'
import { ACCESS_MODE, getHomePathForAccess } from '../config/accessMode'
import { BOTTOM_NAV_MENU_PATH } from './bottomNavConfig'

/**
 * Model sidebar: grup → item (path + label).
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string | null | undefined} activeAccess salah satu ACCESS_MODE — hanya menampilkan modul yang aktif
 * @param {{ isGuruTugas?: boolean }} [opts]
 */
export function getSidebarGroups(user, activeAccess, opts = {}) {
  const isGuruTugas = opts.isGuruTugas === true
  const keys = resolveAccessGroupKeys(user)
  const hasSantri = Boolean(user?.santri_id)
  /** @type {{ id: string, label: string, items: { path: string, label: string }[] }[]} */
  const out = []

  const berandaPath = activeAccess ? getHomePathForAccess(activeAccess) : '/'

  if (keys.has(ACCESS_GROUP.workspace)) {
    out.push({
      id: ACCESS_GROUP.workspace,
      label: 'Workspace',
      items: [
        { path: berandaPath, label: 'Beranda' },
        { path: '/profil', label: 'Profil' },
        { path: BOTTOM_NAV_MENU_PATH, label: 'Menu' },
      ],
    })
  }

  if (activeAccess === ACCESS_MODE.santri && keys.has(ACCESS_GROUP.santri) && hasSantri) {
    const santriItems = [
      { path: '/santri/biodata', label: 'Biodata' },
      { path: '/santri/riwayat-pembayaran', label: 'Pembayaran' },
      { path: '/santri/cashless', label: 'Cashless' },
    ]
    if (isGuruTugas) {
      santriItems.push(
        { path: '/santri/laporan-gt', label: 'Laporan GT' },
        { path: '/santri/kompas', label: 'KOMMPAS' }
      )
    }
    santriItems.push(
      { path: '/santri/e-rapor', label: 'eRapor' },
      { path: '/santri/riwayat-diniyah-formal', label: 'Diniyah & Formal' },
      { path: '/santri/riwayat-lttq', label: 'Riwayat LTTQ' },
      { path: '/santri/riwayat-kamar', label: 'Riwayat Kamar' },
      { path: '/santri/riwayat-ijin', label: 'Riwayat Ijin' },
      { path: '/santri/shohifah', label: 'Shohifah' },
      { path: '/santri/riwayat-pelanggaran', label: 'Riwayat Pelanggaran' }
    )
    out.push({
      id: ACCESS_GROUP.santri,
      label: 'Santri',
      items: santriItems,
    })
  }

  if (activeAccess === ACCESS_MODE.wali && keys.has(ACCESS_GROUP.wali_santri)) {
    out.push({
      id: ACCESS_GROUP.wali_santri,
      label: 'Wali santri',
      items: [{ path: '/wali-santri', label: 'Ringkasan' }],
    })
  }

  if (activeAccess === ACCESS_MODE.toko && keys.has(ACCESS_GROUP.toko) && user?.has_toko === true) {
    out.push({
      id: ACCESS_GROUP.toko,
      label: 'Toko',
      items: [
        { path: '/toko', label: 'Dashboard toko' },
        { path: '/toko/saldo', label: 'Saldo' },
        { path: '/toko/penjualan', label: 'Penjualan' },
        { path: '/toko/riwayat', label: 'Riwayat transaksi' },
        { path: '/toko/barang', label: 'Data barang' },
      ],
    })
  }

  if (activeAccess === ACCESS_MODE.pjgt && keys.has(ACCESS_GROUP.pjgt)) {
    out.push({
      id: ACCESS_GROUP.pjgt,
      label: 'PJGT',
      items: [
        { path: '/pjgt/dashboard', label: 'Dashboard' },
        { path: '/pjgt/madrasah', label: 'Profil madrasah' },
        { path: '/pjgt/guru-tugas', label: 'Guru tugas' },
        { path: '/pjgt/laporan', label: 'Laporan' },
        { path: '/pjgt/kompas', label: 'KOMMPAS' },
      ],
    })
  }

  return out
}
