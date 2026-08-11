import { ACCESS_MODE } from '../config/accessMode'
import { getBottomNavTabIndex } from './bottomNavConfig'

/** Tebak mode akses dari prefix URL bila `activeAccess` belum siap */
function inferAccessModeFromPathname(pathname) {
  if (pathname.startsWith('/pjgt/')) return ACCESS_MODE.pjgt
  if (pathname.startsWith('/santri/')) return ACCESS_MODE.santri
  if (pathname.startsWith('/toko/')) return ACCESS_MODE.toko
  if (pathname.startsWith('/wali-santri')) return ACCESS_MODE.wali
  return null
}

function resolveAccessForNav(pathname, activeAccess) {
  return activeAccess || inferAccessModeFromPathname(pathname)
}

/**
 * Indeks tab di bottom nav untuk pathname (termasuk sub-rute).
 * @returns {number} -1 jika tidak terpetakan
 */
export function getBottomNavOrderIndex(pathname, user, activeAccess, opts = {}) {
  const access = resolveAccessForNav(pathname, activeAccess)
  return getBottomNavTabIndex(pathname, user, access, opts)
}

/**
 * Arah slide selaras gestur (geser kiri = tab berikutnya).
 * Indeks naik: masuk dari kanan (1); indeks turun: masuk dari kiri (-1).
 * @param {{ isGuruTugas?: boolean }} [opts]
 * @returns {1 | -1 | 0}
 */
export function getPageTransitionDirection(prevPathname, nextPathname, user, activeAccess, opts = {}) {
  if (prevPathname === nextPathname) return 0

  const access = resolveAccessForNav(nextPathname, activeAccess)
  const prevIdx = getBottomNavOrderIndex(prevPathname, user, access, opts)
  const nextIdx = getBottomNavOrderIndex(nextPathname, user, access, opts)

  /** Hanya geser horizontal antar tab bottom nav; halaman lain (profil, dll.) pakai fade */
  if (prevIdx >= 0 && nextIdx >= 0) {
    if (prevIdx === nextIdx) return 0
    return nextIdx > prevIdx ? 1 : -1
  }

  if (prevIdx < 0 || nextIdx < 0) {
    return 0
  }

  const prevDepth = prevPathname.split('/').filter(Boolean).length
  const nextDepth = nextPathname.split('/').filter(Boolean).length
  if (nextDepth !== prevDepth) {
    return nextDepth > prevDepth ? 1 : -1
  }

  return nextPathname.localeCompare(prevPathname) >= 0 ? 1 : -1
}
