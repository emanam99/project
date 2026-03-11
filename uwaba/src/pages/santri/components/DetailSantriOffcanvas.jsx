import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, rombelAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import OffcanvasPindahRombel from '../../../components/Modal/OffcanvasPindahRombel'
import RiwayatPembayaranSantriOffcanvas from '../../../components/RiwayatPembayaranSantriOffcanvas'

const field = (label, value) => (
  <div key={label} className="flex flex-col gap-0.5">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-100">{value ?? '-'}</span>
  </div>
)

const formatAlamat = (s) => {
  const parts = [s?.dusun, s?.rt, s?.rw, s?.desa, s?.kecamatan, s?.kabupaten, s?.provinsi].filter(Boolean)
  return parts.length ? parts.join(', ') : '-'
}

const formatTTL = (s) => {
  const tempat = (s?.tempat_lahir || '').trim()
  const tgl = (s?.tanggal_lahir || '').trim()
  if (!tempat && !tgl) return '-'
  return tempat && tgl ? `${tempat}, ${tgl}` : (tempat || tgl)
}

const NoTelponField = ({ santri }) => {
  const telp = (santri?.no_telpon || '').trim()
  const wa = (santri?.no_wa_santri || '').trim()
  if (!telp && !wa) return field('No telpon', '-')
  return (
    <div key="No telpon" className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">No telpon</span>
      <div className="text-sm text-gray-900 dark:text-gray-100 flex flex-col gap-0.5">
        {telp && <span>Telpon: {telp}</span>}
        {wa && <span>WA: {wa}</span>}
      </div>
    </div>
  )
}

