import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import AlokasiEditor, { alokasiPayload, emptyAlokasi, type AlokasiDraft } from '../components/AlokasiEditor'
import KategoriField from '../components/KategoriField'
import BelanjaLampiran from '../components/BelanjaLampiran'
import SuggestInput from '../components/SuggestInput'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser, jenisBase, jenisFromPath, jenisLabel } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'

export default function BelanjaDetailPage() {
  const { id } = useParams()
  const belanjaId = Number(id)
  const location = useLocation()
  const navigate = useNavigate()
  const pathJenis = jenisFromPath(location.pathname)
  const canManage = canManageData(getStoredUser()?.role)

  const [detail, setDetail] = useState<BelanjaDetail | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [tanggal, setTanggal] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [kategori, setKategori] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [namaOptions, setNamaOptions] = useState<BelanjaNamaOption[]>([])
  const [satuanOptions, setSatuanOptions] = useState<string[]>(['pcs'])
  const [rekening, setRekening] = useState<RekeningRow[]>([])
  const [alokasi, setAlokasi] = useState<AlokasiDraft[]>([])

  const [nama, setNama] = useState('')
  const [qty, setQty] = useState('1')
  const [satuan, setSatuan] = useState('pcs')
  const [harga, setHarga] = useState('')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)

  const jenis = detail?.belanja.jenis || pathJenis
  const base = jenisBase(jenis)
  const namaList = useMemo(() => namaOptions.map((o) => o.nama), [namaOptions])

  const headerTitle =
    detail?.belanja.keterangan?.trim() ||
    detail?.belanja.kategori?.trim() ||
    (detail ? jenisLabel(jenis) : 'Catatan')
  usePageTitle(headerTitle)

  const load = async () => {
    if (!belanjaId) return
    setLoading(true)
    const res = await getBelanja(belanjaId)
    if (res.success && res.data) {
      setDetail(res.data)
      setTanggal(res.data.belanja.tanggal)
      setKeterangan(res.data.belanja.keterangan || '')
      setKategori(res.data.belanja.kategori || '')
      const al = res.data.alokasi || res.data.belanja.alokasi || []
      setAlokasi(
        al.length
          ? al.map((a) => ({
              key: `${a.rekening_id}-${a.id || Math.random()}`,
              rekening_id: String(a.rekening_id),
              jumlah: String(Number(a.jumlah) || 0),
            }))
          : [emptyAlokasi()],
      )
      setError('')
    } else {
      setError(res.message || 'Tidak ditemukan')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    void (async () => {
      const [kat, opts, rek] = await Promise.all([
        listKategori(pathJenis),
        listBelanjaItemOptions(pathJenis),
        listRekening(),
      ])
      if (kat.success && kat.data) setCategories(kat.data.map((k) => k.nama))
      if (opts.success && opts.data) {
        setNamaOptions(opts.data.nama_barang || [])
        if (opts.data.satuan?.length) setSatuanOptions(opts.data.satuan)
      }
      if (rek.success && rek.data?.rekening) {
        setRekening(rek.data.rekening.filter((r) => Number(r.aktif) === 1))
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
    const res = await updateBelanja(belanjaId, {
      tanggal,
      keterangan,
      kategori: kategori.trim() || null,
      alokasi: alokasiPayload(alokasi),
    })
    setSaving(false)
    if (res.success && res.data) {
      setDetail(res.data)
      setEditMode(false)
      setOkMsg('Perubahan disimpan')
      setError('')
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
      setNama('')
      setQty('1')
      setSatuan('pcs')
      setHarga('')
      setCatatan('')
      setOkMsg('Item ditambah')
      setError('')
      await load()
    } else {
      setError(res.message || 'Gagal menambah item')
    }
  }

  const removeItem = async (itemId: number) => {
    if (!confirm('Hapus item ini?')) return
    const res = await deleteBelanjaItem(belanjaId, itemId)
    if (res.success) {
      setOkMsg('Item dihapus')
      await load()
    } else {
      setError(res.message || 'Gagal menghapus item')
    }
  }

  const removeBelanja = async () => {
    if (!confirm('Hapus seluruh catatan ini?')) return
    const res = await deleteBelanja(belanjaId)
    if (res.success) navigate(base, { replace: true })
    else setError(res.message || 'Gagal menghapus')
  }

  if (loading) return <div className="text-muted">Memuat…</div>
  if (error && !detail) {
    return <div className="ui-alert-error">{error}</div>
  }
  if (!detail) return null

  const { belanja, items } = detail

  return (
    <div className="space-y-3.5">
      <div>
        <Link to={base} className="text-sm text-muted hover:underline">
          ← Daftar {jenisLabel(jenis).toLowerCase()}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">
              {formatDateId(belanja.tanggal)}
              {belanja.kategori ? ` · ${belanja.kategori}` : ''}
              {' · '}
              <span className="font-semibold text-ink">{jenisLabel(jenis)}</span>
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
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Total</div>
            <div
              className={[
                'font-display text-lg font-bold tabular-nums',
                jenis === 'masuk' ? 'text-[var(--ok-ink)]' : 'text-ink',
              ].join(' ')}
            >
              {jenis === 'masuk' ? '+' : '−'}
              {formatRp(belanja.total)}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}
      {okMsg && <div className="ui-alert-ok">{okMsg}</div>}

      <section className="ui-card p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">Detail catatan</h2>
          {canManage && (
            <div className="flex gap-2">
              <button type="button" className="ui-btn-ghost text-sm" onClick={() => setEditMode((v) => !v)}>
                {editMode ? 'Batal' : 'Ubah'}
              </button>
              <button type="button" className="ui-btn-ghost text-[12px] text-[var(--danger)]" onClick={() => void removeBelanja()}>
                Hapus
              </button>
            </div>
          )}
        </div>

        {canManage && editMode ? (
          <div className="space-y-2.5">
            <div>
              <label className="ui-label">Tanggal</label>
              <input type="date" className="ui-input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
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
            <AlokasiEditor
              rekening={rekening}
              rows={alokasi}
              total={Number(belanja.total) || 0}
              jenis={jenis}
              onChange={setAlokasi}
            />
            <button type="button" className="ui-btn-primary" disabled={saving} onClick={() => void saveMeta()}>
              Simpan perubahan
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 text-[13px] text-muted">
            <p>
              <span className="font-semibold text-ink">Kategori:</span> {belanja.kategori || '—'}
            </p>
            <p>
              <span className="font-semibold text-ink">Keterangan:</span> {belanja.keterangan || '—'}
            </p>
            <p>
              <span className="font-semibold text-ink">{jenis === 'masuk' ? 'Masuk ke:' : 'Keluar dari:'}</span>{' '}
              {belanja.alokasi_label ||
                (detail.alokasi || [])
                  .map((a) => `${a.rekening_nama || ''} ${a.jumlah}`)
                  .filter(Boolean)
                  .join(' · ') ||
                '—'}
            </p>
          </div>
        )}
      </section>

      <section className="ui-card p-3 space-y-4">
        <h2 className="font-semibold text-ink">Rincian ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{canManage ? 'Belum ada item. Tambahkan di bawah.' : 'Belum ada item.'}</p>
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
                  {canManage && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] hover:underline"
                      onClick={() => void removeItem(it.id)}
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form onSubmit={(e) => void addItem(e)} className="border-t border-line pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-ink">Tambah item</h3>
            <SuggestInput
              required
              placeholder={jenis === 'masuk' ? 'Sumber / item' : 'Nama barang'}
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
        canUpload={canManage}
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
