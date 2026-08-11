import { useEffect, useMemo, useState } from 'react'
import { profilAPI } from '../../../services/api'
import { useSantriBiodata } from '../../../hooks/useSantriCachedResources'
import { PageEnter, PageEnterBlock, PageEnterLoading } from '../../../components/motion/PageEnter'

function formatTanggal(value) {
  if (value == null || String(value).trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatPeriode(dari, sampai) {
  const a = formatTanggal(dari)
  const b = sampai ? formatTanggal(sampai) : null
  if (a && b) return `${a} – ${b}`
  if (a) return `${a} – sekarang`
  return b || '—'
}

function kamarLabel(row) {
  const dk = row?.daerah_kamar?.trim()
  if (dk) return dk
  const daerah = (row?.daerah || '').trim()
  const kamar = (row?.kamar || '').trim()
  if (daerah && kamar) return `${daerah}.${kamar}`
  return daerah || kamar || '—'
}

function sameId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

function sortByTanggalDesc(rows, field = 'tanggal_dibuat') {
  return [...rows].sort((a, b) => {
    const ta = new Date(a[field] || 0).getTime()
    const tb = new Date(b[field] || 0).getTime()
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta
    return String(b[field] || '').localeCompare(String(a[field] || ''))
  })
}

function sortStatusByDariDesc(rows) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.dari || a.tanggal_dibuat || 0).getTime()
    const tb = new Date(b.dari || b.tanggal_dibuat || 0).getTime()
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta
    return Number(b.id || 0) - Number(a.id || 0)
  })
}

function AktifKamarCard({ kamar }) {
  if (!kamar?.id_kamar) return null
  return (
    <div className="rounded-xl bg-primary-50/90 dark:bg-primary-900/25 border border-primary-200/80 dark:border-primary-700/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1">
        Kamar saat ini
      </p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{kamarLabel(kamar)}</p>
      {kamar.status_santri?.trim() && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          Status: {kamar.status_santri.trim()}
          {kamar.kategori?.trim() ? ` · ${kamar.kategori.trim()}` : ''}
        </p>
      )}
      {!kamar.status_santri?.trim() && kamar.kategori?.trim() && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Kategori: {kamar.kategori.trim()}</p>
      )}
    </div>
  )
}

function KamarRow({ row, isAktif }) {
  const tgl = formatTanggal(row.tanggal_dibuat)
  const status = row.status_santri?.trim() || null
  const kategori = row.kategori?.trim() || null
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        isAktif
          ? 'bg-primary-50/90 dark:bg-primary-900/25 border-primary-200/80 dark:border-primary-700/40'
          : 'border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-900/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{kamarLabel(row)}</p>
        {isAktif && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            Aktif
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {[row.tahun_ajaran, tgl].filter(Boolean).join(' · ') || '—'}
      </p>
      {(status || kategori) && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {status || 'Status —'}{kategori ? ` · ${kategori}` : ''}
        </p>
      )}
    </div>
  )
}

