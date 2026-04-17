import { useEffect, useState } from 'react'
import {
  normalizeJadwalDefault,
  normalizeSidikDefault,
  fallbackJadwalDefault
} from '../../../utils/absenJadwal'

/**
 * roleOptionsMandiri null = belum dari API (simpan tidak mengirim akses_absen_mandiri).
 *
 * @param {{
 *   jadwalDefault: import('../../../utils/absenJadwal').JadwalTigaSesi,
 *   sidikDefault: { ikut_jadwal_default: boolean, toleransi_telat_menit: number },
 *   aksesMandiriDefault?: { role_keys: string[] },
 *   roleOptionsMandiri?: { key: string, label: string }[] | null,
 *   canEdit: boolean,
 *   onSave: (payload: {
 *     jadwal_default?: object,
 *     sidik_jari_default?: object,
 *     akses_absen_mandiri?: { role_keys: string[] }
 *   }) => Promise<void>
 * }} props
 */
export default function AbsenDefaultSettingsCard({
  jadwalDefault,
  sidikDefault,
  aksesMandiriDefault,
  roleOptionsMandiri,
  canEdit,
  onSave
}) {
  const [jd, setJd] = useState(() => fallbackJadwalDefault())
  const [sd, setSd] = useState(() => normalizeSidikDefault(null))
  const [mandiriRoles, setMandiriRoles] = useState(() => new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setJd(normalizeJadwalDefault(jadwalDefault))
  }, [jadwalDefault])

  useEffect(() => {
    setSd(normalizeSidikDefault(sidikDefault))
  }, [sidikDefault])

  useEffect(() => {
    const keys = aksesMandiriDefault?.role_keys
    setMandiriRoles(new Set(Array.isArray(keys) ? keys : []))
  }, [aksesMandiriDefault])

  const toggleMandiriRole = (key) => {
    if (!canEdit || saving) return
    const k = String(key).trim()
    if (!k) return
    setMandiriRoles((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const handleSave = async () => {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      const payload = { jadwal_default: jd, sidik_jari_default: sd }
      if (roleOptionsMandiri != null) {
        payload.akses_absen_mandiri = { role_keys: Array.from(mandiriRoles) }
      }
      await onSave(payload)
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
              </div>
            ))}
          </div>
        </div>

        {roleOptionsMandiri != null && (
          <div className="rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-600 dark:bg-gray-900/30">
            <p className="mb-1 text-xs font-medium text-gray-800 dark:text-gray-200">
              Siapa yang boleh absen mandiri (GPS)
            </p>
            <p className="mb-3 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
              Opsional. Kosongkan semua centang agar tidak memfilter peran — siapa pun yang sudah memenuhi aturan fitur
              (menu Absen + aksi) tetap bisa seperti biasa. Centang peran untuk <span className="font-medium">membatasi</span>{' '}
              hanya peran tersebut (user harus punya minimal satu peran yang dicentang).
            </p>
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {roleOptionsMandiri.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Tidak ada daftar peran.</p>
              ) : (
                roleOptionsMandiri.map((r) => (
                  <label
                    key={r.key}
                    className={`flex cursor-pointer items-center gap-2 rounded border border-transparent px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!canEdit ? 'cursor-default opacity-80' : ''}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!canEdit || saving}
                      checked={mandiriRoles.has(r.key)}
                      onChange={() => toggleMandiriRole(r.key)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{r.label}</span>
                    <span className="font-mono text-[10px] text-gray-400">{r.key}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

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
