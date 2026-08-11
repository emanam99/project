import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { tahunAjaranAPI } from '../../services/api'
import TahunAjaranFormOffcanvas from './components/TahunAjaranFormOffcanvas'
import {
  analyzeTahunAjaranMaster,
  getCardRentangStatus,
  formatIdDate
} from '../../utils/tahunAjaranRentangValidation'
import { getMasehiHariIniYmd } from '../../utils/tahunAjaranActive'

const CARD_STATUS_CLASS = {
  active: 'border-teal-500 dark:border-teal-500 ring-1 ring-teal-500/40',
  overlap: 'border-red-500 dark:border-red-500 ring-1 ring-red-500/50 bg-red-50/50 dark:bg-red-950/20',
  incomplete: 'border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/15',
  neutral: 'border-gray-200 dark:border-gray-700'
}

function KategoriSection({ title, analysis, items, onOpenForm }) {
  const filtered = items.filter((i) => i.kategori === analysis.kategoriKey)

  return (
    <section className="mb-6 sm:mb-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-4 mb-3 sm:mb-4"
      >
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Acuan hari ini (Masehi): <span className="font-mono font-medium">{formatIdDate(analysis.today)}</span>
        </p>

        {analysis.activeMatches.length > 0 ? (
          <p className="text-sm mt-2 text-teal-700 dark:text-teal-300">
            <span className="font-medium">Aktif: </span>
            {analysis.activeMatches.join(', ')}
            {analysis.todayInOverlap && (
              <span className="text-red-600 dark:text-red-400 font-medium"> — tumpang tindih, perbaiki rentang</span>
            )}
          </p>
        ) : analysis.withRentang.length > 0 ? (
          <p className="text-sm mt-2 text-amber-700 dark:text-amber-300">
            Hari ini tidak masuk rentang mana pun
            {analysis.activeTahunAjaran ? ` (fallback terbaru: ${analysis.activeTahunAjaran})` : ''}.
          </p>
        ) : (
          <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">Belum ada baris dengan rentang terisi.</p>
        )}

        {(analysis.overlappingTahunAjaran.length > 0 || analysis.gaps.length > 0 || analysis.missingRentang.length > 0) && (
          <div className="mt-3 space-y-2 text-xs sm:text-sm">
            {analysis.overlappingTahunAjaran.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-red-800 dark:text-red-200"
              >
                <p className="font-semibold">Rentang tumpang tindih</p>
                <p className="mt-0.5">Tahun ajaran (merah): {analysis.overlappingTahunAjaran.join(', ')}</p>
              </motion.div>
            )}
            {analysis.gaps.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 }}
                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/25 px-3 py-2 text-amber-900 dark:text-amber-100"
              >
                <p className="font-semibold">Tanggal tanpa tahun ajaran</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {analysis.gaps.map((g) => (
                    <li key={`${g.dari}-${g.sampai}`}>{g.label}</li>
                  ))}
                </ul>
              </motion.div>
            )}
            {analysis.missingRentang.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 }}
                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-amber-900 dark:text-amber-100"
              >
                <p className="font-semibold">Belum ada rentang dari–sampai</p>
                <p className="mt-0.5">{analysis.missingRentang.join(', ')}</p>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Tidak ada data {title.toLowerCase()}.</p>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AnimatePresence>
            {filtered.map((item, index) => {
              const status = getCardRentangStatus(item, analysis)
              return (
                <motion.div
                  key={item.tahun_ajaran}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onOpenForm(item)}
                  className={`rounded-lg shadow cursor-pointer hover:shadow-md transition-all duration-200 group p-3 sm:p-4 ${CARD_STATUS_CLASS[status] || CARD_STATUS_CLASS.neutral}`}
                >
                  <motion.div className="flex justify-between items-start gap-2">
                    <motion.div layout className="min-w-0 flex-1">
                      <h3
                        className={`text-base sm:text-lg font-semibold truncate transition-colors ${
                          status === 'overlap'
                            ? 'text-red-700 dark:text-red-300'
                            : status === 'active'
                              ? 'text-teal-700 dark:text-teal-300'
                              : 'text-gray-800 dark:text-gray-200 group-hover:text-teal-600 dark:group-hover:text-teal-400'
                        }`}
                      >
                        {item.tahun_ajaran}
                      </h3>
                      {status === 'active' && !analysis.todayInOverlap && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40 px-1.5 py-0.5 rounded">
                          Aktif hari ini
                        </span>
                      )}
                      {status === 'overlap' && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                          Rentang bentrok
                        </span>
                      )}
                      {status === 'incomplete' && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                          Rentang kosong
                        </span>
                      )}
                      {(item.dari || item.sampai) && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                          Periode:{' '}
                          <span className="font-medium">
                            {item.dari ? formatIdDate(String(item.dari).slice(0, 10)) : '–'} s/d{' '}
                            {item.sampai ? formatIdDate(String(item.sampai).slice(0, 10)) : '–'}
                          </span>
                        </p>
                      )}
                    </motion.div>
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  )
}

