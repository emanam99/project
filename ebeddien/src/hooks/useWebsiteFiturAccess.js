import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { WEBSITE_ACTION_CODES, WEBSITE_MENU_CODES } from '../config/websiteFiturCodes'

/**
 * Cek akses menu/aksi modul Website berdasarkan fiturMenuCodes (dari /me/fitur-menu).
 * Super admin selalu punya akses.
 * Jika user belum punya kode `menu.website.*` sama sekali → fallback ke role legacy
 * (admin_web/petugas_web/conten_web) untuk pengalaman pertama login.
 */
export function useWebsiteFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const has = (code) => codes.includes(code)
    const hasAnyMenu = codes.some((c) => String(c).startsWith('menu.website.'))

    const userRoles = String((user?.role_keys || user?.roles || user?.role || ''))
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const legacyAdminWeb = userRoles.includes('admin_web')
    const legacyPetugasWeb = userRoles.includes('petugas_web')
    const legacyContenWeb = userRoles.includes('conten_web')

    // Cadangan saat user belum punya assignment kode (mirror seed migrasi).
    const legacyMenu = (code) => {
      if (legacyAdminWeb) return true
      if (legacyPetugasWeb) return code !== WEBSITE_MENU_CODES.seo
      if (legacyContenWeb) {
        return [
          WEBSITE_MENU_CODES.dashboard,
          WEBSITE_MENU_CODES.berita,
          WEBSITE_MENU_CODES.beritaKategori,
          WEBSITE_MENU_CODES.halaman,
          WEBSITE_MENU_CODES.galeri,
          WEBSITE_MENU_CODES.galeriKategori
        ].includes(code)
      }
      return false
    }
    const legacyAction = (code) => {
      if (legacyAdminWeb) return true
      if (legacyPetugasWeb) return !String(code).startsWith('action.website.seo.')
      return false
    }

    const canMenu = (code) => {
      if (isSuper) return true
      if (hasAnyMenu) return has(code)
      return legacyMenu(code)
    }
    const canAction = (code) => {
      if (isSuper) return true
      if (hasAnyMenu) return has(code)
      return legacyAction(code)
    }

    const dashboard = canMenu(WEBSITE_MENU_CODES.dashboard)
    const berita = canMenu(WEBSITE_MENU_CODES.berita)
    const beritaKategori = canMenu(WEBSITE_MENU_CODES.beritaKategori)
    const banner = canMenu(WEBSITE_MENU_CODES.banner)
    const halaman = canMenu(WEBSITE_MENU_CODES.halaman)
    const galeri = canMenu(WEBSITE_MENU_CODES.galeri)
    const galeriKategori = canMenu(WEBSITE_MENU_CODES.galeriKategori)
    const seo = canMenu(WEBSITE_MENU_CODES.seo)

    const beritaPublish = canAction(WEBSITE_ACTION_CODES.beritaPublish)
    const beritaHapus = canAction(WEBSITE_ACTION_CODES.beritaHapus)
    const bannerKelola = canAction(WEBSITE_ACTION_CODES.bannerKelola)
    const halamanPublish = canAction(WEBSITE_ACTION_CODES.halamanPublish)
    const galeriKelola = canAction(WEBSITE_ACTION_CODES.galeriKelola)
    const seoUbah = canAction(WEBSITE_ACTION_CODES.seoUbah)

    const anyMenu =
      dashboard || berita || beritaKategori || banner || halaman || galeri || galeriKategori || seo

    return {
      isSuper,
      anyMenu,
      menu: {
        dashboard,
        berita,
        beritaKategori,
        banner,
        halaman,
        galeri,
        galeriKategori,
        seo
      },
      action: {
        beritaPublish,
        beritaHapus,
        bannerKelola,
        halamanPublish,
        galeriKelola,
        seoUbah
      }
    }
  }, [user, fiturMenuCodes])
}
