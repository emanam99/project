import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { deepseekAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useChatAiFiturAccess } from '../../hooks/useChatAiFiturAccess'

/** Selaras backend AiWaInstansiSettingsService::WA_GLOBAL_HARIAN_MAX */
const WA_GLOBAL_LIMIT_MAX = 4294967295

function parseGlobalLimitFromServer(v) {
  const gl = Number(v)
  if (!Number.isFinite(gl) || gl < 0) return 10
  return Math.min(WA_GLOBAL_LIMIT_MAX, Math.floor(gl))
}

function clampGlobalLimitInput(n) {
  const x = parseInt(String(n).trim(), 10)
  if (!Number.isFinite(x) || x < 0) return 0
  return Math.min(WA_GLOBAL_LIMIT_MAX, x)
}

function SwitchToggle({ checked, onChange, disabled, label, compact = false, toggleFirst = false }) {
  const labelEl = (
    <span
      className={
        compact
          ? 'select-none text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400'
          : 'select-none text-xs font-medium text-gray-600 dark:text-gray-400'
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
      className={`inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
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
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-2.5'}`}>
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
 * Tab Pengaturan Chat AI — master WA, terima semua pengirim, mode obrolan, akses WA per akun, daftar kontak.
 */
export default function ChatAiPengaturanPage() {
  const { showNotification } = useNotification()
  const { modeAlternatif: canUseAlternativeMode } = useChatAiFiturAccess()

  const [loading, setLoading] = useState(true)
  const [instansiBusy, setInstansiBusy] = useState(false)
  const [aiWaAktif, setAiWaAktif] = useState(true)
  const [terimaSemua, setTerimaSemua] = useState(false)
  const [kuotaUsersId, setKuotaUsersId] = useState(null)
  const [globalDailyLimit, setGlobalDailyLimit] = useState(10)
  const [contacts, setContacts] = useState([])

  const [aiChatMode, setAiChatMode] = useState('api')
  const [modeBusy, setModeBusy] = useState(false)

  const loadInstansi = useCallback(async () => {
    const res = await deepseekAPI.getWaInstansiSettings()
    if (res?.success && res.data) {
      setAiWaAktif(!!res.data.ai_wa_aktif)
      setTerimaSemua(!!res.data.terima_semua_pengirim)
      setKuotaUsersId(res.data.kuota_users_id ?? null)
      setGlobalDailyLimit(parseGlobalLimitFromServer(res.data.wa_global_harian_per_pengirim))
      setContacts(Array.isArray(res.data.contacts) ? res.data.contacts : [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [acc, inst] = await Promise.all([
          deepseekAPI.getAccount(),
          deepseekAPI.getWaInstansiSettings().catch(() => ({ success: false })),
        ])
        if (cancelled) return
        if (acc?.success && acc.data) {
          const m = acc.data.ai_chat_mode === 'proxy' ? 'proxy' : 'api'
          setAiChatMode(m)
        }
        if (inst?.success && inst.data) {
          setAiWaAktif(!!inst.data.ai_wa_aktif)
          setTerimaSemua(!!inst.data.terima_semua_pengirim)
          setKuotaUsersId(inst.data.kuota_users_id ?? null)
          setGlobalDailyLimit(parseGlobalLimitFromServer(inst.data.wa_global_harian_per_pengirim))
          setContacts(Array.isArray(inst.data.contacts) ? inst.data.contacts : [])
        }
      } catch {
        if (!cancelled) showNotification('Gagal memuat pengaturan.', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showNotification])

  const persistInstansi = async (nextAiWa, nextTerima) => {
    setInstansiBusy(true)
    try {
      const lim = clampGlobalLimitInput(globalDailyLimit)
      const res = await deepseekAPI.putWaInstansiSettings({
        ai_wa_aktif: nextAiWa,
        terima_semua_pengirim: nextTerima,
        wa_global_harian_per_pengirim: lim,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan pengaturan WA instansi.', 'error')
        await loadInstansi()
        return
      }
      setAiWaAktif(!!res.data?.ai_wa_aktif)
      setTerimaSemua(!!res.data?.terima_semua_pengirim)
      setKuotaUsersId(res.data?.kuota_users_id ?? null)
      setGlobalDailyLimit(parseGlobalLimitFromServer(res.data?.wa_global_harian_per_pengirim))
      setContacts(Array.isArray(res.data?.contacts) ? res.data.contacts : [])
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan.', 'error')
      await loadInstansi()
    } finally {
      setInstansiBusy(false)
    }
  }

  const handleToggleMaster = async (on) => {
    if (instansiBusy) return
    await persistInstansi(on, terimaSemua)
  }

  const handleToggleTerimaSemua = async (on) => {
    if (instansiBusy) return
    await persistInstansi(aiWaAktif, on)
  }

  const saveGlobalLimitOnly = async () => {
    if (instansiBusy) return
    setInstansiBusy(true)
    try {
      const lim = clampGlobalLimitInput(globalDailyLimit)
      setGlobalDailyLimit(lim)
      const res = await deepseekAPI.putWaInstansiSettings({
        ai_wa_aktif: aiWaAktif,
        terima_semua_pengirim: terimaSemua,
        wa_global_harian_per_pengirim: lim,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan limit.', 'error')
        await loadInstansi()
        return
      }
      setGlobalDailyLimit(parseGlobalLimitFromServer(res.data?.wa_global_harian_per_pengirim))
      showNotification('Limit harian per pengunjung disimpan.', 'success')
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan.', 'error')
      await loadInstansi()
    } finally {
      setInstansiBusy(false)
    }
  }

  const handleChatMode = async (mode) => {
    if (modeBusy || mode === aiChatMode) return
    if (!canUseAlternativeMode && mode === 'proxy') {
      showNotification('Mode alternatif tidak diizinkan untuk akun Anda.', 'warning')
      return
    }
    setModeBusy(true)
    try {
      const res = await deepseekAPI.putChatModePreference(mode)
      if (res?.success) {
        setAiChatMode(mode)
        showNotification('Preferensi mode obrolan disimpan.', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan mode.', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan mode.', 'error')
    } finally {
      setModeBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Memuat pengaturan…</p>
      </div>
    )
  }

  const btnOn =
    'font-semibold text-white shadow-sm bg-primary-600 dark:bg-primary-500 border border-transparent'
  const btnOff =
    'font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 border border-transparent'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 chat-scrollbar overscroll-contain">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-3xl space-y-6 pb-10"
      >
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pengaturan Chat AI</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Master WhatsApp, pengunjung tak terdaftar, mode obrolan web, dan akses WA untuk akun Anda.
          </p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mode obrolan (tab Obrolan)</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Utama memakai API server + bank Q&amp;A lembaga. Alternatif memakai proxy (hanya jika role Anda mengizinkan).
          </p>
          <div className="mt-3 flex w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/50 p-0.5">
            <button
              type="button"
              disabled={modeBusy}
              onClick={() => handleChatMode('api')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm ${aiChatMode === 'api' ? btnOn : btnOff}`}
            >
              Utama
            </button>
            <button
              type="button"
              disabled={modeBusy || !canUseAlternativeMode}
              onClick={() => handleChatMode('proxy')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm ${aiChatMode === 'proxy' ? btnOn : btnOff}`}
            >
              Alternatif
            </button>
          </div>
          {!canUseAlternativeMode ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Mode alternatif tidak tersedia untuk peran Anda.</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI WhatsApp (instansi)</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Matikan master untuk menghentikan semua balasan AI lewat WhatsApp. AI hanya membalas chat privat (bukan grup, status, newsletter,
            atau broadcast). Saat master aktif, server mencoba menjaga koneksi WA Node tetap bangun (throttle). Aktifkan &quot;terima semua
            pengirim&quot; agar siapa pun yang chat privat ke nomor lembaga mendapat balasan, tanpa akun eBeddien. Nomor tersimpan terpisah
            dari JID.
          </p>
          <div className="mt-4 space-y-4">
            <SwitchToggle
              toggleFirst
              compact
              label="AI WhatsApp aktif (master)"
              checked={aiWaAktif}
              disabled={instansiBusy}
              onChange={handleToggleMaster}
            />
            <SwitchToggle
              toggleFirst
              compact
              label="Balas semua pengirim (tanpa akun eBeddien)"
              checked={terimaSemua}
              disabled={instansiBusy || !aiWaAktif}
              onChange={handleToggleTerimaSemua}
            />
            <div className="rounded-lg border border-gray-200/90 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Limit harian per pengunjung (bukan gabungan semua)</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Untuk mode &quot;terima semua&quot;: setiap pengunjung punya ember sendiri. Jika chat memakai{' '}
                <strong className="text-gray-700 dark:text-gray-200">nomor</strong> (@s.whatsapp.net), limit mengikuti nomor kanonik; jika
                hanya <strong className="text-gray-700 dark:text-gray-200">JID @lid</strong>, limit mengikuti JID itu. Angka{' '}
                <strong className="text-gray-700 dark:text-gray-200">0</strong> mematikan balasan AI untuk pengunjung global.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={WA_GLOBAL_LIMIT_MAX}
                  value={globalDailyLimit}
                  disabled={instansiBusy}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      setGlobalDailyLimit(0)
                      return
                    }
                    const v = parseInt(raw, 10)
                    if (!Number.isNaN(v)) setGlobalDailyLimit(Math.min(WA_GLOBAL_LIMIT_MAX, Math.max(0, v)))
                  }}
                  className="min-w-[7rem] max-w-[11rem] flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
                <button
                  type="button"
                  disabled={instansiBusy}
                  onClick={() => saveGlobalLimitOnly()}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-500"
                >
                  Simpan limit
                </button>
              </div>
            </div>
            {terimaSemua && aiWaAktif ? (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Kuota pemakaian dicatat pada akun yang mengaktifkan opsi ini (users id: {kuotaUsersId ?? '—'}).
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kontak obrolan WA</h2>
            <button
              type="button"
              onClick={() => loadInstansi()}
              className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Muat ulang
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Kolom JID hanya untuk identitas WhatsApp; kolom nomor hanya diisi jika bisa diambil dari @s.whatsapp.net (bukan untuk @lid).
          </p>
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/95">
                <tr>
                  <th className="px-2 py-2 font-medium text-gray-600 dark:text-gray-300">JID</th>
                  <th className="px-2 py-2 font-medium text-gray-600 dark:text-gray-300">Nomor</th>
                  <th className="px-2 py-2 font-medium text-gray-600 dark:text-gray-300">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-gray-500 dark:text-gray-400">
                      Belum ada kontak tercatat.
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => (
                    <tr key={c.wa_jid} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="max-w-[200px] truncate px-2 py-2 font-mono text-gray-800 dark:text-gray-200" title={c.wa_jid}>
                        {c.wa_jid}
                      </td>
                      <td className="px-2 py-2 font-mono text-gray-700 dark:text-gray-300">{c.phone_normalized || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-600 dark:text-gray-400">{c.last_seen_at || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </motion.div>
    </div>
  )
}
