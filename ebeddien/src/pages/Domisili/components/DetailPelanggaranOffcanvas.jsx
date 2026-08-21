import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { santriAPI, tarbiyahDomisiliSantriAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import PelanggaranJenisOffcanvas from './PelanggaranJenisOffcanvas'
import { labelKategoriPelanggaran } from './PelanggaranMasterFormOffcanvas'

function formatWaktuMasehi(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(String(iso).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Panel/offcanvas detail santri + riwayat + catat pelanggaran.
 * @param {{ variant?: 'panel'|'offcanvas', isOpen?: boolean, onClose?: () => void, santri: object|null, onCariSantri?: () => void, onRecorded?: () => void, loading?: boolean }} props
 */
export default function DetailPelanggaranOffcanvas({
  variant = 'offcanvas',
  isOpen = true,
  onClose,
  santri,
  onCariSantri,
  onRecorded,
  loading = false,
}) {
  const { showNotification } = useNotification()
  const isPanel = variant === 'panel'
  const [riwayat, setRiwayat] = useState([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)
  const [jenisOpen, setJenisOpen] = useState(false)
  const [selectedJenis, setSelectedJenis] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [resolvedSantri, setResolvedSantri] = useState(santri)

  const closeOffcanvas = useOffcanvasBackClose(!isPanel && isOpen, () => {
    if (jenisOpen) return
    onClose?.()
  })

  useEffect(() => {
    setResolvedSantri(santri)
  }, [santri])

  const loadRiwayat = useCallback(async (idSantri) => {
    if (!idSantri) {
      setRiwayat([])
      return
    }
    try {
      setRiwayatLoading(true)
      const res = await tarbiyahDomisiliSantriAPI.getPelanggaranSantri(idSantri)
      if (res?.success) setRiwayat(Array.isArray(res.data) ? res.data : [])
      else setRiwayat([])
    } catch {
      setRiwayat([])
    } finally {
      setRiwayatLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = resolvedSantri?.id
    if (!id) {
      setRiwayat([])
      return
    }
    loadRiwayat(id)
  }, [resolvedSantri?.id, loadRiwayat])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!resolvedSantri?.id) return
      if (resolvedSantri.nama && resolvedSantri.nis) return
      try {
        const res = await santriAPI.getById(resolvedSantri.id)
        if (!cancelled && res?.success && res.data) {
          setResolvedSantri((prev) => ({ ...prev, ...res.data }))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolvedSantri?.id, resolvedSantri?.nama, resolvedSantri?.nis])

  const handleSelectJenis = (item) => {
    setSelectedJenis(item)
    setCatatan('')
  }

  const handleSimpan = async () => {
    const idSantri = resolvedSantri?.id
    const idPelanggaran = selectedJenis?.id
    if (!idSantri || !idPelanggaran) return
    try {
      setSaving(true)
      const res = await tarbiyahDomisiliSantriAPI.postPelanggaran({
        id_santri: idSantri,
        id_pelanggaran: idPelanggaran,
        catatan: catatan.trim() || undefined,
      })
      if (res?.success) {
        showNotification('Pelanggaran dicatat', 'success')
        setSelectedJenis(null)
        setCatatan('')
        await loadRiwayat(idSantri)
        onRecorded?.()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const body = (
    <div className={`flex flex-col min-h-0 h-full ${isPanel ? '' : ''}`}>
      <div
        className={`flex-shrink-0 flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 ${
          isPanel ? 'px-3 py-2.5' : 'p-4'
        }`}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {loading ? 'Memuat…' : resolvedSantri?.nama || 'Pilih santri'}
          </h3>
          {resolvedSantri?.nis ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">NIS {resolvedSantri.nis}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onCariSantri ? (
            <button
              type="button"
              onClick={onCariSantri}
              className="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cari
            </button>
          ) : null}
          {!isPanel ? (
            <button
              type="button"
              onClick={() => closeOffcanvas()}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!resolvedSantri?.id ? (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Pilih santri untuk mencatat pelanggaran.
            </p>
            {onCariSantri ? (
              <button
                type="button"
                onClick={onCariSantri}
                className="px-3 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700"
              >
                Cari santri
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
              {(resolvedSantri.daerah || resolvedSantri.kamar) && (
                <p>
                  {[resolvedSantri.daerah, resolvedSantri.kamar].filter(Boolean).join(' · ')}
                </p>
              )}
              {(resolvedSantri.diniyah || resolvedSantri.formal) && (
                <p>
                  {[resolvedSantri.diniyah, resolvedSantri.formal].filter(Boolean).join(' · ')}
                </p>
              )}
              {resolvedSantri.status_santri ? <p>Status: {resolvedSantri.status_santri}</p> : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Catat pelanggaran
                </h4>
                <button
                  type="button"
                  onClick={() => setJenisOpen(true)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                >
                  Pilih jenis
                </button>
              </div>
              {selectedJenis ? (
                <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-900/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedJenis.nama}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {labelKategoriPelanggaran(selectedJenis.kategori)}
                  </p>
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={3}
                    placeholder="Catatan (opsional)"
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 dark:text-gray-100"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJenis(null)
                        setCatatan('')
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSimpan}
                      className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {saving ? 'Menyimpan…' : 'Simpan'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tekan «Pilih jenis» untuk membuka daftar pelanggaran.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Riwayat
              </h4>
              {riwayatLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
                </div>
              ) : riwayat.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan.</p>
              ) : (
                <ul className="space-y-2">
                  {riwayat.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {r.pelanggaran_nama || '—'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {labelKategoriPelanggaran(r.pelanggaran_kategori)} · {formatWaktuMasehi(r.tanggal_dibuat)}
                        {r.pengurus_nama ? ` · ${r.pengurus_nama}` : ''}
                      </p>
                      {r.catatan ? (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{r.catatan}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <PelanggaranJenisOffcanvas
        isOpen={jenisOpen}
        onClose={() => setJenisOpen(false)}
        onSelect={handleSelectJenis}
        zIndex={isPanel ? 230 : 230}
      />
    </div>
  )

  if (isPanel) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {body}
      </div>
    )
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="detail-pelanggaran-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closeOffcanvas()}
            className="fixed inset-0 bg-black/50 z-[200]"
          />
          <motion.div
            key="detail-pelanggaran-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
          >
            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
