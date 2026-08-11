import { memo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { madrasahAPI } from '../../../services/api'
import { getBulanName } from '../../Kalender/utils/bulanHijri'
import { parseKoordinatorFotoList } from '../../../utils/ugtKoordinatorFotos'

const LaporanFotoThumb = memo(function LaporanFotoThumb({ row, size = 'sm' }) {
  const paths = parseKoordinatorFotoList(row)
  const fotoPath = paths[0]
  const extra = paths.length > 1 ? paths.length - 1 : 0
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!fotoPath) {
      setBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(fotoPath).then((url) => {
      if (!cancelled) setBlobUrl(url)
    }).catch(() => {
      if (!cancelled) setBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [fotoPath])

  const dim = size === 'lg' ? 'w-16 h-16 rounded-xl' : 'w-11 h-11 rounded-lg'

  if (!fotoPath) {
    return (
      <div
        className={`${dim} shrink-0 bg-gray-100 dark:bg-gray-700/80 border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center`}
        aria-hidden
      >
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    )
  }

  if (!blobUrl) {
    return <div className={`${dim} shrink-0 bg-gray-100 dark:bg-gray-700 animate-pulse`} />
  }

  return (
    <div className={`relative shrink-0 ${dim} overflow-hidden border border-gray-200/80 dark:border-gray-600`}>
      <img src={blobUrl} alt="" className="w-full h-full object-cover" />
      {extra > 0 ? (
        <span className="absolute bottom-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-semibold flex items-center justify-center shadow">
          +{extra}
        </span>
      ) : null}
    </div>
  )
})

function PeriodBadge({ ta, bulan }) {
  const bulanLabel = bulan ? getBulanName(bulan, 'hijriyah') : null
  return (
    <div className="flex flex-wrap gap-1.5">
      {ta ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-100 dark:border-teal-800/50">
          {ta}
        </span>
      ) : null}
      {bulanLabel ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700/80 dark:text-gray-300">
          {bulanLabel}
        </span>
      ) : null}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function LaporanKoordinatorCard({ row, index, onOpen, showKoordinatorMeta }) {
  const usulan = (row.usulan || '').trim()

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => onOpen(row)}
      className="w-full text-left p-4 flex gap-3 items-start hover:bg-gray-50/90 dark:hover:bg-gray-900/40 active:bg-gray-100 dark:active:bg-gray-900/60 transition-colors group"
    >
      <LaporanFotoThumb row={row} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
            {row.madrasah_nama || '—'}
          </p>
          <ChevronIcon />
        </div>
        <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 truncate">
          {row.santri_nama || '—'}
          {row.santri_nis != null && row.santri_nis !== '' ? (
            <span className="text-gray-500 dark:text-gray-400"> · NIS {row.santri_nis}</span>
          ) : null}
        </p>
        <div className="mt-2">
          <PeriodBadge ta={row.id_tahun_ajaran} bulan={row.bulan} />
        </div>
        {showKoordinatorMeta ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {row.koordinator_nama ? (
              <span>Koord. {row.koordinator_nama}</span>
            ) : (
              <span>Koordinator —</span>
            )}
            {(row.pembuat_nama || '').trim() ? (
              <span> · {row.pembuat_nama.trim()}</span>
            ) : null}
          </p>
        ) : (row.pembuat_nama || '').trim() ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            Dibuat: {row.pembuat_nama.trim()}
          </p>
        ) : null}
        {usulan ? (
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2" title={usulan}>
            {usulan}
          </p>
        ) : null}
      </div>
    </motion.button>
  )
}

function LaporanKoordinatorTable({ rows, onOpen, showKoordinatorCol, showPembuatCol }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th className="px-4 py-3 font-semibold w-[72px]">Foto</th>
            <th className="px-4 py-3 font-semibold min-w-[140px]">Madrasah</th>
            <th className="px-4 py-3 font-semibold min-w-[120px]">Santri</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Periode</th>
            {showKoordinatorCol ? (
              <th className="px-4 py-3 font-semibold min-w-[100px]">Koordinator</th>
            ) : null}
            {showPembuatCol ? (
              <th className="px-4 py-3 font-semibold min-w-[100px]">Dibuat oleh</th>
            ) : null}
            <th className="px-4 py-3 font-semibold min-w-[160px]">Usulan</th>
            <th className="px-4 py-3 w-10" aria-hidden />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
          {rows.map((row, index) => {
            const usulan = (row.usulan || '').trim()
            return (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(row)
                  }
                }}
                className="group cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-colors"
              >
                <td className="px-4 py-3 align-middle">
                  <LaporanFotoThumb row={row} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                    {row.madrasah_nama || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-gray-800 dark:text-gray-200">
                  <span className="block">{row.santri_nama || '—'}</span>
                  {row.santri_nis != null && row.santri_nis !== '' ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">NIS {row.santri_nis}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-middle">
                  <PeriodBadge ta={row.id_tahun_ajaran} bulan={row.bulan} />
                </td>
                {showKoordinatorCol ? (
                  <td className="px-4 py-3 align-middle text-gray-700 dark:text-gray-300">
                    {row.koordinator_nama || '—'}
                  </td>
                ) : null}
                {showPembuatCol ? (
                  <td className="px-4 py-3 align-middle text-gray-700 dark:text-gray-300">
                    {(row.pembuat_nama || '').trim() || '—'}
                  </td>
                ) : null}
                <td className="px-4 py-3 align-middle text-gray-600 dark:text-gray-400 max-w-[220px]">
                  <span className="line-clamp-2" title={usulan}>
                    {usulan || '—'}
                  </span>
                </td>
                <td className="px-2 py-3 align-middle text-right">
                  <ChevronIcon />
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Daftar laporan koordinator: kartu di mobile/tablet, tabel di desktop (lg+).
 */
export default function LaporanKoordinatorList({ rows, onOpen, showKoordinatorFilter = true }) {
  const showKoordinatorCol = showKoordinatorFilter
  const showPembuatCol = true

  return (
    <>
      <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-700/80">
        {rows.map((row, index) => (
          <LaporanKoordinatorCard
            key={row.id}
            row={row}
            index={index}
            onOpen={onOpen}
            showKoordinatorMeta={showKoordinatorCol}
          />
        ))}
      </div>
      <div className="hidden lg:block">
        <LaporanKoordinatorTable
          rows={rows}
          onOpen={onOpen}
          showKoordinatorCol={showKoordinatorCol}
          showPembuatCol={showPembuatCol}
        />
      </div>
    </>
  )
}
