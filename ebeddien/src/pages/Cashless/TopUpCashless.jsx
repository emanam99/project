import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI } from '../../services/api'
import { formatSaldo, METODE_OPTIONS } from './TopUpCashlessFormat'
import CashlessTopUpHistoryList from './components/CashlessTopUpHistoryList'

export default function TopUpCashless() {
  const { showNotification } = useNotification()
  const [santriAccounts, setSantriAccounts] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [searchSantri, setSearchSantri] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('tunai')
  const [catatan, setCatatan] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [displayBalance, setDisplayBalance] = useState(null)

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

  const selectedAccount = santriAccounts.find((a) => String(a.id) === String(selectedAccountId))
  const santriId = selectedAccount?.entity_id ? Number(selectedAccount.entity_id) : 0
  const nominalNum = parseInt(String(nominal).replace(/\D/g, ''), 10) || 0

  useEffect(() => {
    setDisplayBalance(selectedAccount?.balance_cached ?? null)
  }, [selectedAccount?.id, selectedAccount?.balance_cached])

  const loadHistory = useCallback(async () => {
    if (!santriId) {
      setHistory([])
      return
    }
    setLoadingHistory(true)
    try {
      const res = await cashlessAPI.getTopUpHistory(santriId, 50)
      setHistory(res?.success && Array.isArray(res.data) ? res.data : [])
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [santriId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedAccount) {
      showNotification('Pilih santri terlebih dahulu.', 'error')
      return
    }
    if (nominalNum < 1) {
      showNotification('Nominal harus lebih dari 0.', 'error')
      return
    }
    if (!santriId) {
      showNotification('Data akun santri tidak valid.', 'error')
      return
    }
    try {
      setSubmitting(true)
      const res = await cashlessAPI.topUp({
        santri_id: santriId,
        nominal: nominalNum,
        referensi: catatan.trim() || undefined,
        metode,
        idempotency_key:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? `topup-${crypto.randomUUID()}`
            : `topup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal melakukan top-up.', 'error')
        return
      }
      if (res.data?.balance_cached != null) {
        setDisplayBalance(res.data.balance_cached)
      }
      showNotification(
        `Top-up Rp ${formatSaldo(nominalNum)} ke ${selectedAccount.entity_label || selectedAccount.name} berhasil.`,
        'success'
      )
      setNominal('')
      setCatatan('')
      await Promise.all([loadHistory(), loadSantriAccounts()])
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal melakukan top-up.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700">
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">Top-up Cashless</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Uang masuk ke wallet santri dicatat di jurnal dengan ID pengguna petugas.
              </p>
            </div>
            <div className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cari / Pilih Santri
                  </label>
                  <input
                    type="text"
                    value={searchSantri}
                    onChange={(e) => setSearchSantri(e.target.value)}
                    placeholder="Nama atau kode akun..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Santri (yang punya wallet)
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    required
                    disabled={loadingList}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">-- Pilih santri --</option>
                    {santriAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.entity_label || a.name} — {a.code} (Saldo: Rp {formatSaldo(a.balance_cached)})
                      </option>
                    ))}
                  </select>
                  {loadingList && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Memuat daftar...</p>}
                  {!loadingList && santriAccounts.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Tidak ada santri dengan wallet. Buat akun wallet dari halaman Akun Cashless.
                    </p>
                  )}
                </div>
                {selectedAccount && (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                    Saldo saat ini:{' '}
                    <strong className="text-gray-900 dark:text-white font-mono tabular-nums">
                      Rp {formatSaldo(displayBalance ?? selectedAccount.balance_cached)}
                    </strong>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nominal (Rp) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={nominal}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '')
                        setNominal(v ? parseInt(v, 10).toLocaleString('id-ID') : '')
                      }}
                      placeholder="Contoh: 50.000"
                      required
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Metode bayar
                    </label>
                    <select
                      value={metode}
                      onChange={(e) => setMetode(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {METODE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Catatan (opsional)
                  </label>
                  <input
                    type="text"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Mis: Setoran orang tua, no. bukti TF, dll"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !selectedAccount || nominalNum < 1}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Memproses...' : 'Simpan Top-up'}
                </button>
              </form>
            </div>
          </div>

          {selectedAccount && santriId > 0 ? (
            <CashlessTopUpHistoryList
              items={history}
              loading={loadingHistory}
              maxHeightClass="max-h-80"
              title={`Riwayat top-up — ${selectedAccount.entity_label || selectedAccount.name}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
