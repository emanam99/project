import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { cashlessAPI } from '../../services/api'
import PembuatanAkunSidePanel from './components/PembuatanAkunSidePanel'

const ENTITY_LABELS = { SYSTEM: 'Sistem', SANTRI: 'Santri', PEDAGANG: 'Toko' }
const ACCOUNTS_FETCH_LIMIT = 500
const ACCOUNTS_PAGE_SIZE = 20

function isDesktopLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

function accountMatchesSearch(account, search) {
  const q = String(search || '').trim().toLowerCase()
  if (!q) return true
  const hay = [account?.code, account?.name, account?.entity_label, account?.kode_toko]
    .map((v) => String(v || '').toLowerCase())
  return hay.some((h) => h.includes(q))
}

export default function PembuatanAkunCashless() {
  const { showNotification } = useNotification()
  const [accountsAll, setAccountsAll] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntityType, setFilterEntityType] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const closeMobileDetail = useOffcanvasBackClose(mobileDetailOpen, () => setMobileDetailOpen(false))

  const [tokoWithoutAccount, setTokoWithoutAccount] = useState([])
  const [selectedTokoId, setSelectedTokoId] = useState('')
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, () => setSantriPickerOpen(false))
  const [createSaving, setCreateSaving] = useState(false)
  const [loadingToko, setLoadingToko] = useState(false)
  const [ledgerSummary, setLedgerSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(true)

  const filteredAccounts = useMemo(() => {
    let list = accountsAll
    if (filterEntityType) {
      list = list.filter((a) => a.entity_type === filterEntityType)
    }
    return list.filter((a) => accountMatchesSearch(a, searchInput))
  }, [accountsAll, filterEntityType, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNTS_PAGE_SIZE) || 1)
  const safePage = Math.min(page, totalPages)

  const accounts = useMemo(() => {
    const start = (safePage - 1) * ACCOUNTS_PAGE_SIZE
    return filteredAccounts.slice(start, start + ACCOUNTS_PAGE_SIZE)
  }, [filteredAccounts, safePage])

  useEffect(() => {
    setPage(1)
  }, [searchInput, filterEntityType])

  const selectedAccount = useMemo(
    () => accountsAll.find((a) => a.id === selectedAccountId) ?? null,
    [accountsAll, selectedAccountId]
  )

  const santriIdsWithAccount = useMemo(() => {
    return new Set(
      accountsAll.filter((a) => a.entity_type === 'SANTRI' && a.entity_id).map((a) => Number(a.entity_id))
    )
  }, [accountsAll])

  const loadLedgerSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const res = await cashlessAPI.getLedgerSummary()
      setLedgerSummary(res?.success ? res.data : null)
    } catch {
      setLedgerSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await cashlessAPI.getAccountsList({
        page: 1,
        limit: ACCOUNTS_FETCH_LIMIT,
      })
      if (res?.success) {
        setAccountsAll(res.data || [])
      } else {
        setAccountsAll([])
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat daftar akun')
      setAccountsAll([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    loadLedgerSummary()
  }, [loadLedgerSummary, accountsAll.length])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadingToko(true)
      try {
        const [tokoRes, accRes] = await Promise.all([
          cashlessAPI.getTokoList({ limit: 500 }),
          cashlessAPI.getAccountsList({ limit: 500, entity_type: 'PEDAGANG' }),
        ])
        if (cancelled) return
        const tokos = tokoRes?.data || []
        const accEntityIds = new Set((accRes?.data || []).map((a) => a.entity_id).filter(Boolean))
        setTokoWithoutAccount(tokos.filter((t) => !accEntityIds.has(t.id)))
      } catch {
        if (!cancelled) setTokoWithoutAccount([])
      } finally {
        if (!cancelled) setLoadingToko(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [accountsAll.length])

  const selectAccount = useCallback((account) => {
    setSelectedAccountId(account?.id ?? null)
    if (!isDesktopLayout()) setMobileDetailOpen(true)
  }, [])

  const refreshAfterMutation = useCallback(
    async (balanceCached) => {
      await loadAccounts()
      await loadLedgerSummary()
      if (selectedAccountId != null && balanceCached != null) {
        setAccountsAll((prev) =>
          prev.map((a) => (a.id === selectedAccountId ? { ...a, balance_cached: balanceCached } : a))
        )
      }
    },
    [loadAccounts, loadLedgerSummary, selectedAccountId]
  )

  const handleAccountRefresh = useCallback(
    (data) => {
      void refreshAfterMutation(data?.balance_cached)
    },
    [refreshAfterMutation]
  )

  const handleBuatAkunToko = async () => {
    const id = selectedTokoId ? parseInt(selectedTokoId, 10) : 0
    if (!id) {
      showNotification('Pilih toko terlebih dahulu.', 'error')
      return
    }
    try {
      setCreateSaving(true)
      const res = await cashlessAPI.createAccount({ entity_type: 'PEDAGANG', entity_id: id })
      showNotification('Akun wallet untuk toko berhasil dibuat.', 'success')
      setSelectedTokoId('')
      await loadAccounts()
      await loadLedgerSummary()
      if (res?.data?.id) {
        setSelectedAccountId(res.data.id)
        if (!isDesktopLayout()) setMobileDetailOpen(true)
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal membuat akun', 'error')
    } finally {
      setCreateSaving(false)
    }
  }

  const handlePickSantri = useCallback(
    async (santri) => {
      const id = santri?.id != null ? Number(santri.id) : 0
      if (!id) return
      if (santriIdsWithAccount.has(id)) {
        showNotification('Santri ini sudah punya akun wallet.', 'error')
        setSantriPickerOpen(false)
        const existing = accountsAll.find((a) => a.entity_type === 'SANTRI' && Number(a.entity_id) === id)
        if (existing) selectAccount(existing)
        return
      }
      try {
        setCreateSaving(true)
        setSantriPickerOpen(false)
        const res = await cashlessAPI.createAccount({ entity_type: 'SANTRI', entity_id: id })
        showNotification('Akun wallet untuk santri berhasil dibuat.', 'success')
        await loadAccounts()
        await loadLedgerSummary()
        if (res?.data?.id) {
          setSelectedAccountId(res.data.id)
          if (!isDesktopLayout()) setMobileDetailOpen(true)
        }
      } catch (err) {
        showNotification(err.response?.data?.message || 'Gagal membuat akun', 'error')
      } finally {
        setCreateSaving(false)
      }
    },
    [santriIdsWithAccount, showNotification, accountsAll, selectAccount, loadAccounts, loadLedgerSummary]
  )

  const sidePanelProps = {
    account: selectedAccount,
    onBuatAkunSantri: () => setSantriPickerOpen(true),
    onBuatAkunToko: handleBuatAkunToko,
    createSaving,
    tokoWithoutAccount,
    selectedTokoId,
    onSelectedTokoIdChange: setSelectedTokoId,
    loadingToko,
    onAccountRefresh: handleAccountRefresh,
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-24 pt-4 md:px-6 md:pt-6 lg:flex-row lg:gap-4 lg:pb-6">
        {/* Kiri */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Ringkasan kas vs wallet */}
          <div className="mb-3 grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Kas sistem</p>
              {loadingSummary && !ledgerSummary ? (
                <div className="mt-2 h-6 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              ) : (
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                  Rp {formatSaldo(ledgerSummary?.kas?.balance)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total wallet</p>
              {loadingSummary && !ledgerSummary ? (
                <div className="mt-2 h-6 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              ) : (
                <>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-teal-700 dark:text-teal-300">
                    Rp {formatSaldo(ledgerSummary?.wallet?.total)}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    S {formatSaldo(ledgerSummary?.wallet?.santri)} · T{' '}
                    {formatSaldo(ledgerSummary?.wallet?.pedagang)}
                  </p>
                </>
              )}
            </div>
            <div
              className={`rounded-xl border px-3 py-2.5 shadow-sm ${
                ledgerSummary?.valid
                  ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30'
                  : ledgerSummary
                    ? 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</p>
              {loadingSummary && !ledgerSummary ? (
                <div className="mt-2 h-6 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              ) : (
                <>
                  <p
                    className={`mt-0.5 text-base font-bold ${
                      ledgerSummary?.valid
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {ledgerSummary?.valid ? 'Valid' : 'Tidak seimbang'}
                  </p>
                  <p className="font-mono text-[10px] tabular-nums text-gray-600 dark:text-gray-400">
                    Δ Rp {formatSaldo(ledgerSummary?.selisih)}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Semua</option>
              <option value="SYSTEM">Sistem</option>
              <option value="SANTRI">Santri</option>
              <option value="PEDAGANG">Toko</option>
            </select>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari kode atau nama…"
              className="min-w-[160px] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                void loadAccounts()
                void loadLedgerSummary()
              }}
              disabled={loading || loadingSummary}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              Refresh
            </button>
            <span className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs tabular-nums text-gray-700 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-200">
              {loading ? '…' : `${Number(filteredAccounts.length || 0).toLocaleString('id-ID')} akun`}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-800">
            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
                </div>
              ) : error ? (
                <p className="px-4 py-12 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : accounts.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-gray-500">
                  {searchInput.trim() || filterEntityType
                    ? 'Tidak ada akun yang cocok dengan filter/pencarian.'
                    : 'Belum ada akun. Buat dari panel kanan (toko / cari santri).'}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50/95 font-medium text-gray-500 backdrop-blur-sm dark:bg-gray-700/95 dark:text-gray-400">
                      <th className="px-4 py-3">Akun</th>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Kode</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
                    {accounts.map((a) => {
                      const isSelected = selectedAccountId === a.id
                      const entityColor =
                        a.entity_type === 'PEDAGANG'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          : a.entity_type === 'SANTRI'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'
                      return (
                        <tr
                          key={a.id}
                          onClick={() => selectAccount(a)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-teal-50/90 dark:bg-teal-900/25'
                              : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/20'
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            <span className="line-clamp-1">{a.entity_label || a.name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${entityColor}`}
                            >
                              {ENTITY_LABELS[a.entity_type] || a.entity_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-700">
                              {a.code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            Rp {formatSaldo(a.balance_cached)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {totalPages > 1 ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-gray-500">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Selanjutnya
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Kanan desktop */}
        <div className="hidden min-h-0 w-72 shrink-0 flex-col xl:w-80 lg:flex">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <PembuatanAkunSidePanel {...sidePanelProps} />
          </div>
        </div>
      </div>

      {/* FAB mobile: buat akun */}
      <button
        type="button"
        onClick={() => {
          setSelectedAccountId(null)
          setMobileDetailOpen(true)
        }}
        className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 lg:hidden"
        aria-label="Buat akun"
        title="Buat akun"
      >
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" />
        </svg>
      </button>

      {mobileDetailOpen
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[120] bg-black/40 lg:hidden" onClick={closeMobileDetail} />
              <div className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900 lg:hidden">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Detail akun</h3>
                  <button
                    type="button"
                    onClick={closeMobileDetail}
                    className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Tutup
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  <PembuatanAkunSidePanel {...sidePanelProps} />
                </div>
              </div>
            </>,
            document.body
          )
        : null}

      {createPortal(
        <SearchOffcanvas
          isOpen={santriPickerOpen}
          onClose={closeSantriPicker}
          onSelectSantriRecord={handlePickSantri}
          zIndex={140}
        />,
        document.body
      )}
    </div>
  )
}
