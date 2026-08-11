import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import BarangScannerSection from './BarangScannerSection'
import PinKeypad from './PinKeypad'
import { penjualanAPI } from '../../../services/api'

const PIN_THRESHOLD = 10000

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

/**
 * Alur bayar: scan kartu CS → (PIN jika total ≥ 10rb) → checkout.
 */
export default function PenjualanBayarOffcanvas({
  isOpen,
  onClose,
  cartItems,
  total,
  onSuccess,
  onNotify,
}) {
  const [step, setStep] = useState('scan') // scan | pin | success
  const [cardToken, setCardToken] = useState('')
  const [pin, setPin] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const scannerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      scannerRef.current?.stop?.()
      setStep('scan')
      setCardToken('')
      setPin('')
      setError('')
      setReceipt(null)
      setProcessing(false)
    }
  }, [isOpen])

  const needsPin = total >= PIN_THRESHOLD

  const runCheckout = async (token, pinValue) => {
    if (processing) return
    setProcessing(true)
    setError('')
    try {
      const items = cartItems.map((c) => ({ barang_id: c.id, qty: c.qty }))
      const body = { token, items }
      if (needsPin) body.pin = pinValue
      const res = await penjualanAPI.checkout(body)
      if (res.success && res.data) {
        setReceipt(res.data)
        setStep('success')
        onSuccess?.(res.data)
        onNotify?.('Pembayaran berhasil', 'success')
      } else {
        const code = res.code || ''
        setError(res.message || 'Gagal bayar')
        if (code === 'pin_required' || code === 'pin_invalid') {
          setStep('pin')
        } else if (code === 'pin_not_set') {
          setStep('scan')
        }
        onNotify?.(res.message || 'Gagal bayar', 'error')
      }
    } catch (err) {
      const data = err.response?.data
      const msg = data?.message || 'Gagal memproses pembayaran'
      const code = data?.code || ''
      setError(msg)
      if (code === 'pin_required' || code === 'pin_invalid') {
        setStep('pin')
      } else if (code === 'pin_not_set') {
        setStep('scan')
      }
      onNotify?.(msg, 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleCardScan = (code) => {
    const token = String(code || '').trim()
    if (!token || processing) return
    setCardToken(token)
    if (needsPin) {
      setStep('pin')
      setPin('')
      setError('')
      return
    }
    void runCheckout(token, null)
  }

  const handlePinSubmit = (pinValue) => {
    if (!cardToken) {
      setError('Scan kartu dulu')
      setStep('scan')
      return
    }
    void runCheckout(cardToken, pinValue)
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bayar-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-120 bg-black/50"
        onClick={() => {
          if (!processing && step !== 'success') onClose()
        }}
      />
      <motion.div
        key="bayar-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-130 mx-auto flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100 dark:shadow-black/50 sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {step === 'success' ? 'Berhasil' : step === 'pin' ? 'Masukkan PIN' : 'Scan kartu santri'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total {formatRupiah(total)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Tutup"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 dark:bg-gray-900">
          {error ? (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300 dark:ring-1 dark:ring-red-800/40">
              {error}
            </p>
          ) : null}

          {step === 'scan' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Arahkan kamera ke QR kartu santri (CS).
                {needsPin ? ' Setelah scan, masukkan PIN 6 digit.' : ' Transaksi di bawah Rp 10.000 tanpa PIN.'}
              </p>
              <BarangScannerSection
                expanded
                onScan={handleCardScan}
                scannerRef={scannerRef}
                pageActive={isOpen && step === 'scan'}
              />
              {processing ? (
                <p className="text-center text-sm text-primary-600">Memproses…</p>
              ) : null}
            </div>
          )}

          {step === 'pin' && (
            <div className="space-y-4">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Kartu terdeteksi. Masukkan PIN 6 digit (tombol di layar).
              </p>
              <PinKeypad
                value={pin}
                maxLength={6}
                onChange={setPin}
                onSubmit={handlePinSubmit}
                disabled={processing}
              />
              <button
                type="button"
                onClick={() => {
                  setStep('scan')
                  setCardToken('')
                  setPin('')
                  setError('')
                }}
                className="w-full text-sm text-gray-500 hover:underline"
              >
                Scan ulang kartu
              </button>
            </div>
          )}

          {step === 'success' && receipt && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-700/40 dark:bg-emerald-950/45">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Pembayaran diterima</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                  {formatRupiah(receipt.nominal)}
                </p>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400/90">
                  {receipt.santri_nama}
                  {receipt.santri_nis ? ` · ${receipt.santri_nis}` : ''}
                </p>
              </div>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/80 dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800/70">
                {(receipt.items || []).map((it) => (
                  <li key={it.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                      {it.nama_barang} ×{it.qty}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100">
                      {formatRupiah(it.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Saldo tersisa {formatRupiah(receipt.saldo_sesudah)}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500"
              >
                Selesai
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
