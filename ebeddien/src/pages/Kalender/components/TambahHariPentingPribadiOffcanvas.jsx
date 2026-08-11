import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import PickDateHijri from '../../../components/PickDateHijri/PickDateHijri'
import { kalenderAPI, hariPentingAPI } from '../../../services/api'
import '../Kalender.css'

/** Selaras KalenderPengaturan.jsx */
const TIPE_OPTIONS = [
  { value: 'per_hari', label: 'Per Hari' },
  { value: 'per_pekan', label: 'Per Pekan' },
  { value: 'per_bulan', label: 'Per Bulan' },
  { value: 'per_tahun', label: 'Per Tahun' },
  { value: 'sekali', label: 'Sekali' },
  { value: 'dari_sampai', label: 'Dari–sampai' }
]

const KATEGORI_OPTIONS = [
  { value: 'hijriyah', label: 'Hijriyah' },
  { value: 'masehi', label: 'Masehi' }
]

const WARNA_LABEL_OPTIONS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#84cc16', '#a855f7',
  '#0ea5e9', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#db2777'
]

function ymdMasehi(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function ymdHijri(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Offcanvas kanan — struktur & kelas sama seperti form Hari Penting di KalenderPengaturan.
 * Target audiens tetap kunci: hanya diri sendiri (API personal-self).
 */
export default function TambahHariPentingPribadiOffcanvas({ open, payload, onClose, onSaved }) {
  const colorPickerInputRef = useRef(null)
  const [entered, setEntered] = useState(false)
  const [exiting, setExiting] = useState(false)

  const [nama_event, setNamaEvent] = useState('')
  const [kategori, setKategori] = useState('hijriyah')
  const [tipe, setTipe] = useState('sekali')
  const [tanggal, setTanggal] = useState('')
  const [bulan, setBulan] = useState('')
  const [tahun, setTahun] = useState('')
  const [tanggal_dari, setTanggalDari] = useState('')
  const [tanggal_sampai, setTanggalSampai] = useState('')
  const [warna_label, setWarnaLabel] = useState('#3b82f6')
  const [keterangan, setKeterangan] = useState('')
  const [ada_jam, setAdaJam] = useState(false)
  const [jam_mulai, setJamMulai] = useState('')
  const [jam_selesai, setJamSelesai] = useState('')
  const [aktif, setAktif] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const snapGreg = payload?.gregorian
  const snapHijri = payload?.hijri

  const applyTripleForKategori = useCallback(
    async (kat) => {
      if (kat === 'masehi' && snapGreg) {
        setTanggal(String(snapGreg.day))
        setBulan(String(snapGreg.month))
        setTahun(String(snapGreg.year))
        return
      }
      if (kat === 'hijriyah' && snapHijri && snapHijri.year != null) {
        setTanggal(String(snapHijri.day))
        setBulan(String(snapHijri.month))
        setTahun(String(snapHijri.year))
        return
      }
      if (kat === 'hijriyah' && snapGreg) {
        const iso = ymdMasehi(snapGreg.year, snapGreg.month, snapGreg.day)
        try {
          const res = await kalenderAPI.get({ action: 'convert', tanggal: iso, waktu: '12:00:00' })
          const h = res?.hijriyah
          if (h && h !== '0000-00-00' && typeof h === 'string') {
            const [hy, hm, hd] = h.split('-').map((x) => parseInt(x, 10))
            setTanggal(String(hd))
            setBulan(String(hm))
            setTahun(String(hy))
            return
          }
        } catch {
          /* fallthrough */
        }
      }
      if (kat === 'masehi' && snapHijri && snapHijri.year != null) {
        const hYmd = ymdHijri(snapHijri.year, snapHijri.month, snapHijri.day)
        try {
          const res = await kalenderAPI.get({ action: 'to_masehi', tanggal: hYmd })
          const m = res?.masehi
          if (m && typeof m === 'string') {
            const [y, mo, d] = m.split('-').map((x) => parseInt(x, 10))
            setTanggal(String(d))
            setBulan(String(mo))
            setTahun(String(y))
          }
        } catch {
          /* ignore */
        }
      }
    },
    [snapGreg, snapHijri]
  )

  useEffect(() => {
    if (!open) {
      setEntered(false)
      setExiting(false)
      return
    }
    setExiting(false)
    setError(null)
    setNamaEvent('')
    setKeterangan('')
    setAdaJam(false)
    setJamMulai('')
    setJamSelesai('')
    setWarnaLabel('#3b82f6')
    setAktif(true)
    setTipe('sekali')
    setTanggalDari('')
    setTanggalSampai('')
    const kat = payload?.defaultKategori === 'masehi' ? 'masehi' : 'hijriyah'
    setKategori(kat)
    void applyTripleForKategori(kat)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [open, payload, applyTripleForKategori])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const tutup = () => {
    setExiting(true)
  }

  const handlePanelTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (exiting) {
      setEntered(false)
      setExiting(false)
      onClose?.()
    }
  }

  const handleKategoriChange = (v) => {
    setKategori(v)
    setError(null)
    if (tipe === 'dari_sampai') {
      setTanggalDari('')
      setTanggalSampai('')
    } else {
      void applyTripleForKategori(v)
    }
  }

  const handleTipeChange = (tipeBaru) => {
    setTipe(tipeBaru)
    setError(null)
    if (tipeBaru === 'dari_sampai') {
      setTanggal('')
      setBulan('')
      setTahun('')
    } else {
      setTanggalDari('')
      setTanggalSampai('')
      if (tipeBaru === 'per_tahun') setTahun('')
      if (tipeBaru === 'per_bulan') setBulan('')
      void applyTripleForKategori(kategori)
    }
  }

  const isRange = tipe === 'dari_sampai'
  const saveDisabled =
    saving ||
    !nama_event.trim() ||
    (isRange && (!tanggal_dari || !tanggal_sampai)) ||
    (!!ada_jam && (!jam_mulai?.trim() || !jam_selesai?.trim()))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saveDisabled) return
    setError(null)
    setSaving(true)
    try {
      const body = {
        nama_event: nama_event.trim(),
        kategori,
        tipe,
        aktif: aktif ? 1 : 0
      }
      if (warna_label) body.warna_label = warna_label
      if (keterangan.trim()) body.keterangan = keterangan.trim()
      if (!isRange) {
        if (tanggal !== '') body.tanggal = parseInt(tanggal, 10)
        if (bulan !== '') body.bulan = parseInt(bulan, 10)
        if (tahun !== '') body.tahun = parseInt(tahun, 10)
      } else {
        body.tanggal_dari = tanggal_dari
        body.tanggal_sampai = tanggal_sampai
      }
      if (ada_jam) {
        body.jam_mulai = jam_mulai.trim()
        body.jam_selesai = jam_selesai.trim()
      }
      const res = await hariPentingAPI.createPersonalSelf(body)
      if (res?.error) {
        setError(typeof res.error === 'string' ? res.error : 'Gagal menyimpan')
        return
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (!open && !exiting) return null

  const panelOpen = entered && !exiting

  const el = (
    <>
      <div
        className={`fixed inset-0 z-[99998] bg-black/40 transition-opacity duration-300 ease-out ${
          panelOpen ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
        onClick={tutup}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Tambah Hari Penting"
        onTransitionEnd={handlePanelTransitionEnd}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Tambah Hari Penting</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Jadwal pribadi — hanya Anda yang melihat</p>
          </div>
          <button
            type="button"
            onClick={tutup}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4 space-y-3">
            {error && (
              <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nama Event</label>
              <input
                type="text"
                value={nama_event}
                onChange={(e) => setNamaEvent(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Kategori</label>
              <select
                value={kategori}
                onChange={(e) => handleKategoriChange(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
              >
                {KATEGORI_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tipe</label>
              <select
                value={tipe}
                onChange={(e) => handleTipeChange(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
              >
                {TIPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                isRange ? 'max-h-0 opacity-0' : 'max-h-[12rem] opacity-100'
              }`}
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tanggal</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  />
                </div>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                    tipe === 'per_bulan' ? 'max-h-0 opacity-0' : 'max-h-[4.5rem] opacity-100'
                  }`}
                >
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bulan</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={bulan}
                    onChange={(e) => setBulan(e.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  />
                </div>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                    tipe === 'per_tahun' ? 'max-h-0 opacity-0' : 'max-h-[4.5rem] opacity-100'
                  }`}
                >
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tahun</label>
                  <input
                    type="number"
                    value={tahun}
                    onChange={(e) => setTahun(e.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  />
                </div>
              </div>
            </div>

            {isRange && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tanggal disimpan sebagai Y-m-d sesuai kategori (Masehi atau Hijriyah).
                </p>
                {kategori === 'masehi' ? (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Dari (Masehi)</label>
                      <input
                        type="date"
                        value={tanggal_dari || ''}
                        onChange={(e) => setTanggalDari(e.target.value)}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Sampai (Masehi)</label>
                      <input
                        type="date"
                        value={tanggal_sampai || ''}
                        min={tanggal_dari || undefined}
                        onChange={(e) => setTanggalSampai(e.target.value)}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Dari (Hijriyah)</label>
                      <PickDateHijri
                        value={tanggal_dari || null}
                        onChange={(ymd) => setTanggalDari(ymd || '')}
                        max={tanggal_sampai || undefined}
                        placeholder="Pilih tanggal awal"
                        className="w-full"
                        inputClassName="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Sampai (Hijriyah)</label>
                      <PickDateHijri
                        value={tanggal_sampai || null}
                        onChange={(ymd) => setTanggalSampai(ymd || '')}
                        min={tanggal_dari || undefined}
                        placeholder="Pilih tanggal akhir"
                        className="w-full"
                        inputClassName="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Warna Label</label>
              <div className="flex flex-wrap gap-2 items-center">
                {(() => {
                  const current = warna_label || '#3b82f6'
                  const dipakai = WARNA_LABEL_OPTIONS.includes(current) ? WARNA_LABEL_OPTIONS : [current, ...WARNA_LABEL_OPTIONS]
                  return dipakai.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setWarnaLabel(hex)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                        (warna_label || '#3b82f6') === hex
                          ? 'border-gray-900 dark:border-white scale-110'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-500'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                      aria-label={`Pilih warna ${hex}`}
                    />
                  ))
                })()}
                <input
                  ref={colorPickerInputRef}
                  type="color"
                  value={warna_label || '#3b82f6'}
                  onChange={(e) => setWarnaLabel(e.target.value)}
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => colorPickerInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Tambah warna manual
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
              <textarea
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
              />
            </div>

            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/30">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!ada_jam}
                  onChange={(e) => {
                    const on = e.target.checked
                    setAdaJam(on)
                    if (!on) {
                      setJamMulai('')
                      setJamSelesai('')
                    }
                  }}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Cantumkan jam acara
                  <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                    Tampil di kalender sebagai jam mulai–selesai (opsional).
                  </span>
                </span>
              </label>
              {ada_jam && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">Jam mulai</label>
                    <input
                      type="time"
                      value={jam_mulai || ''}
                      onChange={(e) => setJamMulai(e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">Jam selesai</label>
                    <input
                      type="time"
                      value={jam_selesai || ''}
                      onChange={(e) => setJamSelesai(e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!aktif}
                onChange={(e) => setAktif(e.target.checked)}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
            </label>

            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/30">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Target audiens</div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Hanya saya (pembuat)
                <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                  Jadwal pribadi dari kalender — hanya akun Anda yang melihat. Tidak dapat diubah.
                </span>
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 shrink-0">
            <button
              type="submit"
              disabled={saveDisabled}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button type="button" onClick={tutup} className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary">
              Batal
            </button>
          </div>
        </form>
      </div>
    </>
  )

  return createPortal(el, document.body)
}
