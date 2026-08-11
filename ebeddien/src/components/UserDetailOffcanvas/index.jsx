import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI } from '../../services/api'

function formatVerifiedAt(value) {
  if (value == null || String(value).trim() === '' || String(value).startsWith('0000-00-00')) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function flagOn(v) {
  return v === true || v === 1 || v === '1'
}

/**
 * Offcanvas detail akun users (mode baca saja).
 * Dipakai lewat UserDetailOffcanvasContext / openUserDetail.
 */
export default function UserDetailOffcanvas({ isOpen, onClose, userId, stackBaseZIndex = null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!isOpen || userId == null || userId === '') {
      setUser(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    manageUsersAPI
      .getDetailReadonly(userId)
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data?.user) {
          setUser(res.data.user)
        } else {
          setUser(null)
          setError(res?.message || 'User tidak ditemukan')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setUser(null)
        setError(err?.response?.data?.message || 'Gagal memuat detail user')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, userId])

  const zb = typeof stackBaseZIndex === 'number' && Number.isFinite(stackBaseZIndex) ? Math.floor(stackBaseZIndex) : null
  const backdropStyle = zb != null ? { zIndex: zb } : undefined
  const panelStyle = zb != null ? { zIndex: zb + 1 } : undefined

  const nama =
    user?.pengurus?.nama ||
    user?.santri?.nama ||
    (Array.isArray(user?.santri_list) && user.santri_list[0]?.nama) ||
    user?.username ||
    '-'

  const isPengurus = !!user?.pengurus_id || !!user?.pengurus
  const isSantri =
    !!user?.santri_id ||
    (Array.isArray(user?.santri_list) && user.santri_list.length > 0)
  const isToko = Array.isArray(user?.toko) && user.toko.length > 0
  const isPjgt = !!user?.pjgt_madrasah?.id

  return (
    <AnimatePresence>
      {isOpen && userId != null && userId !== '' && (
        <>
          <motion.div
            key="user-detail-readonly-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={backdropStyle}
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm${zb == null ? ' z-[10300]' : ''}`}
            aria-hidden="true"
          />
          <motion.div
            key="user-detail-readonly-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={panelStyle}
            className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700${zb == null ? ' z-[10301]' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-readonly-title"
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id="user-detail-readonly-title"
                    className="text-base font-semibold text-gray-900 dark:text-white tracking-tight"
                  >
                    Detail User
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mode baca saja</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
              {loading && (
                <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Memuat…
                </div>
              )}
              {!loading && error && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              {!loading && !error && user && (
                <>
                  <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Username</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white break-all">
                      @{user.username || '—'}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{nama}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">User ID: {user.id}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {isPengurus && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          Pengurus
                        </span>
                      )}
                      {isSantri && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          Santri
                          {Array.isArray(user.santri_list) && user.santri_list.length > 1
                            ? ` (${user.santri_list.length})`
                            : ''}
                        </span>
                      )}
                      {isToko && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                          Toko
                          {user.toko.length > 1 ? ` (${user.toko.length})` : ''}
                        </span>
                      )}
                      {isPjgt && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 max-w-full truncate"
                          title={user.pjgt_madrasah?.nama || 'PJGT'}
                        >
                          PJGT{user.pjgt_madrasah?.nama ? `: ${user.pjgt_madrasah.nama}` : ''}
                        </span>
                      )}
                      {!isPengurus && !isSantri && !isToko && !isPjgt && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                          Belum terhubung identitas
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Kontak & Verifikasi</h3>
                    </div>
                    <dl className="p-5 grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">No. WA</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{user.no_wa || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">Email</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5 break-all">
                          {user.email || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">Terakhir verifikasi email</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                          {formatVerifiedAt(user.email_verified_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">Terakhir verifikasi WA</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                          {formatVerifiedAt(user.no_wa_verified_at)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Akses portal</h3>
                    </div>
                    <div className="p-5 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          flagOn(user.access_ebeddien)
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        eBeddien: {flagOn(user.access_ebeddien) ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          flagOn(user.access_mybeddian_santri)
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        MyBeddien Santri: {flagOn(user.access_mybeddian_santri) ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          flagOn(user.access_mybeddian_toko)
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        MyBeddien Toko: {flagOn(user.access_mybeddian_toko) ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          flagOn(user.access_mybeddian_pjgt)
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        MyBeddien PJGT: {flagOn(user.access_mybeddian_pjgt) ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                  </div>

                  {isPengurus && (
                    <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pengurus</h3>
                      </div>
                      <dl className="p-5 grid grid-cols-1 gap-2 text-sm">
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Nama</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {user.pengurus?.nama || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">NIP / ID</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {user.pengurus?.nip ?? user.pengurus?.id ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Status</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {user.pengurus?.status || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {isSantri && (
                    <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Santri terhubung</h3>
                      </div>
                      <ul className="p-5 space-y-2 text-sm">
                        {(user.santri_list?.length
                          ? user.santri_list
                          : user.santri
                            ? [user.santri]
                            : []
                        ).map((s) => (
                          <li
                            key={s.id}
                            className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2"
                          >
                            <p className="font-medium text-gray-900 dark:text-gray-100">{s.nama || '—'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              NIS: {s.nis ?? '—'} · ID: {s.id}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {isToko && (
                    <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Toko</h3>
                      </div>
                      <ul className="p-5 space-y-2 text-sm">
                        {user.toko.map((t) => (
                          <li
                            key={t.id}
                            className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2"
                          >
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {t.nama_toko || '—'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Kode: {t.kode_toko || '—'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {isPjgt && (
                    <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">PJGT Madrasah</h3>
                      </div>
                      <dl className="p-5 grid grid-cols-1 gap-2 text-sm">
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Nama</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {user.pjgt_madrasah?.nama || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Identitas</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {user.pjgt_madrasah?.identitas || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
