import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { websiteAPI } from '../../services/api'
import { useWebsiteFiturAccess } from '../../hooks/useWebsiteFiturAccess'
import { WebsitePageShell } from './_shared'

const StatCard = ({ label, value, color }) => (
  <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
  </div>
)

export default function WebsiteDashboard() {
  const access = useWebsiteFiturAccess()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    websiteAPI
      .dashboard()
      .then((res) => {
        if (!mounted) return
        if (res?.success) setData(res.data || null)
        else setError(res?.message || 'Gagal memuat ringkasan')
      })
      .catch((err) => {
        if (!mounted) return
        setError(err?.response?.data?.message || err.message || 'Gagal memuat ringkasan')
      })
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const cards = useMemo(() => {
    if (!data) return []
    return [
      { label: 'Berita publish', value: data.berita_publish ?? 0, color: 'text-emerald-600 dark:text-emerald-400' },
      { label: 'Berita draft', value: data.berita_draft ?? 0, color: 'text-amber-600 dark:text-amber-400' },
      { label: 'Banner aktif', value: data.banner_aktif ?? 0, color: 'text-blue-600 dark:text-blue-400' },
      { label: 'Halaman statis', value: data.halaman_count ?? 0, color: 'text-violet-600 dark:text-violet-400' },
      { label: 'Foto galeri aktif', value: data.galeri_aktif ?? 0, color: 'text-rose-600 dark:text-rose-400' }
    ]
  }, [data])

  return (
    <WebsitePageShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-1 border-b border-slate-200/80 pb-4 dark:border-slate-700/80">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard Website</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ringkasan konten web publik pesantren. Kelola modul lewat menu di samping.
          </p>
        </header>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Memuat ringkasan…</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {cards.map((c) => (
              <StatCard key={c.label} {...c} />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Berita terakhir diubah</h2>
                {access.menu.berita && (
                  <Link to="/website/berita" className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400">
                    Kelola →
                  </Link>
                )}
              </div>
              <ul className="space-y-2 text-sm">
                {(data?.latest_berita || []).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">{b.judul}</span>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${b.status === 'publish' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                      {b.status}
                    </span>
                  </li>
                ))}
                {(!data?.latest_berita || data.latest_berita.length === 0) && (
                  <li className="text-slate-400 dark:text-slate-500">Belum ada berita.</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Halaman terakhir diubah</h2>
                {access.menu.halaman && (
                  <Link to="/website/halaman" className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400">
                    Kelola →
                  </Link>
                )}
              </div>
              <ul className="space-y-2 text-sm">
                {(data?.latest_halaman || []).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">{h.judul}</span>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">/{h.slug}</span>
                  </li>
                ))}
                {(!data?.latest_halaman || data.latest_halaman.length === 0) && (
                  <li className="text-slate-400 dark:text-slate-500">Belum ada halaman statis.</li>
                )}
              </ul>
            </div>
          </section>
        </>
      )}
      </div>
    </WebsitePageShell>
  )
}
