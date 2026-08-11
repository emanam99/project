import type { WiridItem } from '../types/wirid'

export function groupByBab(rows: WiridItem[]) {
  const map = new Map<string, WiridItem[]>()
  rows.forEach((row) => {
    const key = row.bab?.trim() || '(Tanpa bab)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(row)
  })
  return Array.from(map.entries())
}
