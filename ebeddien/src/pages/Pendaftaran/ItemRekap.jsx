import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { usePengeluaranFiturAccess } from '../../hooks/usePengeluaranFiturAccess'
import ItemSetorOffcanvas from './components/ItemSetorOffcanvas'

const formatRupiah = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`

/** Ada setor jika total qty > 0 atau nominal (data lama / compat). */
function itemHasSetor(item) {
  const j = Number(item.jumlah_setor ?? item.count_setor ?? 0)
  const n = Number(item.total_nominal_setor ?? 0)
  return j > 0 || n > 0
}

function ItemRekap() {
  const { showNotification } = useNotification()
  const pengeluaranFitur = usePengeluaranFiturAccess()
  const tahunAjaranHeader = useTahunAjaranStore((s) => s.tahunAjaran)
  const tahunAjaranMasehiHeader = useTahunAjaranStore((s) => s.tahunAjaranMasehi)
  const [rekapItems, setRekapItems] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState({
    total_item: 0,
    total_pemakaian: 0,
    total_terbayar: 0,
    total_sudah_diambil: 0,
    total_harga_terbayar: 0,
    total_harga_terpakai: 0,
    total_jumlah_setor: 0,
    total_nominal_setor: 0,
    total_jumlah_setor_rencana: 0,
    total_nominal_setor_rencana: 0,
    total_jumlah_setor_pengeluaran: 0,
    total_nominal_setor_pengeluaran: 0
  })
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [setorOpen, setSetorOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [selectedTahunHijriyah, setSelectedTahunHijriyah] = useState(tahunAjaranHeader || '')
  const [selectedTahunMasehi, setSelectedTahunMasehi] = useState(tahunAjaranMasehiHeader || '')
  const [tahunHijriyahOptions, setTahunHijriyahOptions] = useState([])
  const [tahunMasehiOptions, setTahunMasehiOptions] = useState([])
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const fetchTahunAjaranList = useCallback(async () => {
    try {
      const result = await pendaftaranAPI.getTahunAjaranList()
      if (result.success && result.data) {
        setTahunHijriyahOptions(Array.isArray(result.data.tahun_hijriyah) ? result.data.tahun_hijriyah : [])
        setTahunMasehiOptions(Array.isArray(result.data.tahun_masehi) ? result.data.tahun_masehi : [])
      } else {
        setTahunHijriyahOptions([])
        setTahunMasehiOptions([])
      }
    } catch (error) {
      console.error('Error fetching tahun ajaran list:', error)
      setTahunHijriyahOptions([])
      setTahunMasehiOptions([])
    }
  }, [])

  const fetchRekap = useCallback(async () => {
    setLoading(true)
    try {
      const response = await pendaftaranAPI.getItemRekap(
        kategoriFilter || null,
        searchInput || null,
        selectedTahunHijriyah || null,
        selectedTahunMasehi || null
      )
      if (response.success) {
        setRekapItems(response.data || [])
        setCategories(response.categories || [])
        setSummary(
          response.summary || {
            total_item: 0,
            total_pemakaian: 0,
            total_terbayar: 0,
            total_sudah_diambil: 0,
            total_harga_terbayar: 0,
            total_harga_terpakai: 0,
            total_jumlah_setor: 0,
            total_nominal_setor: 0,
            total_jumlah_setor_rencana: 0,
            total_nominal_setor_rencana: 0,
            total_jumlah_setor_pengeluaran: 0,
            total_nominal_setor_pengeluaran: 0
          }
        )
      }
    } catch (error) {
      console.error('Error fetching item rekap:', error)
      showNotification('Gagal memuat rekap item', 'error')
    } finally {
      setLoading(false)
    }
  }, [kategoriFilter, searchInput, selectedTahunHijriyah, selectedTahunMasehi, showNotification])

  useEffect(() => {
    fetchTahunAjaranList()
  }, [fetchTahunAjaranList])

  useEffect(() => {
    setSelectedTahunHijriyah(tahunAjaranHeader || '')
  }, [tahunAjaranHeader])

  useEffect(() => {
    setSelectedTahunMasehi(tahunAjaranMasehiHeader || '')
  }, [tahunAjaranMasehiHeader])

  useEffect(() => {
    fetchRekap()
  }, [fetchRekap])

  const hijriyahFilterOptions = useMemo(() => {
    const list = [...tahunHijriyahOptions]
    if (selectedTahunHijriyah && !list.includes(selectedTahunHijriyah)) {
      list.unshift(selectedTahunHijriyah)
    }
    return list
  }, [tahunHijriyahOptions, selectedTahunHijriyah])

  const masehiFilterOptions = useMemo(() => {
    const list = [...tahunMasehiOptions]
    if (selectedTahunMasehi && !list.includes(selectedTahunMasehi)) {
      list.unshift(selectedTahunMasehi)
    }
    return list
  }, [tahunMasehiOptions, selectedTahunMasehi])

  const filteredItems = useMemo(() => rekapItems, [rekapItems])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedRekapRows = useMemo(() => {
    const map = new Map(rekapItems.map((r) => [r.id, r]))
    return Array.from(selectedIds)
      .map((id) => map.get(id))
      .filter(Boolean)
  }, [rekapItems, selectedIds])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const showSetorSummary =
    (summary.total_jumlah_setor ?? summary.total_count_setor ?? 0) > 0 ||
    (summary.total_nominal_setor || 0) > 0

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-2 sm:p-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col"
          >
            <div
              className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4 ${
                showSetorSummary ? '2xl:grid-cols-6' : '2xl:grid-cols-5'
              }`}
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Item</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {summary.total_item || 0}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Dipakai</div>
                <div className="text-lg font-bold text-teal-600 dark:text-teal-400 mt-0.5">
                  {summary.total_pemakaian || 0} kali
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Count Terbayar</div>
                <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
                  {summary.total_terbayar || 0} kali
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Count Sudah Diambil</div>
                <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {summary.total_sudah_diambil || 0} kali
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Harga Dipakai</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatRupiah(summary.total_harga_terpakai)}
                </div>
              </div>
              {showSetorSummary ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Setor (jumlah qty / sum)</div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {(summary.total_jumlah_setor ?? summary.total_count_setor ?? 0).toLocaleString('id-ID')} ·{' '}
                    {formatRupiah(summary.total_nominal_setor)}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[10px] text-amber-800/90 dark:text-amber-200/85 leading-snug">
                    <div>
                      Di rencana:{' '}
                      {(summary.total_jumlah_setor_rencana ?? 0).toLocaleString('id-ID')} qty ·{' '}
                      {formatRupiah(summary.total_nominal_setor_rencana ?? 0)}
                    </div>
                    <div>
                      Sudah pengeluaran:{' '}
                      {(summary.total_jumlah_setor_pengeluaran ?? 0).toLocaleString('id-ID')} qty ·{' '}
                      {formatRupiah(summary.total_nominal_setor_pengeluaran ?? 0)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
              <div className="relative pb-2 px-4 pt-3">
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-20 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    placeholder="Cari item..."
                  />
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                    <button
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                      title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                      {isFilterOpen ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
              </div>

              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="px-4 py-2 space-y-2">
                      {pengeluaranFitur.rencanaBuat ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (selectMode) exitSelectMode()
                              else setSelectMode(true)
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              selectMode
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {selectMode ? 'Selesai pilih' : 'Pilih item'}
                          </button>
                          {selectMode && selectedIds.size > 0 && (
                            <button
                              type="button"
                              onClick={() => setSetorOpen(true)}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              Setor ({selectedIds.size})
                            </button>
                          )}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={kategoriFilter}
                          onChange={(e) => setKategoriFilter(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Semua Kategori</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <select
                          value={selectedTahunHijriyah}
                          onChange={(e) => setSelectedTahunHijriyah(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Semua Tahun Hijriyah</option>
                          {hijriyahFilterOptions.map((tahun) => (
                            <option key={tahun} value={tahun}>
                              {tahun}
                            </option>
                          ))}
                        </select>
                        <select
                          value={selectedTahunMasehi}
                          onChange={(e) => setSelectedTahunMasehi(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Semua Tahun Masehi</option>
                          {masehiFilterOptions.map((tahun) => (
                            <option key={tahun} value={tahun}>
                              {tahun}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada data rekap item
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {filteredItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 border-l-teal-500 border border-gray-200 dark:border-gray-700 p-3"
                    >
                      <div className="flex items-start gap-3">
                        {selectMode && pengeluaranFitur.rencanaBuat ? (
                          <label className="flex-shrink-0 pt-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                          </label>
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                            {item.nama_item || item.item}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">ID: {item.id}</span>
                            {item.kategori ? (
                              <>
                                <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {item.kategori}
                                </span>
                              </>
                            ) : null}
                            {item.urutan ? (
                              <>
                                <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Urutan: {item.urutan}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Harga Standar
                          </div>
                          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            {formatRupiah(item.harga_standar)}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`grid grid-cols-1 gap-2 mt-3 ${
                          itemHasSetor(item) ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
                        }`}
                      >
                        <div className="rounded-md bg-teal-50 dark:bg-teal-900/25 px-3 py-2 border border-teal-100 dark:border-teal-800">
                          <div className="text-[11px] text-teal-700 dark:text-teal-300 mb-1">Terpakai</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] text-teal-600/80 dark:text-teal-300/80">Count</div>
                              <div className="text-sm font-bold text-teal-700 dark:text-teal-300">
                                {Number(item.jumlah_terpakai || 0).toLocaleString('id-ID')}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-teal-600/80 dark:text-teal-300/80">Sum</div>
                              <div className="text-sm font-bold text-teal-700 dark:text-teal-300">
                                {formatRupiah(item.total_harga_terpakai)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md bg-cyan-50 dark:bg-cyan-900/25 px-3 py-2 border border-cyan-100 dark:border-cyan-800">
                          <div className="text-[11px] text-cyan-700 dark:text-cyan-300 mb-1">Terbayar</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] text-cyan-600/80 dark:text-cyan-300/80">Count</div>
                              <div className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                                {Number(item.count_terbayar || 0).toLocaleString('id-ID')}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-cyan-600/80 dark:text-cyan-300/80">Sum</div>
                              <div className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                                {formatRupiah(item.total_harga_terbayar)}
                              </div>
                            </div>
                          </div>
                        </div>
                        {itemHasSetor(item) ? (
                          <div className="rounded-md bg-amber-50 dark:bg-amber-900/25 px-3 py-2 border border-amber-100 dark:border-amber-800">
                            <div className="text-[11px] text-amber-800 dark:text-amber-200 mb-1">Setor</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[10px] text-amber-700/80 dark:text-amber-200/80">Jumlah (qty)</div>
                                <div className="text-sm font-bold text-amber-800 dark:text-amber-200">
                                  {Number(item.jumlah_setor ?? item.count_setor ?? 0).toLocaleString('id-ID')}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-amber-700/80 dark:text-amber-200/80">Sum</div>
                                <div className="text-sm font-bold text-amber-800 dark:text-amber-200">
                                  {formatRupiah(item.total_nominal_setor)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-amber-900/85 dark:text-amber-100/85">
                              <div className="rounded bg-amber-100/60 dark:bg-amber-950/30 px-2 py-1">
                                <span className="font-medium text-amber-900 dark:text-amber-100">Rencana</span>
                                {' · '}
                                {(Number(item.jumlah_setor_rencana) || 0).toLocaleString('id-ID')} qty ·{' '}
                                {formatRupiah(item.nominal_setor_rencana)}
                              </div>
                              <div className="rounded bg-emerald-100/70 dark:bg-emerald-950/35 px-2 py-1 text-emerald-900 dark:text-emerald-100">
                                <span className="font-medium">Pengeluaran</span>
                                {' · '}
                                {(Number(item.jumlah_setor_pengeluaran) || 0).toLocaleString('id-ID')} qty ·{' '}
                                {formatRupiah(item.nominal_setor_pengeluaran)}
                              </div>
                            </div>
                            {Array.isArray(item.rencana_setor_list) && item.rencana_setor_list.length > 0 ? (
                              <div className="mt-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
                                <div className="text-[10px] font-medium text-amber-900/90 dark:text-amber-100/90 mb-1">
                                  Daftar rencana
                                </div>
                                <ul className="space-y-1.5">
                                  {item.rencana_setor_list.map((r) => (
                                    <li
                                      key={`${item.id}-${r.id}-${r.fase || 'x'}`}
                                      className="text-[11px] text-amber-900/85 dark:text-amber-100/85 leading-snug flex flex-wrap items-baseline gap-x-1 gap-y-0.5"
                                    >
                                      {r.fase === 'pengeluaran' ? (
                                        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                                          Pengeluaran
                                        </span>
                                      ) : r.fase === 'rencana' ? (
                                        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                                          Rencana
                                        </span>
                                      ) : null}
                                      {pengeluaranFitur.tabRencana ? (
                                        <Link
                                          to={`/pengeluaran/edit/${r.id}`}
                                          className="font-medium text-amber-800 dark:text-amber-200 hover:underline"
                                        >
                                          #{r.id}
                                        </Link>
                                      ) : (
                                        <span className="font-medium">#{r.id}</span>
                                      )}
                                      <span className="text-amber-800/80 dark:text-amber-200/80">
                                        · {r.keterangan || '—'}
                                        {r.ket ? (
                                          <span className="text-amber-700/70 dark:text-amber-300/70"> ({r.ket})</span>
                                        ) : null}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="rounded-md bg-indigo-50 dark:bg-indigo-900/25 px-3 py-2 border border-indigo-100 dark:border-indigo-800">
                          <div className="text-[11px] text-indigo-700 dark:text-indigo-300">Count Sudah Diambil</div>
                          <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                            {Number(item.count_sudah_diambil || 0).toLocaleString('id-ID')} kali
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <ItemSetorOffcanvas
        isOpen={setorOpen}
        onClose={() => setSetorOpen(false)}
        selectedRekapRows={selectedRekapRows}
        onSubmitted={() => {
          fetchRekap()
          exitSelectMode()
        }}
      />
    </div>
  )
}

export default ItemRekap
