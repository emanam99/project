import { useCallback, useEffect, useState } from 'react'
import {
  readStoredTitleLang,
  TITLE_LANG_EVENT,
  TITLE_LANG_STORAGE_KEY,
  type WiridTitleLang,
} from '../utils/wiridTitle'

export function useTitleLang() {
  const [lang, setLangState] = useState<WiridTitleLang>(() =>
    typeof window !== 'undefined' ? readStoredTitleLang() : 'id',
  )

  useEffect(() => {
    const sync = () => setLangState(readStoredTitleLang())
    window.addEventListener(TITLE_LANG_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TITLE_LANG_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setLang = useCallback((next: WiridTitleLang) => {
    setLangState(next)
    try {
      localStorage.setItem(TITLE_LANG_STORAGE_KEY, next)
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(TITLE_LANG_EVENT))
  }, [])

  return { lang, setLang }
}

export type { WiridTitleLang }
