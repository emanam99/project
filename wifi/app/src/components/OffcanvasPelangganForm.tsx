import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createPelanggan,
  deletePelanggan,
  updatePelanggan,
  type Pelanggan,
} from '../api/apiClient'
import { useOverlayHistory } from '../hooks/useOverlayHistory'

export type OffcanvasPelangganFormProps = {
  open: boolean
  onClose: () => void
  pelanggan: Pelanggan | null
  onSaved: (msg: string) => void
  zIndex?: number
}

type FormState = {
  nama: string
  email: string
  no_hp: string
  alamat: string
  paket: string
  keterangan: string
  aktif: boolean
}

const emptyForm = (): FormState => ({
  nama: '',
  email: '',
  no_hp: '',
  alamat: '',
  paket: '',
  keterangan: '',
  aktif: true,
})

/** Offcanvas kanan buat / edit pelanggan (+ email → user). */
export default function OffcanvasPelangganForm({
  open,
  onClose,
  pelanggan,
  onSaved,
  zIndex = 1100,
}: OffcanvasPelangganFormProps) {
  const isEdit = Boolean(pelanggan)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useOverlayHistory(open, onClose, 'pelanggan-form')

  useEffect(() => {
    if (!open) return
    setError('')
    if (pelanggan) {
      setForm({
        nama: pelanggan.nama,
        email: pelanggan.user_email || '',
        no_hp: pelanggan.no_hp || '',
        alamat: pelanggan.alamat || '',
        paket: pelanggan.paket || '',
        keterangan: pelanggan.keterangan || '',
        aktif: pelanggan.aktif,
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, pelanggan])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama.trim(),
      email: form.email.trim(),
      no_hp: form.no_hp.trim() || null,
      alamat: form.alamat.trim() || null,
      paket: form.paket.trim() || null,
      keterangan: form.keterangan.trim() || null,
      aktif: form.aktif,
    }
    const res = isEdit && pelanggan
      ? await updatePelanggan(pelanggan.id, payload)
      : await createPelanggan({ ...payload, nama: payload.nama })
    setSaving(false)
    if (res.success) {
      onSaved(isEdit ? 'Pelanggan diperbarui' : 'Pelanggan ditambahkan')
      onClose()
    } else {
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const handleDelete = async () => {
    if (!pelanggan) return
    if (!window.confirm(`Hapus pelanggan "${pelanggan.nama}"? Tagihan terkait ikut terhapus.`)) return
    setDeleting(true)
    setError('')
    const res = await deletePelanggan(pelanggan.id)
    setDeleting(false)
    if (res.success) {
      onSaved('Pelanggan dihapus')
      onClose()
    } else {
      setError(res.message || 'Gagal menghapus')
    }
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex }}
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="ui-offcanvas"
            style={{ zIndex: zIndex + 1 }}
            role="dialog"
            aria-modal
            aria-label={isEdit ? 'Edit pelanggan' : 'Pelanggan baru'}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3 shrink-0">
              <div>
                <h2 className="font-semibold text-ink text-[15px]">
                  {isEdit ? 'Edit pelanggan' : 'Pelanggan baru'}
                </h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Email menghubungkan / membuat akses user portal
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-soft hover:text-ink"
                onClick={onClose}
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                {error && <div className="ui-alert-error text-[13px]">{error}</div>}

                <div>
                  <label className="ui-label">Nama</label>
                  <input
                    className="ui-input"
                    required
                    value={form.nama}
                    onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ui-label">Email (akses user)</label>
                  <input
                    className="ui-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="nama@gmail.com"
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Jika diisi, user dibuat/dihubungkan otomatis (role user).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="ui-label">No. HP</label>
                    <input
                      className="ui-input"
                      value={form.no_hp}
                      onChange={(e) => setForm((f) => ({ ...f, no_hp: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="ui-label">Paket</label>
                    <input
                      className="ui-input"
                      value={form.paket}
                      onChange={(e) => setForm((f) => ({ ...f, paket: e.target.value }))}
                      placeholder="mis. 20 Mbps"
                    />
                  </div>
                </div>
                <div>
                  <label className="ui-label">Alamat</label>
                  <textarea
                    className="ui-input min-h-[4rem]"
                    value={form.alamat}
                    onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ui-label">Keterangan</label>
                  <input
                    className="ui-input"
                    value={form.keterangan}
                    onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={form.aktif}
                    onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
                  />
                  Aktif
                </label>
              </div>

              <div className="shrink-0 border-t border-line px-4 py-3 safe-bottom space-y-2">
                <button type="submit" className="ui-btn-primary w-full" disabled={saving || deleting}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
                {isEdit && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] px-3 py-2 text-[13px] font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-50"
                    disabled={saving || deleting}
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? 'Menghapus…' : 'Hapus pelanggan'}
                  </button>
                )}
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
