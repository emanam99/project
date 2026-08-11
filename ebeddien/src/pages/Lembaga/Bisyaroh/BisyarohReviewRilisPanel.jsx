function labelStatus(st) {
  if (st === 'rilis') return 'Rilis'
  if (st === 'ditinjau') return 'Ditinjau'
  return 'Pengajuan'
}

/**
 * Status & tombol rilis per set di tab Review (Preview).
 */
export default function BisyarohReviewRilisPanel({
  setsForRekap = [],
  rekapSetIds = [],
  rekapLembagaId = '',
  rekapStatusMap = {},
  rekapStatusReady = false,
  loadingRekapStatus = false,
  savingRekapStatusKey = '',
  canRilis = false,
  onSubmitStatus
}) {
  if (!rekapStatusReady || !rekapLembagaId || rekapSetIds.length === 0) {
    return null
  }

  const busy = (bid, op) => savingRekapStatusKey === `${bid}:${rekapLembagaId}:${op}`

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-3 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">Status & rilis</span>
        {loadingRekapStatus ? <span className="text-[10px] text-gray-500">Memuat status…</span> : null}
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
        Setelah dicek, tandai <strong>ditinjau</strong> lalu <strong>rilis</strong> agar muncul di tab Histori. Rekap yang
        sudah dirilis tetap bisa dilihat di Preview.
        {canRilis ? '' : ' Anda tidak memiliki aksi merilis rekap.'}
      </p>
      <div className="space-y-2">
        {rekapSetIds.map((bid) => {
          const setMeta = setsForRekap.find((s) => s.id === bid)
          const setLabel = setMeta?.nama || `Set #${bid}`
          const st = rekapStatusMap[`${bid}:${rekapLembagaId}`] || 'pengajuan'
          const badge =
            st === 'rilis'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : st === 'ditinjau'
                ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
          return (
            <div
              key={bid}
              className="flex flex-wrap items-center gap-2 text-[11px] rounded-md border border-gray-100 dark:border-gray-700/80 p-2 bg-gray-50/80 dark:bg-gray-900/30"
            >
              <span className="text-gray-700 dark:text-gray-300 min-w-[80px] font-medium">{setLabel}</span>
              <span className={`px-2 py-0.5 rounded font-medium ${badge}`}>{labelStatus(st)}</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {st === 'pengajuan' ? (
                  <button
                    type="button"
                    disabled={!!savingRekapStatusKey || loadingRekapStatus}
                    onClick={() => onSubmitStatus(bid, rekapLembagaId, 'ditinjau')}
                    className="px-2 py-0.5 rounded border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50"
                  >
                    {busy(bid, 'ditinjau') ? '…' : 'Tandai ditinjau'}
                  </button>
                ) : null}
                {st === 'ditinjau' && canRilis ? (
                  <button
                    type="button"
                    disabled={!!savingRekapStatusKey || loadingRekapStatus}
                    onClick={() => {
                      if (!window.confirm('Rilis rekap untuk lembaga ini? Data tidak bisa diubah setelah rilis.')) return
                      onSubmitStatus(bid, rekapLembagaId, 'rilis')
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                  >
                    {busy(bid, 'rilis') ? '…' : 'Rilis'}
                  </button>
                ) : null}
                {st === 'ditinjau' && !canRilis ? (
                  <button
                    type="button"
                    disabled={!!savingRekapStatusKey || loadingRekapStatus}
                    onClick={() => onSubmitStatus(bid, rekapLembagaId, 'pengajuan')}
                    className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {busy(bid, 'pengajuan') ? '…' : 'Kembalikan ke pengajuan'}
                  </button>
                ) : null}
                {st === 'rilis' ? (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">Sudah dirilis</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
