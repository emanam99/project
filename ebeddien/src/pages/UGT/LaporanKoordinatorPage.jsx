import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { madrasahAPI, ugtLaporanKoordinatorAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useUgtLaporanFiturAccess } from '../../hooks/useUgtLaporanFiturAccess'
import { getBulanName } from '../Kalender/utils/bulanHijri'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import LaporanKoordinatorOffcanvas from './components/LaporanKoordinatorOffcanvas'

const LaporanFotoThumb = memo(function LaporanFotoThumb({ fotoPath }) {
  const [blobUrl, setBlobUrl] = useState(null)
  useEffect(() => {
    if (!fotoPath || typeof fotoPath !== 'string') {
      setBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(fotoPath).then((url) => {
      if (!cancelled) setBlobUrl(url)
    }).catch(() => {
      if (!cancelled) setBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [fotoPath])
  if (!fotoPath) {
    return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
  }
  if (!blobUrl) {
    return <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse shrink-0" />
  }
  return (
    <img src={blobUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200 dark:border-gray-600" />
  )
})

export default function LaporanKoordinatorPage() {
  const { showNotification } = useNotification()
  const user = useAuthStore((s) => s.user)
  const {
    showKoordinatorFilter,
    koordinatorFilterLocked,
    hasFilterKoordinatorSemua
  } = useUgtLaporanFiturAccess()
  const hijriyahOptions = useTahunAjaranStore((s) => s.options)
  const [searchParams, setSearchParams] = useSearchParams()
  const editParam = searchParams.get('edit')
  const baruParam = searchParams.get('baru')

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [madrasahList, setMadrasahList] = useState([])
  const [filterMadrasah, setFilterMadrasah] = useState('')
  const [filterKoordinator, setFilterKoordinator] = useState('')
  const [filterTa, setFilterTa] = useState('')
  const [filterBulan, setFilterBulan] = useState('')

  const [editingRow, setEditingRow] = useState(null)
  const [editFetchLoading, setEditFetchLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterMadrasah) params.id_madrasah = filterMadrasah
      if (hasFilterKoordinatorSemua && filterKoordinator) params.id_koordinator = filterKoordinator
      if (filterTa) params.id_tahun_ajaran = filterTa
      if (filterBulan) params.bulan = filterBulan
      const res = await ugtLaporanKoordinatorAPI.getAll(params)
      if (res?.success && Array.isArray(res.data)) {
        setList(res.data)
      } else {
        setList([])
        if (res?.message) showNotification(res.message, 'error')
      }
    } catch (e) {
      setList([])
      showNotification(e?.response?.data?.message || e?.message || 'Gagal memuat laporan', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterMadrasah, filterKoordinator, filterTa, filterBulan, hasFilterKoordinatorSemua, showNotification])

  useEffect(() => {
    loadList()
  }, [loadList])

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
  }, [setSearchParams])

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
    if (loading) return
    const found = list.find((x) => x.id === id)
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
  }, [editParam, baruParam, list, loading, setSearchParams])

  const isOffcanvasOpen = Boolean(baruParam === '1' || (editParam && editingRow))

  useEffect(() => {
    if (editParam != null || baruParam === '1') return
    if (editingRow == null) return
    setEditingRow(null)
  }, [editParam, baruParam, editingRow])

  const bulanOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const n = i + 1
      return { value: String(n), label: `${n} — ${getBulanName(n, 'hijriyah')}` }
    })
  }, [])

  const koordinatorFilterOptions = useMemo(() => {
    const map = new Map()
    for (const m of madrasahList) {
      const kid = m.id_koordinator
      if (kid == null || kid === '') continue
      const idNum = Number(kid)
      if (!Number.isFinite(idNum) || idNum <= 0) continue
      if (!map.has(idNum)) {
        const nama = (m.koordinator_nama || '').trim() || `ID ${idNum}`
        map.set(idNum, nama)
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'id'))
      .map(([id, nama]) => ({ id: String(id), nama }))
  }, [madrasahList])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex justify-end"
        >
          <button
            type="button"
            onClick={openBaru}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium shadow-sm"
          >
            Tambah laporan
          </button>
        </motion.div>

        <div className="flex flex-wrap gap-3 mb-4">
          {showKoordinatorFilter && (
            koordinatorFilterLocked ? (
              <select
                disabled
                title="Hanya data koordinator Anda. Untuk memfilter semua koordinator, aktifkan aksi di Pengaturan → Fitur (Laporan UGT)."
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 min-w-[200px] cursor-not-allowed opacity-90"
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
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[200px]"
              >
                <option value="">Semua koordinator</option>
                {koordinatorFilterOptions.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            )
          )}
          <select
            value={filterMadrasah}
            onChange={(e) => setFilterMadrasah(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[160px]"
          >
            <option value="">Semua madrasah</option>
            {madrasahList.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.nama || m.id}</option>
            ))}
          </select>
          <select
            value={filterTa}
            onChange={(e) => setFilterTa(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[140px]"
          >
            <option value="">Semua tahun ajaran</option>
            {hijriyahOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filterBulan}
            onChange={(e) => setFilterBulan(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[160px]"
          >
            <option value="">Semua bulan</option>
            {bulanOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Belum ada laporan. Klik &quot;Tambah laporan&quot; untuk mengisi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium w-14">Foto</th>
                    <th className="px-4 py-3 font-medium">Madrasah</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Koordinator</th>
                    <th className="px-4 py-3 font-medium hidden xl:table-cell">Dibuat oleh</th>
                    <th className="px-4 py-3 font-medium">Santri</th>
                    <th className="px-4 py-3 font-medium">TA</th>
                    <th className="px-4 py-3 font-medium">Bulan</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Usulan</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEdit(row)
                        }
                      }}
                      aria-label={`Buka ubah laporan: ${row.madrasah_nama || ''} — ${row.santri_nama || ''}`}
                      className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-900/30 cursor-pointer"
                    >
                      <td className="px-4 py-2 align-middle">
                        <LaporanFotoThumb fotoPath={row.foto} />
                      </td>
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.madrasah_nama || '—'}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 hidden lg:table-cell">
                        {row.koordinator_nama || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 hidden xl:table-cell">
                        {(row.pembuat_nama || '').trim() || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                        {row.santri_nama || '—'}
                        {row.santri_nis != null && row.santri_nis !== '' ? (
                          <span className="text-gray-500 dark:text-gray-400 text-xs block">NIS {row.santri_nis}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.id_tahun_ajaran || '—'}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {getBulanName(row.bulan, 'hijriyah')}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-xs truncate hidden md:table-cell" title={row.usulan || ''}>
                        {row.usulan || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        onSuccess={loadList}
      />
    </div>
  )
}
