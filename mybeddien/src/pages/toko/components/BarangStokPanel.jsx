import { useCallback, useEffect, useState } from 'react'
import { barangAPI } from '../../../services/api'

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const labelCls = 'mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300'

const JENIS_LABEL = {
  awal: 'Stok awal',
  masuk: 'Masuk',
  terjual: 'Terjual',
  retur: 'Retur',
  rusak: 'Rusak',
  penyesuaian: 'Penyesuaian',
  keluar: 'Keluar',
}

const MUTASI_OPTIONS = [
  { value: 'masuk', label: 'Masuk (+)' },
  { value: 'retur', label: 'Retur (+)' },
  { value: 'rusak', label: 'Rusak (−)' },
  { value: 'penyesuaian', label: 'Penyesuaian (±)' },
]

function formatTanggal(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function BarangStokPanel({ barangId, stok, onStokChange, embedded = false }) {
  const [jenis, setJenis] = useState('masuk')
  const [jumlah, setJumlah] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!barangId) return
    setLoadingHistory(true)
    try {
      const res = await barangAPI.getStokHistory(barangId, { limit: 30 })
      if (res.success && Array.isArray(res.data)) setHistory(res.data)
      else setHistory([])
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [barangId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleMutasiStok = async (e) => {
    e.preventDefault()
    const qty = parseInt(jumlah, 10)
    if (!Number.isFinite(qty) || qty === 0) {
      setError(jenis === 'penyesuaian' ? 'Delta tidak boleh 0' : 'Jumlah harus lebih dari 0')
      return
    }
    if (jenis !== 'penyesuaian' && qty <= 0) {
      setError('Jumlah harus lebih dari 0')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body =
        jenis === 'penyesuaian'
          ? { jenis, delta: qty, keterangan: keterangan.trim() || undefined }
          : { jenis, jumlah: Math.abs(qty), keterangan: keterangan.trim() || undefined }
      const res = await barangAPI.addStok(barangId, body)
      if (res.success) {
        setJumlah('')
        setKeterangan('')
        onStokChange?.(res.data?.stok ?? stok)
        void loadHistory()
      } else {
        setError(res.message || 'Gagal memperbarui stok')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui stok')
    } finally {
      setSaving(false)
    }
  }

  const submitLabel =
    jenis === 'rusak' ? 'Catat rusak' : jenis === 'retur' ? 'Catat retur' : jenis === 'penyesuaian' ? 'Sesuaikan stok' : '+ Tambah stok'

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0 border-t border-gray-200 pt-4 dark:border-gray-700'}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Stok</h3>
        <span
          className={`rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${
            stok <= 0
              ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : stok <= 5
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
          }`}
        >
          {stok ?? 0}
        </span>
      </div>

      <form onSubmit={handleMutasiStok} className="mb-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Mutasi stok</p>
        <div>
          <label className={labelCls}>Jenis</label>
          <select value={jenis} onChange={(e) => setJenis(e.target.value)} className={inputCls}>
            {MUTASI_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label className={labelCls}>{jenis === 'penyesuaian' ? 'Delta (+/−)' : 'Jumlah'}</label>
            <input
              type="number"
              step="1"
              min={jenis === 'penyesuaian' ? undefined : '1'}
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              placeholder={jenis === 'penyesuaian' ? 'mis. -2 atau 5' : '0'}
              className={inputCls}
            />
          </div>
          <div className="min-w-0 flex-[1.4]">
            <label className={labelCls}>Keterangan (opsional)</label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: restok / retur pembeli"
              className={inputCls}
            />
          </div>
        </div>
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : submitLabel}
        </button>
      </form>

      <div className={`min-h-0 ${embedded ? 'flex flex-1 flex-col' : ''}`}>
        <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">Riwayat stok</p>
        {loadingHistory ? (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : history.length === 0 ? (
          <p className="py-2 text-center text-xs text-gray-500 dark:text-gray-400">Belum ada riwayat stok.</p>
        ) : (
          <div
            className={`overflow-y-auto overscroll-contain rounded-lg border border-gray-200 dark:border-gray-600 ${
              embedded ? 'min-h-0 flex-1' : 'max-h-48'
            }`}
          >
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Waktu</th>
                  <th className="px-2 py-1.5 font-medium">Jenis</th>
                  <th className="px-2 py-1.5 text-right font-medium">±</th>
                  <th className="px-2 py-1.5 text-right font-medium">Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {history.map((row) => (
                  <tr key={row.id} className="bg-white dark:bg-gray-800/80">
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-600 dark:text-gray-400">
                      {formatTanggal(row.tanggal_dibuat)}
                    </td>
                    <td className="px-2 py-1.5 text-gray-800 dark:text-gray-200">
                      {JENIS_LABEL[row.jenis] || row.jenis}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold tabular-nums ${
                        row.jumlah >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.jumlah >= 0 ? `+${row.jumlah}` : row.jumlah}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums text-gray-900 dark:text-white">
                      {row.stok_setelah}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
