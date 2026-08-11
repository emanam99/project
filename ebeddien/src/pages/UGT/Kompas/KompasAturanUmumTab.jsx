import { useCallback, useEffect, useState } from 'react'
import { ugtKompasAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

export default function KompasAturanUmumTab({ tahunAjaran, fitur = {} }) {
  const { showNotification } = useNotification()
  const [batas, setBatas] = useState('')
  const [catatan, setCatatan] = useState('')
  const [terbuka, setTerbuka] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const canUbah = fitur.aturanUbah !== false

  const load = useCallback(async () => {
    if (!tahunAjaran) return
    setLoading(true)
    try {
      const res = await ugtKompasAPI.getAturan(tahunAjaran)
      if (res?.success && res.data) {
        setBatas(res.data.batas_pendaftaran || '')
        setCatatan(res.data.catatan || '')
        setTerbuka(res.data.pendaftaran_terbuka !== false)
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal memuat aturan', 'error')
    } finally {
      setLoading(false)
    }
  }, [tahunAjaran, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!canUbah) return
    setSaving(true)
    try {
      const res = await ugtKompasAPI.saveAturan({
        tahun_ajaran: tahunAjaran,
        batas_pendaftaran: batas || null,
        catatan: catatan.trim() || null
      })
      if (res?.success) {
        showNotification(res.message || 'Aturan disimpan', 'success')
        if (res.data) {
          setBatas(res.data.batas_pendaftaran || '')
          setCatatan(res.data.catatan || '')
          setTerbuka(res.data.pendaftaran_terbuka !== false)
        }
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full max-w-md border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 focus:outline-none'

  if (loading) {
    return <p className="text-sm text-gray-500">Memuat…</p>
  }

  return (
    <div className="max-w-xl space-y-4">
      <div
        className={`rounded-lg px-4 py-3 text-sm ${
          terbuka
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
        }`}
      >
        {terbuka
          ? batas
            ? `Pendaftaran masih terbuka hingga ${batas}.`
            : 'Batas pendaftaran belum diset — pendaftaran masih terbuka.'
          : `Pendaftaran ditutup (batas ${batas}). Data hanya bisa dilihat.`}
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            Terakhir pendaftaran *
          </label>
          <input
            type="date"
            className={inputClass}
            value={batas}
            onChange={(e) => setBatas(e.target.value)}
            disabled={!canUbah}
            required={canUbah}
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Sebelum dan pada tanggal ini, pendaftaran/edit masih diizinkan. Setelah lewat, dikunci.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            Catatan (opsional)
          </label>
          <textarea
            className={inputClass}
            rows={3}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Contoh: berkas wajib lengkap sebelum batas waktu…"
            disabled={!canUbah}
          />
        </div>
        {canUbah ? (
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan aturan'}
          </button>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">Mode lihat saja — tidak ada izin mengubah aturan.</p>
        )}
      </form>
    </div>
  )
}
