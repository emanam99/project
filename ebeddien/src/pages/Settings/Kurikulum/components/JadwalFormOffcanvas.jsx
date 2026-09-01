import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { mapelAPI, kurikulumJadwalAPI } from '../../../../services/api'
import CariPengurusOffcanvas from '../../../../components/CariPengurusOffcanvas'
import JamJenisToggle from '../../../Kalender/components/JamJenisToggle'
import { normalizeJamJenis } from '../../../Kalender/utils/hariPentingJam'

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const selectClass = `${inputClass} appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9`
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

const SELECT_BG = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
}

const HARI_OPTIONS = [
  { value: '1', label: 'Senin' },
  { value: '2', label: 'Selasa' },
  { value: '3', label: 'Rabu' },
  { value: '4', label: 'Kamis' },
  { value: '5', label: 'Jumat' },
  { value: '6', label: 'Sabtu' },
  { value: '7', label: 'Minggu' }
]

function rombelLabelDalamLembaga(r) {
  if (!r) return ''
  const parts = [r.kelas, r.kel].filter((x) => x != null && String(x).trim() !== '')
  return parts.length ? parts.join(' · ') : `Rombel #${r.id}`
}

function isRombelAktif(r) {
  const s = String(r?.status ?? '').toLowerCase().trim()
  return s === 'aktif' || s === 'active'
}

function toTimeInput(v) {
  if (v == null || v === '') return ''
  const s = String(v)
  return s.length >= 5 ? s.slice(0, 5) : s
}

function mapelOptionLabel(m) {
  const indo = String(m?.kitab_nama || m?.nama_indo || '').trim()
  const arab = String(m?.kitab_nama_arab || m?.nama_arab || '').trim()
  const fan = String(m?.kitab_fan || m?.fan || '').trim()
  const title = indo || arab || `Mapel #${m?.id}`
  return fan ? `${title} · ${fan}` : title
}

function pengurusDisplayName(p) {
  if (!p) return ''
  const awal = String(p.gelar_awal || p.pengurus_gelar_awal || '').trim()
  const nama = String(p.nama || p.pengurus_nama || p.nama_pengurus || '').trim()
  const akhir = String(p.gelar_akhir || p.pengurus_gelar_akhir || '').trim()
  return [awal, nama, akhir].filter(Boolean).join(' ').trim()
}

