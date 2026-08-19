import { create } from 'zustand'
import type { WebGLRenderer } from 'three'
import type { SleeveLength } from '../lib/sleeveStyle'

export type LeftTab = 'upload' | 'elements' | 'text' | 'ai'
export type EditorTool = 'select' | 'pan'
export type { SleeveLength }

export type AssetItem = {
  id: string
  name: string
  url: string
}

type MockupState = {
  shirtColor: string
  sleeveLength: SleeveLength
  textureRevision: number
  canvasEl: HTMLCanvasElement | null
  pendingLogoUrl: string | null
  pendingKind: 'image' | 'text' | 'rect' | 'circle' | null
  assets: AssetItem[]
  leftTab: LeftTab
  tool: EditorTool
  zoom: number
  history: string[]
  historyIndex: number
  restoreJson: string | null
  gl: WebGLRenderer | null
  setShirtColor: (color: string) => void
  setSleeveLength: (sleeveLength: SleeveLength) => void
  setCanvasEl: (el: HTMLCanvasElement | null) => void
  bumpTexture: () => void
  enqueueLogo: (url: string) => void
  enqueueShape: (kind: 'text' | 'rect' | 'circle') => void
  consumePending: () => void
  addAsset: (file: File) => void
  setLeftTab: (tab: LeftTab) => void
  setTool: (tool: EditorTool) => void
  setZoom: (zoom: number) => void
  pushHistory: (json: string) => void
  undo: () => void
  redo: () => void
  clearRestore: () => void
  setGl: (gl: WebGLRenderer | null) => void
}

export const useMockupStore = create<MockupState>((set, get) => ({
  shirtColor: '#ffffff',
  sleeveLength: 'short',
  textureRevision: 0,
  canvasEl: null,
  pendingLogoUrl: null,
  pendingKind: null,
  assets: [],
  leftTab: 'upload',
  tool: 'select',
  zoom: 0.82,
  history: [],
  historyIndex: -1,
  restoreJson: null,
  gl: null,
  setShirtColor: (shirtColor) => set({ shirtColor }),
  setSleeveLength: (sleeveLength) => set({ sleeveLength }),
  setCanvasEl: (canvasEl) => set({ canvasEl }),
  bumpTexture: () => set((s) => ({ textureRevision: s.textureRevision + 1 })),
  enqueueLogo: (pendingLogoUrl) => set({ pendingLogoUrl, pendingKind: 'image' }),
  enqueueShape: (pendingKind) => set({ pendingKind, pendingLogoUrl: null }),
  consumePending: () => set({ pendingLogoUrl: null, pendingKind: null }),
  addAsset: (file) => {
    const url = URL.createObjectURL(file)
    const item: AssetItem = { id: crypto.randomUUID(), name: file.name, url }
    set((s) => ({
      assets: [item, ...s.assets],
      pendingLogoUrl: url,
      pendingKind: 'image',
    }))
  },
  setLeftTab: (leftTab) => set({ leftTab }),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.25, zoom)) }),
  pushHistory: (json) => {
    const { history, historyIndex } = get()
    const next = history.slice(0, historyIndex + 1)
    next.push(json)
    const trimmed = next.slice(-40)
    set({ history: trimmed, historyIndex: trimmed.length - 1 })
  },
  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const next = historyIndex - 1
    set({ historyIndex: next, restoreJson: history[next] ?? null })
  },
  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const next = historyIndex + 1
    set({ historyIndex: next, restoreJson: history[next] ?? null })
  },
  clearRestore: () => set({ restoreJson: null }),
  setGl: (gl) => set({ gl }),
}))
