import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { pendaftaranAPI, resetCsrfToken } from '../services/api'

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
  
  const handleLogout = () => {
    resetCsrfToken()
    logout()
    navigate('/login', { replace: true })
  }
  const [loading, setLoading] = useState(true)
  
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

  // Debug: Monitor berkasProgress changes
  useEffect(() => {
    console.log('=== berkasProgress State Changed ===')
    console.log('berkasProgress:', berkasProgress)
  }, [berkasProgress])

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

  useEffect(() => {
    console.log('========================================')
    console.log('🚀 Dashboard useEffect STARTED')
    console.log('User:', user)
    console.log('User ID:', user?.id)
    console.log('========================================')
    
    // Santri baru (id null) harus lewat: page 1 status pendaftar → page 2 opsi pendidikan → page 3 status santri
    if (user && (user.id == null || user.id === '')) {
      const hasChosenStatusPendaftar = typeof localStorage !== 'undefined' && (localStorage.getItem('daftar_status_pendaftar') === 'Baru' || localStorage.getItem('daftar_status_pendaftar') === 'Lama')
      if (!hasChosenStatusPendaftar) {
        navigate('/pilihan-status', { replace: true })
        return
      }
      const hasOpsiPendidikan = typeof localStorage !== 'undefined' && localStorage.getItem('daftar_diniyah') != null && localStorage.getItem('daftar_diniyah') !== '' && localStorage.getItem('daftar_formal') != null && localStorage.getItem('daftar_formal') !== ''
      if (!hasOpsiPendidikan) {
        navigate('/pilihan-opsi-pendidikan', { replace: true })
        return
      }
      const hasChosenStatusSantri = typeof localStorage !== 'undefined' && (localStorage.getItem('daftar_status_santri') === 'Mukim' || localStorage.getItem('daftar_status_santri') === 'Khoriji')
      if (!hasChosenStatusSantri) {
        navigate('/pilihan-status-santri', { replace: true })
        return
      }
    }

    const checkProgress = async () => {
      setLoading(true)
      try {
        const updatedSteps = [...steps]

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
          console.log('✅ User has ID, setting biodata as completed')
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
            
            // Get berkas yang sudah diupload
            console.log('=== Fetching Berkas ===')
            console.log('User ID:', user.id)
            
            let berkasResponse = null
            let uploadedBerkas = []
            
            try {
              berkasResponse = await pendaftaranAPI.getBerkasList(user.id)
              console.log('Berkas Response:', berkasResponse)
              
              const allBerkasFromServer = berkasResponse.success ? berkasResponse.data || [] : []
              uploadedBerkas = allBerkasFromServer.filter(b => !b.status_tidak_ada)
              console.log('Uploaded Berkas:', uploadedBerkas.length)
            } catch (error) {
              console.error('Error fetching berkas:', error)
              alert('Error fetching berkas: ' + error.message)
            }
            
            const allBerkasFromServer = berkasResponse?.success ? berkasResponse.data || [] : []
            const berkasNotAvailable = allBerkasFromServer.filter(b => b.status_tidak_ada == 1).map(b => b.jenis_berkas)
            
            // Hitung total berkas yang sudah ditangani (upload + tidak ada)
            const totalHandled = uploadedBerkas.length + berkasNotAvailable.length
            const totalRequired = allBerkasTypes.length
            
            console.log('=== Calculation ===')
            console.log('Total Handled:', totalHandled)
            console.log('Total Required:', totalRequired)
            console.log('Percentage:', ((totalHandled / totalRequired) * 100).toFixed(1) + '%')
            
            // Update berkas progress state
            const newProgress = {
              uploaded: uploadedBerkas.length,
              notAvailable: berkasNotAvailable.length,
              total: totalRequired
            }
            console.log('Setting berkasProgress to:', newProgress)
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
              
              console.log('=== Checking Pembayaran ===')
              console.log('Total Bayar:', bayar)
              
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
            console.error('Error checking pembayaran:', error)
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
                setKeteranganStatus(res.data.keterangan_status)
              } else {
                const reg = await pendaftaranAPI.getRegistrasi(user.id, tahunHijriyah, tahunMasehi)
                if (reg?.success && reg?.data?.keterangan_status != null) {
                  setKeteranganStatus(reg.data.keterangan_status)
                }
              }
            }
          } catch (error) {
            console.error('Error sync keterangan_status:', error)
          }
        } else {
          updatedSteps[0].status = 'in_progress'
        }

        setSteps(updatedSteps)
      } catch (error) {
        console.error('Error checking progress:', error)
      } finally {
        setLoading(false)
      }
    }

    checkProgress()
  }, [user?.id, tahunHijriyah, tahunMasehi])

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
              console.error('Error checking pembayaran in visibility change:', error)
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
                console.error('Error sync keterangan_status:', error)
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

  const completedSteps = steps.filter(s => s.status === 'completed').length
  const progressPercentage = (completedSteps / steps.length) * 100

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

        {/* Progress Bar */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 md:p-6 mb-8">
          {/* Desktop: Tampilkan header dengan label */}
          <div className="hidden md:flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Progress Pendaftaran
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded transition-colors"
                title="Refresh progress"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
          
          {/* Mobile: Tampilkan hanya persentase di atas progress bar */}
          <div className="md:hidden flex items-center justify-between mb-2">
            <span className="text-base font-semibold text-teal-600 dark:text-teal-400">
              {progressPercentage.toFixed(0)}%
            </span>
            <button
              onClick={() => window.location.reload()}
              className="p-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded transition-colors"
              title="Refresh progress"
            >
              🔄
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 md:h-3">
            <div 
              className="bg-gradient-to-r from-teal-500 to-teal-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          
          <div className="mt-2 space-y-2">
            {/* Desktop: Tampilkan "X dari Y selesai" */}
            <div className="hidden md:flex items-center justify-end">
              <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
                {completedSteps} dari {steps.length} selesai
              </span>
            </div>
            
            {/* Mobile: Tampilkan persentase di bawah progress bar */}
            <div className="md:hidden flex items-center justify-center">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {completedSteps}/{steps.length} langkah
              </span>
            </div>
            
            <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
              {progressPercentage === 100 
                ? '🎉 Selamat! Santri telah menyelesaikan semua tahap pendaftaran.'
                : 'Silakan ikuti langkah-langkah di bawah untuk menyelesaikan pendaftaran.'
              }
            </p>
          </div>
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

        {/* Gelombang Aktif Section */}
        <div className="mt-8 mb-8 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-6">
          <h3 className="font-semibold text-teal-900 dark:text-teal-100 mb-4 text-lg">
            Informasi Gelombang Pendaftaran
          </h3>
          
          {/* Gelombang Aktif */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-semibold text-teal-800 dark:text-teal-200">Gelombang Aktif:</span>
            </div>
            {gelombangAktif ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-teal-500 dark:border-teal-400">
                <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 mb-1">
                  Gelombang {gelombangAktif}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {formatTanggal(gelombang[gelombangAktif])}
                </div>
                <div className="mt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                    Gelombang Aktif
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-600">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Belum ada gelombang aktif
                </div>
              </div>
            )}
          </div>
          
          {/* List Gelombang 1-5 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm font-medium text-teal-800 dark:text-teal-200">Daftar Gelombang:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((num) => {
                const gelombangKey = String(num)
                const tanggalGelombang = gelombang[gelombangKey]
                const isAktif = gelombangAktif === gelombangKey
                
                return (
                  <div
                    key={num}
                    className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      isAktif
                        ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 shadow-sm'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isAktif
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium ${
                        isAktif
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {formatTanggal(tanggalGelombang)}
                      </div>
                    </div>
                    {isAktif && (
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500 text-white">
                          Aktif
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

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