export default function JadwalFormOffcanvas({ isOpen, onClose, record, lembagaList, rombelList, onSuccess }) {
  const isEdit = Boolean(record?.id)
  const originalRombelId = isEdit && record?.id_rombel != null ? String(record.id_rombel) : ''

  const [idLembaga, setIdLembaga] = useState('')
  const [idRombel, setIdRombel] = useState('')
  const [idLembagaKitab, setIdLembagaKitab] = useState('')
  const [mapelOptions, setMapelOptions] = useState([])
  const [mapelLoading, setMapelLoading] = useState(false)
  const [pola, setPola] = useState('mingguan')
  const [hari, setHari] = useState('')
  const [tanggalBulan, setTanggalBulan] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [jamMulai, setJamMulai] = useState('')
  const [jamSelesai, setJamSelesai] = useState('')
  const [jamJenis, setJamJenis] = useState('wib')
  const [idPengurus, setIdPengurus] = useState('')
  const [pengurusNama, setPengurusNama] = useState('')
  const [pengurusPickerOpen, setPengurusPickerOpen] = useState(false)
  const [status, setStatus] = useState('aktif')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lembagaSorted = useMemo(() => {
    const arr = Array.isArray(lembagaList) ? [...lembagaList] : []
    return arr.sort((a, b) => String(a.nama || a.id || '').localeCompare(String(b.nama || b.id || ''), 'id'))
  }, [lembagaList])

  const rombelFiltered = useMemo(() => {
    if (!idLembaga) return []
    const arr = Array.isArray(rombelList) ? rombelList.filter((r) => String(r.lembaga_id) === String(idLembaga)) : []
    const filtered = arr.filter((r) => isRombelAktif(r) || (originalRombelId && String(r.id) === originalRombelId))
    return [...filtered].sort((a, b) => rombelLabelDalamLembaga(a).localeCompare(rombelLabelDalamLembaga(b), 'id'))
  }, [rombelList, idLembaga, originalRombelId])

  useEffect(() => {
    if (!isOpen) {
      setPengurusPickerOpen(false)
      return
    }
    setError('')
    setPengurusPickerOpen(false)
    if (record?.id) {
      setIdLembaga(record.lembaga_id != null && record.lembaga_id !== '' ? String(record.lembaga_id) : '')
      setIdRombel(record.id_rombel != null ? String(record.id_rombel) : '')
      setIdLembagaKitab(record.id_lembaga_kitab != null ? String(record.id_lembaga_kitab) : '')
      setPola(record.pola === 'bulanan' || record.pola === 'opsional' ? record.pola : 'mingguan')
      setHari(record.hari != null && record.hari !== '' ? String(record.hari) : '')
      setTanggalBulan(record.tanggal_bulan != null && record.tanggal_bulan !== '' ? String(record.tanggal_bulan) : '')
      setTanggal(record.tanggal ? String(record.tanggal).slice(0, 10) : '')
      setJamMulai(toTimeInput(record.jam_mulai))
      setJamSelesai(toTimeInput(record.jam_selesai))
      setJamJenis(normalizeJamJenis(record.jam_jenis))
      setIdPengurus(record.id_pengurus != null ? String(record.id_pengurus) : '')
      setPengurusNama(pengurusDisplayName(record))
      setStatus(record.status === 'nonaktif' ? 'nonaktif' : 'aktif')
    } else {
      setIdLembaga('')
      setIdRombel('')
      setIdLembagaKitab('')
      setMapelOptions([])
      setPola('mingguan')
      setHari('')
      setTanggalBulan('')
      setTanggal('')
      setJamMulai('')
      setJamSelesai('')
      setJamJenis('wib')
      setIdPengurus('')
      setPengurusNama('')
      setStatus('aktif')
    }
  }, [isOpen, record])

  useEffect(() => {
    if (!isOpen || !idRombel) {
      if (!idRombel) setMapelOptions([])
      return
    }
    let cancelled = false
    const load = async () => {
      setMapelLoading(true)
      try {
        const res = await mapelAPI.getList({ id_rombel: idRombel, limit: 500, page: 1 })
        if (cancelled) return
        const rows = res?.success && Array.isArray(res.data) ? res.data : []
        setMapelOptions(rows)
      } catch {
        if (!cancelled) setMapelOptions([])
      } finally {
        if (!cancelled) setMapelLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOpen, idRombel])

  const handleLembagaChange = (next) => {
    setIdLembaga(next)
    setIdRombel('')
    setIdLembagaKitab('')
    setIdPengurus('')
    setPengurusNama('')
  }

  const handleRombelChange = (next) => {
    setIdRombel(next)
    setIdLembagaKitab('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!idLembaga) {
      setError('Pilih lembaga')
      return
    }
    const rid = parseInt(idRombel, 10)
    if (!rid) {
      setError('Pilih rombel')
      return
    }
    const mid = parseInt(idLembagaKitab, 10)
    if (!mid) {
      setError('Pilih mapel')
      return
    }
    const pid = parseInt(idPengurus, 10)
    if (!pid) {
      setError('Pilih pengajar')
      return
    }
    if (!jamMulai || !jamSelesai) {
      setError('Isi jam mulai dan jam selesai')
      return
    }

    const payload = {
      id_lembaga_kitab: mid,
      id_pengurus: pid,
      pola,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
      jam_jenis: normalizeJamJenis(jamJenis),
      status: status || 'aktif',
      hari: null,
      tanggal_bulan: null,
      tanggal: null
    }

    if (pola === 'mingguan') {
      const h = parseInt(hari, 10)
      if (!h || h < 1 || h > 7) {
        setError('Pilih hari')
        return
      }
      payload.hari = h
    } else if (pola === 'bulanan') {
      const t = parseInt(tanggalBulan, 10)
      if (!t || t < 1 || t > 31) {
        setError('Pilih tanggal 1–31')
        return
      }
      payload.tanggal_bulan = t
    } else {
      if (!tanggal) {
        setError('Pilih tanggal tertentu')
        return
      }
      payload.tanggal = tanggal
    }

    setLoading(true)
    try {
      const res = isEdit
        ? await kurikulumJadwalAPI.update(record.id, payload)
        : await kurikulumJadwalAPI.create(payload)
      if (!res?.success) {
        setError(res?.message || 'Gagal menyimpan')
        return
      }
      onSuccess?.(isEdit ? { mode: 'edit', data: res.data } : { mode: 'create', data: res.data })
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setPengurusPickerOpen(false)
    setError('')
    onClose()
  }

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="jadwal-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10210]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="jadwal-oc-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-[10211] flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jadwal-form-title"
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 id="jadwal-form-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEdit ? 'Edit Jadwal' : 'Tambah Jadwal'}
              </h2>
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

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="jadwal-lembaga" className={labelClass}>
                    Lembaga <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="jadwal-lembaga"
                    value={idLembaga}
                    onChange={(e) => handleLembagaChange(e.target.value)}
                    className={selectClass}
                    required
                    style={SELECT_BG}
                  >
                    <option value="">— Pilih lembaga —</option>
                    {lembagaSorted.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        {l.nama || l.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="jadwal-rombel" className={labelClass}>
                    Rombel <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="jadwal-rombel"
                    value={idRombel}
                    onChange={(e) => handleRombelChange(e.target.value)}
                    className={selectClass}
                    required
                    disabled={!idLembaga}
                    style={SELECT_BG}
                  >
                    <option value="">{idLembaga ? '— Pilih rombel —' : 'Pilih lembaga terlebih dahulu'}</option>
                    {rombelFiltered.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {rombelLabelDalamLembaga(r)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="jadwal-mapel" className={labelClass}>
                    Mapel <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="jadwal-mapel"
                    value={idLembagaKitab}
                    onChange={(e) => setIdLembagaKitab(e.target.value)}
                    className={selectClass}
                    required
                    disabled={!idRombel || mapelLoading}
                    style={SELECT_BG}
                  >
                    <option value="">
                      {!idRombel
                        ? 'Pilih rombel terlebih dahulu'
                        : mapelLoading
                          ? 'Memuat mapel…'
                          : '— Pilih mapel —'}
                    </option>
                    {mapelOptions.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        {mapelOptionLabel(m)}
                      </option>
                    ))}
                  </select>
                  {idRombel && !mapelLoading && mapelOptions.length === 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Belum ada mapel di rombel ini. Tambahkan di tab Mapel.
                    </p>
                  )}
                </div>

                <div>
                  <p className={labelClass}>
                    Pola <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { value: 'mingguan', label: 'Per minggu (pilih hari)' },
                      { value: 'bulanan', label: 'Per bulan (pilih tanggal 1–31)' },
                      { value: 'opsional', label: 'Opsional (tanggal tertentu)' }
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer ${
                          pola === opt.value
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="jadwal-pola"
                          value={opt.value}
                          checked={pola === opt.value}
                          onChange={() => setPola(opt.value)}
                          className="text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-100">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {pola === 'mingguan' && (
                  <div>
                    <label htmlFor="jadwal-hari" className={labelClass}>
                      Hari <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="jadwal-hari"
                      value={hari}
                      onChange={(e) => setHari(e.target.value)}
                      className={selectClass}
                      required
                      style={SELECT_BG}
                    >
                      <option value="">— Pilih hari —</option>
                      {HARI_OPTIONS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {pola === 'bulanan' && (
                  <div>
                    <label htmlFor="jadwal-tgl-bulan" className={labelClass}>
                      Tanggal tiap bulan <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="jadwal-tgl-bulan"
                      value={tanggalBulan}
                      onChange={(e) => setTanggalBulan(e.target.value)}
                      className={selectClass}
                      required
                      style={SELECT_BG}
                    >
                      <option value="">— Pilih tanggal —</option>
                      {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {pola === 'opsional' && (
                  <div>
                    <label htmlFor="jadwal-tanggal" className={labelClass}>
                      Tanggal tertentu <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="jadwal-tanggal"
                      type="date"
                      value={tanggal}
                      onChange={(e) => setTanggal(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <JamJenisToggle value={normalizeJamJenis(jamJenis)} onChange={setJamJenis} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="jadwal-jam-mulai" className={labelClass}>
                        Jam mulai ({normalizeJamJenis(jamJenis) === 'istiwa' ? 'Istiwa’' : 'WIB'}){' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="jadwal-jam-mulai"
                        type="time"
                        value={jamMulai}
                        onChange={(e) => setJamMulai(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="jadwal-jam-selesai" className={labelClass}>
                        Jam selesai ({normalizeJamJenis(jamJenis) === 'istiwa' ? 'Istiwa’' : 'WIB'}){' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="jadwal-jam-selesai"
                        type="time"
                        value={jamSelesai}
                        onChange={(e) => setJamSelesai(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Pengajar <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap items-stretch gap-2">
                    <div className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
                      {idPengurus && pengurusNama ? (
                        <p className="text-gray-900 dark:text-gray-100 font-medium truncate">{pengurusNama}</p>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Belum dipilih — buka Cari pengurus</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPengurusPickerOpen(true)}
                      disabled={loading || !idLembaga}
                      className="shrink-0 rounded-xl border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-500 dark:bg-teal-900/30 dark:text-teal-200 dark:hover:bg-teal-900/50 disabled:opacity-50"
                    >
                      Cari pengurus
                    </button>
                    {idPengurus ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIdPengurus('')
                          setPengurusNama('')
                        }}
                        disabled={loading}
                        className="shrink-0 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
                        title="Hapus pilihan"
                      >
                        Hapus
                      </button>
                    ) : null}
                  </div>
                  {!idLembaga && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pilih lembaga dulu agar daftar pengurus sesuai lembaga.</p>
                  )}
                </div>

                <div>
                  <label htmlFor="jadwal-status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="jadwal-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={selectClass}
                    style={SELECT_BG}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="flex-shrink-0 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-white dark:bg-gray-800 rounded-bl-2xl">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {createPortal(panel, document.body)}
      <CariPengurusOffcanvas
        isOpen={pengurusPickerOpen}
        onClose={() => setPengurusPickerOpen(false)}
        title="Cari Pengurus"
        lembagaId={idLembaga || undefined}
        onSelect={(p) => {
          if (!p?.id) return
          setIdPengurus(String(p.id))
          setPengurusNama(pengurusDisplayName(p) || `Pengurus #${p.id}`)
          setPengurusPickerOpen(false)
        }}
      />
    </>
  )
}
