import { create } from 'zustand'

/**
 * Mode tampilan halaman Biodata: baca (label + nilai) atau ubah (form).
 * `biodataEditIntent`: user menekan Ubah — jangan paksa mode baca lagi saat biodataReady reload (tahun ajaran, dll.).
 * Dibersihkan saat simpan → baca, atau saat keluar dari rute biodata (Layout).
 */
export const useBiodataViewStore = create((set) => ({
  biodataViewMode: 'edit',
  biodataEditIntent: false,
  setBiodataViewMode: (mode) => set({ biodataViewMode: mode === 'read' ? 'read' : 'edit' }),
  enterBiodataReadMode: () => set({ biodataViewMode: 'read', biodataEditIntent: false }),
  enterBiodataEditMode: () => set({ biodataViewMode: 'edit', biodataEditIntent: true }),
  clearBiodataEditIntent: () => set({ biodataEditIntent: false }),
}))
