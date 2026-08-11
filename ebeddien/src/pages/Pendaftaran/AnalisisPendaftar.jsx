import { usePageTahunAjaranFilter } from '../../hooks/usePageTahunAjaranFilter'
import TahunAjaranPageFilterBar from '../../components/TahunAjaran/TahunAjaranPageFilterBar'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { pendaftaranAPI } from '../../services/api'
import PadukanDataAnalisisOffcanvas from './components/PadukanDataAnalisisOffcanvas'

function formatRp(val) {
  if (val == null || val === '') return '-'
  return `Rp ${Number(val).toLocaleString('id-ID')}`
}

/**
 * Ringkasan analisis PSB (pembayaran, breakdown lembaga, duplikasi) — default tahun ajaran dari pengaturan PSB.
 */
export default function AnalisisPendaftar() {
  const {
    selectedHijriyah: tahunAjaran,
    setSelectedHijriyah: setTahunAjaran,
    selectedMasehi: tahunAjaranMasehi,
    setSelectedMasehi: setTahunAjaranMasehi,
    hijriyahOptions,
    masehiOptions
  } = usePageTahunAjaranFilter({ defaultFromPengaturan: true })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [data, setData] = useState(null)
  const [padukanOpen, setPadukanOpen] = useState(false)
  const [padukanGroup, setPadukanGroup] = useState(null)

  const refetchAnalisis = useCallback(() => {
    setLoading(true)
    setErr('')
    return pendaftaranAPI
      .getAnalisisPendaftar(tahunAjaran, tahunAjaranMasehi)
      .then((res) => {
        if (res?.success) {
          setData(res)
          setErr('')
        } else {
          setData(null)
          setErr(res?.message || 'Gagal memuat analisis')
        }
      })
      .catch((e) => {
        setData(null)
        setErr(e?.message || 'Gagal memuat analisis')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [tahunAjaran, tahunAjaranMasehi])

  useEffect(() => {
    refetchAnalisis()
  }, [refetchAnalisis])

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Analisis pendaftar</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
                  Ringkasan pembayaran, pemetaan per lembaga, dan sinyal duplikasi mengikuti tahun ajaran pengaturan PSB. Untuk daftar baris dan aksi (ekspor, verifikasi, dll.) gunakan{' '}
                  <Link to="/pendaftaran/data-pendaftar" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                    Data Pendaftar
                  </Link>
                  .
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <TahunAjaranPageFilterBar
                  variant="dual"
                  hideLabels
                  showHint={false}
                  selectedHijriyah={tahunAjaran}
                  selectedMasehi={tahunAjaranMasehi}
                  onHijriyahChange={setTahunAjaran}
                  onMasehiChange={setTahunAjaranMasehi}
                  hijriyahOptions={hijriyahOptions}
                  masehiOptions={masehiOptions}
                />
                <Link
                  to="/pendaftaran/data-pendaftar"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  ← Data Pendaftar
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ringkasan & temuan</h2>
              </div>
              <div className="px-4 py-4 space-y-4 min-h-[120px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                  </div>
                ) : (
                  <>
                    {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
                    {data?.ringkasan_pembayaran ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-2 py-2">
                            <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">Total</div>
                            <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                              {data.ringkasan_pembayaran.total_registrasi ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-2 py-2">
                            <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 uppercase">Lunas</div>
                            <div className="text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                              {data.ringkasan_pembayaran.lunas ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-2 py-2">
                            <div className="text-[10px] font-medium text-amber-800 dark:text-amber-200 uppercase">Belum bayar</div>
                            <div className="text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                              {data.ringkasan_pembayaran.belum_bayar ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/80 dark:bg-orange-950/30 px-2 py-2">
                            <div className="text-[10px] font-medium text-orange-800 dark:text-orange-200 uppercase">Kurang bayar</div>
                            <div className="text-sm font-semibold tabular-nums text-orange-900 dark:text-orange-100">
                              {data.ringkasan_pembayaran.kurang_bayar ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-2">
                            <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">Tanpa tagihan</div>
                            <div className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                              {data.ringkasan_pembayaran.tanpa_tagihan ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/20 px-2 py-2 col-span-2 lg:col-span-1">
                            <div className="text-[10px] font-medium text-teal-700 dark:text-teal-300 uppercase">Total kurang (Rp)</div>
                            <div className="text-sm font-semibold tabular-nums text-teal-900 dark:text-teal-100">
                              {formatRp(Math.round(Number(data.ringkasan_pembayaran.total_kurang_rp ?? 0)))}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-300">
                          <span>
                            Wajib agregat:{' '}
                            <strong className="tabular-nums">
                              {formatRp(Math.round(Number(data.ringkasan_pembayaran.total_wajib_rp ?? 0)))}
                            </strong>
                          </span>
                          <span>
                            Bayar agregat:{' '}
                            <strong className="tabular-nums">
                              {formatRp(Math.round(Number(data.ringkasan_pembayaran.total_bayar_rp ?? 0)))}
                            </strong>
                          </span>
                        </div>
                      </>
                    ) : null}

                    {Array.isArray(data?.breakdown_formal) && data.breakdown_formal.length > 0 ? (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Per daftar formal</p>
                          <ul className="text-xs border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                            {data.breakdown_formal.map((row) => (
                              <li key={String(row.kode)} className="flex justify-between gap-2 px-2 py-1">
                                <span className="truncate text-gray-600 dark:text-gray-400" title={String(row.kode)}>
                                  {String(row.kode)}
                                </span>
                                <span className="tabular-nums font-medium shrink-0">{row.jumlah}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Per daftar diniyah</p>
                          <ul className="text-xs border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                            {(data.breakdown_diniyah || []).map((row) => (
                              <li key={String(row.kode)} className="flex justify-between gap-2 px-2 py-1">
                                <span className="truncate text-gray-600 dark:text-gray-400" title={String(row.kode)}>
                                  {String(row.kode)}
                                </span>
                                <span className="tabular-nums font-medium shrink-0">{row.jumlah}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(data?.registrasi_ganda_per_santri) && data.registrasi_ganda_per_santri.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Satu santri, lebih dari satu registrasi (tahun ini)</p>
                        <ul className="text-xs space-y-1 border border-amber-200/80 dark:border-amber-800/60 rounded-lg p-2 bg-amber-50/50 dark:bg-amber-950/20">
                          {data.registrasi_ganda_per_santri.map((g) => (
                            <li key={g.id_santri}>
                              ID santri <strong>{g.id_santri}</strong> — {g.jumlah_registrasi} registrasi: {(g.id_registrasi || []).join(', ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {Array.isArray(data?.potensi_duplikasi_orang_sama) && data.potensi_duplikasi_orang_sama.length > 0 ? (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Potensi pendaftar ganda (beda ID santri / NIK)</p>
                          <Link
                            to="/pendaftaran/padukan-data"
                            className="text-xs px-2 py-1 rounded-md border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 font-medium"
                          >
                            Halaman Padukan Data
                          </Link>
                        </div>
                        <div className="space-y-2 text-xs">
                          {data.potensi_duplikasi_orang_sama.map((gr, gi) => {
                            const jenisLabel =
                              {
                                nama_tanggal_lahir: 'Nama & tanggal lahir sama',
                                nomor_hp_wa: 'Nomor HP/WA sama',
                                no_kk: 'No KK sama',
                              }[gr.jenis] || gr.jenis
                            return (
                              <div
                                key={`${gr.jenis}-${gi}-${gr.kunci_ringkas}`}
                                className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-gray-50/80 dark:bg-gray-900/40"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <p className="font-medium text-gray-800 dark:text-gray-200">{jenisLabel}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPadukanGroup(gr)
                                      setPadukanOpen(true)
                                    }}
                                    className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium"
                                  >
                                    Padukan
                                  </button>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400 mt-0.5">{gr.deskripsi}</p>
                                {gr.nik_unik_berbeda ? (
                                  <p className="text-amber-700 dark:text-amber-300 mt-1 font-medium">
                                    Perhatian: beberapa NIK berbeda dalam kelompok ini.
                                  </p>
                                ) : null}
                                <ul className="mt-2 space-y-1">
                                  {(gr.anggota || []).map((a) => (
                                    <li key={a.id_registrasi} className="tabular-nums">
                                      Reg {a.id_registrasi} · Santri {a.id_santri}
                                      {a.nis != null && String(a.nis).trim() !== '' ? ` · NIS ${a.nis}` : ''}
                                      {' · '}
                                      {a.nama || '—'} · NIK {a.nik || '—'} · {a.status_pembayaran}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {data?.keterangan ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">{data.keterangan}</p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <PadukanDataAnalisisOffcanvas
        isOpen={padukanOpen}
        onClose={() => {
          setPadukanOpen(false)
          setPadukanGroup(null)
        }}
        group={padukanGroup}
        onMergeSuccess={() => {
          refetchAnalisis()
        }}
      />
    </div>
  )
}
