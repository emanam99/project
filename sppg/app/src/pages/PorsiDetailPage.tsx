import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deletePorsi,
  deletePorsiFoto,
  downloadPorsiFotoBlob,
  getPorsi,
  listPorsiItemOptions,
  updatePorsi,
  uploadPorsiFoto,
  type PorsiDetail,
  type PorsiMenuOption,
  type PorsiUkuran,
} from '../api/apiClient'
import SuggestInput from '../components/SuggestInput'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'

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

function fmtNum(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return '0'
  return Number.isInteger(v) ? String(v) : v.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function hargaItem(
  ukuran: PorsiUkuran,
  pb: number | string | null | undefined,
  pk: number | string | null | undefined,
): number {
  return ukuran === 'kecil' ? Number(pk) || 0 : Number(pb) || 0
}

function hargaDariOpsi(opt: PorsiMenuOption, ukuran: PorsiUkuran): string {
  const v = ukuran === 'kecil' ? opt.pk : opt.pb
  if (v == null || Number(v) <= 0) return ''
  return String(v)
}

export default function PorsiDetailPage() {
  const { id } = useParams()
  const porsiId = Number(id)
  const navigate = useNavigate()
  const canManage = canManageData(getStoredUser()?.role)

  const [detail, setDetail] = useState<PorsiDetail | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)

  const [tanggal, setTanggal] = useState('')
  const [judul, setJudul] = useState('')
  const [ukuran, setUkuran] = useState<PorsiUkuran>('besar')
  const [energi, setEnergi] = useState('')
  const [karbo, setKarbo] = useState('')
  const [protein, setProtein] = useState('')
  const [lemak, setLemak] = useState('')
  const [serat, setSerat] = useState('')
  const [menu, setMenu] = useState<DraftMenu[]>([emptyMenu()])
  const [menuOptions, setMenuOptions] = useState<PorsiMenuOption[]>([])
  const [fotoUrl, setFotoUrl] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)

  const namaList = useMemo(() => menuOptions.map((o) => o.nama), [menuOptions])
  const ukuranLabel = ukuran === 'kecil' ? 'PK' : 'PB'

  usePageTitle(
    detail?.porsi.judul?.trim() ||
      (detail ? `Porsi ${formatDateId(detail.porsi.tanggal)}` : 'Detail porsi'),
  )

  const fillForm = (data: PorsiDetail) => {
    const u: PorsiUkuran = data.porsi.ukuran === 'kecil' ? 'kecil' : 'besar'
    setTanggal(data.porsi.tanggal)
    setJudul(data.porsi.judul?.trim() || '')
    setUkuran(u)
    setEnergi(String(data.porsi.energi_kkal ?? ''))
    setKarbo(String(data.porsi.karbohidrat_gr ?? ''))
    setProtein(String(data.porsi.protein_gr ?? ''))
    setLemak(String(data.porsi.lemak_gr ?? ''))
    setSerat(String(data.porsi.serat_gr ?? ''))
    setMenu(
      data.menu.length
        ? data.menu.map((m) => ({
            key: `m-${m.id}`,
            nama: m.nama,
            harga: String(hargaItem(u, m.pb, m.pk) || ''),
          }))
        : [emptyMenu()],
    )
  }

  const loadFoto = async (hasFoto: boolean) => {
    if (fotoUrl) {
      URL.revokeObjectURL(fotoUrl)
      setFotoUrl('')
    }
    if (!hasFoto || !porsiId) return
    const res = await downloadPorsiFotoBlob(porsiId)
    if (res.success) {
      setFotoUrl(URL.createObjectURL(res.blob))
    }
  }

  const load = async () => {
    if (!porsiId) return
    setLoading(true)
    const res = await getPorsi(porsiId)
    if (res.success && res.data) {
      setDetail(res.data)
      fillForm(res.data)
      setError('')
      void loadFoto(Boolean(res.data.porsi.foto_path))
    } else {
      setError(res.message || 'Tidak ditemukan')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    void (async () => {
      const opts = await listPorsiItemOptions()
      if (opts.success && opts.data?.menu) setMenuOptions(opts.data.menu)
    })()
    return () => {
      if (fotoUrl) URL.revokeObjectURL(fotoUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porsiId])

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!porsiId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    const payloadMenu = menu
      .filter((it) => it.nama.trim())
      .map((it) => ({
        nama: it.nama.trim(),
        harga: Number(it.harga) || 0,
      }))
    const res = await updatePorsi(porsiId, {
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
    setSaving(false)
    if (res.success && res.data) {
      setDetail(res.data)
      fillForm(res.data)
      setEditMode(false)
      setOkMsg('Perubahan disimpan')
      void (async () => {
        const opts = await listPorsiItemOptions()
        if (opts.success && opts.data?.menu) setMenuOptions(opts.data.menu)
      })()
    } else {
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const handleDelete = async () => {
    if (!porsiId || !confirm('Hapus catatan porsi ini?')) return
    const res = await deletePorsi(porsiId)
    if (res.success) {
      navigate('/porsi', { replace: true })
    } else {
      setError(res.message || 'Gagal menghapus')
    }
  }

  const handleFotoChange = async (file: File | null) => {
    if (!file || !porsiId) return
    setFotoBusy(true)
    setError('')
    const res = await uploadPorsiFoto(porsiId, file)
    setFotoBusy(false)
    if (res.success && res.data) {
      setDetail((prev) => (prev ? { ...prev, porsi: res.data! } : prev))
      setOkMsg('Foto diunggah')
      void loadFoto(true)
    } else {
      setError(res.message || 'Gagal mengunggah foto')
    }
  }

  const handleDeleteFoto = async () => {
    if (!porsiId || !confirm('Hapus foto porsi?')) return
    setFotoBusy(true)
    const res = await deletePorsiFoto(porsiId)
    setFotoBusy(false)
    if (res.success && res.data) {
      setDetail((prev) => (prev ? { ...prev, porsi: res.data! } : prev))
      if (fotoUrl) URL.revokeObjectURL(fotoUrl)
      setFotoUrl('')
      setOkMsg('Foto dihapus')
    } else {
      setError(res.message || 'Gagal menghapus foto')
    }
  }

  if (loading) {
    return <div className="text-[13px] text-muted">Memuat…</div>
  }

  if (!detail) {
    return (
      <div className="space-y-2">
        <Link to="/porsi" className="text-[12px] text-muted hover:underline">
          ← Kembali
        </Link>
        <div className="ui-alert-error">{error || 'Tidak ditemukan'}</div>
      </div>
    )
  }

  const p = detail.porsi
  const viewUkuran: PorsiUkuran = p.ukuran === 'kecil' ? 'kecil' : 'besar'
  const viewLabel = viewUkuran === 'kecil' ? 'PK' : 'PB'
  const totalHarga = detail.menu.reduce(
    (s, m) => s + hargaItem(viewUkuran, m.pb, m.pk),
    0,
  )

  return (
    <div className="space-y-3.5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/porsi" className="text-[12px] text-muted hover:underline">
          ← Kembali
        </Link>
        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            {!editMode && (
              <button type="button" className="ui-btn-ghost text-[12px]" onClick={() => setEditMode(true)}>
                Ubah
              </button>
            )}
            <button
              type="button"
              className="ui-btn-ghost text-[12px] text-[var(--danger)]"
              onClick={() => void handleDelete()}
            >
              Hapus
            </button>
          </div>
        )}
      </div>

      {error && <div className="ui-alert-error">{error}</div>}
      {okMsg && <div className="ui-alert-ok">{okMsg}</div>}

      {editMode && canManage ? (
        <form onSubmit={(e) => void handleSave(e)} className="ui-card p-3 space-y-3.5">
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
            <div className="ui-label mb-1.5">Analisa gizi</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted">Energi (kkal)</label>
                <input className="ui-input" type="number" min="0" step="any" value={energi} onChange={(e) => setEnergi(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted">Karbohidrat (gr)</label>
                <input className="ui-input" type="number" min="0" step="any" value={karbo} onChange={(e) => setKarbo(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted">Protein (gr)</label>
                <input className="ui-input" type="number" min="0" step="any" value={protein} onChange={(e) => setProtein(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted">Lemak (gr)</label>
                <input className="ui-input" type="number" min="0" step="any" value={lemak} onChange={(e) => setLemak(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted">Serat (gr)</label>
                <input className="ui-input" type="number" min="0" step="any" value={serat} onChange={(e) => setSerat(e.target.value)} />
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
                      className="text-[var(--danger)] hover:underline"
                      onClick={() => setMenu((prev) => prev.filter((x) => x.key !== it.key))}
                    >
                      Hapus
                    </button>
                  )}
                </div>
                <SuggestInput
                  placeholder="Nama menu"
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

          <div className="flex gap-2">
            <button type="submit" className="ui-btn-primary" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan perubahan'}
            </button>
            <button
              type="button"
              className="ui-btn-ghost"
              onClick={() => {
                fillForm(detail)
                setEditMode(false)
                setError('')
              }}
            >
              Batal
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="ui-card p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display text-lg font-bold text-ink">
                  {p.judul?.trim() || formatDateId(p.tanggal)}
                </div>
                <div className="mt-1 text-[13px] text-muted">
                  {formatDateId(p.tanggal)}
                  {' · '}
                  Porsi {viewUkuran === 'kecil' ? 'kecil (PK)' : 'besar (PB)'}
                  {p.created_by_name ? ` · ${p.created_by_name}` : ''}
                </div>
              </div>
              <div className="text-right text-[12px] tabular-nums">
                <div className="text-muted">Total {viewLabel}</div>
                <div className="font-semibold text-ink">{formatRp(totalHarga)}</div>
              </div>
            </div>

            {(fotoUrl || canManage) && (
              <div>
                <div className="ui-label mb-1.5">Foto</div>
                {fotoUrl ? (
                  <img
                    src={fotoUrl}
                    alt={p.foto_nama || 'Foto porsi'}
                    className="max-h-64 w-full rounded-lg border border-line object-contain bg-surface-soft"
                  />
                ) : (
                  <div className="text-[12px] text-muted">Belum ada foto</div>
                )}
                {canManage && (
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <label className="ui-btn-ghost text-[12px] cursor-pointer">
                      {fotoBusy ? 'Memproses…' : fotoUrl ? 'Ganti foto' : 'Upload foto'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        disabled={fotoBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null
                          e.target.value = ''
                          void handleFotoChange(f)
                        }}
                      />
                    </label>
                    {fotoUrl && (
                      <button
                        type="button"
                        className="text-[12px] text-[var(--danger)] hover:underline"
                        disabled={fotoBusy}
                        onClick={() => void handleDeleteFoto()}
                      >
                        Hapus foto
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="ui-label mb-1.5">Analisa gizi</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[13px]">
                <div className="rounded-lg border border-line px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted font-semibold">Energi</div>
                  <div className="font-semibold tabular-nums">{fmtNum(p.energi_kkal)} kkal</div>
                </div>
                <div className="rounded-lg border border-line px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted font-semibold">Karbo</div>
                  <div className="font-semibold tabular-nums">{fmtNum(p.karbohidrat_gr)} gr</div>
                </div>
                <div className="rounded-lg border border-line px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted font-semibold">Protein</div>
                  <div className="font-semibold tabular-nums">{fmtNum(p.protein_gr)} gr</div>
                </div>
                <div className="rounded-lg border border-line px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted font-semibold">Lemak</div>
                  <div className="font-semibold tabular-nums">{fmtNum(p.lemak_gr)} gr</div>
                </div>
                <div className="rounded-lg border border-line px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted font-semibold">Serat</div>
                  <div className="font-semibold tabular-nums">{fmtNum(p.serat_gr)} gr</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ui-card p-3">
            <div className="ui-label mb-2">Menu MBG</div>
            {detail.menu.length === 0 ? (
              <div className="text-[13px] text-muted">Belum ada item menu</div>
            ) : (
              <ul className="divide-y divide-line">
                {detail.menu.map((m) => (
                  <li key={m.id} className="py-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="font-semibold text-[13px] text-ink">{m.nama}</div>
                    <div className="text-right text-[12px] tabular-nums">
                      <span className="text-muted">{viewLabel} </span>
                      <span className="font-semibold">
                        {formatRp(hargaItem(viewUkuran, m.pb, m.pk))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
