import { useCallback, useEffect, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { BottomSheet, Btn, Card, Field, Input, PageHeader, Select, WebsitePageShell } from './_shared'

const empty = { id: null, nama: '', slug: '', urutan: 0, aktif: 1 }

export default function KategoriBerita() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await websiteAPI.listKategoriBerita()
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
      const payload = { ...form, urutan: Number(form.urutan) || 0, aktif: Number(form.aktif) ? 1 : 0 }
      if (form.id) await websiteAPI.updateKategoriBerita(form.id, payload)
      else await websiteAPI.createKategoriBerita(payload)
      setOpen(false)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }
  const onDelete = async (row) => {
    if (!window.confirm(`Hapus kategori "${row.nama}"?`)) return
    try {
      await websiteAPI.deleteKategoriBerita(row.id)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader title="Kategori berita" description="Pengelompokan berita untuk navigasi & filter di web publik.">
        <Btn
          onClick={() => {
            setForm(empty)
            setOpen(true)
          }}
        >
          + Tambah kategori
        </Btn>
      </PageHeader>
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Urutan</th>
              <th className="px-4 py-2">Aktif</th>
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
                  Belum ada kategori.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{row.nama}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.slug}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.urutan}</td>
                  <td className="px-4 py-2">
                    {row.aktif ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Aktif
                      </span>
                    ) : (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Btn
                        variant="ghost"
                        onClick={() => {
                          setForm({ id: row.id, nama: row.nama, slug: row.slug, urutan: row.urutan, aktif: row.aktif })
                          setOpen(true)
                        }}
                      >
                        Ubah
                      </Btn>
                      <Btn variant="danger" onClick={() => onDelete(row)}>
                        Hapus
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <BottomSheet
        open={open}
        title={form.id ? 'Ubah kategori' : 'Kategori baru'}
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
          <Field label="Nama">
            <Input
              required
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
            />
          </Field>
          <Field label="Slug" hint="Kosongkan untuk dibuat otomatis.">
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
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
          </div>
        </form>
      </BottomSheet>
    </WebsitePageShell>
  )
}
