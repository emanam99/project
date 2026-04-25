import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { absenLokasiAPI } from '../../../services/api'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import AbsenGpsToggleBar from './AbsenGpsToggleBar'
import AbsenMandiriGpsPanel from './AbsenMandiriGpsPanel'

/**
 * Tab Absen — absen mandiri (GPS) bila punya tab «Absen»; titik & jadwal di tab Pengaturan.
 */
export default function AbsenAbsenLokasiTab() {
  const user = useAuthStore((s) => s.user)
  const absenFitur = useAbsenFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const isSuper = userHasSuperAdminAccess(user)

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

  if (!absenFitur.tabAbsen) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Absen</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Aktifkan lokasi, lalu absen di dalam zona titik. Pengaturan titik dan jadwal default ada di tab Pengaturan.
      </p>
      <AbsenGpsToggleBar lokasiList={rows} />
      <AbsenMandiriGpsPanel lokasiList={rows} loadingLokasi={loading} />
    </div>
  )
}
