import { create } from 'zustand'
import type { WebGLRenderer } from 'three'
import type { SleeveLength } from '../lib/sleeveStyle'
import { fileToDataUrl, loadPersistedDesign, savePersistedDesign } from '../lib/persistDesign'

export type LeftTab = 'upload' | 'elements' | 'text' | 'ai'
export type EditorTool = 'select' | 'pan'
export type { SleeveLength }

export type AssetItem = {
  id: string
  name: string
  url: string
}

const boot = loadPersistedDesign()

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
  persistedDesign: string | null
  designBootstrapped: boolean
  saveHint: number
  gl: WebGLRenderer | null
  setShirtColor: (color: string) => void
  setSleeveLength: (sleeveLength: SleeveLength) => void
  setCanvasEl: (el: HTMLCanvasElement | null) => void
  bumpTexture: () => void
  enqueueLogo: (url: string) => void
  enqueueShape: (kind: 'text' | 'rect' | 'circle') => void
  consumePending: () => void
  addAsset: (file: File) => Promise<void>
  setLeftTab: (tab: LeftTab) => void
  setTool: (tool: EditorTool) => void
  setZoom: (zoom: number) => void
  pushHistory: (json: string) => void
  undo: () => void
  redo: () => void
  clearRestore: () => void
  markDesignBootstrapped: () => void
  persistDesign: (designJson?: string) => boolean
  setGl: (gl: WebGLRenderer | null) => void
}

function persistFromState(
  state: Pick<MockupState, 'shirtColor' | 'sleeveLength' | 'zoom' | 'assets' | 'history' | 'historyIndex'>,
  designJson?: string,
) {
  const json =
    designJson ??
    (state.historyIndex >= 0 ? state.history[state.historyIndex] : undefined) ??
    '{"version":"6.0.0","objects":[]}'
  return savePersistedDesign({
    shirtColor: state.shirtColor,
    sleeveLength: state.sleeveLength,
    zoom: state.zoom,
    assets: state.assets,
    designJson: json,
  })
}

export const useMockupStore = create<MockupState>((set, get) => ({
  shirtColor: boot?.shirtColor ?? '#ffffff',
  sleeveLength: boot?.sleeveLength ?? 'short',
  textureRevision: 0,
  canvasEl: null,
  pendingLogoUrl: null,
  pendingKind: null,
  assets: boot?.assets ?? [],
  leftTab: 'upload',
  tool: 'select',
  zoom: boot?.zoom ?? 0.82,
  history: [],
  historyIndex: -1,
  restoreJson: null,
  persistedDesign: boot?.designJson ?? null,
  designBootstrapped: false,
  saveHint: 0,
  gl: null,
  setShirtColor: (shirtColor) => {
    set({ shirtColor })
    persistFromState(get())
  },
  setSleeveLength: (sleeveLength) => {
    set({ sleeveLength })
    persistFromState(get())
  },
  setCanvasEl: (canvasEl) => set({ canvasEl }),
  bumpTexture: () => set((s) => ({ textureRevision: s.textureRevision + 1 })),
  enqueueLogo: (pendingLogoUrl) => set({ pendingLogoUrl, pendingKind: 'image' }),
  enqueueShape: (pendingKind) => set({ pendingKind, pendingLogoUrl: null }),
  consumePending: () => set({ pendingLogoUrl: null, pendingKind: null }),
  addAsset: async (file) => {
    const url = await fileToDataUrl(file)
    const item: AssetItem = { id: crypto.randomUUID(), name: file.name, url }
    set((s) => ({
      assets: [item, ...s.assets].slice(0, 40),
      pendingLogoUrl: url,
      pendingKind: 'image',
    }))
    persistFromState(get())
  },
  setLeftTab: (leftTab) => set({ leftTab }),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => {
    const next = Math.min(2, Math.max(0.25, zoom))
    set({ zoom: next })
    persistFromState(get())
  },
  pushHistory: (json) => {
    const { history, historyIndex } = get()
    const next = history.slice(0, historyIndex + 1)
    next.push(json)
    const trimmed = next.slice(-40)
    set({ history: trimmed, historyIndex: trimmed.length - 1 })
    persistFromState(get(), json)
  },
  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const next = historyIndex - 1
    set({ historyIndex: next, restoreJson: history[next] ?? null })
    persistFromState({ ...get(), historyIndex: next }, history[next])
  },
  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const next = historyIndex + 1
    set({ historyIndex: next, restoreJson: history[next] ?? null })
    persistFromState({ ...get(), historyIndex: next }, history[next])
  },
  clearRestore: () => set({ restoreJson: null }),
  markDesignBootstrapped: () => set({ designBootstrapped: true, persistedDesign: null }),
  persistDesign: (designJson) => {
    const ok = persistFromState(get(), designJson)
    if (ok) set((s) => ({ saveHint: s.saveHint + 1 }))
    return ok
  },
  setGl: (gl) => set({ gl }),
}))
