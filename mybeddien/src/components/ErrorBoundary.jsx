import React from 'react'

/**
 * Global ErrorBoundary untuk myBeddien (portal santri/wali).
 * Tangkap runtime error supaya santri tidak melihat white screen.
 * Fallback ringan: pesan + tombol "Muat ulang" + "Ke beranda".
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('[myBeddien ErrorBoundary]', error, info?.componentStack)
    }
  }

  handleReload = () => {
    try { window.location.reload() } catch (_) { /* noop */ }
  }

  handleHome = () => {
    try { window.location.assign('/') } catch (_) { /* noop */ }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const message = this.state.error?.message || 'Terjadi kesalahan tak terduga.'
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-6">
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 shadow rounded-xl p-5">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Maaf, ada yang salah
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {message}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Coba muat ulang halaman. Jika masih bermasalah, kembali ke beranda.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Muat ulang
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-sm font-medium"
            >
              Beranda
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
