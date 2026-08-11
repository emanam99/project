import { useCallback, useEffect, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { BottomSheet, Btn, Card, Field, Input, PageHeader, Select, WebsitePageShell } from './_shared'

const empty = {
  id: null,
  judul: '',
  gambar_url: '',
  link_url: '',
  urutan: 0,
  aktif: 1,
  periode_mulai: '',
  periode_akhir: ''
}

export default function WebsiteBanner() {
  const access = useWebsiteFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [uploadGambarBusy, setUploadGambarBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await websiteAPI.listBanner()
      setRows(res?.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal memuat')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const onSave = async (e) => {
    e?.preventDefault?.()
    setSaving(true)
    try {
      const payload = {
        ...form,
        urutan: Number(form.urutan) || 0,
        aktif: Number(form.aktif) ? 1 : 0,
        periode_mulai: form.periode_mulai || null,
        periode_akhir: form.periode_akhir || null,
        link_url: form.link_url || null
      }
      if (form.id) await websiteAPI.updateBanner(form.id, payload)
      else await websiteAPI.createBanner(payload)
      setOpen(false)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }
  const onDelete = async (row) => {
    if (!access.action.bannerKelola) return
    if (!window.confirm(`Hapus banner "${row.judul}"?`)) return
    try {
      await websiteAPI.deleteBanner(row.id)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  const onGambarFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadGambarBusy(true)
    try {
      const res = await websiteAPI.uploadImage(file, 'banner')
      if (res?.success && res.data?.url) {
        setForm((f) => ({ ...f, gambar_url: res.data.url }))
      } else {
        alert(res?.message || 'Gagal mengunggah gambar')
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal mengunggah gambar')
    } finally {
      setUploadGambarBusy(false)
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader title="Banner beranda" description="Slide / banner di beranda web publik. Atur urutan, aktif, dan periode tayang.">
        {access.action.bannerKelola && (
          <Btn
            onClick={() => {
              setForm(empty)
              setOpen(true)
            }}
          >
            + Banner baru
          </Btn>
        )}
      </PageHeader>
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="text-sm text-slate-400">Memuat…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400">Belum ada banner.</div>
        ) : (
          rows.map((row) => (
            <Card key={row.id} className="overflow-hidden p-0">
              {row.gambar_url ? (
                <img src={row.gambar_url} alt={row.judul} className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-700">
                  Tidak ada gambar
                </div>
              )}
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{row.judul}</div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${row.aktif ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                  >
                    {row.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Urutan {row.urutan} · {row.periode_mulai || '∞'} – {row.periode_akhir || '∞'}
                </div>
                {row.link_url && (
                  <a
                    href={row.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-teal-600 hover:underline dark:text-teal-400"
                  >
                    {row.link_url}
                  </a>
                )}
                {access.action.bannerKelola && (
                  <div className="flex justify-end gap-2 pt-2">
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: row.id,
                          judul: row.judul || '',
                          gambar_url: row.gambar_url || '',
                          link_url: row.link_url || '',
                          urutan: row.urutan ?? 0,
                          aktif: row.aktif ? 1 : 0,
                          periode_mulai: row.periode_mulai || '',
                          periode_akhir: row.periode_akhir || ''
                        })
                        setOpen(true)
                      }}
                    >
                      Ubah
                    </Btn>
                    <Btn variant="danger" onClick={() => onDelete(row)}>
                      Hapus
                    </Btn>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <BottomSheet
        open={open}
        title={form.id ? 'Ubah banner' : 'Banner baru'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Btn>
            <Btn onClick={onSave} disabled={saving || !access.action.bannerKelola}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Btn>
          </>
        }
      >
        <form className="space-y-3" onSubmit={onSave}>
          <Field label="Judul">
            <Input
              required
              value={form.judul}
              onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
            />
          </Field>
          <Field
            label="Gambar"
            hint="Unggah (maks. 5 MB) atau tempel URL. Disarankan 1920×800 atau rasio 16:9."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={onGambarFile}
                  disabled={uploadGambarBusy}
                />
                {uploadGambarBusy ? 'Mengunggah…' : 'Unggah gambar'}
              </label>
              <Input
                required
                value={form.gambar_url}
                onChange={(e) => setForm((f) => ({ ...f, gambar_url: e.target.value }))}
                placeholder="https://…"
                className="flex-1"
              />
            </div>
            {form.gambar_url && (
              <img
                src={form.gambar_url}
                alt=""
                className="mt-2 max-h-40 w-full rounded-md border border-slate-200 object-contain dark:border-slate-700"
              />
            )}
          </Field>
          <Field label="Link URL (opsional)">
            <Input
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Urutan">
              <Input
                type="number"
                value={form.urutan}
                onChange={(e) => setForm((f) => ({ ...f, urutan: e.target.value }))}
              />
            </Field>
            <Field label="Aktif">
              <Select value={form.aktif ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, aktif: Number(e.target.value) }))}>
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </Select>
            </Field>
            <Field label="Periode mulai">
              <Input
                type="date"
                value={form.periode_mulai || ''}
                onChange={(e) => setForm((f) => ({ ...f, periode_mulai: e.target.value }))}
              />
            </Field>
            <Field label="Periode akhir">
              <Input
                type="date"
                value={form.periode_akhir || ''}
                onChange={(e) => setForm((f) => ({ ...f, periode_akhir: e.target.value }))}
              />
            </Field>
          </div>
        </form>
      </BottomSheet>
    </WebsitePageShell>
  )
}
