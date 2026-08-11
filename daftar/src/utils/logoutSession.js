/**
 * Pembersihan sesi penuh saat logout: storage browser, cache web (opsional), state Zustand, event context.
 * pengaturanAPI hanya dipakai async di tahunAjaranStore, sehingga siklus api → logoutSession → store → api aman di runtime.
 */
import { clearAllClientStorage, clearOptionalWebCaches } from './clientStorage'
import { useBiodataViewStore } from '../store/biodataViewStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { resetThemeAfterStorageCleared } from '../store/themeStore'

export async function performLogoutCleanup() {
  clearAllClientStorage()
  await clearOptionalWebCaches()

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
