import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createSubscriptionPayment,
  fetchSppgProfile,
  updateSppgProfile,
  uploadSppgPwaLogo,
} from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatRp } from '../utils/format'
import type { SppgProfile, SubscriptionInfo } from '../utils/auth'

function statusLabel(status?: string): string {
  if (status === 'active') return 'Aktif'
  if (status === 'pending_payment') return 'Menunggu bayar'
  if (status === 'past_due') return 'Jatuh tempo'
  if (status === 'suspended') return 'Ditangguhkan'
  if (status === 'cancelled') return 'Dibatalkan'
  return status || '—'
}

export default function SppgProfilePage() {
  usePageTitle('Profil SPPG')
  const [sppg, setSppg] = useState<SppgProfile | null>(null)
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [namaUnit, setNamaUnit] = useState('')
  const [namaYayasan, setNamaYayasan] = useState('')
  const [alamat, setAlamat] = useState('')
  const [telepon, setTelepon] = useState('')
  const [emailKontak, setEmailKontak] = useState('')
  const [pwaShortName, setPwaShortName] = useState('')
  const [pwaLogoUrl, setPwaLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetchSppgProfile()
    setLoading(false)
    if (!res.success || !res.data?.sppg) {
      setError(res.message || 'Gagal memuat profil')
      return
    }
    const p = res.data.sppg
    setSppg(p)
    setSub(res.data.subscription)
    setNamaUnit(p.nama_unit)
    setNamaYayasan(p.nama_yayasan)
    setAlamat(p.alamat || '')
    setTelepon(p.telepon || '')
    setEmailKontak(p.email_kontak || '')
    setPwaShortName(p.pwa_short_name || '')
    setPwaLogoUrl(p.pwa_logo_url || null)
    setLogoFile(null)
    setLogoPreview(null)
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOk('')
    const res = await updateSppgProfile({
      nama_unit: namaUnit,
      nama_yayasan: namaYayasan,
      alamat,
      telepon,
      email_kontak: emailKontak,
      pwa_short_name: pwaShortName.trim() || undefined,
    })
    if (!res.success || !res.data?.sppg) {
      setSaving(false)
      setError(res.message || 'Gagal menyimpan')
      return
    }
    let nextSppg = res.data.sppg
    if (logoFile) {
      const logoRes = await uploadSppgPwaLogo(logoFile)
      if (!logoRes.success || !logoRes.data?.sppg) {
        setSaving(false)
        setError(logoRes.message || 'Profil tersimpan, logo gagal diunggah')
        setSppg(nextSppg)
        setSub(res.data.subscription)
        return
      }
      nextSppg = logoRes.data.sppg
    }
    setSaving(false)
    setSppg(nextSppg)
    setSub(res.data.subscription)
    setPwaLogoUrl(nextSppg.pwa_logo_url ?? null)
    setLogoFile(null)
    setLogoPreview(null)
    setOk('Profil disimpan')
  }

  const onPickLogo = (file: File | null) => {
    if (!file) return
    if (file.size > 512 * 1024) {
      setError('Logo maksimal 512 KB')
      return
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError('Logo harus PNG, JPG, atau WebP')
      return
    }
    setError('')
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const pay = async () => {
    setPaying(true)
    setError('')
    const res = await createSubscriptionPayment()
    setPaying(false)
    if (!res.success || !res.data?.invoice_url) {
      setError(res.message || 'Gagal membuat invoice')
      return
    }
    window.location.href = res.data.invoice_url
  }

  if (loading) return <p className="p-4 text-muted">Memuat profil…</p>

  return (
    <div className="space-y-3.5 max-w-xl">
      <section className="ui-card p-4 space-y-2">
        <h2 className="ui-section-title">Identitas SPPG</h2>
        {sppg ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">ID SPPG</dt>
            <dd className="font-mono font-semibold">{sppg.public_id}</dd>
            <dt className="text-muted">Slug</dt>
            <dd className="font-mono">{sppg.slug}</dd>
            <dt className="text-muted">Status tenant</dt>
            <dd>{statusLabel(sppg.status)}</dd>
          </dl>
        ) : null}
      </section>

      <form onSubmit={(e) => void save(e)} className="ui-card p-4 space-y-3">
        <h2 className="ui-section-title">Profil</h2>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nama unit SPPG</span>
          <input className="ui-input w-full" value={namaUnit} onChange={(e) => setNamaUnit(e.target.value)} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nama yayasan</span>
          <input className="ui-input w-full" value={namaYayasan} onChange={(e) => setNamaYayasan(e.target.value)} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Alamat</span>
          <textarea className="ui-input w-full min-h-[80px]" value={alamat} onChange={(e) => setAlamat(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Telepon</span>
          <input className="ui-input w-full" value={telepon} onChange={(e) => setTelepon(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email kontak</span>
          <input type="email" className="ui-input w-full" value={emailKontak} onChange={(e) => setEmailKontak(e.target.value)} />
        </label>

        <div className="border-t border-line pt-3 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Aplikasi PWA</h3>
          <p className="text-sm text-muted">
            Nama dan logo default saat pengguna meng-install aplikasi ke layar utama.
          </p>
          {(logoPreview || pwaLogoUrl) ? (
            <img
              src={logoPreview || pwaLogoUrl || ''}
              alt=""
              className="h-16 w-16 rounded-xl border border-line object-cover"
            />
          ) : null}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nama aplikasi (PWA)</span>
            <input
              className="ui-input w-full"
              value={pwaShortName}
              onChange={(e) => setPwaShortName(e.target.value)}
              maxLength={64}
              placeholder={namaUnit || 'Contoh: SPPG Jambesari'}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Logo aplikasi</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="ui-input w-full text-sm"
              onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
            />
            <span className="text-[11px] text-muted">PNG/JPG/WebP, maks. 512 KB.</span>
          </label>
        </div>

        {ok ? <p className="text-sm text-emerald-600">{ok}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="ui-btn-primary" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan profil'}
        </button>
      </form>

      <section className="ui-card p-4 space-y-3">
        <h2 className="ui-section-title">Langganan</h2>
        <p className="text-sm text-muted">
          {formatRp(sub?.amount ?? 50000)} / bulan · status: <strong>{statusLabel(sub?.status)}</strong>
        </p>
        {sub?.period_end ? (
          <p className="text-sm text-muted">
            Periode berakhir: {new Date(sub.period_end).toLocaleDateString('id-ID', { dateStyle: 'long' })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-btn-primary" disabled={paying} onClick={() => void pay()}>
            {paying ? 'Menyiapkan…' : 'Bayar / Perpanjang'}
          </button>
          <Link to="/langganan" className="ui-btn-ghost">
            Detail langganan
          </Link>
        </div>
      </section>
    </div>
  )
}
