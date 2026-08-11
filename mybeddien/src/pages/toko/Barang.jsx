import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { barangAPI } from '../../services/api'
import { upsertLocalBarang, removeLocalBarang, syncBarangCache } from '../../services/barangIndexedDb'
import BarangScannerSection from './components/BarangScannerSection'
import BarangListItem from './components/BarangListItem'
import BarangDetailPanel from './components/BarangDetailPanel'
import BarangMobileOffcanvas from './components/BarangMobileOffcanvas'
import BarangDetailSuccess from './components/BarangDetailSuccess'
import BarangDetailTabs from './components/BarangDetailTabs'

const EMPTY_FORM = { nama_barang: '', harga: '', kode_barang: '', keterangan: '', stok_awal: '' }

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function isDesktopBarangLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

export default function Barang() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuthStore()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [isDesktop, setIsDesktop] = useState(() => isDesktopBarangLayout())
  const [detailTab, setDetailTab] = useState('edit')
  const [scannerPinned, setScannerPinned] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(true)
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
    if (!pathname.startsWith('/toko/barang')) {
      desktopScannerRef.current?.stop()
    }
  }, [pathname])

  const loadBarang = async (searchTerm = search, { silent = false } = {}) => {
    if (!user?.has_toko) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await barangAPI.getList(searchTerm ? { search: searchTerm } : {})
      if (res.success && Array.isArray(res.data)) setList(res.data)
      else setList([])
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data barang')
      setList([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.has_toko) {
      navigate('/', { replace: true })
      return
    }
    loadBarang()
    const pid = Number(user?.toko_id)
    if (pid > 0) void syncBarangCache(pid)
  }, [user?.has_toko, user?.toko_id])

  const patchForm = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }, [])

  const openTambah = useCallback(() => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
    setDetailTab('edit')
    setScannerPinned(false)
    setError('')
    setSuccess('')
  }, [])

  const openEdit = useCallback((b) => {
    setEditing(b)
    setForm({
      nama_barang: b.nama_barang || '',
      harga: b.harga != null ? String(b.harga) : '',
      kode_barang: b.kode_barang || '',
      keterangan: b.keterangan || '',
      stok_awal: '',
    })
    setFormOpen(true)
    setDetailTab((tab) => (tab === 'stok' ? 'stok' : 'edit'))
    setScannerPinned(false)
    setError('')
    setSuccess('')
  }, [])

  const handleSelectBarang = useCallback(
    (b) => {
      openEdit(b)
    },
    [openEdit]
  )

  const closeForm = useCallback(() => {
    mobileScannerRef.current?.stop()
    setFormOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setDetailTab('edit')
    setScannerPinned(false)
    setSuccess('')
  }, [])

  useEffect(() => {
    if (!success || !formOpen) return undefined
    const id = window.setTimeout(() => {
      mobileScannerRef.current?.stop()
      setSuccess('')
      setFormOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      setScannerPinned(false)
    }, 2400)
    return () => window.clearTimeout(id)
  }, [success, formOpen])

  const handleScanKode = useCallback(
    (raw) => {
      const kode = String(raw || '').trim()
      if (!kode) return
      const found = list.find((b) => String(b.kode_barang || '').trim() === kode)
      if (found) {
        openEdit(found)
        return
      }
      if (!formOpen) {
        setEditing(null)
        setForm({ ...EMPTY_FORM, kode_barang: kode })
        setFormOpen(true)
      } else {
        patchForm({ kode_barang: kode })
      }
    },
    [list, formOpen, openEdit, patchForm]
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama = (form.nama_barang || '').trim()
    const hargaNum = parseFloat(form.harga)
    if (!nama) {
      setError('Nama barang wajib diisi')
      return
    }
    if (Number.isNaN(hargaNum) || hargaNum < 0) {
      setError('Harga wajib diisi dan tidak boleh negatif')
      return
    }
    const kode = (form.kode_barang || '').trim()
    if (editing && !kode) {
      setError('Kode/QR/barcode wajib diisi')
      return
    }
    let stokAwal = 0
    if (!editing) {
      const rawStok = String(form.stok_awal ?? '').trim()
      if (rawStok !== '') {
        stokAwal = parseInt(rawStok, 10)
        if (!Number.isFinite(stokAwal) || stokAwal < 0) {
          setError('Stok awal tidak boleh negatif')
          return
        }
      }
    }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        const res = await barangAPI.update(editing.id, {
          nama_barang: nama,
          harga: hargaNum,
          kode_barang: kode,
          keterangan: (form.keterangan || '').trim() || null,
        })
        if (res.success) {
          setSuccess(res.message || 'Barang berhasil diperbarui')
          void upsertLocalBarang(
            {
              id: editing.id,
              pedagang_id: user?.toko_id,
              nama_barang: nama,
              harga: hargaNum,
              kode_barang: kode,
              keterangan: (form.keterangan || '').trim() || null,
              stok: editing.stok ?? 0,
              urutan: editing.urutan ?? 0,
              aktif: editing.aktif ?? 1,
              tanggal_update: new Date().toISOString().slice(0, 19).replace('T', ' '),
            },
            user?.toko_id
          )
          void loadBarang(search, { silent: true })
        } else {
          setError(res.message || 'Gagal memperbarui')
        }
      } else {
        const res = await barangAPI.create({
          nama_barang: nama,
          harga: hargaNum,
          kode_barang: kode || undefined,
          keterangan: (form.keterangan || '').trim() || null,
          stok_awal: stokAwal,
        })
        if (res.success) {
          setSuccess(res.message || 'Barang berhasil ditambahkan')
          if (res.data) {
            void upsertLocalBarang({ ...res.data, pedagang_id: user?.toko_id }, user?.toko_id)
          }
          void loadBarang(search, { silent: true })
        } else {
          setError(res.message || 'Gagal menambahkan')
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus barang ini?')) return
    setDeletingId(id)
    setError('')
    try {
      const res = await barangAPI.delete(id)
      if (res.success) {
        setSuccess(res.message || 'Barang berhasil dihapus')
        void removeLocalBarang(id)
        void loadBarang(search, { silent: true })
      } else {
        setError(res.message || 'Gagal menghapus')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus')
    } finally {
      setDeletingId(null)
    }
  }

  const handleStokChange = useCallback(
    (newStok) => {
      if (!editing?.id) return
      setEditing((prev) => (prev ? { ...prev, stok: newStok } : prev))
      setList((prev) => prev.map((b) => (b.id === editing.id ? { ...b, stok: newStok } : b)))
      void upsertLocalBarang(
        { ...editing, stok: newStok, pedagang_id: user?.toko_id },
        user?.toko_id
      )
    },
    [editing, user?.toko_id]
  )

  const kodeTerisi = String(form.kode_barang || '').trim() !== ''
  const shouldCollapseScanner = formOpen && (Boolean(editing) || kodeTerisi)

  useEffect(() => {
    if (!shouldCollapseScanner) setScannerPinned(false)
  }, [shouldCollapseScanner])

  const scannerExpanded = !formOpen || !shouldCollapseScanner || scannerPinned

  const handleOpenQrScanner = useCallback(() => {
    setScannerPinned(true)
    setCameraOpen(true)
  }, [])

  const handleToggleCamera = useCallback(() => {
    const showing = scannerExpanded && cameraOpen
    if (showing) {
      setCameraOpen(false)
    } else {
      setScannerPinned(true)
      setCameraOpen(true)
    }
  }, [scannerExpanded, cameraOpen])
  if (!user?.has_toko) return null

  const onBarangPage = pathname.startsWith('/toko/barang')
  const desktopScannerActive = isDesktop && onBarangPage
  const showQrButton = formOpen && !scannerExpanded
  const mobileOffcanvasOpen = formOpen && !isDesktop
  const formModeLabel = editing ? 'Edit barang' : 'Baru'
  const formHeading = editing
    ? (form.nama_barang || editing.nama_barang || 'Barang').trim()
    : 'Tambah barang'
  const formPanelProps = {
    editing,
    form,
    onFormChange: patchForm,
    saving,
    deletingId,
    onSubmit: handleSubmit,
    onDelete: handleDelete,
    onCancel: closeForm,
    showCancel: !isDesktop,
    stok: editing?.stok ?? 0,
    onStokChange: handleStokChange,
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && !formOpen && (
        <div className="shrink-0 px-2 pt-2 sm:px-3 lg:px-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2 py-3 sm:px-3 lg:flex-row lg:gap-4 lg:px-4 lg:pb-4">
        {/* Kiri: daftar barang */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
          <div className="shrink-0 space-y-2.5 border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between gap-2">
              <h1 className="min-w-0 text-lg font-semibold text-gray-900 dark:text-white">Data Barang</h1>
              {!loading && (
                <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {list.length} barang{search ? ' (hasil pencarian)' : ''}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadBarang(search)}
                placeholder="Cari nama atau kode/QR/barcode…"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => loadBarang(search)}
                className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cari
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {search
                    ? 'Tidak ada barang yang cocok dengan pencarian.'
                    : isDesktop
                      ? 'Belum ada barang. Gunakan tombol di panel kanan untuk menambah.'
                      : 'Belum ada barang. Ketuk tombol + di bawah untuk menambah.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((b) => (
                  <li key={b.id}>
                    <BarangListItem
                      item={b}
                      active={editing?.id === b.id && formOpen}
                      onSelect={handleSelectBarang}
                      formatRupiah={formatRupiah}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Kanan: scan + form (desktop) */}
        <div className="hidden min-h-0 w-full shrink-0 flex-col gap-3 lg:flex lg:w-sm lg:max-w-sm">
          <BarangScannerSection
            expanded={scannerExpanded && cameraOpen}
            onScan={handleScanKode}
            scannerRef={desktopScannerRef}
            pageActive={desktopScannerActive}
          />

          <BarangDetailPanel
            formOpen={formOpen}
            formModeLabel={formModeLabel}
            formHeading={formHeading}
            success={success}
            error={error}
            onClose={closeForm}
            onTambah={openTambah}
            formPanelProps={formPanelProps}
            detailTab={detailTab}
            onDetailTabChange={setDetailTab}
            cameraOpen={cameraOpen && scannerExpanded}
            onToggleCamera={handleToggleCamera}
          />
        </div>
      </div>

      <BarangMobileOffcanvas
        isOpen={mobileOffcanvasOpen}
        title={formHeading}
        modeLabel={formModeLabel}
        onClose={closeForm}
        onScan={handleScanKode}
        closeDisabled={Boolean(success)}
        scannerRef={mobileScannerRef}
        scannerExpanded={scannerExpanded}
        showQrButton={showQrButton}
        onOpenQrScanner={handleOpenQrScanner}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : null}
          <BarangDetailTabs
            editing={formPanelProps.editing}
            detailTab={detailTab}
            onDetailTabChange={setDetailTab}
            formPanelProps={formPanelProps}
            showCancel
          />
          <AnimatePresence>{success ? <BarangDetailSuccess message={success} /> : null}</AnimatePresence>
        </div>
      </BarangMobileOffcanvas>

      {!isDesktop && !mobileOffcanvasOpen ? (
        <button
          type="button"
          onClick={openTambah}
          className="fixed right-4 z-110 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-2xl font-medium text-white shadow-[0_10px_28px_-4px_rgba(37,99,235,0.55),0_14px_36px_-6px_rgba(0,0,0,0.28)] ring-1 ring-white/25 transition-[transform,box-shadow,background-color] hover:bg-primary-700 hover:shadow-[0_12px_32px_-4px_rgba(37,99,235,0.6),0_16px_40px_-6px_rgba(0,0,0,0.32)] active:scale-95 active:bg-primary-800 lg:hidden"
          style={{ bottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
          aria-label="Tambah barang"
        >
          +
        </button>
      ) : null}
    </div>
  )
}
