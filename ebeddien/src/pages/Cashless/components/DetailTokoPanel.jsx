import { useCallback, useEffect, useState } from 'react'
import { cashlessAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import CashlessWithdrawPanel from './CashlessWithdrawPanel'

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Number(n))
}

function TokoHeroFoto({ fotoPath, compact = false }) {
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!fotoPath || typeof fotoPath !== 'string') {
      setBlobUrl(null)
      return
    }
    let cancelled = false
    cashlessAPI
      .fetchFotoBlobUrl(fotoPath)
      .then((url) => {
        if (!cancelled) setBlobUrl(url)
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [fotoPath])

  const heightClass = compact ? 'h-28' : 'h-40'

  if (!fotoPath) {
    return (
      <div
        className={`flex w-full items-center justify-center bg-gradient-to-br from-teal-100 to-teal-200 dark:from-teal-900/40 dark:to-teal-800/30 text-teal-600/50 dark:text-teal-400/40 ${heightClass}`}
      >
        <svg className={compact ? 'h-10 w-10' : 'h-16 w-16'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      </div>
    )
  }

  if (!blobUrl) {
    return <div className={`w-full animate-pulse bg-gray-200 dark:bg-gray-700 ${heightClass}`} />
  }

  return <img src={blobUrl} alt="Foto toko" className={`w-full object-cover ${heightClass}`} />
}

/**
 * Konten detail toko — dipakai side panel PC dan offcanvas mobile.
 */
export default function DetailTokoPanel({
  tokoId,
  onEdit,
  onChanged,
  refreshKey = 0,
  compact = false,
  emptyHint = 'Pilih toko di daftar kiri untuk melihat detail.',
}) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  const loadDetail = useCallback(async () => {
    if (!tokoId) return
    setLoading(true)
    setError(null)
    try {
      const res = await cashlessAPI.getTokoDetail(tokoId)
      if (res?.success && res.data) {
        setDetail(res.data)
      } else {
        setDetail(null)
        setError(res?.message || 'Gagal memuat detail toko')
      }
    } catch (err) {
      setDetail(null)
      setError(err.response?.data?.message || 'Gagal memuat detail toko')
    } finally {
      setLoading(false)
    }
  }, [tokoId])

  useEffect(() => {
    if (!tokoId) {
      setDetail(null)
      setError(null)
      return
    }
    loadDetail()
  }, [tokoId, loadDetail, refreshKey])

  const toko = detail?.toko
  const account = detail?.account
  const hasAccount = Boolean(detail?.has_account && account)
  const barangCount = detail?.barang_count ?? 0
  const barangTerbaru = Array.isArray(detail?.barang_terbaru) ? detail.barang_terbaru : []

  const handleBuatAkun = async () => {
    if (!tokoId || creatingAccount) return
    setCreatingAccount(true)
    try {
      const res = await cashlessAPI.createAccount({
        entity_type: 'PEDAGANG',
        entity_id: tokoId,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal membuat akun cashless', 'error')
        return
      }
      showNotification('Akun cashless toko berhasil dibuat', 'success')
      await loadDetail()
      onChanged?.()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal membuat akun cashless', 'error')
    } finally {
      setCreatingAccount(false)
    }
  }

  const handleEdit = () => {
    if (!toko) return
    onEdit?.(toko)
  }

  if (!tokoId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Belum ada toko dipilih</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading && !detail ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-teal-600" />
          </div>
        ) : error && !detail ? (
          <div className="p-4">
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </p>
            <button
              type="button"
              onClick={loadDetail}
              className="mt-3 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              Coba lagi
            </button>
          </div>
        ) : toko ? (
          <>
            <TokoHeroFoto fotoPath={toko.foto_path} compact={compact} />

            <div className="space-y-4 p-4">
              <div>
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">{toko.nama_toko || '—'}</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Kode {toko.kode_toko || '—'}
                  {toko.tanggal_dibuat
                    ? ` · Dibuat ${new Date(toko.tanggal_dibuat).toLocaleDateString('id-ID')}`
                    : ''}
                </p>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  PJ: {toko.penanggung_jawab_nama || '—'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Login: {toko.user_username || (toko.id_users ? '—' : 'Belum dihubungkan')}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Akun cashless
                </p>
                {hasAccount ? (
                  <div className="mt-2 space-y-1">
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{account.code}</p>
                    <p className="text-lg font-bold tabular-nums text-teal-600 dark:text-teal-400">
                      {formatRupiah(account.balance_cached)}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Saldo wallet toko</p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-amber-800 dark:text-amber-200">Toko ini belum punya akun cashless.</p>
                    <button
                      type="button"
                      disabled={creatingAccount}
                      onClick={handleBuatAkun}
                      className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {creatingAccount ? 'Membuat…' : 'Buat akun cashless'}
                    </button>
                  </div>
                )}
              </div>

              {hasAccount ? (
                <div className="h-72 min-h-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex h-full min-h-0 flex-col p-3">
                    <p className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Tarik tunai
                    </p>
                    <div className="min-h-0 flex-1">
                      <CashlessWithdrawPanel
                        entity="toko"
                        account={account}
                        tokoId={tokoId}
                        onSuccess={() => {
                          loadDetail()
                          onChanged?.()
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Barang</p>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                    {barangCount} item
                  </span>
                </div>
                {barangTerbaru.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    Belum ada barang terdaftar di toko ini.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                    {barangTerbaru.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-start justify-between gap-3 bg-white px-3 py-2.5 dark:bg-gray-800/80"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                            {b.nama_barang || '—'}
                          </p>
                          <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                            {b.kode_barang || '—'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatRupiah(b.harga)}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">Stok {b.stok ?? 0}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {barangCount > 5 ? (
                  <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    Menampilkan 5 barang terbaru dari {barangCount}.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {toko ? (
        <div className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleEdit}
            className="w-full rounded-xl border border-teal-600 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:bg-gray-800 dark:text-teal-300 dark:hover:bg-teal-900/20"
          >
            Edit toko
          </button>
        </div>
      ) : null}
    </div>
  )
}
