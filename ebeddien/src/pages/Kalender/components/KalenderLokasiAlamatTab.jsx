import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { absenAlamatAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import AbsenAlamatMasterOffcanvas from '../../Lembaga/Absen/AbsenAlamatMasterOffcanvas'

function alamatMasterSatuBaris(a) {
  const rtRw =
    a.rt && a.rw ? `RT ${a.rt} RW ${a.rw}` : a.rt ? `RT ${a.rt}` : a.rw ? `RW ${a.rw}` : ''
  const s = [a.dusun, rtRw, a.desa, a.kecamatan, a.kabupaten, a.provinsi].filter(Boolean).join(', ')
  const hasGps =
    a.latitude != null &&
    a.longitude != null &&
    String(a.latitude).trim() !== '' &&
    String(a.longitude).trim() !== ''
  const rm = Number(a.radius_meter)
  const gps = hasGps ? ` · zona GPS ~${Number.isFinite(rm) && rm > 0 ? rm : 100} m` : ''

  return (s || '—') + gps
}

function normWilayah(v) {
  return String(v ?? '').trim()
}

function uniqueWilayah(list, key) {
  const map = new Map()
  for (const r of list) {
    const raw = normWilayah(r[key])
    if (!raw) continue
    const k = raw.toLowerCase()
    if (!map.has(k)) map.set(k, raw)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'id'))
}

const emptyAlamatForm = {
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  latitude: '',
  longitude: '',
  radius_meter: ''
}

const emptyWilayahFilter = {
  provinsi: '',
  kabupaten: '',
  kecamatan: '',
  desa: ''
}

/**
 * Daftar alamat umum (nama + lat/lng). Dipakai pratinjau lokasi semua user, termasuk tanpa akses absen.
 */
