import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  createBelanja,
  listBelanjaItemOptions,
  listKategori,
  listRekening,
  type BelanjaNamaOption,
  type RekeningRow,
} from '../api/apiClient'
import AlokasiEditor, { alokasiPayload, emptyAlokasi, type AlokasiDraft } from '../components/AlokasiEditor'
import BelanjaLampiran, {
  uploadPendingBelanjaFiles,
  type PendingBelanjaFile,
} from '../components/BelanjaLampiran'
import KategoriField from '../components/KategoriField'
import SuggestInput from '../components/SuggestInput'
import { usePageTitle } from '../contexts/PageTitleContext'
import { jenisBase, jenisFromPath, jenisLabel } from '../utils/auth'
import { formatRp, todayYmd } from '../utils/format'

type DraftItem = {
  key: string
  nama_barang: string
  qty: string
  satuan: string
  harga_satuan: string
  catatan: string
}

function emptyItem(): DraftItem {
  return {
    key: `${Date.now()}-${Math.random()}`,
    nama_barang: '',
    qty: '1',
    satuan: 'pcs',
    harga_satuan: '',
    catatan: '',
  }
}

function itemSubtotal(it: DraftItem): number {
  const qty = Number(it.qty) || 0
  const harga = Number(it.harga_satuan) || 0
  return Math.round(qty * harga)
}

function TrashIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BelanjaFormPage() {
  const location = useLocation()
  const jenis = jenisFromPath(location.pathname)
  const base = jenisBase(jenis)
  usePageTitle(`${jenisLabel(jenis)} baru`)
  const navigate = useNavigate()
  const [tanggal, setTanggal] = useState(todayYmd())
  const [keterangan, setKeterangan] = useState('')
  const [kategori, setKategori] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [namaOptions, setNamaOptions] = useState<BelanjaNamaOption[]>([])
  const [satuanOptions, setSatuanOptions] = useState<string[]>(['pcs'])
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [pendingFiles, setPendingFiles] = useState<PendingBelanjaFile[]>([])
  const [rekening, setRekening] = useState<RekeningRow[]>([])
  const [alokasi, setAlokasi] = useState<AlokasiDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const namaList = useMemo(() => namaOptions.map((o) => o.nama), [namaOptions])

  useEffect(() => {
    void (async () => {
      const [kat, opts, rek] = await Promise.all([
        listKategori(jenis),
        listBelanjaItemOptions(jenis),
        listRekening(),
      ])
      if (kat.success && kat.data) setCategories(kat.data.map((k) => k.nama))
      if (opts.success && opts.data) {
        setNamaOptions(opts.data.nama_barang || [])
        if (opts.data.satuan?.length) setSatuanOptions(opts.data.satuan)
      }
      if (rek.success && rek.data?.rekening) {
        const aktif = rek.data.rekening.filter((r) => Number(r.aktif) === 1)
        setRekening(aktif)
        const cash = aktif.find((r) => r.tipe === 'cash') || aktif[0]
        if (cash) setAlokasi([emptyAlokasi(String(cash.id))])
      }
    })()
  }, [jenis])

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const applyNamaSuggestion = (key: string, nama: string) => {
    const found = namaOptions.find((o) => o.nama.toLowerCase() === nama.trim().toLowerCase())
    if (!found) {
      updateItem(key, { nama_barang: nama })
      return
    }
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, nama_barang: found.nama }
        if (!it.satuan.trim() || it.satuan === 'pcs') {
          next.satuan = found.satuan || 'pcs'
        }
        if (!it.harga_satuan.trim() && found.harga_satuan > 0) {
          next.harga_satuan = String(found.harga_satuan)
        }
        return next
      }),
    )
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    const payloadItems = items
      .filter((it) => it.nama_barang.trim())
      .map((it) => ({
        nama_barang: it.nama_barang.trim(),
        qty: Number(it.qty) || 0,
        satuan: it.satuan.trim() || 'pcs',
        harga_satuan: Number(it.harga_satuan) || 0,
        catatan: it.catatan.trim() || undefined,
      }))

    const totalBelanjaNow = payloadItems.reduce(
      (sum, it) => sum + Math.round((it.qty || 0) * (it.harga_satuan || 0)),
      0,
    )
    const alokasiNow = alokasiPayload(alokasi)
    const alokasiSum = alokasiNow.reduce((s, a) => s + a.jumlah, 0)
    if (totalBelanjaNow > 0 && Math.abs(alokasiSum - totalBelanjaNow) > 0.009) {
      setLoading(false)
      setError('Pecahan rekening harus sama dengan total catatan.')
      return
    }

    const res = await createBelanja({
      tanggal,
      jenis,
      keterangan: keterangan.trim() || undefined,
      kategori: kategori.trim() || undefined,
      items: payloadItems,
      alokasi: alokasiNow,
    })

    if (res.success && res.data?.belanja?.id) {
      const id = res.data.belanja.id
      if (pendingFiles.length > 0) {
        setInfo('Mengupload lampiran…')
        const { ok, fail } = await uploadPendingBelanjaFiles(id, pendingFiles)
        if (fail > 0) {
          setLoading(false)
          setError(`${ok} lampiran terunggah, ${fail} gagal. Anda bisa coba lagi di detail.`)
          navigate(`${base}/${id}`, { replace: true })
          return
        }
      }
      setLoading(false)
      navigate(`${base}/${id}`, { replace: true })
    } else {
      setLoading(false)
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const itemCount = items.length
  const totalBelanja = items.reduce((sum, it) => sum + itemSubtotal(it), 0)
  const itemHeading = jenis === 'masuk' ? 'Rincian sumber' : 'Item belanja'
  const namaPlaceholder = jenis === 'masuk' ? 'Sumber / item (mis. Gaji, transfer)' : 'Nama barang'

  return (
    <div className="space-y-3.5 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to={base} className="text-[12px] text-muted hover:underline">
          ← Kembali
        </Link>
        <div className="text-right shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted">
            {itemCount} item
          </div>
          <div className="font-display text-base font-bold text-ink tabular-nums leading-tight">
            {formatRp(totalBelanja)}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="ui-card p-3 space-y-3.5">
        <div>
          <label className="ui-label">Tanggal</label>
          <input
            type="date"
            required
            className="ui-input"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </div>

        <KategoriField
          categories={categories}
          value={kategori}
          onChange={setKategori}
          onCategoriesChange={setCategories}
        />

        <div className="space-y-2.5">
          <h2 className="font-semibold text-ink text-[13px]">{itemHeading}</h2>

          {items.map((it, idx) => (
            <div key={it.key} className="rounded-lg border border-line bg-surface-soft p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                <span className="text-muted">Item {idx + 1}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-ink font-bold tabular-nums">{formatRp(itemSubtotal(it))}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[var(--danger)] hover:underline"
                      onClick={() => removeItem(it.key)}
                    >
                      <TrashIcon />
                      Hapus
                    </button>
                  )}
                </div>
              </div>
              <SuggestInput
                placeholder={namaPlaceholder}
                value={it.nama_barang}
                options={namaList}
                onChange={(v) => updateItem(it.key, { nama_barang: v })}
                onSelectSuggestion={(v) => applyNamaSuggestion(it.key, v)}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  value={it.qty}
                  onChange={(e) => updateItem(it.key, { qty: e.target.value })}
                />
                <SuggestInput
                  placeholder="Satuan"
                  value={it.satuan}
                  options={satuanOptions}
                  onChange={(v) => updateItem(it.key, { satuan: v })}
                />
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Harga"
                  value={it.harga_satuan}
                  onChange={(e) => updateItem(it.key, { harga_satuan: e.target.value })}
                />
              </div>
              <input
                className="ui-input"
                placeholder="Catatan item (opsional)"
                value={it.catatan}
                onChange={(e) => updateItem(it.key, { catatan: e.target.value })}
              />
            </div>
          ))}

          <button
            type="button"
            className="ui-btn-ghost w-full text-[12px]"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
          >
            + Tambah item
          </button>
        </div>

        <AlokasiEditor
          rekening={rekening}
          rows={alokasi}
          total={totalBelanja}
          jenis={jenis}
          onChange={setAlokasi}
        />

        <div>
          <label className="ui-label">Keterangan</label>
          <textarea
            className="ui-input min-h-[72px] resize-y"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder={jenis === 'masuk' ? 'Mis. Gaji bulan ini' : 'Mis. Belanja mingguan pasar'}
            rows={3}
          />
        </div>

        {error && <div className="ui-alert-error">{error}</div>}
        {info && <div className="ui-alert-ok">{info}</div>}

        <button type="submit" className="ui-btn-primary" disabled={loading}>
          {loading ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>

      <BelanjaLampiran
        canUpload
        pendingFiles={pendingFiles}
        onPendingChange={setPendingFiles}
        onMessage={(kind, text) => {
          if (kind === 'error') {
            setError(text)
            setInfo('')
          } else {
            setInfo(text)
            setError('')
          }
        }}
      />
    </div>
  )
}
