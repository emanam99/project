import { useMemo } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { listAvailableAccessModes } from '../config/accessMode'

/** Halaman yang boleh dibuka bila belum ada modul portal (santri / toko / PJGT / wali). */
const PATHS_ALLOWED_WITHOUT_PORTAL = ['/lengkapi-portal', '/profil']

function pathAllowedWithoutPortal(pathname) {
  return PATHS_ALLOWED_WITHOUT_PORTAL.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Membungkus area aplikasi utama: jika user punya beberapa akses tapi belum memilih, paksa ke /pilih-akses.
 * Jika tidak ada modul portal sama sekali (mis. login akun pengurus eBeddien tanpa tautan santri/toko/PJGT), paksa ke /lengkapi-portal.
 */
export default function LayoutGate() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)

  const modes = useMemo(() => listAvailableAccessModes(user), [user])
  const keys = modes.map((m) => m.key)

  if (keys.length > 1 && activeAccess == null) {
    return <Navigate to="/pilih-akses" replace state={{ from: location.pathname }} />
  }

  if (keys.length === 0 && user && !pathAllowedWithoutPortal(location.pathname)) {
    return <Navigate to="/lengkapi-portal" replace />
  }

  return <Outlet />
}
