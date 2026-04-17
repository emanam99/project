import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { absenLokasiAPI, absenSettingAPI } from '../../../services/api'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import { userPassesMandiriRoleAllowlist, normalizeAksesMandiriFromApi } from '../../../utils/mandiriAkses'
import AbsenGpsToggleBar from './AbsenGpsToggleBar'
import AbsenMandiriGpsPanel from './AbsenMandiriGpsPanel'

/**
 * Tab Absen — absen GPS bila ada aksi lokasi.absen; cukup tab.absen saja = cek status sidik/sesi (tanpa GPS).
 * Titik lokasi & jadwal default di tab Pengaturan.
 */
export default function AbsenAbsenLokasiTab() {
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
    if (!absenFitur.tabAbsen) return
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
  }, [absenFitur.tabAbsen])

  if (!absenFitur.tabAbsen) {
    return null
  }

  /** Tab Absen tanpa aksi GPS: hanya riwayat sidik jari sesi ini */
  if (!absenFitur.lokasiAbsenMandiri) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Absen</h2>
        <AbsenMandiriGpsPanel
          statusOnly
          lokasiList={[]}
          loadingLokasi={false}
          mandiriRolePolicyOk={mandiriRoleOk}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Absen</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Aktifkan lokasi, lalu absen di dalam zona titik. Pengaturan titik dan jadwal default ada di tab Pengaturan.
      </p>
      <AbsenGpsToggleBar lokasiList={rows} />
      <AbsenMandiriGpsPanel
        lokasiList={rows}
        loadingLokasi={loading}
        mandiriRolePolicyOk={mandiriRoleOk}
      />
    </div>
  )
}
