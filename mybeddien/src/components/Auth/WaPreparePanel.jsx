import { useMemo, useState } from 'react'

function parseWaMeUrl(waMeUrl) {
  try {
    const u = new URL(waMeUrl)
    const phone = (u.pathname || '').replace(/^\//, '').replace(/\D/g, '')
    const text = u.searchParams.get('text') || ''
    return { phone, text }
  } catch {
    return { phone: '', text: '' }
  }
}

function buildAndroidIntent(phone, text, pkg) {
  // Intent Android: buka paket WA spesifik (biasa vs Business)
  const phoneDigits = String(phone || '').replace(/\D/g, '')
  const encoded = encodeURIComponent(text || '')
  return `intent://send?phone=${phoneDigits}&text=${encoded}#Intent;scheme=whatsapp;package=${pkg};end`
}

/**
 * Panel hasil prepare WA: pilih WA biasa / Business, salin teks, atau buka link umum.
 */
export default function WaPreparePanel({
  message,
  waMeUrl,
  waMessage = '',
  expiresInMinutes = 30,
  onReset,
  resetLabel = 'Isi ulang formulir',
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const { phone, text } = useMemo(() => {
    const parsed = parseWaMeUrl(waMeUrl || '')
    return {
      phone: parsed.phone,
      text: (waMessage && String(waMessage).trim()) || parsed.text || '',
    }
  }, [waMeUrl, waMessage])

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')

  const openGeneric = () => {
    if (!waMeUrl) return
    window.open(waMeUrl, '_blank', 'noopener,noreferrer')
  }

  const openConsumer = () => {
    if (!phone) {
      openGeneric()
      return
    }
    if (isAndroid) {
      window.location.href = buildAndroidIntent(phone, text, 'com.whatsapp')
      return
    }
    openGeneric()
  }

  const openBusiness = () => {
    if (!phone) {
      openGeneric()
      return
    }
    if (isAndroid) {
      window.location.href = buildAndroidIntent(phone, text, 'com.whatsapp.w4b')
      return
    }
    openGeneric()
  }

  const copyText = async () => {
    setCopyError('')
    if (!text) {
      setCopyError('Teks pesan kosong')
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError('Gagal menyalin. Pilih teks di kotak lalu salin manual.')
    }
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/20 p-4 space-y-3">
      <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium">
        {message || 'Lanjutkan verifikasi lewat WhatsApp.'}
      </p>
      <ol className="text-xs text-emerald-800 dark:text-emerald-200 space-y-1 list-decimal list-inside">
        <li>Pilih WhatsApp biasa atau WA Business (jika keduanya terpasang).</li>
        <li>Kirim dari nomor yang sama dengan yang Anda isi di formulir.</li>
        <li>Atau salin teks → buka WA manual → tempel & kirim ke nomor pesantren.</li>
        <li>Tunggu balasan otomatis dari bot (aktif {expiresInMinutes} menit).</li>
      </ol>

      {text ? (
        <textarea
          readOnly
          value={text}
          rows={6}
          className="w-full text-xs font-mono rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white/90 dark:bg-gray-900/60 text-gray-800 dark:text-gray-100 p-3 resize-y"
          aria-label="Teks pesan WhatsApp"
        />
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={openConsumer}
          className="w-full py-3 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-2 text-sm"
        >
          WhatsApp biasa
        </button>
        <button
          type="button"
          onClick={openBusiness}
          className="w-full py-3 rounded-xl font-semibold bg-sky-700 text-white hover:bg-sky-800 flex items-center justify-center gap-2 text-sm"
        >
          WA Business
        </button>
      </div>

      <button
        type="button"
        onClick={copyText}
        className="w-full py-2.5 rounded-xl font-semibold border-2 border-emerald-600 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-sm"
      >
        {copied ? 'Tersalin ✓' : 'Salin teks pesan'}
      </button>
      {copyError ? <p className="text-xs text-red-600 dark:text-red-400">{copyError}</p> : null}

      <button
        type="button"
        onClick={openGeneric}
        className="w-full text-xs text-emerald-700 dark:text-emerald-300 underline py-1"
      >
        Buka lewat link wa.me (default HP)
      </button>

      {typeof onReset === 'function' && (
        <button
          type="button"
          onClick={onReset}
          className="w-full text-sm text-emerald-800 dark:text-emerald-300 py-1 underline"
        >
          {resetLabel}
        </button>
      )}
    </div>
  )
}

/** Blok paste/drop pada input password (cegah salin-tempel salah). */
export function blockPasswordPaste(e) {
  e.preventDefault()
}
