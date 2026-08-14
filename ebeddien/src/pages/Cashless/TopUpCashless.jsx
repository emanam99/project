import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI } from '../../services/api'
import { formatSaldo } from './TopUpCashlessFormat'
import CashlessSantriScanBlock from './components/CashlessSantriScanBlock'
import CashlessWalletStatementList from './components/CashlessWalletStatementList'
import CetakKartuSantriTopUpPanel from './components/CetakKartuSantriTopUpPanel'
import CashlessWithdrawPanel from './components/CashlessWithdrawPanel'

const DESKTOP_MQ = '(min-width: 1024px)'

function isDesktopLayout() {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches
}

const OPS_TABS = [
  { id: 'topup', label: 'Top-up' },
  { id: 'tarik', label: 'Tarik' },
]

const MOBILE_TABS = [
  { id: 'topup', label: 'Top-up' },
  { id: 'tarik', label: 'Tarik' },
  { id: 'histori', label: 'Histori' },
]

function SantriSummary({ account, displayBalance }) {
  if (!account) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center dark:border-gray-600 dark:bg-gray-900/40">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pilih santri lewat scan QR atau daftar di bawah.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Santri terpilih</p>
      <p className="mt-0.5 truncate text-base font-bold text-gray-900 dark:text-white">
        {account.entity_label || account.name}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Wallet <span className="font-mono">{account.code}</span>
      </p>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
        Saldo:{' '}
        <strong className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
          Rp {formatSaldo(displayBalance ?? account.balance_cached)}
        </strong>
      </p>
    </div>
  )
}

