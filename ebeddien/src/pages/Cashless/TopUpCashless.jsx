import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI } from '../../services/api'

function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

export default function TopUpCashless() {
  const { showNotification } = useNotification()
  const [santriAccounts, setSantriAccounts] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [searchSantri, setSearchSantri] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [nominal, setNominal] = useState('')
  const [catatan, setCatatan] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadSantriAccounts = useCallback(async () => {
    try {
      setLoadingList(true)
      const res = await cashlessAPI.getAccountsList({
        entity_type: 'SANTRI',
        limit: 500,
        search: searchSantri.trim() || undefined
      })
      if (res?.success && res.data) {
        setSantriAccounts(res.data)
        if (!res.data.some((a) => String(a.id) === String(selectedAccountId))) {
          setSelectedAccountId('')
        }
      } else {
        setSantriAccounts([])
      }
    } catch (err) {
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
  const nominalNum = parseInt(nominal.replace(/\D/g, ''), 10) || 0

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
    const santriId = selectedAccount.entity_id
    if (!santriId) {
      showNotification('Data akun santri tidak valid.', 'error')
      return
    }
    try {
      setSubmitting(true)
      await cashlessAPI.topUp({
        santri_id: santriId,
        nominal: nominalNum,
        referensi: catatan.trim() || undefined,
        metode: 'tunai'
      })
      showNotification(`Top-up Rp ${formatSaldo(nominalNum)} ke ${selectedAccount.entity_label || selectedAccount.name} berhasil.`, 'success')
      setNominal('')
      setCatatan('')
      loadSantriAccounts()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal melakukan top-up.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 max-w-xl mx-auto">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-teal-50 to-white dark:from-gray-800 dark:to-gray-800/80 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 text-teal-600 dark:text-teal-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Top Up Dana</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Orang tua bayar cash ke kantor, petugas mencatat top-up ke wallet santri di sini.
                  </p>
                </div>
              </div>
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
                  {!loadingList && santriAccounts.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Tidak ada santri dengan wallet. Buat akun wallet dari halaman Akun Cashless.</p>}
                </div>
                {selectedAccount && (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                    Saldo saat ini: <strong className="text-gray-900 dark:text-white">Rp {formatSaldo(selectedAccount.balance_cached)}</strong>
                  </div>
                )}
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
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Catatan (opsional)
                  </label>
                  <input
                    type="text"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Mis: Setoran orang tua, tanggal, dll"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !selectedAccount || nominalNum < 1}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Memproses...' : 'Simpan Top-Up'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
