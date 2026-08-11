import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'
import { authAPI } from '../../../services/api'
import { getMybeddienAppUrl } from '../../../config/mybeddienAppUrl'

import { hijriUwabaBulanList } from '../../../utils/uwabaCalculator'

/** Nomor WhatsApp bantuan penautan santri (format internasional tanpa +). */
const MYBEDDIAN_HELP_WA = '6282232999921'

/** id_bulan hijriyah di tabel uwaba (11, 12, 1–8). */
const UWABA_ID_BULAN_SET = new Set(hijriUwabaBulanList.map((b) => b.id))

function digitsOnly(s) {
  return String(s ?? '').replace(/\D/g, '')
}

function buildTautkanHelpMessage({ username, nip, namaPengurus, nik, namaSantri }) {
  const u = username || '—'
  const n = nip != null && String(nip).trim() !== '' ? String(nip).trim() : '—'
  const p = namaPengurus || '—'
  const nk = digitsOnly(nik) || String(nik || '').trim() || '—'
  const ns = (namaSantri || '').trim() || '—'
  return `Mohon bantuan untuk menautkan akun ${u}, ${n},\n${p}\nke santri dengan NIK :\n${nk}\nNama : ${ns}`
}

function openWhatsAppHelp(text) {
  const url = `https://wa.me/${MYBEDDIAN_HELP_WA}?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

function extractApiErrorMessage(err) {
  const d = err?.response?.data
  if (d && typeof d.message === 'string' && d.message.trim() !== '') return d.message
  if (d?.data && typeof d.data.message === 'string' && d.data.message.trim() !== '') return d.data.message
  if (!err?.response && typeof err?.message === 'string' && err.message.trim() !== '') return err.message
  return 'Terjadi kesalahan'
}

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(n)
  )
}

function statusUwabaKet(wajib, bayar, kurang) {
  const w = Number(wajib) || 0
  const b = Number(bayar) || 0
  const kRaw = kurang != null ? Number(kurang) : NaN
  const k = Number.isFinite(kRaw) ? Math.max(0, kRaw) : Math.max(0, w - b)
  if (w <= 0) return { label: '—', className: 'text-gray-400 dark:text-gray-500' }
  if (b === 0) return { label: 'Belum', className: 'text-red-600 dark:text-red-400 font-medium' }
  if (k <= 0 || b >= w) return { label: 'Lunas', className: 'text-green-600 dark:text-green-400 font-medium' }
  return {
    label: `Kurang ${formatRupiah(k)}`,
    className: 'text-amber-600 dark:text-amber-400 font-medium',
  }
}

function isBulanPotongEligible(wajib, bayar, kurang) {
  const w = Number(wajib) || 0
  if (w <= 0) return false
  const b = Number(bayar) || 0
  const kRaw = kurang != null ? Number(kurang) : NaN
  const k = Number.isFinite(kRaw) ? Math.max(0, kRaw) : Math.max(0, w - b)
  return b < w || k > 0
}

function PotongSwitch({ on, disabled, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-10 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 ${
        on ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** List bulan UWABA — pilih satu bulan tujuan potong Bisyaroh berikutnya (hanya bulan belum lunas). */
function PotongBisyarohBulanList({
  santriId,
  uwabaRincian,
  potongBulanId,
  potongSavingKey,
  onPotongBulanToggle,
}) {
  const sid = Number(santriId)
  const rows = uwabaRincian && Array.isArray(uwabaRincian.rincian) ? uwabaRincian.rincian : []
  const ta = uwabaRincian?.tahun_ajaran
  const tot = uwabaRincian?.total || {}
  const saving = potongSavingKey === String(sid)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Potong Bisyaroh (UWABA)
        {ta ? (
          <span className="normal-case font-medium text-gray-600 dark:text-gray-300">
            {' '}
            · TA {ta}
          </span>
        ) : null}
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
        Pilih satu bulan tujuan potong Bisyaroh berikutnya. Toggle hanya untuk bulan yang belum lunas.
      </p>

      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-[11px] text-gray-500 dark:text-gray-400 px-1 py-2">
            Belum ada baris UWABA per bulan — nominal wajib ditetapkan admin di halaman UWABA.
          </li>
        ) : (
          rows.map((row) => {
            const ket = statusUwabaKet(row.wajib, row.bayar, row.kurang)
            const bulanLabel = row.keterangan_1 || row.bulan || `Bulan ${row.id_bulan ?? ''}`
            const idBulan = Number(row.id_bulan)
            const bayar = Number(row.bayar) || 0
            const eligible =
              UWABA_ID_BULAN_SET.has(idBulan) && isBulanPotongEligible(row.wajib, row.bayar, row.kurang)
            const selected = eligible && potongBulanId === idBulan
            return (
              <li
                key={row.id ?? row.id_bulan}
                className={`rounded-lg border px-2.5 py-2 ${
                  selected
                    ? 'border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/20'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {eligible ? (
                      <PotongSwitch
                        on={selected}
                        disabled={saving}
                        ariaLabel={`Potong Bisyaroh ke bulan ${bulanLabel}`}
                        onChange={(next) => {
                          if (!ta || !UWABA_ID_BULAN_SET.has(idBulan)) return
                          onPotongBulanToggle(sid, ta, idBulan, next)
                        }}
                      />
                    ) : (
                      <span
                        className="inline-flex h-6 w-10 flex-shrink-0 rounded-full bg-gray-100 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600"
                        aria-hidden
                      />
                    )}
                    <span className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100 truncate">
                      {bulanLabel}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200 shrink-0">
                    {bayar > 0 ? formatRupiah(bayar) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                  <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                    {Number(row.wajib) > 0 ? formatRupiah(row.wajib) : '—'}
                  </span>
                  <span className={ket.className}>{ket.label}</span>
                </div>
              </li>
            )
          })
        )}
      </ul>

      {rows.length > 0 ? (
        <div className="flex justify-between gap-2 text-[10px] text-gray-500 dark:text-gray-400 px-0.5">
          <span>
            Wajib {formatRupiah(tot.total)} · Bayar {formatRupiah(tot.bayar)}
          </span>
          <span>Kurang {formatRupiah(tot.kurang)}</span>
        </div>
      ) : null}
    </div>
  )
}

