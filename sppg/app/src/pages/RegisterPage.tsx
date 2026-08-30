import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { checkSppgSlug, checkSppgSubdomain, registerSppg } from '../api/apiClient'
import { getHostMode, getLandingUrl, isCloudyPlatform, normalizeSubdomain } from '../utils/tenantHost'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function subdomainFromName(text: string): string {
  return normalizeSubdomain(text.replace(/\s+/g, ''))
}

export default function RegisterPage() {
  const cloudyRegister = isCloudyPlatform()
  const [namaYayasan, setNamaYayasan] = useState('')
  const [namaUnit, setNamaUnit] = useState('')
  const [slug, setSlug] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [alamat, setAlamat] = useState('')
  const [telepon, setTelepon] = useState('')
  const [emailKontak, setEmailKontak] = useState('')
  const [slugOk, setSlugOk] = useState<boolean | null>(null)
  const [subdomainOk, setSubdomainOk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const autoSlug = useMemo(() => slugify(namaUnit || namaYayasan), [namaUnit, namaYayasan])
  const autoSubdomain = useMemo(() => subdomainFromName(namaUnit || namaYayasan), [namaUnit, namaYayasan])
  const tenantPreview = subdomain ? `https://${subdomain}.cloudy.my.id` : ''

  useEffect(() => {
    if (!slugTouched) setSlug(autoSlug)
  }, [autoSlug, slugTouched])

  useEffect(() => {
    if (!subdomainTouched) setSubdomain(autoSubdomain)
  }, [autoSubdomain, subdomainTouched])

  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugOk(null)
      return
    }
    const t = window.setTimeout(() => {
      void checkSppgSlug(slug).then((res) => {
        if (res.success && res.data) setSlugOk(res.data.available)
        else setSlugOk(null)
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [slug])

  useEffect(() => {
    if (!subdomain || subdomain.length < 3) {
      setSubdomainOk(null)
      return
    }
    const t = window.setTimeout(() => {
      void checkSppgSubdomain(subdomain).then((res) => {
        if (res.success && res.data) setSubdomainOk(res.data.available)
        else setSubdomainOk(null)
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [subdomain])

  if (getHostMode() === 'tenant') {
    const landing = getLandingUrl()
    if (landing) {
      window.location.replace(`${landing}/daftar`)
      return null
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await registerSppg({
      nama_unit: namaUnit.trim(),
      nama_yayasan: namaYayasan.trim(),
      slug: slug.trim(),
      ...(cloudyRegister ? { subdomain: subdomain.trim() } : { subdomain: '' }),
      alamat: alamat.trim(),
      telepon: telepon.trim(),
      email_kontak: emailKontak.trim(),
    })
    setLoading(false)
    if (!res.success || !res.data?.auth_url) {
      setError(res.message || 'Gagal memproses pendaftaran')
      return
    }
    window.location.href = res.data.auth_url
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-bold">Daftar SPPG baru</h1>
          <p className="text-sm text-muted">Isi profil unit, pilih subdomain, lalu login Google sebagai super admin.</p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="ui-card p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nama yayasan</span>
            <input className="ui-input w-full" value={namaYayasan} onChange={(e) => setNamaYayasan(e.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nama unit SPPG</span>
            <input className="ui-input w-full" value={namaUnit} onChange={(e) => setNamaUnit(e.target.value)} required />
          </label>
          {cloudyRegister ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Subdomain</span>
              <input
                className="ui-input w-full font-mono text-sm"
                value={subdomain}
                onChange={(e) => {
                  setSubdomainTouched(true)
                  setSubdomain(normalizeSubdomain(e.target.value))
                }}
                required
                minLength={3}
                maxLength={63}
              />
              {tenantPreview ? <span className="text-xs text-muted font-mono">{tenantPreview}</span> : null}
              {subdomainOk === true ? <span className="text-xs text-emerald-600">Subdomain tersedia</span> : null}
              {subdomainOk === false ? <span className="text-xs text-red-600">Subdomain sudah dipakai atau tidak valid</span> : null}
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-sm font-medium">{cloudyRegister ? 'Slug / ID internal' : 'Slug / ID URL'}</span>
            <input
              className="ui-input w-full font-mono text-sm"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              required
            />
            {slugOk === true ? <span className="text-xs text-emerald-600">Slug tersedia</span> : null}
            {slugOk === false ? <span className="text-xs text-red-600">Slug sudah dipakai</span> : null}
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Alamat SPPG</span>
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

          <div className="rounded-xl border border-line bg-surface-soft p-3 text-sm">
            Langganan <strong>Rp 50.000/bulan</strong> setelah pendaftaran.
            {cloudyRegister ? ' Anda akan diarahkan ke subdomain tenant untuk pembayaran Xendit.' : ' Anda akan diarahkan ke pembayaran Xendit.'}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="ui-btn-primary w-full"
            disabled={loading || slugOk === false || (cloudyRegister && subdomainOk === false)}
          >
            {loading ? 'Memproses…' : 'Lanjut dengan Google'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Sudah terdaftar? <Link to="/login" className="text-[var(--accent)] font-medium">Masuk</Link>
        </p>
      </div>
    </div>
  )
}
