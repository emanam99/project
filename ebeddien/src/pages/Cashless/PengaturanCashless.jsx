import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI } from '../../services/api'
import BatasHarianOpsionalOffcanvas from './components/BatasHarianOpsionalOffcanvas'

const MAINTENANCE_OPTIONS = [
  { value: 5, label: '5 menit' },
  { value: 10, label: '10 menit' },
  { value: 30, label: '30 menit' },
  { value: 60, label: '60 menit' },
  { value: 1440, label: '24 jam' },
  { value: 'manual', label: 'Hingga diaktifkan kembali' },
]

function formatUntil(iso) {
  if (!iso) return ''
  try {
    const d = new Date(String(iso).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRemaining(seconds) {
  if (seconds == null || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} jam ${m} menit lagi`
  if (m > 0) return `${m} menit lagi`
  return 'kurang dari 1 menit lagi'
}

function formatRp(n) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}

export default function PengaturanCashless() {
  const { showNotification } = useNotification()
  const [feeType, setFeeType] = useState('percent')
  const [feeValue, setFeeValue] = useState(0)
  const [feeSaving, setFeeSaving] = useState(false)
  const [batasHarianGlobal, setBatasHarianGlobal] = useState(0)
  const [batasHarianSaving, setBatasHarianSaving] = useState(false)
  const [batasPinBelanja, setBatasPinBelanja] = useState(10000)
  const [batasPinSaving, setBatasPinSaving] = useState(false)
  const [moneyLimits, setMoneyLimits] = useState({
    topup_max_per_tx: 10000000,
    withdraw_max_per_tx: 10000000,
    transfer_max_per_tx: 5000000,
    wallet_saldo_max: 50000000,
    transfer_daily_max: 10000000,
    duplicate_window_sec: 30,
  })
  const [moneyLimitsSaving, setMoneyLimitsSaving] = useState(false)
  const [maintenance, setMaintenance] = useState(null)
  const [maintenanceDuration, setMaintenanceDuration] = useState(30)
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  const [opsionalCount, setOpsionalCount] = useState(0)
  const [opsionalOpen, setOpsionalOpen] = useState(false)

  const loadConfig = useCallback(() => {
    cashlessAPI.getConfig().then((res) => {
      if (res?.success && res.data) {
        setFeeType(res.data.fee_type === 'fixed' ? 'fixed' : 'percent')
        const val = res.data.fee_value != null ? Number(res.data.fee_value) : (res.data.fee_percent != null ? Number(res.data.fee_percent) : 0)
        setFeeValue(Number.isFinite(val) ? val : 0)
        const bg = res.data.batas_harian_global != null ? Number(res.data.batas_harian_global) : 0
        setBatasHarianGlobal(Number.isFinite(bg) ? bg : 0)
        const bp = res.data.batas_pin_belanja != null ? Number(res.data.batas_pin_belanja) : 10000
        setBatasPinBelanja(Number.isFinite(bp) ? bp : 10000)
        setMoneyLimits((prev) => ({
          ...prev,
          topup_max_per_tx: Number(res.data.topup_max_per_tx) || prev.topup_max_per_tx,
          withdraw_max_per_tx: Number(res.data.withdraw_max_per_tx) || prev.withdraw_max_per_tx,
          transfer_max_per_tx: Number(res.data.transfer_max_per_tx) || prev.transfer_max_per_tx,
          wallet_saldo_max: Number(res.data.wallet_saldo_max) || prev.wallet_saldo_max,
          transfer_daily_max: Number(res.data.transfer_daily_max) || prev.transfer_daily_max,
          duplicate_window_sec: Number(res.data.duplicate_window_sec) || prev.duplicate_window_sec,
        }))
        if (res.data.maintenance) {
          setMaintenance(res.data.maintenance)
        }
        const oc = res.data.batas_harian_opsional_count
        setOpsionalCount(Number.isFinite(Number(oc)) ? Number(oc) : 0)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!maintenance?.active) return undefined
    const timer = window.setInterval(loadConfig, 30000)
    return () => window.clearInterval(timer)
  }, [maintenance?.active, loadConfig])

  const handleSaveFee = async (e) => {
    e.preventDefault()
    try {
      setFeeSaving(true)
      await cashlessAPI.setConfig({ fee_type: feeType, fee_value: feeValue })
      showNotification('Fee berhasil disimpan.', 'success')
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan fee', 'error')
    } finally {
      setFeeSaving(false)
    }
  }

  const handleSaveBatasHarian = async (e) => {
    e.preventDefault()
    try {
      setBatasHarianSaving(true)
      await cashlessAPI.setConfig({ batas_harian_global: Math.max(0, Number(batasHarianGlobal) || 0) })
      showNotification('Batas belanja harian masal berhasil disimpan.', 'success')
      loadConfig()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan batas harian', 'error')
    } finally {
      setBatasHarianSaving(false)
    }
  }

  const handleSaveBatasPin = async (e) => {
    e.preventDefault()
    try {
      setBatasPinSaving(true)
      await cashlessAPI.setConfig({ batas_pin_belanja: Math.max(0, Number(batasPinBelanja) || 0) })
      showNotification('Batas PIN belanja berhasil disimpan.', 'success')
      loadConfig()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan batas PIN', 'error')
    } finally {
      setBatasPinSaving(false)
    }
  }

  const handleSaveMoneyLimits = async (e) => {
    e.preventDefault()
    try {
      setMoneyLimitsSaving(true)
      await cashlessAPI.setConfig({
        topup_max_per_tx: Math.max(1000, Number(moneyLimits.topup_max_per_tx) || 0),
        withdraw_max_per_tx: Math.max(1000, Number(moneyLimits.withdraw_max_per_tx) || 0),
        transfer_max_per_tx: Math.max(1000, Number(moneyLimits.transfer_max_per_tx) || 0),
        wallet_saldo_max: Math.max(1000, Number(moneyLimits.wallet_saldo_max) || 0),
        transfer_daily_max: Math.max(1000, Number(moneyLimits.transfer_daily_max) || 0),
        duplicate_window_sec: Math.min(600, Math.max(5, Number(moneyLimits.duplicate_window_sec) || 30)),
      })
      showNotification('Batas uang cashless berhasil disimpan.', 'success')
      loadConfig()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan batas uang', 'error')
    } finally {
      setMoneyLimitsSaving(false)
    }
  }

  const handleStartMaintenance = async () => {
    const opt = MAINTENANCE_OPTIONS.find((o) => o.value === maintenanceDuration)
    const label = opt?.label || 'durasi terpilih'
    if (!window.confirm(
      `Semua scan kartu cashless akan ditolak dengan pesan pemeliharaan server (${label}). Lanjutkan?`
    )) {
      return
    }
    try {
      setMaintenanceSaving(true)
      const duration = maintenanceDuration === 'manual' ? null : maintenanceDuration
      const res = await cashlessAPI.startMaintenance(duration)
      if (res?.success) {
        setMaintenance(res.maintenance || null)
        showNotification(res.message || 'Mode pemeliharaan diaktifkan.', 'success')
        loadConfig()
      } else {
        showNotification(res?.message || 'Gagal menghentikan transaksi', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menghentikan transaksi', 'error')
    } finally {
      setMaintenanceSaving(false)
    }
  }

  const handleStopMaintenance = async () => {
    try {
      setMaintenanceSaving(true)
      const res = await cashlessAPI.stopMaintenance()
      if (res?.success) {
        setMaintenance(res.maintenance || null)
        showNotification(res.message || 'Transaksi cashless kembali aktif.', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengaktifkan kembali', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal mengaktifkan kembali', 'error')
    } finally {
      setMaintenanceSaving(false)
    }
  }

  const maintenanceActive = Boolean(maintenance?.active)
  const remainingLabel = formatRemaining(maintenance?.remaining_seconds)

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
          {/* Batas transaksi — diubah admin kapan saja; dipakai backend langsung */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-800/60 shadow-sm overflow-hidden">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Batas transaksi &amp; saldo
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Atur di sini kapan saja. Nilai disimpan di server dan langsung berlaku untuk top-up, tarik tunai,
                dan transfer (eBeddien &amp; myBeddien).
              </p>
              <form onSubmit={handleSaveMoneyLimits} className="grid gap-3 sm:grid-cols-2">
                {[
                  ['topup_max_per_tx', 'Maks. top-up per transaksi', true],
                  ['withdraw_max_per_tx', 'Maks. tarik tunai per transaksi', true],
                  ['transfer_max_per_tx', 'Maks. transfer per transaksi', true],
                  ['transfer_daily_max', 'Maks. transfer per hari (pengirim)', true],
                  ['wallet_saldo_max', 'Maks. saldo wallet', true],
                  ['duplicate_window_sec', 'Jendela anti double-submit (detik)', false],
                ].map(([key, label, isRp]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {label}
                    </label>
                    <input
                      type="number"
                      min={isRp ? 1000 : 5}
                      step={isRp ? 1000 : 1}
                      value={moneyLimits[key]}
                      onChange={(e) =>
                        setMoneyLimits((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      {isRp
                        ? `≈ Rp ${formatRp(moneyLimits[key] || 0)}`
                        : `${moneyLimits[key] || 0} detik (identik dalam jendela ini ditolak)`}
                    </p>
                  </div>
                ))}
                <div className="sm:col-span-2 pt-1">
                  <button
                    type="submit"
                    disabled={moneyLimitsSaving}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {moneyLimitsSaving ? 'Menyimpan...' : 'Simpan batas transaksi'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Fee transaksi</h2>
              <form onSubmit={handleSaveFee} className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tipe fee</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="fee_type"
                        checked={feeType === 'percent'}
                        onChange={() => setFeeType('percent')}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Persen (%)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="fee_type"
                        checked={feeType === 'fixed'}
                        onChange={() => setFeeType('fixed')}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Nominal (Rp)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {feeType === 'percent' ? 'Fee (%)' : 'Fee (Rp)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={feeType === 'percent' ? 100 : undefined}
                    step={feeType === 'percent' ? 0.01 : 1}
                    value={feeValue}
                    onChange={(e) => setFeeValue(parseFloat(e.target.value) || 0)}
                    className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder={feeType === 'percent' ? '0–100' : 'Contoh: 100'}
                  />
                </div>
                <button type="submit" disabled={feeSaving} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50">
                  {feeSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Batas belanja harian (masal)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Batas default untuk semua santri per hari. Isi <strong>0</strong> untuk menonaktifkan.
                Limit khusus per wallet (di detail akun) akan menimpa nilai ini bila diaktifkan.
              </p>
              <form onSubmit={handleSaveBatasHarian} className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Batas per hari (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={batasHarianGlobal}
                    onChange={(e) => setBatasHarianGlobal(parseFloat(e.target.value) || 0)}
                    className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="Contoh: 75000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={batasHarianSaving}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {batasHarianSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
              {batasHarianGlobal > 0 ? (
                <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">
                  Aktif: maksimal Rp {formatRp(batasHarianGlobal)} / santri / hari
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Limit masal nonaktif.</p>
              )}
              <button
                type="button"
                onClick={() => setOpsionalOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200 dark:hover:bg-teal-900/50"
              >
                <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                  {opsionalCount}
                </span>
                santri memakai batas opsional
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">PIN belanja kartu santri</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Belanja di kasir toko <strong>mulai nominal ini</strong> wajib PIN 6 digit.
                Isi <strong>0</strong> agar setiap belanja wajib PIN. Berlaku langsung di eBeddien &amp; myBeddien.
              </p>
              <form onSubmit={handleSaveBatasPin} className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Wajib PIN jika belanja ≥ (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={batasPinBelanja}
                    onChange={(e) => setBatasPinBelanja(parseFloat(e.target.value) || 0)}
                    className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="Contoh: 5000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={batasPinSaving}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {batasPinSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
              <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">
                {batasPinBelanja > 0
                  ? `Aktif: belanja ≥ Rp ${formatRp(batasPinBelanja)} wajib PIN`
                  : 'Setiap belanja wajib PIN'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Hentikan transaksi sementara</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Saat aktif, semua scan kartu cashless ditolak (buku tamu, validasi cetak, transaksi) dengan pesan pemeliharaan server.
              </p>

              {maintenanceActive ? (
                <div className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 p-3 mb-4">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Pemeliharaan aktif — scan kartu dinonaktifkan
                  </p>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1">
                    {maintenance?.indefinite
                      ? 'Berlaku hingga Anda mengaktifkan kembali secara manual.'
                      : `Berakhir otomatis: ${formatUntil(maintenance?.until)}${remainingLabel ? ` (${remainingLabel})` : ''}`}
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Durasi</span>
                  <div className="flex flex-wrap gap-2">
                    {MAINTENANCE_OPTIONS.map((opt) => (
                      <label
                        key={String(opt.value)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                          maintenanceDuration === opt.value
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="maintenance_duration"
                          className="sr-only"
                          checked={maintenanceDuration === opt.value}
                          onChange={() => setMaintenanceDuration(opt.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {maintenanceActive ? (
                  <button
                    type="button"
                    onClick={handleStopMaintenance}
                    disabled={maintenanceSaving}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {maintenanceSaving ? 'Memproses...' : 'Aktifkan kembali transaksi'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartMaintenance}
                    disabled={maintenanceSaving}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {maintenanceSaving ? 'Memproses...' : 'Hentikan transaksi sementara'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <BatasHarianOpsionalOffcanvas
        isOpen={opsionalOpen}
        onClose={() => setOpsionalOpen(false)}
        onChanged={loadConfig}
      />
    </div>
  )
}
