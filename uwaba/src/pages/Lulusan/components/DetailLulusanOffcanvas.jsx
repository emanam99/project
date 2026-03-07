import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, pendaftaranAPI } from '../../../services/api'

const field = (label, value) => (
  <div key={label} className="flex flex-col gap-0.5">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-100">{value ?? '-'}</span>
  </div>
)

export default function DetailLulusanOffcanvas({ isOpen, onClose, lulusanRow }) {
  const [loading, setLoading] = useState(false)
  const [santri, setSantri] = useState(null)
  const [registrasiList, setRegistrasiList] = useState([])
  const [riwayatRombel, setRiwayatRombel] = useState([])
  const [riwayatKamar, setRiwayatKamar] = useState([])

  const idSantri = lulusanRow?.id_santri

  useEffect(() => {
    if (!isOpen || !idSantri) {
      setSantri(null)
      setRegistrasiList([])
      setRiwayatRombel([])
      setRiwayatKamar([])
      return
    }
    setLoading(true)
    Promise.all([
      santriAPI.getById(idSantri),
      pendaftaranAPI.getAllRegistrasiBySantri(idSantri),
      santriAPI.getRiwayatRombel(idSantri),
      santriAPI.getRiwayatKamar(idSantri)
    ])
      .then(([resSantri, resReg, resRombel, resKamar]) => {
        if (resSantri?.success && resSantri?.data) setSantri(resSantri.data)
        if (resReg?.success && Array.isArray(resReg?.data)) setRegistrasiList(resReg.data)
        if (resRombel?.success && Array.isArray(resRombel?.data)) setRiwayatRombel(resRombel.data)
        if (resKamar?.success && Array.isArray(resKamar?.data)) setRiwayatKamar(resKamar.data)
      })
      .catch((err) => console.error('DetailLulusan load error:', err))
      .finally(() => setLoading(false))
  }, [isOpen, idSantri])

  if (!isOpen) return null

  const row = lulusanRow || {}

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
            Detail Lulusan — {row.nama || 'Santri'}
          </h3>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Data kelulusan (dari baris yang diklik) */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Kelulusan
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {field('Lembaga', row.lembaga_nama)}
                  {field('Rombel', row.rombel_label)}
                  {field('Tahun Ajaran', row.tahun_ajaran)}
                  {field('Tanggal Lulus', row.tanggal_dibuat)}
                </div>
              </section>

              {/* Daftar PSB Registrasi */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Daftar PSB Registrasi
                </h4>
                {registrasiList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data registrasi.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tahun (H/M)</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Diniyah / Formal</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {registrasiList.map((r) => (
                          <tr key={r.id_registrasi} className="bg-white dark:bg-gray-800">
                            <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_hijriyah || '-'} / {r.tahun_masehi || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.status_pendaftar || r.status_santri || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.daftar_diniyah ? 'Diniyah' : ''} {r.daftar_formal ? 'Formal' : ''}</td>
                            <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Data detail santri */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Data Detail Santri
                </h4>
                {santri ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {field('NIS', santri.nis)}
                    {field('NIK', santri.nik)}
                    {field('Tempat Lahir', santri.tempat_lahir)}
                    {field('Tanggal Lahir', santri.tanggal_lahir)}
                    {field('Jenis Kelamin', santri.gender)}
                    {field('Ayah', santri.ayah)}
                    {field('Ibu', santri.ibu)}
                    {field('No. Telpon', santri.no_telpon)}
                    {field('Email', santri.email)}
                    {field('Desa', santri.desa)}
                    {field('Kecamatan', santri.kecamatan)}
                    {field('Kabupaten', santri.kabupaten)}
                    {field('Provinsi', santri.provinsi)}
                    {field('Status Santri', santri.status_santri)}
                    {field('Kategori', santri.kategori)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Data santri tidak ditemukan.</p>
                )}
              </section>

              {/* Riwayat Rombel — pisah Diniyah & Formal berdasarkan kategori lembaga */}
              {(() => {
                const kat = (k) => (r) => (r.lembaga_kategori || '').toString().trim().toLowerCase() === (k || '').toLowerCase()
                const riwayatDiniyah = riwayatRombel.filter(kat('diniyah'))
                const riwayatFormal = riwayatRombel.filter(kat('formal'))
                const riwayatLainnya = riwayatRombel.filter((r) => !kat('diniyah')(r) && !kat('formal')(r))
                const TabelRombel = ({ list, judul }) => (
                  list.length === 0 ? null : (
                    <div className="mb-4">
                      <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">{judul}</h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                          <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tahun Ajaran</th>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Lembaga</th>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Rombel</th>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tanggal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {list.map((r) => (
                              <tr key={r.id} className="bg-white dark:bg-gray-800">
                                <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_ajaran || '-'}</td>
                                <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.lembaga_nama || '-'}</td>
                                <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.rombel_label || `${r.kelas || ''} ${r.kel || ''}`.trim() || '-'}</td>
                                <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )
                return (
                  <section>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                      Riwayat Rombel
                    </h4>
                    {riwayatRombel.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat rombel.</p>
                    ) : (
                      <>
                        <TabelRombel list={riwayatDiniyah} judul="Diniyah" />
                        <TabelRombel list={riwayatFormal} judul="Formal" />
                        <TabelRombel list={riwayatLainnya} judul="Lainnya" />
                      </>
                    )}
                  </section>
                )
              })()}

              {/* Riwayat Kamar */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Riwayat Kamar
                </h4>
                {riwayatKamar.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat kamar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tahun Ajaran</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Daerah.Kamar</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {riwayatKamar.map((r) => (
                          <tr key={r.id} className="bg-white dark:bg-gray-800">
                            <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_ajaran || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.daerah_kamar || `${r.daerah || ''}.${r.kamar || ''}`.trim() || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.status_santri || r.kategori || '-'}</td>
                            <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
