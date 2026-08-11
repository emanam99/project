import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'

/**
 * Tab Ngabsen — placeholder; konten lanjutan akan ditambahkan kemudian.
 * Absen mandiri (GPS) ada di tab Absen.
 */
export default function AbsenNgabsenTab() {
  const absenFitur = useAbsenFiturAccess()

  if (!absenFitur.tabNgabsen) {
    return null
  }

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Ngabsen</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
        Bagian ini sedang disiapkan. Untuk absen mandiri memakai GPS, gunakan tab <span className="font-medium text-gray-700 dark:text-gray-300">Absen</span> (toggle lokasi dan tombol absen masuk/keluar).
      </p>
    </div>
  )
}
