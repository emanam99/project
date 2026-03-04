import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI, manageUsersAPI } from '../../services/api'
import CetakKartuCashlessOffcanvas from './components/CetakKartuCashlessOffcanvas'

const ENTITY_LABELS = { SYSTEM: 'Sistem', SANTRI: 'Santri', PEDAGANG: 'Pedagang' }
const TYPE_LABELS = { ASSET: 'Asset', LIABILITY: 'Liability', INCOME: 'Income', EXPENSE: 'Expense', EQUITY: 'Equity' }

export default function PembuatanAkunCashless() {
  const { showNotification } = useNotification()
  const [accounts, setAccounts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntityType, setFilterEntityType] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Buat akun: mode 'toko' | 'santri'
  const [createMode, setCreateMode] = useState('toko')
  const [tokoList, setTokoList] = useState([])
  const [tokoWithoutAccount, setTokoWithoutAccount] = useState([])
  const [santriSearch, setSantriSearch] = useState('')
  const [santriOptions, setSantriOptions] = useState([])
  const [santriWithoutAccount, setSantriWithoutAccount] = useState([])
  const [selectedTokoId, setSelectedTokoId] = useState('')
  const [selectedSantriId, setSelectedSantriId] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const [loadingToko, setLoadingToko] = useState(false)
  const [loadingSantri, setLoadingSantri] = useState(false)
  const [cetakOffcanvasOpen, setCetakOffcanvasOpen] = useState(false)
  const [cetakAccountId, setCetakAccountId] = useState(null)

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await cashlessAPI.getAccountsList({
        page: pagination.page,
        limit: pagination.limit,
        entity_type: filterEntityType || undefined,
        search: searchInput.trim() || undefined
      })
      if (res?.success) {
        setAccounts(res.data || [])
        setPagination(prev => ({ ...prev, ...(res.pagination || {}) }))
      } else {
        setAccounts([])
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat daftar akun')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, filterEntityType, searchInput])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // Toko yang belum punya akun wallet
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadingToko(true)
      try {
        const [tokoRes, accRes] = await Promise.all([
          cashlessAPI.getTokoList({ limit: 500 }),
          cashlessAPI.getAccountsList({ limit: 500, entity_type: 'PEDAGANG' })
        ])
        if (cancelled) return
        const tokos = tokoRes?.data || []
        const accEntityIds = new Set((accRes?.data || []).map(a => a.entity_id).filter(Boolean))
        setTokoList(tokos)
        setTokoWithoutAccount(tokos.filter(t => !accEntityIds.has(t.id)))
      } catch (_) {
        if (!cancelled) setTokoWithoutAccount([])
      } finally {
        if (!cancelled) setLoadingToko(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [accounts.length])

  // Santri options (dengan filter yang belum punya akun)
  useEffect(() => {
    if (santriSearch.trim().length < 2) {
      setSantriOptions([])
      setSantriWithoutAccount([])
      return
    }
    let cancelled = false
    async function run() {
      setLoadingSantri(true)
      try {
        const [santriRes, accRes] = await Promise.all([
          manageUsersAPI.getSantriOptionsForMybeddian({ search: santriSearch.trim(), limit: 50 }),
          cashlessAPI.getAccountsList({ limit: 500, entity_type: 'SANTRI' })
        ])
        if (cancelled) return
        const list = santriRes?.data || []
        const accEntityIds = new Set((accRes?.data || []).map(a => a.entity_id).filter(Boolean))
        setSantriOptions(list)
        setSantriWithoutAccount(list.filter(s => !accEntityIds.has(s.id)))
      } catch (_) {
        if (!cancelled) setSantriOptions([])
        if (!cancelled) setSantriWithoutAccount([])
      } finally {
        if (!cancelled) setLoadingSantri(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [santriSearch, accounts.length])

  const handleCreateFromToko = async (e) => {
    e.preventDefault()
    const id = selectedTokoId ? parseInt(selectedTokoId, 10) : 0
    if (!id) {
      showNotification('Pilih toko terlebih dahulu.', 'error')
      return
    }
    try {
      setCreateSaving(true)
      await cashlessAPI.createAccount({ entity_type: 'PEDAGANG', entity_id: id })
      showNotification('Akun wallet untuk toko berhasil dibuat.', 'success')
      setSelectedTokoId('')
      loadAccounts()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal membuat akun', 'error')
    } finally {
      setCreateSaving(false)
    }
  }

  const handleCreateFromSantri = async (e) => {
    e.preventDefault()
    const id = selectedSantriId ? parseInt(selectedSantriId, 10) : 0
    if (!id) {
      showNotification('Pilih santri terlebih dahulu.', 'error')
      return
    }
    try {
      setCreateSaving(true)
      await cashlessAPI.createAccount({ entity_type: 'SANTRI', entity_id: id })
      showNotification('Akun wallet untuk santri berhasil dibuat.', 'success')
      setSelectedSantriId('')
      setSantriSearch('')
      setSantriWithoutAccount([])
      loadAccounts()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal membuat akun', 'error')
    } finally {
      setCreateSaving(false)
    }
  }

  const formatSaldo = (n) => {
    if (n == null || n === undefined) return '0'
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Buat akun baru - di atas */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Buat akun wallet baru</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pilih dari toko (pedagang) atau santri yang belum punya akun.</p>
        </div>
        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setCreateMode('toko')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${createMode === 'toko' ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              Dari toko
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('santri')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${createMode === 'santri' ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              Dari santri
            </button>
          </div>

          {createMode === 'toko' && (
            <form onSubmit={handleCreateFromToko} className="flex flex-wrap gap-3 items-end">
              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Toko (yang belum punya akun)</label>
                <select
                  value={selectedTokoId}
                  onChange={(e) => setSelectedTokoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  disabled={loadingToko}
                >
                  <option value="">-- Pilih toko --</option>
                  {tokoWithoutAccount.map(t => (
                    <option key={t.id} value={t.id}>{t.nama_toko} ({t.kode_toko})</option>
                  ))}
                </select>
                {loadingToko && <p className="text-xs text-gray-500 mt-1">Memuat toko...</p>}
                {!loadingToko && tokoWithoutAccount.length === 0 && tokoList.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">Semua toko sudah punya akun.</p>}
              </div>
              <button
                type="submit"
                disabled={createSaving || !selectedTokoId || tokoWithoutAccount.length === 0}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {createSaving ? 'Membuat...' : 'Buat akun wallet'}
              </button>
            </form>
          )}

          {createMode === 'santri' && (
            <form onSubmit={handleCreateFromSantri} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cari santri (min. 2 karakter)</label>
                <input
                  type="text"
                  value={santriSearch}
                  onChange={(e) => setSantriSearch(e.target.value)}
                  placeholder="Nama atau NIS..."
                  className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              {santriSearch.trim().length >= 2 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Santri yang belum punya akun</label>
                  <select
                    value={selectedSantriId}
                    onChange={(e) => setSelectedSantriId(e.target.value)}
                    className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    disabled={loadingSantri}
                  >
                    <option value="">-- Pilih santri --</option>
                    {santriWithoutAccount.map(s => (
                      <option key={s.id} value={s.id}>{s.nama} {s.nis ? `(${s.nis})` : ''}</option>
                    ))}
                  </select>
                  {loadingSantri && <p className="text-xs text-gray-500 mt-1">Mencari...</p>}
                  {!loadingSantri && santriSearch && santriWithoutAccount.length === 0 && santriOptions.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">Santri yang ditemukan sudah punya akun.</p>}
                  {!loadingSantri && santriSearch && santriOptions.length === 0 && <p className="text-xs text-gray-500">Tidak ada santri ditemukan.</p>}
                </div>
              )}
              <button
                type="submit"
                disabled={createSaving || !selectedSantriId}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {createSaving ? 'Membuat...' : 'Buat akun wallet'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Filter & search */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <select
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="">Semua tipe</option>
          <option value="SYSTEM">Sistem</option>
          <option value="SANTRI">Santri</option>
          <option value="PEDAGANG">Pedagang</option>
        </select>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari kode atau nama akun..."
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-56"
        />
        <button
          type="button"
          onClick={() => loadAccounts()}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Daftar akun aktif - tampilan modern */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden mb-8">
        <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 text-teal-600 dark:text-teal-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Daftar akun aktif</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {pagination.total} akun · halaman {pagination.page}/{pagination.total_pages || 1}
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-10 h-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Memuat daftar akun...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              <p className="text-sm text-red-600 dark:text-red-400 text-center px-4">{error}</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2m-4 0H8m4 0V8" /></svg>
              </span>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">Belum ada akun. Buat dari toko atau santri di atas.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 font-medium">
                  <th className="px-5 py-3.5 rounded-tl-lg">Kode</th>
                  <th className="px-5 py-3.5">Nama</th>
                  <th className="px-5 py-3.5">Tipe</th>
                  <th className="px-5 py-3.5">Entity</th>
                  <th className="px-5 py-3.5">Label</th>
                  <th className="px-5 py-3.5 text-right">Saldo</th>
                  <th className="px-5 py-3.5 rounded-tr-lg text-center">Kartu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {accounts.map((a) => {
                  const qrValue = a.card_uid ? `${a.code}|${a.card_uid}` : a.code
                  const entityColor = a.entity_type === 'PEDAGANG' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : a.entity_type === 'SANTRI' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">{a.code}</span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">{a.name}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-gray-600 dark:text-gray-300">{TYPE_LABELS[a.type] || a.type}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${entityColor}`}>
                          {ENTITY_LABELS[a.entity_type] || a.entity_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{a.entity_label || '–'}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono font-semibold text-gray-900 dark:text-white tabular-nums">Rp {formatSaldo(a.balance_cached)}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1.5">
                          <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-2 bg-white dark:bg-gray-700/50 shadow-sm inline-flex items-center gap-2">
                            <QRCodeSVG value={qrValue} size={36} level="M" includeMargin={false} />
                            <span className="font-mono text-[10px] text-gray-600 dark:text-gray-300 max-w-[64px] break-all leading-tight">{a.code}</span>
                          </div>
                          {(a.entity_type === 'SANTRI' || a.entity_type === 'PEDAGANG') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCetakAccountId(a.id)
                                setCetakOffcanvasOpen(true)
                              }}
                              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline"
                            >
                              Cetak kartu
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {pagination.total_pages > 1 && (
          <div className="px-5 py-3.5 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Total <strong className="text-gray-700 dark:text-gray-200">{pagination.total}</strong> akun</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Sebelumnya
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 min-w-[80px] text-center">
                {pagination.page} / {pagination.total_pages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      </div>
      </div>

      <CetakKartuCashlessOffcanvas
        isOpen={cetakOffcanvasOpen}
        onClose={() => setCetakOffcanvasOpen(false)}
        accountId={cetakAccountId}
      />
    </div>
  )
}
