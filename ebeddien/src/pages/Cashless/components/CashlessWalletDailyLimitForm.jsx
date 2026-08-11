import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../../../contexts/NotificationContext'
import { cashlessAPI } from '../../../services/api'

function formatRp(n) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}

/**
 * Form batas belanja harian untuk wallet santri (override limit global).
 */
export default function CashlessWalletDailyLimitForm({ account, santriId }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aktif, setAktif] = useState(false)
  const [batas, setBatas] = useState(0)
  const [meta, setMeta] = useState(null)

  const load = useCallback(() => {
    if (!account?.id && !santriId) return
    setLoading(true)
    const req = account?.id
      ? cashlessAPI.getAccountBatasHarian(account.id)
      : cashlessAPI.getSantriBatasHarian(santriId)
    req
      .then((res) => {
        if (res?.success && res.data) {
          setAktif(!!res.data.aktif)
          setBatas(Number(res.data.batas_per_hari) || 0)
          setMeta(res.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [account?.id, santriId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const payload = { aktif, batas_per_hari: Math.max(0, Number(batas) || 0) }
      const res = account?.id
        ? await cashlessAPI.setAccountBatasHarian(account.id, payload)
        : await cashlessAPI.setSantriBatasHarian(santriId, payload)
      if (res?.success) {
        showNotification(res.message || 'Batas harian disimpan.', 'success')
        if (res.data) {
          setAktif(!!res.data.aktif)
          setBatas(Number(res.data.batas_per_hari) || 0)
          setMeta(res.data)
        } else {
          load()
        }
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan batas harian', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-[11px] text-gray-500">Memuat batas harian…</p>
  }

  const used = meta?.terpakai_hari_ini != null ? Number(meta.terpakai_hari_ini) : null
  const efektif = meta?.batas_efektif != null ? Number(meta.batas_efektif) : null
  const globalBatas = meta?.batas_global != null ? Number(meta.batas_global) : 0

  return (
    <form
      onSubmit={handleSave}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 p-3 space-y-3"
    >
      <div>
        <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-100">Batas belanja harian</h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Override khusus wallet ini. Jika aktif, dipakai sebagai batas santri ini (bukan limit masal).
          {globalBatas > 0 ? (
            <> Limit masal saat ini: <strong>Rp {formatRp(globalBatas)}</strong>.</>
          ) : (
            <> Belum ada limit masal di Pengaturan Cashless.</>
          )}
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={aktif}
          onChange={(e) => setAktif(e.target.checked)}
          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-xs text-gray-700 dark:text-gray-300">Aktifkan batas khusus wallet ini</span>
      </label>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
          Batas per hari (Rp)
        </label>
        <input
          type="number"
          min={0}
          step={1000}
          value={batas}
          disabled={!aktif}
          onChange={(e) => setBatas(parseFloat(e.target.value) || 0)}
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs disabled:opacity-50"
          placeholder="Contoh: 50000"
        />
      </div>

      {(used != null || efektif != null) && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          Hari ini terpakai: <strong>Rp {formatRp(used ?? 0)}</strong>
          {efektif != null && efektif > 0 ? (
            <> · Batas efektif: <strong>Rp {formatRp(efektif)}</strong></>
          ) : (
            <> · Tidak ada batas efektif</>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium disabled:opacity-50"
      >
        {saving ? 'Menyimpan…' : 'Simpan batas harian'}
      </button>
    </form>
  )
}
