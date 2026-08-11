import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getMapel,
  getMapelDetail,
  createMapel,
  updateMapel,
  deleteMapel,
  getKitab,
  createKitab,
  updateKitab,
  deleteKitab,
  getKelas,
  type MapelRow,
  type KitabRow,
  type KelasRow,
} from '../api/apiClient'
import { formatKitabLabel, formatMapelBatas, formatMapelLabel } from '../utils/formatMapel'
import { tabPanelMotion } from '../components/AnimatedPanel'
import { ContentSkeleton } from '../components/LazyFallback'

type KitabForm = { fan: string; nama: string; musonnif: string }
type MapelForm = { kitab_id: string; dari: string; sampai: string; kelas_ids: Set<string> }
type PageTab = 'kitab' | 'mapel'

const EMPTY_KITAB: KitabForm = { fan: '', nama: '', musonnif: '' }
const EMPTY_MAPEL = (): MapelForm => ({ kitab_id: '', dari: '', sampai: '', kelas_ids: new Set() })

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function uniqueKelasIds(ids: Iterable<string>) {
  return [...new Set(Array.from(ids).map(String))]
}

export default function MapelPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<PageTab>('kitab')
  const [kitabList, setKitabList] = useState<KitabRow[]>([])
  const [mapelList, setMapelList] = useState<MapelRow[]>([])
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [kitabCanvasOpen, setKitabCanvasOpen] = useState(false)
  const [kitabFormMode, setKitabFormMode] = useState<'add' | 'edit'>('add')
  const [kitabEditingId, setKitabEditingId] = useState('')
  const [kitabForm, setKitabForm] = useState<KitabForm>({ ...EMPTY_KITAB })
  const [kitabSubmitLoading, setKitabSubmitLoading] = useState(false)

  const [mapelCanvasOpen, setMapelCanvasOpen] = useState(false)
  const [mapelFormMode, setMapelFormMode] = useState<'add' | 'edit'>('add')
  const [mapelEditingId, setMapelEditingId] = useState('')
  const [mapelForm, setMapelForm] = useState<MapelForm>(EMPTY_MAPEL)
  const [mapelSubmitLoading, setMapelSubmitLoading] = useState(false)
  const [kelasRombelLoaded, setKelasRombelLoaded] = useState(false)

  const [summaryKelasId, setSummaryKelasId] = useState('')
  const [summaryMapel, setSummaryMapel] = useState<MapelRow[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  const fetchLists = async () => {
    const [kitabRes, mapelRes] = await Promise.all([getKitab(), getMapel()])
    if (kitabRes.success) setKitabList(kitabRes.data)
    if (mapelRes.success) setMapelList(mapelRes.data)
  }

  const fetchData = async () => {
    setLoading(true)
    setError('')
    const kelasRes = await getKelas()
    await fetchLists()
    if (kelasRes.success && kelasRes.data.length > 0) {
      setKelasList(kelasRes.data)
      setSummaryKelasId((prev) => prev || kelasRes.data[0].id)
    }
    setLoading(false)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (!raw) {
        navigate('/', { replace: true })
        return
      }
      const user = JSON.parse(raw) as { akses?: string }
      if (!isAdminAkses(user.akses)) {
        navigate('/dashboard', { replace: true })
        return
      }
    } catch {
      navigate('/', { replace: true })
      return
    }
    fetchData()
  }, [navigate])

  useEffect(() => {
    if (!summaryKelasId) {
      setSummaryMapel([])
      return
    }
    let cancelled = false
    const loadSummary = async () => {
      setSummaryLoading(true)
      const res = await getMapel(summaryKelasId)
      if (cancelled) return
      setSummaryMapel(res.success ? res.data : [])
      setSummaryLoading(false)
    }
    loadSummary()
    return () => {
      cancelled = true
    }
  }, [summaryKelasId])

  const refreshSummary = async () => {
    if (!summaryKelasId) return
    setSummaryLoading(true)
    const res = await getMapel(summaryKelasId)
    setSummaryMapel(res.success ? res.data : [])
    setSummaryLoading(false)
  }

  const openAddKitab = () => {
    setKitabFormMode('add')
    setKitabEditingId('')
    setKitabForm({ ...EMPTY_KITAB })
    setKitabCanvasOpen(true)
  }

  const openEditKitab = (row: KitabRow) => {
    setKitabFormMode('edit')
    setKitabEditingId(row.id)
    setKitabForm({ fan: row.fan, nama: row.nama, musonnif: row.musonnif || '' })
    setKitabCanvasOpen(true)
  }

  const handleKitabSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kitabForm.fan.trim() || !kitabForm.nama.trim()) {
      alert('Fan dan nama kitab wajib diisi')
      return
    }
    setKitabSubmitLoading(true)
    const payload = {
      fan: kitabForm.fan.trim(),
      nama: kitabForm.nama.trim(),
      musonnif: kitabForm.musonnif.trim(),
    }
    const res =
      kitabFormMode === 'add'
        ? await createKitab(payload)
        : await updateKitab(kitabEditingId, payload)
    setKitabSubmitLoading(false)
    if (res.success) {
      setKitabCanvasOpen(false)
      fetchLists()
    } else alert(res.message || 'Gagal menyimpan')
  }

  const handleDeleteKitab = async (row: KitabRow) => {
    if (!confirm(`Hapus kitab "${formatKitabLabel(row)}"?`)) return
    const res = await deleteKitab(row.id)
    if (res.success) fetchLists()
    else alert(res.message || 'Gagal menghapus')
  }

  const openAddMapel = () => {
    setMapelFormMode('add')
    setMapelEditingId('')
    setKelasRombelLoaded(true)
    setMapelForm({
      kitab_id: kitabList[0]?.id || '',
      dari: '',
      sampai: '',
      kelas_ids: new Set(),
    })
    setMapelCanvasOpen(true)
  }

  const openEditMapel = async (row: MapelRow) => {
    setMapelFormMode('edit')
    setMapelEditingId(row.id)
    setKelasRombelLoaded(false)
    setMapelForm({
      kitab_id: row.kitab_id,
      dari: row.dari || '',
      sampai: row.sampai || '',
      kelas_ids: new Set(),
    })
    setMapelCanvasOpen(true)
    const res = await getMapelDetail(row.id)
    if (res.success && res.data?.kelas_ids) {
      setMapelForm((f) => ({
        ...f,
        kelas_ids: new Set(uniqueKelasIds(res.data!.kelas_ids!)),
      }))
    }
    setKelasRombelLoaded(true)
  }

  const toggleMapelKelas = (kelasId: string) => {
    setMapelForm((f) => {
      const next = new Set(f.kelas_ids)
      if (next.has(kelasId)) next.delete(kelasId)
      else next.add(kelasId)
      return { ...f, kelas_ids: next }
    })
  }

  const handleMapelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mapelForm.kitab_id) {
      alert('Pilih kitab terlebih dahulu')
      return
    }
    setMapelSubmitLoading(true)
    const payload: {
      kitab_id: string
      dari: string
      sampai: string
      kelas_ids?: string[]
    } = {
      kitab_id: mapelForm.kitab_id,
      dari: mapelForm.dari.trim(),
      sampai: mapelForm.sampai.trim(),
    }
    if (mapelFormMode === 'add' || kelasRombelLoaded) {
      payload.kelas_ids = uniqueKelasIds(mapelForm.kelas_ids)
    }
    const res =
      mapelFormMode === 'add'
        ? await createMapel(payload)
        : await updateMapel(mapelEditingId, payload)
    setMapelSubmitLoading(false)
    if (res.success) {
      setMapelCanvasOpen(false)
      await fetchLists()
      refreshSummary()
    } else alert(res.message || 'Gagal menyimpan')
  }

  const handleDeleteMapel = async (row: MapelRow) => {
    if (!confirm(`Hapus mapel "${formatMapelLabel(row)}"?`)) return
    const res = await deleteMapel(row.id)
    if (res.success) {
      fetchLists()
      refreshSummary()
    } else alert(res.message || 'Gagal menghapus')
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b ui-divider">
        <button
          type="button"
          onClick={() => setActiveTab('kitab')}
          className={`relative px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            activeTab === 'kitab'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent ui-text-muted hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Kitab
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mapel')}
          className={`relative px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            activeTab === 'mapel'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent ui-text-muted hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Mapel
        </button>
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={tabPanelMotion.initial}
          animate={tabPanelMotion.animate}
          exit={tabPanelMotion.exit}
          transition={tabPanelMotion.transition}
        >
      {activeTab === 'kitab' && (
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Kitab</h2>
          <button type="button" onClick={openAddKitab} className="ui-btn-primary shrink-0">
            + Tambah Kitab
          </button>
        </div>
        <div className="ui-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Fan</th>
                  <th className="px-4 py-3 font-medium">Nama Kitab</th>
                  <th className="px-4 py-3 font-medium">Musonnif</th>
                  <th className="px-4 py-3 font-medium text-right w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="ui-table-body">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4">
                      <ContentSkeleton rows={4} />
                    </td>
                  </tr>
                ) : kitabList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center ui-text-muted">
                      Belum ada kitab.
                    </td>
                  </tr>
                ) : (
                  kitabList.map((row) => (
                    <tr key={row.id} className="ui-table-row">
                      <td className="px-4 py-3 font-medium">{row.fan}</td>
                      <td className="px-4 py-3">{row.nama}</td>
                      <td className="px-4 py-3 ui-text-muted">{row.musonnif || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openEditKitab(row)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mr-3">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDeleteKitab(row)} className="text-red-600 dark:text-red-400 hover:underline text-sm">
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {activeTab === 'mapel' && (
      <>
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Mapel</h2>
            <p className="text-sm ui-text-muted mt-0.5">Batas pelajaran (dari–sampai) untuk setiap kitab.</p>
          </div>
          <button
            type="button"
            onClick={openAddMapel}
            disabled={kitabList.length === 0}
            className="ui-btn-primary shrink-0 disabled:opacity-50"
          >
            + Tambah Mapel
          </button>
        </div>
        <div className="ui-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Fan</th>
                  <th className="px-4 py-3 font-medium">Kitab</th>
                  <th className="px-4 py-3 font-medium">Musonnif</th>
                  <th className="px-4 py-3 font-medium">Dari – Sampai</th>
                  <th className="px-4 py-3 font-medium text-right w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="ui-table-body">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4">
                      <ContentSkeleton rows={4} />
                    </td>
                  </tr>
                ) : mapelList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center ui-text-muted">
                      {kitabList.length === 0 ? 'Tambah kitab dulu.' : 'Belum ada mapel.'}
                    </td>
                  </tr>
                ) : (
                  mapelList.map((row) => (
                    <tr key={row.id} className="ui-table-row">
                      <td className="px-4 py-3 font-medium">{row.fan}</td>
                      <td className="px-4 py-3">{row.kitab_nama || '—'}</td>
                      <td className="px-4 py-3 ui-text-muted">{row.musonnif || '—'}</td>
                      <td className="px-4 py-3 ui-text-muted">{formatMapelBatas(row)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openEditMapel(row)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mr-3">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDeleteMapel(row)} className="text-red-600 dark:text-red-400 hover:underline text-sm">
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="ui-card p-4 sm:p-5 space-y-4">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Ringkasan Mapel per Rombel</h2>
        <p className="text-sm ui-text-muted">
          Daftar mapel yang sudah terhubung ke rombel. Untuk menambah atau mengubah hubungan, gunakan form Tambah/Edit Mapel.
        </p>
        <div className="max-w-md">
          <label htmlFor="summary-kelas" className="ui-label mb-1.5 block">
            Rombel
          </label>
          <select
            id="summary-kelas"
            value={summaryKelasId}
            onChange={(e) => setSummaryKelasId(e.target.value)}
            className="ui-input-lg appearance-none w-full"
          >
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {formatKelasLabel(k.nama_kelas, k.kel)}
              </option>
            ))}
          </select>
        </div>

        {summaryLoading ? (
          <ContentSkeleton rows={3} />
        ) : summaryMapel.length === 0 ? (
          <p className="text-sm ui-text-muted italic">Belum ada mapel untuk rombel ini.</p>
        ) : (
          <ul className="space-y-2">
            {summaryMapel.map((m) => (
              <li
                key={m.id}
                className="text-sm px-3 py-2.5 rounded-lg border ui-divider bg-slate-50/80 dark:bg-slate-900/30"
              >
                {formatMapelLabel(m)}
              </li>
            ))}
          </ul>
        )}
      </div>
      </>
      )}
        </motion.div>
      </AnimatePresence>

      {/* Offcanvas Kitab */}
      <AnimatePresence>
        {kitabCanvasOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setKitabCanvasOpen(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col"
            >
              <div className="px-5 py-4 border-b ui-divider flex items-center justify-between">
                <h2 className="font-semibold text-lg">{kitabFormMode === 'add' ? 'Tambah Kitab' : 'Edit Kitab'}</h2>
                <button type="button" onClick={() => setKitabCanvasOpen(false)} className="ui-text-muted text-xl">×</button>
              </div>
              <form onSubmit={handleKitabSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Fan *</label>
                  <input type="text" value={kitabForm.fan} onChange={(e) => setKitabForm((f) => ({ ...f, fan: e.target.value }))} className="ui-input w-full" required />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Nama Kitab *</label>
                  <input type="text" value={kitabForm.nama} onChange={(e) => setKitabForm((f) => ({ ...f, nama: e.target.value }))} className="ui-input w-full" required />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Musonnif</label>
                  <input type="text" value={kitabForm.musonnif} onChange={(e) => setKitabForm((f) => ({ ...f, musonnif: e.target.value }))} className="ui-input w-full" />
                </div>
                <button type="submit" disabled={kitabSubmitLoading} className="w-full ui-btn-primary disabled:opacity-60">
                  {kitabSubmitLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Offcanvas Mapel */}
      <AnimatePresence>
        {mapelCanvasOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setMapelCanvasOpen(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col"
            >
              <div className="px-5 py-4 border-b ui-divider flex items-center justify-between">
                <h2 className="font-semibold text-lg">{mapelFormMode === 'add' ? 'Tambah Mapel' : 'Edit Mapel'}</h2>
                <button type="button" onClick={() => setMapelCanvasOpen(false)} className="ui-text-muted text-xl">×</button>
              </div>
              <form onSubmit={handleMapelSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Kitab *</label>
                  <select
                    value={mapelForm.kitab_id}
                    onChange={(e) => setMapelForm((f) => ({ ...f, kitab_id: e.target.value }))}
                    className="ui-input w-full appearance-none"
                    required
                  >
                    <option value="">Pilih kitab...</option>
                    {kitabList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {formatKitabLabel(k)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label mb-1.5 block">Dari</label>
                    <input type="text" value={mapelForm.dari} onChange={(e) => setMapelForm((f) => ({ ...f, dari: e.target.value }))} className="ui-input w-full" placeholder="Bab / halaman awal" />
                  </div>
                  <div>
                    <label className="ui-label mb-1.5 block">Sampai</label>
                    <input type="text" value={mapelForm.sampai} onChange={(e) => setMapelForm((f) => ({ ...f, sampai: e.target.value }))} className="ui-input w-full" placeholder="Bab / halaman akhir" />
                  </div>
                </div>
                <p className="text-xs ui-text-muted">Dari–sampai = batas lingkup pelajaran mapel ini.</p>

                <div className="pt-2 border-t ui-divider space-y-2">
                  <label className="ui-label block">Rombel</label>
                  <p className="text-xs ui-text-muted">Centang rombel yang mempelajari mapel ini.</p>
                  {kelasList.length === 0 ? (
                    <p className="text-sm ui-text-muted italic">Belum ada rombel.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {kelasList.map((k) => (
                        <label
                          key={k.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border ui-divider cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={mapelForm.kelas_ids.has(k.id)}
                            onChange={() => toggleMapelKelas(k.id)}
                          />
                          {formatKelasLabel(k.nama_kelas, k.kel)}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <button type="submit" disabled={mapelSubmitLoading || (mapelFormMode === 'edit' && !kelasRombelLoaded)} className="w-full ui-btn-primary disabled:opacity-60">
                  {mapelSubmitLoading ? 'Menyimpan...' : mapelFormMode === 'edit' && !kelasRombelLoaded ? 'Memuat rombel...' : 'Simpan'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
