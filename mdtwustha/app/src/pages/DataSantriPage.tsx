import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSantri, type SantriRow } from '../api/apiClient'
import { exportSantriToExcel } from '../utils/exportExcel'
import MaterialIcon from '../components/MaterialIcon'
import OffcanvasEditSantri from '../components/OffcanvasEditSantri'
import { ContentSkeleton } from '../components/LazyFallback'

function formatKelasLabel(nama?: string, kel?: string) {
  if (!nama) return 'Belum ada kelas aktif'
  return kel ? `Kelas ${nama} · ${kel}` : `Kelas ${nama}`
}

function getInitial(nama: string) {
  const parts = (nama || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return ((nama || '')[0] || '?').toUpperCase()
}

export default function DataSantriPage() {
  const [data, setData] = useState<SantriRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingSantri, setEditingSantri] = useState<SantriRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const loadData = useCallback(() => {
    getSantri().then((res) => {
      if (res.success) setData(res.data)
      else setError(res.message || 'Gagal memuat data')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    getSantri().then((santriRes) => {
      if (cancelled) return
      if (santriRes.success) setData(santriRes.data)
      else setError(santriRes.message || 'Gagal memuat data')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const filtered = search.trim()
    ? data.filter(
        (row) =>
          (row.nama || '').toLowerCase().includes(search.toLowerCase()) ||
          (row.nomer_induk || '').toLowerCase().includes(search.toLowerCase())
      )
    : data

  const openAdd = () => {
    setFormMode('add')
    setEditingSantri(null)
    setOffcanvasOpen(true)
  }

  const openEdit = (row: SantriRow) => {
    setFormMode('edit')
    setEditingSantri(row)
    setOffcanvasOpen(true)
  }

  const getKelasLabel = (row: SantriRow) => {
    const nama = row.nama_kelas || row.kelas || ''
    const kel = row.kelas_kel ?? row.kel ?? ''
    return formatKelasLabel(nama, kel)
  }

  const handleExportExcel = useCallback(async () => {
    setExportError('')
    if (filtered.length === 0) {
      setExportError('Tidak ada data untuk diekspor')
      return
    }
    setExporting(true)
    try {
      await exportSantriToExcel(filtered)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Gagal mengekspor ke Excel')
    } finally {
      setExporting(false)
    }
  }, [filtered])

  return (
    <>
      <div className="w-full max-w-[480px] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="ui-title">Data Santri</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || loading || filtered.length === 0}
              className="px-3.5 py-2 text-sm ui-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Mengekspor…' : 'Ekspor Excel'}
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="px-3.5 py-2 text-sm ui-btn-primary active:scale-[0.98]"
            >
              + Tambah
            </button>
          </div>
        </div>
        {exportError && <div className="mb-3 px-3 py-2 text-sm ui-error-box">{exportError}</div>}
        <input
          type="search"
          placeholder="Cari nama atau no. induk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-search bg-[length:1.1rem] bg-[position:0.85rem_center] bg-no-repeat mb-4"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="ui-card overflow-hidden">
          {loading && <ContentSkeleton rows={6} className="p-4" />}
          {error && (
            <motion.div
              className="px-6 py-5 text-center ui-error-box border-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          {!loading && !error && (
            <motion.div
              className="p-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {filtered.length === 0 ? (
                <div className="py-10 px-4 text-center ui-text-muted">
                  <MaterialIcon name="assignment" size={40} className="mb-2 opacity-70 ui-text-muted" />
                  <p>Tidak ada data santri</p>
                  {search.trim() ? <p className="text-sm mt-1.5">Coba kata kunci lain</p> : null}
                </div>
              ) : (
                <ul className="flex flex-col gap-2 list-none m-0 p-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                  <AnimatePresence mode="popLayout">
                    {filtered.map((row, index) => (
                      <motion.li
                        key={row.id || row.nomer_induk || index}
                        className="ui-list-item focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                        layout
                        onClick={() => openEdit(row)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openEdit(row)}
                      >
                        <span className="ui-list-index">{index + 1}</span>
                        <span
                          className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-sm font-bold text-blue-400 bg-blue-500/20 rounded-full"
                          aria-hidden
                        >
                          {getInitial(row.nama || '')}
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="ui-text-strong leading-tight">{row.nama || '–'}</span>
                          <span className="text-sm ui-text-muted">
                            {row.nomer_induk ? `No. ${row.nomer_induk} ` : ''}
                            {getKelasLabel(row) !== 'Belum ada kelas aktif' ? `• ${getKelasLabel(row)}` : ''}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <OffcanvasEditSantri
        open={offcanvasOpen}
        onClose={() => setOffcanvasOpen(false)}
        mode={formMode}
        santri={editingSantri}
        onSaved={() => loadData()}
      />
    </>
  )
}
