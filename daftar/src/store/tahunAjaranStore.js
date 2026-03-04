import { create } from 'zustand'
import { pengaturanAPI } from '../services/api'

const CACHE_KEY = 'tahun_ajaran_cache'
const CACHE_TIMESTAMP_KEY = 'tahun_ajaran_cache_timestamp'
const CACHE_DURATION = 5 * 60 * 1000 // 5 menit dalam milliseconds

export const useTahunAjaranStore = create((set, get) => ({
  tahunHijriyah: null,
  tahunMasehi: null,
  gelombang: {}, // { '1': '2025-01-15', '2': '2025-02-15', ... }
  loading: false,
  error: null,
  lastUpdated: null,

  // Load tahun ajaran dan gelombang dari API
  // Selalu fetch dari API untuk mendapatkan data terbaru
  loadTahunAjaran: async (forceRefresh = false) => {
    // Cek cache jika tidak force refresh
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY)
      const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY)
      
      if (cached && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp, 10)
        if (cacheAge < CACHE_DURATION) {
          try {
            const cachedData = JSON.parse(cached)
            set({ 
              tahunHijriyah: cachedData.tahunHijriyah,
              tahunMasehi: cachedData.tahunMasehi,
              gelombang: cachedData.gelombang || {},
              lastUpdated: parseInt(cacheTimestamp, 10)
            })
            // Load di background untuk update cache
            get().loadTahunAjaran(true)
            return
          } catch (e) {
            console.error('Error parsing cache:', e)
          }
        }
      }
    }

    set({ loading: true, error: null })
    try {
      // Selalu fetch dari API dengan timestamp untuk avoid cache
      const response = await pengaturanAPI.getAll()
      
      let data = []
      if (response) {
        if (response.success === true && response.data) {
          data = response.data
        } else if (Array.isArray(response)) {
          data = response
        } else if (response.data && Array.isArray(response.data)) {
          data = response.data
        }
      }

      const dataArray = Array.isArray(data) ? data : []
      
      // Extract tahun ajaran dan gelombang
      let tahunHijriyah = null
      let tahunMasehi = null
      const gelombang = {}

      dataArray.forEach(setting => {
        if (setting && setting.key) {
          if (setting.key === 'tahun_hijriyah') {
            tahunHijriyah = setting.value || null
          } else if (setting.key === 'tahun_masehi') {
            tahunMasehi = setting.value || null
          } else if (setting.key.startsWith('gelombang_')) {
            const gelombangNum = setting.key.replace('gelombang_', '')
            gelombang[gelombangNum] = setting.value || null
          }
        }
      })

      // Jika API tidak mengembalikan data, coba fallback ke localStorage
      if (!tahunHijriyah) {
        tahunHijriyah = localStorage.getItem('tahun_ajaran') || null
      }
      if (!tahunMasehi) {
        tahunMasehi = localStorage.getItem('tahun_ajaran_masehi') || null
      }

      // Simpan ke localStorage untuk fallback
      if (tahunHijriyah) {
        localStorage.setItem('tahun_ajaran', tahunHijriyah)
      }
      if (tahunMasehi) {
        localStorage.setItem('tahun_ajaran_masehi', tahunMasehi)
      }

      // Simpan ke cache dengan timestamp
      const cacheData = {
        tahunHijriyah,
        tahunMasehi,
        gelombang
      }
      const now = Date.now()
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
      localStorage.setItem(CACHE_TIMESTAMP_KEY, now.toString())

      set({ 
        tahunHijriyah, 
        tahunMasehi, 
        gelombang,
        loading: false,
        lastUpdated: now
      })
    } catch (error) {
      console.error('Error loading tahun ajaran:', error)
      
      // Fallback ke localStorage jika error
      const fallbackHijriyah = localStorage.getItem('tahun_ajaran')
      const fallbackMasehi = localStorage.getItem('tahun_ajaran_masehi')
      
      // Jika ada data di cache, gunakan itu
      const cached = localStorage.getItem(CACHE_KEY)
      let cachedGelombang = {}
      if (cached) {
        try {
          const cachedData = JSON.parse(cached)
          cachedGelombang = cachedData.gelombang || {}
        } catch (e) {
          console.error('Error parsing cache:', e)
        }
      }
      
      set({ 
        tahunHijriyah: fallbackHijriyah,
        tahunMasehi: fallbackMasehi,
        gelombang: cachedGelombang,
        loading: false,
        error: error.message 
      })
    }
  },

  // Force refresh - hapus cache dan load ulang
  refreshTahunAjaran: async () => {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_TIMESTAMP_KEY)
    await get().loadTahunAjaran(true)
  },

  // Get gelombang aktif berdasarkan tanggal saat ini
  getGelombangAktif: () => {
    const { gelombang } = get()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Cek dari gelombang 1 sampai 5
    for (let i = 1; i <= 5; i++) {
      const gelombangKey = String(i)
      const tanggalGelombang = gelombang[gelombangKey]
      
      if (tanggalGelombang) {
        const tanggal = new Date(tanggalGelombang)
        tanggal.setHours(0, 0, 0, 0)
        
        if (today >= tanggal) {
          // Cek apakah ada gelombang berikutnya yang lebih baru
          let isLatest = true
          for (let j = i + 1; j <= 5; j++) {
            const nextGelombangKey = String(j)
            const nextTanggal = gelombang[nextGelombangKey]
            if (nextTanggal) {
              const nextDate = new Date(nextTanggal)
              nextDate.setHours(0, 0, 0, 0)
              if (today >= nextDate) {
                isLatest = false
                break
              }
            }
          }
          
          if (isLatest) {
            return gelombangKey
          }
        }
      }
    }

    return null
  },

  // Get list gelombang yang tersedia (yang sudah lewat atau aktif)
  getGelombangTersedia: () => {
    const { gelombang } = get()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tersedia = []
    for (let i = 1; i <= 5; i++) {
      const gelombangKey = String(i)
      const tanggalGelombang = gelombang[gelombangKey]
      
      if (tanggalGelombang) {
        const tanggal = new Date(tanggalGelombang)
        tanggal.setHours(0, 0, 0, 0)
        
        // Jika tanggal sudah lewat atau sama dengan hari ini
        if (today >= tanggal) {
          tersedia.push({
            value: gelombangKey,
            label: `Gelombang ${gelombangKey}`,
            tanggal: tanggalGelombang
          })
        }
      }
    }

    return tersedia
  }
}))