function TahunAjaran() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await tahunAjaranAPI.getAll({})
      if (res.success) {
        setItems(res.data || [])
      } else {
        setError(res.message || 'Gagal memuat data tahun ajaran')
      }
    } catch (err) {
      console.error('Error loading tahun ajaran:', err)
      setError('Terjadi kesalahan saat memuat data tahun ajaran')
    } finally {
      setLoading(false)
    }
  }

  const openForm = (item = null) => {
    setEditingItem(item)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingItem(null)
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return (items || []).filter((item) => {
      if (kategoriFilter && item.kategori !== kategoriFilter) return false
      if (!q) return true
      return (
        (item.tahun_ajaran && item.tahun_ajaran.toLowerCase().includes(q)) ||
        (item.kategori && item.kategori.toLowerCase().includes(q))
      )
    })
  }, [items, searchQuery, kategoriFilter])

  const rentangAnalysis = useMemo(() => {
    const raw = analyzeTahunAjaranMaster(items, getMasehiHariIniYmd())
    return {
      hijriyah: { ...raw.hijriyah, kategoriKey: 'hijriyah' },
      masehi: { ...raw.masehi, kategoriKey: 'masehi' }
    }
  }, [items])

  const kategoriOptions = useMemo(() => {
    const counts = {}
    for (const item of items) {
      const k = item.kategori || ''
      if (!k) continue
      counts[k] = (counts[k] || 0) + 1
    }
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value === 'hijriyah' ? 'Hijriyah' : value === 'masehi' ? 'Masehi' : value,
      count
    }))
  }, [items])

  const showSplitSections = !kategoriFilter && !searchQuery.trim()

  if (loading && !items.length) {
    return (
      <div className="flex items-center justify-center h-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="rounded-full h-12 w-12 border-b-2 border-teal-600"
        />
      </div>
    )
  }

  return (
    <motion.div layout className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-sm sm:text-base text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-3 sm:mb-4">
          <motion.div layout className="relative pb-2 px-3 sm:px-4 pt-2 sm:pt-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex-1 relative min-w-0">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full py-1.5 sm:p-2 pr-20 sm:pr-24 text-sm sm:text-base focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari tahun ajaran..."
                />
                <motion.div layout className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <motion.div
                  layout
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${
                    isInputFocused ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={kategoriFilter}
                  onChange={(e) => setKategoriFilter(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs sm:text-sm text-gray-700 dark:text-gray-200 min-w-0"
                >
                  <option value="">Semua Kategori</option>
                  {kategoriOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} {o.count ? `(${o.count})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => openForm(null)}
                  className="px-2.5 sm:px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm shrink-0"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="container mx-auto px-3 sm:px-4 pb-4 sm:pb-6 max-w-7xl">
          {showSplitSections ? (
            <>
              <KategoriSection
                title="Tahun Ajaran Hijriyah"
                analysis={rentangAnalysis.hijriyah}
                items={filteredItems}
                onOpenForm={openForm}
              />
              <KategoriSection
                title="Tahun Ajaran Masehi"
                analysis={rentangAnalysis.masehi}
                items={filteredItems}
                onOpenForm={openForm}
              />
            </>
          ) : filteredItems.length === 0 ? (
            <p className="text-center text-sm sm:text-base text-gray-500 dark:text-gray-400 py-6 sm:py-8">
              {searchQuery || kategoriFilter ? 'Tidak ada tahun ajaran yang sesuai filter' : 'Belum ada data tahun ajaran'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <AnimatePresence>
                {filteredItems.map((item, index) => {
                  const analysis =
                    item.kategori === 'masehi' ? rentangAnalysis.masehi : rentangAnalysis.hijriyah
                  const status = getCardRentangStatus(item, analysis)
                  return (
                    <motion.div
                      key={item.tahun_ajaran}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ delay: index * 0.02 }}
                      onClick={() => openForm(item)}
                      className={`rounded-lg shadow cursor-pointer hover:shadow-md transition-all p-3 sm:p-4 ${CARD_STATUS_CLASS[status] || CARD_STATUS_CLASS.neutral}`}
                    >
                      <h3
                        className={`text-base font-semibold ${
                          status === 'overlap' ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {item.tahun_ajaran}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{item.kategori}</p>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <TahunAjaranFormOffcanvas isOpen={formOpen} onClose={closeForm} item={editingItem} onSaved={loadData} />
    </motion.div>
  )
}

export default TahunAjaran
