import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { deepseekAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useChatAiFiturAccess } from '../../../hooks/useChatAiFiturAccess'
import {
  getStoredDeepseekToken,
  getStoredDeepseekSessionId,
  getStoredDeepseekParentMessageId,
  setDeepseekAuth,
  clearDeepseekAuth,
  setDeepseekParentMessageId,
  deepseekProxyCreateSession,
  deepseekProxyChat
} from '../../../services/deepseekClient'
import { logNewlineDebug } from '../../../utils/newlineDebug'
import { dispatchChatAiUsageHeaderUpdate } from '../../../utils/chatAiHeaderUsage'
import { buildAssistantMessageRows, splitAiReplyForBubbles } from '../../../utils/aiReplySplit'
import { useNotification } from '../../../contexts/NotificationContext'
import EbeddienChatConversationStarterToolbar from './EbeddienChatConversationStarterToolbar'

function msgId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

/** Pesan limit harian dari API PHP (GET account / 429 api-chat). */
function isAiDailyLimitMessage(text) {
  const s = String(text || '').toLowerCase()
  return s.includes('limit akses ai') || s.includes('mencapai limit akses')
}

const ASSISTANT_NAME = 'eBeddien'

/** Satu sesi chat utama (mode API) — selaras dengan backend DeepseekController::EBEDDIEN_MAIN_SESSION_ID */
const EBEDDIEN_MAIN_SESSION_ID = 'ebeddien-main'

const CHAT_API_PROVIDER_STORAGE_KEY = 'ebeddien_chat_api_provider'
const CHAT_GEMINI_MODEL_STORAGE_KEY = 'ebeddien_chat_gemini_model'
/** Default selaras DeepseekController + model Flash-Lite generasi 2.5 (2.0 Flash-Lite deprecated). */
const DEFAULT_GEMINI_MODEL_ID = 'gemini-2.5-flash-lite'

/** Panel "Mulai percakapan" + saran: hanya jika belum ada pesan atau aktivitas terakhir > 24 jam. */
const STARTER_HIDE_WITHIN_MS = 24 * 60 * 60 * 1000

function shouldShowConversationStarter(messageList) {
  if (!Array.isArray(messageList) || messageList.length === 0) return true
  const times = messageList
    .map((m) => (m?.createdAt ? new Date(m.createdAt).getTime() : null))
    .filter((t) => t != null && Number.isFinite(t))
  if (times.length === 0) return false
  const last = Math.max(...times)
  return Date.now() - last > STARTER_HIDE_WITHIN_MS
}

/** Obrolan pengetahuan umum — pakai jalur chat API, bukan agen. */
function userMessageSuggestsGeneralChatOnly(rawText) {
  const t = String(rawText || '').trim().toLowerCase()
  if (!t) return false
  if (/\b(buat|bikin|draft|rencana\s+pengeluaran|pengeluaran|simpan|ajukan|input|usulkan)\b/.test(t)) return false
  return (
    /^(hai|halo|hello|hi\b|terima\s+kasih|thanks|makasih|okee|oke)\b/.test(t) ||
    /^(apa\s+itu|apa\s+yang\s+dimaksud|jelaskan|definisi|maksudnya|ceritakan\s+tentang|bagaimana\s+cara\s+(kerja|menggunakan|membaca)|kenapa\b|mengapa\b|siapa\b|kapan\b|di\s+mana)\b/.test(
      t
    ) ||
    /\b(apa\s+itu|jelaskan|pengertian|definisi)\s+/.test(t) ||
    /^(saya\s+)?(cuma|hanya)\s+(nanya|tanya|bertanya)\b/.test(t)
  )
}

/**
 * Apakah teks/lampiran ini condong ke jalur agen (otomasi + tool server)?
 * Hanya dipakai jika pengguna punya hak agen.
 */
function userMessageSuggestsAgentIntent(rawText, hasAttachments) {
  if (hasAttachments) return true
  const t = String(rawText || '').trim().toLowerCase()
  if (!t) return false
  if (userMessageSuggestsGeneralChatOnly(t)) return false

  const strongAction =
    /\b(tolong|mohon|silakan|bantu|bantu\s+buat|buatkan|buatin|bikin|inputkan|catatkan|simpan|ajukan|tambahkan|usulkan|lengkapi|isi\s+data|isi\s+rencana|perbarui\s+rencana|revisi|perbaiki|sisipkan|hapus\s+item|tambah\s+item|setujui|tolak\s+rencana|hapus\s+draft|konfirmasi\s+(aksi|perubahan|penyimpanan))\b/.test(
      t
    )
  const rencanaCtx =
    /\b(rencana\s+pengeluaran|draft\s+pengeluaran|pengadaan|anggaran(\s+belanja)?|rab\b|realisasi\s+pengeluaran|item\s+pengeluaran|rincian\s+pengeluaran|kwitansi|nota\s+belanja|daftar\s+belanja|pengeluaran\s+rutin)\b/.test(
      t
    )
  if (strongAction && rencanaCtx) return true
  if (/\b(buat|bikin|buatkan|buatin)\b\s*.{0,48}\b(rencana|draft|pengeluaran)\b/.test(t)) return true
  if (/\bbuatkan\s+rencana|rencana\s+baru|draft\s+baru|simpan\s+sebagai\s+draft|ajukan\s+pending\b/.test(t)) return true

  if (
    /\b(kirim|jangan\s+kirim|tanpa|matikan)\b\s*.{0,16}(notif|notifikasi).{0,20}draft\b|\bnotifikasi\s+draft\b|\bkirim_notifikasi\b/.test(t)
  ) {
    return true
  }
  if (
    /\b(oke|okay|ya|sip|yoi|gas|lanjut)\b\s*[,]?\s*(simpan|proses|eksekusi|kirim|ajukan)\b|\b(silakan|tolong)\s+(simpan|proses|eksekusi|lanjut)\b|\bproses\s+(sekarang|langsung)\b/.test(
      t
    )
  ) {
    return true
  }
  if (
    /\b(buat|input|ambil|baca)\b\s*.{0,40}\b(dari\s+)?(lampiran|gambar|foto|scan|excel|spreadsheet|pdf|csv|word)\b/.test(t)
  ) {
    return true
  }
  if (
    t.length <= 120 &&
    /\b(\d{1,7})\s*[x×]\s*(rp\.?\s?)?[\d.,]+|rp\.?\s*[\d.,]+\s*(\/|per)\s*(unit|pcs|buah|orang|siswa)|subtotal|total\s+belanja\b/i.test(
      t
    ) &&
    /\b(item|barang|qty|jumlah|harga|lembaga|kategori)\b/.test(t)
  ) {
    return true
  }

  if (
    /\b(ubah|ganti|update|perbarui)\b\s*.{0,24}\b(profil|email|username|foto\s+profil|whatsapp|no\.?\s*wa)\b/.test(t)
  ) {
    return true
  }
  if (
    /\b(pakai|gunakan|aktifkan|buka|pindah)\b\s*.{0,28}\b(mode\s+)?(proxy|alternatif)\b|\bganti\s+ke\s+proxy\b/.test(t)
  ) {
    return true
  }
  if (
    /\b(nonaktifkan|matikan)\s+proxy|\bmode\s+api\b|\bkembali\s+ke\s+mode\s+(api|normal|bawaan|utama)\b/.test(t)
  ) {
    return true
  }
  if (
    /\b(eksekusi|jalankan\s+tool|usulkan\s+aksi|lanjutkan\s+(simpan|ajukan|draft)|otorisasi\s+perubahan|setuju\s+eksekusi)\b/.test(
      t
    )
  ) {
    return true
  }
  /* Balasan singkat berisi rincian lembaga/kategori (melanjutkan isian rencana). */
  if (
    t.length <= 180 &&
    /\b(uwaba|diniyah|formal|madin|asrama|kategori|pengadaan|perlengkapan|atk|seragam|gedung|inventaris|sumber\s+dana|tahun\s+ajaran)\b/.test(
      t
    ) &&
    (/\b(dan|,)\b/.test(t) || /\d/.test(t))
  ) {
    return true
  }
  return false
}

function mapServerHistoryToMessages(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    const role = row?.role
    if (role !== 'user' && role !== 'assistant') return []
    const id = typeof row?.id === 'string' && row.id ? row.id : msgId()
    const content = typeof row?.content === 'string' ? row.content : ''
    const createdAt =
      typeof row?.created_at === 'string' && row.created_at.trim() !== '' ? row.created_at.trim() : null
    const timeFields = createdAt ? { createdAt } : {}
    if (role === 'assistant') {
      const bubbles = splitAiReplyForBubbles(content)
      if (bubbles.length <= 1) {
        return [
          {
            id,
            role: 'assistant',
            content,
            ...(row?.thinking ? { thinking: row.thinking } : {}),
            ...timeFields
          }
        ]
      }
      return bubbles.map((part, i) => ({
        id: i === 0 ? id : msgId(),
        role: 'assistant',
        content: part,
        ...(i === 0 && row?.thinking ? { thinking: row.thinking } : {}),
        ...timeFields
      }))
    }
    return [{ id, role: 'user', content, ...timeFields }]
  })
}

