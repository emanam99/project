import data from '../data/bulanHijri.json'

type BulanType = 'hijriyah_ar' | 'hijriyah' | 'masehi'

export function getBulanName(id: number | string, type: BulanType = 'hijriyah_ar'): string {
  const num = typeof id === 'string' ? parseInt(id, 10) : id
  const bulan = data.find((b) => b.id === num)
  if (!bulan) return `Bulan ${num}`
  return (bulan[type] as string) || bulan.hijriyah_ar
}
