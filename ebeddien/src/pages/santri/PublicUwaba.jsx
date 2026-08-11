import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { appendPublicPaymentTokenQuery, getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import { PublicAnimatedCollapse } from './PublicAnimatedCollapse'
import PaymentHistoryOffcanvas from './PaymentHistoryOffcanvas'
import './PublicSantri.css'

function badgeUwabaTahun(blok) {
  const t = blok.total || { total: 0, bayar: 0, kurang: 0 }
  const wajib = Number(t.total) || 0
  const kurang = Number(t.kurang) || 0
  const bayar = Number(t.bayar) || 0
  if (wajib <= 0) {
    return { label: '—', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' }
  }
  if (kurang <= 0) {
    return { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' }
  }
  if (bayar > 0) {
    return { label: 'Sebagian', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' }
  }
  return { label: 'Belum bayar', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' }
}

function PublicUwaba() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id') || searchParams.get('id_santri')
  const [santri, setSantri] = useState(null)
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [perTahun, setPerTahun] = useState([])
  const [singleTahunAjaran, setSingleTahunAjaran] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showHistoryOffcanvas, setShowHistoryOffcanvas] = useState(false)
  const [uwabaAccordionOpen, setUwabaAccordionOpen] = useState({})
  const darkModeContext = useDarkMode()
  const { darkMode, setDarkMode } = darkModeContext || { darkMode: false, setDarkMode: () => {} }

  useEffect(() => {
    if (!idSantri) {
      setError('NIS tidak ditemukan')
      setLoading(false)
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const apiBaseUrl = getSlimApiUrl()

        const santriResponse = await fetch(`${apiBaseUrl}/public/santri?id=${idSantri}`)
        const santriData = await santriResponse.json()

        if (!santriData.success) {
          throw new Error(santriData.message || 'Gagal mengambil data santri')
        }

        setSantri(santriData.data)

        // Selalu muat semua tahun ajaran: tautan/QR lama bisa menyertakan ?tahun_ajaran=…;
        // tampilan publik sudah per blok tahun (accordion), jadi parameter itu diabaikan.
        let rincianUrl = `${apiBaseUrl}/public/pembayaran/uwaba?id_santri=${idSantri}`
        rincianUrl = appendPublicPaymentTokenQuery(rincianUrl)
        const rincianResponse = await fetch(rincianUrl)
        const rincianData = await rincianResponse.json().catch(() => ({}))

        if (!rincianResponse.ok) {
          throw new Error(
            (rincianData && rincianData.message) ||
              `Gagal memuat rincian pembayaran UWABA (HTTP ${rincianResponse.status})`
          )
        }

        if (rincianData.success) {
          const d = rincianData.data || {}
          if (d.multi_tahun && Array.isArray(d.per_tahun) && d.per_tahun.length > 0) {
            setPerTahun(d.per_tahun)
            setRincian([])
            setTotal({ total: 0, bayar: 0, kurang: 0 })
            setSingleTahunAjaran(null)
          } else {
            setPerTahun([])
            setRincian(Array.isArray(d.rincian) ? d.rincian : [])
            setTotal(d.total || { total: 0, bayar: 0, kurang: 0 })
            const taSingle = d.tahun_ajaran != null && String(d.tahun_ajaran).trim() !== '' ? String(d.tahun_ajaran).trim() : null
            setSingleTahunAjaran(taSingle)
          }
        } else {
          setRincian([])
          setTotal({ total: 0, bayar: 0, kurang: 0 })
          setPerTahun([])
          setSingleTahunAjaran(null)
        }
      } catch (e) {
        console.error('Error loading data:', e)
        setError(e.message || 'Gagal memuat data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [idSantri, searchParams])

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  const formatRp = (value) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value || 0)

  const tahunBlokList = useMemo(() => {
    if (perTahun.length > 0) return perTahun
    if (rincian.length > 0) {
      const ta = singleTahunAjaran || rincian[0]?.tahun_ajaran || 'Tahun ajaran'
      return [
        {
          tahun_ajaran: String(ta),
          rincian,
          total: { ...total }
        }
      ]
    }
    return []
  }, [perTahun, rincian, total, singleTahunAjaran])

  const toggleUwabaAccordion = (key) => {
    setUwabaAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const renderRincianTable = (items) => {
    if (!items?.length) {
      return (
        <p className="text-gray-500 dark:text-gray-400 text-xs italic text-center py-4">
          Tidak ada baris UWABA untuk tahun ini.
        </p>
      )
    }
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/80 text-left text-gray-600 dark:text-gray-300">
              <th className="px-2 py-2 font-medium">Bulan</th>
              <th className="px-2 py-2 font-medium text-right hidden md:table-cell">Wajib</th>
              <th className="px-2 py-2 font-medium text-right">Bayar</th>
              <th className="px-2 py-2 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item, index) => {
              const bayar = item.bayar || 0
              const kurang = item.kurang || 0
              const isLunas = kurang <= 0 && bayar > 0
              const isBelum = bayar === 0 || bayar === null || bayar === undefined
              const labelBulan = item.keterangan_1 || item.bulan || '—'
              return (
                <tr key={item.id || index} className="text-gray-800 dark:text-gray-200">
                  <td className="px-2 py-2 font-medium">{labelBulan}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums hidden md:table-cell">{formatRp(item.wajib)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatRp(bayar)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isBelum ? (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                        Belum
                      </span>
                    ) : isLunas ? (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-medium">
                        Lunas
                      </span>
                    ) : (
                      <span className="inline-flex flex-col items-end px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 font-medium text-[10px]">
                        <span>Kurang</span>
                        <span className="font-mono">{formatRp(kurang)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  if (loading) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Pembayaran UWABA</h1>
            <p className="subtitle">Memuat data...</p>
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
            <h1>Pembayaran UWABA</h1>
            <p className="subtitle">Error</p>
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

  if (!santri) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Pembayaran UWABA</h1>
            <p className="subtitle">Data tidak ditemukan</p>
          </div>
          <button type="button" className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="error-container">
            <h1>Data tidak ditemukan</h1>
            <p>Santri dengan ID tersebut tidak ditemukan.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="public-header">
        <div className="header-content">
          <h1>Pembayaran UWABA</h1>
          <p className="subtitle">Rincian per tahun ajaran</p>
        </div>
        <button type="button" className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="public-content-wrapper">
        {tahunBlokList.length === 0 ? (
          <div className="biodata-section">
            <div className="biodata-card text-center text-gray-600 dark:text-gray-400 py-8">
              <p>Belum ada data pembayaran UWABA.</p>
              <p className="text-xs mt-2">Jika baru terdaftar, data akan muncul setelah diinput di sistem.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 biodata-section public-uwaba-accordion">
            {tahunBlokList.map((blok, accIdx) => {
              const taKey = blok.tahun_ajaran || `idx-${accIdx}`
              const t = blok.total || { total: 0, bayar: 0, kurang: 0 }
              const sumBayar = Number(t.bayar) || 0
              const statusBadge = badgeUwabaTahun(blok)
              const judulTahun = blok.tahun_ajaran || '—'
              const isOpen = !!uwabaAccordionOpen[taKey]
              const panelId = `uwaba-accordion-panel-${accIdx}`

              return (
                <div
                  key={`${accIdx}-${taKey}`}
                  className={`biodata-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden transition-[box-shadow] duration-300 ease-out ${
                    isOpen ? 'ring-2 ring-teal-500/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    id={`${panelId}-trigger`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleUwabaAccordion(taKey)}
                    className="w-full text-left px-4 pt-3 pb-2 bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-3 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors duration-200"
                  >
                    <div className="flex items-center justify-between gap-3 w-full min-h-[1.25rem]">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400 shrink-0">
                        Tahun ajaran
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </div>

                    <p
                      className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50 font-mono leading-snug tracking-tight w-full"
                      title={judulTahun}
                    >
                      {judulTahun}
                    </p>

                    <div
                      className="flex items-center justify-between gap-3 w-full pt-2 pb-1 -mx-4 px-4 mt-1 border-t border-gray-200/90 dark:border-gray-600/80"
                    >
                      <p className="text-xs text-gray-500 dark:text-gray-400 min-w-0 text-left">
                        Total bayar:{' '}
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                          {formatRp(sumBayar)}
                        </span>
                      </p>
                      <span
                        className={`public-accordion-chevron shrink-0 text-teal-600 dark:text-teal-400 text-base leading-none select-none inline-block ${
                          isOpen ? 'public-accordion-chevron--open' : ''
                        }`}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </div>
                  </button>

                  <PublicAnimatedCollapse id={panelId} labelledBy={`${panelId}-trigger`} isOpen={isOpen}>
                    <div className="px-4 py-3 space-y-4 text-sm bg-white dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                          Rincian per bulan
                        </h3>
                        {renderRincianTable(blok.rincian)}
                      </div>
                      {sumBayar > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowHistoryOffcanvas(true)}
                          className="w-full sm:w-auto text-sm px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                        >
                          Lihat riwayat pembayaran
                        </button>
                      ) : null}
                    </div>
                  </PublicAnimatedCollapse>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6 px-2">
          Tampilan ringkas UWABA untuk wali santri.
        </p>
      </div>

      <PaymentHistoryOffcanvas
        isOpen={showHistoryOffcanvas}
        onClose={() => setShowHistoryOffcanvas(false)}
        idSantri={idSantri}
        mode="uwaba"
      />
    </>
  )
}

export default PublicUwaba
