import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { cashlessAPI } from '../../../services/api'
import { formatSaldo } from './CashlessFormat'
import CashlessDigitKeypad from './CashlessDigitKeypad'

function isDesktopLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

/**
 * Transfer ke wallet lain.
 * Mobile: offcanvas bawah + keypad. PC: offcanvas kanan + input teks.
 * Alur: No Wallet → konfirmasi nama → nominal (+ catatan opsional) → kirim.
 */
export default function CashlessTransferOffcanvas({
  isOpen,
  onClose,
  saldo = 0,
  onSuccess,
  onNotify,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const [isDesktop, setIsDesktop] = useState(() => isDesktopLayout())
  const [step, setStep] = useState('dest') // dest | confirm | amount
  const [destCode, setDestCode] = useState('')
  const [destNama, setDestNama] = useState('')
  const [amountDigits, setAmountDigits] = useState('')
  const [catatan, setCatatan] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setStep('dest')
      setDestCode('')
      setDestNama('')
      setAmountDigits('')
      setCatatan('')
      setBusy(false)
      setError('')
    }
  }, [isOpen])

  const nominal = Number(String(amountDigits || '').replace(/\D/g, '') || 0)

  const lookupDest = useCallback(
    async (code) => {
      const normalized = String(code || '').replace(/\D/g, '')
      if (normalized.length !== 7) {
        setError('No Wallet harus 7 digit')
        return
      }
      setBusy(true)
      setError('')
      try {
        const res = await cashlessAPI.lookupWallet(normalized)
        if (res?.success && res.data?.code) {
          setDestCode(res.data.code)
          setDestNama(res.data.nama || '—')
          setStep('confirm')
          return
        }
        setError(res?.message || 'No Wallet tidak ditemukan')
      } catch {
        setError('Gagal mencari No Wallet')
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const submitTransfer = useCallback(async () => {
    if (nominal <= 0) {
      setError('Nominal harus lebih dari 0')
      return
    }
    if (nominal > Number(saldo || 0)) {
      setError('Saldo tidak mencukupi')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await cashlessAPI.transfer({
        dest_code: destCode,
        nominal,
        catatan: catatan.trim() || undefined,
        idempotency_key:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? `xfer-${crypto.randomUUID()}`
            : `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      })
      if (res?.success) {
        onNotify?.('Transfer berhasil', 'success')
        onSuccess?.(res.data)
        handleClose()
        return
      }
      setError(res?.message || 'Transfer gagal')
    } catch {
      setError('Transfer gagal')
    } finally {
      setBusy(false)
    }
  }, [nominal, saldo, destCode, catatan, onNotify, onSuccess, handleClose])

  const title =
    step === 'dest' ? 'Transfer' : step === 'confirm' ? 'Konfirmasi tujuan' : 'Nominal transfer'

  const hint =
    step === 'dest'
      ? 'Masukkan No Wallet tujuan (7 digit)'
      : step === 'confirm'
        ? 'Pastikan nama penerima benar'
        : 'Masukkan nominal. Catatan bersifat opsional.'

  if (typeof document === 'undefined') return null

  const panelBody = (
    <div className={isDesktop ? 'flex h-full flex-col' : 'mx-auto max-w-md px-4 pb-6 pt-3'}>
      {!isDesktop ? <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" /> : null}

      <div className={`mb-3 flex items-start justify-between gap-2 ${isDesktop ? 'border-b border-gray-200 px-4 py-3 dark:border-gray-700' : ''}`}>
        <div className="min-w-0">
          <h2 id="cashless-transfer-title" className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Saldo Anda: <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">Rp {formatSaldo(saldo)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Tutup
        </button>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${isDesktop ? 'px-4 pb-4' : ''}`}>
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {step === 'dest' ? (
          <div className="space-y-3 py-1">
            {isDesktop ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void lookupDest(destCode)
                }}
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    No Wallet tujuan
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={7}
                    value={destCode}
                    onChange={(e) => {
                      setError('')
                      setDestCode(e.target.value.replace(/\D/g, '').slice(0, 7))
                    }}
                    disabled={busy}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm tracking-wider text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="7 digit"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || destCode.length !== 7}
                  className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {busy ? 'Mencari…' : 'Cari'}
                </button>
              </form>
            ) : (
              <CashlessDigitKeypad
                variant="code"
                value={destCode}
                maxLength={7}
                onChange={(v) => {
                  setError('')
                  setDestCode(v)
                }}
                onSubmit={(v) => void lookupDest(v)}
                disabled={busy}
                submitLabel="Cari"
              />
            )}
          </div>
        ) : null}

        {step === 'confirm' ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Penerima</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{destNama}</p>
              <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">No Wallet : {destCode}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError('')
                setStep('amount')
              }}
              className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Lanjut
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError('')
                setDestNama('')
                setStep('dest')
              }}
              className="w-full text-center text-xs font-medium text-primary-600 dark:text-primary-400"
            >
              Ganti No Wallet
            </button>
          </div>
        ) : null}

        {step === 'amount' ? (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/40">
              <span className="text-gray-500">Ke </span>
              <span className="font-semibold text-gray-900 dark:text-white">{destNama}</span>
              <span className="text-gray-400"> · </span>
              <span className="font-mono text-gray-600 dark:text-gray-300">{destCode}</span>
            </div>

            {isDesktop ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nominal</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountDigits}
                    onChange={(e) => {
                      setError('')
                      setAmountDigits(e.target.value.replace(/\D/g, '').slice(0, 9))
                    }}
                    disabled={busy}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Contoh: 25000"
                  />
                  {nominal > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">Rp {formatSaldo(nominal)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Catatan <span className="font-normal text-gray-400">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Mis. bayar utang"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || nominal <= 0}
                  onClick={() => void submitTransfer()}
                  className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {busy ? 'Mengirim…' : 'Kirim transfer'}
                </button>
              </div>
            ) : (
              <>
                <CashlessDigitKeypad
                  variant="amount"
                  value={amountDigits}
                  maxLength={9}
                  onChange={(v) => {
                    setError('')
                    setAmountDigits(v)
                  }}
                  onSubmit={() => void submitTransfer()}
                  disabled={busy}
                  submitLabel="Kirim"
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Catatan <span className="font-normal text-gray-400">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Mis. bayar utang"
                  />
                </div>
              </>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError('')
                setStep('confirm')
              }}
              className="w-full text-center text-xs font-medium text-primary-600 dark:text-primary-400"
            >
              Kembali
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            key="cashless-transfer-backdrop"
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-120 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          {isDesktop ? (
            <motion.aside
              key="cashless-transfer-panel-right"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cashless-transfer-title"
              className="fixed inset-y-0 right-0 z-130 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-900"
              style={{ paddingRight: 'env(safe-area-inset-right, 0px)' }}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
            >
              {panelBody}
            </motion.aside>
          ) : (
            <motion.div
              key="cashless-transfer-panel-bottom"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cashless-transfer-title"
              className="fixed inset-x-0 bottom-0 z-130 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl dark:bg-gray-900"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              {panelBody}
            </motion.div>
          )}
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
