import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { barangAPI } from '../../services/api'
import { useMybeddienToast } from '../../contexts/MybeddienToastContext'
import { syncBarangCache, getLocalBarangList, upsertLocalBarang } from '../../services/barangIndexedDb'
import BarangScannerSection from './components/BarangScannerSection'
import BarangMobileOffcanvas from './components/BarangMobileOffcanvas'
import BarangQrScanButton from './components/BarangQrScanButton'
import PenjualanCart from './components/PenjualanCart'
import PenjualanBayarOffcanvas from './components/PenjualanBayarOffcanvas'
import CariBarangOffcanvas from './components/CariBarangOffcanvas'

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function isDesktopLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

function CameraToggleIcon({ active, className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      {!active ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l16 16" />
      ) : null}
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

export default function Penjualan() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuthStore()
  const { showToast } = useMybeddienToast()
  const [cart, setCart] = useState([])
  const [lastItem, setLastItem] = useState(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [cariOpen, setCariOpen] = useState(false)
  const [bayarOpen, setBayarOpen] = useState(false)
  const [scannerExpanded, setScannerExpanded] = useState(true)
  const [mobileScannerExpanded, setMobileScannerExpanded] = useState(true)
  const [isDesktop, setIsDesktop] = useState(() => isDesktopLayout())
  const [lookupBusy, setLookupBusy] = useState(false)
  const desktopScannerRef = useRef(null)
  const mobileScannerRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!pathname.startsWith('/toko/penjualan')) {
      desktopScannerRef.current?.stop()
      mobileScannerRef.current?.stop()
    }
  }, [pathname])

  useEffect(() => {
    if (!scannerExpanded) desktopScannerRef.current?.stop()
  }, [scannerExpanded])

  useEffect(() => {
    if (!mobileScannerExpanded) mobileScannerRef.current?.stop()
  }, [mobileScannerExpanded])

  useEffect(() => {
    if (!scanOpen) mobileScannerRef.current?.stop()
  }, [scanOpen])

  useEffect(() => {
    if (!user?.has_toko) {
      navigate('/', { replace: true })
    }
  }, [user?.has_toko, navigate])

  // Prefetch cache barang di latar saat buka halaman kasir
  useEffect(() => {
    const pid = Number(user?.toko_id)
    if (pid > 0) void syncBarangCache(pid)
  }, [user?.toko_id])

  const addToCart = useCallback(
    (barang) => {
      if (!barang?.id) return
      const stok = Number(barang.stok ?? 0)
      if (stok <= 0) {
        showToast('Stok habis', 'error')
        return
      }
      setCart((prev) => {
        const existing = prev.find((x) => x.id === barang.id)
        if (existing) {
          if (existing.qty >= stok) {
            showToast('Stok tidak cukup', 'error')
            return prev
          }
          return prev.map((x) => (x.id === barang.id ? { ...x, qty: x.qty + 1, stok } : x))
        }
        return [
          ...prev,
          {
            id: barang.id,
            kode_barang: barang.kode_barang,
            nama_barang: barang.nama_barang,
            harga: Number(barang.harga) || 0,
            stok,
            qty: 1,
          },
        ]
      })
      setLastItem(barang)
    },
    [showToast]
  )

  const handleScanKode = useCallback(
    async (code) => {
      const kode = String(code || '').trim()
      if (!kode || lookupBusy) return
      setLookupBusy(true)
      try {
        const res = await barangAPI.getByKode(kode)
        if (res.success && res.data) {
          addToCart(res.data)
          showToast(res.data.nama_barang, 'success')
        } else {
          showToast(res.message || 'Barang tidak ditemukan', 'error')
        }
      } catch (err) {
        showToast(err.response?.data?.message || 'Barang tidak ditemukan', 'error')
      } finally {
        setLookupBusy(false)
      }
    },
    [addToCart, lookupBusy, showToast]
  )

  const onQtyChange = (id, qty) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((x) => x.id !== id))
      return
    }
    setCart((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x
        const max = x.stok ?? qty
        return { ...x, qty: Math.min(qty, max) }
      })
    )
  }

  const onRemove = (id) => setCart((prev) => prev.filter((x) => x.id !== id))

  const total = cart.reduce((s, x) => s + x.harga * x.qty, 0)
  const onPenjualanPage = pathname.startsWith('/toko/penjualan')
  const desktopScannerActive = isDesktop && onPenjualanPage && scannerExpanded && !cariOpen && !bayarOpen

  const handleBayarSuccess = () => {
    const pid = Number(user?.toko_id)
    const sold = cart.map((l) => ({ id: l.id, qty: l.qty }))
    if (pid > 0 && sold.length) {
      void (async () => {
        const rows = await getLocalBarangList(pid)
        const byId = new Map(rows.map((r) => [r.id, r]))
        for (const line of sold) {
          const cur = byId.get(line.id)
          if (cur) {
            await upsertLocalBarang(
              { ...cur, stok: Math.max(0, (Number(cur.stok) || 0) - line.qty) },
              pid
            )
          }
        }
        void syncBarangCache(pid)
      })()
    }
    setCart([])
    setLastItem(null)
  }

  const openCari = () => setCariOpen(true)

  if (!user?.has_toko) return null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2 py-3 sm:px-3 lg:flex-row lg:gap-4 lg:px-4 lg:pb-4">
        <PenjualanCart
          items={cart}
          onQtyChange={onQtyChange}
          onRemove={onRemove}
          total={total}
          onBayar={() => setBayarOpen(true)}
          onCariBarang={openCari}
          onScanKamera={() => {
            setMobileScannerExpanded(true)
            setScanOpen(true)
          }}
          disabled={lookupBusy}
        />

        <div className="hidden min-h-0 w-full shrink-0 flex-col gap-3 lg:flex lg:w-sm lg:max-w-sm">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Scan / Barang</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setScannerExpanded((v) => !v)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    scannerExpanded
                      ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                  title={scannerExpanded ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
                  aria-label={scannerExpanded ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
                  aria-pressed={scannerExpanded}
                >
                  <CameraToggleIcon active={scannerExpanded} className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={openCari}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/30"
                  title="Cari barang"
                  aria-label="Cari barang"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="shrink-0 border-b border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-950/50">
              <BarangScannerSection
                expanded={scannerExpanded}
                onScan={handleScanKode}
                scannerRef={desktopScannerRef}
                pageActive={desktopScannerActive}
                compact
              />
              {!scannerExpanded ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/80">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Kamera disembunyikan</p>
                  <BarangQrScanButton onClick={() => setScannerExpanded(true)} size="sm" />
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 dark:bg-gray-800/95">
              {lastItem ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/70">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                    Terakhir ditambah
                  </p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{lastItem.nama_barang}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{lastItem.kode_barang || '—'}</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatRupiah(lastItem.harga)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Stok {lastItem.stok ?? 0}</p>
                  <button
                    type="button"
                    onClick={() => addToCart(lastItem)}
                    className="mt-3 w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 dark:hover:bg-primary-500"
                  >
                    + Tambah lagi
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Scan barcode/QR atau buka cari barang untuk menambah ke keranjang.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <BarangMobileOffcanvas
        isOpen={scanOpen}
        onClose={() => {
          mobileScannerRef.current?.stop()
          setScanOpen(false)
        }}
        modeLabel="Scan"
        title="Scan barang"
        scannerExpanded={mobileScannerExpanded}
        onScan={handleScanKode}
        scannerRef={mobileScannerRef}
        showQrButton={!mobileScannerExpanded}
        onOpenQrScanner={() => setMobileScannerExpanded(true)}
      >
        <div className="space-y-3 p-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileScannerExpanded((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                mobileScannerExpanded
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
              }`}
            >
              <CameraToggleIcon active={mobileScannerExpanded} className="h-4 w-4" />
              {mobileScannerExpanded ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
            </button>
            <button
              type="button"
              onClick={() => {
                mobileScannerRef.current?.stop()
                setScanOpen(false)
                openCari()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              <SearchIcon className="h-4 w-4" />
              Cari
            </button>
          </div>
          {lastItem ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/80">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                Terakhir ditambah
              </p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{lastItem.nama_barang}</p>
              <p className="text-sm tabular-nums text-gray-800 dark:text-gray-200">{formatRupiah(lastItem.harga)}</p>
            </div>
          ) : null}
        </div>
      </BarangMobileOffcanvas>

      <CariBarangOffcanvas
        isOpen={cariOpen}
        onClose={() => setCariOpen(false)}
        onSelect={(b) => {
          addToCart(b)
          showToast(b.nama_barang || 'Ditambahkan', 'success')
        }}
      />

      <PenjualanBayarOffcanvas
        isOpen={bayarOpen}
        onClose={() => setBayarOpen(false)}
        cartItems={cart}
        total={total}
        onSuccess={handleBayarSuccess}
        onNotify={showToast}
      />
    </div>
  )
}
