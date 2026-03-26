import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import { deepseekAPI } from '../../services/api'
import { useChatAiHeaderSlot } from '../../contexts/ChatAiHeaderContext'
import EbeddienChatHeaderTraining from './DeepseekChat/EbeddienChatHeaderTraining'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const ASSISTANT_NAME = 'eBeddien'

const CATEGORY_COLORS = [
  '#0d9488',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#a855f7'
]

function nf(n) {
  if (n == null || Number.isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('id-ID')
}

export default function AiChatDashboard() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)

  const setHeaderFromLayout = useChatAiHeaderSlot()
  useLayoutEffect(() => {
    if (!setHeaderFromLayout) return
    setHeaderFromLayout(
      <EbeddienChatHeaderTraining
        assistantName={ASSISTANT_NAME}
        variant="dashboard"
        accountLoading={false}
        chatHeaderMenuOpen={chatHeaderMenuOpen}
        setChatHeaderMenuOpen={setChatHeaderMenuOpen}
      />
    )
    return () => setHeaderFromLayout(null)
  }, [setHeaderFromLayout, chatHeaderMenuOpen])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await deepseekAPI.adminAiChatDashboard({ days })
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat dashboard')
        setPayload(null)
        return
      }
      setPayload(res.data || null)
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Gagal memuat dashboard')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    load()
  }, [load])

  const totals = payload?.totals || {}
  const channel = payload?.channel || {}
  const daily = Array.isArray(payload?.daily) ? payload.daily : []
  const categories = Array.isArray(payload?.categories) ? payload.categories : []
  const topUsers = Array.isArray(payload?.top_users) ? payload.top_users : []

  const dailyLineData = useMemo(() => {
    const labels = daily.map((d) => {
      const [y, m, day] = (d.date || '').split('-')
      return day && m ? `${day}/${m}` : d.date || ''
    })
    return {
      labels,
      datasets: [
        {
          label: 'Pesan (pasangan user–AI)',
          data: daily.map((d) => d.count ?? 0),
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13, 148, 136, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4
        }
      ]
    }
  }, [daily])

  const categoryDoughnutData = useMemo(() => {
    const labels = categories.map((c) => c.category || '')
    const data = categories.map((c) => c.count ?? 0)
    const bg = labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length])
    return { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 0 }] }
  }, [categories])

  const categoryBarData = useMemo(() => {
    const top = categories.slice(0, 10)
    return {
      labels: top.map((c) => (c.category || '').slice(0, 28) + ((c.category || '').length > 28 ? '…' : '')),
      datasets: [
        {
          label: 'Jumlah',
          data: top.map((c) => c.count ?? 0),
          backgroundColor: top.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length])
        }
      ]
    }
  }, [categories])

  const channelDoughnutData = useMemo(
    () => ({
      labels: ['Aplikasi / web', 'WhatsApp'],
      datasets: [
        {
          data: [channel.web_app ?? 0, channel.whatsapp ?? 0],
          backgroundColor: ['#0ea5e9', '#22c55e'],
          borderWidth: 0
        }
      ]
    }),
    [channel.web_app, channel.whatsapp]
  )

  const chartFont = { family: 'system-ui, sans-serif' }
  const axisColor = 'rgba(100, 116, 139, 0.9)'
  const gridColor = 'rgba(148, 163, 184, 0.2)'

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: axisColor, font: chartFont } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          ticks: { color: axisColor, maxRotation: 45, minRotation: 0, maxTicksLimit: daily.length > 20 ? 12 : 16 },
          grid: { color: gridColor }
        },
        y: {
          beginAtZero: true,
          ticks: { color: axisColor, precision: 0 },
          grid: { color: gridColor }
        }
      }
    }),
    [daily.length]
  )

  const barOptions = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: axisColor, precision: 0 },
          grid: { color: gridColor }
        },
        y: {
          ticks: { color: axisColor, font: { size: 11 } },
          grid: { display: false }
        }
      }
    }),
    []
  )

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: axisColor, font: chartFont, boxWidth: 12, padding: 8 }
        }
      }
    }),
    []
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 sm:px-3">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 pt-2">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Dashboard chat AI</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ringkasan, grafik, dan tabel mengikuti rentang hari yang dipilih (kategori topik tidak memasukkan penanda WA).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ai-dash-days" className="text-xs text-gray-600 dark:text-gray-400">
            Rentang
          </label>
          <select
            id="ai-dash-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded-lg border border-teal-600 bg-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Muat ulang
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {loading && !payload ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">Memuat…</div>
        ) : (
          <div className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: `Pesan (${days} hari)`, value: nf(totals.messages) },
                { label: 'Dengan user', value: nf(totals.with_user) },
                { label: 'Tanpa user', value: nf(totals.anonymous) },
                { label: 'User unik', value: nf(totals.distinct_users) },
                { label: 'Web / app', value: nf(channel.web_app) },
                { label: 'WhatsApp', value: nf(channel.whatsapp) }
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {c.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{c.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Volume harian ({days} hari terakhir)
                </h2>
                <div className="h-[260px]">
                  <Line data={dailyLineData} options={lineOptions} />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Saluran</h2>
                <div className="mx-auto h-[240px] max-w-sm">
                  <Doughnut data={channelDoughnutData} options={doughnutOptions} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Kategori paling banyak</h2>
                <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Berdasarkan kolom kategori di log (bukan termasuk penanda saluran WA).
                </p>
                {categories.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">Belum ada data kategori.</p>
                ) : (
                  <div className="mx-auto h-[260px] max-w-md">
                    <Doughnut data={categoryDoughnutData} options={doughnutOptions} />
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Top 10 kategori (batang)</h2>
                {categories.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">Belum ada data kategori.</p>
                ) : (
                  <div className="h-[280px]">
                    <Bar data={categoryBarData} options={barOptions} />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pengguna paling aktif</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Berdasarkan jumlah baris percakapan tersimpan.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Nama</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium text-right">Pesan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                          Tidak ada data pengguna.
                        </td>
                      </tr>
                    ) : (
                      topUsers.map((u, i) => (
                        <tr
                          key={u.users_id || i}
                          className="border-b border-gray-50 dark:border-gray-700/80"
                        >
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="max-w-[140px] truncate px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                            {u.nama || `User #${u.users_id}`}
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-gray-600 dark:text-gray-300">
                            {u.email || '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {nf(u.message_count)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
