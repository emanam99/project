import { useEffect, useState } from 'react'
import { profilAPI } from '../../../services/api'
import { PageEnter, PageEnterBlock, PageEnterLoading } from '../../../components/motion/PageEnter'

const KATEGORI_UI = [
  { value: 'ringan', label: 'Ringan' },
  { value: 'sedang', label: 'Sedang' },
  { value: 'berat', label: 'Berat' },
  { value: 'buku_hitam', label: 'Buku Hitam' },
]

function labelKategori(k) {
  const row = KATEGORI_UI.find((x) => x.value === k)
  return row ? row.label : k != null && String(k).trim() !== '' ? String(k) : '—'
}

function badgeClassKategori(k) {
  switch (k) {
    case 'ringan':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700/50 dark:text-slate-200'
    case 'sedang':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'berat':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
    case 'buku_hitam':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300'
  }
}

function formatTanggal(value) {
  if (value == null || String(value).trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function Field({ label, value }) {
  const empty = value == null || value === ''
  const display = empty ? '—' : String(value)
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-sm text-gray-900 dark:text-gray-100 ${empty ? 'text-gray-400 dark:text-gray-500' : ''}`}
      >
        {display}
      </p>
    </div>
  )
}

function PelanggaranCard({ row, index }) {
  const nama = row.pelanggaran_nama?.trim() || 'Pelanggaran'
  const kategori = row.pelanggaran_kategori
  const tgl = formatTanggal(row.tanggal_dibuat)

  return (
    <PageEnterBlock index={index}>
      <article className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{nama}</h3>
            {tgl && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tgl}</p>}
          </div>
          {kategori && (
            <span
              className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeClassKategori(kategori)}`}
            >
              {labelKategori(kategori)}
            </span>
          )}
        </div>
        <div className="p-5">
          {row.catatan?.trim() && <Field label="Catatan" value={row.catatan.trim()} />}
          {row.pengurus_nama?.trim() && <Field label="Dicatat oleh" value={row.pengurus_nama.trim()} />}
        </div>
      </article>
    </PageEnterBlock>
  )
}

export default function RiwayatPelanggaran() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await profilAPI.getRiwayatPelanggaran()
        if (cancelled) return
        if (!res?.success) {
          setError(res?.message || 'Gagal memuat riwayat pelanggaran')
          setList([])
          return
        }
        setList(Array.isArray(res.data) ? res.data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Gagal memuat riwayat pelanggaran')
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

  if (loading) {
    return (
      <PageEnterLoading className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat pelanggaran...</p>
        </div>
      </PageEnterLoading>
    )
  }

  return (
    <PageEnter className="max-w-2xl mx-auto px-4 py-4 pb-8 min-h-full">
      {error && (
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center mb-4">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        </PageEnterBlock>
      )}

      {!error && list.length === 0 && (
        <PageEnterBlock index={0}>
          <div className="rounded-2xl bg-white dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan pelanggaran.</p>
          </div>
        </PageEnterBlock>
      )}

      <div className="space-y-4">
        {list.map((row, i) => (
          <PelanggaranCard key={row.id ?? `pelanggaran-${i}`} row={row} index={i} />
        ))}
      </div>
    </PageEnter>
  )
}
