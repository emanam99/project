import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { absenLokasiAPI, absenSettingAPI, absenPengurusAPI } from '../../../services/api'
import { AbsenLokasiProvider, useAbsenLokasi } from '../../../contexts/AbsenLokasiContext'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import { userPassesMandiriRoleAllowlist, normalizeAksesMandiriFromApi } from '../../../utils/mandiriAkses'
import AbsenGpsToggleBar from '../../Lembaga/Absen/AbsenGpsToggleBar'
import AbsenMandiriGpsPanel from '../../Lembaga/Absen/AbsenMandiriGpsPanel'

const ABSEN_PAGE_URL = '/absen?tab=absen'

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }
  }
}

/**
 * Blok riwayat / absen mandiri di Beranda — di bawah menu.
 * Tanpa data sidik & tanpa akses GPS: tidak dirender.
 */
export default function BerandaAbsenSection() {
  const user = useAuthStore((s) => s.user)
  const absenFitur = useAbsenFiturAccess()
  const isSuper = userHasSuperAdminAccess(user)
  const idPengurus = user?.id_pengurus != null ? Number(user.id_pengurus) : null

  const eligible =
    idPengurus != null &&
    idPengurus > 0 &&
    (isSuper || absenFitur.tabAbsen || absenFitur.lokasiAbsenMandiri)

  const [shouldShow, setShouldShow] = useState(null)

  useEffect(() => {
    if (!eligible) return
    if (isSuper || absenFitur.lokasiAbsenMandiri) {
      setShouldShow(true)
      return
    }
    if (!absenFitur.tabAbsen) {
      setShouldShow(false)
      return
    }
    let cancelled = false
    absenPengurusAPI
      .getMandiriRiwayatMasuk({ limit: 1 })
      .then((res) => {
        if (cancelled) return
        const has = res?.success && Array.isArray(res.data) && res.data.length > 0
        setShouldShow(has)
      })
      .catch(() => {
        if (!cancelled) setShouldShow(false)
      })
    return () => {
      cancelled = true
    }
  }, [eligible, isSuper, absenFitur.lokasiAbsenMandiri, absenFitur.tabAbsen])

  if (!eligible || shouldShow === null || shouldShow === false) {
    return null
  }

  return (
    <AbsenLokasiProvider>
      <BerandaAbsenSectionInner />
    </AbsenLokasiProvider>
  )
}

function BerandaGpsOffHint() {
  const { gpsEnabled } = useAbsenLokasi()
  if (gpsEnabled) return null
  return (
    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
      <Link
        to={ABSEN_PAGE_URL}
        className="font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 underline underline-offset-2"
      >
        Buka halaman Absen
      </Link>{' '}
      untuk mengaktifkan akses lokasi (GPS) dan zona absen mandiri.
    </p>
  )
}

function BerandaAbsenSectionInner() {
  const user = useAuthStore((s) => s.user)
  const absenFitur = useAbsenFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [aksesMandiri, setAksesMandiri] = useState(() => ({ role_keys: [] }))
  const [roleOptionsMandiri, setRoleOptionsMandiri] = useState(null)

  const isSuper = userHasSuperAdminAccess(user)

  const mandiriRoleOk = useMemo(() => {
    if (roleOptionsMandiri === null) return true
    return userPassesMandiriRoleAllowlist(user, aksesMandiri)
  }, [user, aksesMandiri, roleOptionsMandiri])

  const needFetchLokasi = useMemo(() => {
    if (!absenFitur.lokasiAbsenMandiri) return false
    if (isSuper) return true
    if (!absenFitur.apiHasLokasiGranular) return true
    return (
      absenFitur.lokasiList ||
      absenFitur.lokasiAbsenMandiri ||
      absenFitur.lokasiTambah ||
      absenFitur.lokasiUbah ||
      absenFitur.lokasiHapus
    )
  }, [
    isSuper,
    absenFitur.apiHasLokasiGranular,
    absenFitur.lokasiList,
    absenFitur.lokasiAbsenMandiri,
    absenFitur.lokasiTambah,
    absenFitur.lokasiUbah,
    absenFitur.lokasiHapus
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await absenLokasiAPI.getList()
      if (res?.success) setRows(Array.isArray(res.data) ? res.data : [])
      else setRows([])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!needFetchLokasi) {
      setRows([])
      setLoading(false)
      return
    }
    void load()
  }, [needFetchLokasi, load])

  useEffect(() => {
    if (!absenFitur.tabAbsen && !absenFitur.lokasiAbsenMandiri) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await absenSettingAPI.get()
        if (cancelled || !res?.success || !res.data) return
        setAksesMandiri(normalizeAksesMandiriFromApi(res.data))
        const ro = res.data.role_options_mandiri
        setRoleOptionsMandiri(Array.isArray(ro) ? ro : [])
      } catch {
        setRoleOptionsMandiri([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [absenFitur.tabAbsen, absenFitur.lokasiAbsenMandiri])

  return (
    <motion.section
      variants={sectionVariants}
      initial="hidden"
      animate="visible"
      className="px-4 sm:px-0"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Riwayat absen
        </h2>
        <Link
          to={ABSEN_PAGE_URL}
          className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors shrink-0"
        >
          Halaman Absen &gt;
        </Link>
      </div>
      <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/50 overflow-hidden shadow-sm p-4 space-y-3">
        {absenFitur.lokasiAbsenMandiri ? (
          <>
            <AbsenGpsToggleBar lokasiList={rows} showToggle={false} />
            <BerandaGpsOffHint />
            <AbsenMandiriGpsPanel
              lokasiList={rows}
              loadingLokasi={loading}
              mandiriRolePolicyOk={mandiriRoleOk}
            />
          </>
        ) : (
          <AbsenMandiriGpsPanel
            statusOnly
            lokasiList={[]}
            loadingLokasi={false}
            mandiriRolePolicyOk={mandiriRoleOk}
          />
        )}
      </div>
    </motion.section>
  )
}