function StatusRow({ row, isAktif }) {
  const status = row.status_santri?.trim() || '—'
  const kategori = row.kategori?.trim() || null
  const periode = formatPeriode(row.dari, row.sampai)

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        isAktif
          ? 'bg-primary-50/90 dark:bg-primary-900/25 border-primary-200/80 dark:border-primary-700/40'
          : 'border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-900/30'
      }`}
    >
      {isAktif && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1">
          Status aktif
        </p>
      )}
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{status}</p>
      {kategori && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Kategori: {kategori}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{periode}</p>
    </div>
  )
}

function Section({ title, children, emptyHint, isEmpty }) {
  const hasContent = !isEmpty && children != null
  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
      </div>
      <div className="p-5 space-y-3">
        {!hasContent && emptyHint && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">{emptyHint}</p>
        )}
        {children}
      </div>
    </section>
  )
}

export default function RiwayatKamar() {
  const { biodata: santri } = useSantriBiodata()
  const [kamarAktif, setKamarAktif] = useState(null)
  const [riwayatKamar, setRiwayatKamar] = useState([])
  const [riwayatStatus, setRiwayatStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await profilAPI.getRiwayatKamar()
        if (cancelled) return
        if (!res?.success) {
          setError(res?.message || 'Gagal memuat riwayat kamar')
          setKamarAktif(null)
          setRiwayatKamar([])
          setRiwayatStatus([])
          return
        }
        const payload = res.data
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          setKamarAktif(payload.kamar_aktif ?? null)
          setRiwayatKamar(Array.isArray(payload.riwayat_kamar) ? payload.riwayat_kamar : [])
          setRiwayatStatus(Array.isArray(payload.riwayat_status) ? payload.riwayat_status : [])
        } else {
          setKamarAktif(null)
          setRiwayatKamar(Array.isArray(payload) ? payload : [])
          setRiwayatStatus([])
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Gagal memuat riwayat kamar')
          setKamarAktif(null)
          setRiwayatKamar([])
          setRiwayatStatus([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const kamarAktifTampil = useMemo(() => {
    if (kamarAktif?.id_kamar) return kamarAktif
    if (!santri?.id_kamar) return null
    return {
      id_kamar: santri.id_kamar,
      daerah: santri.daerah,
      kamar: santri.kamar,
      daerah_kamar: [santri.daerah, santri.kamar].filter(Boolean).join('.'),
      status_santri: santri.status_santri,
      kategori: santri.kategori,
    }
  }, [kamarAktif, santri])

  const riwayatKamarUrut = useMemo(() => sortByTanggalDesc(riwayatKamar), [riwayatKamar])

  const riwayatStatusUrut = useMemo(() => {
    const sorted = sortStatusByDariDesc(riwayatStatus)
    if (sorted.length > 0) return sorted
    if (santri?.status_santri?.trim() || santri?.kategori?.trim()) {
      return [
        {
          id: 'biodata-aktif',
          status_santri: santri.status_santri,
          kategori: santri.kategori,
          is_aktif: 1,
        },
      ]
    }
    return []
  }, [riwayatStatus, santri])

  const aktifKamarId = kamarAktifTampil?.id_kamar

  const kosongSemua =
    !kamarAktifTampil?.id_kamar && riwayatKamarUrut.length === 0 && riwayatStatusUrut.length === 0

  if (loading) {
    return (
      <PageEnterLoading className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat kamar...</p>
        </div>
      </PageEnterLoading>
    )
  }

  return (
    <PageEnter className="max-w-2xl mx-auto px-4 py-4 pb-8 min-h-full space-y-4">
      {error && (
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        </PageEnterBlock>
      )}

      {!error && kosongSemua && (
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada riwayat kamar atau status.</p>
          </div>
        </PageEnterBlock>
      )}

      {!error && !kosongSemua && (
        <>
          <PageEnterBlock index={0}>
            <Section
              title="Kamar"
              isEmpty={!kamarAktifTampil?.id_kamar && riwayatKamarUrut.length === 0}
              emptyHint="Belum ada kamar terdaftar."
            >
              {kamarAktifTampil?.id_kamar && <AktifKamarCard kamar={kamarAktifTampil} />}
              {riwayatKamarUrut.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Riwayat kamar ({riwayatKamarUrut.length})
                  </p>
                  {riwayatKamarUrut.map((row, i) => (
                    <KamarRow
                      key={row.id ?? `kamar-${i}`}
                      row={row}
                      isAktif={sameId(row.id_kamar, aktifKamarId)}
                    />
                  ))}
                </div>
              )}
            </Section>
          </PageEnterBlock>

          <PageEnterBlock index={1}>
            <Section
              title="Status santri"
              isEmpty={riwayatStatusUrut.length === 0}
              emptyHint="Belum ada riwayat status."
            >
              <div className="space-y-2">
                {riwayatStatusUrut.map((row, i) => (
                  <StatusRow
                    key={row.id ?? `status-${i}`}
                    row={row}
                    isAktif={Number(row.is_aktif) === 1}
                  />
                ))}
              </div>
            </Section>
          </PageEnterBlock>
        </>
      )}
    </PageEnter>
  )
}
