import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { Btn, Field, Input, Select, Textarea } from './_shared'
import WebsiteBeritaQuillEditor from './WebsiteBeritaQuillEditor'
import { slugifyJudul } from './websiteBeritaSlug'
import './WebsiteBeritaEditor.css'

const emptyForm = {
  id: null,
  judul: '',
  slug: '',
  ringkasan: '',
  konten_html: '',
  cover_url: '',
  kategori_id: '',
  status: 'draft',
  published_at: '',
  og_title: '',
  og_description: '',
  og_image: ''
}

export default function WebsiteBeritaEditor() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : null
  const navigate = useNavigate()
  const access = useWebsiteFiturAccess()

  const [kategori, setKategori] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadCoverBusy, setUploadCoverBusy] = useState(false)
  /** true = slug disentuh manual / suntingan lama; jangan timpa dari judul. */
  const slugManualRef = useRef(false)

  const canPublishHere = access.action.beritaPublish || form.status !== 'publish'
  const statusOptions = useMemo(
    () => (access.action.beritaPublish ? ['draft', 'publish'] : ['draft']),
    [access.action.beritaPublish]
  )

  const uploadImage = useCallback(async (file) => {
    const res = await websiteAPI.uploadImage(file, 'berita_konten')
    if (res?.success && res.data?.url) return res.data.url
    throw new Error(res?.message || 'Gagal mengunggah gambar')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resKat = await websiteAPI.listKategoriBerita()
        if (!cancelled) setKategori(resKat?.data || [])
      } catch {
        if (!cancelled) setKategori([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!id) {
      slugManualRef.current = false
      setForm(emptyForm)
      setLoading(false)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const res = await websiteAPI.getBerita(id)
        if (cancelled) return
        if (!res?.success || !res.data) {
          setError(res?.message || 'Berita tidak ditemukan')
          setLoading(false)
          return
        }
        const row = res.data
        slugManualRef.current = true
        setForm({
          id: row.id,
          judul: row.judul || '',
          slug: row.slug || '',
          ringkasan: row.ringkasan || '',
          konten_html: row.konten_html || '',
          cover_url: row.cover_url || '',
          kategori_id: row.kategori_id ?? '',
          status: row.status || 'draft',
          published_at: row.published_at ? String(row.published_at).slice(0, 19).replace(' ', 'T') : '',
          og_title: row.og_title || '',
          og_description: row.og_description || '',
          og_image: row.og_image || ''
        })
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err.message || 'Gagal memuat berita')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const onCoverFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadCoverBusy(true)
    try {
      const res = await websiteAPI.uploadImage(file, 'berita_cover')
      if (res?.success && res.data?.url) {
        setForm((f) => ({ ...f, cover_url: res.data.url }))
      } else {
        alert(res?.message || 'Gagal mengunggah cover')
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal mengunggah cover')
    } finally {
      setUploadCoverBusy(false)
    }
  }

  const onSave = async () => {
    if (!form.judul?.trim()) {
      alert('Judul wajib diisi.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        kategori_id: form.kategori_id === '' ? null : Number(form.kategori_id),
        published_at: form.published_at ? form.published_at.replace('T', ' ') : null
      }
      if (form.id) {
        const res = await websiteAPI.updateBerita(form.id, payload)
        if (res?.success && res.data?.slug) {
          setForm((f) => ({ ...f, slug: res.data.slug }))
        }
      } else {
        const res = await websiteAPI.createBerita(payload)
        if (res?.success && res.data?.id) {
          navigate(`/website/berita/editor/${res.data.id}`, { replace: true })
        } else {
          navigate('/website/berita')
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (!access.menu.berita) {
    return (
      <div className="p-6 text-center text-slate-600 dark:text-slate-400">
        Anda tidak memiliki akses menu Berita.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400">
        Memuat editor…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Bar atas — mirip halaman dokumen */}
      <header className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/website/berita')}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Daftar berita
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
              {form.id ? 'Sunting berita' : 'Berita baru'}
            </h1>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              Judul, konten visual, cover, lalu terbitkan saat siap.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Btn variant="ghost" type="button" onClick={() => navigate('/website/berita')} disabled={saving}>
            Batal
          </Btn>
          <Btn type="button" onClick={onSave} disabled={saving || !canPublishHere}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Btn>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-6xl px-3 py-4 pb-24 sm:px-4 sm:py-6 md:pb-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            {/* Kolom utama — konten */}
            <div className="min-w-0 flex-1 space-y-4">
              <Field label="Judul">
                <Input
                  required
                  value={form.judul}
                  onChange={(e) => {
                    const judul = e.target.value
                    setForm((f) => ({
                      ...f,
                      judul,
                      slug: slugManualRef.current ? f.slug : slugifyJudul(judul)
                    }))
                  }}
                  placeholder="Judul berita"
                  className="text-lg font-medium"
                />
              </Field>

              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Isi berita
                </span>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Format teks, judul, daftar, tautan, gambar dari toolbar. Gambar di artikel diunggah ke server.
                </p>
                <div className="wb-berita-editor min-w-0 max-w-full rounded-xl border border-slate-200 shadow-sm dark:border-slate-600">
                  <WebsiteBeritaQuillEditor
                    value={form.konten_html}
                    onChange={(html) => setForm((f) => ({ ...f, konten_html: html }))}
                    placeholder="Tulis isi berita di sini…"
                    uploadImage={uploadImage}
                  />
                </div>
              </div>

              <Field label="Ringkasan" hint="Tampil di daftar berita & meta singkat (bukan isi penuh).">
                <Textarea
                  rows={3}
                  value={form.ringkasan}
                  onChange={(e) => setForm((f) => ({ ...f, ringkasan: e.target.value }))}
                  placeholder="Satu atau dua kalimat ringkas…"
                />
              </Field>
            </div>

            {/* Panel samping — pengaturan */}
            <aside className="w-full shrink-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 xl:w-80 xl:sticky xl:top-20">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pengaturan</h2>

              <Field
                label="Slug"
                hint="Otomatis mengikuti judul (berita baru). Bisa diubah kapan saja. Jika bentrok dengan berita lain, server menambah tanggal WIB (mis. judul-2026-05-06)."
              >
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    slugManualRef.current = true
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }}
                  placeholder="url-berita"
                />
              </Field>

              <Field label="Kategori">
                <Select
                  value={form.kategori_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, kategori_id: e.target.value }))}
                >
                  <option value="">Tanpa kategori</option>
                  {kategori.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Cover" hint="Untuk kartu berita & pratinjau sosial.">
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={onCoverFile}
                      disabled={uploadCoverBusy}
                    />
                    {uploadCoverBusy ? 'Mengunggah…' : 'Unggah cover'}
                  </label>
                  <Input
                    value={form.cover_url}
                    onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))}
                    placeholder="Atau tempel URL gambar…"
                  />
                </div>
                {form.cover_url && (
                  <img
                    src={form.cover_url}
                    alt=""
                    className="mt-2 max-h-36 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-600"
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Waktu terbit">
                  <Input
                    type="datetime-local"
                    value={form.published_at}
                    onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))}
                  />
                </Field>
              </div>

              {!canPublishHere && (
                <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  Tanpa hak publish: hanya status draf. Minta aksi «Berita · Publikasikan» bila perlu.
                </div>
              )}

              <details className="rounded-lg border border-slate-200 dark:border-slate-600">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  SEO / Open Graph
                </summary>
                <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-600">
                  <Field label="OG title">
                    <Input
                      value={form.og_title}
                      onChange={(e) => setForm((f) => ({ ...f, og_title: e.target.value }))}
                    />
                  </Field>
                  <Field label="OG image URL">
                    <Input
                      value={form.og_image}
                      onChange={(e) => setForm((f) => ({ ...f, og_image: e.target.value }))}
                    />
                  </Field>
                  <Field label="OG description">
                    <Textarea
                      rows={2}
                      value={form.og_description}
                      onChange={(e) => setForm((f) => ({ ...f, og_description: e.target.value }))}
                    />
                  </Field>
                </div>
              </details>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
