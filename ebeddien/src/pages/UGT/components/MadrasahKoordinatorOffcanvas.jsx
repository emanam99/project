import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { madrasahAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { buildMadrasahUpdatePayload } from '../../../utils/madrasahUpdatePayload'
import { matchMadrasahLocalSearch } from '../../../utils/madrasahSearchFilter'
import CariMadrasahOffcanvas from '../../../components/CariMadrasahOffcanvas'
import OffcanvasPindahKoordinator from './OffcanvasPindahKoordinator'

function formatAlamatSingkat(m) {
  const parts = [m?.desa, m?.kecamatan, m?.kabupaten].filter(Boolean)
  return parts.join(', ')
}

/**
 * Daftar madrasah di bawah satu koordinator — pola offcanvas santri di Rombel.
 */
export default function MadrasahKoordinatorOffcanvas({
  isOpen,
  onClose,
  koordinator,
  allMadrasahList = [],
  allKoordinatorList = [],
  onMadrasahAssignmentChange,
}) {
  const { showNotification } = useNotification()
  const [search, setSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [moveLoadingId, setMoveLoadingId] = useState(null)
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false)
  const [pindahOpen, setPindahOpen] = useState(false)
  const [pindahBulk, setPindahBulk] = useState(false)
  const [pindahRow, setPindahRow] = useState(null)
  const [cariMadrasahOpen, setCariMadrasahOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const koordId = koordinator?.id != null ? String(koordinator.id) : ''

  const madrasahList = useMemo(() => {
    if (!koordId) return []
    return (allMadrasahList || []).filter((m) => String(m.id_koordinator ?? '') === koordId)
  }, [allMadrasahList, koordId])

  const filteredList = useMemo(() => {
    const q = search.trim()
    if (!q) return madrasahList
    return madrasahList.filter((m) => matchMadrasahLocalSearch(m, q, formatAlamatSingkat))
  }, [madrasahList, search])

  const resetPanel = useCallback(() => {
    setSearch('')
    setSelectMode(false)
    setSelectedIds(new Set())
    setPindahOpen(false)
    setPindahBulk(false)
    setPindahRow(null)
    setCariMadrasahOpen(false)
  }, [])

  const handleClose = useOffcanvasBackClose(isOpen, () => {
    resetPanel()
    onClose?.()
  })

  useEffect(() => {
    if (!isOpen) resetPanel()
  }, [isOpen, resetPanel])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const assignKoordinator = async (madrasahRow, targetKoordinatorId) => {
    if (!madrasahRow?.id) return false
    const payload = buildMadrasahUpdatePayload(madrasahRow, {
      id_koordinator: targetKoordinatorId ?? null,
    })
    const res = await madrasahAPI.update(madrasahRow.id, payload)
    return !!res?.success
  }

  const handleMoveIds = async (ids, targetKoordinatorId) => {
    if (!ids.length) return
    setPindahOpen(false)
    const rows = madrasahList.filter((m) => ids.includes(m.id))
    if (rows.length === 0) return
    const bulk = ids.length > 1
    if (bulk) setBulkMoveLoading(true)
    let ok = 0
    let fail = 0
    for (const row of rows) {
      if (!bulk && row.id != null) setMoveLoadingId(row.id)
      try {
        if (await assignKoordinator(row, targetKoordinatorId)) ok += 1
        else fail += 1
      } catch {
        fail += 1
      }
      if (!bulk) setMoveLoadingId(null)
    }
    if (bulk) setBulkMoveLoading(false)
    setSelectedIds(new Set())
    setSelectMode(false)
    setPindahRow(null)
    setPindahBulk(false)
    if (ok > 0) {
      showNotification(
        `${ok} madrasah berhasil dipindah${fail > 0 ? `, ${fail} gagal` : ''}`,
        fail > 0 ? 'warning' : 'success'
      )
      onMadrasahAssignmentChange?.()
    } else {
      showNotification('Gagal memindah madrasah', 'error')
    }
  }

  const handlePindahSelect = (targetKoordinatorId) => {
    if (pindahBulk) {
      handleMoveIds(Array.from(selectedIds), targetKoordinatorId)
      return
    }
    if (pindahRow) {
      handleMoveIds([pindahRow.id], targetKoordinatorId)
    }
  }

  const openPindahSingle = (row, e) => {
    e?.stopPropagation?.()
    setPindahBulk(false)
    setPindahRow(row)
    setPindahOpen(true)
  }

  const openPindahBulk = () => {
    if (selectedIds.size === 0) {
      showNotification('Pilih minimal satu madrasah', 'warning')
      return
    }
    setPindahBulk(true)
    setPindahRow(null)
    setPindahOpen(true)
  }

  const toggleSelectAll = () => {
    const ids = filteredList.map((m) => m.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleTambahMadrasah = async (madrasah) => {
    if (!madrasah?.id || !koordinator?.id) return
    const existing = String(madrasah.id_koordinator ?? '')
    if (existing && existing !== koordId) {
      const otherName = madrasah.koordinator_nama || `ID ${existing}`
      if (
        !window.confirm(
          `${madrasah.nama} saat ini di koordinator ${otherName}. Pindahkan ke ${koordinator.nama}?`
        )
      ) {
        return
      }
    }
    setAssigning(true)
    try {
      const ok = await assignKoordinator(madrasah, koordinator.id)
      if (ok) {
        showNotification(`Madrasah ${madrasah.nama} ditambahkan ke koordinator ini.`, 'success')
        setCariMadrasahOpen(false)
        onMadrasahAssignmentChange?.()
      } else {
        showNotification('Gagal menambahkan madrasah', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menambahkan madrasah', 'error')
    } finally {
      setAssigning(false)
    }
  }

  if (typeof document === 'undefined') return null

  const titleNama = koordinator?.nama || 'Koordinator'

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="md-kord-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/50 z-[200]"
            />
            <motion.div
              key="md-kord-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed right-0 top-0 bottom-0 z-[201] flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-800"
            >
              <div className="flex-shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-50 sm:text-base">
                    Madrasah · {titleNama}
                    <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400 font-mono">
                      NIP {koordinator?.nip ?? koordinator?.id ?? '–'}
                    </span>
                  </h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCariMadrasahOpen(true)}
                      disabled={assigning}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Tambah
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                      aria-label="Tutup"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {madrasahList.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Total madrasah</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredList.length}</span>
                      {search.trim() && filteredList.length !== madrasahList.length && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">(dari {madrasahList.length})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode((v) => {
                          if (v) {
                            setSelectedIds(new Set())
                          }
                          return !v
                        })
                      }}
                      aria-pressed={selectMode}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        selectMode
                          ? 'border-teal-500 bg-teal-50 text-teal-800 ring-1 ring-teal-400/60 dark:border-teal-500 dark:bg-teal-900/40 dark:text-teal-100'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      Pilih
                    </button>
                  </div>
                  <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </span>
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama, identitas madrasah, kategori, alamat…"
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {bulkMoveLoading && (
                  <p className="mb-2 text-xs text-teal-700 dark:text-teal-300">Memindahkan madrasah…</p>
                )}
                {madrasahList.length === 0 ? (
                  <p className="py-6 text-sm text-gray-500 dark:text-gray-400">
                    Belum ada madrasah di bawah koordinator ini. Ketuk Tambah untuk menugaskan madrasah.
                  </p>
                ) : filteredList.length === 0 ? (
                  <p className="py-6 text-sm text-gray-500 dark:text-gray-400">Tidak ada madrasah yang cocok dengan pencarian.</p>
                ) : (
                  <>
                    <AnimatePresence initial={false}>
                      {selectMode && (
                        <motion.div
                          key="md-kord-bulk-bar"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="sticky top-0 z-[5] -mx-1 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/95"
                        >
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            Pilih semua{search.trim() ? ' (yang terlihat)' : ''}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            Kosongkan
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.size} dipilih</span>
                          <button
                            type="button"
                            disabled={selectedIds.size === 0 || bulkMoveLoading}
                            onClick={openPindahBulk}
                            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-40 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-100"
                          >
                            Pindah
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <ul className="space-y-1">
                      {filteredList.map((m) => {
                        const checked = m.id != null && selectedIds.has(m.id)
                        return (
                          <li
                            key={m.id}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                              selectMode && checked
                                ? 'border-teal-300 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-900/25'
                                : 'border-gray-100 bg-gray-50/50 dark:border-gray-600 dark:bg-gray-700/30'
                            }`}
                          >
                            <motion.span
                              className="flex shrink-0 items-center overflow-hidden"
                              initial={false}
                              animate={{
                                width: selectMode ? 22 : 0,
                                opacity: selectMode ? 1 : 0,
                                marginRight: selectMode ? 8 : 0,
                              }}
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelect(m.id)}
                                className="h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-gray-500 dark:bg-gray-700"
                                tabIndex={selectMode ? 0 : -1}
                              />
                            </motion.span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{m.nama || '–'}</p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {[
                                  m.identitas ? `Identitas ${m.identitas}` : '',
                                  m.kategori,
                                  formatAlamatSingkat(m),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || `ID ${m.id}`}
                              </p>
                            </div>
                            {!selectMode &&
                              (moveLoadingId === m.id ? (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => openPindahSingle(m, e)}
                                  className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600"
                                  title="Pindah ke koordinator lain"
                                >
                                  Pindah
                                </button>
                              ))}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CariMadrasahOffcanvas
        isOpen={cariMadrasahOpen}
        onClose={() => setCariMadrasahOpen(false)}
        onSelect={handleTambahMadrasah}
        title="Tambah Madrasah ke Koordinator"
      />

      <OffcanvasPindahKoordinator
        isOpen={pindahOpen}
        onClose={() => {
          setPindahOpen(false)
          setPindahBulk(false)
          setPindahRow(null)
        }}
        excludeKoordinatorId={koordinator?.id}
        koordinatorList={allKoordinatorList}
        onSelect={handlePindahSelect}
        allowUnassign
        title={pindahBulk ? `Pindah ${selectedIds.size} madrasah` : 'Pindah Madrasah'}
      />
    </>,
    document.body
  )
}
