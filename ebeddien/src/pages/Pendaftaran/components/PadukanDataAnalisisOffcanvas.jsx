import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PadukanDataWorkspace from './PadukanDataWorkspace'

/** @param {unknown} v */
function nis7(v) {
  const s = String(v ?? '').trim()
  return /^\d{7}$/.test(s) ? s : null
}

/**
 * Offcanvas kanan dari Analisis: pilih dua NIS dari kelompok potensi duplikat, lalu tampilkan workspace Padukan Data.
 * @param {{ isOpen: boolean, onClose: () => void, group: object|null, onMergeSuccess?: () => void }} props
 */
export default function PadukanDataAnalisisOffcanvas({ isOpen, onClose, group, onMergeSuccess }) {
  const [nisKiri, setNisKiri] = useState(null)
  const [nisKanan, setNisKanan] = useState(null)
  const [tampilWorkspace, setTampilWorkspace] = useState(false)
  /** Panel pemilihan NIS + tombol terapkan — bisa diciutkan untuk memberi ruang workspace */
  const [pilihanPanelTerbuka, setPilihanPanelTerbuka] = useState(true)

  const pilihan = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const a of group?.anggota || []) {
      const nis = nis7(a.nis)
      if (!nis || seen.has(nis)) continue
      seen.add(nis)
      out.push({
        nis,
        idSantri: a.id_santri,
        nama: a.nama || '—',
        nik: a.nik || '—',
        reg: a.id_registrasi,
        bayar: a.status_pembayaran || '—',
      })
    }
    return out
  }, [group])

  useEffect(() => {
    if (!isOpen || !group) return
    setTampilWorkspace(false)
    setPilihanPanelTerbuka(true)
    const first = pilihan[0]?.nis ?? null
    const second = pilihan.find((p) => p.nis !== first)?.nis ?? null
    setNisKiri(first)
    setNisKanan(second)
  }, [isOpen, group, pilihan])

  if (!isOpen || !group) return null

  const cukupDuaNis = pilihan.length >= 2
  const pasanganValid = nisKiri && nisKanan && nisKiri !== nisKanan

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="padukan-analisis-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[10030]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="padukan-analisis-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-[min(96vw,1420px)] bg-gray-50 dark:bg-gray-900 shadow-2xl z-[10031] flex flex-col border-l border-gray-200 dark:border-gray-700"
        role="dialog"
        aria-modal="true"
        aria-labelledby="padukan-analisis-title"
      >
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="min-w-0 flex-1">
            <h2 id="padukan-analisis-title" className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              Padukan data — potensi ganda
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              {cukupDuaNis && !pilihanPanelTerbuka ? (
                <>
                  Pasangan:{' '}
                  <strong className="font-mono text-teal-600 dark:text-teal-400">{nisKiri || '—'}</strong>
                  <span className="mx-1 text-gray-400">↔</span>
                  <strong className="font-mono text-blue-600 dark:text-blue-400">{nisKanan || '—'}</strong>
                  {tampilWorkspace && pasanganValid ? (
                    <span className="text-gray-500 dark:text-gray-400"> · perbandingan aktif</span>
                  ) : null}
                </>
              ) : (
                <span className="line-clamp-2">
                  Pilih NIS untuk kolom kiri & kanan, lalu tampilkan alur padukan (sama seperti halaman Padukan Data).
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {cukupDuaNis ? (
              <button
                type="button"
                onClick={() => setPilihanPanelTerbuka((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-expanded={pilihanPanelTerbuka}
                aria-controls="padukan-analisis-pilihan-panel"
                aria-label={pilihanPanelTerbuka ? 'Ciutkan panel pilihan NIS' : 'Buka panel pilihan NIS'}
              >
                {pilihanPanelTerbuka ? (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="hidden sm:inline">Ciutkan</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="hidden sm:inline">Buka</span>
                  </>
                )}
              </button>
            ) : null}
            <Link
              to="/pendaftaran/padukan-data"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap px-1"
              onClick={onClose}
            >
              Halaman penuh
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{group.deskripsi || 'Kelompok duplikat'}</p>
          </div>
          {!cukupDuaNis ? (
            <div className="px-4 pb-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Kurang dari dua NIS 7 digit di kelompok ini — buka halaman Padukan Data dan cari santri manual, atau lengkapi NIS di Data Pendaftar.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="sync">
              {pilihanPanelTerbuka && (
                <motion.div
                  key="padukan-analisis-pilihan-panel"
                  id="padukan-analisis-pilihan-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden border-t border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800"
                >
                  <div className="px-4 py-3 space-y-3 max-h-[42vh] overflow-y-auto">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Radio: pilih satu NIS per kolom (harus berbeda). Jika ada tiga pendaftar atau lebih, ganti pasangan lalu «Tampilkan ulang». Panel ini bisa diciutkan dari header.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <fieldset className="min-w-0 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 p-2">
                        <legend className="text-[10px] font-semibold uppercase text-teal-800 dark:text-teal-300 px-1">
                          Kolom kiri (Santri 1)
                        </legend>
                        <div className="space-y-1.5 mt-1">
                          {pilihan.map((p) => (
                            <label
                              key={`L-${p.nis}`}
                              className="flex items-start gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-white/60 dark:hover:bg-gray-800/60"
                            >
                              <input
                                type="radio"
                                name="padukan-analisis-col1"
                                className="mt-0.5 text-teal-600 border-gray-300 focus:ring-teal-500"
                                checked={nisKiri === p.nis}
                                onChange={() => {
                                  setNisKiri(p.nis)
                                  if (nisKanan === p.nis) {
                                    const lain = pilihan.find((x) => x.nis !== p.nis)
                                    setNisKanan(lain?.nis ?? null)
                                  }
                                  setTampilWorkspace(false)
                                }}
                              />
                              <span className="min-w-0">
                                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{p.nis}</span>
                                <span className="block text-gray-600 dark:text-gray-400 truncate" title={p.nama}>
                                  {p.nama} · NIK {p.nik}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  id santri {p.idSantri} · reg {p.reg} · {p.bayar}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset className="min-w-0 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-2">
                        <legend className="text-[10px] font-semibold uppercase text-blue-800 dark:text-blue-300 px-1">
                          Kolom kanan (Santri 2)
                        </legend>
                        <div className="space-y-1.5 mt-1">
                          {pilihan.map((p) => (
                            <label
                              key={`R-${p.nis}`}
                              className="flex items-start gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-white/60 dark:hover:bg-gray-800/60"
                            >
                              <input
                                type="radio"
                                name="padukan-analisis-col2"
                                className="mt-0.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                                checked={nisKanan === p.nis}
                                onChange={() => {
                                  setNisKanan(p.nis)
                                  if (nisKiri === p.nis) {
                                    const lain = pilihan.find((x) => x.nis !== p.nis)
                                    setNisKiri(lain?.nis ?? null)
                                  }
                                  setTampilWorkspace(false)
                                }}
                              />
                              <span className="min-w-0">
                                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{p.nis}</span>
                                <span className="block text-gray-600 dark:text-gray-400 truncate" title={p.nama}>
                                  {p.nama} · NIK {p.nik}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  id santri {p.idSantri} · reg {p.reg} · {p.bayar}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <button
                      type="button"
                      disabled={!pasanganValid}
                      onClick={() => setTampilWorkspace(true)}
                      className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
                    >
                      {tampilWorkspace && pasanganValid ? 'Terapkan ulang pasangan' : 'Tampilkan perbandingan & padukan'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {tampilWorkspace && pasanganValid ? (
            <PadukanDataWorkspace
              key={`${nisKiri}-${nisKanan}`}
              variant="embed"
              syncUrlNis={false}
              initialSantri1Nis={nisKiri}
              initialSantri2Nis={nisKanan}
              onMergeSuccess={onMergeSuccess}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400">
              {cukupDuaNis ? 'Pilih pasangan NIS lalu klik «Tampilkan perbandingan & padukan».' : null}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
