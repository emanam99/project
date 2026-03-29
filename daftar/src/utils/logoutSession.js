/**
 * Pembersihan sesi penuh saat logout: storage browser, cache web (opsional), state Zustand, event context.
 * tahunAjaranStore di-import dinamis agar tidak ada siklus api.js → logoutSession → tahunAjaranStore → api.js
 * (boleh di-import statis dari api.js dan authStore.js tanpa peringatan Vite).
 */
import { clearAllClientStorage, clearOptionalWebCaches } from './clientStorage'
import { useBiodataViewStore } from '../store/biodataViewStore'
import { resetThemeAfterStorageCleared } from '../store/themeStore'

export async function performLogoutCleanup() {
  clearAllClientStorage()
  await clearOptionalWebCaches()

  const { useTahunAjaranStore } = await import('../store/tahunAjaranStore')
  useTahunAjaranStore.setState({
    tahunHijriyah: null,
    tahunMasehi: null,
    gelombang: {},
    loading: false,
    error: null,
    lastUpdated: null,
  })

  useBiodataViewStore.setState({
    biodataViewMode: 'edit',
    biodataEditIntent: false,
  })

  resetThemeAfterStorageCleared()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('daftar:logout'))
  }
}
