import { useState, useEffect } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { cashlessAPI } from '../../services/api'

export default function PengaturanCashless() {
  const { showNotification } = useNotification()
  const [feeType, setFeeType] = useState('percent')
  const [feeValue, setFeeValue] = useState(0)
  const [feeSaving, setFeeSaving] = useState(false)

  useEffect(() => {
    cashlessAPI.getConfig().then((res) => {
      if (res?.success && res.data) {
        setFeeType(res.data.fee_type === 'fixed' ? 'fixed' : 'percent')
        const val = res.data.fee_value != null ? Number(res.data.fee_value) : (res.data.fee_percent != null ? Number(res.data.fee_percent) : 0)
        setFeeValue(Number.isFinite(val) ? val : 0)
      }
    }).catch(() => {})
  }, [])

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

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 max-w-2xl mx-auto">
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Fee transaksi</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pilih persen atau nominal tetap (rupiah) yang dicatat ke akun Pendapatan Fee setiap transaksi.</p>
            </div>
            <div className="p-4">
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
        </div>
      </div>
    </div>
  )
}
