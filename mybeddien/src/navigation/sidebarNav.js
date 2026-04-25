import { ACCESS_GROUP, resolveAccessGroupKeys } from '../config/accessGroups'

/**
 * Model sidebar: grup → item (path + label).
 * @param {Record<string, unknown> | null | undefined} user
 */
export function getSidebarGroups(user) {
  const keys = resolveAccessGroupKeys(user)
  const hasSantri = Boolean(user?.santri_id)
  const isTokoOnly = user?.has_toko === true && !user?.santri_id
  /** @type {{ id: string, label: string, items: { path: string, label: string }[] }[]} */
  const out = []

  if (keys.has(ACCESS_GROUP.workspace)) {
    out.push({
      id: ACCESS_GROUP.workspace,
      label: 'Workspace',
      items: [
        { path: '/', label: 'Beranda' },
        { path: '/profil', label: 'Profil' },
      ],
    })
  }

  if (keys.has(ACCESS_GROUP.santri) && hasSantri && !isTokoOnly) {
    out.push({
      id: ACCESS_GROUP.santri,
      label: 'Santri',
      items: [
        { path: '/santri/biodata', label: 'Biodata' },
        { path: '/santri/riwayat-pembayaran', label: 'Riwayat pembayaran' },
      ],
    })
  }

  if (keys.has(ACCESS_GROUP.wali_santri)) {
    out.push({
      id: ACCESS_GROUP.wali_santri,
      label: 'Wali santri',
      items: [{ path: '/wali-santri', label: 'Ringkasan' }],
    })
  }

  if (keys.has(ACCESS_GROUP.toko) && user?.has_toko === true) {
    out.push({
      id: ACCESS_GROUP.toko,
      label: 'Toko',
      items: [
        { path: '/toko', label: 'Dashboard toko' },
        { path: '/toko/barang', label: 'Data barang' },
      ],
    })
  }

  if (keys.has(ACCESS_GROUP.pjgt)) {
    out.push({
      id: ACCESS_GROUP.pjgt,
      label: 'PJGT',
      items: [{ path: '/pjgt', label: 'Beranda PJGT' }],
    })
  }

  return out
}
