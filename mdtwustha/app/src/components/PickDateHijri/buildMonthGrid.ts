export function buildHijriMonthGrid(monthData: {
  mulai?: string
  akhir?: string
  tahun?: number
  id_bulan?: string | number
} | null) {
  if (!monthData?.mulai || !monthData?.akhir) {
    return { emptyCount: 0, days: [] as Array<{ day: number; ymd: string }> }
  }
  const startDate = new Date(monthData.mulai)
  const endDate = new Date(monthData.akhir)
  const daysInMonth = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const emptyCount = startDate.getDay()
  const tahun = monthData.tahun != null ? Number(monthData.tahun) : null
  const idBulan = monthData.id_bulan != null ? Number(monthData.id_bulan) : null
  if (tahun == null || idBulan == null) {
    return { emptyCount: 0, days: [] }
  }
  const days: Array<{ day: number; ymd: string }> = []
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${tahun}-${String(idBulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ day: d, ymd })
  }
  return { emptyCount, days }
}

export function compareHijriYmd(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b)
}
