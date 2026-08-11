import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { penjualanAPI } from '../../services/api'
import RiwayatDetailContent, { formatRupiah, formatWaktu } from './components/RiwayatDetailContent'
import RiwayatDetailOffcanvas from './components/RiwayatDetailOffcanvas'

const DAY_OPTIONS = [
  { value: 1, label: 'Hari ini' },
  { value: 7, label: '7 hari' },
  { value: 30, label: '30 hari' },
]

function isDesktopLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

export default function RiwayatPenjualan() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [days, setDays] = useState(1)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [isDesktop, setIsDesktop] = useState(() => isDesktopLayout())
  const [search, setSearch] = useState('')

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!user?.has_toko) {
      navigate('/', { replace: true })
    }
  }, [user?.has_toko, navigate])

  const loadList = useCallback(async () => {
    if (!user?.has_toko) return
    setLoading(true)
    setListError('')
    try {
      const res = await penjualanAPI.getList({ days })
      if (res?.success && Array.isArray(res.data)) {
        setList(res.data)
      } else {
        setList([])
        setListError(res?.message || 'Gagal memuat riwayat')
      }
    } catch (err) {
      setList([])
      setListError(err.response?.data?.message || 'Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }, [user?.has_toko, days])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null)
      setDetailError('')
      return
    }
    setDetailLoading(true)
    setDetailError('')
    try {
      const res = await penjualanAPI.getDetail(id)
      if (res?.success && res.data) {
        setDetail(res.data)
      } else {
        setDetail(null)
        setDetailError(res?.message || 'Gagal memuat detail')
      }
    } catch (err) {
      setDetail(null)
      setDetailError(err.response?.data?.message || 'Gagal memuat detail')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleSelect = (row) => {
    const id = row?.id
    if (!id) return
    setSelectedId(id)
    void loadDetail(id)
  }

  const handleCloseDetail = () => {
    setSelectedId(null)
    setDetail(null)
    setDetailError('')
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? list.filter((r) => {
        const nama = String(r.santri_nama || '').toLowerCase()
        const nis = String(r.santri_nis || '').toLowerCase()
        return nama.includes(q) || nis.includes(q)
      })
    : list

  if (!user?.has_toko) return null

  const mobileOpen = Boolean(selectedId) && !isDesktop

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {listError ? (
        <div className="shrink-0 px-2 pt-2 sm:px-3 lg:px-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {listError}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2 py-3 sm:px-3 lg:flex-row lg:gap-4 lg:px-4 lg:pb-4">
        {/* Kiri: daftar transaksi */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
          <div className="shrink-0 space-y-2.5 border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between gap-2">
              <h1 className="min-w-0 text-lg font-semibold text-gray-900 dark:text-white">
                Riwayat transaksi
              </h1>
              {!loading ? (
                <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {filtered.length} transaksi
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((opt) => {
                const active = days === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDays(opt.value)
                      handleCloseDetail()
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => loadList()}
                className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Muat ulang
              </button>
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIS pembeli…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {q ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi pada periode ini.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((row) => {
                  const active = selectedId === row.id
                  const itemLabel =
                    row.item_qty > 0
                      ? `${row.item_qty} item`
                      : row.item_count > 0
                        ? `${row.item_count} jenis`
                        : null
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(row)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400/50 dark:border-primary-500 dark:bg-primary-900/25'
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {row.santri_nama || 'Pembeli'}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              NIS {row.santri_nis || '—'}
                              {itemLabel ? ` · ${itemLabel}` : ''}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                              {formatWaktu(row.transaksi_at)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">
                            {formatRupiah(row.nominal)}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Kanan: detail (desktop) */}
        <div className="hidden min-h-0 w-full shrink-0 flex-col lg:flex lg:w-sm lg:max-w-sm">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
            {selectedId ? (
              <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Tutup
                </button>
              </div>
            ) : null}
            <RiwayatDetailContent
              detail={selectedId ? detail : null}
              loading={Boolean(selectedId) && detailLoading}
              error={selectedId ? detailError : ''}
            />
          </div>
        </div>
      </div>

      <RiwayatDetailOffcanvas
        isOpen={mobileOpen}
        onClose={handleCloseDetail}
        detail={detail}
        loading={detailLoading}
        error={detailError}
      />
    </div>
  )
}
