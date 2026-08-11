import { createContext, useContext, type RefObject } from 'react'

/** Ref ke `<main class="content">` — satu-satunya area scroll vertikal aplikasi */
export const MainScrollContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function useMainScrollEl(): RefObject<HTMLElement | null> | null {
  return useContext(MainScrollContext)
}
