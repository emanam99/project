import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createRekening,
  deleteRekening,
  listRekening,
  updateRekening,
  type RekeningRow,
} from '../api/apiClient'
import { canManageData, getStoredUser } from '../utils/auth'
import { usePageTitle } from '../contexts/PageTitleContext'
import type { RekeningJenis } from '../api/apiClient'

type FormState = {
  nomor_rekening: string
  nama_penerima: string
  online_bank_code: string
  bank_tujuan: string
  jenis: RekeningJenis
}

const emptyForm = (): FormState => ({
  nomor_rekening: '',
  nama_penerima: '',
  online_bank_code: '',
  bank_tujuan: '',
  jenis: 'rek',
})

type PanelMode = 'add' | 'edit' | null

export default function RekeningPage() {
  usePageTitle('Rekening')
  const canManage = canManageData(getStoredUser()?.role)
  const [rows, setRows] = useState<RekeningRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [panel, setPanel] = useState<PanelMode>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const load = async (query = q) => {
    setLoading(true)
    const res = await listRekening({ q: query.trim() || undefined, aktif: 'all' })
    if (res.success && res.data) {
      setRows(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat rekening')
    }
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load(q)
    }, q ? 280 : 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null)
        setEditingId(null)
        setForm(emptyForm())
        setFormError('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  const closePanel = () => {
    setPanel(null)
    setEditingId(null)
    setForm(emptyForm())
    setFormError('')
  }

  const openAdd = () => {
    setOk('')
    setFormError('')
    setEditingId(null)
    setForm(emptyForm())
    setPanel('add')
  }

  const openEdit = (row: RekeningRow) => {
    setOk('')
    setFormError('')
    setEditingId(row.id)
    setForm({
      nomor_rekening: row.nomor_rekening,
      nama_penerima: row.nama_penerima,
      online_bank_code: row.online_bank_code,
      bank_tujuan: row.bank_tujuan,
      jenis: row.jenis === 'va' ? 'va' : 'rek',
    })
    setPanel('edit')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    setOk('')

    const payload = {
      nomor_rekening: form.nomor_rekening.trim(),
      nama_penerima: form.nama_penerima.trim(),
      online_bank_code: form.online_bank_code.trim(),
      bank_tujuan: form.bank_tujuan.trim(),
      jenis: form.jenis,
    }

    const res =
      panel === 'edit' && editingId
        ? await updateRekening(editingId, payload)
        : await createRekening(payload)

    setSaving(false)
    if (res.success) {
      setOk(panel === 'edit' ? 'Rekening diperbarui.' : 'Rekening ditambahkan.')
      closePanel()
      await load()
    } else {
      setFormError(res.message || 'Gagal menyimpan rekening')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    const row = rows.find((r) => r.id === editingId)
    if (!confirm(`Hapus rekening ${row?.nama_penerima || ''} (${row?.nomor_rekening || ''})?`)) return

    setSaving(true)
    setFormError('')
    const res = await deleteRekening(editingId)
    setSaving(false)
    if (res.success) {
      setOk('Rekening dihapus.')
      closePanel()
      await load()
    } else {
      setFormError(res.message || 'Gagal menghapus rekening')
    }
  }

  const panelTitle = panel === 'edit' ? 'Edit rekening' : 'Tambah rekening'

  return (
    <div className="space-y-3.5">
      {canManage && (
        <div className="flex justify-end">
          <button type="button" className="ui-btn-primary shrink-0" onClick={openAdd}>
            + Tambah
          </button>
        </div>
      )}

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="ui-input pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nomor, nama, atau bank…"
          inputMode="search"
        />
      </form>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {loading ? (
        <div className="text-muted text-[13px] py-6 text-center">Memuat rekening…</div>
      ) : rows.length === 0 ? (
        <div className="ui-card p-5 text-center">
          <p className="text-muted text-[13px]">Belum ada rekening.</p>
          {canManage && (
            <button type="button" className="ui-btn-primary mt-3" onClick={openAdd}>
              Tambah rekening pertama
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="ui-card w-full text-left p-2.5 active:scale-[0.99] transition group"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-soft text-ink grid place-items-center font-semibold text-[11px] tracking-wide">
                      {row.online_bank_code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink truncate">
                        {row.nama_penerima}
                      </div>
                      <div className="font-mono text-[12px] text-muted mt-0.5 break-all">
                        {row.nomor_rekening}
                      </div>
                      <div className="text-[11px] text-faint mt-1 line-clamp-2">
                        {row.bank_tujuan}
                        {' · '}
                        <span className="font-semibold text-ink">
                          {row.jenis === 'va' ? 'VA' : 'Rek'}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 mt-0.5 text-faint group-hover:text-ink transition" aria-hidden>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </button>
              ) : (
                <div className="ui-card w-full text-left p-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-soft text-ink grid place-items-center font-semibold text-[11px] tracking-wide">
                      {row.online_bank_code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink truncate">
                        {row.nama_penerima}
                      </div>
                      <div className="font-mono text-[12px] text-muted mt-0.5 break-all">
                        {row.nomor_rekening}
                      </div>
                      <div className="text-[11px] text-faint mt-1 line-clamp-2">
                        {row.bank_tujuan}
                        {' · '}
                        <span className="font-semibold text-ink">
                          {row.jenis === 'va' ? 'VA' : 'Rek'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {panel && (
              <>
                <motion.button
                  type="button"
                  aria-label="Tutup"
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !saving && closePanel()}
                />
                <motion.aside
                  className="ui-offcanvas z-50 safe-bottom"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="rekening-panel-title"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
                    <h2 id="rekening-panel-title" className="font-display text-lg font-bold text-ink">
                      {panelTitle}
                    </h2>
                    <button
                      type="button"
                      className="ui-btn-ghost h-9 w-9 !p-0"
                      onClick={() => !saving && closePanel()}
                      aria-label="Tutup panel"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                      <div>
                        <label className="ui-label">No. rekening</label>
                        <input
                          className="ui-input"
                          required
                          maxLength={16}
                          inputMode="numeric"
                          autoFocus
                          value={form.nomor_rekening}
                          onChange={(e) => setForm((f) => ({ ...f, nomor_rekening: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="ui-label">Nama penerima</label>
                        <input
                          className="ui-input"
                          required
                          maxLength={80}
                          value={form.nama_penerima}
                          onChange={(e) => setForm((f) => ({ ...f, nama_penerima: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="ui-label">Online bank code</label>
                        <input
                          className="ui-input"
                          required
                          maxLength={3}
                          inputMode="numeric"
                          value={form.online_bank_code}
                          onChange={(e) => setForm((f) => ({ ...f, online_bank_code: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="ui-label">Bank tujuan</label>
                        <input
                          className="ui-input"
                          required
                          maxLength={35}
                          value={form.bank_tujuan}
                          onChange={(e) => setForm((f) => ({ ...f, bank_tujuan: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="ui-label">Jenis (VA / Rek)</label>
                        <select
                          className="ui-input"
                          value={form.jenis}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              jenis: e.target.value === 'va' ? 'va' : 'rek',
                            }))
                          }
                        >
                          <option value="rek">Rek — saat Approved → Cair</option>
                          <option value="va">VA — saat Approved → Jatim</option>
                        </select>
                        <p className="mt-1 text-[11px] text-faint">
                          Menentukan status Jatim/Cair otomatis setelah BNI Approved.
                        </p>
                      </div>

                      {formError && (
                        <div className="ui-alert-error">
                          {formError}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-line px-3 py-2.5 space-y-1.5 bg-surface/90">
                      <button type="submit" className="ui-btn-primary w-full" disabled={saving}>
                        {saving ? 'Menyimpan…' : panel === 'edit' ? 'Simpan perubahan' : 'Tambah rekening'}
                      </button>
                      {panel === 'edit' && (
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[var(--danger)] border border-[var(--danger-line)] hover:bg-[var(--danger-bg)] transition disabled:opacity-60"
                          disabled={saving}
                          onClick={() => void handleDelete()}
                        >
                          Hapus rekening
                        </button>
                      )}
                    </div>
                  </form>
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
