import { useEffect, useRef, useState } from 'react'
import {
  deleteBelanjaFile,
  downloadBelanjaFileBlob,
  listBelanjaFiles,
  uploadBelanjaFile,
  type BelanjaFileRow,
} from '../api/apiClient'
import { compressImage } from '../utils/imageCompression'

export type PendingBelanjaFile = {
  id: string
  file: File
  nama_file: string
  ukuran_file: number
  tipe_file: string
}

type Props = {
  /** Mode edit: belanja sudah ada — upload langsung */
  belanjaId?: number
  canUpload: boolean
  /** Create mode: tampilkan & kelola pending */
  pendingFiles?: PendingBelanjaFile[]
  onPendingChange?: (files: PendingBelanjaFile[]) => void
  onMessage?: (kind: 'ok' | 'error' | 'info', text: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(mime?: string | null, name?: string): boolean {
  if (mime?.startsWith('image/')) return true
  const ext = name?.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')
}

async function prepareFileForUpload(
  file: File,
  onMessage?: Props['onMessage'],
): Promise<File | null> {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]
  const allowedExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'xls', 'xlsx']
  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  if (/\.(php|phtml|phar|cgi|exe|js|html?|svg)(\.|$)/i.test(file.name)) {
    onMessage?.('error', 'Nama file tidak diizinkan (mencurigakan).')
    return null
  }

  if (!allowedExt.includes(ext)) {
    onMessage?.('error', 'Tipe file tidak diizinkan. Hanya gambar, PDF, atau Excel (.xls, .xlsx).')
    return null
  }
  // Jangan andalkan MIME saja (Excel sering octet-stream), tapi tolak tipe jelas salah
  if (
    file.type &&
    !allowedTypes.includes(file.type) &&
    !file.type.startsWith('image/') &&
    file.type !== 'application/zip'
  ) {
    // tetap boleh jika ekstensi Excel/PDF valid
    if (!['pdf', 'xls', 'xlsx'].includes(ext)) {
      onMessage?.('error', 'Tipe file tidak diizinkan.')
      return null
    }
  }

  const isExcel = ext === 'xls' || ext === 'xlsx'
  const maxSize = isExcel ? 5 * 1024 * 1024 : 10 * 1024 * 1024
  if (file.size > maxSize) {
    onMessage?.(
      'error',
      isExcel
        ? 'Ukuran Excel terlalu besar. Maksimal 5 MB.'
        : 'Ukuran file terlalu besar. Maksimal 10 MB.',
    )
    return null
  }

  const compressible =
    (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type) ||
      ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) &&
    file.size > 1024 * 1024

  if (!compressible) return file

  try {
    onMessage?.('info', 'Mengompresi gambar…')
    const compressed = await compressImage(file, 1)
    const fromKb = (file.size / 1024).toFixed(0)
    const toKb = (compressed.size / 1024).toFixed(0)
    onMessage?.('ok', `Gambar dikompresi: ${fromKb} KB → ${toKb} KB`)
    return compressed
  } catch {
    onMessage?.('info', 'Gagal mengompresi, memakai file asli')
    return file
  }
}

