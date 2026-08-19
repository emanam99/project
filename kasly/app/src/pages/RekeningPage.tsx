import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createRekening,
  createRekeningTransfer,
  deleteRekening,
  listRekening,
  listRekeningTransfer,
  updateRekening,
  type RekeningRow,
  type RekeningTipe,
  type RekeningTransferRow,
} from '../api/apiClient'
import { tipeLabel } from '../components/AlokasiEditor'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser } from '../utils/auth'
import { formatDateId, formatRp, todayYmd } from '../utils/format'

type FormState = {
  nama: string
  tipe: Exclude<RekeningTipe, 'cash'>
  nomor: string
}

const emptyForm = (): FormState => ({ nama: '', tipe: 'bank', nomor: '' })

type PanelMode = 'add' | 'edit' | 'transfer' | null

export default function RekeningPage() {
  usePageTitle('Rekening')
  const canManage = canManageData(getStoredUser()?.role)
  const [rows, setRows] = useState<RekeningRow[]>([])
  const [ringkas, setRingkas] = useState({ bank: 0, ewallet: 0, cash: 0 })
  const [transfers, setTransfers] = useState<RekeningTransferRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [panel, setPanel] = useState<PanelMode>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [tf, setTf] = useState({
    tanggal: todayYmd(),
    dari_rekening_id: '',
    ke_rekening_id: '',
    jumlah: '',
    biaya_admin: '',
    keterangan: '',
  })

  const aktif = useMemo(() => rows.filter((r) => Number(r.aktif) === 1), [rows])
  const total = ringkas.bank + ringkas.ewallet + ringkas.cash

  const load = async (query = q) => {
    setLoading(true)
    const [rek, tfRes] = await Promise.all([
      listRekening({ q: query.trim() || undefined, aktif: 'all' }),
      listRekeningTransfer(),
    ])
    if (rek.success && rek.data) {
      setRows(rek.data.rekening || [])
      setRingkas(rek.data.ringkas || { bank: 0, ewallet: 0, cash: 0 })
      setError('')
    } else {
      setError(rek.message || 'Gagal memuat rekening')
    }
    if (tfRes.success && tfRes.data) setTransfers(tfRes.data)
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
      if (e.key === 'Escape' && !saving) closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, saving])

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
    if (row.tipe === 'cash') {
      setOk('')
      setFormError('')
      setEditingId(row.id)
      setForm({ nama: row.nama, tipe: 'bank', nomor: row.nomor || '' })
      setPanel('edit')
      return
    }
    setOk('')
    setFormError('')
    setEditingId(row.id)
    setForm({
      nama: row.nama,
      tipe: row.tipe === 'ewallet' ? 'ewallet' : 'bank',
      nomor: row.nomor || '',
    })
    setPanel('edit')
  }

  const openTransfer = () => {
    setOk('')
    setFormError('')
    const cash = aktif.find((r) => r.tipe === 'cash')
    const other = aktif.find((r) => r.id !== cash?.id)
    setTf({
      tanggal: todayYmd(),
      dari_rekening_id: other ? String(other.id) : '',
      ke_rekening_id: cash ? String(cash.id) : '',
      jumlah: '',
      biaya_admin: '',
      keterangan: '',
    })
    setPanel('transfer')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    setOk('')
    const editing = rows.find((r) => r.id === editingId)
    const res =
      panel === 'edit' && editingId
        ? await updateRekening(editingId, {
            nama: form.nama.trim(),
            nomor: form.nomor.trim() || null,
          })
        : await createRekening({
            nama: form.nama.trim(),
            tipe: form.tipe,
            nomor: form.nomor.trim() || undefined,
          })
    setSaving(false)
    if (res.success) {
      setOk(panel === 'edit' ? 'Rekening diperbarui.' : `${editing?.tipe === 'cash' ? 'Cash' : 'Rekening'} ditambahkan.`)
      closePanel()
      await load()
    } else {
      setFormError(res.message || 'Gagal menyimpan rekening')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    const row = rows.find((r) => r.id === editingId)
    if (Number(row?.is_system) === 1) return
    if (!confirm(`Hapus rekening ${row?.nama || ''}?`)) return
    setSaving(true)
    const res = await deleteRekening(editingId)
    setSaving(false)
    if (res.success) {
      setOk('Rekening dihapus.')
      closePanel()
      await load()
    } else {
      setFormError(res.message || 'Gagal menghapus')
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    const res = await createRekeningTransfer({
      tanggal: tf.tanggal,
      dari_rekening_id: Number(tf.dari_rekening_id),
      ke_rekening_id: Number(tf.ke_rekening_id),
      jumlah: Number(tf.jumlah) || 0,
      biaya_admin: Number(tf.biaya_admin) || 0,
      keterangan: tf.keterangan.trim() || undefined,
    })
    setSaving(false)
    if (res.success) {
      setOk('Dana dipindahkan.')
      closePanel()
      await load()
    } else {
      setFormError(res.message || 'Gagal memindahkan dana')
    }
  }

  const editingRow = rows.find((r) => r.id === editingId)
  const panelTitle =
    panel === 'transfer' ? 'Pindah dana' : panel === 'edit' ? 'Edit rekening' : 'Tambah rekening'
  const isCashEdit = panel === 'edit' && Number(editingRow?.is_system) === 1

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {[
          { label: 'Bank', value: ringkas.bank },
          { label: 'E-wallet', value: ringkas.ewallet },
          { label: 'Cash', value: ringkas.cash },
          { label: 'Total', value: total, accent: true },
        ].map((c) => (
          <div
            key={c.label}
            className={[
              'ui-card p-2.5 min-w-0',
              'accent' in c && c.accent
                ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]'
                : '',
            ].join(' ')}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{c.label}</div>
            <div className="mt-1 font-display text-base font-bold text-ink tabular-nums break-all">{formatRp(c.value)}</div>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="ui-btn-ghost" onClick={openTransfer}>
            Pindah dana
          </button>
          <button type="button" className="ui-btn-primary" onClick={openAdd}>
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
          placeholder="Cari nama atau nomor…"
          inputMode="search"
        />
      </form>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {loading ? (
        <div className="text-muted text-[13px] py-6 text-center">Memuat rekening…</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              {canManage ? (
                <button type="button" onClick={() => openEdit(row)} className="ui-card w-full text-left p-2.5 active:scale-[0.99] transition group">
                  <RekCard row={row} />
                </button>
              ) : (
                <div className="ui-card w-full p-2.5">
                  <RekCard row={row} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {transfers.length > 0 && (
        <section className="ui-card p-3">
          <h2 className="ui-section-title mb-2">Pemindahan dana</h2>
          <ul className="divide-y divide-[var(--line)]">
            {transfers.slice(0, 12).map((t) => {
              const admin = Number(t.biaya_admin || 0)
              return (
                <li key={t.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">
                      {t.dari_nama} → {t.ke_nama}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {formatDateId(t.tanggal)}
                      {admin > 0 ? ` · admin ${formatRp(admin)}` : ''}
                      {t.keterangan ? ` · ${t.keterangan}` : ''}
                      {t.belanja_id ? (
                        <>
                          {' · '}
                          <Link to={`/keluar/${t.belanja_id}`} className="text-[var(--accent)] font-medium">
                            lihat pengeluaran
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{formatRp(t.jumlah)}</div>
                </li>
              )
            })}
          </ul>
        </section>
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
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
                    <h2 className="font-display text-lg font-bold text-ink">{panelTitle}</h2>
                    <button type="button" className="ui-btn-ghost h-9 w-9 !p-0" onClick={() => !saving && closePanel()}>
                      ✕
                    </button>
                  </div>

                  {panel === 'transfer' ? (
                    <form onSubmit={(e) => void handleTransfer(e)} className="flex-1 flex flex-col min-h-0">
                      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        <div>
                          <label className="ui-label">Tanggal</label>
                          <input
                            type="date"
                            required
                            className="ui-input"
                            value={tf.tanggal}
                            onChange={(e) => setTf((s) => ({ ...s, tanggal: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="ui-label">Dari</label>
                          <select
                            className="ui-input"
                            required
                            value={tf.dari_rekening_id}
                            onChange={(e) => setTf((s) => ({ ...s, dari_rekening_id: e.target.value }))}
                          >
                            <option value="">Pilih rekening</option>
                            {aktif.map((r) => (
                              <option key={r.id} value={r.id}>
                                {tipeLabel(r.tipe)} · {r.nama} ({formatRp(r.saldo || 0)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="ui-label">Ke</label>
                          <select
                            className="ui-input"
                            required
                            value={tf.ke_rekening_id}
                            onChange={(e) => setTf((s) => ({ ...s, ke_rekening_id: e.target.value }))}
                          >
                            <option value="">Pilih rekening</option>
                            {aktif.map((r) => (
                              <option key={r.id} value={r.id}>
                                {tipeLabel(r.tipe)} · {r.nama}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="ui-label">Jumlah dipindah</label>
                          <input
                            className="ui-input"
                            type="number"
                            min="0"
                            step="any"
                            required
                            value={tf.jumlah}
                            onChange={(e) => setTf((s) => ({ ...s, jumlah: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="ui-label">Biaya admin (opsional)</label>
                          <input
                            className="ui-input"
                            type="number"
                            min="0"
                            step="any"
                            value={tf.biaya_admin}
                            onChange={(e) => setTf((s) => ({ ...s, biaya_admin: e.target.value }))}
                            placeholder="0"
                          />
                          <p className="mt-1 text-[11px] text-muted">
                            Dipotong dari rekening asal dan tercatat sebagai pengeluaran
                            {Number(tf.biaya_admin) > 0
                              ? ` · total keluar ${formatRp((Number(tf.jumlah) || 0) + (Number(tf.biaya_admin) || 0))}`
                              : ''}
                            .
                          </p>
                        </div>
                        <div>
                          <label className="ui-label">Keterangan</label>
                          <input
                            className="ui-input"
                            value={tf.keterangan}
                            onChange={(e) => setTf((s) => ({ ...s, keterangan: e.target.value }))}
                            placeholder="Opsional"
                          />
                        </div>
                        {formError && <div className="ui-alert-error">{formError}</div>}
                      </div>
                      <div className="border-t border-line px-3 py-2.5 bg-surface/90">
                        <button type="submit" className="ui-btn-primary w-full" disabled={saving}>
                          {saving ? 'Menyimpan…' : 'Pindahkan'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 flex flex-col min-h-0">
                      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {!isCashEdit && panel === 'add' && (
                          <div>
                            <label className="ui-label">Tipe</label>
                            <select
                              className="ui-input"
                              value={form.tipe}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, tipe: e.target.value === 'ewallet' ? 'ewallet' : 'bank' }))
                              }
                            >
                              <option value="bank">Bank</option>
                              <option value="ewallet">E-wallet</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="ui-label">{isCashEdit ? 'Nama (Cash)' : 'Nama'}</label>
                          <input
                            className="ui-input"
                            required
                            maxLength={80}
                            autoFocus
                            value={form.nama}
                            onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="ui-label">Nomor (opsional)</label>
                          <input
                            className="ui-input"
                            maxLength={32}
                            value={form.nomor}
                            onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
                            placeholder={isCashEdit ? 'Tidak wajib' : 'No. rekening / HP e-wallet'}
                          />
                        </div>
                        {isCashEdit && (
                          <p className="text-[11px] text-faint">Cash wajib ada di daftar rekening dan tidak dapat dihapus.</p>
                        )}
                        {formError && <div className="ui-alert-error">{formError}</div>}
                      </div>
                      <div className="border-t border-line px-3 py-2.5 space-y-1.5 bg-surface/90">
                        <button type="submit" className="ui-btn-primary w-full" disabled={saving}>
                          {saving ? 'Menyimpan…' : panel === 'edit' ? 'Simpan perubahan' : 'Tambah rekening'}
                        </button>
                        {panel === 'edit' && !isCashEdit && (
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
                  )}
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

function RekCard({ row }: { row: RekeningRow }) {
  const code = row.tipe === 'ewallet' ? 'EW' : row.tipe === 'cash' ? 'CS' : 'BK'
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-soft text-ink grid place-items-center font-semibold text-[11px] tracking-wide">
        {code}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink truncate">{row.nama}</div>
        <div className="text-[11px] text-muted mt-0.5">
          {tipeLabel(row.tipe)}
          {row.nomor ? ` · ${row.nomor}` : ''}
          {Number(row.aktif) !== 1 ? ' · nonaktif' : ''}
        </div>
      </div>
      <div className="text-[13px] font-bold text-ink tabular-nums whitespace-nowrap">{formatRp(row.saldo || 0)}</div>
    </div>
  )
}