const Card = ({ title, children, icon, className = '' }) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={`rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden flex flex-col min-h-0 ${className}`}
  >
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-3 shrink-0">
      {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">{title}</h2>
    </div>
    <div className="p-5 min-h-0">{children}</div>
  </motion.section>
)

export default function MybeddianPage() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [nikInput, setNikInput] = useState('')
  const [nikLookupStatus, setNikLookupStatus] = useState('idle')
  const [nikResultSantri, setNikResultSantri] = useState(null)
  const [nikLookupLoading, setNikLookupLoading] = useState(false)
  const [helpNamaSantri, setHelpNamaSantri] = useState('')
  const [linking, setLinking] = useState(false)
  const [portalSaving, setPortalSaving] = useState(false)
  const [potongBulanLocal, setPotongBulanLocal] = useState({})
  const [potongSavingKey, setPotongSavingKey] = useState(null)
  const nikTimer = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authAPI.getMeMybeddian()
      if (!res?.success || !res.data) {
        showNotification(res?.message || 'Gagal memuat data MyBeddien', 'error')
        setData(null)
        return
      }
      setData(res.data)
      const pl = {}
      for (const s of res.data.santri_list || []) {
        const sid = Number(s.id)
        const pb = s.potong_bulan
        if (Number.isFinite(sid) && sid > 0 && pb && UWABA_ID_BULAN_SET.has(Number(pb.id_bulan))) {
          pl[sid] = Number(pb.id_bulan)
        }
      }
      setPotongBulanLocal(pl)
    } catch (e) {
      showNotification(extractApiErrorMessage(e), 'error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const d = digitsOnly(nikInput)
    setHelpNamaSantri('')
    if (d.length < 10) {
      if (nikTimer.current) clearTimeout(nikTimer.current)
      setNikLookupStatus(d.length === 0 ? 'idle' : 'too_short')
      setNikResultSantri(null)
      setNikLookupLoading(false)
      return
    }
    if (nikTimer.current) clearTimeout(nikTimer.current)
    setNikLookupLoading(true)
    nikTimer.current = setTimeout(async () => {
      try {
        const res = await authAPI.getMeMybeddianSantriByNik(nikInput)
        const payload = res?.data
        if (!res?.success || !payload) {
          setNikLookupStatus('not_found')
          setNikResultSantri(null)
          return
        }
        const st = payload.status
        setNikLookupStatus(st === 'too_short' ? 'too_short' : st)
        setNikResultSantri(payload.santri || null)
      } catch {
        setNikLookupStatus('not_found')
        setNikResultSantri(null)
      } finally {
        setNikLookupLoading(false)
      }
    }, 380)
    return () => {
      if (nikTimer.current) clearTimeout(nikTimer.current)
    }
  }, [nikInput])

  const mybeddianUrl = getMybeddienAppUrl(data?.mybeddian_url || '')

  const helpContext = useMemo(
    () => ({
      username: user?.username || '—',
      nip: user?.nip ?? '—',
      namaPengurus: user?.nama || '—',
    }),
    [user?.username, user?.nip, user?.nama]
  )

  const canSendHelpWa = helpNamaSantri.trim().length >= 2

  const openHelpWa = () => {
    if (!canSendHelpWa) return
    const text = buildTautkanHelpMessage({
      ...helpContext,
      nik: nikInput,
      namaSantri: helpNamaSantri.trim(),
    })
    openWhatsAppHelp(text)
  }

  const onPortalToggle = async (next) => {
    if (!data) return
    setPortalSaving(true)
    try {
      const res = await authAPI.putMeMybeddianPortalSantri(next ? 1 : 0)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      setData((d) => (d ? { ...d, access_mybeddian_santri: next ? 1 : 0 } : d))
      showNotification('Pengaturan portal disimpan', 'success')
    } catch (e) {
      showNotification(extractApiErrorMessage(e), 'error')
    } finally {
      setPortalSaving(false)
    }
  }

  const submitTautkanNik = async () => {
    const nik = digitsOnly(nikInput)
    if (nik.length < 10) {
      showNotification('NIK minimal 10 digit', 'error')
      return
    }
    setLinking(true)
    try {
      const res = await authAPI.linkMeMybeddianSantri({ nik })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menautkan', 'error')
        return
      }
      showNotification(res.message || 'Santri berhasil ditautkan', 'success')
      setNikInput('')
      setNikLookupStatus('idle')
      setNikResultSantri(null)
      await load()
    } catch (e) {
      showNotification(extractApiErrorMessage(e), 'error')
    } finally {
      setLinking(false)
    }
  }

  const unlink = async (santriId) => {
    if (!window.confirm('Lepas tautan santri ini dari akun Anda?')) return
    try {
      const res = await authAPI.unlinkMeMybeddianSantri(santriId)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal melepas tautan', 'error')
        return
      }
      showNotification(res.message || 'Tautan dilepas', 'success')
      await load()
    } catch (e) {
      showNotification(extractApiErrorMessage(e), 'error')
    }
  }

  const onPotongBulanToggle = async (idSantri, tahunAjaran, idBulan, next) => {
    const sid = Number(idSantri)
    const idB = Number(idBulan)
    if (!UWABA_ID_BULAN_SET.has(idB)) {
      showNotification('Bulan UWABA tidak valid', 'error')
      return
    }
    const prev = potongBulanLocal[sid] ?? null
    setPotongBulanLocal((p) => {
      const n = { ...p }
      if (next) n[sid] = idB
      else if (n[sid] === idB) delete n[sid]
      return n
    })
    setPotongSavingKey(String(sid))
    try {
      const res = await authAPI.putMeMybeddianPotongUwabaBulan({
        id_santri: sid,
        tahun_ajaran: tahunAjaran,
        id_bulan: idB,
        aktif: next,
      })
      if (!res?.success) {
        setPotongBulanLocal((p) => {
          const n = { ...p }
          if (prev != null) n[sid] = prev
          else delete n[sid]
          return n
        })
        showNotification(res?.message || 'Gagal menyimpan potong bulan', 'error')
        return
      }
      showNotification(next ? 'Bulan potong Bisyaroh dipilih' : 'Pilihan bulan potong dibatalkan', 'success')
      await load()
    } catch (e) {
      setPotongBulanLocal((p) => {
        const n = { ...p }
        if (prev != null) n[sid] = prev
        else delete n[sid]
        return n
      })
      showNotification(extractApiErrorMessage(e), 'error')
    } finally {
      setPotongSavingKey(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="h-full flex flex-col min-h-0 bg-gray-50/80 dark:bg-gray-900/40">
        <div className="flex-1 flex items-center justify-center min-h-0 p-6">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-gray-50/80 dark:bg-gray-900/40">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 max-sm:pb-28 space-y-6 lg:space-y-8">
          <header className="space-y-1 lg:space-y-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              MyBeddien
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
              Tautkan santri (NIK), Aplikasi MyBeddien, potong Bisyaroh → UWABA.
            </p>
          </header>

          <Card
            title="Aplikasi MyBeddien"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            }
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="min-w-0">
                {mybeddianUrl ? (
                  <a
                    href={mybeddianUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors"
                  >
                    Buka MyBeddien
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-sm text-gray-500">URL aplikasi belum dikonfigurasi.</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Login sama dengan akun staff bila santri sudah tertaut.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 border-t border-gray-100 dark:border-gray-700/80 pt-4 lg:border-t-0 lg:pt-0">
                <span className="text-xs text-gray-700 dark:text-gray-300">Akses data santri di aplikasi</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!data?.access_mybeddian_santri}
                  disabled={portalSaving || !data}
                  onClick={() => onPortalToggle(!data?.access_mybeddian_santri)}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                    data?.access_mybeddian_santri ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'
                  } ${portalSaving ? 'opacity-60' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      data?.access_mybeddian_santri ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>

          <Card
            title="Santri tertaut"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Tertaut ke akun
                </p>
                {(data?.santri_list || []).length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada santri yang tertaut.</p>
                ) : (
                  <ul className="rounded-xl border border-gray-100 dark:border-gray-700/80 divide-y divide-gray-100 dark:divide-gray-700/80 max-h-[min(28rem,70vh)] overflow-y-auto">
                    {(data?.santri_list || []).map((s) => (
                        <li key={s.id} className="px-3 py-3 first:rounded-t-xl last:rounded-b-xl">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.nama}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {s.nis ? `NIS ${s.nis}` : `ID ${s.id}`}
                                {s.has_nik ? ' · ada NIK' : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => unlink(s.id)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0 self-start"
                            >
                              Lepas tautan
                            </button>
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
                            <PotongBisyarohBulanList
                              santriId={s.id}
                              uwabaRincian={s.uwaba_rincian}
                              potongBulanId={potongBulanLocal[Number(s.id)] ?? null}
                              potongSavingKey={potongSavingKey}
                              onPotongBulanToggle={onPotongBulanToggle}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="min-w-0 lg:border-l lg:border-gray-100 dark:lg:border-gray-700/80 lg:pl-8 pt-6 lg:pt-0 border-t border-gray-100 dark:border-gray-700/80 lg:border-t-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Tautkan dengan NIK
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                  Masukkan NIK santri (16 digit). Hanya digit yang dipakai untuk pencocokan. Jika tidak ditemukan atau
                  butuh bantuan admin, isi nama santri lalu hubungi WhatsApp.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nikInput}
                  onChange={(e) => setNikInput(e.target.value)}
                  placeholder="Contoh: 3201011504850001"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono tracking-wide"
                />
                {nikLookupLoading && <p className="text-xs text-gray-400 mt-2">Memeriksa NIK…</p>}
                {nikLookupStatus === 'too_short' && digitsOnly(nikInput).length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Lanjutkan mengetik — minimal 10 digit.</p>
                )}
                {nikLookupStatus === 'can_link' && nikResultSantri && (
                  <div className="mt-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{nikResultSantri.nama}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {nikResultSantri.nis ? `NIS ${nikResultSantri.nis}` : `ID ${nikResultSantri.id}`}
                    </p>
                    <button
                      type="button"
                      disabled={linking}
                      onClick={submitTautkanNik}
                      className="mt-3 w-full sm:w-auto px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                    >
                      {linking ? 'Menautkan…' : 'Tautkan ke akun saya'}
                    </button>
                  </div>
                )}
                {nikLookupStatus === 'already_linked' && nikResultSantri && (
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                    {nikResultSantri.nama} sudah tertaut ke akun Anda.
                  </p>
                )}
                {nikLookupStatus === 'other_account' && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Santri dengan NIK ini sudah tertaut ke akun lain. Hubungi admin melalui WhatsApp.
                    </p>
                    <input
                      type="text"
                      value={helpNamaSantri}
                      onChange={(e) => setHelpNamaSantri(e.target.value)}
                      placeholder="Nama santri (wajib)"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={!canSendHelpWa}
                      onClick={openHelpWa}
                      className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Hubungi admin (WhatsApp)
                    </button>
                  </div>
                )}
                {(nikLookupStatus === 'not_found' || nikLookupStatus === 'ambiguous') &&
                  !nikLookupLoading &&
                  digitsOnly(nikInput).length >= 10 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {nikLookupStatus === 'ambiguous'
                          ? 'Lebih dari satu data cocok dengan NIK ini. Minta bantuan admin.'
                          : 'NIK tidak ditemukan di data yang bisa ditautkan mandiri. Isi nama santri, lalu hubungi admin.'}
                      </p>
                      <input
                        type="text"
                        value={helpNamaSantri}
                        onChange={(e) => setHelpNamaSantri(e.target.value)}
                        placeholder="Nama santri sesuai dokumen (wajib)"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={!canSendHelpWa}
                        onClick={openHelpWa}
                        className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Hubungi 0822-3299-9921 (WhatsApp)
                      </button>
                    </div>
                  )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
