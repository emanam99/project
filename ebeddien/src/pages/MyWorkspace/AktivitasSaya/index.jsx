import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { profilAPI, authAPI } from '../../../services/api'
import Modal from '../../../components/Modal/Modal'

const LIMIT = 20

const Card = ({ title, children, icon }) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden"
  >
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
      {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
        {title}
      </h2>
    </div>
    <div className="p-5">{children}</div>
  </motion.section>
)

const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_INDONESIA = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function formatTanggalLong(isoDate) {
  if (!isoDate) return '–'
  const d = new Date(isoDate)
  const hari = HARI_INDONESIA[d.getDay()]
  const tanggal = d.getDate()
  const bulan = BULAN_INDONESIA[d.getMonth()]
  const tahun = d.getFullYear()
  return `${hari}, ${tanggal} ${bulan} ${tahun}`
}

function getDateKey(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  return d.toISOString().slice(0, 10)
}

function groupByDate(activities) {
  const map = new Map()
  for (const a of activities) {
    const key = getDateKey(a.created_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(a)
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.02 }
  }
}
const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 }
}

function AktivitasRow({ a, isLast }) {
  const actionLabel = (a.action || '').toLowerCase()
  const isCreate = actionLabel === 'create'
  const isUpdate = actionLabel === 'update'
  const isDelete = actionLabel === 'delete'
  const dotClass = isCreate
    ? 'bg-teal-500 dark:bg-teal-400 ring-4 ring-teal-100 dark:ring-teal-900/50'
    : isUpdate
      ? 'bg-amber-500 dark:bg-amber-400 ring-4 ring-amber-100 dark:ring-amber-900/50'
      : isDelete
        ? 'bg-red-500 dark:bg-red-400 ring-4 ring-red-100 dark:ring-red-900/50'
        : 'bg-gray-400 dark:bg-gray-500 ring-4 ring-gray-100 dark:ring-gray-800/50'
  const timeStr = a.created_at
    ? new Date(a.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '–'
  return (
    <motion.li
      variants={staggerItem}
      className="relative flex items-start gap-4 pl-2 -ml-px group"
    >
      {/* Garis vertikal ke bawah (kecuali item terakhir di grup) — sejajar tengah bullet */}
      {!isLast && (
        <span
          className="absolute left-[13px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-600 rounded-full"
          aria-hidden
        />
      )}
      {/* Bullet di garis (mirip timeline git) */}
      <span
        className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ${dotClass} border-2 border-white dark:border-gray-800`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 pt-0.5 pb-4">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          <span className="capitalize">{a.action}</span>
          <span className="text-gray-500 dark:text-gray-400 font-normal"> · {a.entity_type}</span>
          {a.entity_id != null && a.entity_id !== '' && (
            <span className="text-gray-400 dark:text-gray-500 font-mono text-xs ml-0.5">#{a.entity_id}</span>
          )}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">{timeStr}</p>
      </div>
    </motion.li>
  )
}

export default function AktivitasSaya() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [showSessionOffcanvas, setShowSessionOffcanvas] = useState(false)
  const [showSessionDetail, setShowSessionDetail] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmType, setConfirmType] = useState('')
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [isPc, setIsPc] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)

  useEffect(() => {
    const onResize = () => setIsPc(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const loadSessions = useCallback(() => {
    setSessionsLoading(true)
    authAPI.getSessions().then((res) => {
      if (res.success && Array.isArray(res.data)) setSessions(res.data)
    }).catch(() => {}).finally(() => setSessionsLoading(false))
  }, [])

  const handleConfirm = useCallback(async () => {
    if (confirmType === 'logout_all') {
      setLogoutAllLoading(true)
      authAPI.logoutAll().then((res) => { if (res.success) loadSessions() }).catch(() => {}).finally(() => setLogoutAllLoading(false))
    }
    if (confirmType === 'revoke' && showSessionDetail) {
      setRevokeLoading(true)
      try {
        const res = await authAPI.revokeSession(showSessionDetail.id)
        if (res.success) {
          loadSessions()
          setShowSessionDetail(null)
        }
      } catch (_) {}
      setRevokeLoading(false)
    }
    setShowConfirmModal(false)
    setConfirmType('')
  }, [confirmType, showSessionDetail, loadSessions])

  const load = useCallback(async (isLoadMore = false, requestOffset = 0) => {
    const nextOffset = isLoadMore ? requestOffset : 0
    if (isLoadMore) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await profilAPI.getAktivitas({ limit: LIMIT, offset: nextOffset })
      const data = res.data || []
      const totalCount = res.total ?? data.length
      if (isLoadMore) {
        setList((prev) => [...prev, ...data])
        setOffset(nextOffset + data.length)
      } else {
        setList(data)
        setOffset(data.length)
      }
      setTotal(totalCount)
      setHasMore(nextOffset + data.length < totalCount)
    } catch {
      if (!isLoadMore) setList([])
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    load(true, offset)
  }

  const aktivitasListContent = (
    <div className="max-w-3xl mx-auto px-4 sm:px-0 py-4">
      <style>{`
        .aktivitas-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.35) transparent; }
        .dark .aktivitas-scroll { scrollbar-color: rgba(71, 85, 105, 0.5) transparent; }
        .aktivitas-scroll::-webkit-scrollbar { width: 8px; }
        .aktivitas-scroll::-webkit-scrollbar-track { background: transparent; }
        .aktivitas-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; transition: background 0.2s ease; }
        .aktivitas-scroll:hover::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); }
        .aktivitas-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.55); }
        .dark .aktivitas-scroll:hover::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.5); }
        .dark .aktivitas-scroll::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 0.7); }
      `}</style>
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat.</p>
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-5 pt-4 pb-2">
              {groupByDate(list).map(([dateKey, items]) => (
                <motion.div
                  key={dateKey}
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="mb-6 last:mb-4"
                >
                  <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-3 sticky top-0 bg-white dark:bg-gray-800 py-1 -mx-1 px-1 z-[1]">
                    {formatTanggalLong(items[0]?.created_at)}
                  </p>
                  <ul className="relative">
                    {items.map((a, idx) => (
                      <AktivitasRow
                        key={a.id}
                        a={a}
                        isLast={idx === items.length - 1}
                      />
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row items-center justify-between gap-2 bg-gray-50/50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Menampilkan {list.length} dari {total}
              </p>
              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-50"
                >
                  {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )

  const aktivitasLoginCard = (
    <Card
      title="Aktivitas login (perangkat)"
      icon={
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      }
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Klik baris untuk melihat detail perangkat.</p>
      {sessionsLoading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada data session.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedSession(s); setShowSessionOffcanvas(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSession(s); setShowSessionOffcanvas(true) } }}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30 text-sm cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate">
                    {s.current && <span className="text-teal-600 dark:text-teal-400 font-medium mr-2">Perangkat ini</span>}
                    {s.device_type || '–'} · {s.browser_name || '–'}
                    {s.browser_version ? ` ${s.browser_version}` : ''}
                    {s.os_name ? ` · ${s.os_name}` : ''}
                    {s.os_version ? ` ${s.os_version}` : ''}
                  </span>
                  {(s.device_id || s.platform || s.timezone || s.language || s.screen) && (
                    <span className="block mt-1 text-xs text-gray-500 truncate">
                      {s.device_id && <span title={s.device_id}>ID: {s.device_id.length > 8 ? `${s.device_id.slice(0, 8)}…` : s.device_id} </span>}
                      {s.platform && <span>{s.platform} </span>}
                      {s.timezone && <span>· {s.timezone} </span>}
                      {s.language && <span>· {s.language} </span>}
                      {s.screen && <span>· {s.screen}</span>}
                    </span>
                  )}
                  {s.ip_address && (
                    <span className="block mt-0.5 text-xs text-gray-400">IP: {s.ip_address}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-gray-500">
                    {s.last_activity_at ? new Date(s.last_activity_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '–'}
                  </span>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => { setShowSessionDetail(s); setConfirmType('revoke'); setShowConfirmModal(true); }}
                      disabled={revokeLoading}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      Log out
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {sessions.some((s) => s.current) && sessions.filter((s) => !s.current).length > 0 && (
            <button
              type="button"
              onClick={() => { setConfirmType('logout_all'); setShowConfirmModal(true); }}
              disabled={logoutAllLoading}
              className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
            >
              {logoutAllLoading ? 'Memproses...' : 'Keluar dari perangkat lain'}
            </button>
          )}
        </>
      )}
    </Card>
  )

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row lg:overflow-x-hidden">
      {isPc ? (
        <>
          <div className="aktivitas-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            {aktivitasListContent}
          </div>
          <aside className="h-full shrink-0 w-[28rem] max-w-[32rem] xl:max-w-[36rem] border-l border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 flex flex-col min-h-0 overflow-hidden">
            <div className="aktivitas-scroll flex-1 min-h-0 overflow-y-auto p-4">
              {aktivitasLoginCard}
            </div>
          </aside>
        </>
      ) : (
        <div className="aktivitas-scroll flex-1 min-h-0 overflow-auto">
          {aktivitasListContent}
          <div className="max-w-3xl mx-auto px-4 sm:px-0 pb-4 mt-6">
            {aktivitasLoginCard}
          </div>
        </div>
      )}

      {/* Offcanvas kanan: detail perangkat. Portal tetap mount selama selectedSession ada agar AnimatePresence bisa jalankan exit (geser ke kanan). */}
      {selectedSession && createPortal(
        <AnimatePresence onExitComplete={() => { setShowSessionOffcanvas(false); setSelectedSession(null) }}>
          {showSessionOffcanvas && (
            <>
              <motion.div
                key="session-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'tween', duration: 0.2 }}
                onClick={() => setShowSessionOffcanvas(false)}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="session-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Detail perangkat</h3>
                  <button
                    type="button"
                    onClick={() => setShowSessionOffcanvas(false)}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="flex justify-center py-4">
                {selectedSession.device_type === 'mobile' && (
                  <svg className="w-24 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                )}
                {selectedSession.device_type === 'tablet' && (
                  <svg className="w-28 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                )}
                {(selectedSession.device_type === 'desktop' || selectedSession.device_type === 'bot' || !selectedSession.device_type) && (
                  <svg className="w-28 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                )}
              </div>
              <div className="grid gap-2 text-sm">
                <div><span className="text-gray-500 dark:text-gray-400">Perangkat</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.device_type || '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Browser</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.browser_name || '–'}{selectedSession.browser_version ? ` ${selectedSession.browser_version}` : ''}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">OS</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.os_name || '–'}{selectedSession.os_version ? ` ${selectedSession.os_version}` : ''}</span></div>
                {selectedSession.device_id && (
                  <div><span className="text-gray-500 dark:text-gray-400">Device ID</span><br /><span className="text-gray-800 dark:text-gray-200 font-mono text-xs break-all" title={selectedSession.device_id}>{selectedSession.device_id}</span></div>
                )}
                {selectedSession.platform && (
                  <div><span className="text-gray-500 dark:text-gray-400">Platform</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.platform}</span></div>
                )}
                {selectedSession.timezone && (
                  <div><span className="text-gray-500 dark:text-gray-400">Zona waktu</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.timezone}</span></div>
                )}
                {selectedSession.language && (
                  <div><span className="text-gray-500 dark:text-gray-400">Bahasa</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.language}</span></div>
                )}
                {selectedSession.screen && (
                  <div><span className="text-gray-500 dark:text-gray-400">Layar</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.screen}</span></div>
                )}
                <div><span className="text-gray-500 dark:text-gray-400">IP</span><br /><span className="text-gray-800 dark:text-gray-200 font-mono">{selectedSession.ip_address || '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Terakhir aktif</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.last_activity_at ? new Date(selectedSession.last_activity_at).toLocaleString('id-ID') : '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Login pada</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.created_at ? new Date(selectedSession.created_at).toLocaleString('id-ID') : '–'}</span></div>
                {selectedSession.user_agent && (
                  <div><span className="text-gray-500 dark:text-gray-400">User-Agent</span><br /><span className="text-gray-700 dark:text-gray-300 text-xs break-all">{selectedSession.user_agent}</span></div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              {selectedSession.current ? (
                <p className="text-sm text-teal-600 dark:text-teal-400 font-medium">Perangkat ini (sesi aktif)</p>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowSessionDetail(selectedSession); setConfirmType('revoke'); setShowConfirmModal(true); setShowSessionOffcanvas(false) }}
                  disabled={revokeLoading}
                  className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm disabled:opacity-50"
                >
                  {revokeLoading ? 'Memproses...' : 'Log out perangkat ini'}
                </button>
              )}
            </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <Modal
        isOpen={showConfirmModal}
        onClose={() => { setShowConfirmModal(false); setConfirmType(''); setShowSessionDetail(null); }}
        title={confirmType === 'logout_all' ? 'Keluar dari perangkat lain' : 'Log out perangkat'}
        maxWidth="max-w-md"
        showCloseButton
        closeOnBackdropClick
      >
        <div className="p-4 space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            {confirmType === 'logout_all'
              ? 'Keluar dari semua perangkat lain? Perangkat ini tetap login.'
              : 'Log out perangkat ini? Perangkat tersebut harus login lagi.'}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => { setShowConfirmModal(false); setConfirmType(''); setShowSessionDetail(null); }}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
            >
              {confirmType === 'logout_all' ? 'Ya, keluar dari perangkat lain' : 'Log Out'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
