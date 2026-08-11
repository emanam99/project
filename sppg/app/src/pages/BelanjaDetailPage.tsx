import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addBelanjaItem,
  deleteBelanja,
  deleteBelanjaItem,
  getBelanja,
  listBelanjaItemOptions,
  listKategori,
  listRekening,
  updateBelanja,
  type BelanjaDetail,
  type BelanjaNamaOption,
  type RekeningRow,
} from '../api/apiClient'
import KategoriField from '../components/KategoriField'
import BelanjaLampiran from '../components/BelanjaLampiran'
import SuggestInput from '../components/SuggestInput'
import { usePageTitle } from '../contexts/PageTitleContext'
import {
  canManageData,
  getStoredUser,
  isBniLocked,
  isSuperAdminRole,
} from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'

export default function BelanjaDetailPage() {
  const { id } = useParams()
  const belanjaId = Number(id)
  const navigate = useNavigate()
  const user = getStoredUser()
  const role = user?.role
  const canManage = canManageData(role)
  const isSuper = isSuperAdminRole(role)

  const [detail, setDetail] = useState<BelanjaDetail | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [tanggal, setTanggal] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [rekeningId, setRekeningId] = useState('')
  const [kategori, setKategori] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [rekenings, setRekenings] = useState<RekeningRow[]>([])
  const [namaOptions, setNamaOptions] = useState<BelanjaNamaOption[]>([])
  const [satuanOptions, setSatuanOptions] = useState<string[]>(['pcs'])

  const [nama, setNama] = useState('')
  const [qty, setQty] = useState('1')
  const [satuan, setSatuan] = useState('pcs')
  const [harga, setHarga] = useState('')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)

  const namaList = useMemo(() => namaOptions.map((o) => o.nama), [namaOptions])

  const headerTitle =
    detail?.belanja.keterangan?.trim() ||
    detail?.belanja.kategori?.trim() ||
    (detail ? 'Detail belanja' : 'Belanja')
  usePageTitle(headerTitle)

  const load = async () => {
    if (!belanjaId) return
    setLoading(true)
    const res = await getBelanja(belanjaId)
    if (res.success && res.data) {
      setDetail(res.data)
      setTanggal(res.data.belanja.tanggal)
      setKeterangan(res.data.belanja.keterangan || '')
      setRekeningId(res.data.belanja.rekening_id ? String(res.data.belanja.rekening_id) : '')
      setKategori(res.data.belanja.kategori || '')
      setError('')
    } else {
      setError(res.message || 'Tidak ditemukan')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    void (async () => {
      const [rek, kat, opts] = await Promise.all([
        listRekening(),
        listKategori(),
        listBelanjaItemOptions(),
      ])
      if (rek.success && rek.data) setRekenings(rek.data)
      if (kat.success && kat.data) setCategories(kat.data.map((k) => k.nama))
      if (opts.success && opts.data) {
        setNamaOptions(opts.data.nama_barang || [])
        if (opts.data.satuan?.length) setSatuanOptions(opts.data.satuan)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belanjaId])

  const applyNamaSuggestion = (picked: string) => {
    const found = namaOptions.find((o) => o.nama.toLowerCase() === picked.trim().toLowerCase())
    setNama(found?.nama || picked)
    if (!found) return
    if (!satuan.trim() || satuan === 'pcs') setSatuan(found.satuan || 'pcs')
    if (!harga.trim() && found.harga_satuan > 0) setHarga(String(found.harga_satuan))
  }

  const saveMeta = async () => {
    setSaving(true)
    const locked = isBniLocked(detail?.belanja.bni_status)
    const payload =
      locked && isSuper
        ? {
            keterangan,
            kategori: kategori.trim() || null,
          }
        : {
            tanggal,
            keterangan,
            rekening_id: rekeningId ? Number(rekeningId) : null,
            kategori: kategori.trim() || null,
          }
    const res = await updateBelanja(belanjaId, payload)
    setSaving(false)
    if (res.success && res.data) {
      setDetail(res.data)
      setEditMode(false)
      if (kategori.trim() && !categories.some((c) => c.toLowerCase() === kategori.trim().toLowerCase())) {
        setCategories((prev) => [...prev, kategori.trim()].sort((a, b) => a.localeCompare(b, 'id')))
      }
    } else {
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await addBelanjaItem(belanjaId, {
      nama_barang: nama.trim(),
      qty: Number(qty) || 0,
      satuan: satuan.trim() || 'pcs',
      harga_satuan: Number(harga) || 0,
      catatan: catatan.trim() || undefined,
    })
    setSaving(false)
    if (res.success) {
      const addedNama = nama.trim()
      const addedSatuan = satuan.trim() || 'pcs'
      const addedHarga = Number(harga) || 0
      if (addedNama) {
        setNamaOptions((prev) => {
          const without = prev.filter((o) => o.nama.toLowerCase() !== addedNama.toLowerCase())
          return [{ nama: addedNama, satuan: addedSatuan, harga_satuan: addedHarga }, ...without]
        })
        if (addedSatuan) {
          setSatuanOptions((prev) => {
            if (prev.some((s) => s.toLowerCase() === addedSatuan.toLowerCase())) return prev
            return [addedSatuan, ...prev]
          })
        }
      }
      setNama('')
      setQty('1')
      setSatuan('pcs')
      setHarga('')
      setCatatan('')
      await load()
    } else {
      setError(res.message || 'Gagal menambah item')
    }
  }

  const removeItem = async (itemId: number) => {
    if (!confirm('Hapus item ini?')) return
    const res = await deleteBelanjaItem(belanjaId, itemId)
    if (res.success) await load()
    else setError(res.message || 'Gagal menghapus item')
  }

  const removeBelanja = async () => {
    if (!confirm('Hapus seluruh catatan belanja ini?')) return
    const res = await deleteBelanja(belanjaId)
    if (res.success) navigate('/belanja', { replace: true })
    else setError(res.message || 'Gagal menghapus')
  }

  if (loading) return <div className="text-muted">Memuat…</div>
  if (error && !detail) {
    return <div className="ui-alert-error">{error}</div>
  }
  if (!detail) return null

  const { belanja, items } = detail
  const status = belanja.bni_status || 'belum'
  const cair = belanja.cair_status
  const locked = isBniLocked(status)
  const canEditItems = canManage && !locked
  const canEditMeta = canManage && (!locked || isSuper)
  const canDeleteList = canManage && (!locked || isSuper)
  const metaEditHint = locked && isSuper ? ' (hanya keterangan & kategori)' : ''

  return (
    <div className="space-y-3.5">
      <div>
        <Link to="/belanja" className="text-sm text-muted hover:underline">
          ← Daftar belanja
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">
              {formatDateId(belanja.tanggal)}
              {belanja.kategori ? ` · ${belanja.kategori}` : ''}
              {' · '}
              <span className="font-semibold text-ink">BNI: {status}</span>
              {' · '}
              <span className="font-semibold text-ink">
                Cair: {cair === 'jatim' ? 'Jatim' : cair === 'cair' ? 'Cair' : '—'}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Dibuat oleh:{' '}
              <span className="font-semibold text-ink">
                {belanja.created_by_name || belanja.created_by_email || 'Tidak diketahui'}
              </span>
              {belanja.created_by_name && belanja.created_by_email
                ? ` (${belanja.created_by_email})`
                : ''}
            </p>
            {locked && (
              <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">
                Catatan terkunci ({status}). Item tidak dapat diubah
                {isSuper ? '; super admin masih bisa ubah keterangan/kategori atau hapus list.' : '.'}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Total</div>
            <div className="font-display text-lg font-bold text-ink">{formatRp(belanja.total)}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="ui-alert-error">{error}</div>
      )}
      {okMsg && (
        <div className="ui-alert-ok">{okMsg}</div>
      )}

      <section className="ui-card p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">Detail catatan</h2>
          {canEditMeta && (
            <div className="flex gap-2">
              <button type="button" className="ui-btn-ghost text-sm" onClick={() => setEditMode((v) => !v)}>
                {editMode ? 'Batal' : `Ubah${metaEditHint}`}
              </button>
              {canDeleteList && (
                <button type="button" className="ui-btn-ghost text-[12px] text-[var(--danger)]" onClick={() => void removeBelanja()}>
                  Hapus
                </button>
              )}
            </div>
          )}
        </div>

        {canEditMeta && editMode ? (
          <div className="space-y-2.5">
            {!locked && (
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="ui-label">Tanggal</label>
                  <input type="date" className="ui-input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
                </div>
                <div>
                  <label className="ui-label">Rekening tujuan</label>
                  <select className="ui-input" value={rekeningId} onChange={(e) => setRekeningId(e.target.value)}>
                    <option value="">— Pilih rekening —</option>
                    {rekenings.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nama_penerima} · {r.nomor_rekening} · {r.bank_tujuan}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <KategoriField
              categories={categories}
              value={kategori}
              onChange={setKategori}
              onCategoriesChange={setCategories}
            />
            <div>
              <label className="ui-label">Keterangan</label>
              <textarea
                className="ui-input min-h-[72px] resize-y"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                rows={3}
              />
            </div>
            <button type="button" className="ui-btn-primary" disabled={saving} onClick={() => void saveMeta()}>
              Simpan perubahan
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 text-[13px] text-muted">
            <p>
              <span className="font-semibold text-ink">Rekening:</span>{' '}
              {belanja.nama_penerima
                ? `${belanja.nama_penerima} · ${belanja.nomor_rekening} · ${belanja.bank_tujuan}`
                : '—'}
            </p>
            <p>
              <span className="font-semibold text-ink">Kategori:</span>{' '}
              {belanja.kategori || '—'}
            </p>
            <p>
              <span className="font-semibold text-ink">Keterangan:</span>{' '}
              {belanja.keterangan || '—'}
            </p>
            <p>
              <span className="font-semibold text-ink">Status BNI:</span> {status}
            </p>
          </div>
        )}
      </section>

      <section className="ui-card p-3 space-y-4">
        <h2 className="font-semibold text-ink">Item ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{canEditItems ? 'Belum ada item. Tambahkan di bawah.' : 'Belum ada item.'}</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map((it) => (
              <li key={it.id} className="py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{it.nama_barang}</div>
                  <div className="text-[12px] text-muted mt-0.5">
                    {Number(it.qty)} {it.satuan} × {formatRp(it.harga_satuan)}
                    {it.catatan ? ` · ${it.catatan}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-[13px] font-bold text-ink tabular-nums">{formatRp(it.subtotal)}</div>
                  {canEditItems && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] hover:underline"
                      onClick={() => void removeItem(it.id)}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M4 7h16" strokeLinecap="round" />
                        <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Hapus
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEditItems && (
          <form onSubmit={(e) => void addItem(e)} className="border-t border-line pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-ink">Tambah item</h3>
            <SuggestInput
              required
              placeholder="Nama barang"
              value={nama}
              options={namaList}
              onChange={setNama}
              onSelectSuggestion={applyNamaSuggestion}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                required
                placeholder="Qty"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <SuggestInput
                placeholder="Satuan"
                value={satuan}
                options={satuanOptions}
                onChange={setSatuan}
              />
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                required
                placeholder="Harga"
                value={harga}
                onChange={(e) => setHarga(e.target.value)}
              />
            </div>
            <input
              className="ui-input"
              placeholder="Catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
            <button type="submit" className="ui-btn-primary" disabled={saving}>
              Tambah
            </button>
          </form>
        )}
      </section>

      <BelanjaLampiran
        belanjaId={belanjaId}
        canUpload={canEditItems}
        onMessage={(kind, text) => {
          if (kind === 'error') {
            setError(text)
            setOkMsg('')
          } else {
            setOkMsg(text)
            setError('')
          }
        }}
      />
    </div>
  )
}
