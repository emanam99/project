import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useSantriIds } from '../../hooks/useSantriCachedResources'
import { useCashlessLiveSync, resolveFingerprintFromWallet } from '../../hooks/useCashlessLiveSync'
import { cashlessAPI } from '../../services/api'
import { PageEnter, PageEnterLoading } from '../../components/motion/PageEnter'
import BayarOffcanvas from '../../components/riwayat/BayarOffcanvas'
import { useMybeddienToast } from '../../contexts/MybeddienToastContext'
import CashlessWalletPanel from './components/CashlessWalletPanel'
import CashlessTransactionList from './components/CashlessTransactionList'
import CashlessPinOffcanvas from './components/CashlessPinOffcanvas'
import CashlessTransferOffcanvas from './components/CashlessTransferOffcanvas'
import CashlessTransactionDetailOffcanvas from './components/CashlessTransactionDetailOffcanvas'

/** Jarak scroll (px) sampai wallet mobile penuh → ringkas */
const COLLAPSE_SCROLL_RANGE = 88
/** Lerp per frame — lebih kecil = sedikit lebih lambat / halus */
const COLLAPSE_LERP = 0.11
const MOBILE_MQ = '(max-width: 1023px)'

/**
 * @param {{ mode?: 'santri' | 'toko' }} props
 */
