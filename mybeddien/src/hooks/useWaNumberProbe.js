import { useState, useEffect, useCallback, useRef } from 'react'
import { checkWhatsAppNumber } from '../utils/whatsappCheck'

const DEBOUNCE_MS = 650
/** Setelah gagal sebanyak ini (klik «Coba cek lagi»), tampilkan centang konfirmasi manual. */
export const WA_MANUAL_CONFIRM_AFTER_RETRIES = 3

const DEFAULT_HINTS = {
  empty:
    'Nomor akan dicek ke WhatsApp otomatis setelah terisi (min. 10 digit). Tombol aktif jika nomor terdaftar di WA.',
  short: 'Lengkapi nomor WhatsApp (minimal 10 digit).',
  pending: 'Berhenti mengetik sebentar — nomor akan dicek otomatis.',
  checking: 'Memeriksa apakah nomor terdaftar di WhatsApp…',
  ok: 'Nomor WhatsApp aktif — Anda bisa melanjutkan.',
  notRegistered: 'Nomor ini tidak terdaftar di WhatsApp. Gunakan nomor yang aktif.',
  verifyFail: 'Tidak bisa memverifikasi nomor. Ketuk Coba cek lagi.',
  serverDown:
    'Layanan cek WhatsApp sedang bermasalah. Coba lagi sebentar; bila berulang, hubungi admin pesantren.',
  unexpected: 'Gagal memeriksa nomor. Periksa koneksi internet lalu ketuk Coba cek lagi.',
  manualOk:
    'Anda menyatakan nomor WhatsApp sudah aktif. Lanjutkan pendaftaran; pastikan nomor benar agar notifikasi sampai.',
}

/**
 * Debounce + cek WA otomatis untuk halaman daftar / lupa NIS.
 * @param {string} noWa
 * @param {{ hints?: Partial<typeof DEFAULT_HINTS> }} [options]
 */
export function useWaNumberProbe(noWa, options = {}) {
  const hintsRef = useRef({ ...DEFAULT_HINTS, ...(options.hints || {}) })
  hintsRef.current = { ...DEFAULT_HINTS, ...(options.hints || {}) }
  const [waProbe, setWaProbe] = useState('idle')
  const [waChecking, setWaChecking] = useState(false)
  const [waHint, setWaHint] = useState('')
  const [waCanRetry, setWaCanRetry] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [manualRetryClickCount, setManualRetryClickCount] = useState(0)
  const [waManualConfirmed, setWaManualConfirmed] = useState(false)
  const [lastFailureWasNotRegistered, setLastFailureWasNotRegistered] = useState(false)

  const waDigitsLen = String(noWa || '').replace(/\D/g, '').length
  const waVerified = waProbe === 'ok'
  const waAcceptedForSubmit = waVerified || waManualConfirmed
  const showManualWaConfirm =
    manualRetryClickCount >= WA_MANUAL_CONFIRM_AFTER_RETRIES &&
    !waVerified &&
    waDigitsLen >= 10 &&
    !lastFailureWasNotRegistered &&
    (waProbe === 'server_down' || waProbe === 'invalid')

  const retryWaCheck = useCallback(() => {
    if (waChecking || waDigitsLen < 10) return
    setWaManualConfirmed(false)
    setManualRetryClickCount((c) => c + 1)
    setRetryNonce((n) => n + 1)
  }, [waChecking, waDigitsLen])

  const setWaManualConfirmedChecked = useCallback((checked) => {
    setWaManualConfirmed(!!checked)
    const hints = hintsRef.current
    if (checked && !waVerified) {
      setWaHint(hints.manualOk)
    }
  }, [waVerified])

  useEffect(() => {
    setManualRetryClickCount(0)
    setWaManualConfirmed(false)
    setLastFailureWasNotRegistered(false)
  }, [noWa])

  useEffect(() => {
    let cancelled = false

    const hints = hintsRef.current

    if (waDigitsLen < 10) {
      setWaProbe('idle')
      setWaChecking(false)
      setWaCanRetry(false)
      setWaHint(waDigitsLen === 0 ? hints.empty : hints.short)
      return undefined
    }

    if (waManualConfirmed && manualRetryClickCount >= WA_MANUAL_CONFIRM_AFTER_RETRIES) {
      return undefined
    }

    setWaProbe('pending')
    setWaChecking(false)
    setWaCanRetry(false)
    setWaHint(hints.pending)

    const t = window.setTimeout(async () => {
      if (cancelled) return
      setWaChecking(true)
      setWaHint(hints.checking)
      try {
        const result = await checkWhatsAppNumber(String(noWa).trim())
        if (cancelled) return

        setWaCanRetry(!!result.canRetry)

        if (result.waServerDown) {
          setLastFailureWasNotRegistered(false)
          setWaProbe('server_down')
          setWaHint(result.message || hints.serverDown)
          return
        }
        if (!result.success) {
          setLastFailureWasNotRegistered(false)
          setWaProbe('invalid')
          setWaHint(result.message || hints.verifyFail)
          return
        }
        if (!result.isRegistered) {
          setLastFailureWasNotRegistered(true)
          setWaProbe('invalid')
          setWaCanRetry(false)
          setWaHint(hints.notRegistered)
          return
        }
        setLastFailureWasNotRegistered(false)
        setManualRetryClickCount(0)
        setWaManualConfirmed(false)
        setWaProbe('ok')
        setWaCanRetry(false)
        setWaHint(hints.ok)
      } catch {
        if (!cancelled) {
          setLastFailureWasNotRegistered(false)
          setWaProbe('server_down')
          setWaCanRetry(true)
          setWaHint(hints.unexpected)
        }
      } finally {
        if (!cancelled) setWaChecking(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [noWa, waDigitsLen, retryNonce, waManualConfirmed, manualRetryClickCount])

  return {
    waProbe,
    waChecking,
    waHint,
    waCanRetry,
    retryWaCheck,
    waVerified,
    waAcceptedForSubmit,
    waManualConfirmed,
    setWaManualConfirmedChecked,
    showManualWaConfirm,
    manualRetryClickCount,
    waDigitsLen,
  }
}
