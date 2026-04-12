import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { geocodeAPI } from '../../../services/api'

const transition = { type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }

function parseLatLng(latStr, lngStr) {
  const lat = parseFloat(String(latStr).replace(',', '.'))
  const lng = parseFloat(String(lngStr).replace(',', '.'))
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export default function AbsenLokasiOffcanvas({
  isOpen,
  onClose,
  title,
  form,
  setForm,
  saving,
  deleting,
  onSave,
  onDelete,
  canEdit,
  canDelete,
  isEdit,
  scopeAll,
  lembagaPilihan
}) {
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr] = useState('')
  const debounceRef = useRef(null)
  const seqRef = useRef(0)

  const fillFromGeolocation = useCallback((opts) => {
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
  }, [setForm])

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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!isOpen) {
      setPreview(null)
      setPreviewLoading(false)
      setPreviewErr('')
      return
    }
    const parsed = parseLatLng(form.latitude, form.longitude)
    if (!parsed) {
      setPreview(null)
      setPreviewLoading(false)
      setPreviewErr('')
      return
    }
    setPreviewLoading(true)
    setPreviewErr('')
    debounceRef.current = setTimeout(() => {
      const mySeq = ++seqRef.current
      ;(async () => {
        try {
          const res = await geocodeAPI.reverse({ lat: parsed.lat, lng: parsed.lng })
          if (mySeq !== seqRef.current) return
          if (!res?.success || !res.data) {
            setPreview(null)
            setPreviewErr(res?.message || 'Alamat tidak dapat dimuat')
            return
          }
          setPreview(res.data)
          setPreviewErr('')
        } catch (e) {
          if (mySeq !== seqRef.current) return
          setPreview(null)
          setPreviewErr(e?.response?.data?.message || e?.message || 'Gagal memuat alamat')
        } finally {
          if (mySeq === seqRef.current) setPreviewLoading(false)
        }
      })()
    }, 500)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [isOpen, form.latitude, form.longitude])

  const disabledForm = !canEdit || saving || deleting
  const showDelete = isEdit && canDelete

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="absen-lokasi-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={() => !saving && !deleting && onClose()}
            className="fixed inset-0 bg-black/50 z-[200]"
          />
          <motion.div
            key="absen-lokasi-oc-panel"
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
                disabled={saving || deleting}
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
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Nama</label>
                <input
                  value={form.nama}
                  disabled={disabledForm}
                  onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                />
              </div>
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
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Latitude</label>
                  <input
                    value={form.latitude}
                    disabled={disabledForm}
                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Longitude</label>
                  <input
                    value={form.longitude}
                    disabled={disabledForm}
                    onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                    className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 font-mono disabled:opacity-60"
                  />
                </div>
              </div>
              {(previewLoading || preview || previewErr) && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs space-y-1">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Pratinjau wilayah</p>
                  {previewLoading && <p className="text-gray-500">Memuat…</p>}
                  {!previewLoading && previewErr && (
                    <p className="text-amber-600 dark:text-amber-400">{previewErr}</p>
                  )}
                  {!previewLoading && preview && (
                    <ul className="space-y-0.5 text-gray-700 dark:text-gray-200">
                      {preview.desa ? (
                        <li>
                          <span className="text-gray-500 dark:text-gray-400">Desa/kelurahan:</span> {preview.desa}
                        </li>
                      ) : null}
                      {preview.kecamatan ? (
                        <li>
                          <span className="text-gray-500 dark:text-gray-400">Kecamatan:</span> {preview.kecamatan}
                        </li>
                      ) : null}
                      {preview.kota ? (
                        <li>
                          <span className="text-gray-500 dark:text-gray-400">Kota/kabupaten:</span> {preview.kota}
                        </li>
                      ) : null}
                      {preview.provinsi ? (
                        <li>
                          <span className="text-gray-500 dark:text-gray-400">Provinsi:</span> {preview.provinsi}
                        </li>
                      ) : null}
                      {!preview.desa && !preview.kecamatan && !preview.kota && !preview.provinsi && preview.display_name ? (
                        <li className="text-gray-600 dark:text-gray-300 leading-snug">{preview.display_name}</li>
                      ) : null}
                    </ul>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Radius (meter)</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  disabled={disabledForm}
                  value={form.radius_meter}
                  onChange={(e) => setForm((f) => ({ ...f, radius_meter: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                />
              </div>
              {(scopeAll || lembagaPilihan.length > 0) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Lembaga {scopeAll ? '(kosong = semua)' : ''}
                  </label>
                  <select
                    value={form.id_lembaga}
                    disabled={disabledForm}
                    onChange={(e) => setForm((f) => ({ ...f, id_lembaga: e.target.value }))}
                    className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                  >
                    {scopeAll && <option value="">Semua lembaga</option>}
                    {lembagaPilihan.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        {l.nama || l.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  id="absen-lok-oc-aktif"
                  type="checkbox"
                  disabled={disabledForm}
                  checked={form.aktif}
                  onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="absen-loc-oc-aktif" className="text-sm text-gray-700 dark:text-gray-200">
                  Aktif
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Urutan</label>
                <input
                  type="number"
                  disabled={disabledForm}
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
              {showDelete && (
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={onDelete}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  {deleting ? 'Menghapus…' : 'Hapus lokasi'}
                </button>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
                >
                  Tutup
                </button>
                {canEdit && (
                  <button
                    type="button"
                    disabled={saving || deleting}
                    onClick={onSave}
                    className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan…' : 'Simpan'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
