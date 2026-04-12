import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { deepseekAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

function SwitchToggle({ checked, onChange, disabled, label, compact = false, toggleFirst = false }) {
  const labelEl = (
    <span
      className={
        compact
          ? 'select-none text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 inline-flex items-center gap-1 flex-wrap'
          : 'select-none text-xs font-medium text-gray-600 dark:text-gray-400 inline-flex items-center gap-1 flex-wrap'
      }
    >
      {label}
    </span>
  )
  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${
        checked ? 'justify-end bg-primary-600' : 'justify-start bg-gray-200 dark:bg-gray-600'
      } disabled:cursor-not-allowed disabled:opacity-45 ${compact ? 'h-5 w-9' : 'h-7 w-12'}`}
    >
      <span
        className={`pointer-events-none rounded-full bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${
          compact ? 'h-3.5 w-3.5' : 'h-5 w-5'
        }`}
      />
    </button>
  )
  return (
    <div className={`inline-flex items-center ${compact ? 'gap-2' : 'gap-2.5'}`}>
      {toggleFirst ? (
        <>
          {switchEl}
          {labelEl}
        </>
      ) : (
        <>
          {labelEl}
          {switchEl}
        </>
      )}
    </div>
  )
}

/**
 * Pengaturan User AI — tab penuh /chat-ai/user-ai (bukan panel bawah).
 */
export default function AiUserSettingsPage() {
  const { showNotification } = useNotification()
  const [adminAiUsers, setAdminAiUsers] = useState([])
  const [adminAiUsersTotal, setAdminAiUsersTotal] = useState(0)
  const [adminAiUsersLoading, setAdminAiUsersLoading] = useState(false)
  const [adminAiUsersSearch, setAdminAiUsersSearch] = useState('')
  const [adminAiUsersStatus, setAdminAiUsersStatus] = useState('')
  const [adminAiUsersPage, setAdminAiUsersPage] = useState(1)
  const [adminAiUsersLimit] = useState(20)
  const [editAiUser, setEditAiUser] = useState(null)
  const [editAiUserLimit, setEditAiUserLimit] = useState('5')
  const [editAiUserBusy, setEditAiUserBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAdminAiUsersLoading(true)
      try {
        const res = await deepseekAPI.adminListAiUsers({
          page: adminAiUsersPage,
          limit: adminAiUsersLimit,
          search: adminAiUsersSearch || undefined,
          status: adminAiUsersStatus || undefined,
        })
        if (cancelled) return
        if (res?.success) {
          setAdminAiUsers(res?.data?.items || [])
          setAdminAiUsersTotal(res?.data?.total || 0)
        } else {
          setAdminAiUsers([])
          setAdminAiUsersTotal(0)
        }
      } catch {
        if (!cancelled) {
          setAdminAiUsers([])
          setAdminAiUsersTotal(0)
        }
      } finally {
        if (!cancelled) setAdminAiUsersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adminAiUsersPage, adminAiUsersLimit, adminAiUsersSearch, adminAiUsersStatus])

  const openEditAiUserLimit = (userRow) => {
    setEditAiUser(userRow)
    setEditAiUserLimit(String(userRow?.ai_daily_limit ?? 5))
  }

  const closeLimitOffcanvas = useCallback(() => {
    if (!editAiUserBusy) setEditAiUser(null)
  }, [editAiUserBusy])

  const saveEditAiUserLimit = async () => {
    if (!editAiUser?.id || editAiUserBusy) return
    setEditAiUserBusy(true)
    try {
      const lim = Math.max(0, parseInt(String(editAiUserLimit).trim(), 10) || 0)
      const res = await deepseekAPI.adminUpdateAiUser(editAiUser.id, { ai_daily_limit: lim })
      if (res?.success) {
        setAdminAiUsers((prev) => prev.map((x) => (x.id === editAiUser.id ? { ...x, ai_daily_limit: lim } : x)))
        setEditAiUser(null)
        showNotification('Limit harian disimpan.', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan limit.', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan limit.', 'error')
    } finally {
      setEditAiUserBusy(false)
    }
  }

  const toggleAdminAiUserEnabled = async (userRow, next) => {
    if (!userRow?.id) return
    const prev = !!userRow.ai_enabled
    setAdminAiUsers((arr) => arr.map((x) => (x.id === userRow.id ? { ...x, ai_enabled: !!next } : x)))
    try {
      const res = await deepseekAPI.adminUpdateAiUser(userRow.id, { ai_enabled: !!next })
      if (!res?.success) {
        setAdminAiUsers((arr) => arr.map((x) => (x.id === userRow.id ? { ...x, ai_enabled: prev } : x)))
      }
    } catch {
      setAdminAiUsers((arr) => arr.map((x) => (x.id === userRow.id ? { ...x, ai_enabled: prev } : x)))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent sm:bg-gradient-to-b sm:from-primary-50/90 sm:to-white dark:sm:from-gray-900/85 dark:sm:to-gray-900/50">
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Pengaturan User AI</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Limit harian, status aktif, dan pencarian pengguna.</p>

          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="text"
              value={adminAiUsersSearch}
              onChange={(e) => {
                setAdminAiUsersSearch(e.target.value)
                setAdminAiUsersPage(1)
              }}
              placeholder="Cari nama, email, username, nomor WA..."
              className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
            <select
              value={adminAiUsersStatus}
              onChange={(e) => {
                setAdminAiUsersStatus(e.target.value)
                setAdminAiUsersPage(1)
              }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">Status AI: Semua</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>

          {adminAiUsersLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <div className="border-b border-gray-200 bg-primary-50/60 px-4 py-3 dark:border-gray-700 dark:bg-primary-950/25">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Aturan limit harian (berlaku untuk daftar di bawah)</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600 dark:text-gray-300">
                  <li>
                    <strong>Limit</strong> = maksimal interaksi AI per <strong>hari kalender</strong> (reset mengikuti waktu server), dihitung per
                    pasangan pertanyaan → jawaban.
                  </li>
                  <li>
                    Kolom <strong>pemakaian</strong> menampilkan <code className="rounded bg-white/80 px-1 dark:bg-gray-800/80">sudah dipakai / batas</code>{' '}
                    hari ini untuk baris tersebut.
                  </li>
                  <li>
                    Beberapa akun dengan <strong>nomor WhatsApp sama</strong> (setelah dinormalisasi) dapat <strong>berbagi satu ember</strong>{' '}
                    pemakaian di <strong>aplikasi web</strong>.
                  </li>
                  <li>
                    Nilai <strong>0</strong> = tidak ada kuota harian (permintaan AI akan ditolak). Nonaktifkan akses lebih rapi lewat toggle{' '}
                    <strong>AI aktif</strong>.
                  </li>
                </ul>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {adminAiUsers.map((u) => (
                  <li key={u.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {u.nama || u.username || u.email || `User #${u.id}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {u.email || '-'} {u.no_wa ? `· ${u.no_wa}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-medium text-gray-700 dark:text-gray-200">Pemakaian hari ini:</span>{' '}
                          <span className="tabular-nums">
                            {u.today_count ?? 0} / {u.ai_daily_limit ?? 0}
                          </span>{' '}
                          <span className="text-gray-500 dark:text-gray-400">(terpakai / limit)</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditAiUserLimit(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-800 hover:bg-primary-100 dark:border-primary-800/60 dark:bg-primary-950/40 dark:text-primary-200 dark:hover:bg-primary-900/50"
                        >
                          Ubah limit
                          <span className="tabular-nums opacity-90">({u.ai_daily_limit ?? 0})</span>
                        </button>
                        <SwitchToggle
                          compact
                          label="AI aktif"
                          checked={!!u.ai_enabled}
                          onChange={(next) => toggleAdminAiUserEnabled(u, next)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {adminAiUsers.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Tidak ada data user.</p>
              )}
            </div>
          )}

          {adminAiUsersTotal > adminAiUsersLimit && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total {adminAiUsersTotal} user</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={adminAiUsersPage <= 1}
                  onClick={() => setAdminAiUsersPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200"
                >
                  Sebelumnya
                </button>
                <span className="text-gray-600 dark:text-gray-300 self-center">Halaman {adminAiUsersPage}</span>
                <button
                  type="button"
                  disabled={adminAiUsersPage * adminAiUsersLimit >= adminAiUsersTotal}
                  onClick={() => setAdminAiUsersPage((p) => p + 1)}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editAiUser ? (
          <>
            <motion.div
              key="ai-user-limit-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[120] bg-black/40"
              onClick={closeLimitOffcanvas}
              aria-hidden="true"
            />
            <motion.div
              key="ai-user-limit-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-user-limit-title"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 380 }}
              className="fixed inset-x-0 bottom-0 z-[121] flex max-h-[min(88dvh,560px)] flex-col rounded-t-2xl border border-gray-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-gray-600 dark:bg-gray-800 dark:shadow-[0_-8px_30px_rgba(0,0,0,0.4)]"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden="true">
                <div className="h-1 w-11 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 pb-3 pt-1 dark:border-gray-700">
                <div className="min-w-0">
                  <h4 id="ai-user-limit-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Ubah limit harian
                  </h4>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {editAiUser.nama || editAiUser.username || editAiUser.email || `User #${editAiUser.id}`}
                  </p>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                    Saat ini:{' '}
                    <span className="tabular-nums font-medium text-gray-800 dark:text-gray-100">
                      {editAiUser.today_count ?? 0} / {editAiUser.ai_daily_limit ?? 0}
                    </span>{' '}
                    terpakai hari ini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeLimitOffcanvas}
                  disabled={editAiUserBusy}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
                  Angka di bawah mengikuti aturan di atas kartu daftar: reset harian server, ember bersama jika nomor WA sama antar akun.
                </p>
                <label htmlFor="ai-daily-limit-input" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-200">
                  Limit per hari
                </label>
                <input
                  id="ai-daily-limit-input"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={editAiUserLimit}
                  onChange={(e) => setEditAiUserLimit(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="shrink-0 border-t border-gray-200 px-4 pt-3 dark:border-gray-700">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeLimitOffcanvas}
                    disabled={editAiUserBusy}
                    className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={saveEditAiUserLimit}
                    disabled={editAiUserBusy}
                    className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {editAiUserBusy ? 'Menyimpan…' : 'Simpan'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
