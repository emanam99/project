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

function tingkatanLabel(row) {
  const label = row.tingkatan_label?.trim()
  if (label) return label
  const tk = (row.tingkatan || '').trim()
  const kel = (row.kelompok || '').trim()
  if (tk && kel) return `${tk} · ${kel}`
  return tk || kel || '—'
}

function sameTingkatanId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

function sortByTanggalDesc(rows) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.tanggal_dibuat || 0).getTime()
    const tb = new Date(b.tanggal_dibuat || 0).getTime()
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta
    return String(b.tanggal_dibuat || '').localeCompare(String(a.tanggal_dibuat || ''))
  })
}

function groupByTahunAjaran(rows) {
  const sorted = sortByTanggalDesc(rows)
  const map = new Map()
  for (const r of sorted) {
    const ta = (r.tahun_ajaran || '').trim() || 'Tanpa tahun ajaran'
    if (!map.has(ta)) map.set(ta, [])
    map.get(ta).push(r)
  }
  return Array.from(map.entries()).sort((a, b) => {
    if (a[0] === 'Tanpa tahun ajaran') return 1
    if (b[0] === 'Tanpa tahun ajaran') return -1
    return b[0].localeCompare(a[0])
  })
}

function LttqRow({ row, isAktif }) {
  const tgl = formatTanggal(row.tanggal_dibuat)

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        isAktif
          ? 'bg-primary-50/90 dark:bg-primary-900/25 border-primary-200/80 dark:border-primary-700/40'
          : 'border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-900/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.lembaga_nama || 'LTTQ'}</p>
        {isAktif && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 shrink-0">
            Aktif
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{tingkatanLabel(row)}</p>
      {row.nim?.trim() && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">NIM {row.nim.trim()}</p>
      )}
      {tgl && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tgl}</p>}
    </div>
  )
}

export default function RiwayatLttq() {
  const { biodata: santri } = useSantriBiodata()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await profilAPI.getRiwayatLttq()
        if (cancelled) return
        if (!res?.success) {
          setError(res?.message || 'Gagal memuat riwayat LTTQ')
          setList([])
          return
        }
        setList(Array.isArray(res.data) ? res.data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Gagal memuat riwayat LTTQ')
          setList([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => groupByTahunAjaran(list), [list])
  const aktifId = santri?.id_lttq_tingkatan

  if (loading) {
    return (
      <PageEnterLoading className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat LTTQ...</p>
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

      {!error && list.length === 0 && (
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada riwayat LTTQ.</p>
          </div>
        </PageEnterBlock>
      )}

      {!error && list.length > 0 && (
        <PageEnterBlock index={0}>
          <section className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat LTTQ</h3>
            </div>
            <div className="p-5 space-y-5">
              {groups.map(([tahunAjaran, items]) => (
                <div key={tahunAjaran}>
                  <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-2">{tahunAjaran}</p>
                  <div className="space-y-2">
                    {items.map((row, i) => (
                      <LttqRow
                        key={row.id ?? `${tahunAjaran}-${i}`}
                        row={row}
                        isAktif={sameTingkatanId(row.id_lttq_tingkatan, aktifId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </PageEnterBlock>
      )}
    </PageEnter>
  )
}
