import { useEffect, useRef } from 'react'
import { cashlessAPI } from '../services/api'

const POLL_MS = 5000

export function resolveFingerprintFromWallet(walletData) {
  if (!walletData) return null
  if (walletData.has_wallet === false) return 'no-wallet'
  return walletData.account?.live_fingerprint ?? null
}

/**
 * Poll fingerprint wallet cashless; refresh UI saat ada mutasi dari perangkat lain.
 */
export function useCashlessLiveSync({ enabled, seedFingerprint, onChanged, akses }) {
  const fpRef = useRef(null)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  useEffect(() => {
    if (seedFingerprint != null) {
      fpRef.current = seedFingerprint
    }
  }, [seedFingerprint])

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false
    let timeoutId = null

    const check = async () => {
      if (cancelled) return
      try {
        const res = await cashlessAPI.getLiveState(akses)
        if (cancelled || !res?.success) return
        const fp = res.data?.fingerprint ?? null
        if (fpRef.current !== null && fp !== null && fp !== fpRef.current) {
          fpRef.current = fp
          await onChangedRef.current?.({ external: true })
        } else if (fp !== null) {
          fpRef.current = fp
        }
      } catch {
        // abaikan gangguan jaringan sementara
      }
    }

    const schedule = () => {
      if (cancelled) return
      timeoutId = setTimeout(async () => {
        if (typeof document !== 'undefined' && document.hidden) {
          schedule()
          return
        }
        await check()
        schedule()
      }, POLL_MS)
    }

    const onVisibility = () => {
      if (!document.hidden) void check()
    }
    const onFocus = () => {
      void check()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    schedule()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, akses])

  return {}
}
