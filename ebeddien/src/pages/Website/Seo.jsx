import { useEffect, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { Btn, Card, Field, Input, PageHeader, Textarea, WebsitePageShell } from './_shared'

const SEO_TEXT_FIELDS = [
  { key: 'site_title', label: 'Site title', component: Input, hint: 'Judul utama web (≤60 karakter).' },
  { key: 'site_description', label: 'Site description', component: Textarea, hint: 'Meta description default (≤160 karakter).' },
  { key: 'site_keywords', label: 'Keywords', component: Input, hint: 'Pisahkan dengan koma.' },
  { key: 'og_default_title', label: 'OG default title', component: Input },
  { key: 'og_default_description', label: 'OG default description', component: Textarea },
  { key: 'twitter_handle', label: 'Twitter handle', component: Input, hint: 'Contoh: @pesantrenku' }
]

/** Baris URL gambar SEO: input + unggah (alur website_media) + pratinjau kecil. */
function SeoAssetField({
  label,
  hint,
  value,
  onChange,
  uploadContext,
  disabled,
  uploading,
  onUploading,
  previewClass
}) {
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onUploading(true)
    try {
      const res = await websiteAPI.uploadImage(file, uploadContext)
      if (res?.success && res.data?.url) {
        onChange(res.data.url)
      } else {
        alert(res?.message || 'Gagal mengunggah gambar')
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal mengunggah gambar')
    } finally {
      onUploading(false)
    }
  }

  const v = value ?? ''

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={v}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            disabled={disabled}
          />
          <label
            className={`inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${
              disabled || uploading ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onFile}
              disabled={disabled || uploading}
            />
            {uploading ? 'Mengunggah…' : 'Unggah gambar'}
          </label>
        </div>
        {v ? (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-600 dark:bg-slate-900/50">
            <img src={v} alt="" className={previewClass} />
          </div>
        ) : (
          <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
            Pratinjau
          </div>
        )}
      </div>
    </Field>
  )
}

export default function WebsiteSeo() {
  const access = useWebsiteFiturAccess()
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [uploadOg, setUploadOg] = useState(false)
  const [uploadFavicon, setUploadFavicon] = useState(false)

  const canEdit = access.action.seoUbah
  const fieldDisabled = loading || !canEdit

  useEffect(() => {
    let mounted = true
    setLoading(true)
    websiteAPI
      .getSeo()
      .then((res) => {
        if (!mounted) return
        if (res?.success) setData(res.data || {})
        else setError(res?.message || 'Gagal memuat SEO')
      })
      .catch((err) => mounted && setError(err?.response?.data?.message || err.message || 'Gagal memuat SEO'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const onSave = async (e) => {
    e?.preventDefault?.()
    if (!canEdit) return
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const res = await websiteAPI.updateSeo(data)
      if (res?.success) {
        setInfo('Pengaturan SEO disimpan.')
        setData(res.data || data)
      } else setError(res?.message || 'Gagal menyimpan')
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader title="Pengaturan SEO global" description="Default Title / Description / OG untuk seluruh halaman web publik." />
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-200">
          {info}
        </div>
      )}
      <Card>
        <form className="space-y-4" onSubmit={onSave}>
          {SEO_TEXT_FIELDS.map((f) => {
            const Cmp = f.component
            return (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Cmp
                  value={data[f.key] ?? ''}
                  onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))}
                  rows={Cmp === Textarea ? 2 : undefined}
                  disabled={fieldDisabled}
                />
              </Field>
            )
          })}

          <SeoAssetField
            label="OG default image URL"
            hint="Gambar default berbagi sosial (disarankan ~1200×630). Bisa tempel URL atau unggah — file masuk uploads/website/seo/og-default/ (publik, sama alur Berita/Banner)."
            value={data.og_default_image}
            onChange={(url) => setData((d) => ({ ...d, og_default_image: url }))}
            uploadContext="seo_og"
            disabled={fieldDisabled}
            uploading={uploadOg}
            onUploading={setUploadOg}
            previewClass="h-20 max-w-[200px] rounded-md object-cover"
          />

          <SeoAssetField
            label="Favicon URL"
            hint="Ikon tab browser. Unggah PNG/WebP persegi atau tempel URL (termasuk .ico dari luar). Unggah → uploads/website/seo/favicon/."
            value={data.favicon_url}
            onChange={(url) => setData((d) => ({ ...d, favicon_url: url }))}
            uploadContext="seo_favicon"
            disabled={fieldDisabled}
            uploading={uploadFavicon}
            onUploading={setUploadFavicon}
            previewClass="h-14 w-14 rounded-md object-cover"
          />

          <div className="flex justify-end pt-2">
            <Btn disabled={saving || loading || !canEdit}>
              {saving ? 'Menyimpan…' : 'Simpan SEO'}
            </Btn>
          </div>
          {!canEdit && (
            <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Anda hanya bisa melihat. Butuh aksi action.website.seo.ubah untuk menyimpan.
            </div>
          )}
        </form>
      </Card>
    </WebsitePageShell>
  )
}
