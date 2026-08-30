import type { WiridItem, WiridBabMeta } from '../types/wirid'

const EMPTY_BAB_LABEL = '(Tanpa bab)'

/** Label bab konsisten untuk slug URL & pengelompokan. */
export function wiridBabLabel(bab: string | null | undefined): string {
  return bab?.trim() || EMPTY_BAB_LABEL
}

function sortItemsInBab(list: WiridItem[]): WiridItem[] {
  return [...list].sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id))
}

function babSortKey(babName: string, babOrder: Map<string, number>): number {
  if (babName === EMPTY_BAB_LABEL) return 10000
  return babOrder.get(babName) ?? 9999
}

/**
 * Kelompokkan wirid per bab; urutan bab dari metadata API (GET /bab), wirid dalam bab by `urutan`.
 */
export function groupByBab(rows: WiridItem[], babList?: WiridBabMeta[]) {
  const map = new Map<string, WiridItem[]>()
  rows.forEach((row) => {
    const key = wiridBabLabel(row.bab)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  })

  const babOrder = new Map<string, number>()
  if (babList?.length) {
    babList.forEach((b) => babOrder.set(b.nama, b.urutan))
  }

  const entries = Array.from(map.entries()).map(
    ([bab, list]) => [bab, sortItemsInBab(list)] as [string, WiridItem[]],
  )

  entries.sort((a, b) => {
    const oa = babSortKey(a[0], babOrder)
    const ob = babSortKey(b[0], babOrder)
    if (oa !== ob) return oa - ob
    return a[0].localeCompare(b[0], 'id')
  })

  return entries
}

/** Urutkan baris wirid sesuai metadata bab (untuk cache offline). */
export function sortWiridRows(rows: WiridItem[], babList: WiridBabMeta[]): WiridItem[] {
  const babOrder = new Map<string, number>()
  babList.forEach((b) => babOrder.set(b.nama, b.urutan))

  return [...rows].sort((a, b) => {
    const ba = wiridBabLabel(a.bab)
    const bb = wiridBabLabel(b.bab)
    const oa = babSortKey(ba, babOrder)
    const ob = babSortKey(bb, babOrder)
    if (oa !== ob) return oa - ob
    if (ba !== bb) return ba.localeCompare(bb, 'id')
    return (a.urutan - b.urutan) || (a.id - b.id)
  })
}

export function countBabWithEntries(babList: WiridBabMeta[], rows: WiridItem[]): number {
  if (babList.length > 0) {
    const withEntries = babList.filter((b) => b.jumlah_entri > 0).length
    if (withEntries > 0) return withEntries
  }
  return groupByBab(rows, babList).length
}