export default function Cashless({ mode = 'santri' }) {
  const isToko = mode === 'toko'
  const akses = isToko ? 'toko' : 'santri'
  const { santriId } = useSantriIds()
  const tokoId = useAuthStore((s) => Number(s.user?.toko_id) || 0)
  const ownerReady = isToko ? tokoId > 0 : Boolean(santriId)
  const { showToast } = useMybeddienToast()
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTx, setLoadingTx] = useState(false)
  const [bayarOpen, setBayarOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinMode, setPinMode] = useState('set')
  const [liveFingerprint, setLiveFingerprint] = useState(null)
  const [walletCollapse, setWalletCollapse] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const skipExternalToastRef = useRef(false)
  const scrollRef = useRef(null)
  const collapseTargetRef = useRef(0)
  const collapseCurrentRef = useRef(0)
  const collapseRafRef = useRef(0)

  const loadWallet = useCallback(async () => {
    if (!ownerReady) {
      setWallet(null)
      return null
    }
    try {
      const res = await cashlessAPI.getWallet(akses)
      if (res?.success) {
        setWallet(res.data ?? null)
        return res.data ?? null
      }
      setWallet(null)
      return null
    } catch {
      setWallet(null)
      return null
    }
  }, [ownerReady, akses])

  const loadTransactions = useCallback(async ({ silent = false } = {}) => {
    if (!ownerReady) {
      setTransactions([])
      return
    }
    if (!silent) setLoadingTx(true)
    try {
      const res = await cashlessAPI.getTransactions(80, akses)
      setTransactions(res?.success && Array.isArray(res.data) ? res.data : [])
    } catch {
      if (!silent) setTransactions([])
    } finally {
      if (!silent) setLoadingTx(false)
    }
  }, [ownerReady, akses])

  const refreshAll = useCallback(
    async ({ silent = false } = {}) => {
      const [walletData] = await Promise.all([loadWallet(), loadTransactions({ silent })])
      return walletData
    },
    [loadWallet, loadTransactions]
  )

  const handleLiveChanged = useCallback(
    async ({ external } = {}) => {
      const walletData = await refreshAll({ silent: true })
      setLiveFingerprint(resolveFingerprintFromWallet(walletData))
      if (external && !skipExternalToastRef.current && !bayarOpen) {
        showToast('Saldo atau riwayat diperbarui.', 'success')
      }
      skipExternalToastRef.current = false
    },
    [refreshAll, showToast, bayarOpen]
  )

  useCashlessLiveSync({
    enabled: ownerReady && !loading,
    seedFingerprint: liveFingerprint,
    onChanged: handleLiveChanged,
    akses,
  })

  useEffect(() => {
    if (!ownerReady) {
      setLoading(false)
      return
    }
    setLoading(true)
    refreshAll()
      .then((walletData) => {
        setLiveFingerprint(resolveFingerprintFromWallet(walletData))
      })
      .finally(() => setLoading(false))
  }, [ownerReady, refreshAll])

  const handleTopUpSuccess = useCallback(async () => {
    skipExternalToastRef.current = true
    showToast('Pembayaran berhasil. Saldo akan diperbarui.', 'success')
    const walletData = await refreshAll({ silent: true })
    setLiveFingerprint(resolveFingerprintFromWallet(walletData))
  }, [refreshAll, showToast])

  const tickWalletCollapse = useCallback(() => {
    const target = collapseTargetRef.current
    const current = collapseCurrentRef.current
    const next = current + (target - current) * COLLAPSE_LERP
    if (Math.abs(target - next) < 0.0015) {
      collapseCurrentRef.current = target
      setWalletCollapse(target)
      collapseRafRef.current = 0
      return
    }
    collapseCurrentRef.current = next
    setWalletCollapse(next)
    collapseRafRef.current = requestAnimationFrame(tickWalletCollapse)
  }, [])

  const syncWalletCollapseTarget = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isMobile = typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
    const raw = isMobile ? Math.min(1, Math.max(0, el.scrollTop / COLLAPSE_SCROLL_RANGE)) : 0
    collapseTargetRef.current = raw
    if (!collapseRafRef.current) {
      collapseRafRef.current = requestAnimationFrame(tickWalletCollapse)
    }
  }, [tickWalletCollapse])

  useEffect(() => {
    return () => {
      if (collapseRafRef.current) cancelAnimationFrame(collapseRafRef.current)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)
    const onChange = () => syncWalletCollapseTarget()
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      mq.removeListener?.(onChange)
    }
  }, [syncWalletCollapseTarget])

  const handleTopUp = useCallback(() => {
    if (!wallet?.account?.id) {
      showToast(
        isToko
          ? 'Toko belum punya akun wallet. Hubungi admin cashless.'
          : 'Belum cetak kartu. Silakan ke kantor UWABA atau hubungi WhatsApp untuk info lebih lanjut.',
        'error'
      )
      return
    }
    setBayarOpen(true)
  }, [showToast, wallet?.account?.id, isToko])

  const handleTransfer = useCallback(() => {
    if (!wallet?.account?.id) {
      showToast(
        isToko
          ? 'Toko belum punya akun wallet. Hubungi admin cashless.'
          : 'Belum cetak kartu. Silakan ke kantor UWABA atau hubungi WhatsApp untuk info lebih lanjut.',
        'error'
      )
      return
    }
    setTransferOpen(true)
  }, [showToast, wallet?.account?.id, isToko])

  const handleTransferSuccess = useCallback(async () => {
    skipExternalToastRef.current = true
    const walletData = await refreshAll({ silent: true })
    setLiveFingerprint(resolveFingerprintFromWallet(walletData))
  }, [refreshAll])

  const handleAturPin = useCallback(() => {
    if (!wallet?.kartu?.has_kartu) {
      showToast('Kartu santri aktif belum tersedia.', 'error')
      return
    }
    setPinMode('set')
    setPinOpen(true)
  }, [showToast, wallet?.kartu?.has_kartu])

  const handleUbahPin = useCallback(() => {
    if (!wallet?.kartu?.has_kartu) {
      showToast('Kartu santri aktif belum tersedia.', 'error')
      return
    }
    setPinMode('change')
    setPinOpen(true)
  }, [showToast, wallet?.kartu?.has_kartu])

  const handlePinSuccess = useCallback(async () => {
    const walletData = await loadWallet()
    setLiveFingerprint(resolveFingerprintFromWallet(walletData))
  }, [loadWallet])

  const handleSelectTx = useCallback(async (item) => {
    const journalId = item?.journal_id
    if (!journalId) return
    setDetailOpen(true)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const res = await cashlessAPI.getTransactionDetail(journalId, akses)
      if (res?.success && res.data) {
        setDetail(res.data)
      } else {
        setDetailError(res?.message || 'Gagal memuat detail')
      }
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Gagal memuat detail')
    } finally {
      setDetailLoading(false)
    }
  }, [akses])

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false)
    setDetail(null)
    setDetailError('')
  }, [])

  if (!ownerReady) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">
          {isToko ? 'Anda harus login sebagai akun toko.' : 'Anda harus login sebagai santri.'}
        </p>
      </div>
    )
  }

  const account = wallet?.account
  const hasWallet = Boolean(account?.id)

  return (
    <PageEnter className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={syncWalletCollapseTarget}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 pb-24 sm:px-6 sm:py-6 lg:pb-6 max-lg:px-3"
      >
        {loading ? (
          <PageEnterLoading className="py-16" />
        ) : (
          <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            <div className="relative sticky top-0 z-20 shrink-0 max-lg:-mx-3 max-lg:px-3 max-lg:pb-2 lg:top-3 lg:mx-0 lg:w-72 lg:self-start lg:px-0 lg:pb-0 xl:w-80">
              {/* Mask full-bleed (bukan kotak rounded) agar konten tidak tembus di sudut kartu */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-3 bottom-0 -z-10 lg:hidden bg-linear-to-b from-primary-50/95 via-white/90 to-transparent dark:from-gray-900 dark:via-slate-900/95 dark:to-transparent"
              />
              <CashlessWalletPanel
                wallet={wallet}
                hasWallet={hasWallet}
                variant={isToko ? 'toko' : 'santri'}
                live
                collapseProgress={walletCollapse}
                onTopUp={handleTopUp}
                onTransfer={handleTransfer}
                onAturPin={isToko ? undefined : handleAturPin}
                onUbahPin={isToko ? undefined : handleUbahPin}
              />
            </div>
            <div className="min-w-0 flex-1">
              <CashlessTransactionList
                items={transactions}
                loading={loadingTx}
                live
                onSelect={handleSelectTx}
              />
            </div>
          </div>
        )}
      </div>

      <BayarOffcanvas
        isOpen={bayarOpen}
        onClose={() => setBayarOpen(false)}
        title={isToko ? 'Top-up Saldo Toko' : 'Top-up Cashless'}
        jenisPembayaran="Cashless"
        idSantri={isToko ? null : santriId}
        idReferensi={account?.id ?? null}
        tabelReferensi="cashless___accounts"
        selectionMode="single"
        wajib={0}
        kurang={0}
        onSuccess={handleTopUpSuccess}
        onNotify={showToast}
      />

      <CashlessTransferOffcanvas
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        saldo={account?.balance_cached ?? 0}
        onSuccess={handleTransferSuccess}
        onNotify={showToast}
        akses={akses}
      />

      {!isToko ? (
        <CashlessPinOffcanvas
          isOpen={pinOpen}
          onClose={() => setPinOpen(false)}
          mode={pinMode}
          hasPasskey={Boolean(wallet?.has_passkey)}
          onSuccess={handlePinSuccess}
          onNotify={showToast}
        />
      ) : null}

      <CashlessTransactionDetailOffcanvas
        isOpen={detailOpen}
        onClose={handleCloseDetail}
        detail={detail}
        loading={detailLoading}
        error={detailError}
      />
    </PageEnter>
  )
}
