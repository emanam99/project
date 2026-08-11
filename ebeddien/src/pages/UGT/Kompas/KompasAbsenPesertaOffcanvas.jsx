import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ugtKompasAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import '../../Pembayaran/components/PrintOffcanvas.css'
import './KompasAbsenPesertaPrint.css'

const ROW_HEIGHT_STORAGE_KEY = 'kompas-absen-row-height'
const GROUP_MODE_STORAGE_KEY = 'kompas-absen-group-mode'
const GROUP_MODE_SEMUA = 'semua'
const GROUP_MODE_KOORDINATOR = 'koordinator'
const ROW_HEIGHT_PRESETS = [
  { key: 'kecil', label: 'Kecil', value: 32 },
  { key: 'sedang', label: 'Sedang', value: 48 },
  { key: 'besar', label: 'Besar', value: 64 },
]
const DEFAULT_ROW_HEIGHT = ROW_HEIGHT_PRESETS[1].value
const ROW_HEIGHT_MIN = 24
const ROW_HEIGHT_MAX = 96

function loadStoredRowHeight() {
  try {
    const raw = localStorage.getItem(ROW_HEIGHT_STORAGE_KEY)
    const value = parseInt(raw, 10)
    if (Number.isFinite(value) && value >= ROW_HEIGHT_MIN && value <= ROW_HEIGHT_MAX) {
      return value
    }
  } catch (_) {
    /* abaikan */
  }
  return DEFAULT_ROW_HEIGHT
}

function loadStoredGroupMode() {
  try {
    const raw = localStorage.getItem(GROUP_MODE_STORAGE_KEY)
    if (raw === GROUP_MODE_KOORDINATOR || raw === GROUP_MODE_SEMUA) return raw
  } catch (_) {
    /* abaikan */
  }
  return GROUP_MODE_SEMUA
}

function getKoordinatorLabel(row) {
  const name = String(row?.koordinator_nama || '').trim()
  return name || 'Tanpa koordinator'
}

function sortAbsenRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const lomba = String(a.nama_lomba || '').localeCompare(String(b.nama_lomba || ''), 'id')
    if (lomba !== 0) return lomba
    const mad = String(a.nama_madrasah || '').localeCompare(String(b.nama_madrasah || ''), 'id')
    if (mad !== 0) return mad
    const ua = Number(a.urutan)
    const ub = Number(b.urutan)
    if (Number.isFinite(ua) && Number.isFinite(ub) && ua !== ub) return ua - ub
    return String(a.nama_peserta || '').localeCompare(String(b.nama_peserta || ''), 'id')
  })
}

function groupRowsByKoordinator(rows) {
  const groups = new Map()
  for (const row of sortAbsenRows(rows)) {
    const label = getKoordinatorLabel(row)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(row)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === 'Tanpa koordinator') return 1
      if (b === 'Tanpa koordinator') return -1
      return a.localeCompare(b, 'id')
    })
    .map(([label, groupRows]) => ({ label, rows: groupRows }))
}

