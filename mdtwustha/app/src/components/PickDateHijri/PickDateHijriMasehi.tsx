import { useEffect, useState } from 'react'
import PickDateHijri, { formatHijriDateDisplay, formatMasehiDateDisplay } from './PickDateHijri'
import { kalenderToMasehi, kalenderConvert } from '../../api/kalenderApi'
import { compareHijriYmd } from './buildMonthGrid'

export type DualDateValue = {
  masehi: string
  hijri: string
}

type Props = {
  label: string
  value: DualDateValue | null
  onChange: (value: DualDateValue | null) => void
  hijriMin?: string
  hijriMax?: string
  masehiMax?: string
  disabled?: boolean
  id?: string
}

/** Pilih tanggal lewat kalender Hijriyah; tampilkan & simpan pasangan Hijriyah + Masehi. */
export default function PickDateHijriMasehi({
  label,
  value,
  onChange,
  hijriMin,
  hijriMax,
  masehiMax,
  disabled = false,
  id,
}: Props) {
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')

  const handleHijriChange = async (hijri: string | null) => {
    setError('')
    if (!hijri) {
      onChange(null)
      return
    }
    setConverting(true)
    try {
      const res = await kalenderToMasehi(hijri)
      if (!res.masehi) {
        setError(res.error || 'Konversi ke Masehi gagal')
        return
      }
      if (masehiMax && res.masehi > masehiMax) {
        setError(`Tanggal melebihi batas (${formatMasehiDateDisplay(masehiMax)})`)
        return
      }
      onChange({ hijri, masehi: res.masehi })
    } catch {
      setError('Gagal konversi tanggal')
    } finally {
      setConverting(false)
    }
  }

  useEffect(() => {
    if (!value?.masehi || value.hijri) return
    let cancelled = false
    // Siang hari: pasangan tanggal kalender (bukan aturan Maghrib "hari ini")
    kalenderConvert(value.masehi, '12:00:00')
      .then((res) => {
        if (cancelled || !res.hijriyah || res.hijriyah === '0000-00-00') return
        onChange({ masehi: value.masehi, hijri: res.hijriyah.slice(0, 10) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [value?.masehi, value?.hijri, onChange])

  return (
    <div className="space-y-1.5">
      <span className="ui-label block">{label}</span>
      <PickDateHijri
        id={id}
        value={value?.hijri ?? null}
        onChange={handleHijriChange}
        min={hijriMin}
        max={hijriMax}
        disabled={disabled || converting}
        placeholder="Pilih tanggal Hijriyah"
      />
      {value && (
        <div className="rounded-lg border ui-divider bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5 text-sm space-y-1">
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="ui-text-muted shrink-0">Hijriyah:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {formatHijriDateDisplay(value.hijri)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="ui-text-muted shrink-0">Masehi:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {formatMasehiDateDisplay(value.masehi)}
            </span>
          </div>
        </div>
      )}
      {converting && <p className="text-xs ui-text-muted">Mengonversi tanggal…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function hijriMaxFromMasehi(hijriYmd: string | undefined, fallback?: string) {
  return hijriYmd || fallback
}

export function compareMasehiYmd(a: string, b: string) {
  return a.localeCompare(b)
}

export function formatMasehiYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayMasehi() {
  return formatMasehiYmd(new Date())
}

/** Tambah/kurang hari pada YYYY-MM-DD (lokal). */
export function addDaysMasehi(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  return formatMasehiYmd(dt)
}

/**
 * Batas max Masehi untuk filter rekap.
 * +1 hari: setelah Maghrib, tanggal Hijriyah sering sudah berganti lebih dulu.
 */
export function masehiMaxRekap() {
  return addDaysMasehi(todayMasehi(), 1)
}

export { compareHijriYmd, formatHijriDateDisplay, formatMasehiDateDisplay }
