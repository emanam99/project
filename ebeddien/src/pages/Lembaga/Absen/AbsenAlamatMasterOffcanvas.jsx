import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const transition = { type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }

/**
 * Offcanvas kanan: tambah / ubah master alamat absen (zona GPS opsional).
 */
export default function AbsenAlamatMasterOffcanvas({
  isOpen,
  onClose,
  title,
  form,
  setForm,
  saving,
  onSave,
  canEdit,
  isEdit = false,
  canDelete = false,
  deletingAlamat = false,
  onRequestDelete
}) {
  const disabledForm = !canEdit || saving || deletingAlamat
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState('')

  const fillFromGeolocation = useCallback(
    (opts) => {
      if (!navigator.geolocation) {
        setGeoErr('Geolokasi tidak didukung')
        return
      }
      setGeoErr('')
      setGeoBusy(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoBusy(false)
          setForm((f) => ({
            ...f,
            latitude: String(pos.coords.latitude),
            longitude: String(pos.coords.longitude)
          }))
        },
        (err) => {
          setGeoBusy(false)
          setGeoErr(err.message || 'Tidak dapat mengambil lokasi')
        },
        opts
      )
    },
    [setForm]
  )

  const handleAmbilGps = () => {
    fillFromGeolocation({
      enableHighAccuracy: true,
      maximumAge: 120000,
      timeout: 20000
    })
  }

  const handleReloadAkurat = () => {
    fillFromGeolocation({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 35000
    })
  }

  useEffect(() => {
    if (!isOpen) {
      setGeoErr('')
      setGeoBusy(false)
    }
  }, [isOpen])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="absen-alamat-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={() => !saving && !deletingAlamat && onClose()}
            className="fixed inset-0 bg-black/50 z-[200]"
          />
          <motion.div
            key="absen-alamat-oc-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={transition}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0 gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
              <button
                type="button"
                disabled={saving || deletingAlamat}
                onClick={onClose}
                className="shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30 p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Isian alamat</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Minimal satu bagian (mis. desa atau kecamatan) harus terisi.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Dusun
                    </label>
                    <input
                      value={form.dusun ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, dusun: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">RT</label>
                      <input
                        value={form.rt ?? ''}
                        disabled={disabledForm}
                        onChange={(e) => setForm((f) => ({ ...f, rt: e.target.value }))}
                        className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">RW</label>
                      <input
                        value={form.rw ?? ''}
                        disabled={disabledForm}
                        onChange={(e) => setForm((f) => ({ ...f, rw: e.target.value }))}
                        className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Desa / kelurahan
                    </label>
                    <input
                      value={form.desa ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, desa: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Kecamatan
                    </label>
                    <input
                      value={form.kecamatan ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, kecamatan: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Kabupaten / kota
                    </label>
                    <input
                      value={form.kabupaten ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, kabupaten: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Provinsi
                    </label>
                    <input
                      value={form.provinsi ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, provinsi: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-teal-300/70 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/25 p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Zona GPS bersama (opsional)</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Bila latitude dan longitude diisi, absen mandiri dan pratinjau alamat memakai pusat dan jangkauan di
                  sini (sampai 25 km). Kosongkan ketiganya bila cukup teks alamat saja — titik lokasi tetap punya
                  koordinat sendiri.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabledForm || geoBusy}
                    onClick={handleAmbilGps}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {geoBusy ? 'Mengambil…' : 'Isi dari lokasi saat ini'}
                  </button>
                  <button
                    type="button"
                    disabled={disabledForm || geoBusy}
                    onClick={handleReloadAkurat}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-600 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50"
                  >
                    Muat ulang (akurat)
                  </button>
                </div>
                {geoErr && <p className="text-xs text-amber-600 dark:text-amber-400">{geoErr}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Latitude
                    </label>
                    <input
                      value={form.latitude ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 font-mono disabled:opacity-60"
                      placeholder="-7.xxx"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                      Longitude
                    </label>
                    <input
                      value={form.longitude ?? ''}
                      disabled={disabledForm}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 font-mono disabled:opacity-60"
                      placeholder="110.xxx"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Jangkauan (meter)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={25000}
                    value={form.radius_meter === '' || form.radius_meter == null ? '' : form.radius_meter}
                    disabled={disabledForm}
                    onChange={(e) => setForm((f) => ({ ...f, radius_meter: e.target.value }))}
                    className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    placeholder="100"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={saving || deletingAlamat}
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
              >
                Tutup
              </button>
              {isEdit && canDelete && typeof onRequestDelete === 'function' && (
                <button
                  type="button"
                  disabled={saving || deletingAlamat}
                  onClick={() => onRequestDelete()}
                  title="Hapus master alamat"
                  className="px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  {deletingAlamat ? 'Menghapus…' : 'Hapus'}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  disabled={saving || deletingAlamat}
                  onClick={() => void onSave()}
                  className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
