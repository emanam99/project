export type WiridItem = {
  id: number
  bab: string
  judul: string
  judul_id?: string
  judul_ar?: string
  isi: string
  arti: string
  urutan: number
}

export type WiridBabMeta = {
  id: number
  nama: string
  nama_id?: string
  nama_ar?: string
  urutan: number
  jumlah_entri: number
}

export type ReaderState = {
  rows: WiridItem[]
  babList: WiridBabMeta[]
  loading: boolean
  syncing: boolean
  source: 'api' | 'cache' | null
  lastSyncAt: Date | null
}
