import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export default function Version() {
  const [changelog, setChangelog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get('/version/changelog', { params: { app: 'uwaba' } })
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
    <div className="flex flex-col h-full min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-28">
          {/* Header */}
          <header className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-500/10 dark:bg-primary-400/10 text-primary-600 dark:text-primary-400 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Perubahan versi
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Catatan fitur dan perbaikan dari setiap rilis aplikasi.
            </p>
          </header>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Memuat changelog...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-6 text-center">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Gagal memuat data</p>
              <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{error}</p>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && versions.length === 0 && (
            <div className="rounded-2xl bg-white dark:bg-gray-800/80 shadow-sm border border-gray-200/80 dark:border-gray-700/80 p-10 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Belum ada catatan versi.</p>
            </div>
          )}

          {/* Timeline */}
          {!loading && versions.length > 0 && (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] sm:left-6 top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary-400/40 via-primary-400/20 to-transparent dark:from-primary-500/30 dark:via-primary-500/10 rounded-full" />

              <div className="space-y-8">
                {versions.map((ver, idx) => (
                  <article
                    key={ver}
                    className="relative flex gap-4 sm:gap-5"
                  >
                    {/* Version badge */}
                    <div className="relative z-10 flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-200/80 dark:border-gray-700/80 flex items-center justify-center">
                      <span className="text-xs sm:text-sm font-bold text-primary-600 dark:text-primary-400">
                        v{ver}
                      </span>
                    </div>

                    {/* Card */}
                    <div className="flex-1 min-w-0 rounded-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                        {byVersion[ver].map((row) => (
                          <li key={row.id} className="p-4 sm:p-5 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                            {row.title && (
                              <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base mb-1.5">
                                {row.title}
                              </h3>
                            )}
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap font-sans">
                              {row.changelog}
                            </p>
                            {row.released_at && (
                              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {formatDate(row.released_at)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>

              {/* Muat Lebih Banyak */}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-800/30 border border-primary-200/60 dark:border-primary-700/50 transition-colors"
                  >
                    Muat Lebih Banyak
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer links */}
          <nav className="flex flex-wrap items-center justify-center gap-3 mt-10">
            <Link
              to="/tentang"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors"
            >
              Tentang
            </Link>
            <Link
              to="/info-aplikasi"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200/80 dark:bg-gray-700/80 hover:bg-gray-300 dark:hover:bg-gray-600/80 transition-colors"
            >
              Info aplikasi
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Beranda
            </Link>
          </nav>
        </div>
      </div>
    </div>
  )
}
