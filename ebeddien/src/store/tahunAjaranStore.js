import { create } from 'zustand'
import {
  hasSavedTahunAjaranHijriyah,
  hasSavedTahunAjaranMasehi,
  resolveActiveTahunAjaranFromRows,
  resolveActiveHijriyahTahunAjaranFromRows,
  getMasehiHariIniYmd
} from '../utils/tahunAjaranActive'
import { sortTahunAjaranOptionRowsAsc } from '../utils/tahunAjaranSort'

// Fallback jika API belum/tidak mengembalikan data (tetap tampil opsi dasar)
const getFallbackHijriyah = () => {
  const options = []
  for (let i = 0; i <= 5; i++) {
    const start = 1446 + i
    options.push({ value: `${start}-${start + 1}`, label: `${start}-${start + 1}` })
  }
  return options
}
const getFallbackMasehi = () => {
  const options = []
  for (let i = 0; i <= 5; i++) {
    const start = 2025 + i
    options.push({ value: `${start}-${start + 1}`, label: `${start}-${start + 1}` })
  }
  return options
}

// Get default tahun ajaran (current year)
const getDefaultTahunAjaran = () => {
  // Cek dari localStorage (menggunakan key yang sama dengan versi sebelumnya)
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tahun_ajaran') || localStorage.getItem('tahunAjaran')
    if (saved) {
      return saved
    }
  }
  // Default ke tahun ajaran saat ini (1446-1447)
  return '1446-1447'
}

// Get default tahun ajaran masehi
const getDefaultTahunAjaranMasehi = () => {
  // Cek dari localStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tahun_ajaran_masehi')
    if (saved) {
      return saved
    }
  }
  // Default ke 2025-2026
  return '2025-2026'
}

export const useTahunAjaranStore = create((set, get) => ({
  tahunAjaran: getDefaultTahunAjaran(),
  tahunAjaranMasehi: getDefaultTahunAjaranMasehi(),
  options: getFallbackHijriyah(),
  optionsMasehi: getFallbackMasehi(),
  hijriyahMasterRows: [],
  masehiMasterRows: [],

  setOptions: (options) =>
    set({
      options:
        Array.isArray(options) && options.length > 0
          ? sortTahunAjaranOptionRowsAsc(options)
          : getFallbackHijriyah()
    }),
  setOptionsMasehi: (optionsMasehi) =>
    set({
      optionsMasehi:
        Array.isArray(optionsMasehi) && optionsMasehi.length > 0
          ? sortTahunAjaranOptionRowsAsc(optionsMasehi)
          : getFallbackMasehi()
    }),

  /** Tahun ajaran hijriyah aktif menurut rentang master (bukan pilihan header). */
  getActiveHijriyahTahunAjaran: () => {
    return resolveActiveHijriyahTahunAjaranFromRows(get().hijriyahMasterRows) || ''
  },
  
  setTahunAjaran: (tahunAjaran) => {
    if (typeof window !== 'undefined') {
      // Simpan ke localStorage dengan key yang sama dengan versi sebelumnya
      localStorage.setItem('tahun_ajaran', tahunAjaran)
      // Juga simpan dengan key baru untuk kompatibilitas
      localStorage.setItem('tahunAjaran', tahunAjaran)
    }
    set({ tahunAjaran })
  },
  
  setTahunAjaranMasehi: (tahunAjaranMasehi) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tahun_ajaran_masehi', tahunAjaranMasehi)
    }
    set({ tahunAjaranMasehi })
  },

  /**
   * Setelah master tahun ajaran dimuat: jika belum ada di localStorage,
   * pilih baris yang rentang dari–sampai mencakup hari ini (masehi).
   */
  syncActiveFromMaster: (hijriyahRows, masehiRows) => {
    set({
      hijriyahMasterRows: Array.isArray(hijriyahRows) ? hijriyahRows : [],
      masehiMasterRows: Array.isArray(masehiRows) ? masehiRows : []
    })
    const today = getMasehiHariIniYmd()
    const state = useTahunAjaranStore.getState()

    if (!hasSavedTahunAjaranHijriyah()) {
      const ta = resolveActiveTahunAjaranFromRows(hijriyahRows, today)
      if (ta) state.setTahunAjaran(ta)
    }

    if (!hasSavedTahunAjaranMasehi()) {
      const ta = resolveActiveTahunAjaranFromRows(masehiRows, today)
      if (ta) state.setTahunAjaranMasehi(ta)
    }
  }
}))

