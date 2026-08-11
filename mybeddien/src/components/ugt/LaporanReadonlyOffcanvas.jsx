import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { laporanGtMybeddianAPI, laporanPjgtMybeddianAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { getBulanName } from '../../utils/bulanHijriLatin'

const API_BY_JENIS = {
  gt: laporanGtMybeddianAPI,
  pjgt: laporanPjgtMybeddianAPI,
}

const TITLE_BY_JENIS = {
  gt: 'Laporan GT',
  pjgt: 'Laporan PJGT',
}

function emptyText(value) {
  const s = value == null ? '' : String(value).trim()
  return s || '—'
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
        {emptyText(value)}
      </p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
      {children}
    </section>
  )
}

function MasalahList({ items }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  if (list.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada catatan masalah.</p>
  }
  return (
    <div className="space-y-2">
      {list.map((item, idx) => (
        <div
          key={item.id || idx}
          className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/20 p-3"
        >
          <div className="grid grid-cols-1 gap-2">
            <Info label="Masalah" value={item.masalah} />
            <Info label="Solusi" value={item.solusi} />
            <Info label="Saran" value={item.saran} />
          </div>
        </div>
      ))}
    </div>
  )
}

function GtFields({ row }) {
  return (
    <>
      <Section title="Kehadiran">
        <div className="grid grid-cols-3 gap-2">
          <Info label="Pulang" value={row?.pulang ?? 0} />
          <Info label="Sakit" value={row?.sakit ?? 0} />
          <Info label="Udzur" value={row?.udzur ?? 0} />
        </div>
      </Section>
      <Section title="Kegiatan">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Info label="Wali kelas" value={row?.wali_kelas} />
          <Info label="Fan kelas" value={row?.fan_kelas} />
          <Info label="Banin / Banat" value={row?.banin_banat} />
          <Info label="Muallim Quran" value={row?.muallim_quran} />
          <Info label="Waktu muallim" value={row?.waktu_muallim} />
          <Info label="Ngaji kitab" value={row?.ngaji_kitab} />
          <Info label="Waktu ngaji" value={row?.waktu_ngaji} />
          <Info label="Imam" value={row?.imam} />
          <Info label="Ket. imam" value={row?.ket_imam} />
        </div>
      </Section>
      <Section title="Tindak Lanjut">
        <div className="grid grid-cols-1 gap-2">
          <Info label="Tugas selanjutnya" value={row?.tugas_selanjutnya} />
          <Info label="Usulan" value={row?.usulan} />
        </div>
      </Section>
    </>
  )
}

function PjgtFields({ row }) {
  return (
    <>
      <Section title="Nilai Hubungan">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Info label="Ubudiyah" value={row?.ubudiyah} />
          <Info label="Murid" value={row?.murid} />
          <Info label="Wali murid" value={row?.wali_murid} />
          <Info label="PJGT" value={row?.pjgt} />
          <Info label="Kepala" value={row?.kepala} />
          <Info label="Guru" value={row?.guru} />
          <Info label="Masyarakat" value={row?.masyarakat} />
        </div>
      </Section>
      <Section title="Usulan">
        <Info label="Usulan" value={row?.usulan} />
      </Section>
    </>
  )
}

/**
 * Offcanvas baca saja untuk laporan GT / PJGT (bulan selain bulan aktif).
 */
export default function LaporanReadonlyOffcanvas({
  isOpen,
  onClose,
  initialData,
  jenis = 'gt',
  detailLoading = false,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })
  const [row, setRow] = useState(initialData || null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setRow(initialData || null)
    const id = Number(initialData?.id)
    const api = API_BY_JENIS[jenis]
    if (!id || !api?.getById) return undefined

    let cancelled = false
    if (!Array.isArray(initialData?.masalah)) {
      setLoading(true)
      api
        .getById(id)
        .then((res) => {
          if (!cancelled && res?.success && res.data) setRow(res.data)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    return () => {
      cancelled = true
    }
  }, [isOpen, initialData, jenis])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const title = TITLE_BY_JENIS[jenis] || 'Laporan'
  const bulanLabel = row?.bulan ? getBulanName(row.bulan) : '—'
  const showLoading = (detailLoading || loading) && !row

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key={`lap-${jenis}-readonly-backdrop`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-9998"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key={`lap-${jenis}-readonly-panel`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-9999 flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Kembali"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Hanya lihat — bulan selain bulan aktif</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {showLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Memuat laporan…</div>
              ) : (
                <>
                  <div className="rounded-xl border border-teal-100 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-teal-700 dark:text-teal-300">{title}</p>
                    <h4 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                      {emptyText(row?.madrasah_nama)}
                    </h4>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {emptyText(row?.santri_nama)}
                      {row?.santri_nis ? <span className="text-gray-500"> · NIS {row.santri_nis}</span> : null}
                    </p>
                  </div>

                  <Section title="Identitas">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Info label="Madrasah" value={row?.madrasah_nama} />
                      <Info label="Santri / Guru Tugas" value={row?.santri_nama} />
                      <Info label="NIS" value={row?.santri_nis} />
                      <Info label="Tahun ajaran" value={row?.id_tahun_ajaran} />
                      <Info label="Bulan" value={bulanLabel} />
                      <Info
                        label="Dibuat oleh"
                        value={row?.pembuat_nama || (row?.id_pembuat ? `Pengurus #${row.id_pembuat}` : '')}
                      />
                    </div>
                  </Section>

                  {jenis === 'gt' ? <GtFields row={row} /> : null}
                  {jenis === 'pjgt' ? <PjgtFields row={row} /> : null}

                  <Section title="Masalah, Solusi, dan Saran">
                    <MasalahList items={row?.masalah} />
                  </Section>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
