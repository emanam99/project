import { PageEnter, PageEnterBlock } from '../../components/motion/PageEnter'
import { ERaporIcon } from '../../navigation/navIcons'

export default function ERapor() {
  return (
    <PageEnter className="max-w-2xl mx-auto px-4 py-4 pb-8 min-h-full">
      <PageEnterBlock index={0}>
        <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
          <div className="px-5 py-6 border-b border-gray-100 dark:border-gray-700/50 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300 mb-3">
              <ERaporIcon className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">eRapor</h2>
            <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mt-1 uppercase tracking-wide">
              Rapor digital santri
            </p>
          </div>
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
              Rapor Santri akan tampil di sini.
            </p>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
              Rapor akan rilis setelah ujian kuartal selesai.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 ring-1 ring-amber-200/80 dark:ring-amber-700/50">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden />
              Menunggu rilis
            </div>
          </div>
        </div>
      </PageEnterBlock>
    </PageEnter>
  )
}
