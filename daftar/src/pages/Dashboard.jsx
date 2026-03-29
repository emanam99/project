import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { pendaftaranAPI } from '../services/api'
import { FEATURE_DAFTAR_WA_NOTIF_UI } from '../config/featureFlags'
import {
  getDashboardCacheKey,
  readDashboardCache,
  writeDashboardCache,
  dashboardCacheMatchesUser,
} from '../utils/dashboardLocalCache'

const NOMOR_WA_PENDAFTARAN = '6285123123399'

function dashboardIsValidId(id) {
  if (!id) return false
  const idStr = String(id).trim()
  const invalidValues = ['', 'null', 'undefined', '-', '0']
  return idStr !== '' && !invalidValues.includes(idStr) && id !== null && id !== undefined
}

function normalizeNomor(v) {
  if (!v) return ''
  const digits = String(v).replace(/\D/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (!digits.startsWith('62')) return '62' + digits
  return digits
}

// Helper function untuk format tanggal
const formatTanggal = (tanggal) => {
  if (!tanggal) return 'Belum diatur'
  try {
    const date = new Date(tanggal)
    return date.toLocaleDateString('id-ID', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  } catch (e) {
    return tanggal
  }
}

function Dashboard() {
  const { user, logout } = useAuthStore()
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran, getGelombangAktif, gelombang } = useTahunAjaranStore()
  const navigate = useNavigate()
  const gelombangAktif = getGelombangAktif()
  
  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const handleToggleNotifWa = (nomor62) => {
    if (!nomor62 || nomor62.length < 10) return
    setNotifWaLoading(nomor62)
    pendaftaranAPI.getWaWake().catch(() => {})
    const lines = ['Daftar Notifikasi']
    if (waFromBiodata.nama) lines.push(`Nama: ${waFromBiodata.nama}`)
    if (waFromBiodata.nik) lines.push(`NIK: ${waFromBiodata.nik}`)
    lines.push(`No WA: ${nomor62}`)
    const text = lines.join('\n')
    const url = `https://wa.me/${NOMOR_WA_PENDAFTARAN}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setNotifWaLoading(null)
  }

  const openNotifOffcanvas = () => {
    setNotifOffcanvasStep('pilih')
    setNotifOffcanvasChoice(null)
    setNotifOffcanvasNomor('')
    setNotifOffcanvasError('')
    setShowNotifOffcanvas(true)
  }

  const chooseNotifType = (type) => {
    setNotifOffcanvasChoice(type)
    const existing = type === 'telpon' ? waFromBiodata.noTelpon : waFromBiodata.noWaSantri
    setNotifOffcanvasNomor(existing ? existing.replace(/^62/, '0') : '')
    setNotifOffcanvasStep('input')
  }

  const submitNotifNomor = async () => {
    const nomor = normalizeNomor(notifOffcanvasNomor)
    if (nomor.length < 10) {
      setNotifOffcanvasError('Nomor minimal 10 digit')
      return
    }
    if (!user?.id) return
    setNotifOffcanvasError('')
    setNotifOffcanvasSaving(true)
    try {
      const res = await pendaftaranAPI.getBiodata(user.id)
      if (!res?.success || !res?.data) throw new Error('Gagal mengambil biodata')
      const biodata = res.data
      const payload = {
        ...biodata,
        id: String(user.id),
        email: (biodata.email || '').trim() || (user.email || ''),
        tahun_hijriyah: tahunHijriyah || '',
        tahun_masehi: tahunMasehi || ''
      }
      if (notifOffcanvasChoice === 'telpon') payload.no_telpon = nomor
      else payload.no_wa_santri = nomor
      const saveRes = await pendaftaranAPI.saveBiodata(payload)
      if (!saveRes?.success) throw new Error(saveRes?.message || 'Gagal menyimpan')
      setWaFromBiodata(prev => ({
        ...prev,
        noTelpon: notifOffcanvasChoice === 'telpon' ? nomor : prev.noTelpon,
        noWaSantri: notifOffcanvasChoice === 'wa_santri' ? nomor : prev.noWaSantri
      }))
      pendaftaranAPI.getWaWake().catch(() => {})
      const lines = ['Daftar Notifikasi']
      if (waFromBiodata.nama || biodata.nama) lines.push(`Nama: ${(biodata.nama || waFromBiodata.nama || '').trim()}`)
      if (waFromBiodata.nik || biodata.nik) lines.push(`NIK: ${(biodata.nik || waFromBiodata.nik || '').trim()}`)
      lines.push(`No WA: ${nomor}`)
      const text = lines.join('\n')
      const url = `https://wa.me/${NOMOR_WA_PENDAFTARAN}?text=${encodeURIComponent(text)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setShowNotifOffcanvas(false)
      setNotifOffcanvasStep('pilih')
      setNotifOffcanvasChoice(null)
      setNotifOffcanvasNomor('')
      setNotifOffcanvasError('')
      const next = { ...kontakStatus }
      if (notifOffcanvasChoice === 'telpon') next.telpon = { exists: true, siap_terima_notif: false }
      else next.waSantri = { exists: true, siap_terima_notif: false }
      setKontakStatus(next)
    } catch (e) {
      setNotifOffcanvasError(e?.message || 'Gagal menyimpan nomor')
    } finally {
      setNotifOffcanvasSaving(false)
    }
  }
  const [loading, setLoading] = useState(true)
  const [notifWaLoading, setNotifWaLoading] = useState(null) // id/nomor yang sedang diklik
  const [waFromBiodata, setWaFromBiodata] = useState({ noTelpon: '', noWaSantri: '', nama: '', nik: '' })
  const [kontakStatus, setKontakStatus] = useState({ telpon: null, waSantri: null }) // { exists, siap_terima_notif }
  const [showNotifOffcanvas, setShowNotifOffcanvas] = useState(false)
  const [notifOffcanvasStep, setNotifOffcanvasStep] = useState('pilih') // 'pilih' | 'input'
  const [notifOffcanvasChoice, setNotifOffcanvasChoice] = useState(null) // 'telpon' | 'wa_santri'
  const [notifOffcanvasNomor, setNotifOffcanvasNomor] = useState('')
  const [notifOffcanvasSaving, setNotifOffcanvasSaving] = useState(false)
  const [notifOffcanvasError, setNotifOffcanvasError] = useState('')

  // Load biodata (nomor WA user) dan status kontak
  useEffect(() => {
    if (!FEATURE_DAFTAR_WA_NOTIF_UI) {
      setWaFromBiodata({ noTelpon: '', noWaSantri: '', nama: '', nik: '' })
      setKontakStatus({ telpon: null, waSantri: null })
      return
    }
    if (!user?.id) {
      setWaFromBiodata({ noTelpon: '', noWaSantri: '', nama: '', nik: '' })
      setKontakStatus({ telpon: null, waSantri: null })
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await pendaftaranAPI.getBiodata(user.id)
        if (cancelled || !res?.success) return
        const data = res.data || res
        const noTelpon = normalizeNomor(data.no_telpon || '')
        const noWaSantri = normalizeNomor(data.no_wa_santri || '')
        setWaFromBiodata({
          noTelpon,
          noWaSantri,
          nama: (data.nama || user.nama || '').trim(),
          nik: (data.nik || user.nik || '').trim()
        })
        const next = { telpon: null, waSantri: null }
        if (noTelpon.length >= 10) {
          try {
            const k = await pendaftaranAPI.getWhatsAppKontakStatus(noTelpon)
            if (k?.success) next.telpon = { exists: !!k.exists, siap_terima_notif: !!k.siap_terima_notif }
          } catch (_) {}
        }
        if (noWaSantri.length >= 10) {
          try {
            const k = await pendaftaranAPI.getWhatsAppKontakStatus(noWaSantri)
            if (k?.success) next.waSantri = { exists: !!k.exists, siap_terima_notif: !!k.siap_terima_notif }
          } catch (_) {}
        }
        if (!cancelled) setKontakStatus(next)
      } catch (_) {
        if (!cancelled) setWaFromBiodata({ noTelpon: '', noWaSantri: '', nama: '', nik: '' })
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, user?.nama, user?.nik])

  // Load tahun ajaran saat mount
  useEffect(() => {
    loadTahunAjaran()
  }, [loadTahunAjaran])
  const [berkasProgress, setBerkasProgress] = useState({
    uploaded: 0,
    notAvailable: 0,
    total: 17
  })
  const [keteranganStatus, setKeteranganStatus] = useState(null)
  const dashboardHydratedFromCacheRef = useRef(false)

  const [steps, setSteps] = useState([
    {
      id: 1,
      title: 'Isi Biodata',
      status: 'pending', // pending, in_progress, completed
      path: '/biodata',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      id: 2,
      title: 'Upload Berkas',
      status: 'pending',
      path: '/berkas',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )
    },
    {
      id: 3,
      title: 'Pembayaran',
      status: 'pending',
      path: '/pembayaran',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    }
  ])
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  // Hydrasi dari localStorage (sama pola dengan Biodata): tampil instan, API menyusul di latar belakang.
  useLayoutEffect(() => {
    dashboardHydratedFromCacheRef.current = false
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    if (!user?.id || !dashboardIsValidId(user?.id)) {
      setLoading(true)
      return
    }
    const key = getDashboardCacheKey(user?.nik || sessionNik, user.id, tahunHijriyah, tahunMasehi)
    const pack = readDashboardCache(key)
    if (pack && dashboardCacheMatchesUser(pack.meta, user, sessionNik)) {
      setSteps((prev) => prev.map((s, i) => ({ ...s, status: pack.stepStatuses[i] ?? s.status })))
      setBerkasProgress(pack.berkasProgress)
      if (Object.prototype.hasOwnProperty.call(pack, 'keteranganStatus')) {
        setKeteranganStatus(pack.keteranganStatus)
      }
      dashboardHydratedFromCacheRef.current = true
      setLoading(false)
    } else {
      setLoading(true)
    }
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi])

  const fetchDashboardProgress = useCallback(async (forceRefresh = false) => {
      if (forceRefresh) {
        dashboardHydratedFromCacheRef.current = false
        setLoading(true)
      } else if (!dashboardHydratedFromCacheRef.current) {
        setLoading(true)
      }
      let progressForCache = { uploaded: 0, notAvailable: 0, total: 17 }
      let keteranganTouched = false
      let keteranganForCache = null

      try {
        const updatedSteps = stepsRef.current.map((s) => ({ ...s }))

        // Cek jika user belum terdaftar (id kosong) - tetap izinkan Isi Biodata
        if (!user?.id) {
          setKeteranganStatus('Belum Terdaftar')
          updatedSteps[0].status = 'in_progress' // Isi Biodata selalu tersedia, tidak pernah disabled
          updatedSteps[1].status = 'pending'
          updatedSteps[2].status = 'pending'
          setSteps(updatedSteps)
          setLoading(false)
          return
        }

        // Step 1: Cek biodata
        if (user?.id) {
          updatedSteps[0].status = 'completed'
          
          // Step 2: Cek berkas
          try {
            // Daftar semua jenis berkas yang ada
            const allBerkasTypes = [
              'Ijazah SD Sederajat',
              'Ijazah SMP Sederajat',
              'Ijazah SMA Sederajat',
              'SKL',
              'KTP Santri',
              'KTP Ayah',
              'KTP Ibu',
              'KTP Wali',
              'KK Santri',
              'KK Ayah',
              'KK Ibu',
              'KK Wali',
              'Akta Lahir',
              'KIP',
              'PKH',
              'KKS',
              'Kartu Bantuan Lain',
              'Surat Pindah'
            ]
            
            let berkasResponse = null
            let uploadedBerkas = []

            try {
              berkasResponse = await pendaftaranAPI.getBerkasList(user.id)
              const allBerkasFromServer = berkasResponse.success ? berkasResponse.data || [] : []
              uploadedBerkas = allBerkasFromServer.filter(b => !b.status_tidak_ada)
            } catch (error) {
              console.error('Error fetching berkas:', error)
            }
            
            const allBerkasFromServer = berkasResponse?.success ? berkasResponse.data || [] : []
            const berkasNotAvailable = allBerkasFromServer.filter(b => b.status_tidak_ada == 1).map(b => b.jenis_berkas)
            
            // Hitung total berkas yang sudah ditangani (upload + tidak ada)
            const totalHandled = uploadedBerkas.length + berkasNotAvailable.length
            const totalRequired = allBerkasTypes.length

            const newProgress = {
              uploaded: uploadedBerkas.length,
              notAvailable: berkasNotAvailable.length,
              total: totalRequired
            }
            progressForCache = newProgress
            setBerkasProgress(newProgress)
            
            // Jika semua berkas sudah ditangani (upload atau tandai tidak ada)
            if (totalHandled >= totalRequired) {
              updatedSteps[1].status = 'completed'
            } else if (uploadedBerkas.length > 0 || berkasNotAvailable.length > 0) {
              updatedSteps[1].status = 'in_progress'
            } else {
              updatedSteps[1].status = 'in_progress'
            }
          } catch (error) {
            console.error('Error checking berkas:', error)
            updatedSteps[1].status = 'in_progress'
          }

          // Step 3: Cek pembayaran
          // Pembayaran tersedia (in_progress) jika biodata + berkas sudah lengkap; completed jika sudah bayar >= 200000
          const biodataDone = updatedSteps[0].status === 'completed'
          const berkasDone = updatedSteps[1].status === 'completed'
          try {
            const registrasiResult = await pendaftaranAPI.getRegistrasi(
              user.id,
              tahunHijriyah,
              tahunMasehi
            )
            
            if (registrasiResult.success && registrasiResult.data) {
              const registrasi = registrasiResult.data
              const bayar = registrasi.bayar || 0

              if (bayar >= 200000) {
                updatedSteps[2].status = 'completed'
              } else if (bayar > 0) {
                updatedSteps[2].status = 'in_progress'
              } else if (biodataDone && berkasDone) {
                // Biodata dan berkas sudah lengkap → pembayaran tersedia (bisa diklik)
                updatedSteps[2].status = 'in_progress'
              } else {
                updatedSteps[2].status = 'pending'
              }
            } else {
              // Belum ada data registrasi: tetap tampilkan pembayaran tersedia jika biodata + berkas sudah lengkap
              updatedSteps[2].status = (biodataDone && berkasDone) ? 'in_progress' : 'pending'
            }
          } catch (error) {
            // getRegistrasi biasanya tidak throw (api.js mengembalikan success: false); ini cadangan.
            const status = error?.response?.status
            if (status !== 400 && status !== 404 && status !== 403) {
              console.error('Error checking pembayaran:', error)
            }
            updatedSteps[2].status = (biodataDone && berkasDone) ? 'in_progress' : 'pending'
          }
          
          // Sinkronkan keterangan_status di backend (pengecekan bayar & berkas ada di backend)
          try {
            if (tahunHijriyah && tahunMasehi) {
              const res = await pendaftaranAPI.syncKeteranganStatus({
                id_santri: user.id,
                tahun_hijriyah: tahunHijriyah,
                tahun_masehi: tahunMasehi
              })
              if (res?.success && res?.data?.keterangan_status != null) {
                keteranganTouched = true
                keteranganForCache = res.data.keterangan_status
                setKeteranganStatus(res.data.keterangan_status)
              } else {
                const reg = await pendaftaranAPI.getRegistrasi(user.id, tahunHijriyah, tahunMasehi)
                if (reg?.success && reg?.data?.keterangan_status != null) {
                  keteranganTouched = true
                  keteranganForCache = reg.data.keterangan_status
                  setKeteranganStatus(reg.data.keterangan_status)
                }
              }
            }
          } catch (error) {
            const st = error?.response?.status
            if (st !== 403 && st !== 401) {
              console.error('Error sync keterangan_status:', error)
            }
          }
        } else {
          updatedSteps[0].status = 'in_progress'
        }

        setSteps(updatedSteps)

        if (user?.id && dashboardIsValidId(user.id)) {
          const sessionNik =
            typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
          const cacheKey = getDashboardCacheKey(user?.nik || sessionNik, user.id, tahunHijriyah, tahunMasehi)
          const prevPack = readDashboardCache(cacheKey)
          writeDashboardCache(cacheKey, {
            v: 1,
            stepStatuses: updatedSteps.map((s) => s.status),
            berkasProgress: progressForCache,
            keteranganStatus: keteranganTouched
              ? keteranganForCache
              : (prevPack?.keteranganStatus ?? null),
            meta: {
              id_santri: String(user.id),
              nik_snapshot: String(user?.nik || sessionNik || '').trim(),
              tahun_hijriyah: tahunHijriyah ?? '',
              tahun_masehi: tahunMasehi ?? '',
            },
          })
        }
      } catch (error) {
        console.error('Error checking progress:', error)
      } finally {
        setLoading(false)
      }
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi])

  useEffect(() => {
    void fetchDashboardProgress(false)
  }, [fetchDashboardProgress])

  // Re-check progress saat halaman menjadi visible (user kembali dari tab/halaman lain)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && user?.id) {
        console.log('Dashboard visible, rechecking berkas progress...')
        
        // Re-check berkas saja untuk update badge
        try {
          const allBerkasTypes = [
            'Ijazah SD Sederajat',
            'Ijazah SMP Sederajat',
            'Ijazah SMA Sederajat',
            'SKL',
            'KTP Santri',
            'KTP Ayah',
            'KTP Ibu',
            'KTP Wali',
            'KK Santri',
            'KK Ayah',
            'KK Ibu',
            'KK Wali',
            'Akta Lahir',
            'KIP',
            'PKH',
            'KKS',
            'Kartu Bantuan Lain',
            'Surat Pindah'
          ]
          
          const berkasResponse = await pendaftaranAPI.getBerkasList(user.id)
          const allBerkasData = berkasResponse.success ? berkasResponse.data || [] : []
          const uploadedBerkas = allBerkasData.filter(b => !b.status_tidak_ada)
          const berkasNotAvailable = allBerkasData.filter(b => b.status_tidak_ada == 1).map(b => b.jenis_berkas)
          
          const totalHandled = uploadedBerkas.length + berkasNotAvailable.length
          const totalRequired = allBerkasTypes.length
          
          setBerkasProgress({
            uploaded: uploadedBerkas.length,
            notAvailable: berkasNotAvailable.length,
            total: totalRequired
          })
          
          console.log('=== Recheck Berkas Progress ===')
          console.log('Uploaded:', uploadedBerkas.length)
          console.log('Not Available:', berkasNotAvailable.length)
          console.log('Total Handled:', totalHandled, '/', totalRequired)
          console.log('Progress:', ((totalHandled / totalRequired) * 100).toFixed(1) + '%')
          
          // Update step status - async operations dilakukan di luar setSteps
          const updateStepsAsync = async () => {
            const updated = [...steps]
            
            // Update step 1 (berkas)
            if (totalHandled >= totalRequired) {
              updated[1].status = 'completed'
            } else if (uploadedBerkas.length > 0 || berkasNotAvailable.length > 0) {
              updated[1].status = 'in_progress'
            }
            
            const biodataDone = updated[0].status === 'completed'
            const berkasDone = updated[1].status === 'completed'
            
            // Cek pembayaran (step 3): tersedia jika biodata + berkas lengkap
            try {
              const registrasiResult = await pendaftaranAPI.getRegistrasi(user.id, tahunHijriyah, tahunMasehi)
              if (registrasiResult.success && registrasiResult.data) {
                const registrasi = registrasiResult.data
                const bayar = registrasi.bayar || 0
                if (bayar >= 200000) {
                  updated[2].status = 'completed'
                } else if (bayar > 0) {
                  updated[2].status = 'in_progress'
                } else if (biodataDone && berkasDone) {
                  updated[2].status = 'in_progress'
                } else {
                  updated[2].status = 'pending'
                }
              } else {
                updated[2].status = (biodataDone && berkasDone) ? 'in_progress' : 'pending'
              }
            } catch (error) {
              const st = error?.response?.status
              if (st !== 400 && st !== 404 && st !== 403) {
                console.error('Error checking pembayaran in visibility change:', error)
              }
              updated[2].status = (biodataDone && berkasDone) ? 'in_progress' : 'pending'
            }
            
            // Update steps
            setSteps(updated)
            
            // Sinkronkan keterangan_status di backend (pengecekan bayar & berkas ada di backend)
            if (tahunHijriyah && tahunMasehi) {
              try {
                const res = await pendaftaranAPI.syncKeteranganStatus({
                  id_santri: user.id,
                  tahun_hijriyah: tahunHijriyah,
                  tahun_masehi: tahunMasehi
                })
                if (res?.success && res?.data?.keterangan_status != null) {
                  setKeteranganStatus(res.data.keterangan_status)
                } else {
                  const reg = await pendaftaranAPI.getRegistrasi(user.id, tahunHijriyah, tahunMasehi)
                  if (reg?.success && reg?.data?.keterangan_status != null) {
                    setKeteranganStatus(reg.data.keterangan_status)
                  }
                }
              } catch (error) {
                const st = error?.response?.status
                if (st !== 403 && st !== 401) {
                  console.error('Error sync keterangan_status:', error)
                }
              }
            }
          }
          
          updateStepsAsync()
        } catch (error) {
          console.error('Error rechecking berkas:', error)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user?.id, tahunHijriyah, tahunMasehi])

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 border-green-500 text-white'
      case 'in_progress':
        return 'bg-blue-500 border-blue-500 text-white'
      case 'pending':
        return 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
      default:
        return 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Selesai'
      case 'in_progress':
        return 'Sedang Berlangsung'
      case 'pending':
        return 'Belum Dimulai'
      default:
        return 'Belum Dimulai'
    }
  }

  // Fungsi untuk mendapatkan warna badge berdasarkan keterangan_status
  const getKeteranganStatusBadgeColor = (keteranganStatus) => {
    if (!keteranganStatus) {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
    
    switch (keteranganStatus) {
      case 'Sudah Diverifikasi':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'Aktif':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'Belum Diverifikasi':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Belum Upload':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Belum Bayar':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'Belum Aktif':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'Melengkapi Data':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Upload Berkas':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Belum Terdaftar':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'in_progress':
        return (
          <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
      case 'pending':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return null
    }
  }

  // Teks keterangan menyesuaikan status
  const getTeksKeterangan = (status) => {
    switch (status) {
      case 'Belum Terdaftar':
        return 'Silakan isi biodata terlebih dahulu, lalu ikuti langkah-langkah di bawah untuk menyelesaikan pendaftaran.'
      case 'Melengkapi Data':
        return 'Lengkapi data Anda, lalu ikuti langkah-langkah di bawah untuk menyelesaikan pendaftaran.'
      case 'Upload Berkas':
      case 'Belum Upload':
        return 'Silakan upload berkas-berkas yang diperlukan sesuai langkah di bawah.'
      case 'Belum Bayar':
        return 'Lakukan pembayaran untuk menyelesaikan pendaftaran. Ikuti langkah pembayaran di bawah.'
      case 'Belum Diverifikasi':
        return 'Pendaftaran telah berhasil. Hanya tinggal menunggu admin mengecek data dan berkas.'
      case 'Sudah Diverifikasi':
        return 'Data Anda telah diverifikasi admin.'
      case 'Aktif':
        return 'Pendaftaran Anda selesai. Status Anda aktif.'
      case 'Belum Aktif':
        return 'Menunggu aktivasi dari admin. Silakan pantau informasi terbaru.'
      default:
        return 'Silakan ikuti langkah-langkah di bawah untuk menyelesaikan pendaftaran.'
    }
  }
  const teksKeterangan = getTeksKeterangan(keteranganStatus)

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow-sm p-3 md:p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2 gap-3">
            {keteranganStatus && (
              <div className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 shadow-md ${getKeteranganStatusBadgeColor(keteranganStatus)}`}>
                {keteranganStatus}
              </div>
            )}
            {!keteranganStatus && <div></div>}
            <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => void fetchDashboardProgress(true)}
              disabled={
                loading ||
                !user?.id ||
                !dashboardIsValidId(user.id) ||
                !tahunHijriyah ||
                !tahunMasehi
              }
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg transition-colors text-sm font-semibold inline-flex items-center gap-2 shadow-sm border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:pointer-events-none"
              title="Ambil ulang progres pendaftaran dari server"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Segarkan
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-semibold inline-flex items-center gap-2 shadow-md hover:shadow-lg"
              title="Keluar dari aplikasi"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log Out
            </button>
            </div>
          </div>
        </div>

        {/* Keterangan */}
        <div className="mb-8">
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            {teksKeterangan}
          </p>
        </div>

        {/* Steps - Timeline Style */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <div className="relative">
            {steps.map((step, index) => {
              const isCompleted = step.status === 'completed'
              // Isi Biodata (step 1) tidak pernah disabled: jika pending tetap dianggap in_progress agar bisa diklik
              const isBiodataStep = step.path === '/biodata'
              const isInProgress = step.status === 'in_progress' || (isBiodataStep && step.status === 'pending')
              const isActive = isCompleted || isInProgress
              const nextStep = steps[index + 1]
              const isNextActive = nextStep && (nextStep.status === 'completed' || nextStep.status === 'in_progress')
              
              return (
                <div key={step.id} className="relative pb-12 last:pb-0">
                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-6 top-12 w-0.5 h-full -ml-px">
                      <div className={`w-full transition-all duration-500 ${
                        isCompleted 
                          ? 'bg-gradient-to-b from-teal-500 to-teal-600 h-full' 
                          : isInProgress && isNextActive
                          ? 'bg-gradient-to-b from-blue-500 via-gray-300 to-gray-300 h-full'
                          : 'bg-gray-300 dark:bg-gray-700 h-full'
                      }`}></div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* Icon Circle */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/50'
                          : isInProgress
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/50 ring-4 ring-blue-100 dark:ring-blue-900/50'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }`}>
                        {isCompleted ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </div>
                      
                      {/* Badge Number */}
                      {!isCompleted && (
                        <div className={`absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isInProgress
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-400 dark:bg-gray-600 text-white'
                        }`}>
                          {index + 1}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-2">
                      <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
                        <h3 className={`text-xl font-bold transition-colors ${
                          isActive
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {step.title}
                        </h3>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                          isCompleted
                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300'
                            : isInProgress
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {getStatusText(step.status)}
                        </span>
                      </div>

                      {/* Action Button */}
                      <div className="mt-4">
                        {isCompleted ? (
                          <button
                            onClick={() => navigate(step.path)}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-teal-500 dark:hover:border-teal-500 text-gray-700 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 rounded-md transition-all text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Lihat / Edit
                          </button>
                        ) : isInProgress ? (
                          <button
                            onClick={() => navigate(step.path)}
                            className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white rounded-md transition-all text-xs font-semibold inline-flex items-center gap-1.5 shadow shadow-teal-500/30"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            Lanjutkan
                          </button>
                        ) : (
                          <button
                            disabled
                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 rounded-md text-xs font-semibold cursor-not-allowed inline-flex items-center gap-1.5 opacity-60"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Belum Tersedia
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nomor WA — hanya untuk santri yang sudah tersimpan (punya id/NIS) */}
        {user?.id && FEATURE_DAFTAR_WA_NOTIF_UI && (
        <>
        <section className="mt-8 mb-6 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/40 dark:to-gray-900 overflow-hidden shadow-sm">
          <div className="px-4 py-4 md:px-6 md:py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">WhatsApp Anda</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Nomor dari biodata (Wali / Santri) — aktifkan notifikasi untuk terima info pendaftaran</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Notifikasi dikirim ke nomor yang Anda pakai saat mendaftar. Jika mengaktifkan dari HP/nomor lain, kirim dari nomor yang ingin menerima notifikasi.</p>
              </div>
            </div>
            {(waFromBiodata.noTelpon && waFromBiodata.noTelpon.length >= 10) || (waFromBiodata.noWaSantri && waFromBiodata.noWaSantri.length >= 10) ? (
              <div className="space-y-4">
                {waFromBiodata.noTelpon && waFromBiodata.noTelpon.length >= 10 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/50 border border-emerald-200/60 dark:border-emerald-800/50">
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">No. Telpon (Wali)</p>
                      <a href={`https://wa.me/${waFromBiodata.noTelpon}`} target="_blank" rel="noopener noreferrer" className="text-base font-bold text-emerald-700 dark:text-emerald-300 hover:underline">
                        {waFromBiodata.noTelpon.replace(/^62/, '0')}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{kontakStatus.telpon?.siap_terima_notif ? 'Aktif' : 'Nonaktif'}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={kontakStatus.telpon?.siap_terima_notif}
                        onClick={() => handleToggleNotifWa(waFromBiodata.noTelpon)}
                        disabled={notifWaLoading !== null}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${kontakStatus.telpon?.siap_terima_notif ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${kontakStatus.telpon?.siap_terima_notif ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                )}
                {waFromBiodata.noWaSantri && waFromBiodata.noWaSantri.length >= 10 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/50 border border-emerald-200/60 dark:border-emerald-800/50">
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">No. WA Santri</p>
                      <a href={`https://wa.me/${waFromBiodata.noWaSantri}`} target="_blank" rel="noopener noreferrer" className="text-base font-bold text-emerald-700 dark:text-emerald-300 hover:underline">
                        {waFromBiodata.noWaSantri.replace(/^62/, '0')}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{kontakStatus.waSantri?.siap_terima_notif ? 'Aktif' : 'Nonaktif'}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={kontakStatus.waSantri?.siap_terima_notif}
                        onClick={() => handleToggleNotifWa(waFromBiodata.noWaSantri)}
                        disabled={notifWaLoading !== null}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${kontakStatus.waSantri?.siap_terima_notif ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${kontakStatus.waSantri?.siap_terima_notif ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={openNotifOffcanvas}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Aktifkan Notifikasi WA
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Offcanvas bawah: pilih nomor Wali/Santri → input → Simpan & Aktifkan */}
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${showNotifOffcanvas ? 'bg-black/50' : 'pointer-events-none opacity-0'}`}
          onClick={() => showNotifOffcanvas && setShowNotifOffcanvas(false)}
          aria-hidden="true"
        />
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl transition-transform duration-300 ease-out max-h-[85vh] overflow-hidden flex flex-col ${showNotifOffcanvas ? 'translate-y-0' : 'translate-y-full'}`}
          aria-modal="true"
          aria-labelledby="offcanvas-notif-title"
          role="dialog"
        >
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 id="offcanvas-notif-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {notifOffcanvasStep === 'pilih' ? 'Pilih nomor untuk notifikasi' : notifOffcanvasChoice === 'telpon' ? 'Nomor Wali Santri' : 'Nomor Santri'}
            </h2>
            <button
              type="button"
              onClick={() => setShowNotifOffcanvas(false)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {notifOffcanvasStep === 'pilih' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => chooseNotifType('telpon')}
                  className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-left transition-colors"
                >
                  <span className="font-semibold text-emerald-800 dark:text-emerald-200">Nomor Wali Santri</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">No. telepon wali yang terdaftar di biodata</p>
                </button>
                <button
                  type="button"
                  onClick={() => chooseNotifType('wa_santri')}
                  className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-left transition-colors"
                >
                  <span className="font-semibold text-emerald-800 dark:text-emerald-200">Nomor Santri</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">No. WA santri yang terdaftar di biodata</p>
                </button>
              </div>
            ) : (
                <div className="space-y-4">
                {notifOffcanvasError && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{notifOffcanvasError}</p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {notifOffcanvasChoice === 'telpon' ? 'No. Telpon Wali (WA)' : 'No. WA Santri'}
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={notifOffcanvasNomor}
                    onChange={(e) => { setNotifOffcanvasNomor((e.target.value || '').replace(/\D/g, '')); setNotifOffcanvasError('') }}
                    placeholder="08..."
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setNotifOffcanvasStep('pilih'); setNotifOffcanvasChoice(null); setNotifOffcanvasNomor(''); setNotifOffcanvasError('') }}
                    className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    onClick={submitNotifNomor}
                    disabled={notifOffcanvasSaving || (normalizeNomor(notifOffcanvasNomor).length < 10)}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    {notifOffcanvasSaving ? 'Menyimpan...' : 'Simpan & Aktifkan di WA'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {/* Gelombang Pendaftaran — rapi & informatif */}
        <section className="mt-6 mb-8 rounded-xl border border-teal-200/80 dark:border-teal-800/80 bg-gradient-to-b from-teal-50/80 to-white dark:from-teal-950/40 dark:to-gray-900 overflow-hidden shadow-sm">
          <div className="px-4 py-4 md:px-6 md:py-5 border-b border-teal-200/60 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-900/20">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-teal-500/15 dark:bg-teal-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-teal-900 dark:text-teal-100 text-base md:text-lg">
                  Gelombang Pendaftaran
                </h3>
                {(tahunHijriyah || tahunMasehi) && (
                  <p className="text-xs md:text-sm text-teal-700/80 dark:text-teal-300/80 mt-0.5">
                    Tahun ajaran {[tahunHijriyah, tahunMasehi].filter(Boolean).join(' / ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {/* Gelombang saat ini */}
            {gelombangAktif ? (
              <div className="mb-5 p-4 rounded-xl bg-teal-500/10 dark:bg-teal-500/15 border border-teal-300/60 dark:border-teal-600/50">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-teal-600 dark:text-teal-400">Gelombang saat ini</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-teal-500 text-white">Aktif</span>
                </div>
                <div className="text-xl md:text-2xl font-bold text-teal-800 dark:text-teal-200">
                  Gelombang {gelombangAktif}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Mulai {formatTanggal(gelombang[gelombangAktif])}
                </p>
              </div>
            ) : (
              <div className="mb-5 p-4 rounded-xl bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Belum ada gelombang aktif. Periode pendaftaran akan diumumkan kemudian.
                </p>
              </div>
            )}

            {/* Daftar semua gelombang */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Jadwal gelombang</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((num) => {
                  const gelombangKey = String(num)
                  const tanggalGelombang = gelombang[gelombangKey]
                  const isAktif = gelombangAktif === gelombangKey
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const tanggalObj = tanggalGelombang ? new Date(tanggalGelombang) : null
                  if (tanggalObj) tanggalObj.setHours(0, 0, 0, 0)
                  const isLewat = tanggalObj && today > tanggalObj && !isAktif
                  const isAkanDatang = tanggalObj && today < tanggalObj

                  return (
                    <div
                      key={num}
                      className={`rounded-lg border p-3 transition-all ${
                        isAktif
                          ? 'border-teal-400 dark:border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-1 ring-teal-200 dark:ring-teal-800'
                          : isLewat
                            ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 opacity-80'
                            : isAkanDatang
                              ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`text-sm font-bold ${isAktif ? 'text-teal-700 dark:text-teal-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          Gelombang {num}
                        </span>
                        {isAktif && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500 text-white">Aktif</span>
                        )}
                        {isLewat && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-400/80 text-white dark:bg-gray-600">Selesai</span>
                        )}
                        {isAkanDatang && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Akan datang</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {tanggalGelombang ? formatTanggal(tanggalGelombang) : '—'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Info Box */}
        <div className="mt-8 mb-8 md:mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Informasi Penting
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li>Pastikan semua data yang diisi adalah data yang valid dan benar</li>
                <li>Upload dokumen dengan format yang jelas dan mudah dibaca</li>
                <li>Lakukan pembayaran sesuai ketentuan (transfer atau pembayaran online)</li>
                <li>Jika ada kendala, silakan hubungi admin pendaftaran</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
        <div className="h-24 md:h-8"></div>
      </div>
    </div>
  )
}

export default Dashboard