export default function DetailSantriOffcanvas({ isOpen, onClose, santriRow, onEdit }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [santri, setSantri] = useState(null)
  const [riwayatRombel, setRiwayatRombel] = useState([])
  const [riwayatDaerah, setRiwayatDaerah] = useState([])
  /** 'diniyah' | 'formal' = offcanvas pindah rombel untuk kategori mana */
  const [pindahModalKategori, setPindahModalKategori] = useState(null)
  const [lembagaIdDiniyah, setLembagaIdDiniyah] = useState('')
  const [lembagaIdFormal, setLembagaIdFormal] = useState('')
  const [pindahLoading, setPindahLoading] = useState(false)
  const [accordionRiwayatDiniyah, setAccordionRiwayatDiniyah] = useState(false)
  const [accordionRiwayatFormal, setAccordionRiwayatFormal] = useState(false)
  const [showRiwayatPembayaran, setShowRiwayatPembayaran] = useState(false)

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

  const row = santriRow || {}

  const handleEdit = () => {
    if (onEdit && (santri || row)) {
      onEdit(santri || { ...row, id: idSantri })
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="detail-santri-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="detail-santri-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[9999] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
          >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Detail Santri</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{row.nama || santri?.nama || 'Santri'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {santri && (
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin rounded-full h-11 w-11 border-2 border-teal-500 border-t-transparent" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <>
              {/* Kartu profil */}
              {santri ? (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-5">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                        {(santri.nama || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{santri.nama || '-'}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">NIS {santri.nis || '-'}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{formatAlamat(santri)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                    <span className="text-gray-700 dark:text-gray-300">{santri.status_santri || '-'}</span>
                    <span className="text-gray-400 dark:text-gray-500">·</span>
                    <span className="text-gray-700 dark:text-gray-300">{santri.kategori || '-'}</span>
                    {(santri.daerah || santri.kamar) && (
                      <>
                        <span className="text-gray-400 dark:text-gray-500">·</span>
                        <span className="text-gray-700 dark:text-gray-300">{santri.daerah && santri.kamar ? `${santri.daerah}.${santri.kamar}` : (santri.daerah || santri.kamar)}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white dark:bg-gray-800 p-8 text-center shadow-sm border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Data santri tidak ditemukan.</p>
                </div>
              )}

              {/* Data Detail Santri */}
              {santri && (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Data Detail</h4>
                  </div>
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    {field('NIK', santri.nik)}
                    {field('TTL', formatTTL(santri))}
                    {field('Jenis Kelamin', santri.gender)}
                    {field('Ayah', santri.ayah)}
                    {field('Ibu', santri.ibu)}
                    {NoTelponField({ santri })}
                    {field('Email', santri.email)}
                  </div>
                </div>
              )}

              {/* Riwayat Pembayaran */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </span>
                    Pembayaran
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowRiwayatPembayaran(true)}
                    className="text-xs font-medium px-3 py-2 rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-colors inline-flex items-center gap-1.5"
                  >
                    Lihat riwayat
                  </button>
                </div>
              </div>

              {/* Riwayat Rombel */}
              {(() => {
                const kat = (k) => (r) => (r.lembaga_kategori || '').toString().trim().toLowerCase() === (k || '').toLowerCase()
                const riwayatDiniyah = riwayatRombel.filter(kat('diniyah'))
                const riwayatFormal = riwayatRombel.filter(kat('formal'))
                const riwayatLainnya = riwayatRombel.filter((r) => !kat('diniyah')(r) && !kat('formal')(r))
                const sameId = (rId, sId) => rId != null && sId != null && String(rId) === String(sId)
                const aktifDiniyah = riwayatDiniyah.find((r) => sameId(r.id, santri?.id_diniyah)) ?? riwayatDiniyah[0]
                const riwayatDiniyahLama = aktifDiniyah ? riwayatDiniyah.filter((r) => r.id !== aktifDiniyah.id) : []
                const aktifFormal = riwayatFormal.find((r) => sameId(r.id, santri?.id_formal)) ?? riwayatFormal[0]
                const riwayatFormalLama = aktifFormal ? riwayatFormal.filter((r) => r.id !== aktifFormal.id) : []
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
                const RowAktif = ({ r }) => (
                  <div className="text-sm py-2.5 px-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{r.lembaga_nama || '-'}</span>
                    <span className="text-gray-600 dark:text-gray-400"> · {(r.rombel_label || (r.kelas || '') + (r.kel ? ' ' + r.kel : '') || '-')}</span>
                    {(r.tahun_ajaran || r.tanggal_dibuat) && (
                      <span className="text-xs text-gray-500 dark:text-gray-500 block mt-0.5">{[r.tahun_ajaran, r.tanggal_dibuat].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                )
                const btnPindahClass = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50'
                const hasDiniyah = santri && (santri.id_diniyah != null && santri.id_diniyah !== '')
                const hasFormal = santri && (santri.id_formal != null && santri.id_formal !== '')
                return (
                  <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </span>
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat Rombel</h4>
                    </div>
                    <div className="p-5">
                    {riwayatRombel.length === 0 && !hasDiniyah && !hasFormal ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat rombel.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Diniyah: aktif + accordion sisanya */}
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
                          {aktifDiniyah ? <RowAktif r={aktifDiniyah} /> : riwayatDiniyah.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400 py-1">—</p> : null}
                          {riwayatDiniyahLama.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setAccordionRiwayatDiniyah((o) => !o)}
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <span>Riwayat sebelumnya ({riwayatDiniyahLama.length})</span>
                                <svg className={`w-4 h-4 shrink-0 transition-transform ${accordionRiwayatDiniyah ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <AnimatePresence>
                                {accordionRiwayatDiniyah && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="pt-1">
                                      <TabelRombel list={riwayatDiniyahLama} />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        {/* Formal: aktif + accordion sisanya */}
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
                          {aktifFormal ? <RowAktif r={aktifFormal} /> : riwayatFormal.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400 py-1">—</p> : null}
                          {riwayatFormalLama.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setAccordionRiwayatFormal((o) => !o)}
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <span>Riwayat sebelumnya ({riwayatFormalLama.length})</span>
                                <svg className={`w-4 h-4 shrink-0 transition-transform ${accordionRiwayatFormal ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <AnimatePresence>
                                {accordionRiwayatFormal && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="pt-1">
                                      <TabelRombel list={riwayatFormalLama} />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        {/* Lainnya: semua di accordion */}
                        {(riwayatLainnya.length > 0) && (
                          <div className="mb-4">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Lainnya</h5>
                            <TabelRombel list={riwayatLainnya} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                )
              })()}

              {/* Offcanvas bawah Pindah Rombel: tahun ajaran + list rombel, tanpa konfirmasi setelah pilih */}
              <OffcanvasPindahRombel
                isOpen={!!pindahModalKategori}
                onClose={() => setPindahModalKategori(null)}
                title={'Pindah Rombel ' + (pindahModalKategori === 'diniyah' ? 'Diniyah' : 'Formal')}
                lembagaId={pindahModalKategori === 'diniyah' ? lembagaIdDiniyah : lembagaIdFormal}
                excludeRombelId={pindahModalKategori === 'diniyah' ? santri?.id_diniyah : santri?.id_formal}
                onSelect={(targetRombelId, tahunAjaran) => handlePindahRombel(pindahModalKategori, targetRombelId, tahunAjaran)}
                skipConfirmAfterSelect
              />

              {/* Offcanvas kanan: Riwayat Pembayaran (global, bisa dipanggil dari mana saja) */}
              <RiwayatPembayaranSantriOffcanvas
                isOpen={showRiwayatPembayaran}
                onClose={() => setShowRiwayatPembayaran(false)}
                idSantri={idSantri}
                namaSantri={santri?.nama || row.nama}
              />

              {/* Riwayat Daerah (Kamar) */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat Daerah</h4>
                </div>
                <div className="p-5">
                {riwayatDaerah.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat daerah.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
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
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer dengan tombol Edit */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            type="button"
            onClick={handleEdit}
            disabled={loading || !(santri || row.id || row.nis)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Santri
          </button>
        </div>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
