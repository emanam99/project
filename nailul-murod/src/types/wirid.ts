export type WiridItem = {
  id: number
  bab: string
  judul: string
  isi: string
  arti: string
}

export type ReaderState = {
  rows: WiridItem[]
  loading: boolean
  syncing: boolean
  source: 'api' | 'cache' | null
  lastSyncAt: Date | null
}
