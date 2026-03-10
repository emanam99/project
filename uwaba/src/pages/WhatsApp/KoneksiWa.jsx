import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../../contexts/NotificationContext'
import { waBackendAPI } from '../../services/api'

const POLL_INTERVAL_CONNECTING = 2000
const POLL_INTERVAL_IDLE = 5000

export default function KoneksiWa() {
  const { showNotification } = useNotification()
  const [data, setData] = useState({
    status: 'disconnected',
    qrCode: null,
    phoneNumber: null
  })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null) // 'connect' | 'disconnect' | 'logout'
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [checkPhone, setCheckPhone] = useState('')
  const [checkResult, setCheckResult] = useState(null) // { isRegistered, phoneNumber } | null
  const [checking, setChecking] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await waBackendAPI.getStatus()
      if (res?.success && res?.data) {
        setData({
          status: res.data.status || 'disconnected',
          qrCode: res.data.qrCode || null,
          phoneNumber: res.data.phoneNumber || null
        })
      }
    } catch (e) {
      console.error('KoneksiWa fetchStatus:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(
      fetchStatus,
      data.status === 'connecting' ? POLL_INTERVAL_CONNECTING : POLL_INTERVAL_IDLE
    )
    return () => clearInterval(interval)
  }, [fetchStatus, data.status])

  const handleConnect = async () => {
    setActionLoading('connect')
    try {
      const res = await waBackendAPI.connect()
      if (res?.success) {
        showNotification(res?.message || 'Memulai koneksi. Scan QR code jika muncul.', 'success')
        setData(prev => ({
          ...prev,
          status: res?.data?.status ?? 'connecting',
          qrCode: res?.data?.qrCode ?? prev.qrCode
        }))
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menghubungkan', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau. Pastikan server WA berjalan.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisconnect = async () => {
    setActionLoading('disconnect')
    try {
      const res = await waBackendAPI.disconnect()
      if (res?.success) {
        showNotification(res?.message || 'Koneksi diputus.', 'success')
        setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
      } else {
        showNotification(res?.message || 'Gagal memutus koneksi', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('Logout akan menghapus sesi WhatsApp. Untuk pakai lagi harus scan QR. Lanjutkan?')) return
    setActionLoading('logout')
    try {
      const res = await waBackendAPI.logout()
      if (res?.success) {
        showNotification(res?.message || 'Logout berhasil.', 'success')
        setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
      } else {
        showNotification(res?.message || 'Gagal logout', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendTest = async () => {
    const phone = testPhone.trim()
    const msg = testMessage.trim()
    if (!phone) {
      showNotification('Masukkan nomor tujuan', 'warning')
      return
    }
    if (!msg) {
      showNotification('Masukkan isi pesan', 'warning')
      return
    }
    setSendingTest(true)
    try {
      const res = await waBackendAPI.send(phone, msg)
      if (res?.success) {
        showNotification('Pesan tes terkirim', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengirim', 'error')
      }
    } catch (e) {
      showNotification('Gagal mengirim: ' + (e?.message || 'Network error'), 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleCheckNumber = async () => {
    const phone = checkPhone.trim()
    if (!phone) {
      showNotification('Masukkan nomor yang ingin dicek', 'warning')
      return
    }
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await waBackendAPI.checkNumber(phone)
      if (res?.success && res?.data) {
        setCheckResult({
          isRegistered: res.data.isRegistered,
          phoneNumber: res.data.phoneNumber ?? phone
        })
        showNotification(res?.message ?? (res.data.isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar'), res.data.isRegistered ? 'success' : 'info')
      } else {
        showNotification(res?.message || 'Gagal mengecek nomor', 'error')
      }
    } catch (e) {
      showNotification('Gagal mengecek: ' + (e?.message || 'Network error'), 'error')
    } finally {
      setChecking(false)
    }
  }

  if (loading && !data.qrCode) {
    return (
      <div className="h-full flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  const isConnected = data.status === 'connected'
  const isConnecting = data.status === 'connecting'

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden max-h-[calc(100vh-8rem)]">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 max-w-lg mx-auto pb-8">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.76.966-.931 1.164-.171.199-.342.223-.639.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </span>
                Koneksi WhatsApp Web
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Kelola koneksi ke backend WA untuk mengirim pesan dari aplikasi.
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</span>
                <span
                  className={`text-sm font-semibold px-2 py-0.5 rounded ${
                    isConnected
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                      : isConnecting
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                  }`}
                >
                  {isConnected ? 'Terhubung' : isConnecting ? 'Menghubungkan...' : 'Terputus'}
                </span>
              </div>

              {isConnected && data.phoneNumber && (
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Nomor</span>
                  <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{data.phoneNumber}</span>
                </div>
              )}

              {/* QR Code */}
              {isConnecting && data.qrCode && (
                <div className="flex flex-col items-center py-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Scan QR code dengan WhatsApp di HP Anda</p>
                  <img
                    src={data.qrCode}
                    alt="QR WhatsApp"
                    className="w-56 h-56 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white"
                  />
                </div>
              )}

              {/* Koneksi: toggle On/Off saat sudah login, tombol Hubungkan saat belum */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Koneksi</span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => {
                            if (actionLoading) return
                            handleDisconnect()
                          }}
                          disabled={!!actionLoading}
                          className="sr-only"
                        />
                        <span className="w-11 h-6 bg-[#25D366] rounded-full" />
                        <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow pointer-events-none translate-x-5" />
                        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">On</span>
                      </label>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Klik On → Off untuk putus sementara (sesi tetap tersimpan)</span>
                  </>
                ) : isConnecting ? (
                  <span className="text-sm text-amber-600 dark:text-amber-400">Menghubungkan...</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={!!actionLoading}
                    className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'connect' ? 'Memulai...' : 'Hubungkan'}
                  </button>
                )}
                {/* Logout hanya untuk hapus sesi (perlu scan QR lagi nanti) */}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={!!actionLoading}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Logout (hapus sesi)
                </button>
              </div>

              {/* Cek nomor aktif — hanya saat terhubung */}
              {isConnected && (
                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cek nomor aktif</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cek apakah nomor terdaftar di WhatsApp (sama seperti fitur di wa lama).</p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nomor (08xxx / 62xxx)</label>
                      <input
                        type="text"
                        placeholder="08123456789"
                        value={checkPhone}
                        onChange={(e) => { setCheckPhone(e.target.value); setCheckResult(null) }}
                        onKeyDown={(e) => e.key === 'Enter' && handleCheckNumber()}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckNumber}
                      disabled={checking}
                      className="px-4 py-2 rounded-lg bg-gray-700 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checking ? 'Mengecek...' : 'Cek'}
                    </button>
                  </div>
                  {checkResult !== null && (
                    <div className={`py-2 px-3 rounded-lg text-sm font-medium ${checkResult.isRegistered ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {checkResult.isRegistered ? 'Aktif (terdaftar di WhatsApp)' : 'Tidak terdaftar di WhatsApp'}
                      {checkResult.phoneNumber && <span className="block text-xs mt-1 font-mono opacity-90">{checkResult.phoneNumber}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Tes kirim pesan — hanya saat terhubung */}
              {isConnected && (
                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tes kirim pesan</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nomor tujuan (08xxx / 62xxx)</label>
                    <input
                      type="text"
                      placeholder="08123456789"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Isi pesan</label>
                    <textarea
                      placeholder="Pesan tes dari Koneksi WA"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-y"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={sendingTest}
                    className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingTest ? 'Mengirim...' : 'Kirim tes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
