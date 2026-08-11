import React from 'react'

/**
 * Global ErrorBoundary untuk eBeddien.
 * Tangkap runtime error di subtree React supaya user tidak melihat white screen.
 * Tampilkan fallback dengan tombol "Muat ulang" + "Ke beranda".
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
    // Cetak ke console agar mudah ditangkap saat development.
    // Kirim ke endpoint server bisa ditambahkan nanti (per audit Mei 2026).
    if (typeof console !== 'undefined') {
      console.error('[eBeddien ErrorBoundary]', error, info?.componentStack)
    }
  }

  handleReload = () => {
    try { window.location.reload() } catch (_) { /* noop */ }
  }

  handleHome = () => {
    try { window.location.assign('/beranda') } catch (_) { /* noop */ }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const message = this.state.error?.message || 'Terjadi kesalahan tak terduga.'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Maaf, ada yang salah
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {message}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Coba muat ulang halaman. Jika masih bermasalah, kembali ke beranda atau hubungi admin.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Muat ulang
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-sm"
            >
              Ke beranda
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
