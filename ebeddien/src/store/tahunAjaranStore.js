import { create } from 'zustand'

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

export const useTahunAjaranStore = create((set) => ({
  tahunAjaran: getDefaultTahunAjaran(),
  tahunAjaranMasehi: getDefaultTahunAjaranMasehi(),
  options: getFallbackHijriyah(),
  optionsMasehi: getFallbackMasehi(),

  setOptions: (options) => set({ options: Array.isArray(options) && options.length > 0 ? options : getFallbackHijriyah() }),
  setOptionsMasehi: (optionsMasehi) => set({ optionsMasehi: Array.isArray(optionsMasehi) && optionsMasehi.length > 0 ? optionsMasehi : getFallbackMasehi() }),
  
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
  }
}))