/** Maks. 3 pertanyaan unik dari Bank Q&A saja — tanpa cadangan generik dari Training Chat atau teks statis. */
function normalizeBankSuggestedPrompts(fromApi, max = 3) {
  const out = []
  const seen = new Set()
  for (const t of fromApi || []) {
    const s = typeof t === 'string' ? t.trim() : ''
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

const CHAT_FONT_STORAGE_KEY = 'ebeddien_chat_font_scale'

/**
 * sm | md | lg — ukuran isi chat (user + markdown assistant).
 * Catatan: project ini tidak memakai @tailwindcss/typography, jadi kelas prose-p:/prose-sm tidak ada di build.
 * Ukuran balasan AI diatur lewat text-xs|sm|lg pada pembungkus .prose (warisan + em di index.css untuk heading).
 */
function getChatFontClasses(scale) {
  const proseBase =
    'prose max-w-none text-gray-800 dark:text-gray-100 [&_p]:my-2 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:rounded-lg [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-900'
  const templateBtnCommon =
    'text-left w-full min-w-0 sm:min-w-[14rem] sm:max-w-[20rem] rounded-xl border border-primary-200 dark:border-primary-800/50 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:bg-primary-50/80 dark:hover:bg-primary-900/30 disabled:opacity-50 transition-colors line-clamp-2'
  const skeletonCommon =
    'w-full min-w-0 sm:min-w-[14rem] sm:max-w-[20rem] rounded-xl border border-primary-200/50 dark:border-primary-900/40 bg-gray-100 dark:bg-gray-800/80 animate-pulse'
  switch (scale) {
    case 'sm':
      return {
        user: 'text-xs leading-relaxed',
        assistantName: 'text-[10px]',
        prose: `${proseBase} text-xs leading-relaxed [&_pre]:text-[11px] [&_code]:text-[11px]`,
        thinking: 'text-[11px]',
        typing: 'text-xs',
        starter: {
          title: 'text-sm font-medium text-gray-800 dark:text-gray-100',
          description: 'text-xs mt-2 max-w-md mx-auto text-gray-500 dark:text-gray-400',
          templateBtn: `${templateBtnCommon} text-xs px-2.5 py-2`,
          skeleton: `${skeletonCommon} h-11`,
          toolbarRoot: 'mb-5 p-3 space-y-3',
          toolbarLabel: 'mb-1.5 text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
          toolbarHint: 'text-[11px] leading-snug text-gray-600 dark:text-gray-400',
          toolbarBtn: 'flex-1 rounded-lg py-1.5 text-[11px]',
          sectionWhenEmpty: 'py-5 sm:py-8',
          sectionWhenHistory: 'mt-6 border-t border-gray-200/90 pt-6 dark:border-gray-700/80',
          templateGap: 'mt-5 gap-1.5'
        }
      }
    case 'lg':
      return {
        user: 'text-lg leading-relaxed',
        assistantName: 'text-sm',
        prose: `${proseBase} text-lg leading-relaxed [&_pre]:text-base [&_code]:text-[0.9em]`,
        thinking: 'text-sm',
        typing: 'text-base',
        starter: {
          title: 'text-lg sm:text-xl font-medium text-gray-800 dark:text-gray-100',
          description: 'text-base mt-2 max-w-md mx-auto text-gray-500 dark:text-gray-400',
          templateBtn: `${templateBtnCommon} text-sm sm:text-base px-4 py-3`,
          skeleton: `${skeletonCommon} min-h-[4.25rem]`,
          toolbarRoot: 'mb-6 p-5 space-y-5',
          toolbarLabel: 'mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
          toolbarHint: 'text-sm leading-snug text-gray-600 dark:text-gray-400',
          toolbarBtn: 'flex-1 rounded-lg py-2.5 text-sm',
          sectionWhenEmpty: 'py-8 sm:py-12',
          sectionWhenHistory: 'mt-6 border-t border-gray-200/90 pt-10 dark:border-gray-700/80',
          templateGap: 'mt-7 gap-3'
        }
      }
    default:
      return {
        user: 'text-sm leading-relaxed',
        assistantName: 'text-xs',
        prose: `${proseBase} text-sm leading-relaxed [&_pre]:text-sm [&_code]:text-[0.875em]`,
        thinking: 'text-xs',
        typing: 'text-sm',
        starter: {
          title: 'text-base sm:text-lg font-medium text-gray-800 dark:text-gray-100',
          description: 'text-sm mt-2 max-w-md mx-auto text-gray-500 dark:text-gray-400',
          templateBtn: `${templateBtnCommon} text-xs sm:text-sm px-3 py-2.5`,
          skeleton: `${skeletonCommon} h-14`,
          toolbarRoot: 'mb-6 p-4 space-y-4',
          toolbarLabel: 'mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
          toolbarHint: 'text-xs leading-snug text-gray-600 dark:text-gray-400',
          toolbarBtn: 'flex-1 rounded-lg py-2 text-xs',
          sectionWhenEmpty: 'py-6 sm:py-10',
          sectionWhenHistory: 'mt-6 border-t border-gray-200/90 pt-8 dark:border-gray-700/80',
          templateGap: 'mt-6 gap-2'
        }
      }
  }
}

function SendIconButton({ disabled, busy, title = 'Kirim' }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      title={title}
      aria-label={title}
      className="group inline-flex h-[2.75rem] min-h-[2.75rem] w-[2.75rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-sm ring-1 ring-inset ring-white/15 transition hover:from-primary-500 hover:to-primary-600 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none disabled:active:scale-100 dark:from-primary-700 dark:to-primary-800 dark:ring-white/10"
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/90 border-t-transparent" aria-hidden />
      ) : (
        <svg
          className="h-[1.15rem] w-[1.15rem] translate-x-px translate-y-px text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22 11 13 2 9 22 2z" />
        </svg>
      )}
    </button>
  )
}

/** Toggle modern untuk opsi boolean — `toggleFirst`: switch di kiri, label di kanan. */
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

function AvatarAI() {
  return (
    <div
      className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-md"
      aria-hidden
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    </div>
  )
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function BubbleUser({ text, imageUrls = [], fontClass = 'text-sm' }) {
  const hasText = typeof text === 'string' && text.trim() !== ''
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-primary-600 to-primary-700 px-4 py-2.5 text-white shadow-md">
        {Array.isArray(imageUrls) && imageUrls.length > 0 ? (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {imageUrls.map((url, i) => (
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="max-h-32 max-w-[8rem] rounded-lg border border-white/25 object-cover"
              />
            ))}
          </div>
        ) : null}
        {hasText ? <p className={`${fontClass} whitespace-pre-wrap break-words`}>{text}</p> : null}
        {!hasText && (!imageUrls || imageUrls.length === 0) ? (
          <p className={`${fontClass} whitespace-pre-wrap break-words opacity-90`}>_(kosong)_</p>
        ) : null}
      </div>
    </div>
  )
}