export default function KalenderLokasiAlamatTab() {
  const { showNotification } = useNotification()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [ocOpen, setOcOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyAlamatForm)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [wilayahFilter, setWilayahFilter] = useState(emptyWilayahFilter)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await absenAlamatAPI.getList()
      if (res?.success) setRows(Array.isArray(res.data) ? res.data : [])
      else {
        setRows([])
        if (res?.message) showNotification(res.message, 'error')
      }
    } catch (e) {
      setRows([])
      showNotification(e.response?.data?.message || e.message || 'Gagal memuat daftar alamat', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    void load()
  }, [load])

  const rowsByProvinsi = useMemo(() => {
    if (!wilayahFilter.provinsi) return rows
    const p = wilayahFilter.provinsi.toLowerCase()
    return rows.filter((r) => normWilayah(r.provinsi).toLowerCase() === p)
  }, [rows, wilayahFilter.provinsi])

  const rowsByKabupaten = useMemo(() => {
    if (!wilayahFilter.kabupaten) return rowsByProvinsi
    const k = wilayahFilter.kabupaten.toLowerCase()
    return rowsByProvinsi.filter((r) => normWilayah(r.kabupaten).toLowerCase() === k)
  }, [rowsByProvinsi, wilayahFilter.kabupaten])

  const rowsByKecamatan = useMemo(() => {
    if (!wilayahFilter.kecamatan) return rowsByKabupaten
    const k = wilayahFilter.kecamatan.toLowerCase()
    return rowsByKabupaten.filter((r) => normWilayah(r.kecamatan).toLowerCase() === k)
  }, [rowsByKabupaten, wilayahFilter.kecamatan])

  const provinsiOpts = useMemo(() => uniqueWilayah(rows, 'provinsi'), [rows])
  const kabupatenOpts = useMemo(() => uniqueWilayah(rowsByProvinsi, 'kabupaten'), [rowsByProvinsi])
  const kecamatanOpts = useMemo(() => uniqueWilayah(rowsByKabupaten, 'kecamatan'), [rowsByKabupaten])
  const desaOpts = useMemo(() => uniqueWilayah(rowsByKecamatan, 'desa'), [rowsByKecamatan])

  const filteredRows = useMemo(() => {
    let list = rowsByKecamatan
    if (wilayahFilter.desa) {
      const d = wilayahFilter.desa.toLowerCase()
      list = list.filter((r) => normWilayah(r.desa).toLowerCase() === d)
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => {
      const hay = [
        r.id,
        r.dusun,
        r.rt,
        r.rw,
        r.desa,
        r.kecamatan,
        r.kabupaten,
        r.provinsi,
        r.latitude,
        r.longitude,
        alamatMasterSatuBaris(r)
      ]
        .filter((x) => x != null && String(x).trim() !== '')
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rowsByKecamatan, wilayahFilter.desa, searchQuery])

  const setFilterField = (field, value) => {
    setWilayahFilter((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'provinsi') {
        next.kabupaten = ''
        next.kecamatan = ''
        next.desa = ''
      } else if (field === 'kabupaten') {
        next.kecamatan = ''
        next.desa = ''
      } else if (field === 'kecamatan') {
        next.desa = ''
      }
      return next
    })
  }

  const resetFilter = useCallback(() => {
    setSearchQuery('')
    setWilayahFilter({ ...emptyWilayahFilter })
  }, [])

  const tutupOc = useCallback(() => {
    if (saving || deletingId !== null) return
    setDeleteConfirm(null)
    setOcOpen(false)
  }, [saving, deletingId])

  const bukaTambah = () => {
    setEditingId(null)
    setForm({ ...emptyAlamatForm })
    setOcOpen(true)
  }

  const bukaDariBaris = (a) => {
    setEditingId(Number(a.id))
    setForm({
      dusun: a.dusun != null ? String(a.dusun) : '',
      rt: a.rt != null ? String(a.rt) : '',
      rw: a.rw != null ? String(a.rw) : '',
      desa: a.desa != null ? String(a.desa) : '',
      kecamatan: a.kecamatan != null ? String(a.kecamatan) : '',
      kabupaten: a.kabupaten != null ? String(a.kabupaten) : '',
      provinsi: a.provinsi != null ? String(a.provinsi) : '',
      latitude: a.latitude != null && String(a.latitude).trim() !== '' ? String(a.latitude) : '',
      longitude: a.longitude != null && String(a.longitude).trim() !== '' ? String(a.longitude) : '',
      radius_meter:
        a.radius_meter != null && String(a.radius_meter).trim() !== '' ? String(a.radius_meter) : ''
    })
    setOcOpen(true)
  }

  const simpan = async () => {
    const keys = ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi']
    const punyaIsian = keys.some((k) => String(form[k] ?? '').trim().length > 0)
    if (!punyaIsian) {
      showNotification('Isi minimal satu bagian alamat', 'error')
      return
    }
    const lat = String(form.latitude ?? '').trim()
    const lng = String(form.longitude ?? '').trim()
    if (!lat || !lng) {
      showNotification('Latitude dan longitude wajib diisi', 'error')
      return
    }
    const body = {
      dusun: form.dusun?.trim() || null,
      rt: form.rt?.trim() || null,
      rw: form.rw?.trim() || null,
      desa: form.desa?.trim() || null,
      kecamatan: form.kecamatan?.trim() || null,
      kabupaten: form.kabupaten?.trim() || null,
      provinsi: form.provinsi?.trim() || null,
      latitude: lat,
      longitude: lng,
      radius_meter: String(form.radius_meter ?? '').trim()
    }
    setSaving(true)
    try {
      const res =
        editingId != null ? await absenAlamatAPI.update(editingId, body) : await absenAlamatAPI.create(body)
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        setOcOpen(false)
        void load()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openConfirmHapus = useCallback(() => {
    if (editingId == null) return
    const id = Number(editingId)
    if (!Number.isFinite(id) || id <= 0) return
    setDeleteConfirm({ id, ringkas: alamatMasterSatuBaris(form) })
  }, [editingId, form])

  const executeHapus = async () => {
    if (!deleteConfirm) return
    const id = deleteConfirm.id
    setDeleteConfirm(null)
    setDeletingId(id)
    try {
      const res = await absenAlamatAPI.delete(id)
      if (res?.success) {
        showNotification(res.message || 'Alamat dihapus', 'success')
        setOcOpen(false)
        setEditingId(null)
        void load()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menghapus', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const deleteBusy = deletingId !== null
  const selectClass =
    'h-7 min-w-0 flex-1 rounded border border-gray-300 bg-white p-1 text-xs text-gray-900 focus:ring-1 focus:ring-teal-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative px-4 pb-2 pt-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="w-full bg-transparent p-2 pr-20 text-gray-900 placeholder-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder-gray-400"
              placeholder="Cari"
              autoComplete="off"
              aria-label="Cari alamat"
            />
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex items-center pr-1">
              <button
                type="button"
                onClick={() => setIsFilterOpen((v) => !v)}
                className="pointer-events-auto flex items-center gap-1 rounded bg-gray-100 p-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                {isFilterOpen ? (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
          <div
            className={`absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 transition-opacity ${
              isSearchFocused ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50"
            >
              <div className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={wilayahFilter.provinsi}
                    onChange={(e) => setFilterField('provinsi', e.target.value)}
                    className={selectClass}
                    aria-label="Filter provinsi"
                  >
                    <option value="">Provinsi</option>
                    {provinsiOpts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <select
                    value={wilayahFilter.kabupaten}
                    onChange={(e) => setFilterField('kabupaten', e.target.value)}
                    className={selectClass}
                    aria-label="Filter kabupaten"
                  >
                    <option value="">Kabupaten / kota</option>
                    {kabupatenOpts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <select
                    value={wilayahFilter.kecamatan}
                    onChange={(e) => setFilterField('kecamatan', e.target.value)}
                    className={selectClass}
                    aria-label="Filter kecamatan"
                  >
                    <option value="">Kecamatan</option>
                    {kecamatanOpts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <select
                    value={wilayahFilter.desa}
                    onChange={(e) => setFilterField('desa', e.target.value)}
                    className={selectClass}
                    aria-label="Filter desa"
                  >
                    <option value="">Desa / kelurahan</option>
                    {desaOpts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={resetFilter}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    title="Reset filter"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                      />
                    </svg>
                    Reset filter
                  </button>
                  <span className="text-xs font-medium tabular-nums text-gray-700 dark:text-gray-200">
                    {filteredRows.length}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex justify-end border-t border-gray-200 px-4 py-2 dark:border-gray-700">
          <button
            type="button"
            onClick={bukaTambah}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-teal-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Tambah alamat
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada entri alamat.</p>
        ) : filteredRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Tidak ada alamat yang sesuai dengan pencarian atau filter.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/80" aria-label="Daftar alamat">
            {filteredRows.map((a) => (
              <li key={a.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => bukaDariBaris(a)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      bukaDariBaris(a)
                    }
                  }}
                  className="px-4 py-2.5 text-left w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                >
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400">#{a.id}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 break-words">
                    {alamatMasterSatuBaris(a)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AbsenAlamatMasterOffcanvas
        isOpen={ocOpen}
        onClose={tutupOc}
        title={editingId != null ? 'Ubah alamat' : 'Tambah alamat'}
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={simpan}
        canEdit
        isEdit={editingId != null}
        canDelete={editingId != null}
        deletingAlamat={deletingId === editingId && editingId != null}
        onRequestDelete={openConfirmHapus}
      />

      {deleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" role="presentation">
            <button
              type="button"
              aria-label="Tutup"
              disabled={deleteBusy}
              className="absolute inset-0 bg-black/50 backdrop-blur-[1px] disabled:cursor-not-allowed"
              onClick={() => !deleteBusy && setDeleteConfirm(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="kal-alamat-del-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800"
            >
              <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
                <h3 id="kal-alamat-del-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Hapus alamat?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  #{deleteConfirm.id}:{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{deleteConfirm.ringkas}</span>
                  <br />
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    Hanya bisa dihapus jika tidak ada titik absen yang menaut ke alamat ini.
                  </span>
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => void executeHapus()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </div>
  )
}
