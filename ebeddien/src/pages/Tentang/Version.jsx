import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import api from '../../services/api'
import TentangPageLayout from './TentangPageLayout'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const listItemMotion = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-32px 0px -8% 0px' },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
}

export default function Version() {
  const [changelog, setChangelog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get('/version/changelog', { params: { app: 'ebeddien' } })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setChangelog(res.data.data)
        }
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false))
  }, [])

  const byVersion = changelog.reduce((acc, row) => {
    const v = row.version || '0.0.0'
    if (!acc[v]) acc[v] = []
    acc[v].push(row)
    return acc
  }, {})
  const allVersions = Object.keys(byVersion).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

  const INITIAL_COUNT = 5
  const LOAD_MORE_STEP = 5
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const versions = allVersions.slice(0, visibleCount)
  const hasMore = visibleCount < allVersions.length
  const loadMore = () => setVisibleCount((c) => Math.min(c + LOAD_MORE_STEP, allVersions.length))

  return (
    <TentangPageLayout title="Catatan versi" description="Fitur baru, perbaikan, dan catatan rilis eBeddien dari server.">
      <div className="p-6 sm:p-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-10 h-10 border-2 border-primary-500 dark:border-primary-400 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Memuat changelog...</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-700/60 p-6 text-center">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Gagal memuat data</p>
            <p className="mt-1 text-xs text-red-700/90 dark:text-red-300/90">{error}</p>
          </div>
        )}

        {!loading && !error && versions.length === 0 && (
          <div className="rounded-xl bg-gray-100 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-600 p-10 text-center">
            <p className="text-gray-600 dark:text-gray-300 text-sm">Belum ada catatan versi.</p>
          </div>
        )}

        {!loading && versions.length > 0 && (
          <div className="relative pl-1 sm:pl-0">
            <div
              className="absolute left-[22px] sm:left-6 top-3 bottom-3 w-px sm:w-0.5 bg-gradient-to-b from-primary-400 via-primary-300/70 to-primary-200/30 dark:from-primary-400 dark:via-primary-500/60 dark:to-primary-600/20 rounded-full"
              aria-hidden
            />

            <div className="space-y-6 sm:space-y-8">
              {versions.map((ver, idx) => (
                <motion.article
                  key={ver}
                  {...listItemMotion}
                  transition={{ ...listItemMotion.transition, delay: Math.min(idx * 0.05, 0.35) }}
                  className="relative flex gap-4 sm:gap-5"
                >
                  <div className="relative z-10 flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-slate-800 shadow-md border-2 border-primary-200/90 dark:border-primary-500/50 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                    <span className="text-[10px] sm:text-xs font-bold text-primary-700 dark:text-primary-300 leading-tight text-center px-1">
                      v{ver}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-gray-200/90 dark:border-slate-600/80 shadow-sm dark:shadow-black/20 overflow-hidden">
                    <ul className="divide-y divide-gray-200/90 dark:divide-slate-600/80">
                      {byVersion[ver].map((row) => (
                        <li
                          key={row.id}
                          className="p-4 sm:p-5 hover:bg-white/80 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          {row.title && (
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base mb-1.5">
                              {row.title}
                            </h3>
                          )}
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap font-sans">
                            {row.changelog}
                          </p>
                          {row.released_at && (
                            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                              <svg
                                className="w-3.5 h-3.5 flex-shrink-0 text-primary-600 dark:text-primary-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              {formatDate(row.released_at)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.article>
              ))}
            </div>

            {hasMore && (
              <motion.div
                className="flex justify-center mt-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <button
                  type="button"
                  onClick={loadMore}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-700 dark:text-primary-200 bg-primary-50 dark:bg-primary-950/80 hover:bg-primary-100 dark:hover:bg-primary-900/90 border border-primary-200/90 dark:border-primary-600/50 transition-colors"
                >
                  Muat lebih banyak
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </TentangPageLayout>
  )
}
