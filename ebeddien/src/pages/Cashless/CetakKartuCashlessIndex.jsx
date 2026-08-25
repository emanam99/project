import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { cashlessAPI, santriAPI } from '../../services/api'
import KartuCetakUlangModal from './components/KartuCetakUlangModal'
import CetakKartuBundleOffcanvas from './components/CetakKartuBundleOffcanvas'
import CetakKartuSantriSidePanel from './components/CetakKartuSantriSidePanel'
import CetakKartuSantriMobileOffcanvas from './components/CetakKartuSantriMobileOffcanvas'
import CashlessSantriScanBlock from './components/CashlessSantriScanBlock'
import { CARD_TYPE_BY_KEY, CARD_TYPE_LABELS } from './constants/cashlessKartu'

const ACCOUNTS_FETCH_LIMIT = 500
const ACCOUNTS_PAGE_SIZE = 20
const CAMERA_STORAGE_KEY = 'ebeddien_cetak_kartu_camera_open'

function readCameraOpen() {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
    if (window.localStorage.getItem('ebeddien_cetak_kartu_scan_camera') === '1') return false
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

function isDesktopLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

function accountMatchesSearch(account, search) {
  const q = String(search || '').trim().toLowerCase()
  if (!q) return true
  const hay = [account?.code, account?.name, account?.entity_label, account?.nis]
    .map((v) => String(v || '').toLowerCase())
  return hay.some((h) => h.includes(q))
}

function accountToCardMaps(account) {
  const ka = account?.kartu_aktif || {}
  const kd = account?.kartu_dicetak || {}
  return {
    activeMap: { SANTRI: !!ka.CS, MAHROM: !!ka.CM },
    printedMap: { SANTRI: !!kd.CS, MAHROM: !!kd.CM },
  }
}

function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

function KartuBadge({ active, printed, pendingValidation, label }) {
  if (pendingValidation) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 ring-1 ring-amber-400/50"
        title={`${label} menunggu validasi scan QR`}
      >
        {label} · validasi
      </span>
    )
  }
  if (!active) {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
        title={`${label} belum diterbitkan`}
      >
        {label}
      </span>
    )
  }
  if (printed) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
        title={`${label} sudah dicetak`}
      >
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
        {label}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-300/60 dark:ring-amber-700/60"
      title={`${label} aktif, belum dicetak`}
    >
      {label}
    </span>
  )
}

