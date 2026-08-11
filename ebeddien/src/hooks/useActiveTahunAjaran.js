import { useMemo } from 'react'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import {
  resolveActiveHijriyahTahunAjaranFromRows,
  resolveActiveTahunAjaranFromRows
} from '../utils/tahunAjaranActive'

/**
 * Tahun ajaran hijriyah aktif: rentang master (dari–sampai) yang mencakup hari ini (masehi).
 * Fallback ke pilihan header bila master belum dimuat.
 */
export function useActiveHijriyahTahunAjaran() {
  const header = useTahunAjaranStore((s) => s.tahunAjaran)
  const rows = useTahunAjaranStore((s) => s.hijriyahMasterRows)
  return useMemo(
    () => resolveActiveHijriyahTahunAjaranFromRows(rows) || header || '',
    [rows, header]
  )
}

/**
 * Tahun ajaran masehi aktif: rentang master kategori masehi yang mencakup hari ini.
 * Fallback ke pilihan header bila master belum dimuat.
 */
export function useActiveMasehiTahunAjaran() {
  const header = useTahunAjaranStore((s) => s.tahunAjaranMasehi)
  const rows = useTahunAjaranStore((s) => s.masehiMasterRows)
  return useMemo(
    () => resolveActiveTahunAjaranFromRows(rows) || header || '',
    [rows, header]
  )
}
