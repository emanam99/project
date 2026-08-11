import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import BiodataPendaftaran from './BiodataPendaftaran'
import PadukanDataLists from './PadukanDataLists'
import SearchOffcanvas from '../../../components/Biodata/SearchOffcanvas'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

/**
 * Isi halaman Padukan Data — dipakai route penuh dan offcanvas Analisis.
 * @param {{ variant?: 'page'|'embed', syncUrlNis?: boolean, initialSantri1Nis?: string|null, initialSantri2Nis?: string|null, onMergeSuccess?: () => void }} props
 */
export default function PadukanDataWorkspace({
  variant = 'page',
  syncUrlNis = true,
  initialSantri1Nis = null,
  initialSantri2Nis = null,
  onMergeSuccess,
}) {
  const [searchParams] = useSearchParams()
  const { showNotification } = useNotification()
  const col1Ref = useRef(null)
  const col2Ref = useRef(null)

  const isEmbed = variant === 'embed'
  const modalOverlayZ = isEmbed ? 'z-[10060]' : 'z-[100]'
  const searchZIndex = isEmbed ? 10070 : 130

  // Santri kiri (utama kandidat) & kanan (pembanding)
  const [santri1Nis, setSantri1Nis] = useState(() => {
    if (initialSantri1Nis && /^\d{7}$/.test(String(initialSantri1Nis))) return String(initialSantri1Nis)
    if (syncUrlNis) {
      const nis = searchParams.get('nis')
      return nis && /^\d{7}$/.test(nis) ? nis : null
    }
    return null
  })
  const [santri2Nis, setSantri2Nis] = useState(() =>
    initialSantri2Nis && /^\d{7}$/.test(String(initialSantri2Nis)) ? String(initialSantri2Nis) : null
  )

  // Tab mobile: 'santri1' | 'santri2'
  const [activeTab, setActiveTab] = useState('santri1')
  const [isDesktop, setIsDesktop] = useState(false)

  // Search offcanvas: untuk kolom mana (kiri/kanan)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState('left') // 'left' | 'right'

  const [merging, setMerging] = useState(false)
  /** Naikkan setelah merge sukses agar BiodataPendaftaran remount & muat ulang dari API (hindari cache lama). */
  const [biodataPanelEpoch, setBiodataPanelEpoch] = useState(0)
  const bumpBiodataPanels = () => setBiodataPanelEpoch((e) => e + 1)

  /** Modal padukan biodata: pilih strategi + penanganan NIK */
  const [biodataModal, setBiodataModal] = useState({ open: false, idUtama: null })
  const [biodataForm, setBiodataForm] = useState({
    biodata_strategy: 'fill_empty',
    nik_resolution: 'auto',
  })

  // Dua kolom dari md (768px) ke atas — tab hanya di layar sempit (HP), bukan laptop/PC kecil
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
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

  // Sync santri1 dari URL saat berubah (hanya mode halaman)
  useEffect(() => {
    if (!syncUrlNis) return
    const nis = searchParams.get('nis')
    if (nis && /^\d{7}$/.test(nis) && nis !== santri1Nis) {
      setSantri1Nis(nis)
    }
  }, [searchParams, syncUrlNis, santri1Nis])

  // Mode embed/offcanvas: pasangan awal dari props (Analisis)
  useEffect(() => {
    if (syncUrlNis) return
    if (initialSantri1Nis && /^\d{7}$/.test(String(initialSantri1Nis))) {
      setSantri1Nis(String(initialSantri1Nis))
    }
    if (initialSantri2Nis && /^\d{7}$/.test(String(initialSantri2Nis))) {
      setSantri2Nis(String(initialSantri2Nis))
    }
  }, [syncUrlNis, initialSantri1Nis, initialSantri2Nis])

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

  const sekunderDariUtama = (utamaNis) => (utamaNis === santri1Nis ? santri2Nis : santri1Nis)

  const handleMergeSection = async (mode, idUtama, action = 'move') => {
    const idSekunder = sekunderDariUtama(idUtama)
    if (!idUtama || !idSekunder || idUtama === idSekunder) {
      showNotification('Pilih dua santri yang berbeda.', 'error')
      return
    }
    const verb = action === 'copy' ? 'Salin' : 'Pindah'
    if (!window.confirm(`${verb} bagian «${mode}» dari NIS ${idSekunder} ke NIS ${idUtama}?\n\nAkun NIS ${idSekunder} tidak dihapus (kecuali padukan penuh).`)) return

    setMerging(true)
    try {
      const response = await pendaftaranAPI.mergeSantri(idUtama, idSekunder, { mode, action })
      if (response.success) {
        showNotification(response.message || 'Bagian berhasil dipadukan.', 'success')
        bumpBiodataPanels()
        onMergeSuccess?.()
      } else {
        showNotification(response.message || 'Gagal memadukan data', 'error')
      }
    } catch (error) {
      const st = error.response?.status
      const msg = error.response?.data?.message
      console.error('Error merge section:', st ?? error.message, msg || error)
      showNotification(msg || (st === 404 ? 'Endpoint tidak ditemukan (404). Pastikan API server sudah di-deploy versi dengan padukan data.' : 'Gagal memadukan data'), 'error')
    } finally {
      setMerging(false)
    }
  }

  const handleBulkMerge = async (utamaNis, sekunderNis, bulkMode) => {
    if (!utamaNis || !sekunderNis || utamaNis === sekunderNis) {
      showNotification('Pilih dua santri yang berbeda.', 'error')
      return
    }
    const isCopy = bulkMode === 'bulk_all_copy'
    const msg = isCopy
      ? `Salin semua bagian yang boleh disalin dari NIS ${sekunderNis} ke NIS ${utamaNis}?\n\nRegistrasi, UWABA, dan sejenisnya tidak disalin (hanya pindah manual).`
      : `Pindahkan semua bagian data (kecuali padukan penuh/hapus duplikat) dari NIS ${sekunderNis} ke NIS ${utamaNis}?`
    if (!window.confirm(msg)) return

    setMerging(true)
    try {
      const response = await pendaftaranAPI.mergeSantri(utamaNis, sekunderNis, {
        mode: bulkMode,
        biodata_strategy: biodataForm.biodata_strategy,
        nik_resolution: biodataForm.nik_resolution,
      })
      if (response.success) {
        showNotification(response.message || 'Bulk padukan berhasil.', 'success')
        bumpBiodataPanels()
        onMergeSuccess?.()
      } else {
        showNotification(response.message || 'Gagal memadukan data', 'error')
      }
    } catch (error) {
      const msg = error.response?.data?.message
      showNotification(msg || 'Gagal memadukan data', 'error')
    } finally {
      setMerging(false)
    }
  }

  const openBiodataModal = (idUtama) => {
    const idSekunder = sekunderDariUtama(idUtama)
    if (!idUtama || !idSekunder || idUtama === idSekunder) {
      showNotification('Pilih dua santri yang berbeda.', 'error')
      return
    }
    setBiodataModal({ open: true, idUtama })
  }

  const closeBiodataModal = () => {
    setBiodataModal({ open: false, idUtama: null })
  }

  const handleBiodataModalConfirm = async () => {
    const idUtama = biodataModal.idUtama
    const idSekunder = sekunderDariUtama(idUtama)
    if (!idUtama || !idSekunder) return
    if (!window.confirm(`Terapkan biodata dari NIS ${idSekunder} ke NIS ${idUtama} sesuai pilihan strategi & NIK?`)) return

    setMerging(true)
    try {
      const response = await pendaftaranAPI.mergeSantri(idUtama, idSekunder, {
        mode: 'biodata',
        biodata_strategy: biodataForm.biodata_strategy,
        nik_resolution: biodataForm.nik_resolution,
      })
      if (response.success) {
        showNotification(response.message || 'Biodata berhasil dipadukan.', 'success')
        closeBiodataModal()
        bumpBiodataPanels()
        onMergeSuccess?.()
      } else {
        showNotification(response.message || 'Gagal memadukan biodata', 'error')
      }
    } catch (error) {
      const st = error.response?.status
      const msg = error.response?.data?.message
      console.error('Error merge biodata:', st ?? error.message, msg || error)
      showNotification(msg || (st === 404 ? 'Endpoint tidak ditemukan (404). Pastikan API server sudah di-deploy versi dengan padukan data.' : 'Gagal memadukan biodata'), 'error')
    } finally {
      setMerging(false)
    }
  }

  /** Padukan penuh: semua langkah + hapus santri sekunder */
  const handleMergeFull = async (utamaNis, sekunderNis) => {
    if (!utamaNis || !sekunderNis || utamaNis === sekunderNis) {
      showNotification('Pilih dua santri yang berbeda. Utama ≠ Sekunder.', 'error')
      return
    }
    const confirmMessage = `PADUKAN PENUH: gabungkan semua data NIS ${sekunderNis} ke NIS ${utamaNis}, lalu hapus akun NIS ${sekunderNis}?\n\nTindakan ini tidak dapat dibatalkan. Untuk kontrol per bagian (termasuk biodata & NIK), gunakan kotak di atas.`
    if (!window.confirm(confirmMessage)) return

    setMerging(true)
    try {
      const response = await pendaftaranAPI.mergeSantri(utamaNis, sekunderNis, {
        mode: 'full',
        biodata_strategy: biodataForm.biodata_strategy,
        nik_resolution: biodataForm.nik_resolution,
      })
      if (response.success) {
        showNotification('Data berhasil dipadukan (penuh).', 'success')
        setSantri2Nis(null)
        bumpBiodataPanels()
        onMergeSuccess?.()
      } else {
        showNotification(response.message || 'Gagal memadukan data', 'error')
      }
    } catch (error) {
      const st = error.response?.status
      const msg = error.response?.data?.message
      console.error('Error merge full:', st ?? error.message, msg || error)
      showNotification(msg || (st === 404 ? 'Endpoint tidak ditemukan (404). Pastikan API server sudah di-deploy versi dengan padukan data.' : 'Gagal memadukan data'), 'error')
    } finally {
      setMerging(false)
    }
  }

  const canMerge = santri1Nis && santri2Nis && santri1Nis !== santri2Nis

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Tab Mobile: paling atas, tidak ikut scroll */}
      <div className="md:hidden flex-shrink-0 flex bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 z-10">
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
              {isEmbed ? (
                <>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
                    Padukan data (pasangan terpilih)
                  </h2>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Kolom kiri/teal = Santri 1 · kanan/biru = Santri 2. Cari santri lain tetap lewat ikon cari di biodata.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1">
                    Padukan Data Santri
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Bandingkan biodata dua santri, lalu padukan data yang duplikat ke satu NIS
                  </p>
                </>
              )}
            </div>

            {/* Layout 2 kolom seperti halaman Pendaftaran (PC) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
            {/* Kolom Kiri: Biodata Santri 1 */}
            <div ref={col1Ref} className={`h-full overflow-hidden flex flex-col ${isEmbed ? 'min-h-[280px]' : 'min-h-[400px]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-teal-700 dark:text-teal-400">
                  Data Santri 1
                </h2>
              </div>
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
                <BiodataPendaftaran
                  key={`padukan-bio1-${santri1Nis ?? 'x'}-${biodataPanelEpoch}`}
                  externalSantriId={santri1Nis}
                  onOpenSearch={() => handleOpenSearch('left')}
                  onDataChange={handleDataChangeLeft}
                  onBiodataSaved={() => {}}
                />
              </div>
            </div>

            {/* Kolom Kanan: Biodata Santri 2 (pembanding) */}
            <div ref={col2Ref} className={`h-full overflow-hidden flex flex-col ${isEmbed ? 'min-h-[280px]' : 'min-h-[400px]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                  Data Santri 2 (Pembanding)
                </h2>
              </div>
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
                <BiodataPendaftaran
                  key={`padukan-bio2-${santri2Nis ?? 'x'}-${biodataPanelEpoch}`}
                  externalSantriId={santri2Nis}
                  onOpenSearch={() => handleOpenSearch('right')}
                  onDataChange={handleDataChangeRight}
                  onBiodataSaved={() => {}}
                />
              </div>
            </div>
          </div>

          <PadukanDataLists
            santriIdA={santri1Nis}
            santriIdB={santri2Nis}
            labelA="Santri 1"
            labelB="Santri 2"
            merging={merging}
            onMergeSection={handleMergeSection}
            onMergeBiodata={openBiodataModal}
          />

          {/* Tindakan bulk & padukan penuh */}
          <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Pindah / salin semua bagian & padukan penuh
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Gunakan tombol per kotak di atas untuk kontrol satu per satu. Di bawah ini: pindah atau salin semua bagian sekaligus, lalu opsional padukan penuh (hapus duplikat).
            </p>
            <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-700 dark:text-gray-300">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Strategi biodata</span>
                <select
                  value={biodataForm.biodata_strategy}
                  onChange={(e) => setBiodataForm((f) => ({ ...f, biodata_strategy: e.target.value }))}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                >
                  <option value="fill_empty">Isi field kosong dari pembanding</option>
                  <option value="prefer_utama">Utama menang (jarang ubah biodata utama)</option>
                  <option value="prefer_sekunder">Pembanding menang (salin dari pembanding)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Bentrok NIK</span>
                <select
                  value={biodataForm.nik_resolution}
                  onChange={(e) => setBiodataForm((f) => ({ ...f, nik_resolution: e.target.value }))}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                >
                  <option value="auto">Otomatis</option>
                  <option value="nullify_sekunder">Kosongkan NIK di santri sumber</option>
                  <option value="random_placeholder_sekunder">Placeholder acak di santri sumber</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => canMerge && handleBulkMerge(santri1Nis, santri2Nis, 'bulk_all_move')}
                disabled={!canMerge || merging}
                className="px-3 py-2 rounded-lg bg-gray-800 dark:bg-gray-600 text-white text-sm font-medium disabled:opacity-50"
              >
                Pindah semua bagian → Santri 1
              </button>
              <button
                type="button"
                onClick={() => canMerge && handleBulkMerge(santri2Nis, santri1Nis, 'bulk_all_move')}
                disabled={!canMerge || merging}
                className="px-3 py-2 rounded-lg bg-gray-800 dark:bg-gray-600 text-white text-sm font-medium disabled:opacity-50"
              >
                Pindah semua bagian → Santri 2
              </button>
              <button
                type="button"
                onClick={() => canMerge && handleBulkMerge(santri1Nis, santri2Nis, 'bulk_all_copy')}
                disabled={!canMerge || merging}
                className="px-3 py-2 rounded-lg border border-gray-400 dark:border-gray-500 text-sm font-medium text-gray-800 dark:text-gray-200 disabled:opacity-50"
              >
                Salin semua (yang boleh) → Santri 1
              </button>
              <button
                type="button"
                onClick={() => canMerge && handleBulkMerge(santri2Nis, santri1Nis, 'bulk_all_copy')}
                disabled={!canMerge || merging}
                className="px-3 py-2 rounded-lg border border-gray-400 dark:border-gray-500 text-sm font-medium text-gray-800 dark:text-gray-200 disabled:opacity-50"
              >
                Salin semua (yang boleh) → Santri 2
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Padukan penuh: semua domain + biodata + hapus santri sekunder.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => canMerge && handleMergeFull(santri1Nis, santri2Nis)}
                disabled={!canMerge || merging}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {merging ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memadukan...
                  </span>
                ) : (
                  `Padukan penuh → Santri 1 (NIS ${santri1Nis || '?'})`
                )}
              </button>
              <button
                type="button"
                onClick={() => canMerge && handleMergeFull(santri2Nis, santri1Nis)}
                disabled={!canMerge || merging}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {merging ? null : `Padukan penuh → Santri 2 (NIS ${santri2Nis || '?'})`}
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
              <li>Panel dikelompokkan per domain (PSB, keuangan, akademik, UGT, dll.) — jumlah baris diambil dari database</li>
              <li><strong>Pindah</strong>: ubah <code className="text-[11px]">id_santri</code> ke NIS utama (data di sumber kosong)</li>
              <li><strong>Salin</strong>: duplikat baris ke utama (bentrok unik dilewati); tidak tersedia untuk registrasi/UWABA</li>
              <li>Biodata: strategi pengisian + penanganan NIK unik</li>
              <li>Padukan penuh: semua bagian + hapus akun duplikat</li>
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
          zIndex={searchZIndex}
        />,
        document.body
      )}

      {biodataModal.open &&
        createPortal(
          <div
            className={`fixed inset-0 ${modalOverlayZ} flex items-center justify-center p-4 bg-black/50`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="padukan-biodata-title"
          >
            <div className={`w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-5 relative ${isEmbed ? 'z-[10061]' : ''}`}>
              <h2 id="padukan-biodata-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Padukan biodata
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Utama: NIS {biodataModal.idUtama} · Sumber: NIS {sekunderDariUtama(biodataModal.idUtama)}
              </p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Strategi penggabungan</span>
                  <select
                    value={biodataForm.biodata_strategy}
                    onChange={(e) => setBiodataForm((f) => ({ ...f, biodata_strategy: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  >
                    <option value="fill_empty">Isi field kosong di utama dari pembanding</option>
                    <option value="prefer_utama">Utama menang (pertahankan nilai utama)</option>
                    <option value="prefer_sekunder">Pembanding menang (salin dari pembanding)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Jika NIK bentrok (unik)</span>
                  <select
                    value={biodataForm.nik_resolution}
                    onChange={(e) => setBiodataForm((f) => ({ ...f, nik_resolution: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  >
                    <option value="auto">Otomatis</option>
                    <option value="nullify_sekunder">Kosongkan NIK di santri sumber (pembersihan)</option>
                    <option value="random_placeholder_sekunder">Ganti NIK sumber dengan placeholder acak</option>
                  </select>
                </label>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeBiodataModal}
                  disabled={merging}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBiodataModalConfirm}
                  disabled={merging}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {merging ? 'Memproses…' : 'Terapkan'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
