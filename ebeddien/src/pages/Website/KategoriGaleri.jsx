import { useCallback, useEffect, useState } from 'react'
import { websiteAPI } from '../../services/api'
import { BottomSheet, Btn, Card, Field, Input, PageHeader, WebsitePageShell } from './_shared'

const empty = { id: null, nama: '', slug: '', urutan: 0 }

export default function KategoriGaleri() {
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
      const res = await websiteAPI.listKategoriGaleri()
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
      const payload = { ...form, urutan: Number(form.urutan) || 0 }
      if (form.id) await websiteAPI.updateKategoriGaleri(form.id, payload)
      else await websiteAPI.createKategoriGaleri(payload)
      setOpen(false)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }
  const onDelete = async (row) => {
    if (!window.confirm(`Hapus album "${row.nama}"?`)) return
    try {
      await websiteAPI.deleteKategoriGaleri(row.id)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader title="Kategori galeri" description="Album foto untuk pengelompokan di halaman galeri.">
        <Btn
          onClick={() => {
            setForm(empty)
            setOpen(true)
          }}
        >
          + Tambah album
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
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Memuat…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Belum ada album.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{row.nama}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.slug}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.urutan}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Btn
                        variant="ghost"
                        onClick={() => {
                          setForm({ id: row.id, nama: row.nama, slug: row.slug, urutan: row.urutan })
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
        title={form.id ? 'Ubah album' : 'Album baru'}
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
          <Field label="Urutan">
            <Input
              type="number"
              value={form.urutan}
              onChange={(e) => setForm((f) => ({ ...f, urutan: e.target.value }))}
            />
          </Field>
        </form>
      </BottomSheet>
    </WebsitePageShell>
  )
}
