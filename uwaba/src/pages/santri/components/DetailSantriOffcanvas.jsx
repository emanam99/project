import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, rombelAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import ModalPindahRombel from '../../../components/Modal/ModalPindahRombel'

const field = (label, value) => (
  <div key={label} className="flex flex-col gap-0.5">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-100">{value ?? '-'}</span>
  </div>
)

export default function DetailSantriOffcanvas({ isOpen, onClose, santriRow, onEdit }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [santri, setSantri] = useState(null)
  const [riwayatRombel, setRiwayatRombel] = useState([])
  const [riwayatDaerah, setRiwayatDaerah] = useState([])
  /** 'diniyah' | 'formal' = modal pindah rombel untuk kategori mana */
  const [pindahModalKategori, setPindahModalKategori] = useState(null)
  const [lembagaIdDiniyah, setLembagaIdDiniyah] = useState('')
  const [lembagaIdFormal, setLembagaIdFormal] = useState('')
  const [pindahLoading, setPindahLoading] = useState(false)

  const idSantri = santriRow?.id ?? santriRow?.nis

  const loadRiwayatRombel = useCallback(() => {
    if (!idSantri) return Promise.resolve()
    return santriAPI.getRiwayatRombel(idSantri).then((res) => {
      if (res?.success && Array.isArray(res?.data)) setRiwayatRombel(res.data)
    })
  }, [idSantri])

  useEffect(() => {
    if (!isOpen || !idSantri) {
      setSantri(null)
      setRiwayatRombel([])
      setRiwayatDaerah([])
      setPindahModalKategori(null)
      setLembagaIdDiniyah('')
      setLembagaIdFormal('')
      return
    }
    setLoading(true)
    Promise.all([
      santriAPI.getById(idSantri),
      santriAPI.getRiwayatRombel(idSantri),
      santriAPI.getRiwayatKamar(idSantri)
    ])
      .then(([resSantri, resRombel, resKamar]) => {
        if (resSantri?.success && resSantri?.data) setSantri(resSantri.data)
        if (resRombel?.success && Array.isArray(resRombel?.data)) setRiwayatRombel(resRombel.data)
        if (resKamar?.success && Array.isArray(resKamar?.data)) setRiwayatDaerah(resKamar.data)
      })
      .catch((err) => console.error('DetailSantri load error:', err))
      .finally(() => setLoading(false))
  }, [isOpen, idSantri])

  // Ambil lembaga_id untuk diniyah/formal (untuk modal pindah rombel)
  useEffect(() => {
    if (!santri) {
      setLembagaIdDiniyah('')
      setLembagaIdFormal('')
      return
    }
    if (santri.id_diniyah == null || santri.id_diniyah === '') setLembagaIdDiniyah('')
    else {
      rombelAPI.getById(santri.id_diniyah).then((r) => {
        setLembagaIdDiniyah(r?.success && r?.data ? (r.data.lembaga_id || '') : '')
      }).catch(() => setLembagaIdDiniyah(''))
    }
    if (santri.id_formal == null || santri.id_formal === '') setLembagaIdFormal('')
    else {
      rombelAPI.getById(santri.id_formal).then((r) => {
        setLembagaIdFormal(r?.success && r?.data ? (r.data.lembaga_id || '') : '')
      }).catch(() => setLembagaIdFormal(''))
    }
  }, [santri?.id_diniyah, santri?.id_formal])

  const handlePindahRombel = async (role, targetRombelId, tahunAjaran = '') => {
    if (!santri?.id || !targetRombelId) return
    const payload = role === 'diniyah' ? { id_diniyah: targetRombelId } : { id_formal: targetRombelId }
    const ta = (tahunAjaran || '').trim()
    if (ta) {
      if (role === 'diniyah') payload.tahun_ajaran_diniyah = ta
      else payload.tahun_ajaran_formal = ta
    }
    setPindahModalKategori(null)
    setPindahLoading(true)
    try {
      const res = await santriAPI.update(santri.id, payload)
      if (res?.success) {
        showNotification('Santri berhasil dipindah ke rombel baru', 'success')
        await loadRiwayatRombel()
        const resSantri = await santriAPI.getById(idSantri)
        if (resSantri?.success && resSantri?.data) setSantri(resSantri.data)
      } else {
        showNotification(res?.message || 'Gagal memindah santri', 'error')
      }
    } catch (err) {
      console.error('Pindah rombel error:', err)
      showNotification('Gagal memindah santri', 'error')
    } finally {
      setPindahLoading(false)
    }
  }

  if (!isOpen) return null

  const row = santriRow || {}

  const handleEdit = () => {
    if (onEdit && (santri || row)) {
      onEdit(santri || { ...row, id: idSantri })
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="detail-santri-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="detail-santri-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
            Detail Santri — {row.nama || santri?.nama || 'Santri'}
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
              {/* Data Detail Santri */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Data Detail Santri
                </h4>
                {santri ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {field('NIS', santri.nis)}
                    {field('NIK', santri.nik)}
                    {field('Nama', santri.nama)}
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
                    {field('Diniyah', santri.diniyah)}
                    {field('Formal', santri.formal)}
                    {field('Daerah.Kamar', santri.daerah && santri.kamar ? (santri.daerah + '.' + santri.kamar) : (santri.daerah || santri.kamar || '-'))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Data santri tidak ditemukan.</p>
                )}
              </section>

              {/* Riwayat Rombel */}
              {(() => {
                const kat = (k) => (r) => (r.lembaga_kategori || '').toString().trim().toLowerCase() === (k || '').toLowerCase()
                const riwayatDiniyah = riwayatRombel.filter(kat('diniyah'))
                const riwayatFormal = riwayatRombel.filter(kat('formal'))
                const riwayatLainnya = riwayatRombel.filter((r) => !kat('diniyah')(r) && !kat('formal')(r))
                const TabelRombel = ({ list }) => (
                  list.length === 0 ? null : (
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
                          {list.map((r, i) => (
                            <tr key={r.id ?? 'rombel-' + i} className="bg-white dark:bg-gray-800">
                              <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_ajaran || '-'}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.lembaga_nama || '-'}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.rombel_label || (r.kelas || '') + (r.kel ? ' ' + r.kel : '') || '-'}</td>
                              <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )
                const btnPindahClass = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50'
                const hasDiniyah = santri && (santri.id_diniyah != null && santri.id_diniyah !== '')
                const hasFormal = santri && (santri.id_formal != null && santri.id_formal !== '')
                return (
                  <section>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                      Riwayat Rombel
                    </h4>
                    {riwayatRombel.length === 0 && !hasDiniyah && !hasFormal ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat rombel.</p>
                    ) : (
                      <>
                        {/* Diniyah: judul kategori + tombol Pindah Rombel sejajar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400">Diniyah</h5>
                            {hasDiniyah && (
                              <button
                                type="button"
                                onClick={() => setPindahModalKategori('diniyah')}
                                disabled={pindahLoading || !lembagaIdDiniyah}
                                className={btnPindahClass}
                                aria-label="Pindah rombel diniyah"
                              >
                                {pindahLoading ? (
                                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-teal-500 border-t-transparent" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                )}
                                Pindah Rombel
                              </button>
                            )}
                          </div>
                          <TabelRombel list={riwayatDiniyah} />
                        </div>
                        {/* Formal: judul kategori + tombol Pindah Rombel sejajar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400">Formal</h5>
                            {hasFormal && (
                              <button
                                type="button"
                                onClick={() => setPindahModalKategori('formal')}
                                disabled={pindahLoading || !lembagaIdFormal}
                                className={btnPindahClass}
                                aria-label="Pindah rombel formal"
                              >
                                {pindahLoading ? (
                                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-teal-500 border-t-transparent" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                )}
                                Pindah Rombel
                              </button>
                            )}
                          </div>
                          <TabelRombel list={riwayatFormal} />
                        </div>
                        {/* Lainnya: hanya judul + tabel */}
                        {(riwayatLainnya.length > 0) && (
                          <div className="mb-4">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Lainnya</h5>
                            <TabelRombel list={riwayatLainnya} />
                          </div>
                        )}
                      </>
                    )}
                  </section>
                )
              })()}

              {/* Modal Pindah Rombel (sama dengan di page Rombel): tahun ajaran + list rombel, tanpa konfirmasi setelah pilih */}
              <ModalPindahRombel
                isOpen={!!pindahModalKategori}
                onClose={() => setPindahModalKategori(null)}
                title={'Pindah Rombel ' + (pindahModalKategori === 'diniyah' ? 'Diniyah' : 'Formal')}
                lembagaId={pindahModalKategori === 'diniyah' ? lembagaIdDiniyah : lembagaIdFormal}
                excludeRombelId={pindahModalKategori === 'diniyah' ? santri?.id_diniyah : santri?.id_formal}
                onSelect={(targetRombelId, tahunAjaran) => handlePindahRombel(pindahModalKategori, targetRombelId, tahunAjaran)}
                skipConfirmAfterSelect
              />

              {/* Riwayat Daerah (Kamar) */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                  Riwayat Daerah
                </h4>
                {riwayatDaerah.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat daerah.</p>
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
                        {riwayatDaerah.map((r, i) => (
                          <tr key={r.id ?? 'daerah-' + i} className="bg-white dark:bg-gray-800">
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

        {/* Footer dengan tombol Edit */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            type="button"
            onClick={handleEdit}
            disabled={loading || !(santri || row.id || row.nis)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Santri
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
