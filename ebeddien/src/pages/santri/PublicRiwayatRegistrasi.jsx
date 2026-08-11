import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import { PublicAnimatedCollapse } from './PublicAnimatedCollapse'
import './PublicSantri.css'

function badgeClassForStatus(text) {
  const t = String(text || '').trim()
  if (!t) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  if (t === 'Aktif') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (t.includes('Verifikasi') && !t.includes('Belum')) return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300'
  if (t.includes('Belum Bayar') || t === 'Belum Upload') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
  if (t.includes('Bayar') || t.includes('Upload')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
}

function formatDt(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Urutan kategori mengikuti kemunculan pertama di daftar item. */
function groupPsbItemsByCategory(items) {
  const order = []
  const map = new Map()
  for (const it of items) {
    const raw = it.kategori_item
    const cat = raw != null && String(raw).trim() !== '' ? String(raw).trim() : 'Lainnya'
    if (!map.has(cat)) {
      map.set(cat, [])
      order.push(cat)
    }
    map.get(cat).push(it)
  }
  return order.map((cat) => [cat, map.get(cat)])
}

function IconStatusBayar({ statusBayar }) {
  const c = String(statusBayar || '')
  if (c === 'sudah_bayar') {
    return (
      <span
        role="img"
        className="text-emerald-600 dark:text-emerald-400 text-base font-semibold inline-block"
        aria-label="Sudah dibayar (lunas)"
        title="Sudah dibayar (lunas)"
      >
        ✓
      </span>
    )
  }
  if (c === 'sebagian') {
    return (
      <span
        role="img"
        className="text-amber-600 dark:text-amber-400 text-lg font-medium inline-block"
        aria-label="Sebagian"
        title="Sebagian"
      >
        −
      </span>
    )
  }
  return (
    <span
      role="img"
      className="text-rose-600 dark:text-rose-400 text-base font-semibold inline-block"
      aria-label="Belum bayar"
      title="Belum bayar"
    >
      ✕
    </span>
  )
}

function IconStatusAmbil({ statusAmbil }) {
  const ok = String(statusAmbil || '') === 'sudah_ambil'
  if (ok) {
    return (
      <span
        role="img"
        className="text-emerald-600 dark:text-emerald-400 text-base font-semibold inline-block"
        aria-label="Sudah diambil"
        title="Sudah diambil"
      >
        ✓
      </span>
    )
  }
  return (
    <span
      role="img"
      className="text-rose-600 dark:text-rose-400 text-base font-semibold inline-block"
      aria-label="Belum diambil"
      title="Belum diambil"
    >
      ✕
    </span>
  )
}

function tahunAjaranKey(r) {
  const h = r.tahun_hijriyah != null && String(r.tahun_hijriyah).trim() !== '' ? String(r.tahun_hijriyah).trim() : null
  const m = r.tahun_masehi != null && String(r.tahun_masehi).trim() !== '' ? String(r.tahun_masehi).trim() : null
  if (h && m) return `${h} · ${m}`
  if (h) return h
  if (m) return m
  return 'Tahun ajaran belum diisi'
}

function PublicRiwayatRegistrasi() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id')
  const viewToken = searchParams.get('view_token') || ''
  const [registrasi, setRegistrasi] = useState([])
  const [santri, setSantri] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  /** Kunci = label tahun ajaran; nilai true = panel terbuka */
  const [psbAccordionOpen, setPsbAccordionOpen] = useState({})
  const darkModeContext = useDarkMode()
  const { darkMode, setDarkMode } = darkModeContext || { darkMode: false, setDarkMode: () => {} }

  useEffect(() => {
    if (!idSantri) {
      setError('Parameter id (NIS) tidak ada di tautan.')
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const api = getSlimApiUrl()
        const params = new URLSearchParams()
        params.set('id', idSantri)
        if (viewToken) params.set('view_token', viewToken)
        const headers = {}
        try {
          const authTok = localStorage.getItem('auth_token')
          if (authTok) headers.Authorization = `Bearer ${authTok}`
        } catch (_) { /* ignore */ }
        const res = await fetch(`${api}/public/registrasi-riwayat?${params.toString()}`, { headers })
        const json = await res.json()
        if (!json.success) {
          throw new Error(json.message || 'Gagal memuat riwayat')
        }
        const d = json.data || {}
        setRegistrasi(Array.isArray(d.registrasi) ? d.registrasi : [])
        setSantri(d.santri && typeof d.santri === 'object' ? d.santri : null)
      } catch (e) {
        console.error(e)
        setError(e.message || 'Gagal memuat data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [idSantri, viewToken])

  const toggleDarkMode = () => setDarkMode(!darkMode)

  const formatRp = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n) || 0)

  const registrasiByTahun = useMemo(() => {
    const map = new Map()
    for (const r of registrasi) {
      const label = tahunAjaranKey(r)
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(r)
    }
    return Array.from(map.entries())
  }, [registrasi])

  const togglePsbAccordion = (taLabel) => {
    setPsbAccordionOpen((prev) => ({ ...prev, [taLabel]: !prev[taLabel] }))
  }

  if (loading) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Riwayat Registrasi PSB</h1>
            <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
          </div>
          <button type="button" className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="loading-container">
            <div className="spinner" />
            <p>Memuat data...</p>
          </div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Riwayat Registrasi PSB</h1>
            <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
          </div>
          <button type="button" className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="error-container">
            <h1>Tidak dapat memuat</h1>
            <p>{error}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="public-header">
        <div className="header-content">
          <h1>Riwayat Registrasi PSB</h1>
          <p className="subtitle">Status pendaftaran per tahun ajaran</p>
          {santri ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <span className="font-medium text-gray-900 dark:text-gray-100">{santri.nama || '—'}</span>
              {santri.nis != null && String(santri.nis).trim() !== '' ? (
                <span className="text-gray-500 dark:text-gray-400"> · NIS {santri.nis}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <button type="button" className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="public-content-wrapper">
        {registrasi.length === 0 ? (
          <div className="biodata-section">
            <div className="biodata-card text-center text-gray-600 dark:text-gray-400 py-8">
              {santri ? (
                <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">
                  <span className="font-medium">{santri.nama || '—'}</span>
                  {santri.nis != null && String(santri.nis).trim() !== '' ? (
                    <span className="text-gray-500 dark:text-gray-400"> · NIS {santri.nis}</span>
                  ) : null}
                </p>
              ) : null}
              <p>Belum ada data registrasi PSB untuk santri ini.</p>
              <p className="text-xs mt-2">Jika baru mendaftar, data akan muncul setelah proses di sistem tersimpan.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 biodata-section public-psb-accordion">
            {registrasiByTahun.map(([taLabel, rows], accIdx) => {
              const kaliBayar = rows.reduce(
                (s, x) => s + (x.jumlah_kali_bayar ?? (Array.isArray(x.pembayaran) ? x.pembayaran.length : 0)),
                0
              )
              const sumWajib = rows.reduce((s, x) => s + (Number(x.wajib) || 0), 0)
              const sumBayar = rows.reduce((s, x) => s + (Number(x.bayar) || 0), 0)
              const sumKurang = rows.reduce((s, x) => s + (Number(x.kurang) || 0), 0)
              const statusUtama = rows[0]?.keterangan_status
              const th = rows[0]?.tahun_hijriyah != null && String(rows[0].tahun_hijriyah).trim() !== '' ? String(rows[0].tahun_hijriyah).trim() : null
              const tm = rows[0]?.tahun_masehi != null && String(rows[0].tahun_masehi).trim() !== '' ? String(rows[0].tahun_masehi).trim() : null
              const judulTahun =
                th && tm ? `${th}  ·  ${tm}` : th || tm || taLabel

              const isOpen = !!psbAccordionOpen[taLabel]
              const panelId = `psb-accordion-panel-${accIdx}`

              return (
                <div
                  key={taLabel}
                  className={`biodata-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden transition-[box-shadow] duration-300 ease-out ${
                    isOpen ? 'ring-2 ring-teal-500/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    id={`${panelId}-trigger`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => togglePsbAccordion(taLabel)}
                    className="w-full text-left px-4 pt-3 pb-2 bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-3 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors duration-200"
                  >
                    <div className="flex items-center justify-between gap-3 w-full min-h-[1.25rem]">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400 shrink-0">
                        Tahun ajaran
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${badgeClassForStatus(statusUtama)}`}
                      >
                        {statusUtama || '—'}
                      </span>
                    </div>

                    <p
                      className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50 font-mono leading-snug tracking-tight w-full"
                      title={judulTahun}
                    >
                      {judulTahun}
                    </p>

                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                      {kaliBayar} kali bayar
                      {sumKurang > 0 ? ` · Kurang ${formatRp(sumKurang)}` : ''}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-lg border border-teal-200/80 dark:border-teal-800/60 bg-teal-50/95 dark:bg-teal-950/35 px-3 py-1.5 text-xs shadow-sm">
                        <span className="text-teal-700 dark:text-teal-300 font-semibold">Wajib</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                          {formatRp(sumWajib)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/95 dark:bg-emerald-950/35 px-3 py-1.5 text-xs shadow-sm">
                        <span className="text-emerald-800 dark:text-emerald-300 font-semibold">Bayar</span>
                        <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
                          {formatRp(sumBayar)}
                        </span>
                      </span>
                    </div>

                    <div
                      className="flex justify-center w-full pt-2 pb-1 -mx-4 px-4 border-t border-gray-200/90 dark:border-gray-600/80"
                      aria-hidden
                    >
                      <span
                        className={`public-accordion-chevron text-teal-600 dark:text-teal-400 text-base leading-none select-none inline-block ${
                          isOpen ? 'public-accordion-chevron--open' : ''
                        }`}
                      >
                        ▼
                      </span>
                    </div>
                  </button>

                  <PublicAnimatedCollapse
                    id={panelId}
                    labelledBy={`${panelId}-trigger`}
                    isOpen={isOpen}
                  >
                    <div className="px-4 py-3 space-y-6 text-sm bg-white dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
                    {rows.map((r) => {
                      const faktor = Array.isArray(r.faktor_pembayaran) ? r.faktor_pembayaran : []
                      const items = Array.isArray(r.items) ? r.items : []
                      const pembayaran = Array.isArray(r.pembayaran) ? r.pembayaran : []

                      return (
                        <div
                          key={r.id_registrasi}
                          className="space-y-4 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0"
                        >
                          {rows.length > 1 ? (
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Registrasi #{r.id_registrasi}
                            </p>
                          ) : null}

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Wajib</p>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{formatRp(r.wajib)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Bayar</p>
                              <p className="font-medium text-teal-600 dark:text-teal-400">{formatRp(r.bayar)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Kurang</p>
                              <p className="font-medium text-rose-600 dark:text-rose-400">{formatRp(r.kurang)}</p>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                              Item pembayaran
                            </h3>
                            {items.length === 0 ? (
                              <p className="text-gray-500 dark:text-gray-400 text-xs italic">Belum ada daftar item di sistem.</p>
                            ) : (
                              <div className="space-y-4">
                                {groupPsbItemsByCategory(items).map(([cat, catItems]) => (
                                  <div key={cat}>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 mb-1.5">
                                      {cat}
                                    </p>
                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                                      <table className="min-w-full text-xs">
                                        <thead>
                                          <tr className="bg-gray-50 dark:bg-gray-800/80 text-left text-gray-600 dark:text-gray-300">
                                            <th className="px-2 py-2 font-medium">Item</th>
                                            <th className="px-2 py-2 font-medium text-right">Wajib</th>
                                            <th className="px-2 py-2 font-medium text-center w-12">Dibayar</th>
                                            <th className="px-2 py-2 font-medium text-center w-12">Ambil</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                          {catItems.map((it, idx) => (
                                            <tr key={`${it.id_item}-${idx}`} className="text-gray-800 dark:text-gray-200">
                                              <td className="px-2 py-2">{it.nama_item || '—'}</td>
                                              <td className="px-2 py-2 text-right font-mono tabular-nums">
                                                {formatRp(it.harga_standar)}
                                              </td>
                                              <td className="px-2 py-2 text-center align-middle">
                                                <IconStatusBayar statusBayar={it.status_bayar} />
                                              </td>
                                              <td className="px-2 py-2 text-center align-middle">
                                                <IconStatusAmbil statusAmbil={it.status_ambil} />
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {faktor.length > 0 ? (
                            <div>
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                Rincian yang memengaruhi pembayaran
                              </h3>
                              <ul className="space-y-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                                {faktor.map((f, i) => (
                                  <li key={`${f.label}-${i}`} className="text-gray-800 dark:text-gray-200">
                                    <span className="text-gray-500 dark:text-gray-400">{f.label}:</span>{' '}
                                    <span className="font-medium">{f.value}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                              Riwayat pembayaran ({pembayaran.length} kali)
                            </h3>
                            {pembayaran.length === 0 ? (
                              <p className="text-gray-500 dark:text-gray-400 text-xs italic">Belum ada pembayaran tercatat.</p>
                            ) : (
                              <ol className="space-y-2">
                                {pembayaran.map((p, idx) => (
                                  <li
                                    key={p.id ?? idx}
                                    className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 flex flex-wrap justify-between gap-2"
                                  >
                                    <div>
                                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                                        Ke-{idx + 1}
                                      </span>
                                      <p className="font-mono font-medium text-gray-900 dark:text-gray-100">
                                        {formatRp(p.nominal)}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        <span className="block">
                                          Via: {p.via ? `${p.via}` : '—'}
                                          {p.hijriyah || p.masehi
                                            ? ` · Hj. ${p.hijriyah || '—'} / ${p.masehi || '—'}`
                                            : ''}
                                        </span>
                                        {p.ipaymu_metode ? (
                                          <span className="block mt-1 text-gray-700 dark:text-gray-200 font-medium">
                                            Metode: {p.ipaymu_metode}
                                          </span>
                                        ) : null}
                                      </p>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                                      <p>{formatDt(p.tanggal_dibuat)}</p>
                                      {p.admin ? <p>Admin: {p.admin}</p> : null}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Diperbarui: {formatDt(r.tanggal_update || r.tanggal_dibuat)}
                          </p>
                        </div>
                      )
                    })}
                    </div>
                  </PublicAnimatedCollapse>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6 px-2">
          Tampilan ringkas riwayat PSB untuk wali santri.
        </p>
      </div>
    </>
  )
}

export default PublicRiwayatRegistrasi
