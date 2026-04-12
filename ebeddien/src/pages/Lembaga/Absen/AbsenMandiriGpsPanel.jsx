import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'
import { absenPengurusAPI } from '../../../services/api'
import { useAbsenLokasi } from '../../../contexts/AbsenLokasiContext'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'

function parseCoord(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Absen mandiri (GPS) — dipasang di tab Absen (setelah toggle GPS).
 *
 * @param {{ lokasiList: array, loadingLokasi: boolean }} props
 */
export default function AbsenMandiriGpsPanel({ lokasiList, loadingLokasi }) {
  const user = useAuthStore((s) => s.user)
  const isSuper = userHasSuperAdminAccess(user)
  const { showNotification } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const absenFitur = useAbsenFiturAccess()
  const { gpsEnabled, coords, geoError, geoSupported, coordsRefreshing, refreshCoords } = useAbsenLokasi()

  const bukaTabRiwayat = useCallback(() => {
    if (!absenFitur.tabRiwayat) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'riwayat')
    setSearchParams(next, { replace: true })
  }, [absenFitur.tabRiwayat, searchParams, setSearchParams])

  const [selectedLokasiId, setSelectedLokasiId] = useState('')
  const [busy, setBusy] = useState(false)
  const [gate, setGate] = useState(null)
  const [gateReady, setGateReady] = useState(false)
  const [gateLoading, setGateLoading] = useState(false)

  const idPengurus = user?.id_pengurus != null ? Number(user.id_pengurus) : null

  const loadGate = useCallback(async () => {
    if (idPengurus == null || idPengurus <= 0) return
    setGateLoading(true)
    try {
      const res = await absenPengurusAPI.getMandiriSlot()
      if (res?.success && res.data) {
        setGate(res.data)
      } else {
        setGate({ boleh_masuk: true, boleh_keluar: true, masuk_terbuka: null, slot_label: '' })
      }
    } catch {
      setGate({ boleh_masuk: true, boleh_keluar: true, masuk_terbuka: null, slot_label: '' })
    } finally {
      setGateReady(true)
      setGateLoading(false)
    }
  }, [idPengurus])

  useEffect(() => {
    void loadGate()
  }, [loadGate])

  const dalamRadius = useMemo(() => {
    if (!coords || !lokasiList.length) return []
    const aktif = lokasiList.filter((l) => Number(l.aktif) === 1)
    const acc = Number(coords.accuracy)
    const accBonus = Number.isFinite(acc) && acc > 0 ? Math.min(acc, 120) : 0
    const out = []
    for (const l of aktif) {
      const plat = parseCoord(l.latitude)
      const plng = parseCoord(l.longitude)
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue
      const dist = haversineMeters(coords.lat, coords.lng, plat, plng)
      if (!Number.isFinite(dist)) continue
      const rad = Math.max(10, Number(l.radius_meter) || 100) + accBonus
      if (dist <= rad) {
        out.push({ ...l, _dist: dist })
      }
    }
    out.sort((a, b) => a._dist - b._dist)
    return out
  }, [coords, lokasiList])

  useEffect(() => {
    if (dalamRadius.length === 0) {
      setSelectedLokasiId('')
      return
    }
    const firstId = String(dalamRadius[0].id)
    setSelectedLokasiId((prev) => {
      if (prev && dalamRadius.some((x) => String(x.id) === prev)) return prev
      return firstId
    })
  }, [dalamRadius])

  const submit = useCallback(
    async (status) => {
      if (!coords) {
        showNotification('Aktifkan toggle GPS di atas halaman ini, lalu tunggu posisi terbaca', 'error')
        return
      }
      if (dalamRadius.length === 0) {
        showNotification('Anda di luar zona lokasi absen', 'error')
        return
      }
      const lid = selectedLokasiId ? Number(selectedLokasiId) : Number(dalamRadius[0].id)
      setBusy(true)
      try {
        const res = await absenPengurusAPI.postLokasi({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
          status,
          id_lokasi: lid
        })
        if (res?.success) {
          showNotification(res.message || 'Absensi tercatat', 'success')
          await loadGate()
          if (status === 'Keluar') bukaTabRiwayat()
        } else {
          showNotification(res?.message || 'Gagal mencatat', 'error')
        }
      } catch (e) {
        showNotification(e.response?.data?.message || e.message || 'Gagal mencatat', 'error')
      } finally {
        setBusy(false)
      }
    },
    [bukaTabRiwayat, coords, dalamRadius, loadGate, selectedLokasiId, showNotification]
  )

  if (!isSuper && !absenFitur.lokasiAbsenMandiri) {
    return null
  }

  if (idPengurus == null || idPengurus <= 0) {
    return null
  }

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Absen mandiri (GPS)</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Nyalakan akses lokasi di atas, tunggu koordinat terbaca, lalu absen saat Anda berada dalam radius lokasi yang
        aktif. Setelah berhasil, Anda bisa melihat riwayat di tab Riwayat.
      </p>

      {loadingLokasi ? (
        <p className="text-sm text-gray-500 mt-4">Memuat lokasi…</p>
      ) : lokasiList.length === 0 ? (
        <p className="text-sm text-gray-500 mt-4">
          Belum ada titik lokasi absen aktif. Minta admin menambah titik (pengguna dengan akses daftar lokasi) agar zona
          absen mandiri tersedia.
        </p>
      ) : (
        <>
          {!gpsEnabled && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">
              Aktifkan toggle <span className="font-medium">Akses lokasi (GPS)</span> di atas untuk memulai absen
              mandiri.
            </p>
          )}
          {gpsEnabled && geoError && !coords && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">{geoError}</p>
          )}
          {gpsEnabled && geoSupported && !coords && !geoError && (
            <p className="text-sm text-gray-500 mt-3">Mencari posisi GPS…</p>
          )}
          {gpsEnabled && coords && (
            <div className="mt-4 space-y-3">
              {gateLoading && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Memuat status absen hari ini…</p>
              )}
              {gateReady && gate?.masuk_terbuka && (
                <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 px-3 py-2 text-sm text-teal-900 dark:text-teal-100">
                  <span className="font-medium">Absen masuk</span> sesi{' '}
                  <span className="font-medium">{gate.masuk_terbuka.sesi_label}</span> tercatat pukul{' '}
                  <span className="tabular-nums font-mono">{gate.masuk_terbuka.jam?.slice(0, 8)}</span>.
                  {gate.boleh_keluar ? ' Silakan absen keluar saat meninggalkan lokasi.' : null}
                </div>
              )}
              {gateReady &&
                gate &&
                !gate.boleh_masuk &&
                !gate.boleh_keluar &&
                !gate.masuk_terbuka && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Untuk sesi <span className="font-medium">{gate.slot_label}</span> hari ini absen masuk sudah selesai
                    (beserta keluar). Tidak perlu absen masuk lagi sampai sesi berikutnya atau hari berikutnya.
                  </p>
                )}
              {dalamRadius.length > 0 ? (
                <>
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Anda berada dalam zona:</p>
                  {dalamRadius.length > 1 ? (
                    <select
                      value={selectedLokasiId}
                      onChange={(e) => setSelectedLokasiId(e.target.value)}
                      className="w-full text-sm border rounded-lg px-2 py-2 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    >
                      {dalamRadius.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.nama} (~{Math.round(l._dist)} m)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {dalamRadius[0].nama}{' '}
                      <span className="text-gray-500">(~{Math.round(dalamRadius[0]._dist)} m)</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Posisi sudah terbaca, tetapi Anda di luar zona lokasi aktif. Absen hanya bisa di dekat titik yang
                  ditentukan — coba ikon perbarui posisi atau mendekat ke lokasi.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void refreshCoords()}
                  disabled={coordsRefreshing}
                  title="Perbarui posisi GPS"
                  aria-label="Perbarui posisi GPS"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <svg
                    className={`h-5 w-5 ${coordsRefreshing ? 'animate-spin' : ''}`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7m0 0L19.5 15.3m-4.302-9.3h4.992v4.992"
                    />
                  </svg>
                </button>
                {gateReady && gate?.boleh_masuk && (
                  <button
                    type="button"
                    disabled={busy || coordsRefreshing || dalamRadius.length === 0 || gateLoading}
                    onClick={() => submit('Masuk')}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Absen masuk
                  </button>
                )}
                {gateReady && gate?.boleh_keluar && (
                  <button
                    type="button"
                    disabled={busy || coordsRefreshing || dalamRadius.length === 0 || gateLoading}
                    onClick={() => submit('Keluar')}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Absen keluar
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
