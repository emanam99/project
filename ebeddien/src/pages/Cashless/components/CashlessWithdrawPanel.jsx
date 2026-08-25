import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cashlessAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { formatSaldo, METODE_OPTIONS } from '../TopUpCashlessFormat'
import CashlessTopUpHistoryList from './CashlessTopUpHistoryList'

/**
 * Panel tarik tunai wallet (santri atau toko).
 * entity: 'santri' | 'toko'
 */
export default function CashlessWithdrawPanel({
  entity = 'santri',
  account,
  santriId,
  tokoId,
  onSuccess,
  hideHistory = false,
  formOnly = false,
  onCloseForm,
}) {
  const { showNotification } = useNotification()
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showForm, setShowForm] = useState(formOnly)
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('tunai')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [displayBalance, setDisplayBalance] = useState(null)

  const isToko = entity === 'toko'
  const sid = santriId ? Number(santriId) : 0
  const tid = tokoId ? Number(tokoId) : 0
  const entityOk = isToko ? tid > 0 : sid > 0
  const hasWallet = Boolean(account?.id && entityOk)
  const saldo = Number(displayBalance ?? account?.balance_cached ?? 0)

  useEffect(() => {
    setDisplayBalance(account?.balance_cached ?? null)
  }, [account?.id, account?.balance_cached])

  const loadHistory = useCallback(async () => {
    if (hideHistory || !hasWallet) {
      setHistory([])
      return
    }
    setLoadingHistory(true)
    try {
      const res = await cashlessAPI.getWithdrawHistory(
        isToko ? { tokoId: tid, limit: 50 } : { santriId: sid, limit: 50 }
      )
      setHistory(res?.success && Array.isArray(res.data) ? res.data : [])
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [hideHistory, hasWallet, isToko, sid, tid])

  useEffect(() => {
    loadHistory()
    setShowForm(formOnly)
    setNominal('')
    setMetode('tunai')
    setCatatan('')
    setError(null)
  }, [loadHistory, account?.id, formOnly])

  const handleAmountInput = (e) => {
    const digits = e.target.value.replace(/\D/g, '')
    setNominal(digits ? Number(digits).toLocaleString('id-ID') : '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const amount = parseInt(String(nominal).replace(/\D/g, ''), 10) || 0
    if (!hasWallet) {
      setError(isToko ? 'Toko belum punya akun wallet' : 'Santri belum punya akun wallet')
      return
    }
    if (amount < 1) {
      setError('Masukkan nominal yang valid')
      return
    }
    if (amount > saldo + 0.001) {
      setError('Nominal melebihi saldo wallet')
      return
    }
    try {
      setSaving(true)
      const body = {
        nominal: amount,
        metode,
        referensi: catatan.trim() || undefined,
        idempotency_key:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? `wd-${crypto.randomUUID()}`
            : `wd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }
      if (isToko) body.pedagang_id = tid
      else body.santri_id = sid

      const res = await cashlessAPI.withdraw(body)
      if (!res?.success) {
        setError(res?.message || 'Gagal tarik tunai')
        return
      }
      if (res.data?.balance_cached != null) {
        setDisplayBalance(res.data.balance_cached)
      }
      showNotification(`Tarik tunai Rp ${formatSaldo(amount)} berhasil.`, 'success')
      setShowForm(formOnly)
      setNominal('')
      setCatatan('')
      await loadHistory()
      onSuccess?.(res.data)
      if (formOnly) onCloseForm?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal tarik tunai')
    } finally {
      setSaving(false)
    }
  }

  if (!hasWallet) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center">
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-4 text-center dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {isToko
              ? 'Buat akun cashless toko terlebih dahulu untuk tarik tunai.'
              : 'Buat akun cashless terlebih dahulu untuk tarik tunai.'}
          </p>
        </div>
      </div>
    )
  }

  const withdrawForm = (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nominal}
          onChange={handleAmountInput}
          placeholder="Nominal"
          className="min-w-0 flex-1 border-b-2 border-gray-300 bg-transparent p-2 text-right font-mono text-sm focus:border-rose-500 focus:outline-none dark:border-gray-600"
          autoFocus={formOnly}
        />
        <select
          value={metode}
          onChange={(e) => setMetode(e.target.value)}
          className="border-b-2 border-gray-300 bg-transparent p-2 text-xs focus:border-rose-500 focus:outline-none dark:border-gray-600"
        >
          {METODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Tarik'}
        </button>
      </div>
      <input
        type="text"
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder="Catatan (opsional)"
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800"
      />
      {error ? (
        <p className="text-center text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setShowForm(formOnly)
          setError(null)
          onCloseForm?.()
        }}
        className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        Batal
      </button>
    </form>
  )

  if (formOnly) {
    return withdrawForm
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/60">
          Saldo wallet:{' '}
          <strong className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
            Rp {formatSaldo(displayBalance ?? account.balance_cached)}
          </strong>
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          Tarik tunai mengurangi saldo wallet dan saldo kas sistem (jurnal WITHDRAWAL).
        </p>

        {!hideHistory ? (
          <CashlessTopUpHistoryList
            items={history}
            loading={loadingHistory}
            maxHeightClass="max-h-none"
            title="Riwayat tarik tunai"
            emptyText="Belum ada riwayat tarik tunai."
          />
        ) : null}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white pt-3 dark:border-gray-700 dark:bg-gray-800">
        <AnimatePresence initial={false} mode="wait">
          {showForm ? (
            <motion.div
              key="withdraw-form"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
            >
              {withdrawForm}
            </motion.div>
          ) : (
            <motion.div
              key="withdraw-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => setShowForm(true)}
                disabled={saldo <= 0}
                className="w-full rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saldo <= 0 ? 'Saldo kosong' : 'Tarik tunai'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
