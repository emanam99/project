import type { SleeveLength } from './sleeveStyle'

export const DESIGN_STORAGE_KEY = 'tshirt-mockup:design:v1'

export type PersistedAsset = {
  id: string
  name: string
  url: string
}

export type PersistedDesign = {
  version: 1
  shirtColor: string
  sleeveLength: SleeveLength
  zoom: number
  assets: PersistedAsset[]
  designJson: string
  savedAt: number
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

export function loadPersistedDesign(): PersistedDesign | null {
  try {
    const raw = localStorage.getItem(DESIGN_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedDesign
    if (!data || data.version !== 1 || typeof data.designJson !== 'string') return null
    return data
  } catch {
    return null
  }
}

export function savePersistedDesign(data: Omit<PersistedDesign, 'version' | 'savedAt'>) {
  const payload: PersistedDesign = {
    version: 1,
    savedAt: Date.now(),
    ...data,
  }
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