/** Normalisasi newline; satu \n ditampilkan sebagai baris baru lewat remark-breaks (bukan hanya paragraf \n\n). */
function normalizeAssistantMarkdown(s) {
  if (typeof s !== 'string' || !s) return s
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function BubbleAssistant({
  text,
  thinking,
  assistantName = ASSISTANT_NAME,
  nameClass = 'text-xs',
  proseClass = 'prose-sm',
  thinkingClass = 'text-xs'
}) {
  const mdBody = normalizeAssistantMarkdown(text || '')
  return (
    <div className="flex justify-start gap-2 sm:gap-3 items-start">
      <AvatarAI />
      <div className="max-w-[min(100%,32rem)] rounded-2xl rounded-bl-md border border-gray-200/90 bg-white px-4 py-3 shadow-md dark:border-gray-600 dark:bg-gray-800/95">
        <p className={`${nameClass} mb-2 font-semibold text-primary-600 dark:text-primary-400`}>{assistantName}</p>
        {thinking ? (
          <details
            className={`mb-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-2.5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-300/90 ${thinkingClass}`}
          >
            <summary className="cursor-pointer select-none font-medium">Rangkaian berpikir</summary>
            <pre className={`mt-2 whitespace-pre-wrap break-words font-sans opacity-90 ${thinkingClass}`}>{thinking}</pre>
          </details>
        ) : null}
        <div className={proseClass}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{mdBody || '_(kosong)_'}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

/** Kartu konfirmasi usulan agen — tidak mempercayai argumen dari klien; eksekusi lewat API setelah konfirmasi. */
function AgentProposalCard({ intro, job, nameClass, proseClass, canConfirmWrite, onRefreshUsage }) {
  const { showNotification } = useNotification()
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('pending')
  const [rollbackUntil, setRollbackUntil] = useState(null)

  const fmtShort = (iso) => {
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return String(iso || '')
      return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return String(iso || '')
    }
  }

  const expiredConfirm =
    phase === 'pending' && job?.expires_at && new Date(job.expires_at).getTime() < Date.now()
  const canRollback =
    phase === 'confirmed' && rollbackUntil && new Date(rollbackUntil).getTime() > Date.now()

  const onConfirm = async () => {
    if (!canConfirmWrite) {
      showNotification('Akun Anda tidak punya izin konfirmasi tulis agen.', 'warning')
      return
    }
    setBusy(true)
    try {
      const res = await deepseekAPI.agentConfirm({
        job_id: job.id,
        confirm_token: job.confirm_token
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengonfirmasi', 'error')
        return
      }
      setPhase('confirmed')
      setRollbackUntil(res.data?.rollback_until || null)
      showNotification(res.message || 'Perubahan diterapkan', 'success')
      void onRefreshUsage?.()
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal mengonfirmasi', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDiscard = async () => {
    setBusy(true)
    try {
      const res = await deepseekAPI.agentDiscard({
        job_id: job.id,
        confirm_token: job.confirm_token
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal membatalkan', 'error')
        return
      }
      setPhase('discarded')
      showNotification('Usulan dibatalkan', 'info')
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal membatalkan', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onRollback = async () => {
    setBusy(true)
    try {
      const res = await deepseekAPI.agentRollback({ job_id: job.id })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal rollback', 'error')
        return
      }
      setPhase('rolled_back')
      showNotification(res.message || 'Perubahan dibatalkan (rollback)', 'success')
      void onRefreshUsage?.()
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal rollback', 'error')
    } finally {
      setBusy(false)
    }
  }

  const introMd = normalizeAssistantMarkdown(intro || '')

  return (
    <div className="flex justify-start gap-2 sm:gap-3 items-start">
      <AvatarAI />
      <div className="max-w-[min(100%,32rem)] rounded-2xl rounded-bl-md border border-amber-300/80 bg-amber-50 px-4 py-3 shadow-md dark:border-amber-800/60 dark:bg-amber-950/40">
        <p className={`${nameClass} mb-2 font-semibold text-primary-700 dark:text-primary-400`}>
          {ASSISTANT_NAME} · usulan aksi
        </p>
        {introMd ? (
          <div className={`${proseClass} mb-3 text-gray-800 dark:text-gray-100`}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{introMd}</ReactMarkdown>
          </div>
        ) : null}
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Ringkasan perubahan</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-2">{job.summary}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Konfirmasi hingga {fmtShort(job.expires_at)}
          {!canConfirmWrite ? ' · Izin “Konfirmasi tulis agen” tidak aktif untuk akun ini.' : ''}
          {expiredConfirm ? ' · Kedaluwarsa — tolak dan kirim permintaan baru.' : ''}
        </p>
        {phase === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || expiredConfirm}
              onClick={onConfirm}
              className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Konfirmasi
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDiscard}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700/50"
            >
              Tolak
            </button>
          </div>
        ) : null}
        {phase === 'confirmed' ? (
          <div className="space-y-2">
            <p className="text-sm text-emerald-800 dark:text-emerald-200/90">Perubahan sudah diterapkan.</p>
            {canRollback ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRollback}
                className="rounded-xl border border-amber-600/70 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-900 dark:text-amber-100 dark:hover:bg-gray-800"
              >
                Batalkan perubahan (rollback hingga {fmtShort(rollbackUntil)})
              </button>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">Jendela rollback sudah berakhir.</p>
            )}
          </div>
        ) : null}
        {phase === 'discarded' ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Usulan ditolak — tidak ada perubahan data.</p>
        ) : null}
        {phase === 'rolled_back' ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Data dikembalikan seperti sebelum konfirmasi.</p>
        ) : null}
      </div>
    </div>
  )
}

function TypingIndicator({ nameClass = 'text-xs', statusClass = 'text-xs' }) {
  return (
    <div className="flex justify-start gap-2 sm:gap-3 items-start">
      <AvatarAI />
      <div className="rounded-2xl rounded-bl-md bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-600 px-4 py-3 shadow-sm">
        <p className={`${nameClass} font-semibold text-primary-600 dark:text-primary-400 mb-2`}>{ASSISTANT_NAME}</p>
        <div className="flex items-center gap-1.5" aria-live="polite" aria-label={`${ASSISTANT_NAME} sedang menulis`}>
          <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:300ms]" />
        </div>
        <p className={`${statusClass} text-gray-500 dark:text-gray-400 mt-2`}>{ASSISTANT_NAME} sedang memproses…</p>
      </div>
    </div>
  )
}

