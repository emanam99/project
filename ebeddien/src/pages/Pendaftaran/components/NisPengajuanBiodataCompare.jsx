function formatTgl(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Tabel perbandingan biodata santri vs pengajuan (nama, NIK, tanggal lahir).
 */
export default function NisPengajuanBiodataCompare({ biodata }) {
  if (!biodata?.santri) return null
  const rows = [
    { key: 'nama', label: 'Nama' },
    { key: 'nik', label: 'NIK' },
    { key: 'tanggal_lahir', label: 'Tanggal lahir' },
  ]

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-600">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Data biodata santri</p>
        {biodata.santri.nis ? (
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">NIS {biodata.santri.nis}</p>
        ) : null}
        {biodata.same ? (
          <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">Sudah sama dengan pengajuan</p>
        ) : biodata.has_difference ? (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Berbeda — dapat diperbarui dari pengajuan</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="px-2 py-1.5 font-medium w-24">Field</th>
              <th className="px-2 py-1.5 font-medium">Di santri (sekarang)</th>
              <th className="px-2 py-1.5 font-medium">Dari pengajuan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label }) => {
              const oldVal = biodata.santri[key]
              const newVal = biodata.pengajuan[key]
              const differs =
                key === 'tanggal_lahir'
                  ? oldVal !== newVal
                  : key === 'nik'
                    ? String(oldVal || '').replace(/\D/g, '') !== String(newVal || '').replace(/\D/g, '')
                    : String(oldVal || '').toLowerCase() !== String(newVal || '').toLowerCase()
              return (
                <tr key={key} className={differs ? 'bg-amber-50/80 dark:bg-amber-900/15' : ''}>
                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{label}</td>
                  <td className="px-2 py-1.5 text-gray-800 dark:text-gray-200 break-all">
                    {key === 'tanggal_lahir' ? formatTgl(oldVal) : oldVal || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100 font-medium break-all">
                    {key === 'tanggal_lahir' ? formatTgl(newVal) : newVal || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
