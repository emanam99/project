/**
 * Daftar centang penerima WA rencana/pengeluaran: terpisah per aksi fitur (semua lembaga vs lembaga sesuai role).
 * @param {object} props
 * @param {boolean} props.loading
 * @param {{ notif_semua_lembaga?: Array<{id:number,nama?:string,whatsapp?:string}>, notif_lembaga_sesuai_role?: Array<{id:number,nama?:string,whatsapp?:string}> }|null|undefined} props.recipientGroups — dari API recipient_groups; null/undefined = tampilkan flat fallback
 * @param {Array<{id:number,nama?:string,whatsapp?:string}>} props.listAdminsFallback
 * @param {number[]} props.selectedAdmins
 * @param {(id:number)=>void} props.onToggle
 * @param {boolean} props.canManage
 * @param {boolean} [props.draftContext]
 * @param {'teal'|'primary'} [props.accent] — warna checkbox / sorot terpilih
 */
export default function WaNotifRecipientChecklist({
  loading,
  recipientGroups,
  listAdminsFallback = [],
  selectedAdmins,
  onToggle,
  canManage,
  draftContext = false,
  accent = 'teal'
}) {
  const semua = recipientGroups?.notif_semua_lembaga
  const lembaga = recipientGroups?.notif_lembaga_sesuai_role
  const hasGroupedPayload =
    recipientGroups != null &&
    Array.isArray(semua) &&
    Array.isArray(lembaga)

  const chkTeal = 'w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 dark:bg-gray-700 disabled:opacity-50'
  const chkPrimary =
    'w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50'

  const renderRow = (admin) => {
    const sel = selectedAdmins.includes(admin.id)
    const baseRow =
      accent === 'primary' && sel
        ? 'flex items-center gap-3 rounded-lg p-3 border transition-colors bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
        : 'flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
    return (
      <div key={admin.id} className={baseRow}>
        {canManage ? (
          <input
            type="checkbox"
            checked={sel}
            onChange={() => onToggle(admin.id)}
            disabled={!admin.whatsapp}
            className={accent === 'primary' ? chkPrimary : chkTeal}
          />
        ) : null}
        <div className="flex-1">
          <p
            className={`text-sm font-medium ${
              accent === 'primary' && sel
                ? 'text-primary-800 dark:text-primary-200'
                : 'text-gray-800 dark:text-gray-200'
            }`}
          >
            {admin.nama || 'Unknown'}
          </p>
          <p
            className={`text-xs ${
              admin.whatsapp ? 'text-gray-500 dark:text-gray-400' : 'text-red-500 dark:text-red-400'
            }`}
          >
            {admin.whatsapp || 'Tidak ada WhatsApp'}
          </p>
        </div>
      </div>
    )
  }

  const renderSubsection = (title, subtitle, admins) => {
    if (!admins?.length) return null
    return (
      <div className="mb-4 last:mb-0">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{title}</p>
        {subtitle ? <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{subtitle}</p> : null}
        <div className="space-y-2">{admins.map(renderRow)}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div
          className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
            accent === 'primary' ? 'border-primary-600' : 'border-teal-600'
          }`}
        />
      </div>
    )
  }

  if (hasGroupedPayload && !draftContext) {
    const emptyBoth = semua.length === 0 && lembaga.length === 0
    if (emptyBoth) {
      return (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada admin tersedia</p>
        </div>
      )
    }
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {renderSubsection(
            'Notif WA — semua lembaga',
            'Role memiliki aksi «Notif WA semua lembaga».',
            semua
          )}
          {renderSubsection(
            'Notif WA — lembaga sesuai role',
            'Role memiliki aksi «Notif WA lembaga sesuai role» dan penugasan ke lembaga yang sama dengan rencana/pengeluaran ini.',
            lembaga
          )}
        </div>
      </div>
    )
  }

  if (hasGroupedPayload && draftContext) {
    if (!lembaga?.length) {
      return (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada admin tersedia</p>
        </div>
      )
    }
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <div className="max-h-72 overflow-y-auto">
          {renderSubsection(
            'Notif WA draft — lembaga sesuai role',
            'Hanya untuk rencana berstatus draft; mengikuti lembaga yang dipilih.',
            lembaga
          )}
        </div>
      </div>
    )
  }

  const flat = listAdminsFallback
  if (!flat.length) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada admin tersedia</p>
      </div>
    )
  }
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
      <div className="space-y-2 max-h-64 overflow-y-auto">{flat.map(renderRow)}</div>
    </div>
  )
}
