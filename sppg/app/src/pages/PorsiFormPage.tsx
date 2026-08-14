import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createPorsi,
  listPorsiItemOptions,
  uploadPorsiFoto,
  type PorsiMenuOption,
  type PorsiUkuran,
} from '../api/apiClient'
import SuggestInput from '../components/SuggestInput'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatRp, todayYmd } from '../utils/format'

type DraftMenu = {
  key: string
  nama: string
  harga: string
}

function emptyMenu(): DraftMenu {
  return {
    key: `${Date.now()}-${Math.random()}`,
    nama: '',
    harga: '',
  }
}

function hargaDariOpsi(opt: PorsiMenuOption, ukuran: PorsiUkuran): string {
  const v = ukuran === 'kecil' ? opt.pk : opt.pb
  if (v == null || Number(v) <= 0) return ''
  return String(v)
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

export default function PorsiFormPage() {
  usePageTitle('Porsi baru')
  const navigate = useNavigate()
  const [tanggal, setTanggal] = useState(todayYmd())
  const [judul, setJudul] = useState('')
  const [ukuran, setUkuran] = useState<PorsiUkuran>('besar')
  const [energi, setEnergi] = useState('')
  const [karbo, setKarbo] = useState('')
  const [protein, setProtein] = useState('')
  const [lemak, setLemak] = useState('')
  const [serat, setSerat] = useState('')
  const [menu, setMenu] = useState<DraftMenu[]>([emptyMenu()])
  const [menuOptions, setMenuOptions] = useState<PorsiMenuOption[]>([])
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const namaList = useMemo(() => menuOptions.map((o) => o.nama), [menuOptions])
  const totalHarga = menu.reduce((s, it) => s + (Number(it.harga) || 0), 0)
  const ukuranLabel = ukuran === 'kecil' ? 'PK' : 'PB'

  useEffect(() => {
    void (async () => {
      const opts = await listPorsiItemOptions()
      if (opts.success && opts.data?.menu) setMenuOptions(opts.data.menu)
    })()
  }, [])

  useEffect(() => {
    if (!foto) {
      setFotoPreview('')
      return
    }
    const url = URL.createObjectURL(foto)
    setFotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  const updateMenu = (key: string, patch: Partial<DraftMenu>) => {
    setMenu((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const applyNamaSuggestion = (key: string, nama: string) => {
    const found = menuOptions.find((o) => o.nama.toLowerCase() === nama.trim().toLowerCase())
    if (!found) {
      updateMenu(key, { nama })
      return
    }
    setMenu((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, nama: found.nama }
        if (!it.harga.trim()) {
          next.harga = hargaDariOpsi(found, ukuran)
        }
        return next
      }),
    )
  }

  const removeMenu = (key: string) => {
    setMenu((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    const payloadMenu = menu
      .filter((it) => it.nama.trim())
      .map((it) => ({
        nama: it.nama.trim(),
        harga: Number(it.harga) || 0,
      }))

    const res = await createPorsi({
      tanggal,
      judul: judul.trim(),
      ukuran,
      energi_kkal: Number(energi) || 0,
      karbohidrat_gr: Number(karbo) || 0,
      protein_gr: Number(protein) || 0,
      lemak_gr: Number(lemak) || 0,
      serat_gr: Number(serat) || 0,
      menu: payloadMenu,
    })

    if (res.success && res.data?.porsi?.id) {
      const id = res.data.porsi.id
      if (foto) {
        setInfo('Mengupload foto…')
        const up = await uploadPorsiFoto(id, foto)
        if (!up.success) {
          setLoading(false)
          setError(up.message || 'Porsi tersimpan, tetapi foto gagal diunggah. Coba lagi di detail.')
          navigate(`/porsi/${id}`, { replace: true })
          return
        }
      }
      setLoading(false)
      navigate(`/porsi/${id}`, { replace: true })
    } else {
      setLoading(false)
      setError(res.message || 'Gagal menyimpan')
    }
  }

  return (
    <div className="space-y-3.5 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to="/porsi" className="text-[12px] text-muted hover:underline">
          ← Kembali
        </Link>
        <div className="text-right shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted">
            Total {ukuranLabel}
          </div>
          <div className="font-display text-base font-bold text-ink tabular-nums leading-tight">
            {formatRp(totalHarga)}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="ui-card p-3 space-y-3.5">
        <div>
          <label className="ui-label">Porsi utama hari ini</label>
          <input
            className="ui-input"
            required
            maxLength={200}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Mis. Nasi ayam bakar + sayur lodeh"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
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
          <div>
            <label className="ui-label">Ukuran porsi</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['besar', 'kecil'] as PorsiUkuran[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={[
                    'rounded-lg border px-3 py-2 text-[13px] font-semibold capitalize transition',
                    ukuran === u
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-ink'
                      : 'border-line bg-surface text-muted hover:bg-surface-soft',
                  ].join(' ')}
                  onClick={() => setUkuran(u)}
                >
                  {u === 'besar' ? 'Besar (PB)' : 'Kecil (PK)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="ui-label">Foto porsi</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="ui-input text-[12px]"
            onChange={(e) => setFoto(e.target.files?.[0] || null)}
          />
          {fotoPreview && (
            <img
              src={fotoPreview}
              alt="Pratinjau foto porsi"
              className="mt-2 max-h-48 rounded-lg border border-line object-cover"
            />
          )}
        </div>

        <div>
          <div className="ui-label mb-1.5">Analisa gizi</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-muted">Energi (kkal)</label>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                value={energi}
                onChange={(e) => setEnergi(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted">Karbohidrat (gr)</label>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                value={karbo}
                onChange={(e) => setKarbo(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted">Protein (gr)</label>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted">Lemak (gr)</label>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                value={lemak}
                onChange={(e) => setLemak(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted">Serat (gr)</label>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="any"
                value={serat}
                onChange={(e) => setSerat(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="ui-label">Menu MBG</div>
          <p className="text-[11px] text-muted -mt-1">
            Harga tersimpan sebagai {ukuranLabel} sesuai ukuran di atas.
          </p>
          {menu.map((it, idx) => (
            <div key={it.key} className="rounded-lg border border-line bg-surface-soft/40 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Item {idx + 1}</span>
                {menu.length > 1 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[var(--danger)] hover:underline"
                    onClick={() => removeMenu(it.key)}
                  >
                    <TrashIcon />
                    Hapus
                  </button>
                )}
              </div>
              <SuggestInput
                placeholder="Nama menu (pilih dari riwayat atau ketik baru)"
                value={it.nama}
                options={namaList}
                onChange={(v) => updateMenu(it.key, { nama: v })}
                onSelectSuggestion={(v) => applyNamaSuggestion(it.key, v)}
              />
              <div>
                <label className="text-[11px] text-muted">Harga {ukuranLabel} (Rp)</label>
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={it.harga}
                  onChange={(e) => updateMenu(it.key, { harga: e.target.value })}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="ui-btn-ghost w-full text-[12px]"
            onClick={() => setMenu((prev) => [...prev, emptyMenu()])}
          >
            + Tambah menu
          </button>
        </div>

        {error && <div className="ui-alert-error">{error}</div>}
        {info && <div className="ui-alert-ok">{info}</div>}

        <button type="submit" className="ui-btn-primary" disabled={loading}>
          {loading ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>
    </div>
  )
}
