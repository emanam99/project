import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { madrasahAPI, ugtLaporanKoordinatorAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useUgtLaporanFiturAccess } from '../../hooks/useUgtLaporanFiturAccess'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import LaporanKoordinatorOffcanvas from './components/LaporanKoordinatorOffcanvas'
import LaporanKoordinatorList from './components/LaporanKoordinatorList'
import LaporanUgtSearchFilterToolbar from './components/LaporanUgtSearchFilterToolbar'
import { useUgtLaporanListClientFilters } from './hooks/useUgtLaporanListClientFilters'

const selCls =
  'border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[220px]'

export default function LaporanKoordinatorPage() {
  const { showNotification } = useNotification()
  const user = useAuthStore((s) => s.user)
  const {
    showKoordinatorFilter,
    koordinatorFilterLocked,
    hasFilterKoordinatorSemua,
    canTambahKoordinator
  } = useUgtLaporanFiturAccess()
  const hijriyahOptions = useTahunAjaranStore((s) => s.options)
  const [searchParams, setSearchParams] = useSearchParams()
  const editParam = searchParams.get('edit')
  const baruParam = searchParams.get('baru')

  const [madrasahList, setMadrasahList] = useState([])

  const fetchAll = useCallback(() => ugtLaporanKoordinatorAPI.getAll({}), [])

  const onFetchError = useCallback((e) => {
    showNotification(e?.response?.data?.message || e?.message || 'Gagal memuat laporan', 'error')
  }, [showNotification])

  const onListMessage = useCallback((msg) => {
    showNotification(msg, 'error')
  }, [showNotification])

  const {
    scopeRows,
    loadScope,
    loadingScope,
    filterMadrasah,
    setFilterMadrasah,
    filterKoordinator,
    setFilterKoordinator,
    filterTa,
    setFilterTa,
    filterBulan,
    setFilterBulan,
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isInputFocused,
    setIsInputFocused,
    koordinatorOptions,
    madrasahOptions,
    taOptions,
    bulanOptions,
    filteredForDisplay,
    displayRows,
    resetFilters,
    hasActiveFilters
  } = useUgtLaporanListClientFilters({
    fetchAll,
    madrasahList,
    hijriyahOptions,
    showKoordinatorFilter,
    koordinatorFilterLocked,
    hasFilterKoordinatorSemua,
    onFetchError,
    onListMessage
  })

  const [editingRow, setEditingRow] = useState(null)
  const [editFetchLoading, setEditFetchLoading] = useState(false)

  useEffect(() => {
    madrasahAPI.getAll()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) setMadrasahList(res.data)
        else setMadrasahList([])
      })
      .catch(() => setMadrasahList([]))
  }, [])

  const closeOffcanvas = useCallback(() => {
    setEditingRow(null)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('edit')
        n.delete('baru')
        return n
      },
      { replace: true }
    )
  }, [setSearchParams])

  const openBaru = useCallback(() => {
    if (!canTambahKoordinator) return
    setEditingRow(null)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('edit')
        n.set('baru', '1')
        return n
      },
      { replace: false }
    )
  }, [setSearchParams, canTambahKoordinator])

  const openEdit = useCallback((row) => {
    setEditingRow(row)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('baru')
        n.set('edit', String(row.id))
        return n
      },
      { replace: false }
    )
  }, [setSearchParams])

  useEffect(() => {
    if (baruParam === '1' && !canTambahKoordinator) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('baru')
          return n
        },
        { replace: true }
      )
      return
    }
    if (baruParam === '1') return
    if (!editParam) {
      setEditingRow(null)
      return
    }
    const id = Number(editParam)
    if (!Number.isFinite(id) || id <= 0) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('edit')
          return n
        },
        { replace: true }
      )
      setEditingRow(null)
      return
    }
    if (loadingScope) return
    const found = scopeRows.find((x) => x.id === id)
    if (found) {
      setEditingRow(found)
      return
    }
    let cancelled = false
    setEditFetchLoading(true)
    ugtLaporanKoordinatorAPI.getById(id)
      .then((res) => {
        if (cancelled) return
        if (res?.success && res.data) {
          setEditingRow(res.data)
        } else {
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev)
              n.delete('edit')
              return n
            },
            { replace: true }
          )
          setEditingRow(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev)
              n.delete('edit')
              return n
            },
            { replace: true }
          )
          setEditingRow(null)
        }
      })
      .finally(() => {
        if (!cancelled) setEditFetchLoading(false)
      })
    return () => { cancelled = true }
  }, [editParam, baruParam, scopeRows, loadingScope, setSearchParams, canTambahKoordinator])

  const isOffcanvasOpen = Boolean((baruParam === '1' && canTambahKoordinator) || (editParam && editingRow))

  useEffect(() => {
    if (editParam != null || baruParam === '1') return
    if (editingRow == null) return
    setEditingRow(null)
  }, [editParam, baruParam, editingRow])

  const filterSelects = (
    <>
      {showKoordinatorFilter && (
        koordinatorFilterLocked ? (
          <select
            disabled
            title="Hanya data koordinator Anda. Untuk memfilter semua koordinator, aktifkan aksi di Pengaturan → Fitur (Laporan UGT)."
            className={`${selCls} cursor-not-allowed opacity-90 bg-gray-100 dark:bg-gray-900`}
            value=""
          >
            <option value="">
              {user?.nama ? `${user.nama} (koordinator Anda)` : 'Koordinator Anda'}
            </option>
          </select>
        ) : (
          <select
            value={filterKoordinator}
            onChange={(e) => setFilterKoordinator(e.target.value)}
            className={selCls}
          >
            <option value="">Semua koordinator</option>
            {koordinatorOptions.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} ({k.count})
              </option>
            ))}
          </select>
        )
      )}
      <select
        value={filterMadrasah}
        onChange={(e) => setFilterMadrasah(e.target.value)}
        className={selCls}
      >
        <option value="">Semua madrasah</option>
        {madrasahOptions.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label} ({m.count})
          </option>
        ))}
      </select>
      <select
        value={filterTa}
        onChange={(e) => setFilterTa(e.target.value)}
        className={selCls}
      >
        <option value="">Semua tahun ajaran</option>
        {taOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
      <select
        value={filterBulan}
        onChange={(e) => setFilterBulan(e.target.value)}
        className={selCls}
      >
        <option value="">Semua bulan</option>
        {bulanOptions.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label} ({b.count})
          </option>
        ))}
      </select>
    </>
  )

  const emptyHintTambah = canTambahKoordinator ? ' Klik "Tambah laporan" untuk mengisi.' : ''
  const tableEmptyMessage = loadingScope && scopeRows.length === 0
    ? 'Memuat...'
    : scopeRows.length === 0
      ? `Belum ada laporan.${emptyHintTambah}`
      : hasActiveFilters
        ? 'Tidak ada laporan yang cocok dengan filter atau pencarian.'
        : `Belum ada laporan.${emptyHintTambah}`

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
        <LaporanUgtSearchFilterToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isFilterOpen={isFilterOpen}
          onToggleFilter={() => setIsFilterOpen(!isFilterOpen)}
          isInputFocused={isInputFocused}
          onInputFocus={() => setIsInputFocused(true)}
          onInputBlur={() => setIsInputFocused(false)}
          filterSelects={filterSelects}
          displayCount={displayRows.length}
          preSearchCount={filteredForDisplay.length}
          onRefresh={loadScope}
          onResetFilters={() => {
            resetFilters()
            setIsFilterOpen(false)
          }}
          primaryAction={canTambahKoordinator ? (
            <button
              type="button"
              onClick={openBaru}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium shadow-sm"
            >
              Tambah laporan
            </button>
          ) : null}
        />

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {loadingScope && scopeRows.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat...</div>
          ) : displayRows.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              {tableEmptyMessage}
            </div>
          ) : (
            <LaporanKoordinatorList
              rows={displayRows}
              onOpen={openEdit}
              showKoordinatorFilter={showKoordinatorFilter}
            />
          )}
        </motion.section>

        {editFetchLoading && editParam && !editingRow && (
          <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/20">
            <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 shadow-lg text-sm text-gray-700 dark:text-gray-200">
              Memuat laporan...
            </div>
          </div>
        )}
      </div>

      <LaporanKoordinatorOffcanvas
        isOpen={isOffcanvasOpen}
        onClose={closeOffcanvas}
        initialData={baruParam === '1' ? null : editingRow}
        madrasahList={madrasahList}
        onSuccess={loadScope}
        readOnly={!canTambahKoordinator}
      />
    </div>
  )
}
