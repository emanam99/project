import { useCallback, useEffect, useMemo, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { BottomSheet, Btn, Card, Field, Input, PageHeader, Select, StatusBadge, Textarea, WebsitePageShell } from './_shared'

const empty = {
  id: null,
  judul: '',
  slug: '',
  konten_html: '',
  og_title: '',
  og_description: '',
  og_image: '',
  status: 'draft'
}

export default function WebsiteHalaman() {
  const access = useWebsiteFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await websiteAPI.listHalaman(search ? { q: search } : {})
      setRows(res?.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal memuat')
    } finally {
      setLoading(false)
    }
  }, [search])
  useEffect(() => {
    reload()
  }, [reload])

  const statusOptions = useMemo(
    () => (access.action.halamanPublish ? ['draft', 'publish'] : ['draft']),
    [access.action.halamanPublish]
  )

  const onSave = async (e) => {
    e?.preventDefault?.()
    setSaving(true)
    try {
      if (form.id) await websiteAPI.updateHalaman(form.id, form)
      else await websiteAPI.createHalaman(form)
      setOpen(false)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }
  const onDelete = async (row) => {
    if (!window.confirm(`Hapus halaman "${row.judul}"?`)) return
    try {
      await websiteAPI.deleteHalaman(row.id)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader title="Halaman statis" description="Tentang, Kontak, Visi-Misi, dll. Bisa di-publish atau draft.">
        <Btn
          onClick={() => {
            setForm(empty)
            setOpen(true)
          }}
        >
          + Halaman baru
        </Btn>
      </PageHeader>
      <Card>
        <Input
          placeholder="Cari judul/slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
      </Card>
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Judul</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Diubah</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Memuat…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Belum ada halaman.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-slate-800 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      onClick={() => {
                        setForm({
                          id: row.id,
                          judul: row.judul || '',
                          slug: row.slug || '',
                          konten_html: row.konten_html || '',
                          og_title: row.og_title || '',
                          og_description: row.og_description || '',
                          og_image: row.og_image || '',
                          status: row.status || 'draft'
                        })
                        setOpen(true)
                      }}
                    >
                      {row.judul}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">/{row.slug}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{row.updated_at || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Btn variant="danger" onClick={() => onDelete(row)}>
                      Hapus
                    </Btn>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <BottomSheet
        open={open}
        title={form.id ? 'Ubah halaman' : 'Halaman baru'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Btn>
            <Btn onClick={onSave} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Btn>
          </>
        }
      >
        <form className="space-y-3" onSubmit={onSave}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Judul">
              <Input
                required
                value={form.judul}
                onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
              />
            </Field>
            <Field label="Slug" hint="Kosongkan untuk dibuat otomatis.">
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Konten HTML">
            <Textarea
              rows={12}
              value={form.konten_html}
              onChange={(e) => setForm((f) => ({ ...f, konten_html: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
            <Field label="OG image URL">
              <Input
                value={form.og_image}
                onChange={(e) => setForm((f) => ({ ...f, og_image: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="OG title">
            <Input
              value={form.og_title}
              onChange={(e) => setForm((f) => ({ ...f, og_title: e.target.value }))}
            />
          </Field>
          <Field label="OG description">
            <Textarea
              rows={2}
              value={form.og_description}
              onChange={(e) => setForm((f) => ({ ...f, og_description: e.target.value }))}
            />
          </Field>
        </form>
      </BottomSheet>
    </WebsitePageShell>
  )
}
