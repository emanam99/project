import { useCallback, useEffect, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { BottomSheet, Btn, Card, Field, Input, PageHeader, Select, Textarea, WebsitePageShell } from './_shared'

const empty = { id: null, judul: '', deskripsi: '', gambar_url: '', kategori_id: '', urutan: 0, aktif: 1 }

export default function WebsiteGaleri() {
  const access = useWebsiteFiturAccess()
  const [rows, setRows] = useState([])
  const [kategori, setKategori] = useState([])
  const [filterKategori, setFilterKategori] = useState('')
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
      const params = filterKategori ? { kategori_id: filterKategori } : {}
      const [resG, resK] = await Promise.all([
        websiteAPI.listGaleri(params),
        websiteAPI.listKategoriGaleri()
      ])
      setRows(resG?.data || [])
      setKategori(resK?.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal memuat')
    } finally {
      setLoading(false)
    }
  }, [filterKategori])
  useEffect(() => {
    reload()
  }, [reload])

  const onSave = async (e) => {
    e?.preventDefault?.()
    setSaving(true)
    try {
      const payload = {
        ...form,
        kategori_id: form.kategori_id === '' ? null : Number(form.kategori_id),
        urutan: Number(form.urutan) || 0,
        aktif: Number(form.aktif) ? 1 : 0
      }
      if (form.id) await websiteAPI.updateGaleri(form.id, payload)
      else await websiteAPI.createGaleri(payload)
      setOpen(false)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }
  const onDelete = async (row) => {
    if (!access.action.galeriKelola) return
    if (!window.confirm(`Hapus foto "${row.judul}"?`)) return
    try {
      await websiteAPI.deleteGaleri(row.id)
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
      const res = await websiteAPI.uploadImage(file, 'galeri')
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
      <PageHeader title="Galeri foto" description="Foto kegiatan / dokumentasi pesantren. Atur urutan & album.">
        {access.action.galeriKelola && (
          <Btn
            onClick={() => {
              setForm(empty)
              setOpen(true)
            }}
          >
            + Foto baru
          </Btn>
        )}
      </PageHeader>
      <Card>
        <Select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className="md:max-w-xs">
          <option value="">Semua kategori</option>
          {kategori.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
            </option>
          ))}
        </Select>
      </Card>
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {loading ? (
          <div className="text-sm text-slate-400">Memuat…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400">Belum ada foto.</div>
        ) : (
          rows.map((row) => (
            <Card key={row.id} className="overflow-hidden p-0">
              {row.gambar_url ? (
                <img src={row.gambar_url} alt={row.judul} className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-700">
                  No image
                </div>
              )}
              <div className="space-y-1 p-3">
                <div className="truncate font-medium text-slate-800 dark:text-slate-100">{row.judul}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{row.kategori_nama || '—'}</div>
                {access.action.galeriKelola && (
                  <div className="flex justify-end gap-2 pt-1">
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: row.id,
                          judul: row.judul || '',
                          deskripsi: row.deskripsi || '',
                          gambar_url: row.gambar_url || '',
                          kategori_id: row.kategori_id ?? '',
                          urutan: row.urutan ?? 0,
                          aktif: row.aktif ? 1 : 0
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
        title={form.id ? 'Ubah foto' : 'Foto baru'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Btn>
            <Btn onClick={onSave} disabled={saving || !access.action.galeriKelola}>
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
          <Field label="Gambar" hint="Unggah (maks. 5 MB) atau tempel URL absolut.">
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
          <Field label="Deskripsi">
            <Textarea
              rows={3}
              value={form.deskripsi}
              onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori">
              <Select value={form.kategori_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, kategori_id: e.target.value }))}>
                <option value="">Tanpa kategori</option>
                {kategori.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </Select>
            </Field>
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
          </div>
        </form>
      </BottomSheet>
    </WebsitePageShell>
  )
}
