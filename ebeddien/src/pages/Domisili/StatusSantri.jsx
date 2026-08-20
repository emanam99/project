import { useMemo } from 'react'
import { SANTRI_STATUS_OPTIONS } from '../../constants/santriStatus'

/**
 * Daftar status santri tetap (enum di kode) — tanpa CRUD / tanpa tabel master.
 */
function StatusSantri() {
  const rows = useMemo(
    () =>
      SANTRI_STATUS_OPTIONS.map((status_santri) => ({
        status_santri,
        keterangan:
          status_santri === 'Mukim'
            ? 'Santri mukim di pesantren'
            : status_santri === 'Boyong'
              ? 'Sudah boyong'
              : status_santri === 'Khoriji'
                ? 'Santri khoriji (non-mukim)'
                : status_santri === 'Guru Tugas'
                  ? 'Guru tugas'
                  : status_santri === 'Pengurus'
                    ? 'Pengurus'
                    : 'Alumni',
      })),
    []
  )

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Status Santri</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Enam status tetap di aplikasi. Tidak perlu menambah baris baru — validasi di kode, tanpa tabel master.
        </p>
      </div>

      <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {rows.map((row) => (
          <li key={row.status_santri} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span className="font-medium text-gray-900 dark:text-gray-100">{row.status_santri}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{row.keterangan}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Banin/Banat diambil dari gender atau kategori daerah (domisili), bukan dari status. Harga dasar UWABA mengikuti status; jenjang mengikuti formal.
      </p>
    </div>
  )
}

export default StatusSantri
