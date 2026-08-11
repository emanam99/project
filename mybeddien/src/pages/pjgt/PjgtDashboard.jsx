import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { usePjgtDashboardBundle, usePjgtMadrasahId } from '../../hooks/usePjgtCachedResources'
import { madrasahNamaFromUser } from '../../utils/pjgtMadrasahNama'
import { getBulanName } from '../../utils/bulanHijriLatin'
import { GtPenugasanStatusBadge, rowGtAktif } from '../../utils/pjgtGuruTugasPenugasan'

function DetailRow({ label, value }) {
  if (value == null || String(value).trim() === '') return null
  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  )
}

function formatAlamatRingkas(m) {
  if (!m || typeof m !== 'object') return null
  const parts = [m.desa, m.kecamatan, m.kabupaten, m.provinsi].filter((x) => x != null && String(x).trim() !== '')
  if (parts.length === 0) return null
  let s = parts.join(', ')
  if (m.kode_pos != null && String(m.kode_pos).trim() !== '') {
    s += ` ${String(m.kode_pos).trim()}`
  }
  return s
}

export default function PjgtDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const madrasahId = usePjgtMadrasahId()
  const { madrasah, profilError, laporanTerakhir, tahunAjaranAktif, gtRows, loading } =
    usePjgtDashboardBundle()

  const namaDisplay = useMemo(() => {
    const n = madrasah?.nama != null ? String(madrasah.nama).trim() : ''
    if (n) return n
    return madrasahNamaFromUser(user) || 'Madrasah'
  }, [madrasah?.nama, user])

  const alamatText = useMemo(() => formatAlamatRingkas(madrasah), [madrasah])

  const gtTahunIni = useMemo(() => {
    const ta = String(tahunAjaranAktif || '').trim()
    if (!ta) return []
    return gtRows.filter((r) => String(r.id_tahun_ajaran ?? '').trim() === ta)
  }, [gtRows, tahunAjaranAktif])

  if (!madrasahId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Akun PJGT belum terhubung ke data madrasah. Hubungkan akun atau login ulang.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-10">
      {profilError && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {profilError}
        </div>
      )}

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900/40 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Data madrasah</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Informasi lembaga dari basis data UGT</p>
          </div>
          <Link
            to="/pjgt/madrasah"
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            Profil lengkap →
          </Link>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{namaDisplay}</p>
              <DetailRow label="Kategori" value={madrasah?.kategori} />
              <DetailRow label="Identitas madrasah" value={madrasah?.identitas} />
              <DetailRow label="Status" value={madrasah?.status} />
              <DetailRow label="Alamat" value={alamatText} />
            </>
          )}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900/40">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Struktural</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pengasuh dan PJGT madrasah ini</p>
        </div>
        <div className="p-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
          ) : (
            <>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-3 border border-gray-100 dark:border-gray-700/60">
                <p className="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase tracking-wide">Pengasuh</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {madrasah?.nama_pengasuh?.trim() || '—'}
                </p>
                {madrasah?.no_pengasuh ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">{madrasah.no_pengasuh}</p>
                ) : null}
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-3 border border-gray-100 dark:border-gray-700/60">
                <p className="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase tracking-wide">PJGT</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {madrasah?.nama_pjgt?.trim() || '—'}
                </p>
                {madrasah?.no_pjgt ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">{madrasah.no_pjgt}</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900/40 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Guru tugas</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {tahunAjaranAktif ? (
                <span className="font-medium text-teal-700 dark:text-teal-400">Tahun ajaran {tahunAjaranAktif}</span>
              ) : (
                'Tahun ajaran aktif belum tersedia'
              )}
            </p>
          </div>
          <Link
            to="/pjgt/guru-tugas"
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            Riwayat lengkap →
          </Link>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
          ) : !tahunAjaranAktif ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tahun ajaran belum ditentukan (periksa rentang dari–sampai di master). Penugasan tahun ini tidak dapat ditampilkan.
            </p>
          ) : gtTahunIni.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Belum ada guru tugas untuk tahun ajaran {tahunAjaranAktif}.
            </p>
          ) : (
            <ul className="space-y-3">
              {gtTahunIni.map((row) => (
                <li
                  key={row.id ?? `${row.id_santri}-${row.id_tahun_ajaran}`}
                  className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 border border-gray-100 dark:border-gray-700/60"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>
                      {row.santri_nama || '—'}
                      {row.santri_nis != null && String(row.santri_nis).trim() !== '' ? (
                        <span className="text-gray-500 dark:text-gray-400 font-normal"> · NIS {row.santri_nis}</span>
                      ) : null}
                    </span>
                    <GtPenugasanStatusBadge aktif={rowGtAktif(row)} />
                  </p>
                  {row.keterangan ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{row.keterangan}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Laporan terakhir</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">PJGT — urut dari yang terbaru</p>
          </div>
          <Link
            to="/pjgt/laporan"
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            Lihat semua
          </Link>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
          {loading ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Memuat...</div>
          ) : laporanTerakhir.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Belum ada laporan.{' '}
              <Link to="/pjgt/laporan" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                Tambah laporan
              </Link>
            </div>
          ) : (
            laporanTerakhir.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/pjgt/laporan?edit=${row.id}`)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {row.santri_nama || 'Santri'}
                    </p>
                    {row.santri_nis ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">NIS {row.santri_nis}</p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {row.id_tahun_ajaran || '—'} · {getBulanName(row.bulan)}
                    </p>
                    {row.tanggal_dibuat ? (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(row.tanggal_dibuat).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
                {row.usulan ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{row.usulan}</p>
                ) : null}
              </button>
            ))
          )}
        </div>
      </motion.section>

      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-600 px-4 py-3 text-center">
        <Link
          to="/pjgt/laporan"
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm"
        >
          Kelola laporan PJGT
        </Link>
      </div>
    </div>
  )
}
