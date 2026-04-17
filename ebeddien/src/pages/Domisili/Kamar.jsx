import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDomisiliSnapshot } from '../../services/domisiliIndexedDb'
import { fetchAndPersistDomisiliCache, DOMISILI_CACHE_EVENT } from '../../services/domisiliCacheSync'

/** Urutan tampilan kategori (selaras filter daerah / form) */
const KATEGORI_ORDER = ['Banin', 'Banat']
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { SantriPerKamarOffcanvas } from './SantriPerKamarOffcanvas'
import { KamarEditOffcanvas } from './KamarEditOffcanvas'
import { kategoriBadgeClass } from './kategoriBadgeClass'

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

function Kamar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { options: tahunAjaranOptions, tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const [kamarList, setKamarList] = useState([])
  const [daerahList, setDaerahList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingKamar, setEditingKamar] = useState(null)
  const [filterDaerah, setFilterDaerah] = useState('')
  const [filterStatus, setFilterStatus] = useState('aktif')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  /** Semua santri untuk hitung penghuni per kamar (id_kamar = id baris daerah___kamar) */
  const [santriMasterList, setSantriMasterList] = useState([])
  const [santriOffcanvasOpen, setSantriOffcanvasOpen] = useState(false)
  const [santriOffcanvasKamar, setSantriOffcanvasKamar] = useState(null)

  const applyDomisiliSnapshot = useCallback((snap) => {
    if (!snap) return
    setDaerahList(Array.isArray(snap.daerah) ? snap.daerah : [])
    setKamarList(Array.isArray(snap.kamar) ? snap.kamar : [])
    setSantriMasterList(Array.isArray(snap.santri) ? snap.santri : [])
  }, [])

  const loadDomisili = useCallback(async (opts = {}) => {
    const background = opts.background === true
    try {
      if (!background) {
        setLoading(true)
        setError(null)
        const snap = await getDomisiliSnapshot()
        if (snap && (snap.kamar.length > 0 || snap.daerah.length > 0)) {
          applyDomisiliSnapshot(snap)
          setLoading(false)
        }
      }
      const { daerah, kamar, santri, kamarOk } = await fetchAndPersistDomisiliCache({ notify: false })
      setDaerahList(daerah)
      setKamarList(kamar)
      setSantriMasterList(santri)
      if (kamar.length > 0 || kamarOk) setError(null)
      if (!kamarOk && kamar.length === 0 && !background) {
        setError('Gagal memuat data kamar')
      }
    } catch (err) {
      console.error('Error loading kamar:', err)
      if (!background) setError('Terjadi kesalahan saat memuat data kamar')
    } finally {
      if (!background) setLoading(false)
    }
  }, [applyDomisiliSnapshot])

  useEffect(() => {
    loadDomisili()
  }, [loadDomisili])

  useEffect(() => {
    const onDomisiliUpdated = async () => {
      const snap = await getDomisiliSnapshot()
      if (snap) applyDomisiliSnapshot(snap)
    }
    window.addEventListener(DOMISILI_CACHE_EVENT, onDomisiliUpdated)
    return () => window.removeEventListener(DOMISILI_CACHE_EVENT, onDomisiliUpdated)
  }, [applyDomisiliSnapshot])

  /** Dari halaman Daerah: tombol Edit kamar di offcanvas santri mengarah ke sini dengan state. */
  useEffect(() => {
    const raw = location.state?.openEditKamarId
    if (raw == null || loading) return
    const idStr = String(raw)
    const found = kamarList.find((k) => String(k.id) === idStr)
    navigate(location.pathname, { replace: true, state: {} })
    if (!found) return
    setSantriOffcanvasOpen(false)
    setSantriOffcanvasKamar(null)
    setEditingKamar(found)
    setOffcanvasOpen(true)
  }, [location.state?.openEditKamarId, loading, kamarList, navigate, location.pathname])

  const matchByDaerah = useCallback((k, val) => !val || String(k.id_daerah) === String(val), [])
  const matchByStatus = useCallback((k, val) => !val || normalizeStatus(k.status) === normalizeStatus(val), [])

  const dataAfterFilters = useMemo(() => {
    return kamarList.filter(
      (k) => matchByDaerah(k, filterDaerah) && matchByStatus(k, filterStatus)
    )
  }, [kamarList, filterDaerah, filterStatus, matchByDaerah, matchByStatus])

  const filteredKamar = useMemo(() => {
    const qRaw = searchQuery.trim()
    const rows = !qRaw
      ? dataAfterFilters
      : dataAfterFilters.filter((k) => {
          const q = qRaw.toLowerCase()
          return (
            (k.kamar && k.kamar.toLowerCase().includes(q)) ||
            (k.daerah_nama && k.daerah_nama.toLowerCase().includes(q)) ||
            (k.daerah_kategori && k.daerah_kategori.toLowerCase().includes(q)) ||
            (k.keterangan && k.keterangan.toLowerCase().includes(q))
          )
        })
    const rankKategori = (kat) => {
      const idx = KATEGORI_ORDER.indexOf(String(kat ?? '').trim())
      return idx === -1 ? 99 : idx
    }
    return [...rows].sort((a, b) => {
      const rk = rankKategori(a.daerah_kategori) - rankKategori(b.daerah_kategori)
      if (rk !== 0) return rk
      const rd = String(a.daerah_nama ?? '').localeCompare(String(b.daerah_nama ?? ''), 'id', { sensitivity: 'base', numeric: true })
      if (rd !== 0) return rd
      return String(a.kamar ?? '').localeCompare(String(b.kamar ?? ''), 'id', { sensitivity: 'base', numeric: true })
    })
  }, [dataAfterFilters, searchQuery])

  /** Hanya santri status Mukim (per kamar), selaras offcanvas list kamar di halaman Daerah */
  const santriMukimCountByKamar = useMemo(() => {
    const counts = {}
    santriMasterList.forEach((s) => {
      const id = s.id_kamar != null && s.id_kamar !== '' ? String(s.id_kamar) : ''
      if (!id) return
      const st = String(s.status_santri ?? '').trim().toLowerCase()
      if (st !== 'mukim') return
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  }, [santriMasterList])

  const santriOffcanvasRows = useMemo(() => {
    if (!santriOffcanvasKamar?.id) return []
    const kid = String(santriOffcanvasKamar.id)
    return santriMasterList.filter((s) => s.id_kamar != null && String(s.id_kamar) === kid)
  }, [santriMasterList, santriOffcanvasKamar])

  const statusLabel = useCallback((v) => (v === 'aktif' ? 'Aktif' : v === 'nonaktif' ? 'Nonaktif' : v), [])

  const { daerahOptions, statusOptions } = useMemo(() => {
    const base = kamarList
    const daerahCounts = {}
    base.forEach((k) => {
      const id = k.id_daerah != null ? String(k.id_daerah) : ''
      if (id === '') return
      if (!daerahCounts[id]) daerahCounts[id] = { count: 0, nama: k.daerah_nama ? `${k.daerah_kategori || ''} — ${k.daerah_nama}` : id }
      daerahCounts[id].count += 1
    })
    const daerahOptions = Object.entries(daerahCounts)
      .map(([value, o]) => ({ value, label: o.nama || value, count: o.count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const statusCounts = {}
    base.forEach((k) => {
      const s = normalizeStatus(k.status) || '(tanpa status)'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))

    return { daerahOptions, statusOptions }
  }, [kamarList, statusLabel])

  const handleCloseSantriOffcanvas = () => {
    setSantriOffcanvasOpen(false)
    setSantriOffcanvasKamar(null)
  }

  const handleToggleSantriOffcanvas = (kamar) => {
    if (!kamar?.id) return
    const sameOpen = santriOffcanvasOpen && String(santriOffcanvasKamar?.id) === String(kamar.id)
    if (sameOpen) {
      handleCloseSantriOffcanvas()
      return
    }
    setSantriOffcanvasKamar(kamar)
    setSantriOffcanvasOpen(true)
  }

  const handleOpenOffcanvas = (kamar = null) => {
    handleCloseSantriOffcanvas()
    setEditingKamar(kamar || null)
    setOffcanvasOpen(true)
  }

  const handleCloseOffcanvas = () => {
    setOffcanvasOpen(false)
    setEditingKamar(null)
  }

  if (loading && kamarList.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari daerah, kamar..."
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                  title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {isFilterOpen ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
                <button type="button" onClick={() => loadDomisili()} className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto" title="Refresh">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
            <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
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
                <div className="px-4 py-2">
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Daerah:</span>
                    <select
                      value={filterDaerah}
                      onChange={(e) => setFilterDaerah(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[200px]"
                    >
                      <option value="">Semua</option>
                      {daerahOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Status:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Semua</option>
                      {statusOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredKamar.length}</span>
            </span>
            <button type="button" onClick={() => handleOpenOffcanvas()} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Kamar
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredKamar.map((kamar, index) => (
                <motion.div
                  key={kamar.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.03 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleSantriOffcanvas(kamar)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleSantriOffcanvas(kamar) } }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border cursor-pointer hover:shadow-lg transition-all ${
                    kamar.status === 'nonaktif' ? 'border-gray-200 dark:border-gray-700 opacity-75' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-[auto_auto] gap-x-0 gap-y-2">
                      <div className="row-span-2 flex min-w-0 items-center border-r border-gray-200 pr-3 dark:border-gray-600">
                        <h3 className="w-full min-w-0 text-xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
                          {(kamar.daerah_nama || `Daerah #${kamar.id_daerah}`).trim()}.{String(kamar.kamar || '-').trim()}
                        </h3>
                      </div>
                      <div className="col-start-2 flex min-w-0 justify-end">
                        <span className={kategoriBadgeClass(kamar.daerah_kategori)}>
                          {kamar.daerah_kategori || '–'}
                        </span>
                      </div>
                      <div className="col-start-2 flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        {filterStatus === '' && (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              normalizeStatus(kamar.status) === 'aktif'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {normalizeStatus(kamar.status) === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          {Number(santriMukimCountByKamar[String(kamar.id)] || 0)} mukim
                        </span>
                      </div>
                    </div>
                    <svg className="w-5 h-5 shrink-0 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {kamar.keterangan && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{kamar.keterangan}</p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredKamar.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery || filterDaerah || filterStatus ? 'Tidak ada kamar yang sesuai filter' : 'Belum ada data kamar'}
              </p>
            </div>
          )}
        </div>
      </div>

      <KamarEditOffcanvas
        host="kamar"
        open={offcanvasOpen}
        onClose={handleCloseOffcanvas}
        editingKamar={editingKamar}
        defaultDaerahId={filterDaerah}
        daerahList={daerahList}
        tahunAjaranOptions={tahunAjaranOptions}
        onSaved={() => loadDomisili({ background: true })}
      />

      <SantriPerKamarOffcanvas
        variant="kamar"
        open={santriOffcanvasOpen}
        kamar={santriOffcanvasKamar}
        rows={santriOffcanvasRows}
        onClose={handleCloseSantriOffcanvas}
        onEditKamar={
          santriOffcanvasKamar ? () => handleOpenOffcanvas(santriOffcanvasKamar) : undefined
        }
        daerahList={daerahList}
        kamarList={kamarList}
        onSantriListChanged={() => loadDomisili({ background: true })}
        tahunAjaranHijriyah={tahunAjaran}
        tahunAjaranMasehi={tahunAjaranMasehi}
      />
    </div>
  )
}

export default Kamar
