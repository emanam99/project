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

/** Durasi keterlambatan: jam tanpa leading zero, menit & detik dua digit (mis. 3:32:20). */
function formatDurasiDetikKeHms(totalDetik) {
  const n = Math.max(0, Math.floor(Number(totalDetik)))
  if (!Number.isFinite(n)) return '—'
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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

const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Tanggal ringkas untuk header (selaras gaya grup tanggal tab Riwayat, lebih pendek). */
function formatTanggalRingkas(isoYmd) {
  if (!isoYmd || typeof isoYmd !== 'string') return '–'
  const d = new Date(`${isoYmd.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '–'
  return `${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`
}

/** Pagi / Siang (dari sesi sore) / Malam */
function sesiLabelTampilan(label) {
  const s = String(label ?? '').trim()
  if (s === 'Sore') return 'Siang'
  return s || '–'
}

/** Satu baris timeline seperti tab Riwayat (hanya absen masuk terakhir sesi ini). */
function MandiriRiwayatSatuTitik({ row }) {
  const tepat = row.tepat_waktu === true || Number(row.telat_detik) <= 0
  const telatDetik = Number(row.telat_detik)
  const telatHms =
    row.telat_hms && String(row.telat_hms).trim() !== ''
      ? String(row.telat_hms)
      : formatDurasiDetikKeHms(telatDetik)
  const sumber = row.sumber_absen || 'sidik_jari'
  const lokasiNama = row.lokasi_nama || ''
  return (
    <div className="mt-2.5 border-t border-gray-100 dark:border-gray-700/60 pt-2.5">
      <p className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-2">
        {formatTanggalRingkas(row.tanggal)}
      </p>
      <div className="relative flex items-start gap-3 pl-0.5">
        <span
          className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-teal-500 dark:bg-teal-400 ring-4 ring-teal-100 dark:ring-teal-900/50 border-2 border-white dark:border-gray-800"
          aria-hidden
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug flex flex-wrap items-center gap-1.5">
            {sumber === 'lokasi_gps' ? (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                GPS{lokasiNama ? ` · ${lokasiNama}` : ''}
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                Sidik jari
              </span>
            )}
            <span className="font-medium text-teal-700 dark:text-teal-300">
              {sesiLabelTampilan(row.sesi_label)}
            </span>
            <span className="text-gray-500 dark:text-gray-400"> · Masuk </span>
            <span className="font-mono tabular-nums font-medium text-gray-800 dark:text-gray-200">
              {String(row.jam ?? '–')}
            </span>
            <span className="text-gray-500 dark:text-gray-500"> · </span>
            {tepat ? (
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">Tepat waktu</span>
            ) : (
              <span className="text-amber-800 dark:text-amber-200 font-medium tabular-nums font-mono">
                Terlambat {Number.isFinite(telatDetik) ? telatHms : '—'}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Absen mandiri (GPS) — dipasang di tab Absen (setelah toggle GPS).
 * `statusOnly`: hanya status sidik/sesi (tanpa zona GPS), untuk tampilan ringkas.
 *
 * @param {{ lokasiList: array, loadingLokasi: boolean, statusOnly?: boolean }} props
 */
export default function AbsenMandiriGpsPanel({ lokasiList, loadingLokasi, statusOnly = false }) {
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
  const [hasilAbsen, setHasilAbsen] = useState(null)
  const [riwayatMasuk, setRiwayatMasuk] = useState([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)

  const idPengurus = user?.id_pengurus != null ? Number(user.id_pengurus) : null

  const loadGate = useCallback(async () => {
    if (idPengurus == null || idPengurus <= 0) return
    setGateLoading(true)
    try {
      const res = await absenPengurusAPI.getMandiriSlot()
      if (res?.success && res.data) {
        setGate(res.data)
      } else {
        setGate({
          boleh_masuk: true,
          boleh_keluar: true,
          masuk_terbuka: null,
          slot_label: '',
          mandiri_gps_tidak_tersedia: false
        })
      }
    } catch {
      setGate({
        boleh_masuk: true,
        boleh_keluar: true,
        masuk_terbuka: null,
        slot_label: '',
        mandiri_gps_tidak_tersedia: false
      })
    } finally {
      setGateReady(true)
      setGateLoading(false)
    }
  }, [idPengurus])

  const loadRiwayatMasuk = useCallback(async () => {
    if (idPengurus == null || idPengurus <= 0) return
    setRiwayatLoading(true)
    try {
      const res = await absenPengurusAPI.getMandiriRiwayatMasuk({ limit: 1 })
      if (res?.success && Array.isArray(res.data)) {
        setRiwayatMasuk(res.data)
      } else {
        setRiwayatMasuk([])
      }
    } catch {
      setRiwayatMasuk([])
    } finally {
      setRiwayatLoading(false)
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

  /** Riwayat masuk sesi berjalan (sidik jari atau GPS) — selalu dimuat agar terlihat walau di luar zona / GPS mati */
  useEffect(() => {
    if (!gateReady) return
    void loadRiwayatMasuk()
  }, [gateReady, loadRiwayatMasuk])

  /** Segarkan gate & riwayat saat berganti jam/sesi tanpa reload halaman */
  useEffect(() => {
    const id = window.setInterval(() => {
      void loadGate()
      void loadRiwayatMasuk()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [loadGate, loadRiwayatMasuk])

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
      if (gate?.mandiri_gps_tidak_tersedia) {
        showNotification(
          'Absen masuk sesi ini sudah lewat sidik jari. Absen lewat aplikasi tidak dipakai — gunakan mesin sidik jari untuk absen keluar.',
          'error'
        )
        return
      }
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
      setHasilAbsen(null)
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
          if (res.data && typeof res.data === 'object') {
            setHasilAbsen(res.data)
          }
          await loadGate()
          await loadRiwayatMasuk()
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
    [bukaTabRiwayat, coords, dalamRadius, gate?.mandiri_gps_tidak_tersedia, loadGate, loadRiwayatMasuk, selectedLokasiId, showNotification]
  )

  if (!isSuper && !absenFitur.tabAbsen && !statusOnly) {
    return null
  }

  if (idPengurus == null || idPengurus <= 0) {
    return null
  }

  if (statusOnly) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Absen hari ini</h3>
        {gateLoading && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Memuat…</p>
        )}
        {gateReady && !riwayatLoading && riwayatMasuk[0] != null && (
          <div className="mt-3">
            <MandiriRiwayatSatuTitik row={riwayatMasuk[0]} />
          </div>
        )}
        {gateReady && riwayatMasuk[0] == null && !riwayatLoading && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Anda belum absen hari ini.</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Absen mandiri (GPS)</h3>

      {loadingLokasi ? (
        <p className="text-sm text-gray-500 mt-4">Memuat lokasi…</p>
      ) : lokasiList.length === 0 ? (
        <p className="text-sm text-gray-500 mt-4">
          Belum ada titik lokasi absen aktif. Minta admin menambah titik (pengguna dengan akses daftar lokasi) agar zona
          absen mandiri tersedia.
        </p>
      ) : (
        <>
          {gateLoading && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Memuat status absen hari ini…</p>
          )}
          {gateReady && !riwayatLoading && riwayatMasuk[0] != null && (
            <div className="mt-3">
              <MandiriRiwayatSatuTitik row={riwayatMasuk[0]} />
            </div>
          )}
          {gateReady && gate?.mandiri_gps_tidak_tersedia && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40 px-3 py-2.5">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Absen aplikasi (GPS) tidak tersedia untuk sesi ini
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                Absen masuk sudah tercatat lewat <span className="font-medium">sidik jari</span>. Agar tidak ganda,
                absen lewat GPS dinonaktifkan. Untuk absen keluar, gunakan mesin sidik jari — selaras tampilan tab
                Riwayat.
              </p>
            </div>
          )}
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
                {gateReady && gate?.boleh_masuk && !gate?.mandiri_gps_tidak_tersedia && (
                  <button
                    type="button"
                    disabled={busy || coordsRefreshing || dalamRadius.length === 0 || gateLoading}
                    onClick={() => submit('Masuk')}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Absen masuk
                  </button>
                )}
                {gateReady && gate?.boleh_keluar && !gate?.mandiri_gps_tidak_tersedia && (
                  <button
                    type="button"
                    disabled={busy || coordsRefreshing || dalamRadius.length === 0 || gateLoading}
                    onClick={() => submit('Keluar')}
                    title={
                      gate?.masuk_terbuka?.sesi_label
                        ? `Menutup absen masuk sesi ${sesiLabelTampilan(gate.masuk_terbuka.sesi_label)}`
                        : 'Absen keluar'
                    }
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(() => {
                      const mt = gate?.masuk_terbuka
                      if (!mt?.sesi_label || !gate?.slot_label) return 'Absen keluar'
                      const a = sesiLabelTampilan(mt.sesi_label)
                      const b = sesiLabelTampilan(gate.slot_label)
                      return a !== b ? `Absen keluar · ${a}` : 'Absen keluar'
                    })()}
                  </button>
                )}
              </div>
              {hasilAbsen && hasilAbsen.jam_catat && (
                <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-2.5 text-sm text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-50">
                  <p className="font-semibold">Hasil absensi</p>
                  <p className="mt-1.5 font-mono tabular-nums">
                    Jam absen: <span className="font-semibold">{String(hasilAbsen.jam_catat)}</span>
                  </p>
                  {hasilAbsen.sesi_label != null && hasilAbsen.jam_mulai_sesi != null && (
                    <p className="mt-1 text-teal-900/95 dark:text-teal-100/95">
                      Sesi {String(hasilAbsen.sesi_label)} — jam mulai:{' '}
                      <span className="font-mono tabular-nums font-medium">{String(hasilAbsen.jam_mulai_sesi)}</span>
                      {hasilAbsen.jam_batas_telat != null &&
                        String(hasilAbsen.jam_batas_telat) !== String(hasilAbsen.jam_mulai_sesi) && (
                          <>
                            <span className="mx-1">·</span>
                            <span className="text-teal-800/90 dark:text-teal-200/90">dianggap telat setelah</span>{' '}
                            <span className="font-mono tabular-nums font-medium">
                              {String(hasilAbsen.jam_batas_telat)}
                            </span>
                          </>
                        )}
                    </p>
                  )}
                  {hasilAbsen.telat_label != null && (
                    <p className="mt-1">
                      <span className="tabular-nums">{String(hasilAbsen.telat_label)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