export default function TopUpCashless() {
  const { showNotification } = useNotification()
  const [desktopLayout, setDesktopLayout] = useState(isDesktopLayout)
  const [santriAccounts, setSantriAccounts] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [searchSantri, setSearchSantri] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [displayBalance, setDisplayBalance] = useState(null)
  const [opsTab, setOpsTab] = useState('topup')
  const [mobileTab, setMobileTab] = useState('topup')
  const [statement, setStatement] = useState([])
  const [loadingStatement, setLoadingStatement] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ)
    const onChange = () => setDesktopLayout(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const loadSantriAccounts = useCallback(async () => {
    try {
      setLoadingList(true)
      const res = await cashlessAPI.getAccountsList({
        entity_type: 'SANTRI',
        limit: 500,
        search: searchSantri.trim() || undefined,
      })
      if (res?.success && res.data) {
        setSantriAccounts(res.data)
        setSelectedAccountId((prev) => {
          if (!prev || res.data.some((a) => String(a.id) === String(prev))) return prev
          return ''
        })
      } else {
        setSantriAccounts([])
      }
    } catch {
      setSantriAccounts([])
    } finally {
      setLoadingList(false)
    }
  }, [searchSantri])

  useEffect(() => {
    const t = setTimeout(loadSantriAccounts, 300)
    return () => clearTimeout(t)
  }, [loadSantriAccounts])

  const selectedAccount = useMemo(
    () => santriAccounts.find((a) => String(a.id) === String(selectedAccountId)) ?? null,
    [santriAccounts, selectedAccountId]
  )
  const santriId = selectedAccount?.entity_id ? Number(selectedAccount.entity_id) : 0

  useEffect(() => {
    setDisplayBalance(selectedAccount?.balance_cached ?? null)
  }, [selectedAccount?.id, selectedAccount?.balance_cached])

  const loadStatement = useCallback(async () => {
    if (!santriId) {
      setStatement([])
      return
    }
    setLoadingStatement(true)
    try {
      const res = await cashlessAPI.getStatementHistory({ santriId, limit: 80 })
      setStatement(res?.success && Array.isArray(res.data) ? res.data : [])
    } catch {
      setStatement([])
    } finally {
      setLoadingStatement(false)
    }
  }, [santriId])

  useEffect(() => {
    loadStatement()
  }, [loadStatement])

  const handleAccountRefresh = useCallback(
    async (data) => {
      if (data?.balance_cached != null) {
        setDisplayBalance(data.balance_cached)
      }
      if (data?.account_id != null && data?.balance_cached != null) {
        setSantriAccounts((prev) =>
          prev.map((a) =>
            a.id === data.account_id ? { ...a, balance_cached: data.balance_cached } : a
          )
        )
      }
      await Promise.all([loadSantriAccounts(), loadStatement()])
    },
    [loadSantriAccounts, loadStatement]
  )

  const selectSantriById = useCallback(
    async (sid) => {
      const idNum = Number(sid)
      if (!idNum) return
      let account = santriAccounts.find((a) => Number(a.entity_id) === idNum)
      if (account) {
        setSelectedAccountId(String(account.id))
        return
      }
      try {
        const res = await cashlessAPI.getAccountsList({
          entity_type: 'SANTRI',
          limit: 500,
        })
        if (res?.success && Array.isArray(res.data)) {
          setSantriAccounts(res.data)
          account = res.data.find((a) => Number(a.entity_id) === idNum)
          if (account) {
            setSelectedAccountId(String(account.id))
          } else {
            showNotification('Santri belum punya akun wallet cashless.', 'warning')
          }
        }
      } catch {
        showNotification('Gagal memuat daftar wallet.', 'error')
      }
    },
    [santriAccounts, showNotification]
  )

  const handleScanSantriResolved = useCallback(
    (santri) => {
      selectSantriById(santri?.id)
    },
    [selectSantriById]
  )

  const opsPanel =
    selectedAccount && santriId > 0 ? (
      opsTab === 'topup' ? (
        <CetakKartuSantriTopUpPanel
          account={selectedAccount}
          santriId={santriId}
          onSuccess={handleAccountRefresh}
          hideHistory
        />
      ) : (
        <CashlessWithdrawPanel
          account={selectedAccount}
          santriId={santriId}
          onSuccess={handleAccountRefresh}
          hideHistory
        />
      )
    ) : (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-6 text-center text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        {loadingList
          ? 'Memuat daftar wallet…'
          : 'Pilih santri yang sudah punya wallet untuk top-up atau tarik tunai.'}
      </div>
    )

  const historyPanel = (
    <CashlessWalletStatementList
      items={statement}
      loading={loadingStatement}
      title={
        selectedAccount
          ? `Histori — ${selectedAccount.entity_label || selectedAccount.name}`
          : 'Histori transaksi'
      }
      emptyText={
        selectedAccount
          ? 'Belum ada riwayat transaksi untuk santri ini.'
          : 'Pilih santri untuk melihat histori masuk/keluar.'
      }
      className="h-full min-h-0"
      maxHeightClass=""
    />
  )

  const accountPicker = (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Cari / pilih santri</label>
      <input
        type="text"
        value={searchSantri}
        onChange={(e) => setSearchSantri(e.target.value)}
        placeholder="Nama atau kode wallet…"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />
      <select
        value={selectedAccountId}
        onChange={(e) => setSelectedAccountId(e.target.value)}
        disabled={loadingList}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="">— Pilih santri —</option>
        {santriAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.entity_label || a.name} — {a.code} (Rp {formatSaldo(a.balance_cached)})
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-24 pt-4 md:px-6 md:pt-6 lg:pb-6">
        {desktopLayout ? (
          <div className="flex h-full min-h-0 gap-4 lg:flex-row">
            <div className="flex min-h-0 w-full min-w-0 flex-col gap-3 lg:w-[28rem] lg:max-w-md lg:shrink-0">
              <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h1 className="text-base font-semibold text-gray-900 dark:text-white">Top-up & Tarik Dana</h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Scan kartu santri, lalu pilih top-up atau tarik tunai.
                </p>
              </div>

              <CashlessSantriScanBlock
                onSantriResolved={handleScanSantriResolved}
                storageKey="ebeddien_topup_scan_camera"
              />

              <div className="shrink-0 space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {accountPicker}
                <SantriSummary account={selectedAccount} displayBalance={displayBalance} />
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex shrink-0 gap-1 border-b border-gray-200 p-2 dark:border-gray-700">
                  {OPS_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOpsTab(tab.id)}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        opsTab === tab.id
                          ? tab.id === 'tarik'
                            ? 'bg-rose-600 text-white'
                            : 'bg-teal-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">{opsPanel}</div>
              </div>
            </div>

            <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">{historyPanel}</div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">Top-up & Tarik Dana</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Scan kartu, top-up, tarik, atau lihat histori.
              </p>
            </div>

            <div className="flex shrink-0 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileTab(tab.id)}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    mobileTab === tab.id
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {mobileTab === 'histori' ? (
                historyPanel
              ) : (
                <div className="space-y-3">
                  <CashlessSantriScanBlock
                    onSantriResolved={handleScanSantriResolved}
                    storageKey="ebeddien_topup_scan_camera_mobile"
                    compact
                  />
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    {accountPicker}
                    <div className="mt-3">
                      <SantriSummary account={selectedAccount} displayBalance={displayBalance} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    {mobileTab === 'topup' ? (
                      <CetakKartuSantriTopUpPanel
                        account={selectedAccount}
                        santriId={santriId}
                        onSuccess={handleAccountRefresh}
                        hideHistory
                      />
                    ) : (
                      <CashlessWithdrawPanel
                        account={selectedAccount}
                        santriId={santriId}
                        onSuccess={handleAccountRefresh}
                        hideHistory
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
