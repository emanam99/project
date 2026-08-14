import type { MapelRow, NilaiRekapCell, NilaiRekapRow } from '../api/apiClient'

/** Kolom tampilan disatukan per fan (mapel id bisa beda antar kelas). */
export type FanCol = {
  key: string
  label: string
  mapelIds: string[]
}

export function fanKeyOf(m: MapelRow): string {
  const fan = (m.fan || '').trim()
  return fan || `id:${m.id}`
}

/**
 * @param strict jika true dan kelas_ids kosong → dianggap tidak termasuk kelas
 *   (untuk filter kolom). Default non-strict agar resolve sel tetap aman.
 */
export function mapelAssignedToKelas(m: MapelRow, kelasId: string, strict = false): boolean {
  const kids = (m.kelas_ids || []).map(String)
  if (kids.length === 0) return !strict
  return kids.includes(String(kelasId))
}

/** Lengkapi kelas_ids dari baris nilai (nilai/absen terisi) bila belum ada. */
export function enrichMapelKelasIds(mapels: MapelRow[], rows: NilaiRekapRow[]): MapelRow[] {
  return mapels.map((m) => {
    const existing = (m.kelas_ids || []).map(String).filter(Boolean)
    if (existing.length > 0) return { ...m, kelas_ids: existing }
    const kids = new Set<string>()
    const mid = String(m.id)
    for (const b of rows) {
      const kid = String(b.kelas_id || '')
      if (!kid) continue
      const c = b.cells?.[mid]
      if (c && (c.nilai != null || c.absen)) kids.add(kid)
    }
    return { ...m, kelas_ids: Array.from(kids) }
  })
}

export function buildFanColumns(mapels: MapelRow[], kelasFilter = ''): FanCol[] {
  const filtered = kelasFilter
    ? mapels.filter((m) => mapelAssignedToKelas(m, kelasFilter, true))
    : mapels
  const order: string[] = []
  const byFan = new Map<string, FanCol>()
  for (const m of filtered) {
    const key = fanKeyOf(m)
    const existing = byFan.get(key)
    if (!existing) {
      byFan.set(key, {
        key,
        label: (m.fan || '').trim() || m.kitab_nama || m.id,
        mapelIds: [String(m.id)],
      })
      order.push(key)
    } else if (!existing.mapelIds.includes(String(m.id))) {
      existing.mapelIds.push(String(m.id))
    }
  }
  return order.map((k) => byFan.get(k)!)
}

/** Susun ulang kolom fan menurut daftar key (fan yang tidak ada di order tetap di akhir). */
export function applyFanOrder(cols: FanCol[], fanOrder: string[]): FanCol[] {
  if (!fanOrder.length) return cols
  const byKey = new Map(cols.map((c) => [c.key, c]))
  const out: FanCol[] = []
  for (const key of fanOrder) {
    const c = byKey.get(key)
    if (c) {
      out.push(c)
      byKey.delete(key)
    }
  }
  for (const c of byKey.values()) out.push(c)
  return out
}

/** Urutkan array mapel mengikuti urutan fan (untuk payload publish). */
export function reorderMapelByFanOrder(mapels: MapelRow[], fanOrder: string[]): MapelRow[] {
  const cols = applyFanOrder(buildFanColumns(mapels, ''), fanOrder)
  const used = new Set<string>()
  const out: MapelRow[] = []
  for (const col of cols) {
    for (const mid of col.mapelIds) {
      if (used.has(mid)) continue
      const m = mapels.find((x) => String(x.id) === mid)
      if (m) {
        out.push(m)
        used.add(mid)
      }
    }
  }
  for (const m of mapels) {
    const mid = String(m.id)
    if (!used.has(mid)) out.push(m)
  }
  return out
}

export function resolveMapelIdForRow(row: NilaiRekapRow, col: FanCol, mapels: MapelRow[]): string {
  const kid = String(row.kelas_id || '')
  const candidates = col.mapelIds.filter((mid) => {
    const m = mapels.find((x) => String(x.id) === mid)
    return m ? mapelAssignedToKelas(m, kid, false) : true
  })
  const pool = candidates.length > 0 ? candidates : col.mapelIds
  for (const mid of pool) {
    const c = row.cells?.[mid]
    if (c && (c.nilai != null || c.absen)) return mid
  }
  return pool[0] || col.mapelIds[0]
}

export function cellForFan(
  row: NilaiRekapRow,
  col: FanCol,
  mapels: MapelRow[]
): { mapelId: string; cell: NilaiRekapCell | null } {
  const mapelId = resolveMapelIdForRow(row, col, mapels)
  return { mapelId, cell: row.cells?.[mapelId] ?? null }
}
