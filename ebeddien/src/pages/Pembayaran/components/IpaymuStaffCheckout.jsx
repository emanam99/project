import { useState, useMemo } from 'react'
import { paymentTransactionAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import {
  BankIcon,
  CStoreIcon,
  QRISIcon,
  EwalletIcon,
  VA_BANKS,
  CSTORES,
  EWALLETS
} from './PaymentIcons'

function phoneDigitsForPayment(phone) {
  let p = String(phone || '').replace(/\D/g, '')
  if (!p) return ''
  if (p.startsWith('62')) p = p.slice(2)
  if (p.startsWith('0')) p = p.slice(1)
  return p
}

function isValidPhone(phone) {
  return phoneDigitsForPayment(phone).length >= 10
}

function isValidEmail(email) {
  const e = String(email || '').trim()
  if (!e) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function methodLabel(method, channel) {
  if (method === 'qris') return 'QRIS'
  if (method === 'va') return `VA ${(channel || '').toUpperCase()}`
  if (method === 'cstore') return channel === 'indomaret' ? 'Indomaret' : 'Alfamart'
  if (method === 'ewallet') return channel === 'shopeepay' ? 'ShopeePay' : 'DANA'
  return method || '-'
}

/**
 * Checkout iPayMu staff: pilih metode → buat tagihan (defer_wa) → Kirim WA (QR/logo).
 */
export default function IpaymuStaffCheckout({
  amount,
  name,
  initialPhone = '',
  initialEmail = '',
  /** Field tambahan ke POST create (jenis_pembayaran, id_santri, …) */
  createExtras = {},
  onCreated,
  onClose
}) {
  const { showNotification } = useNotification()
  const [phone, setPhone] = useState(initialPhone || '')
  const [email, setEmail] = useState(initialEmail || '')
  const [paymentMethod, setPaymentMethod] = useState('qris')
  const [paymentChannel, setPaymentChannel] = useState('')
  const [creating, setCreating] = useState(false)
  const [sendingWa, setSendingWa] = useState(false)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)

  const amountNum = useMemo(() => {
    const n = typeof amount === 'number' ? amount : parseFloat(String(amount || '').replace(/\./g, '')) || 0
    return Math.max(0, n)
  }, [amount])

  const canCreate =
    amountNum > 0 &&
    isValidPhone(phone) &&
    isValidEmail(email) &&
    (paymentMethod === 'qris' ||
      (paymentMethod === 'va' && paymentChannel) ||
      (paymentMethod === 'cstore' && paymentChannel) ||
      (paymentMethod === 'ewallet' && paymentChannel))

  const handleCreate = async () => {
    if (!canCreate) {
      showNotification('Lengkapi nomor WA, email (opsional valid), dan metode pembayaran', 'error')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const payload = {
        amount: amountNum,
        name: (name || 'Pembayar').trim() || 'Pembayar',
        phone: phoneDigitsForPayment(phone),
        email: (email || '').trim() || 'alutsmanipps@gmail.com',
        payment_method: paymentMethod,
        payment_channel: paymentMethod === 'qris' ? 'mpm' : paymentChannel,
        defer_wa: true,
        reference_id: `STAFF-${Date.now()}`,
        ...createExtras
      }
      if (paymentMethod === 'ewallet') {
        payload.return_url = typeof window !== 'undefined' ? window.location.origin + '/pembayaran' : ''
      }
      const result = await paymentTransactionAPI.createTransaction(payload)
      if (!result.success || !result.data) {
        throw new Error(result.message || result.detail || 'Gagal membuat tagihan iPayMu')
      }
      const data = {
        ...result.data,
        payment_method: result.data.payment_method || paymentMethod,
        payment_channel: result.data.payment_channel || paymentChannel
      }
      setOrder(data)
      showNotification('Tagihan iPayMu berhasil dibuat', 'success')
      onCreated?.(data)
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gagal membuat tagihan'
      setError(msg)
      showNotification(msg, 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleSendWa = async () => {
    if (!order?.transaction_id) return
    if (!isValidPhone(phone)) {
      showNotification('Nomor WhatsApp tidak valid', 'error')
      return
    }
    setSendingWa(true)
    try {
      const result = await paymentTransactionAPI.sendWa(order.transaction_id, {
        phone: phoneDigitsForPayment(phone),
        email: (email || '').trim() || undefined
      })
      if (!result.success) {
        throw new Error(result.message || 'Gagal mengirim WA')
      }
      showNotification(result.message || 'Notifikasi WA sedang dikirim', 'success')
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal mengirim WA', 'error')
    } finally {
      setSendingWa(false)
    }
  }

  const selectMethod = (method, channel = '') => {
    setPaymentMethod(method)
    setPaymentChannel(channel)
  }

  if (order) {
    const m = order.payment_method || paymentMethod
    const ch = order.payment_channel || paymentChannel
    return (
      <div className="space-y-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-teal-900 dark:text-teal-100">Tagihan iPayMu siap</h4>
          <span className="text-xs text-teal-700 dark:text-teal-300">{methodLabel(m, ch)}</span>
        </div>
        <div className="flex items-center gap-2">
          {m === 'qris' && <QRISIcon className="h-8" />}
          {m === 'va' && <BankIcon bank={ch} className="h-8" />}
          {m === 'cstore' && <CStoreIcon store={ch} className="h-8" />}
          {m === 'ewallet' && <EwalletIcon wallet={ch} className="h-8" />}
          <div className="text-xs text-gray-700 dark:text-gray-300">
            <div>Nominal: Rp {Number(order.amount || amountNum).toLocaleString('id-ID')}</div>
            {order.admin_fee != null && <div>Admin: Rp {Number(order.admin_fee).toLocaleString('id-ID')}</div>}
            {order.total != null && <div className="font-semibold">Total: Rp {Number(order.total).toLocaleString('id-ID')}</div>}
            {order.va_number && (
              <div className="mt-1 font-mono text-sm break-all">
                {m === 'cstore' ? 'Kode' : 'VA'}: {order.va_number}
              </div>
            )}
            {order.expired_at && <div className="text-amber-700 dark:text-amber-300">Exp: {order.expired_at}</div>}
          </div>
        </div>
        {m === 'qris' && order.qr_code && (
          <p className="text-xs text-gray-600 dark:text-gray-400">QRIS siap dikirim sebagai gambar di WhatsApp.</p>
        )}
        {order.payment_url && m === 'ewallet' && (
          <a
            href={order.payment_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-700 dark:text-teal-300 underline"
          >
            Buka tautan e-wallet
          </a>
        )}

        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          No. WhatsApp tujuan
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
            placeholder="08xxxxxxxxxx"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Email (opsional, notifikasi email)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
            placeholder="email@contoh.com"
          />
        </label>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSendWa}
            disabled={sendingWa || !isValidPhone(phone)}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            {sendingWa
              ? 'Mengirim…'
              : m === 'qris'
                ? 'Kirim WA + gambar QRIS'
                : 'Kirim WA + logo metode'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOrder(null)
              onClose?.()
            }}
            className="w-full text-sm text-gray-600 dark:text-gray-400 py-1"
          >
            Tutup / buat tagihan lain
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800/60">
      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Buat tagihan iPayMu</h4>
      <p className="text-xs text-gray-500">
        Nominal: <strong>Rp {amountNum.toLocaleString('id-ID')}</strong>
      </p>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        No. WhatsApp / HP
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
          placeholder="08xxxxxxxxxx"
        />
      </label>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
          placeholder="opsional — fallback sistem jika kosong"
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Metode</p>
        <button
          type="button"
          onClick={() => selectMethod('qris')}
          className={`w-full flex items-center gap-2 px-2 py-2 rounded-md border text-left text-sm ${
            paymentMethod === 'qris'
              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
              : 'border-gray-200 dark:border-gray-600'
          }`}
        >
          <QRISIcon className="h-7" />
          <span>QRIS</span>
        </button>

        <div>
          <p className="text-[11px] text-gray-500 mb-1">Virtual Account</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VA_BANKS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => selectMethod('va', b.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs ${
                  paymentMethod === 'va' && paymentChannel === b.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                    : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <BankIcon bank={b.id} className="h-5" />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] text-gray-500 mb-1">Gerai</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CSTORES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectMethod('cstore', s.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs ${
                  paymentMethod === 'cstore' && paymentChannel === s.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                    : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <CStoreIcon store={s.id} className="h-5" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] text-gray-500 mb-1">E-wallet</p>
          <div className="grid grid-cols-2 gap-1.5">
            {EWALLETS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => selectMethod('ewallet', w.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs ${
                  paymentMethod === 'ewallet' && paymentChannel === w.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                    : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <EwalletIcon wallet={w.id} className="h-5" />
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={!canCreate || creating}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
      >
        {creating ? 'Membuat tagihan…' : 'Buat tagihan iPayMu'}
      </button>
    </div>
  )
}