export default function CetakKartuCashlessIndex() {
  const location = useLocation()
  const { showNotification } = useNotification()
  const [accountsAll, setAccountsAll] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [offcanvas, setOffcanvas] = useState({
    open: false,
    santri: null,
    cards: [],
    focusType: null,
    validateFocusType: null,
    autoOpenValidate: false,
    activeMap: null,
    printedMap: null,
  })
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [panelSantriDetail, setPanelSantriDetail] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [mobileScanOpen, setMobileScanOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(readCameraOpen)
  const [createSaving, setCreateSaving] = useState(false)
  const panelReqRef = useRef(0)
  /** Hindari history.back() dari Cari Santri menutup offcanvas detail yang baru dibuka. */
  const skipSearchBackCloseRef = useRef(false)

  const closeSantriPickerState = useCallback(() => setSantriPickerOpen(false), [])
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, closeSantriPickerState)
  const closeMobileDetail = useOffcanvasBackClose(mobileDetailOpen, () => setMobileDetailOpen(false))
  const closeMobileScan = useOffcanvasBackClose(mobileScanOpen, () => setMobileScanOpen(false))

  const handleSearchOffcanvasClose = useCallback(() => {
    if (skipSearchBackCloseRef.current) {
      closeSantriPickerState()
      return
    }
    closeSantriPicker()
  }, [closeSantriPicker, closeSantriPickerState])

  const openMobileDetailPanel = useCallback(() => {
    if (!isDesktopLayout()) setMobileDetailOpen(true)
  }, [])

  const filteredAccounts = useMemo(
    () => accountsAll.filter((a) => accountMatchesSearch(a, searchInput)),
    [accountsAll, searchInput]
  )

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNTS_PAGE_SIZE) || 1)
  const safePage = Math.min(page, totalPages)

  const accounts = useMemo(() => {
    const start = (safePage - 1) * ACCOUNTS_PAGE_SIZE
    return filteredAccounts.slice(start, start + ACCOUNTS_PAGE_SIZE)
  }, [filteredAccounts, safePage])

  useEffect(() => {
    setPage(1)
  }, [searchInput])

  const selectedAccount = useMemo(
    () => accountsAll.find((a) => a.id === selectedAccountId) ?? null,
    [accountsAll, selectedAccountId]
  )

  const loadSantriDetail = useCallback(async (santriId) => {
    const sid = Number(santriId)
    if (!sid) {
      setPanelSantriDetail(null)
      return
    }
    const reqId = ++panelReqRef.current
    setPanelLoading(true)
    try {
      const res = await santriAPI.getById(sid)
      if (reqId !== panelReqRef.current) return
      const row = res?.data
      setPanelSantriDetail(row && typeof row === 'object' ? row : null)
    } catch {
      if (reqId === panelReqRef.current) setPanelSantriDetail(null)
    } finally {
      if (reqId === panelReqRef.current) setPanelLoading(false)
    }
  }, [])

  const selectAccount = useCallback((account) => {
    if (!account) {
      setSelectedAccountId(null)
      setPanelSantriDetail(null)
      return
    }
    setSelectedAccountId(account.id)
    loadSantriDetail(account.entity_id)
    openMobileDetailPanel()
  }, [loadSantriDetail, openMobileDetailPanel])

  const handlePickSantri = useCallback((santri) => {
    const sid = santri?.id != null ? Number(santri.id) : 0
    if (!sid) return
    skipSearchBackCloseRef.current = true
    setSantriPickerOpen(false)
    const account = accountsAll.find((a) => Number(a.entity_id) === sid)
    if (account) {
      setSelectedAccountId(account.id)
      loadSantriDetail(account.entity_id)
    } else {
      setSelectedAccountId(null)
      loadSantriDetail(sid)
    }
    window.requestAnimationFrame(() => {
      openMobileDetailPanel()
      window.setTimeout(() => {
        skipSearchBackCloseRef.current = false
      }, 120)
    })
  }, [accountsAll, loadSantriDetail, openMobileDetailPanel])

  const handleOpenCariSantri = useCallback(() => {
    setSantriPickerOpen(true)
  }, [])

  const handleToggleCamera = useCallback(() => {
    if (!isDesktopLayout()) {
      setMobileScanOpen((open) => {
        const next = !open
        if (next) setMobileDetailOpen(false)
        return next
      })
      return
    }
    setCameraOpen((open) => {
      const next = !open
      persistCameraOpen(next)
      return next
    })
  }, [])

  const handleScanSantriResolved = useCallback(
    (santri) => {
      const sid = santri?.id != null ? Number(santri.id) : 0
      if (!sid) return
      const account = accountsAll.find((a) => Number(a.entity_id) === sid)
      if (account) {
        setSelectedAccountId(account.id)
        loadSantriDetail(account.entity_id)
      } else {
        setSelectedAccountId(null)
        loadSantriDetail(sid)
      }
      openMobileDetailPanel()
      setMobileScanOpen(false)
    },
    [accountsAll, loadSantriDetail, openMobileDetailPanel]
  )

  const loadAccounts = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      const res = await cashlessAPI.getAccountsList({
        page: 1,
        limit: ACCOUNTS_FETCH_LIMIT,
        entity_type: 'SANTRI',
      })
      if (res?.success) {
        setAccountsAll(res.data || [])
      } else if (!silent) {
        setAccountsAll([])
      }
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.message || 'Gagal memuat daftar santri')
        setAccountsAll([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const handleAccountRefresh = useCallback(async (topUpData) => {
    if (topUpData?.account_id != null && topUpData?.balance_cached != null) {
      setAccountsAll((prev) =>
        prev.map((a) =>
          a.id === topUpData.account_id ? { ...a, balance_cached: topUpData.balance_cached } : a
        )
      )
    }
    try {
      const res = await cashlessAPI.getAccountsList({
        page: 1,
        limit: ACCOUNTS_FETCH_LIMIT,
        entity_type: 'SANTRI',
      })
      if (res?.success) {
        setAccountsAll(res.data || [])
      }
    } catch {
      await loadAccounts({ silent: true })
    }
  }, [loadAccounts])

  const handleBuatAkunCashless = useCallback(async () => {
    const sid = panelSantriDetail?.id ? Number(panelSantriDetail.id) : 0
    if (!sid) {
      showNotification('Pilih santri terlebih dahulu.', 'error')
      return
    }
    const existing = accountsAll.find((a) => Number(a.entity_id) === sid)
    if (existing) {
      showNotification('Santri ini sudah punya akun wallet.', 'error')
      selectAccount(existing)
      return
    }
    try {
      setCreateSaving(true)
      const res = await cashlessAPI.createAccount({ entity_type: 'SANTRI', entity_id: sid })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal membuat akun', 'error')
        return
      }
      showNotification('Akun wallet untuk santri berhasil dibuat.', 'success')
      const listRes = await cashlessAPI.getAccountsList({
        page: 1,
        limit: ACCOUNTS_FETCH_LIMIT,
        entity_type: 'SANTRI',
      })
      if (listRes?.success) {
        const nextAccounts = listRes.data || []
        setAccountsAll(nextAccounts)
        const created = nextAccounts.find((a) => Number(a.entity_id) === sid)
        if (created) selectAccount(created)
      } else {
        await loadAccounts({ silent: true })
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal membuat akun', 'error')
    } finally {
      setCreateSaving(false)
    }
  }, [panelSantriDetail?.id, accountsAll, showNotification, selectAccount, loadAccounts])

  const handleCloseOffcanvas = useCallback(() => {
    setOffcanvas((prev) => ({ ...prev, open: false }))
    loadAccounts({ silent: true })
  }, [loadAccounts])

  const closeOffcanvas = useOffcanvasBackClose(offcanvas.open, handleCloseOffcanvas)

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const openOffcanvas = useCallback((account, cardType, cards = [], santri = null, options = {}) => {
    const sid = account.entity_id
    const maps = accountToCardMaps(account)
    setOffcanvas({
      open: true,
      santri: santri || { id: sid, nama: account.entity_label || account.name, nis: account.nis ?? null },
      cards,
      focusType: cardType,
      validateFocusType: options.validateFocusType ?? null,
      autoOpenValidate: !!options.autoOpenValidate,
      activeMap: maps.activeMap,
      printedMap: maps.printedMap,
    })
  }, [])

  const openOffcanvasValidate = useCallback((account, validateFocusType = null) => {
    openOffcanvas(account, null, [], null, { autoOpenValidate: true, validateFocusType })
  }, [openOffcanvas])

  const accountNeedsValidation = (account) => {
    const pv = account?.kartu_perlu_validasi || {}
    return !!(pv.CS || pv.CM)
  }

  const consumedRedirectRef = useRef(false)

  useEffect(() => {
    if (consumedRedirectRef.current) return
    const incoming = location.state?.cetakOffcanvas
    if (!incoming?.santriId) return
    consumedRedirectRef.current = true
    const account = accounts.find((a) => a.entity_id === incoming.santriId)
    const maps = account ? accountToCardMaps(account) : { activeMap: null, printedMap: null }
    setOffcanvas({
      open: true,
      santri: incoming.santri || { id: incoming.santriId, nama: '', nis: null },
      cards: incoming.cards || [],
      focusType: incoming.focusType ?? null,
      validateFocusType: incoming.validateFocusType ?? null,
      autoOpenValidate: !!incoming.autoOpenValidate,
      activeMap: maps.activeMap,
      printedMap: maps.printedMap,
    })
    window.history.replaceState({}, '', '/cashless/cetak-kartu')
  }, [location.state, accounts])

  const handleCetakKartu = (account, key) => {
    const cardType = CARD_TYPE_BY_KEY[key]
    const printed = account.kartu_dicetak || {}
    const wasPrinted = printed[key]

    if (key === 'CM') {
      if (wasPrinted) {
        setConfirmState({ account, key, cardType, mode: 'navigate' })
        return
      }
      openOffcanvas(account, cardType)
      return
    }

    const flags = account.kartu_aktif || {}
    const active = flags[key]

    if (wasPrinted) {
      setConfirmState({ account, key, cardType })
      return
    }

    if (!active) {
      handleIssueAndOpen(account, cardType, key)
      return
    }

    openOffcanvas(account, cardType)
  }

  const handleIssueAndOpen = async (account, cardType, key) => {
    const santriId = account.entity_id
    if (!santriId) return
    const busyId = `${account.id}-${key}`
    try {
      setBusyKey(busyId)
      const res = await cashlessAPI.issueKartuSingle(santriId, cardType)
      if (!res?.success || !res.data?.card) {
        showNotification(res?.message || 'Gagal menerbitkan kartu', 'error')
        return
      }
      openOffcanvas(account, cardType, [res.data.card], res.data.santri)
      loadAccounts({ silent: true })
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menerbitkan kartu', 'error')
    } finally {
      setBusyKey(null)
      setConfirmState(null)
    }
  }

  const handleConfirmReprint = () => {
    if (!confirmState) return
    if (confirmState.mode === 'navigate') {
      openOffcanvas(confirmState.account, confirmState.cardType)
      setConfirmState(null)
      return
    }
    if (confirmState.mode === 'bundle') {
      openOffcanvas(confirmState.account, null)
      setConfirmState(null)
      return
    }
    handleIssueAndOpen(confirmState.account, confirmState.cardType, confirmState.key)
  }

  const handleCetakSemua = (account) => {
    const printed = account.kartu_dicetak || {}
    const anyPrinted = ['CS', 'CM'].some((k) => printed[k])
    if (anyPrinted) {
      setConfirmState({ account, key: 'ALL', cardType: null, mode: 'bundle' })
      return
    }
    openOffcanvas(account, null)
  }

  const CARD_KEYS = ['CS', 'CM']

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden px-4 md:px-6 pt-4 md:pt-6 pb-24 lg:pb-6 gap-4">
        {/* Kiri: daftar akun */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex-shrink-0 mb-3 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama atau kode wallet..."
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
            <button
              type="button"
              onClick={() => loadAccounts()}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh
            </button>
            <span
              className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium tabular-nums text-gray-700 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-200"
              title="Jumlah akun wallet santri (hasil filter)"
            >
              {loading ? '…' : `${Number(filteredAccounts.length || 0).toLocaleString('id-ID')} akun`}
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
                </div>
              ) : error ? (
                <p className="text-sm text-red-600 dark:text-red-400 text-center py-12 px-4">{error}</p>
              ) : accounts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-12 px-4">
                  {searchInput.trim()
                    ? 'Tidak ada akun yang cocok dengan pencarian.'
                    : 'Belum ada santri dengan wallet. Gunakan panel kanan untuk cari santri dan buat akun cashless.'}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50/95 dark:bg-gray-700/95 text-gray-500 dark:text-gray-400 font-medium backdrop-blur-sm">
                      <th className="px-4 py-3">Santri</th>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-center">Status kartu</th>
                      <th className="px-4 py-3 text-center">Cetak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
                    {accounts.map((a) => {
                      const flags = a.kartu_aktif || { CS: false, CM: false }
                      const printed = a.kartu_dicetak || { CS: false, CM: false }
                      const perluValidasi = a.kartu_perlu_validasi || { CS: false, CM: false }
                      const pendingSlots = Array.isArray(a.kartu_pending_validasi) ? a.kartu_pending_validasi : []
                      const pendingByKey = {
                        CS: perluValidasi.CS,
                        CM: perluValidasi.CM,
                      }
                      const busyAll = busyKey === `${a.id}-ALL`
                      const busyValidate = busyKey === `${a.id}-VAL`
                      const isSelected = selectedAccountId === a.id
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
                            {a.entity_label || a.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{a.code}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            Rp {formatSaldo(a.balance_cached)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex gap-1 flex-wrap justify-center">
                              <KartuBadge
                                active={flags.CS}
                                printed={printed.CS}
                                pendingValidation={pendingByKey.CS}
                                label="CS"
                              />
                              {pendingSlots
                                .filter((s) => s.card_type === 'MAHROM')
                                .map((s) => (
                                  <KartuBadge
                                    key={`pv-${s.kartu_id}`}
                                    active={false}
                                    printed={false}
                                    pendingValidation
                                    label={s.label || 'CM'}
                                  />
                                ))}
                              {Array.isArray(a.kartu_cm_mahrom) && a.kartu_cm_mahrom.length > 0 ? (
                                a.kartu_cm_mahrom.map((m) => {
                                  const mahromPending = pendingSlots.some(
                                    (s) => s.mahrom_id === m.mahrom_id
                                  )
                                  if (mahromPending) return null
                                  return (
                                    <KartuBadge
                                      key={m.mahrom_id}
                                      active={m.active !== false}
                                      printed={!!m.printed}
                                      label={m.hubungan ? `CM·${m.hubungan}` : 'CM'}
                                    />
                                  )
                                })
                              ) : !pendingByKey.CM ? (
                                <KartuBadge active={flags.CM} printed={printed.CM} label="CM" />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-center gap-2">
                              {accountNeedsValidation(a) && (
                                <button
                                  type="button"
                                  disabled={!!busyKey}
                                  onClick={() => openOffcanvasValidate(a)}
                                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                                >
                                  {busyValidate ? '...' : 'Validasi kartu'}
                                </button>
                              )}
                              <div className="inline-flex gap-1 flex-wrap justify-center">
                                {CARD_KEYS.map((k) => {
                                  const busy = busyKey === `${a.id}-${k}`
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      disabled={!!busyKey}
                                      onClick={() => handleCetakKartu(a, k)}
                                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                                        printed[k]
                                          ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                          : flags[k]
                                            ? 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                            : 'border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20'
                                      }`}
                                      title={CARD_TYPE_LABELS[CARD_TYPE_BY_KEY[k]]}
                                    >
                                      {busy ? '...' : k}
                                    </button>
                                  )
                                })}
                              </div>
                              <button
                                type="button"
                                disabled={!!busyKey}
                                onClick={() => handleCetakSemua(a)}
                                className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50"
                              >
                                {busyAll ? '...' : 'Kelola & cetak semua'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center gap-3">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-gray-500">{safePage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg text-sm bg-teal-600 text-white disabled:opacity-50"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Kanan: scan + detail santri desktop */}
        <div className="hidden lg:flex lg:w-80 xl:w-96 shrink-0 flex-col min-h-0 gap-3">
          <CashlessSantriScanBlock
            onSantriResolved={handleScanSantriResolved}
            cameraOpen={cameraOpen}
            onCameraOpenChange={(open) => {
              persistCameraOpen(open)
              setCameraOpen(open)
            }}
            showHeader={false}
            hidePlaceholder
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <CetakKartuSantriSidePanel
              account={selectedAccount}
              santriDetail={panelSantriDetail}
              loading={panelLoading}
              onCariSantri={handleOpenCariSantri}
              onBuatAkun={handleBuatAkunCashless}
              createSaving={createSaving}
              onAccountRefresh={handleAccountRefresh}
              cameraOpen={cameraOpen}
              onToggleCamera={handleToggleCamera}
            />
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed z-[50] bottom-20 right-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggleCamera}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors ${
            mobileScanOpen
              ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
          aria-label={mobileScanOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          title={mobileScanOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-pressed={mobileScanOpen}
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            {!mobileScanOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l16 16" />
            ) : null}
          </svg>
        </button>
        <button
          type="button"
          onClick={handleOpenCariSantri}
          className="w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-lg flex items-center justify-center transition-colors"
          aria-label="Cari santri"
          title="Cari santri"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {createPortal(
        mobileScanOpen ? (
          <div
            className="lg:hidden fixed inset-0 z-[255] flex items-start justify-center bg-black/50"
            onClick={closeMobileScan}
            role="presentation"
          >
            <div
              className="w-full max-w-lg rounded-b-2xl bg-white p-4 shadow-xl dark:bg-gray-900"
              style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Scan kartu</h2>
                <button
                  type="button"
                  onClick={closeMobileScan}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <CashlessSantriScanBlock
                onSantriResolved={handleScanSantriResolved}
                cameraOpen
                onCameraOpenChange={() => setMobileScanOpen(false)}
                showHeader={false}
                hidePlaceholder
                compact
              />
            </div>
          </div>
        ) : null,
        document.body
      )}

      <CetakKartuSantriMobileOffcanvas
        isOpen={mobileDetailOpen}
        onClose={closeMobileDetail}
        account={selectedAccount}
        santriDetail={panelSantriDetail}
        loading={panelLoading}
        onCariSantri={handleOpenCariSantri}
        onBuatAkun={handleBuatAkunCashless}
        createSaving={createSaving}
        onAccountRefresh={handleAccountRefresh}
        cameraOpen={mobileScanOpen}
        onToggleCamera={handleToggleCamera}
      />

      {createPortal(
        <SearchOffcanvas
          isOpen={santriPickerOpen}
          onClose={handleSearchOffcanvasClose}
          onSelectSantriRecord={handlePickSantri}
          zIndex={250}
        />,
        document.body
      )}

      <KartuCetakUlangModal
        isOpen={!!confirmState}
        onClose={() => !busyKey && setConfirmState(null)}
        onConfirm={handleConfirmReprint}
        loading={!!busyKey}
        variant={confirmState?.mode === 'bundle' ? 'bundle-all' : confirmState?.mode === 'batch' ? 'batch' : 'single'}
        cardLabel={confirmState?.cardType ? CARD_TYPE_LABELS[confirmState.cardType] : ''}
        santriNama={confirmState?.account?.entity_label || confirmState?.account?.name || ''}
        keepOthersValid={confirmState?.mode !== 'bundle'}
        printedLabels={
          confirmState?.mode === 'bundle'
            ? ['CS', 'CM'].filter((k) => confirmState.account?.kartu_dicetak?.[k]).map((k) => CARD_TYPE_LABELS[CARD_TYPE_BY_KEY[k]])
            : confirmState?.cardType
              ? [CARD_TYPE_LABELS[confirmState.cardType]]
              : []
        }
      />

      <CetakKartuBundleOffcanvas
        isOpen={offcanvas.open}
        onClose={closeOffcanvas}
        cards={offcanvas.cards}
        santri={offcanvas.santri}
        focusType={offcanvas.focusType}
        validateFocusType={offcanvas.validateFocusType}
        autoOpenValidate={offcanvas.autoOpenValidate}
        initialActiveMap={offcanvas.activeMap}
        initialPrintedMap={offcanvas.printedMap}
        onStatusChange={() => loadAccounts({ silent: true })}
      />
    </div>
  )
}
