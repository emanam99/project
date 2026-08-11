import type { MapelRow, KitabRow } from '../api/apiClient'

export function formatKitabLabel(k: Pick<KitabRow, 'fan' | 'nama' | 'musonnif'>) {
  let label = k.fan
  if (k.nama) label += ` — ${k.nama}`
  if (k.musonnif) label += ` · ${k.musonnif}`
  return label
}

export function formatMapelLabel(m: {
  fan?: string
  kitab?: string
  kitab_nama?: string
  musonnif?: string
  dari: string
  sampai: string
}) {
  const fan = m.fan || ''
  const kitab = m.kitab_nama || m.kitab || ''
  let label = fan
  if (kitab) label += ` — ${kitab}`
  if (m.dari || m.sampai) {
    label += ` (${m.dari || '…'} – ${m.sampai || '…'})`
  }
  return label
}

export function formatMapelBatas(m: Pick<MapelRow, 'dari' | 'sampai'>) {
  if (!m.dari && !m.sampai) return '—'
  return `${m.dari || '…'} – ${m.sampai || '…'}`
}
