import { useState } from 'react'
import { cashlessAPI } from '../../../services/api'

/**
 * Form set/ganti PIN 6 digit untuk kartu santri (CS).
 */
export default function KartuPinForm({ kartuId, hasPin = false, onSaved }) {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!kartuId) return null

  const handleSave = async (e) => {
    e.preventDefault()
    const a = String(pin).replace(/\D/g, '')
    const b = String(pin2).replace(/\D/g, '')
    if (a.length !== 6) {
      setError('PIN harus 6 digit angka')
      return
    }
    if (a !== b) {
      setError('Konfirmasi PIN tidak cocok')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await cashlessAPI.setKartuPin(kartuId, a)
      if (res?.success) {
        setPin('')
        setPin2('')
        setOpen(false)
        onSaved?.(true)
      } else {
        setError(res?.message || 'Gagal menyimpan PIN')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">PIN belanja</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {hasPin
              ? 'PIN sudah diatur (wajib belanja ≥ Rp 10.000; tanpa PIN kartu tidak bisa transaksi)'
              : 'Belum ada PIN — kartu belum bisa dipakai transaksi hingga PIN diatur (santri di myBeddien atau di sini)'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v)
            setError('')
          }}
          className="shrink-0 rounded-lg border border-primary-300 dark:border-primary-700 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30"
        >
          {open ? 'Tutup' : hasPin ? 'Ganti PIN' : 'Atur PIN'}
        </button>
      </div>
      {open && (
        <form onSubmit={handleSave} className="mt-3 space-y-2">
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-400">PIN baru (6 digit)</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm tracking-widest text-gray-900 dark:text-white"
              placeholder="••••••"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-400">Ulangi PIN</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm tracking-widest text-gray-900 dark:text-white"
              placeholder="••••••"
            />
          </div>
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 py-2 text-sm font-medium text-white"
          >
            {saving ? 'Menyimpan…' : 'Simpan PIN'}
          </button>
        </form>
      )}
    </div>
  )
}
