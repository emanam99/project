export default function GrupAksesPlaceholder({ groupLabel, keterangan }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100/80 dark:border-primary-900/40 bg-linear-to-r from-primary-50/90 to-white dark:from-primary-950/40 dark:to-gray-800/90">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">{groupLabel}</p>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mt-0.5">Dalam pengembangan</h1>
        </div>
        <div className="p-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {keterangan || 'Modul ini akan diisi bertahap pada rilis berikutnya.'}
        </div>
      </div>
    </div>
  )
}
