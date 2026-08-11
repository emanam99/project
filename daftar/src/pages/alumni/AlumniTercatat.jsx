import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { alumniAPI, clearAlumniSession } from '../../services/alumniApi'
import { useAlumniAuthStore } from '../../store/alumniAuthStore'
import AlumniCountBadge from '../../components/alumni/AlumniCountBadge'
import { alumniPath } from '../../config/alumniApp'

function Row({ label, value }) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-2 border-b border-gray-100 dark:border-gray-700/80 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 sm:w-32 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 font-medium">{value}</dd>
    </div>
  )
}

function SkeletonPulse({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-700/60 ${className}`}
      aria-hidden
    />
  )
}

/** Skeleton 3 kolom (PC) / stack (HP) — sama struktur page */
function AlumniTercatatSkeleton() {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 lg:items-start"
      aria-busy="true"
      aria-label="Memuat data alumni"
    >
      <div className="lg:col-span-3 flex flex-col items-center lg:items-start text-center lg:text-left space-y-3">
        <SkeletonPulse className="w-14 h-14 rounded-full" />
        <SkeletonPulse className="h-7 w-48" />
        <SkeletonPulse className="h-4 w-56" />
        <div className="inline-flex flex-col items-center rounded-2xl bg-gradient-to-br from-teal-600/80 to-teal-700/80 px-6 py-4 w-full max-w-xs">
          <SkeletonPulse className="h-3 w-20 bg-white/30" />
          <SkeletonPulse className="h-8 w-28 mt-2 bg-white/40" />
        </div>
      </div>

      <div className="lg:col-span-6 bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 space-y-2">
          <SkeletonPulse className="h-5 w-48" />
          <SkeletonPulse className="h-3 w-36" />
        </div>
        <div className="px-5 py-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-gray-100 dark:border-gray-700/80 last:border-0">
              <SkeletonPulse className="h-3 w-24" />
              <SkeletonPulse className="h-4 flex-1 max-w-xs" />
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 flex flex-col items-center lg:items-stretch gap-4">
        <AlumniCountBadge size="lg" label="Total alumni tercatat" align="center" className="lg:items-end lg:text-right" />
        <SkeletonPulse className="h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

function statusLabel(status) {
  return status === 'wafat' ? 'Wafat' : 'Hidup'
}

function useStaggerReveal(length, { startDelay = 120, step = 160, enabled = true } = {}) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
  }, [length, enabled])

  useEffect(() => {
    if (!enabled || length === 0) return undefined
    if (visibleCount >= length) return undefined
    const t = setTimeout(() => {
      setVisibleCount((n) => Math.min(length, n + 1))
    }, visibleCount === 0 ? startDelay : step)
    return () => clearTimeout(t)
  }, [length, visibleCount, startDelay, step, enabled])

  return visibleCount
}

function TopWilayahList() {
  const [items, setItems] = useState([])
  const [kabItems, setKabItems] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await alumniAPI.topWilayah()
        if (!cancelled && res.success) {
          setItems(res.data?.items || [])
          setKabItems(res.data?.kabupaten || [])
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleKec = useStaggerReveal(items.length, { startDelay: 120, step: 160 })
  const kecDone = items.length === 0 || visibleKec >= items.length
  const visibleKab = useStaggerReveal(kabItems.length, {
    startDelay: 220,
    step: 160,
    enabled: kecDone && kabItems.length > 0,
  })

  if (items.length === 0 && kabItems.length === 0) return null

  const shownKec = items.slice(0, visibleKec)
  const shownKab = kabItems.slice(0, visibleKab)

  return (
    <div className="w-full space-y-5">
      {items.length > 0 && (
        <div className="space-y-2">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center lg:text-right"
          >
            5 Kabupaten–Kecamatan terbanyak
          </motion.p>
          <ol className="space-y-1.5 min-h-[7.5rem]">
            <AnimatePresence initial={false}>
              {shownKec.map((it, idx) => (
                <motion.li
                  key={`${it.kabupaten}-${it.kecamatan}`}
                  initial={{ opacity: 0, y: 12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center justify-between gap-2 text-sm overflow-hidden"
                >
                  <span className="text-gray-700 dark:text-gray-200 min-w-0 truncate">
                    <span className="text-teal-600 dark:text-teal-400 font-semibold mr-1.5">{idx + 1}.</span>
                    {it.kabupaten} – {it.kecamatan}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                    {it.total}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      )}

      {kabItems.length > 0 && (
        <div className="space-y-2">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={kecDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center lg:text-right"
          >
            3 Kabupaten terbanyak
          </motion.p>
          <ol className="space-y-1.5 min-h-[4.5rem]">
            <AnimatePresence initial={false}>
              {shownKab.map((it, idx) => (
                <motion.li
                  key={it.kabupaten}
                  initial={{ opacity: 0, y: 12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center justify-between gap-2 text-sm overflow-hidden"
                >
                  <span className="text-gray-700 dark:text-gray-200 min-w-0 truncate">
                    <span className="text-teal-600 dark:text-teal-400 font-semibold mr-1.5">{idx + 1}.</span>
                    {it.kabupaten}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                    {it.total}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      )}
    </div>
  )
}

function AlumniTercatat() {
  const navigate = useNavigate()
  const location = useLocation()
  const { clearAuth, setAuth, user } = useAlumniAuthStore()
  const mode = location.state?.mode === 'preview' ? 'preview' : 'summary'
  const seededAlumni = location.state?.alumni || null
  const [alumni, setAlumni] = useState(seededAlumni)
  const [viewMode, setViewMode] = useState(mode)
  const [loading, setLoading] = useState(!seededAlumni)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Preview setelah simpan baru: tampilkan input client, jangan timpa dengan me()
      if (mode === 'preview' && seededAlumni) {
        setAlumni(seededAlumni)
        setViewMode('preview')
        setLoading(false)
        return
      }
      if (!seededAlumni) setLoading(true)
      setError('')
      try {
        const res = await alumniAPI.me()
        if (cancelled) return

        if (res.success && res.data && !res.data.registered) {
          if (seededAlumni) {
            setAlumni(seededAlumni)
            setViewMode(mode)
            return
          }
          const token = localStorage.getItem('alumni_auth_token')
          if (token) {
            setAuth(token, {
              nik: res.data.nik || user?.nik || '',
              gender: user?.gender || null,
              tanggal_lahir: user?.tanggal_lahir || null,
              tempat_lahir: user?.tempat_lahir || null,
              registered: false,
              role_key: 'alumni',
            })
          }
          navigate(alumniPath('biodata'), { replace: true })
          return
        }

        if (res.success && res.data?.alumni) {
          // Sudah terdaftar: hanya id + nama dari server
          setAlumni(res.data.alumni)
          setViewMode('summary')
          const token = localStorage.getItem('alumni_auth_token')
          if (token) {
            const a = res.data.alumni
            setAuth(token, {
              id: a.id,
              alumni_id: a.id,
              id_alumni: a.id_alumni,
              nama: a.nama,
              nik: res.data.nik || user?.nik || '',
              registered: true,
              role_key: 'alumni',
            })
          }
          return
        }

        if (seededAlumni) {
          setAlumni(seededAlumni)
          setViewMode(mode)
          return
        }

        navigate(alumniPath('biodata'), { replace: true })
      } catch (err) {
        if (cancelled) return
        const status = err?.response?.status
        if (seededAlumni) {
          setAlumni(seededAlumni)
          setViewMode(mode)
          return
        }
        if (status === 401 || status === 403) {
          clearAuth()
          clearAlumniSession()
          navigate(alumniPath(), { replace: true })
          return
        }
        if (localStorage.getItem('alumni_auth_token')) {
          navigate(alumniPath('biodata'), { replace: true })
          return
        }
        setError(err?.response?.data?.message || 'Gagal memuat data alumni')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDaftarLain = () => {
    clearAuth()
    clearAlumniSession()
    navigate(alumniPath(), { replace: true })
  }

  if (loading) {
    return <AlumniTercatatSkeleton />
  }

  if (error || !alumni) {
    return (
      <div className="text-center space-y-4 py-12">
        <p className="text-sm text-red-600 dark:text-red-400">{error || 'Data tidak ditemukan'}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => navigate(alumniPath('biodata'), { replace: true })}
            className="px-5 py-2.5 rounded-xl border border-teal-600 text-teal-700 dark:text-teal-300 text-sm font-medium"
          >
            Lanjut isi biodata
          </button>
          <button
            type="button"
            onClick={handleDaftarLain}
            className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium"
          >
            Kembali ke NIK
          </button>
        </div>
      </div>
    )
  }

  const isPreview = viewMode === 'preview'
  const alamatParts = [
    alumni.dusun && `Dusun ${alumni.dusun}`,
    alumni.rt && `RT ${alumni.rt}`,
    alumni.rw && `RW ${alumni.rw}`,
    alumni.desa,
    alumni.kecamatan && `Kec. ${alumni.kecamatan}`,
    alumni.kabupaten,
    alumni.provinsi,
    alumni.kode_pos,
  ].filter(Boolean)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 lg:items-start">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="lg:col-span-3 flex flex-col items-center lg:items-start text-center lg:text-left space-y-3"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
          Alumni sudah tercatat
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isPreview
            ? 'Pratinjau dari data yang baru Anda kirim.'
            : 'NIK sudah terdaftar. Hanya ID dan nama yang ditampilkan.'}
        </p>
        <div className="inline-flex flex-col items-center lg:items-start rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-white px-6 py-4 shadow-lg shadow-teal-600/20 w-full max-w-xs">
          <span className="text-xs font-medium uppercase tracking-wider opacity-90">ID Alumni</span>
          <span className="text-3xl font-bold font-mono tracking-widest mt-1">{alumni.id_alumni}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="lg:col-span-6 bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm"
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-teal-50/80 to-transparent dark:from-teal-900/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{alumni.nama}</h2>
              {isPreview && alumni.nik ? (
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">NIK {alumni.nik}</p>
              ) : null}
            </div>
            {isPreview ? (
              <span
                className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  alumni.status === 'wafat'
                    ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                    : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                }`}
              >
                {statusLabel(alumni.status)}
              </span>
            ) : null}
          </div>
        </div>
        {isPreview ? (
          <dl className="px-5 py-2">
            <Row label="Status" value={statusLabel(alumni.status)} />
            <Row label="Gender" value={alumni.gender} />
            <Row label="Nomor HP" value={alumni.nomor_hp} />
            <Row
              label="Tempat, Tgl lahir"
              value={
                [alumni.tempat_lahir, formatDate(alumni.tanggal_lahir)].filter(Boolean).join(', ') || null
              }
            />
            <Row label="Alamat" value={alamatParts.length ? alamatParts.join(', ') : null} />
            <Row label="Ayah" value={alumni.ayah} />
            <Row label="Ibu" value={alumni.ibu} />
            <Row
              label="Tahun masuk"
              value={
                alumni.tahun_masuk_masehi
                  ? `${alumni.tahun_masuk_masehi} M${
                      alumni.tahun_masuk_hijriyah ? ` / ${alumni.tahun_masuk_hijriyah} H` : ''
                    }`
                  : null
              }
            />
            <Row
              label="Tahun boyong"
              value={
                alumni.tahun_boyong_masehi
                  ? `${alumni.tahun_boyong_masehi} M${
                      alumni.tahun_boyong_hijriyah ? ` / ${alumni.tahun_boyong_hijriyah} H` : ''
                    }`
                  : alumni.tahun_boyong_hijriyah
                    ? `${alumni.tahun_boyong_hijriyah} H`
                    : null
              }
            />
          </dl>
        ) : (
          <div className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
            Data lain tidak ditampilkan demi privasi. Untuk mengubah data, hubungi pengurus pesantren.
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="lg:col-span-3 flex flex-col items-center lg:items-stretch gap-5 lg:pt-2"
      >
        <AlumniCountBadge
          size="lg"
          label="Total alumni tercatat"
          align="center"
          className="lg:!items-end lg:!text-right w-full"
        />
        <TopWilayahList />
        <button
          type="button"
          onClick={handleDaftarLain}
          className="w-full px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-sm"
        >
          Daftarkan alumni lain
        </button>
      </motion.div>
    </div>
  )
}

export default AlumniTercatat