export default function DeepseekChat({ variant = 'page', onRequestClose, hostPageContext } = {}) {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const chatAi = useChatAiFiturAccess()
  const canUseAlternativeMode = chatAi.modeAlternatif
  const canManualProviderSelect = chatAi.selectProviderManual

  /** Konteks halaman saat panel dibuka dari header — dikirim ke API sebagai navigation_context. */
  const navigationContextPayload = useMemo(() => {
    if (!hostPageContext || typeof hostPageContext !== 'object') return undefined
    const pathname = typeof hostPageContext.pathname === 'string' ? hostPageContext.pathname.trim() : ''
    if (!pathname) return undefined
    const search = typeof hostPageContext.search === 'string' ? hostPageContext.search.slice(0, 512) : ''
    const menuLabel =
      hostPageContext.menu_label != null ? String(hostPageContext.menu_label).trim().slice(0, 200) : ''
    const headerGroup =
      hostPageContext.header_group != null ? String(hostPageContext.header_group).trim().slice(0, 120) : ''
    const src = hostPageContext.source === 'page' ? 'page' : 'header_offcanvas'
    return {
      source: src,
      pathname: pathname.replace(/\/+$/, '') || '/',
      search,
      ...(menuLabel !== '' ? { menu_label: menuLabel } : {}),
      ...(headerGroup !== '' ? { header_group: headerGroup } : {}),
      panel_pinned: !!hostPageContext.panel_pinned,
    }
  }, [hostPageContext])

  const [accountEmail, setAccountEmail] = useState(null)
  const [accountLoading, setAccountLoading] = useState(true)
  const [accountError, setAccountError] = useState(null)

  const [dsToken, setDsToken] = useState(() => getStoredDeepseekToken())
  const [sessionId, setSessionId] = useState(() => getStoredDeepseekSessionId())
  const [sessionBusy, setSessionBusy] = useState(false)

  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState(null)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [searchEnabled, setSearchEnabled] = useState(false)
  const [aiFeatureEnabled, setAiFeatureEnabled] = useState(true)

  /** Mode utama = API server + training (default); alternatif = proxy (hanya super admin). */
  const [aiChatMode, setAiChatMode] = useState('api')
  const [aiAgentCanUse, setAiAgentCanUse] = useState(false)
  const [aiAgentCanConfirm, setAiAgentCanConfirm] = useState(false)
  /** Setelah giliran agen sukses: balasan singkat user tetap ke agen kecuali terdeteksi obrolan umum. */
  const preferAgentContinuesRef = useRef(false)
  const [apiOfficialMessages, setApiOfficialMessages] = useState([])
  const [apiOfficialInput, setApiOfficialInput] = useState('')
  const [apiOfficialModel, setApiOfficialModel] = useState('deepseek-chat')
  /** deepseek | gemini — Gemini butuh GEMINI_API_KEY di server. */
  const [apiOfficialProvider, setApiOfficialProvider] = useState(() => {
    try {
      const v = localStorage.getItem(CHAT_API_PROVIDER_STORAGE_KEY)
      return v === 'gemini' ? 'gemini' : 'deepseek'
    } catch {
      return 'deepseek'
    }
  })
  const [apiOfficialGeminiModel, setApiOfficialGeminiModel] = useState(() => {
    try {
      const v = localStorage.getItem(CHAT_GEMINI_MODEL_STORAGE_KEY)
      if (typeof v === 'string' && /^gemini-[a-zA-Z0-9._-]+$/.test(v)) return v
    } catch {
      /* noop */
    }
    return DEFAULT_GEMINI_MODEL_ID
  })
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  /** Dari GET /deepseek/account — hanya model yang ListModels + generateContent izinkan untuk API key server. */
  const [geminiModelOptions, setGeminiModelOptions] = useState([])
  const [geminiModelsError, setGeminiModelsError] = useState(null)
  /** Baris untuk select: dari ListModels; jika kosong/gagal, satu baris fallback agar kirim tetap bisa (server longgarkan validasi). */
  const geminiSelectRows = useMemo(() => {
    if (Array.isArray(geminiModelOptions) && geminiModelOptions.length > 0) {
      return geminiModelOptions
    }
    if (!geminiConfigured) {
      return []
    }
    const saved = apiOfficialGeminiModel
    const id =
      typeof saved === 'string' && /^gemini-[a-zA-Z0-9._-]+$/.test(saved) ? saved : DEFAULT_GEMINI_MODEL_ID
    const hint = geminiModelsError
      ? ' — ListModels gagal; kirim memakai model tersimpan (validasi longgar di server)'
      : ' — muat ulang halaman untuk memuat daftar model'
    return [{ id, label: `${id}${hint}` }]
  }, [geminiModelOptions, geminiConfigured, geminiModelsError, apiOfficialGeminiModel])
  /** Lampiran Gemini/agen (gambar + dokumen) untuk analisis data. */
  const GEMINI_ATTACH_MAX_FILES = 6
  const GEMINI_ATTACH_MAX_BYTES = 6 * 1024 * 1024
  const GEMINI_DOC_MIME_ALLOW = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ])
  const [geminiFileAttachments, setGeminiFileAttachments] = useState([])
  const geminiFileInputRef = useRef(null)
  const [apiOfficialBusy, setApiOfficialBusy] = useState(false)
  /** Setelah GET /deepseek/chat-history selesai (mode API) — baru render area obrolan + saran cepat. */
  const [apiHistoryFetched, setApiHistoryFetched] = useState(false)
  const [proxyHistoryFetched, setProxyHistoryFetched] = useState(false)
  /** Tiga saran dari data training (server); tetap ditampilkan di bawah riwayat. */
  const [suggestedPrompts, setSuggestedPrompts] = useState([])
  const [suggestedPromptsLoading, setSuggestedPromptsLoading] = useState(false)
  const apiOfficialScrollRef = useRef(null)
  const apiOfficialInputRef = useRef(null)

  /** Sama seperti page Chat: scroll hanya di dalam container — JANGAN pakai scrollIntoView (bisa menggulir dokumen/sidebar). */
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)

  const [chatFontScale, setChatFontScale] = useState(() => {
    try {
      for (const key of [CHAT_FONT_STORAGE_KEY, 'ebeddien_khodam_chat_font']) {
        const s = localStorage.getItem(key)
        if (s === 'sm' || s === 'md' || s === 'lg') return s
      }
    } catch {
      /* noop */
    }
    return 'md'
  })
  const chatFont = getChatFontClasses(chatFontScale)

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_FONT_STORAGE_KEY, chatFontScale)
    } catch {
      /* noop */
    }
  }, [chatFontScale])

  const applyAutoHeight = useCallback((el) => {
    if (!el) return
    const maxPx = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, maxPx)
    el.style.height = `${next}px`
    el.style.maxHeight = `${maxPx}px`
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'
  }, [])

  /** Sinkronkan pemakaian/limit harian dari server (setelah chat sukses atau respons limit). */
  const refreshAiUsageFromServer = useCallback(async () => {
    try {
      const res = await deepseekAPI.getAccount()
      if (res?.success && res.data) {
        const lim = Math.max(0, Number(res.data.ai_daily_limit ?? 5))
        const cnt = Math.max(0, Number(res.data.ai_today_count ?? 0))
        dispatchChatAiUsageHeaderUpdate(cnt, lim)
      }
    } catch {
      /* noop */
    }
  }, [])

  useLayoutEffect(() => {
    applyAutoHeight(inputRef.current)
  }, [input, applyAutoHeight])

  useLayoutEffect(() => {
    applyAutoHeight(apiOfficialInputRef.current)
  }, [apiOfficialInput, applyAutoHeight])

  useEffect(() => {
    const onResize = () => {
      applyAutoHeight(inputRef.current)
      applyAutoHeight(apiOfficialInputRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [applyAutoHeight, input, apiOfficialInput])

  useEffect(() => {
    if (!canUseAlternativeMode && aiChatMode === 'proxy') {
      setAiChatMode('api')
    }
  }, [canUseAlternativeMode, aiChatMode])

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_API_PROVIDER_STORAGE_KEY, apiOfficialProvider)
    } catch {
      /* noop */
    }
    if (!accountEmail) return
    deepseekAPI
      .putApiProviderPreference({ provider: apiOfficialProvider, gemini_model: apiOfficialGeminiModel })
      .catch(() => {})
  }, [apiOfficialProvider, apiOfficialGeminiModel, accountEmail])

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_GEMINI_MODEL_STORAGE_KEY, apiOfficialGeminiModel)
    } catch {
      /* noop */
    }
  }, [apiOfficialGeminiModel])

  useEffect(() => {
    if (!geminiConfigured && apiOfficialProvider === 'gemini') {
      setApiOfficialProvider('deepseek')
    }
  }, [geminiConfigured, apiOfficialProvider])

  useEffect(() => {
    if (!Array.isArray(geminiModelOptions) || geminiModelOptions.length === 0) return
    const ids = new Set(geminiModelOptions.map((o) => (o && typeof o.id === 'string' ? o.id : '')).filter(Boolean))
    if (!ids.has(apiOfficialGeminiModel)) {
      const preferred = geminiModelOptions.find((o) => o?.id === DEFAULT_GEMINI_MODEL_ID)?.id
      setApiOfficialGeminiModel(preferred || geminiModelOptions[0].id)
    }
  }, [geminiModelOptions, apiOfficialGeminiModel])

  useEffect(() => {
    if (apiOfficialProvider === 'gemini') return
    setGeminiFileAttachments((prev) => {
      prev.forEach((row) => {
        if (row?.previewUrl) {
          try {
            URL.revokeObjectURL(row.previewUrl)
          } catch {
            /* noop */
          }
        }
      })
      return []
    })
  }, [apiOfficialProvider])

  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, sending, suggestedPromptsLoading, suggestedPrompts])

  useEffect(() => {
    const el = apiOfficialScrollRef.current
    if (!el || aiChatMode !== 'api') return
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [apiOfficialMessages, apiOfficialBusy, aiChatMode, suggestedPromptsLoading, suggestedPrompts])

  useEffect(() => {
    if (dsToken && !accountLoading && accountEmail && aiChatMode === 'proxy') {
      try {
        inputRef.current?.focus({ preventScroll: true })
      } catch {
        inputRef.current?.focus()
      }
    }
  }, [dsToken, accountLoading, accountEmail, aiChatMode])

  useEffect(() => {
    if (aiChatMode !== 'api' || accountLoading || !accountEmail) return
    try {
      apiOfficialInputRef.current?.focus({ preventScroll: true })
    } catch {
      apiOfficialInputRef.current?.focus()
    }
  }, [aiChatMode, accountLoading, accountEmail])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAccountLoading(true)
      setAccountError(null)
      try {
        const res = await deepseekAPI.getAccount()
        if (cancelled) return
        if (res.success && res.data) {
          setAiAgentCanUse(!!res.data.ai_agent_can_use)
          setAiAgentCanConfirm(!!res.data.ai_agent_can_confirm_write)
          setGeminiConfigured(!!res.data.gemini_configured)
          const serverProvider = res.data.ai_chat_api_provider
          if (serverProvider === 'gemini' || serverProvider === 'deepseek') {
            setApiOfficialProvider(serverProvider)
            try {
              localStorage.setItem(CHAT_API_PROVIDER_STORAGE_KEY, serverProvider)
            } catch {
              /* noop */
            }
          }
          const serverGeminiModel = res.data.ai_chat_gemini_model
          if (typeof serverGeminiModel === 'string' && /^gemini-[a-zA-Z0-9._-]+$/.test(serverGeminiModel)) {
            setApiOfficialGeminiModel(serverGeminiModel)
            try {
              localStorage.setItem(CHAT_GEMINI_MODEL_STORAGE_KEY, serverGeminiModel)
            } catch {
              /* noop */
            }
          }
          const gm = res.data.gemini_models
          setGeminiModelOptions(Array.isArray(gm) ? gm : [])
          const gerr = res.data.gemini_models_error
          setGeminiModelsError(typeof gerr === 'string' && gerr.trim() !== '' ? gerr.trim() : null)
        }
        if (res.success && res.data?.email) {
          setAccountEmail(res.data.email)
          setAiFeatureEnabled(res.data?.ai_enabled !== false)
          const m = res.data?.ai_chat_mode === 'proxy' ? 'proxy' : 'api'
          setAiChatMode(m)
          dispatchChatAiUsageHeaderUpdate(
            Math.max(0, Number(res?.data?.ai_today_count ?? 0)),
            Math.max(0, Number(res?.data?.ai_daily_limit ?? 5))
          )
        } else {
          setAccountEmail(null)
          setAccountError(res.message || 'Email tidak tersedia')
          if (res.success && res.data) {
            dispatchChatAiUsageHeaderUpdate(
              Math.max(0, Number(res?.data?.ai_today_count ?? 0)),
              Math.max(0, Number(res?.data?.ai_daily_limit ?? 5))
            )
          }
        }
      } catch (e) {
        if (!cancelled) {
          setAccountEmail(null)
          setAiAgentCanUse(false)
          setAiAgentCanConfirm(false)
          setAccountError(e.response?.data?.message || e.message || 'Gagal memuat akun')
        }
      } finally {
        if (!cancelled) setAccountLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Muat 10 pasangan terakhir dari server (satu utas per pengguna / per sesi proxy). */
  useEffect(() => {
    if (aiChatMode !== 'api') {
      setApiHistoryFetched(true)
      return
    }
    if (!accountEmail) {
      setApiHistoryFetched(true)
      return
    }
    let cancelled = false
    setApiHistoryFetched(false)
    ;(async () => {
      try {
        const res = await deepseekAPI.getChatHistory({ limit: 10, session_id: EBEDDIEN_MAIN_SESSION_ID })
        if (cancelled) return
        if (res?.success && Array.isArray(res.data?.messages)) {
          setApiOfficialMessages(mapServerHistoryToMessages(res.data.messages))
        }
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setApiHistoryFetched(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountEmail, aiChatMode])

  useEffect(() => {
    if (aiChatMode !== 'proxy') {
      setProxyHistoryFetched(true)
      return
    }
    if (!accountEmail || !dsToken) {
      setProxyHistoryFetched(true)
      return
    }
    if (!sessionId) {
      setProxyHistoryFetched(true)
      return
    }
    let cancelled = false
    setProxyHistoryFetched(false)
    ;(async () => {
      try {
        const res = await deepseekAPI.getChatHistory({ limit: 10, session_id: sessionId })
        if (cancelled) return
        if (res?.success && Array.isArray(res.data?.messages)) {
          setMessages(mapServerHistoryToMessages(res.data.messages))
        }
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setProxyHistoryFetched(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountEmail, aiChatMode, dsToken, sessionId])

  /** Saran cepat (maks. 3) hanya dari Bank Q&A — dimuat setelah riwayat siap. */
  useEffect(() => {
    const shouldFetch =
      accountEmail &&
      apiHistoryFetched &&
      proxyHistoryFetched &&
      (aiChatMode === 'api' || (aiChatMode === 'proxy' && dsToken))

    if (!shouldFetch) {
      setSuggestedPromptsLoading(false)
      return
    }

    let cancelled = false
    setSuggestedPromptsLoading(true)
    ;(async () => {
      try {
        const res = await deepseekAPI.getBankQaSuggestedPrompts()
        if (cancelled) return
        const raw = res?.success && Array.isArray(res.data) ? res.data : []
        setSuggestedPrompts(normalizeBankSuggestedPrompts(raw))
      } catch {
        if (!cancelled) setSuggestedPrompts([])
      } finally {
        if (!cancelled) setSuggestedPromptsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accountEmail, aiChatMode, apiHistoryFetched, proxyHistoryFetched, dsToken])

  const extractLoginToken = (res) => {
    const direct = res?.data?.token
    if (typeof direct === 'string' && direct.trim()) return direct.trim()

    const nestedCandidates = [
      res?.data?.user?.token,
      res?.token,
      res?.data?.biz_data?.user?.token,
      res?.data?.biz_data?.token
    ]
    for (const c of nestedCandidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
    return ''
  }

  const ensureSession = useCallback(async (token) => {
    if (!token) return null
    setSessionBusy(true)
    try {
      const res = await deepseekProxyCreateSession(token)
      if (res.success && res.data?.sessionId != null && res.data?.sessionId !== '') {
        const sid = String(res.data.sessionId)
        setSessionId(sid)
        setDeepseekAuth(token, sid)
        setDeepseekParentMessageId('')
        return sid
      }
      setSendError(res.message || 'Gagal membuat sesi chat mode alternatif (pastikan layanan proxy di server API jalan).')
      return null
    } catch (e) {
      setSendError(
        e.response?.data?.message || e.message || 'Tidak terhubung ke mode alternatif. Cek folder ai/ di server.'
      )
      return null
    } finally {
      setSessionBusy(false)
    }
  }, [])

  useEffect(() => {
    const t = getStoredDeepseekToken()
    const sid = getStoredDeepseekSessionId()
    setDsToken(t)
    setSessionId(sid)
    if (t && !sid) {
      ensureSession(t)
    }
  }, [ensureSession])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError(null)
    if (!password.trim()) {
      setLoginError('Password mode alternatif wajib diisi')
      return
    }
    setLoginBusy(true)
    try {
      const res = await deepseekAPI.login(password.trim())
      const tok = extractLoginToken(res)
      if (!res.success || !tok) {
        setLoginError(res.message || 'Login gagal')
        return
      }
      setDsToken(tok)
      setDeepseekAuth(tok, '')
      setSessionId('')
      setMessages([])
      const sid = await ensureSession(tok)
      if (sid) {
        setSendError(null)
        setMessages([
          {
            id: msgId(),
            role: 'assistant',
            content:
              `**Halo!** Saya ${ASSISTANT_NAME}. Sesi siap — jawaban memakai bank Q&A lembaga bila relevan.\n\nTulis pertanyaan di bawah atau pilih saran cepat.`
          }
        ])
      } else {
        setSendError(
          'Login mode alternatif berhasil, tetapi sesi chat gagal dibuat. Pastikan layanan proxy (folder ai) berjalan di server.'
        )
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || err.message || 'Login gagal')
    } finally {
      setLoginBusy(false)
    }
  }

  const handleLogout = useCallback(() => {
    clearDeepseekAuth()
    setDsToken('')
    setSessionId('')
    setMessages([])
    setPassword('')
    setSendError(null)
  }, [])

  const extractAssistantPayload = (d) => {
    if (!d || typeof d !== 'object') return { reply: '', thinking: '' }
    /** Node proxy: { status, response, thinking }; kadang nested data.* */
    const inner = d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data : d
    const reply =
      inner.response ??
      d.response ??
      inner.text ??
      d.text ??
      inner.content ??
      d.content ??
      (typeof inner.message === 'string' && inner.message !== '' ? inner.message : '') ??
      (typeof d.message === 'string' && d.message !== '' ? d.message : '') ??
      ''
    const thinking = inner.thinking ?? d.thinking ?? inner.thought ?? d.thought ?? ''
    return { reply: typeof reply === 'string' ? reply : '', thinking: typeof thinking === 'string' ? thinking : '' }
  }

  const submitMessage = async (rawText) => {
    const text = (rawText ?? input).trim()
    if (!text || !dsToken || sending) return

    setSendError(null)
    setInput('')
    const now = new Date().toISOString()
    const userMsg = { id: msgId(), role: 'user', content: text, createdAt: now }
    setMessages((m) => [...m, userMsg])
    setSending(true)

    let sid = sessionId
    if (!sid) {
      sid = await ensureSession(dsToken)
      if (!sid) {
        setSending(false)
        setMessages((m) => m.filter((x) => x.id !== userMsg.id))
        return
      }
    }

    try {
      const parentMsg = getStoredDeepseekParentMessageId()
      /** Urutan pesan user di UI (untuk log diagnosa rantai di Node: DEEPSEEK_DEBUG_THREAD=1). */
      const clientUserTurn = messages.filter((m) => m.role === 'user').length + 1
      const out = await deepseekProxyChat({
        token: dsToken,
        sessionId: sid,
        prompt: text,
        thinkingEnabled,
        searchEnabled,
        clientUserTurn,
        ...(parentMsg ? { parentMessageId: parentMsg } : {})
      })
      if (import.meta.env.DEV) {
        console.log('[DeepseekChat] respon API (lokal):', out)
        console.log('[DeepseekChat] rantai parent:', {
          parentMessageIdDikirim: parentMsg || null,
          sessionId: sid,
          clientUserTurn
        })
      }
      if (!out.success) {
        const errText = out.message || 'Gagal mendapat jawaban'
        setMessages((m) => [
          ...m,
          {
            id: msgId(),
            role: 'assistant',
            content: errText,
            createdAt: new Date().toISOString()
          }
        ])
        if (isAiDailyLimitMessage(errText)) void refreshAiUsageFromServer()
        return
      }
      const d = out.data || {}
      const { reply, thinking } = extractAssistantPayload(d)
      logNewlineDebug('Teks assistant (setelah extractAssistantPayload, sebelum ReactMarkdown)', reply, {
        hint: 'Bandingkan dengan log Node DEEPSEEK_DEBUG_NEWLINES — jika sama, masalah di render MD; jika beda, cek axios/API.'
      })
      if (d.status === 'error') {
        setSendError(d.message || 'Chat error')
        setMessages((m) => [
          ...m,
          {
            id: msgId(),
            role: 'assistant',
            content: `**Error:** ${d.message || 'Gagal'}`,
            createdAt: new Date().toISOString()
          }
        ])
        return
      }
      if (d.clearParentMessageId) {
        setDeepseekParentMessageId('')
      }
      const nested = d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data : null
      const lastMid =
        d.lastMessageId ??
        d.last_message_id ??
        nested?.lastMessageId ??
        nested?.last_message_id
      if (lastMid != null && String(lastMid).trim() !== '') {
        setDeepseekParentMessageId(String(lastMid))
        if (import.meta.env.DEV) {
          console.log('[DeepseekChat] lastMessageId disimpan untuk pesan berikutnya:', String(lastMid))
        }
      } else if (import.meta.env.DEV) {
        console.warn(
          '[DeepseekChat] lastMessageId tidak ada di respons — percakapan mungkin tidak terhubung (parent chain putus).'
        )
      }
      if (import.meta.env.DEV) {
        const hints = []
        if (clientUserTurn >= 2 && !parentMsg) {
          hints.push(
            'Giliran ≥2 tanpa parentMessageId → API bisa anggap obrolan baru (seperti “edit” satu slot), bukan lanjutan utas.'
          )
        }
        if (lastMid == null || String(lastMid).trim() === '') {
          hints.push('Tanpa lastMessageId, penyimpanan parent untuk pesan berikutnya kosong.')
        }
        if (d.clearParentMessageId) {
          hints.push('clearParentMessageId: server mengulang tanpa parent (422).')
        }
        console.group('[DeepseekChat][thread] Diagnosa (mirror log Node [thread] jika DEEPSEEK_DEBUG_THREAD=1)')
        console.log({
          clientUserTurn,
          parentSebelumKirim: parentMsg || null,
          lastMessageIdDariApi: lastMid != null && String(lastMid).trim() !== '' ? String(lastMid) : null,
          clearParentMessageId: !!d.clearParentMessageId,
          sessionId: sid
        })
        if (hints.length) hints.forEach((h) => console.warn('[thread]', h))
        else console.log('[thread] Tidak ada flag anomali yang terdeteksi di sisi browser.')
        console.groupEnd()
      }
      setMessages((m) => [
        ...m,
        ...buildAssistantMessageRows(reply, d.reply_parts, { thinking, msgId })
      ])
      void refreshAiUsageFromServer()
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gagal mengirim'
      setMessages((m) => [
        ...m,
        { id: msgId(), role: 'assistant', content: msg, createdAt: new Date().toISOString() }
      ])
      if (err.response?.status === 429 || isAiDailyLimitMessage(msg)) void refreshAiUsageFromServer()
    } finally {
      setSending(false)
    }
  }

  const handleSend = (e) => {
    e.preventDefault()
    submitMessage()
  }

  /** Jalur agen otomatis bila JWT/akun mengizinkan (tanpa toggle di UI). */
  const canUseAgentPath = aiAgentCanUse || chatAi.agentUse
  const agentConfirmEffective = aiAgentCanConfirm || chatAi.agentConfirmWrite
  const agentTurnLikelyForUi =
    canUseAgentPath &&
    (geminiFileAttachments.length > 0 ||
      userMessageSuggestsAgentIntent(apiOfficialInput.trim(), false) ||
      (preferAgentContinuesRef.current && !userMessageSuggestsGeneralChatOnly(apiOfficialInput.trim())))
  const effectiveProviderUi = canManualProviderSelect
    ? apiOfficialProvider
    : geminiConfigured && geminiFileAttachments.length > 0
      ? 'gemini'
      : 'deepseek'

  const onGeminiFilePick = (ev) => {
    const inputEl = ev.target
    const picked = Array.from(inputEl.files || []).filter((f) => /^image\//.test(f.type) || GEMINI_DOC_MIME_ALLOW.has(f.type))
    inputEl.value = ''
    if (picked.length === 0) return
    setGeminiFileAttachments((prev) => {
      const next = [...prev]
      for (const file of picked) {
        if (next.length >= GEMINI_ATTACH_MAX_FILES) {
          showNotification(`Maksimal ${GEMINI_ATTACH_MAX_FILES} lampiran per pesan.`, 'warning')
          break
        }
        if (file.size > GEMINI_ATTACH_MAX_BYTES) {
          showNotification(`Berkas «${file.name}» terlalu besar (maks. ~6 MB).`, 'warning')
          continue
        }
        const isImage = /^image\//.test(file.type)
        next.push({
          id: msgId(),
          file,
          kind: isImage ? 'image' : 'doc',
          previewUrl: isImage ? URL.createObjectURL(file) : null
        })
      }
      return next
    })
  }

  const removeGeminiFileAttachment = (id) => {
    setGeminiFileAttachments((prev) => {
      const row = prev.find((x) => x.id === id)
      if (row?.previewUrl) {
        try {
          URL.revokeObjectURL(row.previewUrl)
        } catch {
          /* noop */
        }
      }
      return prev.filter((x) => x.id !== id)
    })
  }

  const submitApiOfficial = async (e, overrideText) => {
    e?.preventDefault?.()
    const textRaw = typeof overrideText === 'string' ? overrideText : apiOfficialInput
    const text = textRaw.trim()
    if (typeof overrideText === 'string') {
      preferAgentContinuesRef.current = false
    }
    const attachmentRowsSnapshot = [...geminiFileAttachments]
    const hasChatAttachments = attachmentRowsSnapshot.length > 0
    const generalOnly = userMessageSuggestsGeneralChatOnly(text)
    if (generalOnly) {
      preferAgentContinuesRef.current = false
    }
    const intentAgent = userMessageSuggestsAgentIntent(text, hasChatAttachments)
    const useAgentAuto =
      canUseAgentPath &&
      (intentAgent || (preferAgentContinuesRef.current && !generalOnly))
    const effectiveProvider = canManualProviderSelect
      ? apiOfficialProvider
      : hasChatAttachments
        ? (geminiConfigured ? 'gemini' : 'deepseek')
        : 'deepseek'
    if ((!text && !hasChatAttachments) || apiOfficialBusy) return
    if (useAgentAuto && hasChatAttachments && !geminiConfigured) {
      showNotification(
        'Lampiran berkas untuk agen membutuhkan GEMINI_API_KEY di server (api/.env). Restart Apache setelah mengubah .env.',
        'warning'
      )
      return
    }
    if (!useAgentAuto && hasChatAttachments && effectiveProvider === 'deepseek') {
      showNotification(
        'Lampiran berkas membutuhkan Gemini di server. Saat ini fallback masih DeepSeek karena Gemini belum aktif.',
        'warning'
      )
      return
    }
    setApiOfficialInput('')
    setGeminiFileAttachments([])
    /** Satu giliran per request; 3 percakapan terakhir diambil server dari ai___chat (users_id + session_id). */
    const now = new Date().toISOString()
    const displayUserText = text || (hasChatAttachments ? '«lampiran»' : '')
    const userMsg = {
      id: msgId(),
      role: 'user',
      content: displayUserText,
      ...(hasChatAttachments
        ? {
            imageUrls: attachmentRowsSnapshot
              .map((r) => r.previewUrl)
              .filter((u) => typeof u === 'string' && u.trim() !== '')
          }
        : {}),
      createdAt: now
    }
    setApiOfficialMessages((m) => [...m, userMsg])
    setApiOfficialBusy(true)
    const navCtx =
      navigationContextPayload != null ? { navigation_context: navigationContextPayload } : {}
    try {
      if (useAgentAuto) {
        let agentAttachmentsPayload = []
        if (attachmentRowsSnapshot.length > 0) {
          agentAttachmentsPayload = await Promise.all(
            attachmentRowsSnapshot.map(async ({ file }) => {
              const buf = await file.arrayBuffer()
              const mime = file.type && file.type.trim() !== '' ? file.type : 'application/octet-stream'
              return { mime_type: mime, data: arrayBufferToBase64(buf) }
            })
          )
        }
        const agentBody = { message: text, ...navCtx }
        if (agentAttachmentsPayload.length > 0) {
          agentBody.attachments = agentAttachmentsPayload
        }
        const res = await deepseekAPI.agentTurn(agentBody)
        if (!res.success) {
          const errText = res.message || 'Gagal'
          setApiOfficialMessages((m) => [
            ...m,
            { id: msgId(), role: 'assistant', content: errText, createdAt: new Date().toISOString() }
          ])
          if (isAiDailyLimitMessage(errText)) void refreshAiUsageFromServer()
          return
        }
        const d = res.data || {}
        if (d.mode === 'propose_actions' && d.job && d.job.id && d.job.confirm_token) {
          setApiOfficialMessages((m) => [
            ...m,
            {
              id: msgId(),
              role: 'assistant',
              kind: 'agent_proposal',
              intro: d.message || '',
              job: d.job,
              createdAt: new Date().toISOString()
            }
          ])
        } else {
          setApiOfficialMessages((m) => [
            ...m,
            {
              id: msgId(),
              role: 'assistant',
              content: d.message || '_(kosong)_',
              thinking: undefined,
              createdAt: new Date().toISOString()
            }
          ])
        }
        preferAgentContinuesRef.current = true
        void refreshAiUsageFromServer()
        return
      }

      preferAgentContinuesRef.current = false
      let geminiAttachmentsPayload = []
      if (hasChatAttachments && attachmentRowsSnapshot.length > 0) {
        geminiAttachmentsPayload = await Promise.all(
          attachmentRowsSnapshot.map(async ({ file }) => {
            const buf = await file.arrayBuffer()
            const mime = file.type && file.type.trim() !== '' ? file.type : 'application/octet-stream'
            return { mime_type: mime, data: arrayBufferToBase64(buf) }
          })
        )
      }

      let res = null
      if (effectiveProvider === 'gemini') {
        res = await deepseekAPI.directGeminiChat({
          messages: [{ role: 'user', content: text, images: geminiAttachmentsPayload }],
          model: apiOfficialGeminiModel,
          session_id: EBEDDIEN_MAIN_SESSION_ID,
          ...navCtx
        })
      } else {
        try {
          res = await deepseekAPI.directApiChat({
            messages: [{ role: 'user', content: text }],
            model: apiOfficialModel,
            session_id: EBEDDIEN_MAIN_SESSION_ID,
            ...navCtx
          })
          if ((!res?.success) && !hasChatAttachments && geminiConfigured) {
            res = await deepseekAPI.directGeminiChat({
              messages: [{ role: 'user', content: text, images: [] }],
              model: apiOfficialGeminiModel,
              session_id: EBEDDIEN_MAIN_SESSION_ID,
              ...navCtx
            })
          }
        } catch (deepseekErr) {
          if (!hasChatAttachments && geminiConfigured) {
            res = await deepseekAPI.directGeminiChat({
              messages: [{ role: 'user', content: text, images: [] }],
              model: apiOfficialGeminiModel,
              session_id: EBEDDIEN_MAIN_SESSION_ID,
              ...navCtx
            })
          } else {
            throw deepseekErr
          }
        }
      }
      if (!res.success) {
        const errText = res.message || 'Gagal'
        setApiOfficialMessages((m) => [
          ...m,
          { id: msgId(), role: 'assistant', content: errText, createdAt: new Date().toISOString() }
        ])
        if (isAiDailyLimitMessage(errText)) void refreshAiUsageFromServer()
        return
      }
      const d = res.data || {}
      setApiOfficialMessages((m) => [
        ...m,
        ...buildAssistantMessageRows(d.message || '', d.reply_parts, {
          thinking: d.reasoning,
          msgId
        })
      ])
      void refreshAiUsageFromServer()
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gagal mengirim'
      setApiOfficialMessages((m) => [
        ...m,
        { id: msgId(), role: 'assistant', content: msg, createdAt: new Date().toISOString() }
      ])
      if (err.response?.status === 429 || isAiDailyLimitMessage(msg)) void refreshAiUsageFromServer()
    } finally {
      setApiOfficialBusy(false)
    }
  }

  const showApiConversationStarter = useMemo(
    () => shouldShowConversationStarter(apiOfficialMessages),
    [apiOfficialMessages]
  )
  const showProxyConversationStarter = useMemo(
    () => shouldShowConversationStarter(messages),
    [messages]
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
            {accountLoading ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
                <div className="h-11 w-11 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat akun…</p>
              </div>
            ) : !accountEmail ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 chat-scrollbar overscroll-contain">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  <p className="font-medium">Email akun belum diisi</p>
                  <p className="mt-1 opacity-90">{accountError}</p>
                  <Link
                    to="/profil"
                    onClick={() => onRequestClose?.()}
                    className="mt-3 inline-block font-medium text-primary-700 underline dark:text-primary-400"
                  >
                    Buka Profil → isi / perbarui email
                  </Link>
                </div>
              </div>
            ) : !aiFeatureEnabled ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 chat-scrollbar overscroll-contain">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  Akses AI untuk akun ini dinonaktifkan oleh super admin.
                </div>
              </div>
            ) : aiChatMode === 'api' ? (
              !apiHistoryFetched ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
                  <div className="h-11 w-11 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat obrolan…</p>
                </div>
              ) : (
              <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent sm:bg-gradient-to-b sm:from-primary-50/90 sm:to-white dark:sm:from-gray-900/85 dark:sm:to-gray-900/50"
                style={{ minHeight: 0 }}
              >
                <div
                  ref={apiOfficialScrollRef}
                  className="chat-scrollbar min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth px-2 py-3 sm:p-4"
                >
                  {apiOfficialMessages.map((msg) =>
                    msg.role === 'user' ? (
                      <BubbleUser
                        key={msg.id}
                        text={msg.content}
                        imageUrls={msg.imageUrls}
                        fontClass={chatFont.user}
                      />
                    ) : msg.kind === 'agent_proposal' && msg.job ? (
                      <AgentProposalCard
                        key={msg.id}
                        intro={msg.intro}
                        job={msg.job}
                        nameClass={chatFont.assistantName}
                        proseClass={chatFont.prose}
                        canConfirmWrite={agentConfirmEffective}
                        onRefreshUsage={refreshAiUsageFromServer}
                      />
                    ) : (
                      <BubbleAssistant
                        key={msg.id}
                        text={msg.content}
                        thinking={msg.thinking}
                        nameClass={chatFont.assistantName}
                        proseClass={chatFont.prose}
                        thinkingClass={chatFont.thinking}
                      />
                    )
                  )}

                  {showApiConversationStarter ? (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`text-center px-2 ${
                        apiOfficialMessages.length > 0
                          ? chatFont.starter.sectionWhenHistory
                          : chatFont.starter.sectionWhenEmpty
                      }`}
                    >
                      <EbeddienChatConversationStarterToolbar
                        chatFontScale={chatFontScale}
                        setChatFontScale={setChatFontScale}
                        starter={chatFont.starter}
                      />
                      <p className={chatFont.starter.title}>Mulai percakapan</p>
                      <p className={chatFont.starter.description}>
                        {ASSISTANT_NAME} memakai bank Q&amp;A lembaga (tabel terkurasi) untuk saran cepat. Pilih saran atau ketik di bawah.
                        {' '}Ringkasan kemampuan modul ada di tab <strong className="font-medium text-gray-700 dark:text-gray-300">Kemampuan</strong>.
                      </p>
                      <div
                        className={`flex flex-col sm:flex-row flex-wrap justify-center max-w-xl mx-auto ${chatFont.starter.templateGap}`}
                      >
                        {suggestedPromptsLoading
                          ? [0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className={chatFont.starter.skeleton}
                                aria-hidden
                              />
                            ))
                          : suggestedPrompts.map((p, idx) => (
                              <button
                                key={`${idx}-${p.slice(0, 32)}`}
                                type="button"
                                disabled={apiOfficialBusy}
                                onClick={() => submitApiOfficial(null, p)}
                                className={chatFont.starter.templateBtn}
                              >
                                {p}
                              </button>
                            ))}
                      </div>
                    </motion.div>
                  ) : null}

                  {apiOfficialBusy ? (
                    <TypingIndicator nameClass={chatFont.assistantName} statusClass={chatFont.typing} />
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white/95 p-3 dark:bg-gray-900/95 sm:p-4 backdrop-blur-sm max-sm:bg-white/80 max-sm:backdrop-blur-md dark:max-sm:bg-gray-900/85">
                    {geminiConfigured &&
                  geminiFileAttachments.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {geminiFileAttachments.map((row) => (
                        row.kind === 'image' ? (
                          <div
                            key={row.id}
                            className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
                          >
                            <img src={row.previewUrl} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              disabled={apiOfficialBusy}
                              onClick={() => removeGeminiFileAttachment(row.id)}
                              className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white opacity-0 transition hover:opacity-100"
                              aria-label="Hapus lampiran"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div
                            key={row.id}
                            className="relative flex h-14 min-w-[11rem] max-w-[13rem] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 dark:border-gray-600 dark:bg-gray-800"
                          >
                            <span className="text-base">📄</span>
                            <span className="truncate text-[11px] text-gray-700 dark:text-gray-200">{row.file?.name || 'Dokumen'}</span>
                            <button
                              type="button"
                              disabled={apiOfficialBusy}
                              onClick={() => removeGeminiFileAttachment(row.id)}
                              className="ml-auto rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                              aria-label="Hapus lampiran"
                            >
                              ×
                            </button>
                          </div>
                        )
                      ))}
                    </div>
                  ) : null}
                  <form onSubmit={submitApiOfficial} className="flex gap-2.5 items-end">
                    <input
                      ref={geminiFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
                      multiple
                      className="hidden"
                      onChange={onGeminiFilePick}
                    />
                    {geminiConfigured ? (
                      <button
                        type="button"
                        disabled={apiOfficialBusy || geminiFileAttachments.length >= GEMINI_ATTACH_MAX_FILES}
                        onClick={() => geminiFileInputRef.current?.click()}
                        title="Lampirkan berkas (gambar, PDF, Word, Excel, CSV, teks)"
                        className="inline-flex h-[2.75rem] min-h-[2.75rem] w-[2.75rem] shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-primary-300 hover:bg-primary-50/80 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-600 dark:hover:bg-primary-950/40"
                        aria-label="Lampirkan berkas"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                          />
                        </svg>
                      </button>
                    ) : null}
                    <textarea
                      ref={apiOfficialInputRef}
                      rows={1}
                      value={apiOfficialInput}
                      onChange={(ev) => setApiOfficialInput(ev.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          submitApiOfficial(e)
                        }
                      }}
                      placeholder={
                        effectiveProviderUi === 'gemini'
                          ? `Tulis ke ${ASSISTANT_NAME}… (opsional jika ada lampiran; Enter kirim)`
                          : `Tulis ke ${ASSISTANT_NAME}… (Enter kirim, Shift+Enter baris baru)`
                      }
                      disabled={apiOfficialBusy}
                      className="chat-scrollbar min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none ring-0 transition-[box-shadow,border-color] placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/25 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/20 overflow-y-auto"
                    />
                    <SendIconButton
                      disabled={
                        apiOfficialBusy ||
                        (!apiOfficialInput.trim() && geminiFileAttachments.length === 0)
                      }
                      busy={apiOfficialBusy}
                    />
                  </form>
                  <div className="mt-3 flex flex-col gap-3 border-t border-dashed border-gray-200/90 pt-3 dark:border-gray-600/80">
                    {canManualProviderSelect ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Penyedia
                        </span>
                        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50/90 p-0.5 dark:border-gray-600 dark:bg-gray-800/80">
                          <button
                            type="button"
                            disabled={apiOfficialBusy}
                            onClick={() => setApiOfficialProvider('deepseek')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              apiOfficialProvider === 'deepseek'
                                ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                          >
                            DeepSeek
                          </button>
                          <button
                            type="button"
                            title={
                              geminiConfigured
                                ? 'Google Gemini'
                                : 'Gemini belum dikonfigurasi di server (GEMINI_API_KEY)'
                            }
                            disabled={apiOfficialBusy || !geminiConfigured}
                            onClick={() => geminiConfigured && setApiOfficialProvider('gemini')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              apiOfficialProvider === 'gemini'
                                ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            Gemini
                          </button>
                        </div>
                        {apiOfficialProvider === 'gemini' ? (
                          <div className="flex max-w-[18rem] flex-col gap-0.5">
                            <select
                              aria-label="Model Gemini"
                              disabled={apiOfficialBusy || geminiSelectRows.length === 0}
                              value={apiOfficialGeminiModel}
                              onChange={(ev) => setApiOfficialGeminiModel(ev.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            >
                              {geminiSelectRows.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {typeof o.label === 'string' && o.label.trim() !== '' ? o.label : o.id}
                                </option>
                              ))}
                            </select>
                            {geminiModelsError ? (
                              <span className="text-[10px] leading-snug text-amber-700 dark:text-amber-300" title={geminiModelsError}>
                                Daftar model: {geminiModelsError}
                              </span>
                            ) : null}
                            {geminiConfigured && !geminiModelsError && geminiModelOptions.length === 0 ? (
                              <span className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                                Tidak ada model generateContent yang dikembalikan Google untuk kunci ini.
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {!geminiConfigured ? (
                      <p className="text-center text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        Gemini nonaktif: backend tidak melihat <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">GEMINI_API_KEY</code> di{' '}
                        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">api/.env</code> — atau pakai API lain dari frontend Anda. Restart
                        PHP/Apache setelah mengubah .env.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                      {apiOfficialProvider === 'deepseek' ? (
                        <SwitchToggle
                          compact
                          toggleFirst
                          label="Berpikir"
                          checked={apiOfficialModel === 'deepseek-reasoner'}
                          disabled={apiOfficialBusy || agentTurnLikelyForUi}
                          onChange={(on) => setApiOfficialModel(on ? 'deepseek-reasoner' : 'deepseek-chat')}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              )
            ) : aiChatMode === 'proxy' && !dsToken ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:p-5 chat-scrollbar overscroll-contain max-sm:bg-transparent">
                <div className="mx-auto my-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-600 dark:bg-gray-900/90 sm:p-8">
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg">
                      <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="mb-1 text-center text-sm text-gray-600 dark:text-gray-300">
                    Mode alternatif — sambungan penyedia terpisah
                  </p>
                  <p className="mb-5 break-all text-center text-sm font-mono font-medium text-primary-700 dark:text-primary-400">
                    {accountEmail}
                  </p>
                  <form onSubmit={handleLogin} className="space-y-3">
                    <div>
                      <label htmlFor="ds-pw" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Password penyedia (bukan password eBeddien)
                      </label>
                      <input
                        id="ds-pw"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(ev) => setPassword(ev.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40 dark:border-gray-600 dark:bg-gray-900"
                        placeholder="Bukan password eBeddien"
                      />
                    </div>
                    {loginError ? <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p> : null}
                    <button
                      type="submit"
                      disabled={loginBusy}
                      className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-primary-700 hover:to-primary-800 disabled:opacity-50"
                    >
                      {loginBusy ? 'Menghubungkan…' : `Hubungkan mode alternatif`}
                    </button>
                  </form>
                  <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    Butuh akun penyedia untuk mode ini — hubungi administrator.
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent sm:bg-gradient-to-b sm:from-primary-50/90 sm:to-white dark:sm:from-gray-900/85 dark:sm:to-gray-900/50"
                style={{ minHeight: 0 }}
              >
                <div
                  ref={messagesContainerRef}
                  className="chat-scrollbar min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth px-2 py-3 sm:p-4"
                >
              {messages.length === 0 && sessionBusy ? (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-12">Menyiapkan sesi…</p>
              ) : null}

              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <BubbleUser key={msg.id} text={msg.content} fontClass={chatFont.user} />
                ) : (
                  <BubbleAssistant
                    key={msg.id}
                    text={msg.content}
                    thinking={msg.thinking}
                    nameClass={chatFont.assistantName}
                    proseClass={chatFont.prose}
                    thinkingClass={chatFont.thinking}
                  />
                )
              )}

              {showProxyConversationStarter && !(messages.length === 0 && sessionBusy) ? (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`text-center px-2 ${
                    messages.length > 0
                      ? chatFont.starter.sectionWhenHistory
                      : chatFont.starter.sectionWhenEmpty
                  }`}
                >
                  <EbeddienChatConversationStarterToolbar
                    chatFontScale={chatFontScale}
                    setChatFontScale={setChatFontScale}
                    starter={chatFont.starter}
                  />
                  <p className={chatFont.starter.title}>Mulai percakapan</p>
                  <p className={chatFont.starter.description}>
                    {ASSISTANT_NAME} memakai bank Q&amp;A lembaga (tabel terkurasi) untuk saran cepat. Pilih saran atau ketik di bawah.
                    {' '}Ringkasan kemampuan modul ada di tab <strong className="font-medium text-gray-700 dark:text-gray-300">Kemampuan</strong>.
                  </p>
                  <div
                    className={`flex flex-col sm:flex-row flex-wrap justify-center max-w-xl mx-auto ${chatFont.starter.templateGap}`}
                  >
                    {suggestedPromptsLoading
                      ? [0, 1, 2].map((i) => (
                          <div key={i} className={chatFont.starter.skeleton} aria-hidden />
                        ))
                      : suggestedPrompts.map((p, idx) => (
                          <button
                            key={`${idx}-${p.slice(0, 32)}`}
                            type="button"
                            disabled={sending || sessionBusy}
                            onClick={() => submitMessage(p)}
                            className={chatFont.starter.templateBtn}
                          >
                            {p}
                          </button>
                        ))}
                  </div>
                </motion.div>
              ) : null}

              {sending ? (
                <TypingIndicator nameClass={chatFont.assistantName} statusClass={chatFont.typing} />
              ) : null}
            </div>

            {sendError ? (
              <div className="shrink-0 border-t border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:px-4">
                {sendError}
              </div>
            ) : null}

            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white/95 p-3 dark:bg-gray-900/95 sm:p-4 backdrop-blur-sm max-sm:bg-white/80 max-sm:backdrop-blur-md dark:max-sm:bg-gray-900/85">
              <form onSubmit={handleSend} className="flex gap-2.5 items-end">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend(e)
                    }
                  }}
                  placeholder={`Tulis ke ${ASSISTANT_NAME}… (Enter kirim, Shift+Enter baris baru)`}
                  disabled={sending || sessionBusy}
                  className="chat-scrollbar min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/25 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/20 overflow-y-auto"
                />
                <SendIconButton disabled={sending || sessionBusy || !input.trim()} busy={sending} />
              </form>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-dashed border-gray-200/90 pt-3 dark:border-gray-600/80">
                <SwitchToggle
                  label="Mode berpikir"
                  checked={thinkingEnabled}
                  disabled={sending || sessionBusy}
                  onChange={setThinkingEnabled}
                />
                <SwitchToggle
                  label="Cari di web"
                  checked={searchEnabled}
                  disabled={sending || sessionBusy}
                  onChange={setSearchEnabled}
                />
                {dsToken && aiChatMode === 'proxy' ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
                  >
                    Keluar mode alternatif
                  </button>
                ) : null}
              </div>
            </div>
              </div>
            )}

    </div>
  )
}
