import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import BiodataPendaftaran from './components/BiodataPendaftaran'
import PadukanDataLists from './components/PadukanDataLists'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

function PadukanData() {
  const [searchParams] = useSearchParams()
  const { showNotification } = useNotification()
  const col1Ref = useRef(null)
  const col2Ref = useRef(null)

  // Santri kiri (utama kandidat) & kanan (pembanding)
  const [santri1Nis, setSantri1Nis] = useState(() => {
    const nis = searchParams.get('nis')
    return nis && /^\d{7}$/.test(nis) ? nis : null
  })
  const [santri2Nis, setSantri2Nis] = useState(null)

  // Tab mobile: 'santri1' | 'santri2'
  const [activeTab, setActiveTab] = useState('santri1')
  const [isDesktop, setIsDesktop] = useState(false)

  // Search offcanvas: untuk kolom mana (kiri/kanan)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState('left') // 'left' | 'right'

  const [merging, setMerging] = useState(false)

  // Desktop = lg (1024px), mobile/tablet pakai tab
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Di mobile: tampilkan hanya kolom yang sesuai tab
  useEffect(() => {
    if (!col1Ref.current || !col2Ref.current) return
    if (isDesktop) {
      col1Ref.current.style.display = ''
      col2Ref.current.style.display = ''
    } else {
      col1Ref.current.style.display = activeTab === 'santri1' ? 'flex' : 'none'
      col2Ref.current.style.display = activeTab === 'santri2' ? 'flex' : 'none'
    }
  }, [isDesktop, activeTab])

  // Sync santri1 dari URL saat berubah
  useEffect(() => {
    const nis = searchParams.get('nis')
    if (nis && /^\d{7}$/.test(nis) && nis !== santri1Nis) {
      setSantri1Nis(nis)
    }
  }, [searchParams])

  const handleOpenSearch = (target) => {
    setSearchTarget(target)
    setIsSearchOpen(true)
  }

  const handleSelectSantriFromSearch = (id) => {
    if (searchTarget === 'left') {
      setSantri1Nis(id)
    } else {
      setSantri2Nis(id)
    }
    setIsSearchOpen(false)
  }

  const handleDataChangeLeft = (data) => {
    if (!data?.id || !/^\d{7}$/.test(data.id)) {
      if (santri1Nis) setSantri1Nis(null)
      return
    }
    if (data.id !== santri1Nis) setSantri1Nis(data.id)
  }

  const handleDataChangeRight = (data) => {
    if (!data?.id || !/^\d{7}$/.test(data.id)) {
      if (santri2Nis) setSantri2Nis(null)
      return
    }
    if (data.id !== santri2Nis) setSantri2Nis(data.id)
  }

  // Tentukan siapa utama & sekunder; lalu merge
  const handleMerge = async (utamaNis, sekunderNis) => {
    if (!utamaNis || !sekunderNis || utamaNis === sekunderNis) {
      showNotification('Pilih dua santri yang berbeda. Utama ≠ Sekunder.', 'error')
      return
    }
    const confirmMessage = `Padukan data NIS ${sekunderNis} ke NIS ${utamaNis}?\n\nData registrasi/berkas dari NIS ${sekunderNis} akan digabung ke NIS ${utamaNis}. Tindakan ini tidak dapat dibatalkan.`
    if (!window.confirm(confirmMessage)) return

    setMerging(true)
    try {
      const response = await pendaftaranAPI.mergeSantri(utamaNis, sekunderNis)
      if (response.success) {
        showNotification('Data berhasil dipadukan.', 'success')
        setSantri2Nis(null)
        // Refresh kolom kiri agar data terbaru
        setSantri1Nis(prev => prev)
      } else {
        showNotification(response.message || 'Gagal memadukan data', 'error')
      }
    } catch (error) {
      console.error('Error merge:', error)
      showNotification(error.response?.data?.message || 'Gagal memadukan data', 'error')
    } finally {
      setMerging(false)
    }
  }

  const canMerge = santri1Nis && santri2Nis && santri1Nis !== santri2Nis

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Tab Mobile: paling atas, tidak ikut scroll */}
      <div className="lg:hidden flex-shrink-0 flex bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 z-10">
        <button
          type="button"
          onClick={() => setActiveTab('santri1')}
          className={`flex-1 py-2.5 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'santri1'
              ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span>Santri 1</span>
          {santri1Nis && (
            <span className="text-xs opacity-80">({santri1Nis})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('santri2')}
          className={`flex-1 py-2.5 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'santri2'
              ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span>Santri 2</span>
          {santri2Nis && (
            <span className="text-xs opacity-80">({santri2Nis})</span>
          )}
        </button>
      </div>

      {/* Area yang bisa di-scroll: header + grid + tindakan + info */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1">
                Padukan Data Santri
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Bandingkan biodata dua santri, lalu padukan data yang duplikat ke satu NIS
              </p>
            </div>

            {/* Layout 2 kolom seperti halaman Pendaftaran (PC) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            {/* Kolom Kiri: Biodata Santri 1 */}
            <div ref={col1Ref} className="h-full min-h-[400px] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-teal-700 dark:text-teal-400">
                  Data Santri 1
                </h2>
              </div>
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
                <BiodataPendaftaran
                  externalSantriId={santri1Nis}
                  onOpenSearch={() => handleOpenSearch('left')}
                  onDataChange={handleDataChangeLeft}
                  onBiodataSaved={() => {}}
                />
              </div>
              <PadukanDataLists santriId={santri1Nis} />
            </div>

            {/* Kolom Kanan: Biodata Santri 2 (pembanding) */}
            <div ref={col2Ref} className="h-full min-h-[400px] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                  Data Santri 2 (Pembanding)
                </h2>
              </div>
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
                <BiodataPendaftaran
                  externalSantriId={santri2Nis}
                  onOpenSearch={() => handleOpenSearch('right')}
                  onDataChange={handleDataChangeRight}
                  onBiodataSaved={() => {}}
                />
              </div>
              <PadukanDataLists santriId={santri2Nis} />
            </div>
          </div>

          {/* Tindakan Padukan */}
          <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Tindakan Padukan
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Pilih data mana yang dipertahankan (utama). Data satunya akan digabungkan ke utama lalu ID sekunder dihapus.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => canMerge && handleMerge(santri1Nis, santri2Nis)}
                disabled={!canMerge || merging}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {merging ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memadukan...
                  </span>
                ) : (
                  `Jadikan Santri 1 (NIS ${santri1Nis || '?'}) Utama — padukan Santri 2 ke sini`
                )}
              </button>
              <button
                onClick={() => canMerge && handleMerge(santri2Nis, santri1Nis)}
                disabled={!canMerge || merging}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {merging ? null : (
                  `Jadikan Santri 2 (NIS ${santri2Nis || '?'}) Utama — padukan Santri 1 ke sini`
                )}
              </button>
            </div>
            {!canMerge && (santri1Nis || santri2Nis) && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                Isi kedua kolom dengan NIS santri yang berbeda untuk mengaktifkan tombol padukan.
              </p>
            )}
          </div>

          {/* Info singkat */}
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Cara menggunakan</h3>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
              <li>Kolom kiri: biodata santri pertama (bisa dari URL ?nis=... atau tombol Cari)</li>
              <li>Kolom kanan: cari santri lain untuk dibandingkan</li>
              <li>Setelah membandingkan, pilih salah satu tombol padukan (Santri 1 atau Santri 2 sebagai utama)</li>
            </ul>
          </div>
        </div>
      </div>
      </div>

      {/* Search Offcanvas - satu untuk kiri dan kanan */}
      {createPortal(
        <SearchOffcanvas
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectSantri={handleSelectSantriFromSearch}
        />,
        document.body
      )}
    </div>
  )
}

export default PadukanData