export default function BelanjaLampiran({
  belanjaId,
  canUpload,
  pendingFiles = [],
  onPendingChange,
  onMessage,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<BelanjaFileRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [previewIsImage, setPreviewIsImage] = useState(true)

  const isCreate = !belanjaId

  const load = async () => {
    if (!belanjaId) return
    setLoading(true)
    const res = await listBelanjaFiles(belanjaId)
    setLoading(false)
    if (res.success && res.data) setFiles(res.data)
    else onMessage?.('error', res.message || 'Gagal memuat lampiran')
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belanjaId])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await prepareFileForUpload(file, onMessage)
    if (inputRef.current) inputRef.current.value = ''
    if (!prepared) return

    if (isCreate) {
      onPendingChange?.([
        ...pendingFiles,
        {
          id: `${Date.now()}-${Math.random()}`,
          file: prepared,
          nama_file: prepared.name,
          ukuran_file: prepared.size,
          tipe_file: prepared.type,
        },
      ])
      onMessage?.('info', 'File akan di-upload setelah catatan disimpan')
      return
    }

    if (!belanjaId) return
    setUploading(true)
    const res = await uploadBelanjaFile(belanjaId, prepared)
    setUploading(false)
    if (res.success) {
      onMessage?.('ok', 'File berhasil di-upload')
      await load()
    } else {
      onMessage?.('error', res.message || 'Gagal meng-upload file')
    }
  }

  const removePending = (id: string) => {
    onPendingChange?.(pendingFiles.filter((f) => f.id !== id))
  }

  const removeFile = async (id: number) => {
    if (!window.confirm('Hapus lampiran ini?')) return
    const res = await deleteBelanjaFile(id)
    if (res.success) {
      setFiles((prev) => prev.filter((f) => f.id !== id))
      onMessage?.('ok', 'Lampiran dihapus')
    } else {
      onMessage?.('error', res.message || 'Gagal menghapus')
    }
  }

  const openPreview = async (row: BelanjaFileRow) => {
    const res = await downloadBelanjaFileBlob(row.id)
    if (!res.success) {
      onMessage?.('error', res.message)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(res.blob)
    setPreviewUrl(url)
    setPreviewName(row.nama_file)
    setPreviewIsImage(isImageType(row.tipe_file, row.nama_file))
  }

  const openPendingPreview = (p: PendingBelanjaFile) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(p.file)
    setPreviewUrl(url)
    setPreviewName(p.nama_file)
    setPreviewIsImage(isImageType(p.tipe_file, p.nama_file))
  }

  return (
    <section className="ui-card p-3 space-y-3">
      <div>
        <h2 className="font-semibold text-ink">File lampiran</h2>
        <p className="text-[12px] text-muted mt-0.5">
          {isCreate
            ? 'Pilih foto, PDF, atau Excel (.xls/.xlsx). File di-upload setelah catatan disimpan. Gambar &gt;1 MB dikompres; PDF maks. 10 MB; Excel maks. 5 MB.'
            : 'Upload foto, PDF, atau Excel (.xls/.xlsx). Gambar &gt;1 MB dikompres; PDF maks. 10 MB; Excel maks. 5 MB.'}
        </p>
      </div>

      {canUpload && (
        <label
          className={`ui-btn-ghost inline-flex items-center gap-2 cursor-pointer ${
            uploading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
          {uploading ? 'Mengupload…' : 'Pilih file'}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,.pdf,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handlePick(e)}
          />
        </label>
      )}

      {isCreate && pendingFiles.length > 0 && (
        <ul className="space-y-1.5">
          {pendingFiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2"
            >
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => openPendingPreview(p)}
              >
                <div className="text-[13px] font-semibold text-ink truncate">{p.nama_file}</div>
                <div className="text-[11px] text-muted">
                  {formatFileSize(p.ukuran_file)} · menunggu upload
                </div>
              </button>
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--danger)] shrink-0"
                onClick={() => removePending(p.id)}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isCreate && (
        <>
          {loading ? (
            <p className="text-[13px] text-muted">Memuat lampiran…</p>
          ) : files.length === 0 ? (
            <p className="text-[13px] text-muted">Belum ada lampiran.</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-soft px-2.5 py-2"
                >
                  <button type="button" className="min-w-0 text-left" onClick={() => void openPreview(f)}>
                    <div className="text-[13px] font-semibold text-ink truncate">{f.nama_file}</div>
                    <div className="text-[11px] text-muted">
                      {formatFileSize(Number(f.ukuran_file) || 0)}
                      {f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ''}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-accent"
                      onClick={() => void openPreview(f)}
                    >
                      Lihat
                    </button>
                    {canUpload && (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-[var(--danger)]"
                        onClick={() => void removeFile(f.id)}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => {
            URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
          }}
        >
          <div
            className="max-h-[90vh] max-w-[min(960px,100%)] w-full overflow-auto rounded-xl bg-surface p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-ink truncate">{previewName}</div>
              <button
                type="button"
                className="ui-btn-ghost text-[12px]"
                onClick={() => {
                  URL.revokeObjectURL(previewUrl)
                  setPreviewUrl(null)
                }}
              >
                Tutup
              </button>
            </div>
            {previewIsImage ? (
              <img src={previewUrl} alt={previewName} className="mx-auto max-h-[75vh] max-w-full object-contain" />
            ) : (
              <iframe title={previewName} src={previewUrl} className="h-[75vh] w-full rounded-lg border border-line" />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** Upload antrian pending setelah belanja dibuat. */
export async function uploadPendingBelanjaFiles(
  belanjaId: number,
  pending: PendingBelanjaFile[],
): Promise<{ ok: number; fail: number }> {
  let ok = 0
  let fail = 0
  for (const p of pending) {
    const res = await uploadBelanjaFile(belanjaId, p.file)
    if (res.success) ok += 1
    else fail += 1
  }
  return { ok, fail }
}
