import { useEffect, useState } from 'react'
import {
  normalizeJadwalDefault,
  normalizeSidikDefault,
  fallbackJadwalDefault
} from '../../../utils/absenJadwal'

/**
 * @param {{
 *   jadwalDefault: import('../../../utils/absenJadwal').JadwalTigaSesi,
 *   sidikDefault: { ikut_jadwal_default: boolean, toleransi_telat_menit: number },
 *   canEdit: boolean,
 *   onSave: (payload: { jadwal_default?: object, sidik_jari_default?: object }) => Promise<void>
 * }} props
 */
export default function AbsenDefaultSettingsCard({ jadwalDefault, sidikDefault, canEdit, onSave }) {
  const [jd, setJd] = useState(() => fallbackJadwalDefault())
  const [sd, setSd] = useState(() => normalizeSidikDefault(null))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setJd(normalizeJadwalDefault(jadwalDefault))
  }, [jadwalDefault])

  useEffect(() => {
    setSd(normalizeSidikDefault(sidikDefault))
  }, [sidikDefault])

  const handleSave = async () => {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      await onSave({ jadwal_default: jd, sidik_jari_default: sd })
    } finally {
      setSaving(false)
    }
  }

  const updateSesi = (sesi, field, value) => {
    setJd((prev) => ({
      ...prev,
      [sesi]: { ...prev[sesi], [field]: value }
    }))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pengaturan default absen</h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Dipakai jika titik lokasi tidak mengisi jadwal sendiri, dan sebagai acuan sidik jari (opsional).
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Jadwal pagi / sore / malam</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['pagi', 'sore', 'malam']).map((sesi) => (
              <div
                key={sesi}
                className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40"
              >
                <p className="mb-2 text-xs font-medium capitalize text-gray-800 dark:text-gray-200">{sesi}</p>
                <div className="space-y-2">
                  <div>
                    <label className="mb-0.5 block text-[11px] text-gray-600 dark:text-gray-400">Jam mulai sesi</label>
                    <input
                      type="time"
                      disabled={!canEdit || saving}
                      value={jd[sesi].mulai}
                      onChange={(e) => updateSesi(sesi, 'mulai', e.target.value)}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] text-gray-600 dark:text-gray-400">
                      Dianggap telat setelah
                    </label>
                    <input
                      type="time"
                      disabled={!canEdit || saving}
                      value={jd[sesi].telat}
                      onChange={(e) => updateSesi(sesi, 'telat', e.target.value)}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Sidik jari (default)</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              disabled={!canEdit || saving}
              checked={sd.ikut_jadwal_default}
              onChange={(e) => setSd((s) => ({ ...s, ikut_jadwal_default: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">Terapkan aturan telat mengikuti jadwal default</span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-600 dark:text-gray-400">Toleransi telat tambahan (menit)</label>
            <input
              type="number"
              min={0}
              max={240}
              disabled={!canEdit || saving}
              value={sd.toleransi_telat_menit}
              onChange={(e) =>
                setSd((s) => ({
                  ...s,
                  toleransi_telat_menit: Math.max(0, Math.min(240, Number(e.target.value) || 0))
                }))
              }
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60"
            />
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan pengaturan default'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
