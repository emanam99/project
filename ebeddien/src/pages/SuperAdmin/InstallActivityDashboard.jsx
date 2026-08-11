import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { installActivityAPI } from '../../services/api'
import { getLiveServerUrl, getLiveSocketOptions } from '../../config/liveServer'
import { useNavigate } from 'react-router-dom'

function fmtDateTime(v) {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildTrendPath(points, width, height) {
  if (!points.length) return ''
  const max = Math.max(...points.map((p) => p.c), 1)
  const stepX = points.length > 1 ? width / (points.length - 1) : width
  const coords = points.map((p, i) => {
    const x = i * stepX
    const y = height - (p.c / max) * height
    return [x, y]
  })
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`).join(' ')
}

function buildTrendCoords(points, width, height) {
  if (!points.length) return []
  const max = Math.max(...points.map((p) => p.c), 1)
  const stepX = points.length > 1 ? width / (points.length - 1) : width
  return points.map((p, i) => {
    const x = i * stepX
    const y = height - (p.c / max) * height
    return { x, y, c: p.c, t: p.t }
  })
}

function formatLocalYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Gabungkan seri install + aktif per tanggal (hari tanpa data = 0), selaras tanggal lokal. */
function mergeTimeseriesDaily(installRows, activeRows, dayCount) {
  const map = new Map()
  for (const row of installRows || []) {
    const key = String(row.d ?? '')
    if (!key) continue
    const prev = map.get(key) || { installs: 0, active: 0 }
    map.set(key, { ...prev, installs: Number(row.installs) || 0 })
  }
  for (const row of activeRows || []) {
    const key = String(row.d ?? '')
    if (!key) continue
    const prev = map.get(key) || { installs: 0, active: 0 }
    map.set(key, { ...prev, active: Number(row.active) || 0 })
  }
  const series = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let off = dayCount - 1; off >= 0; off -= 1) {
    const dt = new Date(today)
    dt.setDate(dt.getDate() - off)
    const key = formatLocalYmd(dt)
    const m = map.get(key) || {}
    series.push({ d: key, installs: m.installs ?? 0, active: m.active ?? 0 })
  }
  return series
}

/** Gabungkan seri registrasi eBeddien vs MyBeddian per tanggal. */
function mergeUsersTimeseriesDaily(ebeddienRows, mybeddienRows, dayCount) {
  const map = new Map()
  for (const row of ebeddienRows || []) {
    const key = String(row.d ?? '')
    if (!key) continue
    const prev = map.get(key) || { ebeddien: 0, mybeddien: 0 }
    map.set(key, { ...prev, ebeddien: Number(row.c) || 0 })
  }
  for (const row of mybeddienRows || []) {
    const key = String(row.d ?? '')
    if (!key) continue
    const prev = map.get(key) || { ebeddien: 0, mybeddien: 0 }
    map.set(key, { ...prev, mybeddien: Number(row.c) || 0 })
  }
  const series = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let off = dayCount - 1; off >= 0; off -= 1) {
    const dt = new Date(today)
    dt.setDate(dt.getDate() - off)
    const key = formatLocalYmd(dt)
    const m = map.get(key) || {}
    series.push({ d: key, installs: m.ebeddien ?? 0, active: m.mybeddien ?? 0 })
  }
  return series
}

/** Garis ganda install vs aktif harian (SVG path). */
function buildDualLineChart(series, width, height, padL, padR, padT, padB) {
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const n = series.length
  if (!n) {
    return {
      pathI: '',
      pathA: '',
      maxY: 1,
      ptsI: [],
      ptsA: [],
      tickXs: [],
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH
    }
  }
  const maxY = Math.max(1, ...series.map((p) => Math.max(p.installs, p.active)))
  const toY = (v) => padT + innerH - (v / maxY) * innerH
  if (n === 1) {
    const x = padL + innerW / 2
    const p = series[0]
    return {
      pathI: `M ${x} ${toY(p.installs)} L ${x + 0.5} ${toY(p.installs)}`,
      pathA: `M ${x} ${toY(p.active)} L ${x + 0.5} ${toY(p.active)}`,
      maxY,
      ptsI: [{ x, y: toY(p.installs), d: p.d, v: p.installs }],
      ptsA: [{ x, y: toY(p.active), d: p.d, v: p.active }],
      tickXs: [{ x, label: p.d.slice(5) }],
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH
    }
  }
  const stepX = innerW / (n - 1)
  const ptsI = series.map((p, i) => {
    const x = padL + i * stepX
    return { x, y: toY(p.installs), d: p.d, v: p.installs }
  })
  const ptsA = series.map((p, i) => {
    const x = padL + i * stepX
    return { x, y: toY(p.active), d: p.d, v: p.active }
  })
  const pathI = ptsI.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ')
  const pathA = ptsA.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ')
  const tickStep = Math.max(1, Math.ceil(n / 7))
  const tickXs = []
  for (let i = 0; i < n; i += tickStep) {
    tickXs.push({ x: padL + i * stepX, label: series[i].d.slice(5) })
  }
  const lastX = padL + (n - 1) * stepX
  if (!tickXs.length || Math.abs(tickXs[tickXs.length - 1].x - lastX) > 8) {
    tickXs.push({ x: lastX, label: series[n - 1].d.slice(5) })
  }
  return {
    pathI,
    pathA,
    maxY,
    ptsI,
    ptsA,
    tickXs,
    padL,
    padR,
    padT,
    padB,
    innerW,
    innerH
  }
}

function buildMiniBars(values, width, height, padB) {
  if (!values.length) return []
  const n = values.length
  const max = Math.max(1, ...values.map((v) => v.val))
  const gap = 1
  const slot = width / n
  const barW = Math.max(1, slot - gap)
  return values.map((row, i) => {
    const bh = (row.val / max) * (height - padB - 6)
    const x = i * slot + gap / 2
    const y = height - padB - bh
    return { ...row, x, y, w: barW, h: bh }
  })
}

const APP_OPTIONS = [
  { value: '', label: 'Semua App' },
  { value: 'ebeddien', label: 'eBeddien' },
  { value: 'mybeddien', label: 'MyBeddien' },
  { value: 'nailul-murod', label: 'Nailul Murod' }
]

export default function InstallActivityDashboard() {
  const trendBoxRef = useRef(null)
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [dashboard, setDashboard] = useState(null)
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total_pages: 1, total_rows: 0 })
  const [filters, setFilters] = useState({ app_key: '', access_mode: '', search: '' })
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [breakdown, setBreakdown] = useState({ per_app: [], by_mode: [], by_browser: [] })
  const [retention, setRetention] = useState({ cohort_size: 0, d1: { retained: 0, rate_percent: 0 }, d7: { retained: 0, rate_percent: 0 }, d30: { retained: 0, rate_percent: 0 } })
  const [funnel, setFunnel] = useState({ steps: [] })
  const [deployChecklist, setDeployChecklist] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [onlineHistory, setOnlineHistory] = useState([])
  const [onlineRange, setOnlineRange] = useState(30)
  const [hoverPointIdx, setHoverPointIdx] = useState(null)
  const [touchPinned, setTouchPinned] = useState(false)
  const [timeseries, setTimeseries] = useState({ installs: [], active: [] })
  const [usersStats, setUsersStats] = useState(null)
  const [usersTimeseries, setUsersTimeseries] = useState({ ebeddien: [], mybeddien: [] })
  const [loadingUsersStats, setLoadingUsersStats] = useState(true)
  const refreshInFlightRef = useRef(false)
  const lastRefreshAtRef = useRef(0)

  const fetchTimeseries = useCallback(async (nextDays = days) => {
    try {
      const res = await installActivityAPI.getTimeseries({ days: nextDays })
      if (res?.success && res.data) {
        setTimeseries({
          installs: Array.isArray(res.data.installs) ? res.data.installs : [],
          active: Array.isArray(res.data.active) ? res.data.active : []
        })
      }
    } catch (_) {
      /* tidak blokir dashboard */
    }
  }, [days])

  const fetchUsersStats = useCallback(async () => {
    try {
      const res = await installActivityAPI.getUsersStats()
      if (res?.success) setUsersStats(res.data || null)
    } catch (_) {
      /* tidak blokir dashboard */
    }
  }, [])

  const fetchUsersTimeseries = useCallback(async (nextDays = days) => {
    try {
      const res = await installActivityAPI.getUsersTimeseries({ days: nextDays })
      if (res?.success && res.data) {
        setUsersTimeseries({
          ebeddien: Array.isArray(res.data.ebeddien) ? res.data.ebeddien : [],
          mybeddien: Array.isArray(res.data.mybeddien) ? res.data.mybeddien : []
        })
      }
    } catch (_) {
      /* tidak blokir dashboard */
    }
  }, [days])

  const fetchDashboard = useCallback(async (nextDays = days) => {
    const res = await installActivityAPI.getOverview({ days: nextDays })
    if (!res?.success) throw new Error(res?.message || 'Gagal memuat dashboard')
    setDashboard(res.data || null)
  }, [days])

  const fetchAnalyticsExtras = useCallback(async () => {
    const [breakdownRes, retentionRes, funnelRes, checklistRes] = await Promise.all([
      installActivityAPI.getBreakdown(),
      installActivityAPI.getRetention(),
      installActivityAPI.getFunnel(),
      installActivityAPI.getDeployChecklist()
    ])
    if (breakdownRes?.success) setBreakdown(breakdownRes.data || { per_app: [], by_mode: [], by_browser: [] })
    if (retentionRes?.success) {
      setRetention((prev) => (retentionRes.data != null ? retentionRes.data : prev))
    }
    if (funnelRes?.success) setFunnel(funnelRes.data || { steps: [] })
    if (checklistRes?.success) setDeployChecklist(checklistRes.data?.checklist || [])
  }, [])

  const fetchLiveOnline = useCallback(async () => {
    try {
      const base = getLiveServerUrl()
      const res = await fetch(`${base}/admin/online`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.success) {
        setOnlineUsers(Array.isArray(data.users) ? data.users : [])
        setOnlineCount(data.count ?? (Array.isArray(data.users) ? data.users.length : 0))
      }
    } catch (_) {
      // ignore panel error agar dashboard utama tetap jalan
    }
  }, [])

  const fetchList = useCallback(async (nextPage = 1, nextFilters = filters, nextDays = days) => {
    const params = {
      page: nextPage,
      limit: pagination.limit,
      days: nextDays
    }
    if (nextFilters.app_key) params.app_key = nextFilters.app_key
    if (nextFilters.access_mode) params.access_mode = nextFilters.access_mode
    if (nextFilters.search?.trim()) params.search = nextFilters.search.trim()
    const res = await installActivityAPI.getList(params)
    if (!res?.success) throw new Error(res?.message || 'Gagal memuat daftar')
    setItems(Array.isArray(res.data) ? res.data : [])
    setPagination((prev) => ({
      ...prev,
      ...(res.pagination || {}),
      page: (res.pagination?.page ?? nextPage),
      limit: (res.pagination?.limit ?? prev.limit)
    }))
  }, [days, filters, pagination.limit])

  const refreshAllData = useCallback(async () => {
    const now = Date.now()
    if (refreshInFlightRef.current) return
    if ((now - lastRefreshAtRef.current) < 1500) return
    refreshInFlightRef.current = true
    lastRefreshAtRef.current = now
    try {
      await Promise.all([
        fetchDashboard(days),
        fetchTimeseries(days),
        fetchUsersStats(),
        fetchUsersTimeseries(days),
        fetchList(1, filters, days),
        fetchAnalyticsExtras(),
        fetchLiveOnline()
      ])
    } finally {
      refreshInFlightRef.current = false
    }
  }, [days, fetchAnalyticsExtras, fetchDashboard, fetchTimeseries, fetchUsersStats, fetchUsersTimeseries, fetchList, fetchLiveOnline, filters])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setError('')
      setLoading(true)
      setLoadingUsersStats(true)
      try {
        await fetchDashboard(days)
        if (mounted) setLoading(false)
      } catch (e) {
        if (mounted) {
          setError(e?.message || 'Gagal memuat data')
          setLoading(false)
          setLoadingUsersStats(false)
        }
        return
      }
      if (!mounted) return
      try {
        await Promise.all([
          fetchAnalyticsExtras(),
          fetchLiveOnline(),
          fetchTimeseries(days),
          fetchUsersStats(),
          fetchUsersTimeseries(days)
        ])
      } catch (_) {
        /* breakdown/retention/funnel/online/timeseries: tidak blokir angka KPI */
      } finally {
        if (mounted) setLoadingUsersStats(false)
      }
    })()
    return () => { mounted = false }
  }, [days, fetchDashboard, fetchAnalyticsExtras, fetchLiveOnline, fetchTimeseries, fetchUsersStats, fetchUsersTimeseries])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setError('')
        setLoadingList(true)
        await fetchList(1, filters, days)
      } catch (e) {
        if (mounted) setError(e?.message || 'Gagal memuat data')
      } finally {
        if (mounted) setLoadingList(false)
      }
    })()
    return () => { mounted = false }
  }, [days, filters, fetchList])

  useEffect(() => {
    const pushPoint = () => {
      const now = new Date()
      const label = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      setOnlineHistory((prev) => {
        const next = [...prev, { t: label, c: onlineCount }]
        return next.slice(-30)
      })
    }
    pushPoint()
    const id = window.setInterval(pushPoint, 60_000)
    return () => window.clearInterval(id)
  }, [onlineCount])

  useEffect(() => {
    const socket = io(getLiveServerUrl(), getLiveSocketOptions())
    socket.on('app_install_activity_hint', refreshAllData)
    socket.on('app_install_kpi_updated', refreshAllData)
    socket.on('users_updated', (data) => {
      setOnlineUsers(Array.isArray(data?.users) ? data.users : [])
      setOnlineCount(data?.count ?? (Array.isArray(data?.users) ? data.users.length : 0))
    })
    return () => {
      socket.off('app_install_activity_hint', refreshAllData)
      socket.off('app_install_kpi_updated', refreshAllData)
      socket.off('users_updated')
      socket.disconnect()
    }
  }, [refreshAllData])

  const onlineBreakdown = useMemo(() => {
    let loggedIn = 0
    let visitors = 0
    for (const u of onlineUsers) {
      if (u?.user_id && String(u.user_id).trim() !== '') loggedIn += 1
      else visitors += 1
    }
    return { loggedIn, visitors }
  }, [onlineUsers])
  const trendForChart = useMemo(() => onlineHistory.slice(-onlineRange), [onlineHistory, onlineRange])
  const trendPath = useMemo(() => buildTrendPath(trendForChart, 300, 180), [trendForChart])
  const trendCoords = useMemo(() => buildTrendCoords(trendForChart, 300, 180), [trendForChart])
  const latestPoint = trendCoords.length ? trendCoords[trendCoords.length - 1] : null
  const hoverPoint = hoverPointIdx != null && trendCoords[hoverPointIdx] ? trendCoords[hoverPointIdx] : null
  const trendTone = useMemo(() => {
    if (trendForChart.length < 2) return 'teal'
    const first = trendForChart[0]?.c ?? 0
    const last = trendForChart[trendForChart.length - 1]?.c ?? 0
    return last < first ? 'rose' : 'teal'
  }, [trendForChart])

  useEffect(() => {
    if (!touchPinned) return
    const onPointerDown = (ev) => {
      const el = trendBoxRef.current
      if (!el) return
      if (!el.contains(ev.target)) {
        setTouchPinned(false)
        setHoverPointIdx(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [touchPinned])

  const cards = useMemo(() => {
    const totals = dashboard?.totals || {}
    return [
      { label: 'Total Install', value: totals.total_installations ?? 0 },
      { label: 'DAU (24 Jam)', value: totals.dau ?? 0 },
      { label: 'WAU (7 Hari)', value: totals.wau ?? 0 },
      { label: 'MAU (30 Hari)', value: totals.mau ?? 0 },
      { label: 'Akses PWA', value: totals.total_pwa ?? 0 },
      { label: 'Akses Browser', value: totals.total_browser ?? 0 }
    ]
  }, [dashboard])

  const userCards = useMemo(() => {
    const eb = usersStats?.ebeddien || {}
    const mb = usersStats?.mybeddien || {}
    return [
      { label: 'Total Akun', value: usersStats?.total_users ?? 0 },
      { label: 'User eBeddien', value: eb.total ?? 0, sub: `Aktif: ${eb.active ?? 0}` },
      { label: 'User MyBeddian', value: mb.total ?? 0, sub: `Aktif: ${mb.active ?? 0}` },
      { label: 'Overlap (keduanya)', value: usersStats?.overlap_both ?? 0 },
      { label: 'Santri', value: mb.santri ?? 0 },
      { label: 'Toko', value: mb.toko ?? 0 }
    ]
  }, [usersStats])

  const usersDonut = useMemo(() => {
    const eb = Number(usersStats?.ebeddien?.total) || 0
    const parts = [
      { key: 'ebeddien', label: 'eBeddien', count: eb },
      { key: 'santri', label: 'MyBeddian Santri', count: Number(usersStats?.mybeddien?.santri) || 0 },
      { key: 'toko', label: 'MyBeddian Toko', count: Number(usersStats?.mybeddien?.toko) || 0 },
      { key: 'pjgt', label: 'MyBeddian PJGT', count: Number(usersStats?.mybeddien?.pjgt) || 0 }
    ].filter((p) => p.count > 0)
    const total = parts.reduce((s, p) => s + p.count, 0) || 1
    const palette = ['#6366f1', '#0d9488', '#d97706', '#8b5cf6']
    let acc = 0
    const segments = parts.map((p, i) => {
      const pct = (p.count / total) * 100
      const start = acc
      acc += pct
      return { ...p, pct, color: palette[i % palette.length], start, end: acc }
    })
    const gradient =
      segments.length === 0
        ? 'conic-gradient(#e2e8f0 0% 100%)'
        : `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`
    return { segments, total: usersStats?.total_users ?? total, gradient }
  }, [usersStats])

  const mergedUsersDailySeries = useMemo(
    () => mergeUsersTimeseriesDaily(usersTimeseries.ebeddien, usersTimeseries.mybeddien, days),
    [usersTimeseries.ebeddien, usersTimeseries.mybeddien, days]
  )

  const usersDualLine = useMemo(
    () => buildDualLineChart(mergedUsersDailySeries, 640, 200, 40, 16, 12, 36),
    [mergedUsersDailySeries]
  )

  const mergedDailySeries = useMemo(
    () => mergeTimeseriesDaily(timeseries.installs, timeseries.active, days),
    [timeseries.installs, timeseries.active, days]
  )

  const dualLine = useMemo(
    () => buildDualLineChart(mergedDailySeries, 640, 200, 40, 16, 12, 36),
    [mergedDailySeries]
  )

  const installBarRects = useMemo(() => {
    const rows = (dashboard?.installs_trend || []).slice(-28).map((r) => ({
      val: r.installs_count ?? 0,
      short: String(r.install_date || '').slice(5)
    }))
    return buildMiniBars(rows, 280, 72, 18)
  }, [dashboard?.installs_trend])

  const activeBarRects = useMemo(() => {
    const rows = (dashboard?.active_daily_trend || []).slice(-28).map((r) => ({
      val: r.active_installs ?? 0,
      short: String(r.activity_date || '').slice(5)
    }))
    return buildMiniBars(rows, 280, 72, 18)
  }, [dashboard?.active_daily_trend])

  const appDonut = useMemo(() => {
    const parts = (breakdown.per_app || []).filter((p) => Number(p.total_installations) > 0)
    const total = parts.reduce((s, p) => s + Number(p.total_installations || 0), 0) || 1
    const palette = ['#0d9488', '#6366f1', '#d97706', '#64748b', '#8b5cf6']
    let acc = 0
    const segments = parts.map((p, i) => {
      const pct = (Number(p.total_installations) / total) * 100
      const start = acc
      acc += pct
      return {
        key: p.app_key || String(i),
        label: p.app_label || p.app_key,
        count: Number(p.total_installations) || 0,
        pct,
        color: palette[i % palette.length],
        start,
        end: acc
      }
    })
    const gradient =
      segments.length === 0
        ? 'conic-gradient(#e2e8f0 0% 100%)'
        : `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`
    return { segments, total, gradient }
  }, [breakdown.per_app])

  const funnelVisual = useMemo(() => {
    const steps = funnel.steps || []
    const max = Math.max(1, ...steps.map((s) => Number(s.count) || 0))
    return steps.map((s) => ({
      key: s.key,
      label: s.label,
      count: Number(s.count) || 0,
      widthPct: ((Number(s.count) || 0) / max) * 100
    }))
  }, [funnel.steps])

  const modeBarRows = useMemo(() => {
    const rows = breakdown.by_mode || []
    const max = Math.max(1, ...rows.map((r) => Number(r.total) || 0))
    return rows.map((r) => ({
      key: String(r.access_mode),
      label: String(r.access_mode || '-').toUpperCase(),
      total: Number(r.total) || 0,
      widthPct: ((Number(r.total) || 0) / max) * 100
    }))
  }, [breakdown.by_mode])

  const browserBarRows = useMemo(() => {
    const rows = (breakdown.by_browser || []).slice(0, 6)
    const max = Math.max(1, ...rows.map((r) => Number(r.total) || 0))
    return rows.map((r) => ({
      key: String(r.browser_name),
      label: r.browser_name,
      total: Number(r.total) || 0,
      widthPct: ((Number(r.total) || 0) / max) * 100
    }))
  }, [breakdown.by_browser])

  const retentionBars = useMemo(
    () => [
      { key: 'd1', label: 'D1', rate: Number(retention.d1?.rate_percent) || 0, retained: retention.d1?.retained ?? 0 },
      { key: 'd7', label: 'D7', rate: Number(retention.d7?.rate_percent) || 0, retained: retention.d7?.retained ?? 0 },
      { key: 'd30', label: 'D30', rate: Number(retention.d30?.rate_percent) || 0, retained: retention.d30?.retained ?? 0 }
    ],
    [retention.d1, retention.d7, retention.d30]
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap justify-end gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          >
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="text-xl font-semibold text-teal-600 dark:text-teal-400">{loading ? '...' : c.value}</p>
          </div>
        ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Akun Pengguna Portal</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {userCards.map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">{loadingUsersStats ? '...' : c.value}</p>
                {c.sub ? <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{c.sub}</p> : null}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Registrasi akun baru harian</p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" aria-hidden /> eBeddien (pengurus)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" aria-hidden /> MyBeddian
                  </span>
                </div>
              </div>
              <svg viewBox="0 0 640 200" className="w-full h-44 md:h-52" role="img" aria-label="Grafik registrasi pengguna eBeddien dan MyBeddian">
                {[0, 0.33, 0.66, 1].map((t) => {
                  const y = usersDualLine.padT + usersDualLine.innerH - t * usersDualLine.innerH
                  return (
                    <g key={`u-${String(t)}`}>
                      <line
                        x1={usersDualLine.padL}
                        y1={y}
                        x2={usersDualLine.padL + usersDualLine.innerW}
                        y2={y}
                        className="stroke-gray-100 dark:stroke-gray-700/90"
                        strokeWidth="1"
                      />
                      <text x={usersDualLine.padL - 4} y={y + 3} className="fill-gray-400 dark:fill-gray-500 text-[9px]" textAnchor="end">
                        {Math.round(usersDualLine.maxY * t)}
                      </text>
                    </g>
                  )
                })}
                {usersDualLine.pathI ? (
                  <path
                    d={usersDualLine.pathI}
                    className="stroke-indigo-500 dark:stroke-indigo-400"
                    fill="none"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {usersDualLine.pathA ? (
                  <path
                    d={usersDualLine.pathA}
                    className="stroke-teal-500 dark:stroke-teal-400"
                    fill="none"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="5 4"
                  />
                ) : null}
                {usersDualLine.tickXs.map((tk, ti) => (
                  <text key={`utk-${ti}-${tk.x}`} x={tk.x} y={196} className="fill-gray-400 dark:fill-gray-500 text-[9px]" textAnchor="middle">
                    {tk.label}
                  </text>
                ))}
              </svg>
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">eBeddien: tanggal buat pengurus. MyBeddian: tanggal buat akun dengan identitas santri/toko/PJGT.</p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-3">Komposisi identitas pengguna</p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
                <div className="relative w-28 h-28 shrink-0">
                  <div className="absolute inset-0 rounded-full shadow-inner" style={{ background: usersDonut.gradient }} />
                  <div className="absolute inset-[22%] rounded-full bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-600">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{usersDonut.total}</span>
                  </div>
                </div>
                <ul className="text-xs space-y-1.5 w-full max-w-[220px]">
                  {usersDonut.segments.map((s) => (
                    <li key={s.key} className="flex justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden />
                        <span className="truncate text-gray-600 dark:text-gray-300">{s.label}</span>
                      </span>
                      <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{s.count}</span>
                    </li>
                  ))}
                  {!usersDonut.segments.length ? (
                    <li className="text-gray-500 dark:text-gray-400">{loadingUsersStats ? 'Memuat...' : 'Belum ada data.'}</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Aktivitas harian vs instal baru</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" aria-hidden /> Instal baru
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" aria-hidden /> Install aktif (unik/hari)
                </span>
              </div>
            </div>
            <svg viewBox="0 0 640 200" className="w-full h-44 md:h-52" role="img" aria-label="Grafik instal dan aktif harian">
              {[0, 0.33, 0.66, 1].map((t) => {
                const y = dualLine.padT + dualLine.innerH - t * dualLine.innerH
                return (
                  <g key={String(t)}>
                    <line
                      x1={dualLine.padL}
                      y1={y}
                      x2={dualLine.padL + dualLine.innerW}
                      y2={y}
                      className="stroke-gray-100 dark:stroke-gray-700/90"
                      strokeWidth="1"
                    />
                    <text x={dualLine.padL - 4} y={y + 3} className="fill-gray-400 dark:fill-gray-500 text-[9px]" textAnchor="end">
                      {Math.round(dualLine.maxY * t)}
                    </text>
                  </g>
                )
              })}
              {dualLine.pathI ? (
                <path
                  d={dualLine.pathI}
                  className="stroke-teal-500 dark:stroke-teal-400"
                  fill="none"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {dualLine.pathA ? (
                <path
                  d={dualLine.pathA}
                  className="stroke-indigo-500 dark:stroke-indigo-400"
                  fill="none"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="5 4"
                />
              ) : null}
              {dualLine.ptsI.length > 0 ? (
                <circle
                  cx={dualLine.ptsI[dualLine.ptsI.length - 1].x}
                  cy={dualLine.ptsI[dualLine.ptsI.length - 1].y}
                  r="3.5"
                  className="fill-teal-500 dark:fill-teal-400 stroke-white dark:stroke-gray-900"
                  strokeWidth="1.5"
                />
              ) : null}
              {dualLine.ptsA.length > 0 ? (
                <circle
                  cx={dualLine.ptsA[dualLine.ptsA.length - 1].x}
                  cy={dualLine.ptsA[dualLine.ptsA.length - 1].y}
                  r="3.5"
                  className="fill-indigo-500 dark:fill-indigo-400 stroke-white dark:stroke-gray-900"
                  strokeWidth="1.5"
                />
              ) : null}
              {dualLine.tickXs.map((tk, ti) => (
                <text key={`tk-${ti}-${tk.x}`} x={tk.x} y={196} className="fill-gray-400 dark:fill-gray-500 text-[9px]" textAnchor="middle">
                  {tk.label}
                </text>
              ))}
            </svg>
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">Sumber: agregasi harian lintas eBeddien, myBeddien, Nailul Murod (rentang sama dengan filter hari di atas).</p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-3">Distribusi install per aplikasi</p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
              <div className="relative w-28 h-28 shrink-0">
                <div className="absolute inset-0 rounded-full shadow-inner" style={{ background: appDonut.gradient }} />
                <div className="absolute inset-[22%] rounded-full bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-600">
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{appDonut.total}</span>
                </div>
              </div>
              <ul className="text-xs space-y-1.5 w-full max-w-[220px]">
                {appDonut.segments.map((s) => (
                  <li key={s.key} className="flex justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden />
                      <span className="truncate text-gray-600 dark:text-gray-300">{s.label}</span>
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{s.count}</span>
                  </li>
                ))}
                {!appDonut.segments.length ? (
                  <li className="text-gray-500 dark:text-gray-400">Belum ada data breakdown.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Live Online Monitor (eBeddien)</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Online sekarang: <span className="font-semibold text-teal-600 dark:text-teal-400">{onlineCount}</span>
              </p>
              <button
                type="button"
                onClick={() => navigate('/super-admin/online')}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Buka Halaman Online
              </button>
            </div>
          </div>
          <div className="mb-2 flex items-center gap-3 text-xs">
            <span className="text-gray-500 dark:text-gray-400">Login: <span className="font-semibold text-gray-800 dark:text-gray-100">{onlineBreakdown.loggedIn}</span></span>
            <span className="text-gray-500 dark:text-gray-400">Visitor: <span className="font-semibold text-gray-800 dark:text-gray-100">{onlineBreakdown.visitors}</span></span>
          </div>
          <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Grafik Tren Online</p>
              <div className="inline-flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                {[10, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setOnlineRange(m)}
                    className={`px-2 py-0.5 text-[10px] ${
                      onlineRange === m
                        ? 'bg-teal-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
            <div ref={trendBoxRef} className="rounded bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-1">
              <svg
                viewBox="0 0 300 180"
                className="w-full h-44 md:h-52"
                onMouseLeave={() => {
                  if (!touchPinned) setHoverPointIdx(null)
                }}
                onMouseMove={(e) => {
                  if (touchPinned) return
                  if (!trendCoords.length) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = ((e.clientX - rect.left) / rect.width) * 300
                  let nearestIdx = 0
                  let nearestDist = Number.POSITIVE_INFINITY
                  for (let i = 0; i < trendCoords.length; i += 1) {
                    const dist = Math.abs(trendCoords[i].x - x)
                    if (dist < nearestDist) {
                      nearestDist = dist
                      nearestIdx = i
                    }
                  }
                  setHoverPointIdx(nearestIdx)
                }}
                onTouchStart={(e) => {
                  if (!trendCoords.length) return
                  const touch = e.touches?.[0]
                  if (!touch) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = ((touch.clientX - rect.left) / rect.width) * 300
                  let nearestIdx = 0
                  let nearestDist = Number.POSITIVE_INFINITY
                  for (let i = 0; i < trendCoords.length; i += 1) {
                    const dist = Math.abs(trendCoords[i].x - x)
                    if (dist < nearestDist) {
                      nearestDist = dist
                      nearestIdx = i
                    }
                  }
                  setHoverPointIdx(nearestIdx)
                  setTouchPinned(true)
                }}
                onTouchMove={(e) => {
                  if (!trendCoords.length || !touchPinned) return
                  const touch = e.touches?.[0]
                  if (!touch) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = ((touch.clientX - rect.left) / rect.width) * 300
                  let nearestIdx = 0
                  let nearestDist = Number.POSITIVE_INFINITY
                  for (let i = 0; i < trendCoords.length; i += 1) {
                    const dist = Math.abs(trendCoords[i].x - x)
                    if (dist < nearestDist) {
                      nearestDist = dist
                      nearestIdx = i
                    }
                  }
                  setHoverPointIdx(nearestIdx)
                }}
              >
                <path d="M 0 179 L 300 179" className="stroke-gray-200 dark:stroke-gray-700" fill="none" strokeWidth="1" />
                <path
                  d={trendPath}
                  className={trendTone === 'rose' ? 'stroke-rose-500 dark:stroke-rose-400' : 'stroke-teal-500 dark:stroke-teal-400'}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {latestPoint && (
                  <circle
                    cx={latestPoint.x}
                    cy={latestPoint.y}
                    r="3.5"
                    className={trendTone === 'rose' ? 'fill-rose-500 dark:fill-rose-400' : 'fill-teal-500 dark:fill-teal-400'}
                  />
                )}
                {hoverPoint && (
                  <>
                    <line
                      x1={hoverPoint.x}
                      y1="0"
                      x2={hoverPoint.x}
                      y2="180"
                      className="stroke-gray-300 dark:stroke-gray-600"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={hoverPoint.x}
                      cy={hoverPoint.y}
                      r="4"
                      className="fill-white dark:fill-gray-900 stroke-teal-500 dark:stroke-teal-400"
                      strokeWidth="2"
                    />
                  </>
                )}
              </svg>
            </div>
            {hoverPoint && (
              <div className="mt-2 text-[11px] inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                <span>Waktu: <strong>{hoverPoint.t}</strong></span>
                <span>Online: <strong>{hoverPoint.c}</strong></span>
                {touchPinned && (
                  <button
                    type="button"
                    onClick={() => {
                      setTouchPinned(false)
                      setHoverPointIdx(null)
                    }}
                    className="ml-1 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-[10px]"
                  >
                    Tutup
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="max-h-24 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900/40 p-2">
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">Data Tren Online</p>
            <div className="space-y-0.5">
              {onlineHistory.slice(-10).map((p, idx) => (
                <div key={`${p.t}-${idx}`} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500 dark:text-gray-400">{p.t}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{p.c}</span>
                </div>
              ))}
              {!onlineHistory.length && <div className="text-[11px] text-gray-500 dark:text-gray-400">Belum ada histori.</div>}
            </div>
          </div>
          <ul className="space-y-1 max-h-40 overflow-auto pr-1">
            {onlineUsers.slice(0, 20).map((u) => (
              <li key={u.socketId} className="text-xs flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-1">
                <span className="text-gray-700 dark:text-gray-200 truncate">{u.nama || u.ip || '-'}</span>
                <span className="text-gray-500 dark:text-gray-400 truncate">{u.halaman || '/'}</span>
              </li>
            ))}
            {!onlineUsers.length && (
              <li className="text-xs text-gray-500 dark:text-gray-400">Belum ada user online.</li>
            )}
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(dashboard?.per_app || []).map((a) => (
          <div key={a.app_key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="font-medium text-gray-900 dark:text-gray-100">{a.app_label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Install: {a.total_installations} | Aktif 24h: {a.active_24h}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">PWA: {a.total_pwa} | Browser: {a.total_browser}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Terakhir aktif: {fmtDateTime(a.last_active_at)}</p>
          </div>
        ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Tren install harian</p>
            {installBarRects.length ? (
              <svg viewBox="0 0 280 72" className="w-full h-20 mb-2" role="img" aria-label="Batang tren install">
                {installBarRects.map((b, i) => (
                  <rect
                    key={`ib-${b.short}-${i}`}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={Math.max(b.h, 0)}
                    rx="1"
                    className="fill-teal-500/85 dark:fill-teal-400/80"
                  />
                ))}
              </svg>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Belum ada data batang.</p>
            )}
            <div className="space-y-1 max-h-36 overflow-auto pr-1 border-t border-gray-100 dark:border-gray-700 pt-2">
              {(dashboard?.installs_trend || []).slice(-14).map((row) => (
                <div key={`ins-${row.install_date}`} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{row.install_date}</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{row.installs_count}</span>
                </div>
              ))}
              {!(dashboard?.installs_trend || []).length ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada data tren install.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Tren install aktif harian</p>
            {activeBarRects.length ? (
              <svg viewBox="0 0 280 72" className="w-full h-20 mb-2" role="img" aria-label="Batang tren aktif">
                {activeBarRects.map((b, i) => (
                  <rect
                    key={`ab-${b.short}-${i}`}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={Math.max(b.h, 0)}
                    rx="1"
                    className="fill-indigo-500/85 dark:fill-indigo-400/80"
                  />
                ))}
              </svg>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Belum ada data batang.</p>
            )}
            <div className="space-y-1 max-h-36 overflow-auto pr-1 border-t border-gray-100 dark:border-gray-700 pt-2">
              {(dashboard?.active_daily_trend || []).slice(-14).map((row) => (
                <div key={`act-${row.activity_date}`} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{row.activity_date}</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{row.active_installs}</span>
                </div>
              ))}
              {!(dashboard?.active_daily_trend || []).length ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada data active install harian.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Retention</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
              Cohort: <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{retention.cohort_size || 0}</span> install
            </p>
            <div className="space-y-3">
              {retentionBars.map((b) => (
                <div key={b.key}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">{b.label}</span>
                    <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                      {b.retained} pengguna · <span className="font-semibold text-teal-600 dark:text-teal-400">{b.rate}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400 dark:from-teal-500 dark:to-teal-300 transition-[width] duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, b.rate))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Breakdown akses</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Mode (relatif ke nilai tertinggi)</p>
            <div className="space-y-2.5 mb-4">
              {modeBarRows.map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{row.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500/90 dark:bg-cyan-400/90"
                      style={{ width: `${row.widthPct}%` }}
                    />
                  </div>
                </div>
              ))}
              {!modeBarRows.length ? <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada data mode.</p> : null}
            </div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Browser</p>
            <div className="space-y-2 max-h-40 overflow-auto pr-1">
              {browserBarRows.map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-[11px] mb-0.5 gap-2">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{row.label}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{row.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-400/90 dark:bg-slate-500/90"
                      style={{ width: `${row.widthPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Funnel</p>
            <div className="space-y-2.5 max-h-52 overflow-auto pr-1">
              {funnelVisual.map((step) => (
                <div key={step.key}>
                  <div className="flex justify-between text-[11px] mb-0.5 gap-2">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{step.label}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{step.count}</span>
                  </div>
                  <div className="h-2 rounded-md bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-md bg-indigo-500/90 dark:bg-indigo-400/90"
                      style={{ width: `${step.widthPct}%` }}
                    />
                  </div>
                </div>
              ))}
              {!funnelVisual.length ? <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada langkah funnel.</p> : null}
            </div>
            <a
              href={installActivityAPI.getExportCsvUrl()}
              className="inline-flex mt-3 text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
            >
              Export CSV
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            value={filters.app_key}
            onChange={(e) => setFilters((s) => ({ ...s, app_key: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
          >
            {APP_OPTIONS.map((opt) => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
          </select>
          <select
            value={filters.access_mode}
            onChange={(e) => setFilters((s) => ({ ...s, access_mode: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
          >
            <option value="">Semua Akses</option>
            <option value="browser">Browser</option>
            <option value="pwa">PWA</option>
          </select>
          <input
            value={filters.search}
            onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
            placeholder="Cari install_id, browser, username"
            className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">App</th>
                <th className="py-2 pr-3">Install ID</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Akses</th>
                <th className="py-2 pr-3">Browser</th>
                <th className="py-2 pr-3">Installed</th>
                <th className="py-2 pr-3">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td className="py-4 text-gray-500" colSpan={7}>Memuat data...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="py-4 text-gray-500" colSpan={7}>Belum ada data.</td></tr>
              ) : items.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3">{row.app_label}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.install_id}</td>
                  <td className="py-2 pr-3">{row.username || '-'}</td>
                  <td className="py-2 pr-3 uppercase text-xs">{row.access_mode}</td>
                  <td className="py-2 pr-3">{row.browser_name || '-'}</td>
                  <td className="py-2 pr-3">{fmtDateTime(row.installed_at)}</td>
                  <td className="py-2 pr-3">{fmtDateTime(row.last_active_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Total: {pagination.total_rows || 0}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={(pagination.page || 1) <= 1}
              onClick={() => fetchList((pagination.page || 1) - 1, filters, days)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span>Hal {pagination.page || 1} / {pagination.total_pages || 1}</span>
            <button
              type="button"
              disabled={(pagination.page || 1) >= (pagination.total_pages || 1)}
              onClick={() => fetchList((pagination.page || 1) + 1, filters, days)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Checklist Deploy</p>
        <ul className="space-y-1">
          {deployChecklist.map((item) => (
            <li key={item} className="text-xs text-gray-600 dark:text-gray-300">- {item}</li>
          ))}
          {!deployChecklist.length && <li className="text-xs text-gray-500 dark:text-gray-400">Belum ada checklist.</li>}
        </ul>
        </div>
      </div>
    </div>
  )
}
