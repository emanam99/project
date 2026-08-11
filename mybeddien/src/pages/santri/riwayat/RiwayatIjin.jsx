import { useEffect, useState } from 'react'
import { profilAPI } from '../../../services/api'
import { PageEnter, PageEnterBlock, PageEnterLoading } from '../../../components/motion/PageEnter'

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

function IjinCard({ ijin, index }) {
  const kembali = ijin.tanggal_kembali != null && String(ijin.tanggal_kembali).trim() !== ''
  const rangeHijriyah =
    [ijin.dari, ijin.sampai].filter(Boolean).join(' – ') ||
    (ijin.perpanjang ? `Perpanjang: ${ijin.perpanjang}` : '')
  const rangeMasehi = [ijin.dari_masehi, ijin.sampai_masehi]
    .filter((v) => v != null && String(v).trim() !== '')
    .join(' – ')

  return (
    <PageEnterBlock index={index}>
      <article className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
              {ijin.alasan?.trim() || 'Ijin'}
            </h3>
            {ijin.tahun_ajaran && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ijin.tahun_ajaran}</p>
            )}
          </div>
          <span
            className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              kembali
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {kembali ? 'Sudah kembali' : 'Belum kembali'}
          </span>
        </div>
        <div className="p-5">
          {rangeHijriyah && <Field label="Periode (Hijriyah)" value={rangeHijriyah} />}
          {rangeMasehi && <Field label="Periode (Masehi)" value={rangeMasehi} />}
          {ijin.lama && <Field label="Lama" value={ijin.lama} />}
          {ijin.perpanjang && <Field label="Perpanjang (Hijriyah)" value={ijin.perpanjang} />}
          {ijin.perpanjang_masehi && (
            <Field label="Perpanjang (Masehi)" value={ijin.perpanjang_masehi} />
          )}
          {kembali && <Field label="Tanggal kembali" value={ijin.tanggal_kembali} />}
        </div>
      </article>
    </PageEnterBlock>
  )
}

export default function RiwayatIjin() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await profilAPI.getRiwayatIjin()
        if (cancelled) return
        if (!res?.success) {
          setError(res?.message || 'Gagal memuat riwayat ijin')
          setList([])
          return
        }
        setList(Array.isArray(res.data) ? res.data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Gagal memuat riwayat ijin')
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat ijin...</p>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan ijin.</p>
          </div>
        </PageEnterBlock>
      )}

      <div className="space-y-4">
        {list.map((ijin, i) => (
          <IjinCard key={ijin.id ?? `ijin-${i}`} ijin={ijin} index={i} />
        ))}
      </div>
    </PageEnter>
  )
}
