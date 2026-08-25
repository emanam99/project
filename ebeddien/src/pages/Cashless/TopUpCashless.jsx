import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { cashlessAPI, santriAPI } from '../../services/api'
import { formatSaldo } from './TopUpCashlessFormat'
import { formatSantriAlamat } from './constants/santriCardDesign'
import CashlessSantriScanBlock from './components/CashlessSantriScanBlock'
import CashlessWalletStatementList from './components/CashlessWalletStatementList'
import CetakKartuSantriTopUpPanel from './components/CetakKartuSantriTopUpPanel'
import CashlessWithdrawPanel from './components/CashlessWithdrawPanel'

const DESKTOP_MQ = '(min-width: 1024px)'
const CAMERA_STORAGE_KEY = 'ebeddien_topup_camera_open'

function isDesktopLayout() {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches
}

function readCameraOpen() {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

function persistCameraOpen(open) {
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function accountHasKartuSantri(account) {
  if (!account) return false
  const aktif = account.kartu_aktif
  const dicetak = account.kartu_dicetak
  const pending = account.kartu_perlu_validasi
  if (!aktif && !dicetak && !pending) return true
  return Boolean(aktif?.CS || dicetak?.CS || pending?.CS)
}

const MOBILE_TABS = [
  { id: 'transaksi', label: 'Transaksi' },
  { id: 'histori', label: 'Histori' },
]

function CameraToggleIcon({ active, className = 'h-4 w-4' }) {
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

function HeaderActions({ cameraOpen, onToggleCamera, onCariSantri }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggleCamera}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          cameraOpen
            ? 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/60'
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
        }`}
        title={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
        aria-label={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
        aria-pressed={cameraOpen}
      >
        <CameraToggleIcon active={cameraOpen} />
      </button>
      <button
        type="button"
        onClick={onCariSantri}
        className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Cari
      </button>
    </div>
  )
}

function formatRombelLabel(lembaga, kelas, kel) {
  const parts = [lembaga, kelas, kel].map((v) => String(v ?? '').trim()).filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

function formatDomisiliLabel(s) {
  const daerahKamar = String(s?.daerah_kamar ?? '').trim()
  if (daerahKamar) return daerahKamar
  const daerah = String(s?.daerah ?? '').trim()
  const kamar = String(s?.kamar ?? '').trim()
  if (daerah && kamar) return `${daerah}.${kamar}`
  return daerah || kamar || '—'
}

function formatAlamatLabel(s) {
  const { line1, line2 } = formatSantriAlamat(s)
  return [line1, line2].filter(Boolean).join(', ') || '—'
}

function BiodataRow({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-900 dark:text-gray-100">{value || '—'}</dd>
    </div>
  )
}

function SantriSummary({ account, displayBalance, detail, detailLoading }) {
  if (!account) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center dark:border-gray-600 dark:bg-gray-900/40">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Scan QR atau cari santri yang sudah punya kartu.
        </p>
      </div>
    )
  }

  const diniyah = formatRombelLabel(
    detail?.lembaga_diniyah || detail?.diniyah,
    detail?.kelas_diniyah,
    detail?.kel_diniyah
  )
  const formal = formatRombelLabel(
    detail?.lembaga_formal || detail?.formal,
    detail?.kelas_formal,
    detail?.kel_formal
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Santri terpilih</p>
      <p className="mt-0.5 truncate text-base font-bold text-gray-900 dark:text-white">
        {detail?.nama || account.entity_label || account.name}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {detail?.nis ? <>NIS {detail.nis} · </> : null}
        Wallet <span className="font-mono">{account.code}</span>
      </p>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
        Saldo:{' '}
        <strong className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
          Rp {formatSaldo(displayBalance ?? account.balance_cached)}
        </strong>
      </p>
      {detailLoading && !detail ? (
        <p className="mt-2 text-[11px] text-gray-400">Memuat biodata…</p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700">
          <BiodataRow label="Diniyah" value={diniyah} />
          <BiodataRow label="Formal" value={formal} />
          <BiodataRow label="Domisili" value={formatDomisiliLabel(detail)} />
          <BiodataRow label="Ayah" value={String(detail?.ayah || '').trim() || '—'} />
          <BiodataRow label="Ibu" value={String(detail?.ibu || '').trim() || '—'} />
          <BiodataRow label="Alamat" value={formatAlamatLabel(detail)} />
        </dl>
      )}
    </div>
  )
}

export default function TopUpCashless() {
  const { showNotification } = useNotification()
  const [desktopLayout, setDesktopLayout] = useState(isDesktopLayout)
  const [santriAccounts, setSantriAccounts] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [displayBalance, setDisplayBalance] = useState(null)
  const [opsForm, setOpsForm] = useState(null)
  const [mobileTab, setMobileTab] = useState('transaksi')
  const [statement, setStatement] = useState([])
  const [loadingStatement, setLoadingStatement] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(readCameraOpen)
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const [santriDetail, setSantriDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const closeSantriPickerState = useCallback(() => setSantriPickerOpen(false), [])
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, closeSantriPickerState)

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
  }, [])

  useEffect(() => {
    loadSantriAccounts()
  }, [loadSantriAccounts])

  const selectedAccount = useMemo(
    () => santriAccounts.find((a) => String(a.id) === String(selectedAccountId)) ?? null,
    [santriAccounts, selectedAccountId]
  )
  const santriId = selectedAccount?.entity_id ? Number(selectedAccount.entity_id) : 0

  const allowedSantriIds = useMemo(
    () =>
      santriAccounts
        .filter(accountHasKartuSantri)
        .map((a) => Number(a.entity_id))
        .filter((n) => n > 0),
    [santriAccounts]
  )

  useEffect(() => {
    setDisplayBalance(selectedAccount?.balance_cached ?? null)
  }, [selectedAccount?.id, selectedAccount?.balance_cached])

  useEffect(() => {
    setOpsForm(null)
  }, [santriId])

  useEffect(() => {
    if (!santriId) {
      setSantriDetail(null)
      setDetailLoading(false)
      return undefined
    }
    let cancelled = false
    setDetailLoading(true)
    santriAPI
      .getById(santriId)
      .then((res) => {
        if (cancelled) return
        const row = res?.data
        setSantriDetail(row && typeof row === 'object' ? row : null)
      })
      .catch(() => {
        if (!cancelled) setSantriDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [santriId])

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
      if (santri && typeof santri === 'object') setSantriDetail(santri)
      selectSantriById(santri?.id)
    },
    [selectSantriById]
  )

  const handleOpenCariSantri = useCallback(() => {
    setSantriPickerOpen(true)
  }, [])

  const handleToggleCamera = useCallback(() => {
    setCameraOpen((open) => {
      const next = !open
      persistCameraOpen(next)
      return next
    })
  }, [])

  const handlePickSantri = useCallback(
    (santri) => {
      if (santri && typeof santri === 'object') setSantriDetail(santri)
      selectSantriById(santri?.id)
    },
    [selectSantriById]
  )

  const saldoWallet = Number(displayBalance ?? selectedAccount?.balance_cached ?? 0)
  const canOps = Boolean(selectedAccount && santriId > 0)

  const actionButtons = (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!canOps}
        onClick={() => setOpsForm((v) => (v === 'topup' ? null : 'topup'))}
        className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          opsForm === 'topup'
            ? 'bg-teal-700 text-white'
            : 'bg-teal-600 text-white hover:bg-teal-700'
        }`}
      >
        Top-up
      </button>
      <button
        type="button"
        disabled={!canOps || saldoWallet <= 0}
        onClick={() => setOpsForm((v) => (v === 'tarik' ? null : 'tarik'))}
        className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          opsForm === 'tarik'
            ? 'bg-rose-700 text-white'
            : 'bg-rose-600 text-white hover:bg-rose-700'
        }`}
      >
        Tarik
      </button>
    </div>
  )

  const opsFormPanel =
    opsForm === 'topup' ? (
      <CetakKartuSantriTopUpPanel
        account={selectedAccount}
        santriId={santriId}
        onSuccess={handleAccountRefresh}
        hideHistory
        formOnly
        onCloseForm={() => setOpsForm(null)}
      />
    ) : opsForm === 'tarik' ? (
      <CashlessWithdrawPanel
        account={selectedAccount}
        santriId={santriId}
        onSuccess={handleAccountRefresh}
        hideHistory
        formOnly
        onCloseForm={() => setOpsForm(null)}
      />
    ) : null

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

  const headerActions = (
    <HeaderActions
      cameraOpen={cameraOpen}
      onToggleCamera={handleToggleCamera}
      onCariSantri={handleOpenCariSantri}
    />
  )

  const scanBlock = (
    <CashlessSantriScanBlock
      onSantriResolved={handleScanSantriResolved}
      cameraOpen={cameraOpen}
      onCameraOpenChange={(open) => {
        persistCameraOpen(open)
        setCameraOpen(open)
      }}
      showHeader={false}
      hidePlaceholder
      compact={!desktopLayout}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-24 pt-4 md:px-6 md:pt-6 lg:pb-6">
        {desktopLayout ? (
          <div className="flex h-full min-h-0 gap-4 lg:flex-row">
            <div className="flex min-h-0 w-full min-w-0 flex-col gap-3 overflow-y-auto lg:w-[28rem] lg:max-w-md lg:shrink-0">
              <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold text-gray-900 dark:text-white">Top-up & Tarik Dana</h1>
                  </div>
                  {headerActions}
                </div>
              </div>

              {scanBlock}

              <div className="shrink-0 space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <SantriSummary
                  account={selectedAccount}
                  displayBalance={displayBalance}
                  detail={santriDetail}
                  detailLoading={detailLoading}
                />
                {actionButtons}
                {opsFormPanel}
              </div>
            </div>

            <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">{historyPanel}</div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h1 className="text-base font-semibold text-gray-900 dark:text-white">Top-up & Tarik Dana</h1>
                </div>
                {headerActions}
              </div>
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
                  {scanBlock}
                  <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <SantriSummary
                      account={selectedAccount}
                      displayBalance={displayBalance}
                      detail={santriDetail}
                      detailLoading={detailLoading}
                    />
                    {actionButtons}
                    {opsFormPanel}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {createPortal(
        <SearchOffcanvas
          isOpen={santriPickerOpen}
          onClose={closeSantriPicker}
          onSelectSantriRecord={handlePickSantri}
          zIndex={250}
          allowedSantriIds={allowedSantriIds}
          restrictedEmptyText="Tidak ada santri yang sudah punya kartu cashless."
        />,
        document.body
      )}
    </div>
  )
}
