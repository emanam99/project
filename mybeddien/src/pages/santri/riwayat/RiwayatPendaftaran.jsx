import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { pembayaranAPI } from '../../../services/api'
import { formatCurrency, formatDate, uniqueHistoryById, statusPendaftaran } from '../../../utils/riwayatPembayaran'
import HistoryList from '../../../components/riwayat/HistoryList'
import BayarOffcanvas from '../../../components/riwayat/BayarOffcanvas'

const SKIP_VALUES = ['tidak sekolah', 'sudah sekolah']

function shouldShowDaftar(value) {
  if (!value || typeof value !== 'string') return false
  const v = value.trim().toLowerCase()
  return v !== '' && !SKIP_VALUES.includes(v)
}

function getDaftarValue(r) {
  const diniyah = r.daftar_diniyah ?? r.diniyah ?? r.sekolah_diniyah ?? r.nama_diniyah ?? ''
  const formal = r.daftar_formal ?? r.formal ?? r.sekolah_formal ?? r.nama_formal ?? ''
  return {
    diniyah: typeof diniyah === 'string' ? diniyah : String(diniyah || ''),
    formal: typeof formal === 'string' ? formal : String(formal || ''),
  }
}

/** Teks status pendaftaran dari tabel psb___registrasi (status_pendaftar, keterangan_status). */
function getStatusPendaftaranText(r) {
  return r.status_pendaftar ?? r.keterangan_status ?? r.status_pendaftaran ?? r.status ?? r.keterangan ?? ''
}

export default function RiwayatPendaftaran() {
  const { user } = useAuthStore()
  const idSantri = user?.santri_id || user?.id
  const [registrasi, setRegistrasi] = useState([])
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bayarFor, setBayarFor] = useState(null)

  useEffect(() => {
    if (!idSantri) return
    setLoading(true)
    pembayaranAPI
      .getAllRegistrasiBySantri(idSantri)
      .then((r) => {
        if (r.success && r.data) setRegistrasi(Array.isArray(r.data) ? r.data : [])
      })
      .catch(() => setError('Gagal memuat data pendaftaran'))
      .finally(() => setLoading(false))
  }, [idSantri])

  if (!idSantri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">Anda harus login sebagai santri.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-8">
      <Link
        to="/santri/riwayat-pembayaran"
        className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline mb-4 sm:mb-6"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali ke Riwayat Pembayaran
      </Link>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6 tracking-tight">Pendaftaran (Registrasi)</h1>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
        </div>
      ) : registrasi.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data registrasi.</p>
      ) : (
        <div className="space-y-2">
          {registrasi.map((r) => {
            const tahunLabel = r.tahun_hijriyah && r.tahun_masehi
              ? `${r.tahun_hijriyah} / ${r.tahun_masehi}`
              : (r.tahun_masehi || r.tahun_hijriyah || '—')
            const status = statusPendaftaran(r.wajib, r.bayar, r.kurang, formatCurrency)
            const transaksi = uniqueHistoryById(Array.isArray(r.transaksi) ? r.transaksi : [])
            const isOpen = openId === r.id_registrasi
            const { diniyah: valDiniyah, formal: valFormal } = getDaftarValue(r)
            const statusPendaftaranText = getStatusPendaftaranText(r)
            const showDiniyah = shouldShowDaftar(valDiniyah)
            const showFormal = shouldShowDaftar(valFormal)

            return (
              <div
                key={r.id_registrasi}
                className="rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpenId((prev) => (prev === r.id_registrasi ? null : r.id_registrasi))
                  }}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <span className="font-semibold text-gray-900 dark:text-white shrink-0">{tahunLabel}</span>
                  <div className="flex-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs min-w-0 text-right">
                    <span className="text-gray-500 dark:text-gray-400">Wajib {formatCurrency(r.wajib)}</span>
                    <span className="text-primary-600 dark:text-primary-400">Bayar {formatCurrency(r.bayar)}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        status.type === 'lunas'
                          ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                          : status.type === 'kurang'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : status.type === 'belum'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0 transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-4">
                        {/* Ringkasan */}
                        <section>
                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Ringkasan</h3>
                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-2.5 sm:p-3 text-center">
                              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5">Wajib</p>
                              <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={formatCurrency(r.wajib)}>{formatCurrency(r.wajib)}</p>
                            </div>
                            <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 p-2.5 sm:p-3 text-center">
                              <p className="text-[10px] sm:text-xs text-primary-600 dark:text-primary-400 mb-0.5">Bayar</p>
                              <p className="text-xs sm:text-sm font-semibold text-primary-700 dark:text-primary-300 truncate" title={formatCurrency(r.bayar)}>{formatCurrency(r.bayar)}</p>
                            </div>
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 sm:p-3 text-center">
                              <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 mb-0.5">Kurang</p>
                              <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300 truncate" title={formatCurrency(r.kurang)}>{formatCurrency(r.kurang)}</p>
                            </div>
                          </div>
                        </section>

                        {/* Tombol Bayar (jika belum lunas) - sejajar kotak Bayar, rata tengah, lebar sama */}
                        {status.type !== 'lunas' && status.type !== 'muted' && (Number(r.wajib) || 0) > 0 && (
                          <div className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                            <div />
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setBayarFor({ id_registrasi: r.id_registrasi, wajib: r.wajib, kurang: r.kurang ?? (Number(r.wajib) || 0) - (Number(r.bayar) || 0) }) }}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl shadow-sm"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                              Bayar
                            </button>
                            <div />
                          </div>
                        )}

                        {/* Status pendaftaran - selalu tampil */}
                        <section>
                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Status pendaftaran</h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {statusPendaftaranText || '—'}
                            </span>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                status.type === 'lunas'
                                  ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                                  : status.type === 'kurang'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : status.type === 'belum'
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                            >
                              {status.label}
                            </span>
                          </div>
                        </section>

                        {/* Daftar Diniyah - selalu tampil; jika dari backend kosong/tidak dikirim tampilkan — */}
                        <section>
                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Daftar Diniyah</h3>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{showDiniyah ? valDiniyah : '—'}</p>
                        </section>

                        {/* Daftar Formal - selalu tampil; jika dari backend kosong/tidak dikirim tampilkan — */}
                        <section>
                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Daftar Formal</h3>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{showFormal ? valFormal : '—'}</p>
                        </section>

                        {/* Riwayat transaksi */}
                        <section>
                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Riwayat transaksi</h3>
                          <HistoryList items={transaksi} formatDateFunc={formatDate} emptyMessage="Belum ada transaksi." />
                        </section>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      <BayarOffcanvas
        isOpen={!!bayarFor}
        onClose={() => setBayarFor(null)}
        title="Bayar Pendaftaran (iPayMu)"
        jenisPembayaran="Pendaftaran"
        idSantri={idSantri}
        idReferensi={bayarFor?.id_registrasi ?? null}
        idRegistrasi={bayarFor?.id_registrasi ?? null}
        tabelReferensi="psb___registrasi"
        wajib={bayarFor?.wajib ?? 0}
        kurang={bayarFor?.kurang ?? 0}
        onSuccess={() => { setBayarFor(null); pembayaranAPI.getAllRegistrasiBySantri(idSantri).then((r) => { if (r?.success && r?.data) setRegistrasi(Array.isArray(r.data) ? r.data : []) }) }}
      />
    </div>
  )
}
