import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { Btn, Card, Input, PageHeader, Select, StatusBadge, WebsitePageShell } from './_shared'

export default function WebsiteBerita() {
  const navigate = useNavigate()
  const access = useWebsiteFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (search) params.q = search
      if (statusFilter) params.status = statusFilter
      const resBerita = await websiteAPI.listBerita(params)
      setRows(resBerita?.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Gagal memuat berita')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    reload()
  }, [reload])

  const onDelete = async (row) => {
    if (!access.action.beritaHapus) return
    if (!window.confirm(`Hapus berita "${row.judul}"?`)) return
    try {
      await websiteAPI.deleteBerita(row.id)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Gagal menghapus berita')
    }
  }

  return (
    <WebsitePageShell>
      <PageHeader
        title="Berita"
        description="Kelola berita yang tampil di web publik. Sunting di halaman editor penuh."
      >
        <Btn onClick={() => navigate('/website/berita/editor')}>+ Berita baru</Btn>
      </PageHeader>

      <Card>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <Input
            placeholder="Cari judul/slug/ringkasan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-xs"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="md:max-w-[160px]"
          >
            <option value="">Semua status</option>
            <option value="publish">Publish</option>
            <option value="draft">Draft</option>
          </Select>
        </div>
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
              <th className="px-4 py-2">Kategori</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Publish</th>
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
                  Belum ada berita.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="block text-left font-medium text-slate-800 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      onClick={() => navigate(`/website/berita/editor/${row.id}`)}
                    >
                      {row.judul}
                    </button>
                    <div className="text-xs text-slate-400 dark:text-slate-500">/{row.slug}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{row.kategori_nama || '—'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {row.published_at || '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Btn variant="ghost" onClick={() => navigate(`/website/berita/editor/${row.id}`)}>
                        Ubah
                      </Btn>
                      {access.action.beritaHapus && (
                        <Btn variant="danger" onClick={() => onDelete(row)}>
                          Hapus
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </WebsitePageShell>
  )
}