function KompasAbsenTable({ rows, startNo = 0 }) {
  return (
    <table className="kompas-absen-table">
      <thead>
        <tr>
          <th className="col-no">No</th>
          <th className="col-nama">Nama</th>
          <th className="col-madrasah">Madrasah</th>
          <th className="col-gt">GT</th>
          <th className="col-ttd">TTD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={`${r.id_peserta || r.nik || idx}-${idx}`}>
            <td className="col-no">{startNo + idx + 1}</td>
            <td className="col-nama">{r.nama_peserta || '—'}</td>
            <td className="col-madrasah">{r.nama_madrasah || '—'}</td>
            <td className="col-gt">{r.guru_tugas_nama || '—'}</td>
            <td className="col-ttd">&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function KompasAbsenPrintSheet({ rows, tahunAjaran, lombaLabel, fontSize, rowHeight, groupByKoordinator }) {
  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div
      className="print-kompas-absen-page"
      style={{
        fontSize: `${fontSize}px`,
        '--kompas-absen-row-height': `${rowHeight}px`,
      }}
    >
      <header className="kompas-absen-header">
        <h1 className="kompas-absen-title">KOMMPAS — Daftar Absen Peserta</h1>
        <p className="kompas-absen-subtitle">
          Kompetisi Antar Murid Madrasah Penerima Guru Tugas
        </p>
        <div className="kompas-absen-meta">
          <span>
            <strong>Tahun ajaran:</strong> {tahunAjaran || '—'}
          </span>
          <span>
            <strong>Lomba:</strong> {lombaLabel || 'Semua lomba'}
          </span>
          <span>
            <strong>Jumlah peserta:</strong> {rows.length}
          </span>
          <span>
            <strong>Dicetak:</strong> {today}
          </span>
        </div>
      </header>

      {groupByKoordinator ? (
        <div className="kompas-absen-groups">
          {groupRowsByKoordinator(rows).map((group) => (
            <section key={group.label} className="kompas-absen-koordinator-section">
              <h2 className="kompas-absen-koordinator-heading">
                Koordinator: {group.label}
                <span className="kompas-absen-koordinator-count"> ({group.rows.length} peserta)</span>
              </h2>
              <KompasAbsenTable rows={group.rows} />
            </section>
          ))}
        </div>
      ) : (
        <KompasAbsenTable rows={rows} />
      )}
    </div>
  )
}

export default function KompasAbsenPesertaOffcanvas({
  isOpen,
  onClose,
  tahunAjaran,
  filterLomba = '',
  filterLombaNama = null,
}) {
  const { showNotification } = useNotification()
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [fontSize, setFontSize] = useState(10)
  const [rowHeight, setRowHeight] = useState(loadStoredRowHeight)
  const [groupMode, setGroupMode] = useState(loadStoredGroupMode)

  const lombaLabel = filterLombaNama || (filterLomba ? 'Lomba terpilih' : 'Semua lomba')
  const activeRowPreset = ROW_HEIGHT_PRESETS.find((preset) => preset.value === rowHeight)?.key ?? null

  const groupByKoordinator = groupMode === GROUP_MODE_KOORDINATOR

  const handleGroupModeChange = useCallback((mode) => {
    setGroupMode(mode)
    try {
      localStorage.setItem(GROUP_MODE_STORAGE_KEY, mode)
    } catch (_) {
      /* abaikan */
    }
  }, [])

  const handleRowHeightChange = useCallback((value) => {
    const next = Math.max(ROW_HEIGHT_MIN, Math.min(ROW_HEIGHT_MAX, value))
    setRowHeight(next)
    try {
      localStorage.setItem(ROW_HEIGHT_STORAGE_KEY, String(next))
    } catch (_) {
      /* abaikan */
    }
  }, [])

  const loadRows = useCallback(async () => {
    if (!tahunAjaran) return
    setLoading(true)
    try {
      const res = await ugtKompasAPI.exportDaftar({
        tahun_ajaran: tahunAjaran,
        id_lomba: filterLomba || undefined,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal memuat data absen', 'error')
        setRows([])
        return
      }
      setRows(sortAbsenRows(res.data || []))
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal memuat data absen', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tahunAjaran, filterLomba, showNotification])

  useEffect(() => {
    if (!isOpen) return
    setFontSize(10)
    loadRows()
  }, [isOpen, loadRows])

  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('print-offcanvas-open')
    return () => {
      document.body.classList.remove('print-offcanvas-open')
    }
  }, [isOpen])

  const sortedRows = useMemo(() => rows, [rows])

  const handlePrint = () => {
    if (sortedRows.length === 0) {
      showNotification('Tidak ada peserta untuk dicetak', 'warning')
      return
    }
    setTimeout(() => window.print(), 200)
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="kompas-absen-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="no-print fixed inset-0 bg-black/50 z-[99998]"
          />
          <motion.div
            key="kompas-absen-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={offcanvasTransition}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col z-[99999]"
            style={{ maxHeight: '90vh' }}
          >
            <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold text-teal-600 dark:text-teal-400 truncate">
                  Absen peserta
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {loading
                    ? 'Memuat data…'
                    : `${sortedRows.length} peserta · ${lombaLabel} · TA ${tahunAjaran}`}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
                    Tampilan:
                  </label>
                  <div className="flex items-center rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                    <button
                      type="button"
                      onClick={() => handleGroupModeChange(GROUP_MODE_SEMUA)}
                      className={`px-2 h-7 text-[10px] sm:text-xs transition-colors whitespace-nowrap ${
                        groupMode === GROUP_MODE_SEMUA
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                      title="Satu daftar semua peserta"
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGroupModeChange(GROUP_MODE_KOORDINATOR)}
                      className={`px-2 h-7 text-[10px] sm:text-xs transition-colors whitespace-nowrap ${
                        groupMode === GROUP_MODE_KOORDINATOR
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                      title="Kelompokkan per koordinator"
                    >
                      Per koordinator
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
                    Tinggi baris:
                  </label>
                  <div className="flex items-center rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                    {ROW_HEIGHT_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => handleRowHeightChange(preset.value)}
                        className={`px-2 h-7 text-[10px] sm:text-xs transition-colors ${
                          activeRowPreset === preset.key
                            ? 'bg-teal-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                        }`}
                        title={`${preset.label} (${preset.value}px)`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRowHeightChange(rowHeight - 4)}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                    title="Kurangi tinggi baris"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={ROW_HEIGHT_MIN}
                    max={ROW_HEIGHT_MAX}
                    step={4}
                    value={rowHeight}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10) || DEFAULT_ROW_HEIGHT
                      handleRowHeightChange(value)
                    }}
                    className="w-11 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    aria-label="Tinggi baris dalam piksel"
                  />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:inline">px</span>
                  <button
                    type="button"
                    onClick={() => handleRowHeightChange(rowHeight + 4)}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                    title="Tambah tinggi baris"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
                    Ukuran font:
                  </label>
                  <button
                    type="button"
                    onClick={() => setFontSize((prev) => Math.max(7, prev - 1))}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                    title="Kurangi ukuran font"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={7}
                    max={14}
                    value={fontSize}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10) || 10
                      setFontSize(Math.max(7, Math.min(14, value)))
                    }}
                    className="w-10 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setFontSize((prev) => Math.min(14, prev + 1))}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                    title="Tambah ukuran font"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={loading || sortedRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  Print
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Tutup"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <div className="p-3 sm:p-4">
                {loading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Memuat daftar peserta…</p>
                ) : sortedRows.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    Tidak ada peserta untuk dicetak (sesuai filter lomba).
                  </p>
                ) : (
                  <div className="kompas-absen-preview rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-3 sm:p-4 overflow-x-auto">
                    <KompasAbsenPrintSheet
                      rows={sortedRows}
                      tahunAjaran={tahunAjaran}
                      lombaLabel={lombaLabel}
                      fontSize={fontSize}
                      rowHeight={rowHeight}
                      groupByKoordinator={groupByKoordinator}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
