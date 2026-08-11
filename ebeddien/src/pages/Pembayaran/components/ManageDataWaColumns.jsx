/** Tampilan nomor utama WA / telpon santri (selaras backend). */
export function formatManageWaPrimary(row) {
  const wa = row?.no_wa_santri != null ? String(row.no_wa_santri).trim() : ''
  const tel = row?.no_telpon != null ? String(row.no_telpon).trim() : ''
  const s = wa || tel
  return s || '—'
}

export function formatManageWaWali(row) {
  const w = row?.no_telpon_wali != null ? String(row.no_telpon_wali).trim() : ''
  return w || '—'
}

/** Tombol WA hijau + badge total pesan log untuk santri ini. */
export function ManageDataWaActionCell({ row, onOpenWa }) {
  const total = Number(row?.wa_msg_total ?? 0)
  return (
    <td
      className="px-4 py-3 whitespace-nowrap text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onOpenWa(row)}
          className="inline-flex items-center justify-center rounded-md bg-[#25D366] hover:bg-[#20bd5c] text-white p-1.5 shadow-sm transition-colors"
          title="Kirim / riwayat WhatsApp"
          aria-label="WhatsApp"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </button>
        <span
          className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-[10px] font-semibold px-1 py-0 text-gray-800 dark:text-gray-100"
          title="Total pesan WA ter-log untuk nomor-nomor santri ini"
        >
          {total}
        </span>
      </div>
    </td>
  )
}

/** Header kolom kontak & statistik WA (tanpa sort). */
export function ManageDataWaTableHeaders() {
  const th =
    'px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'
  const thNum =
    'px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'
  return (
    <>
      <th className={th}>No WA</th>
      <th className={th}>No Wali</th>
      <th className={thNum} title="Jumlah pesan terkirim ke nomor utama (WA atau telpon)">
        Msg utama
      </th>
      <th className={thNum} title="Jumlah pesan terkirim ke nomor wali">
        Msg wali
      </th>
      <th className={`${thNum} w-[88px]`}>WA</th>
    </>
  )
}

export function ManageDataWaTableCells({ row, children }) {
  const utama = Number(row?.wa_msg_ke_nomor_utama ?? 0)
  const wali = Number(row?.wa_msg_ke_wali ?? 0)
  return (
    <>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 max-w-[9rem] truncate" title={formatManageWaPrimary(row)}>
        {formatManageWaPrimary(row)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 max-w-[9rem] truncate" title={formatManageWaWali(row)}>
        {formatManageWaWali(row)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-700 dark:text-gray-300">
        {utama}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-700 dark:text-gray-300">
        {wali}
      </td>
      {children}
    </>
  )
}
