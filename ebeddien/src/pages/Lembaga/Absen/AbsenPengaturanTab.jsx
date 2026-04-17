import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'
import { absenLokasiAPI, absenSettingAPI, lembagaAPI } from '../../../services/api'
import { useAbsenFiturAccess } from '../../../hooks/useAbsenFiturAccess'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import {
  SESI_LIST,
  effectiveJadwalSesi,
  mysqlTimeToInput,
  normalizeJadwalDefault,
  normalizeSidikDefault,
  fallbackJadwalDefault
} from '../../../utils/absenJadwal'
import { normalizeAksesMandiriFromApi } from '../../../utils/mandiriAkses'
import AbsenLokasiOffcanvas from './AbsenLokasiOffcanvas'
import AbsenDefaultSettingsCard from './AbsenDefaultSettingsCard'

function lokasiAlamatRingkas(r) {
  const parts = [r.desa, r.kecamatan, r.kabupaten].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function lokasiAlamatJudulTooltip(r) {
  const rtRw =
    r.rt && r.rw ? `RT ${r.rt} RW ${r.rw}` : r.rt ? `RT ${r.rt}` : r.rw ? `RW ${r.rw}` : ''
  return [r.dusun, rtRw, r.desa, r.kecamatan, r.kabupaten, r.provinsi].filter(Boolean).join(', ')
}

const emptyForm = {
  nama: '',
  latitude: '',
  longitude: '',
  radius_meter: 100,
  id_lembaga: '',
  aktif: true,
  sort_order: 0,
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  jam_mulai_pagi: '',
  jam_mulai_sore: '',
  jam_mulai_malam: ''
}

export default function AbsenPengaturanTab() {
  const user = useAuthStore((s) => s.user)
  const { showNotification } = useNotification()
  const absenFitur = useAbsenFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [lembagaOpts, setLembagaOpts] = useState([])
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [jadwalDefault, setJadwalDefault] = useState(() => fallbackJadwalDefault())
  const [sidikDefault, setSidikDefault] = useState(() => normalizeSidikDefault(null))
  const [aksesMandiri, setAksesMandiri] = useState(() => ({ role_keys: [] }))
  const [roleOptionsMandiri, setRoleOptionsMandiri] = useState(null)

  const isSuper = userHasSuperAdminAccess(user)
  const scopeAll = isSuper || user?.lembaga_scope_all === true
  const lembagaPilihan = useMemo(() => {
    if (scopeAll) return lembagaOpts
    const ids = new Set((user?.lembaga_ids || []).map((x) => String(x)))
    return lembagaOpts.filter((l) => ids.has(String(l.id)))
  }, [lembagaOpts, scopeAll, user?.lembaga_ids])

  const rowClickable =
    absenFitur.lokasiList && (absenFitur.lokasiUbah || absenFitur.lokasiHapus)

  const lembagaFilterOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((r) => {
      const key = r.id_lembaga == null || r.id_lembaga === '' ? '__global__' : String(r.id_lembaga)
      const label =
        key === '__global__'
          ? 'Semua lembaga'
          : r.lembaga_nama ||
            lembagaOpts.find((x) => String(x.id) === key)?.nama ||
            `ID ${key}`
      const prev = map.get(key)
      map.set(key, {
        value: key,
        label,
        count: (prev?.count || 0) + 1
      })
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.value === '__global__') return -1
      if (b.value === '__global__') return 1
      return String(a.label || '').localeCompare(String(b.label || ''), 'id')
    })
  }, [rows, lembagaOpts])

  const statusFilterOptions = useMemo(() => {
    let a = 0
    let n = 0
    rows.forEach((r) => {
      if (Number(r.aktif) === 1) a += 1
      else n += 1
    })
    return [
      { value: '1', label: 'Aktif', count: a },
      { value: '0', label: 'Nonaktif', count: n }
    ]
  }, [rows])

  const filteredRows = useMemo(() => {
    let list = rows
    if (statusFilter === '1') list = list.filter((r) => Number(r.aktif) === 1)
    else if (statusFilter === '0') list = list.filter((r) => Number(r.aktif) !== 1)
    if (lembagaFilter === '__global__') {
      list = list.filter((r) => r.id_lembaga == null || r.id_lembaga === '')
    } else if (lembagaFilter !== '') {
      list = list.filter((r) => String(r.id_lembaga ?? '') === lembagaFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => {
      const tip = lokasiAlamatJudulTooltip(r)
      const ring = lokasiAlamatRingkas(r)
      const jamBits = SESI_LIST.flatMap((sesi) => {
        const e = effectiveJadwalSesi(r, sesi, jadwalDefault)
        return [e.mulai]
      })
      const hay = [
        r.nama,
        r.lembaga_nama,
        String(r.latitude),
        String(r.longitude),
        String(r.radius_meter),
        String(r.id ?? ''),
        tip,
        ring,
        ...jamBits
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, searchQuery, lembagaFilter, statusFilter, jadwalDefault])

  const resetFilter = useCallback(() => {
    setSearchQuery('')
    setLembagaFilter('')
    setStatusFilter('')
  }, [])

  const needFetchLokasi = useMemo(() => {
    if (isSuper) return true
    if (!absenFitur.apiHasLokasiGranular) return true
    return (
      absenFitur.lokasiList ||
      absenFitur.lokasiTambah ||
      absenFitur.lokasiUbah ||
      absenFitur.lokasiHapus ||
      absenFitur.lokasiKelolaTerlihat
    )
  }, [
    isSuper,
    absenFitur.apiHasLokasiGranular,
    absenFitur.lokasiList,
    absenFitur.lokasiTambah,
    absenFitur.lokasiUbah,
    absenFitur.lokasiHapus,
    absenFitur.lokasiKelolaTerlihat
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await absenLokasiAPI.getList()
      if (res?.success) setRows(Array.isArray(res.data) ? res.data : [])
      else {
        setRows([])
        if (res?.message) showNotification(res.message, 'error')
      }
    } catch (e) {
      setRows([])
      showNotification(e.response?.data?.message || e.message || 'Gagal memuat lokasi', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (!needFetchLokasi) {
      setRows([])
      setLoading(false)
      return
    }
    load()
  }, [needFetchLokasi, load])

  useEffect(() => {
    if (!needFetchLokasi) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await absenSettingAPI.get()
        if (cancelled || !res?.success || !res.data) return
        setJadwalDefault(normalizeJadwalDefault(res.data.jadwal_default))
        setSidikDefault(normalizeSidikDefault(res.data.sidik_jari_default))
        setAksesMandiri(normalizeAksesMandiriFromApi(res.data))
        const ro = res.data.role_options_mandiri
        setRoleOptionsMandiri(Array.isArray(ro) ? ro : [])
      } catch {
        /* fallback state sudah di initial */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [needFetchLokasi])

  useEffect(() => {
    let c = false
    lembagaAPI
      .getAll()
      .then((res) => {
        if (c) return
        const raw = res?.data ?? res
        setLembagaOpts(Array.isArray(raw) ? raw : [])
      })
      .catch(() => {
        if (!c) setLembagaOpts([])
      })
    return () => {
      c = true
    }
  }, [])

  const closeOffcanvas = useCallback(() => {
    if (saving || deleting) return
    setOffcanvasOpen(false)
  }, [saving, deleting])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      id_lembaga: lembagaPilihan.length === 1 ? String(lembagaPilihan[0].id) : ''
    })
    setOffcanvasOpen(true)
  }

  const jamFieldsToBody = (f) => {
    const o = {}
    const keys = ['jam_mulai_pagi', 'jam_mulai_sore', 'jam_mulai_malam']
    keys.forEach((k) => {
      const v = f[k]
      o[k] = v == null || String(v).trim() === '' ? null : String(v).trim()
    })
    return o
  }

  const openEdit = (r) => {
    setEditingId(r.id)
    setForm({
      nama: r.nama || '',
      latitude: String(r.latitude ?? ''),
      longitude: String(r.longitude ?? ''),
      radius_meter: Number(r.radius_meter) || 100,
      id_lembaga: r.id_lembaga != null ? String(r.id_lembaga) : '',
      aktif: Number(r.aktif) === 1,
      sort_order: Number(r.sort_order) || 0,
      dusun: r.dusun != null ? String(r.dusun) : '',
      rt: r.rt != null ? String(r.rt) : '',
      rw: r.rw != null ? String(r.rw) : '',
      desa: r.desa != null ? String(r.desa) : '',
      kecamatan: r.kecamatan != null ? String(r.kecamatan) : '',
      kabupaten: r.kabupaten != null ? String(r.kabupaten) : '',
      provinsi: r.provinsi != null ? String(r.provinsi) : '',
      jam_mulai_pagi: mysqlTimeToInput(r.jam_mulai_pagi),
      jam_mulai_sore: mysqlTimeToInput(r.jam_mulai_sore),
      jam_mulai_malam: mysqlTimeToInput(r.jam_mulai_malam)
    })
    setOffcanvasOpen(true)
  }

  const save = async () => {
    const nama = form.nama.trim()
    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    if (!nama || Number.isNaN(lat) || Number.isNaN(lng)) {
      showNotification('Nama dan koordinat wajib diisi', 'error')
      return
    }
    if (!scopeAll && lembagaPilihan.length > 0 && !form.id_lembaga) {
      showNotification('Pilih lembaga', 'error')
      return
    }
    const body = {
      nama,
      latitude: lat,
      longitude: lng,
      radius_meter: Math.max(10, Math.min(5000, Number(form.radius_meter) || 100)),
      id_lembaga: form.id_lembaga === '' ? null : String(form.id_lembaga).trim(),
      aktif: form.aktif ? 1 : 0,
      sort_order: Number(form.sort_order) || 0,
      dusun: form.dusun?.trim() || null,
      rt: form.rt?.trim() || null,
      rw: form.rw?.trim() || null,
      desa: form.desa?.trim() || null,
      kecamatan: form.kecamatan?.trim() || null,
      kabupaten: form.kabupaten?.trim() || null,
      provinsi: form.provinsi?.trim() || null,
      ...jamFieldsToBody(form)
    }
    setSaving(true)
    try {
      let res
      if (editingId) {
        res = await absenLokasiAPI.update(editingId, body)
      } else {
        res = await absenLokasiAPI.create(body)
      }
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        setOffcanvasOpen(false)
        load()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const hapus = async () => {
    if (!editingId || !absenFitur.lokasiHapus) return
    if (!window.confirm(`Hapus lokasi "${form.nama.trim() || 'ini'}"?`)) return
    setDeleting(true)
    try {
      const res = await absenLokasiAPI.delete(editingId)
      if (res?.success) {
        showNotification(res.message || 'Dihapus', 'success')
        setOffcanvasOpen(false)
        load()
      } else {
        showNotification(res?.message || 'Gagal hapus', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal hapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const offcanvasTitle = editingId
    ? absenFitur.lokasiUbah
      ? 'Ubah lokasi'
      : 'Lokasi absen'
    : 'Tambah lokasi'

  const offcanvasCanEdit = editingId ? absenFitur.lokasiUbah : absenFitur.lokasiTambah

  const savePengaturanDefault = async (payload) => {
    try {
      const res = await absenSettingAPI.put(payload)
      if (res?.success) {
        showNotification(res.message || 'Pengaturan disimpan', 'success')
        if (payload.jadwal_default) setJadwalDefault(normalizeJadwalDefault(payload.jadwal_default))
        if (payload.sidik_jari_default) setSidikDefault(normalizeSidikDefault(payload.sidik_jari_default))
        if (payload.akses_absen_mandiri) {
          setAksesMandiri({
            role_keys: Array.isArray(payload.akses_absen_mandiri.role_keys)
              ? [...payload.akses_absen_mandiri.role_keys]
              : []
          })
        }
      } else {
        showNotification(res?.message || 'Gagal menyimpan pengaturan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan pengaturan', 'error')
    }
  }

  if (!absenFitur.tabPengaturan) {
    return null
  }

  if (!absenFitur.lokasiKelolaTerlihat && !absenFitur.lokasiList) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Anda tidak memiliki akses ke pengaturan lokasi atau jadwal default. Minta admin mengatur aksi di bawah menu Absen
        pada Pengaturan → Fitur.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pengaturan</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Jadwal default, titik lokasi absen GPS, dan siapa yang boleh absen mandiri.
      </p>
      {absenFitur.lokasiKelolaTerlihat && (
        <AbsenDefaultSettingsCard
          jadwalDefault={jadwalDefault}
          sidikDefault={sidikDefault}
          aksesMandiriDefault={aksesMandiri}
          roleOptionsMandiri={roleOptionsMandiri}
          canEdit={absenFitur.lokasiUbah}
          onSave={savePengaturanDefault}
        />
      )}
      {absenFitur.lokasiList && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Titik lokasi untuk validasi absen GPS. Radius dalam meter dari titik pusat. Ketuk kartu untuk membuka detail
            (perlu akses ubah/hapus).
          </p>

          <div className="sticky top-0 z-10 mb-4 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
                  aria-label="Cari titik lokasi"
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
                        value={lembagaFilter}
                        onChange={(e) => setLembagaFilter(e.target.value)}
                        className="h-7 min-w-0 rounded border border-gray-300 bg-white p-1 text-xs text-gray-900 focus:ring-1 focus:ring-teal-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        aria-label="Filter lembaga"
                      >
                        <option value="">Lembaga</option>
                        {lembagaFilterOptions.map((o, i) => (
                          <option key={o.value || `lembaga-${i}`} value={o.value}>
                            {o.label} ({o.count})
                          </option>
                        ))}
                      </select>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-7 min-w-0 rounded border border-gray-300 bg-white p-1 text-xs text-gray-900 focus:ring-1 focus:ring-teal-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        aria-label="Filter status"
                      >
                        <option value="">Status</option>
                        {statusFilterOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label} ({o.count})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
                      <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        title="Muat ulang"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Refresh
                      </button>
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
            {absenFitur.lokasiTambah && (
              <div className="flex justify-end border-t border-gray-200 px-4 py-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-teal-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah lokasi
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
            {loading ? (
              <p className="p-6 text-sm text-gray-500 text-center">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Belum ada lokasi.</p>
            ) : filteredRows.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Tidak ada titik yang sesuai dengan pencarian atau filter.</p>
            ) : (
              <ul
                className="grid grid-cols-1 min-[800px]:grid-cols-2 xl:grid-cols-3 gap-2.5 min-[800px]:gap-3 p-2.5 min-[800px]:p-3 list-none"
                aria-label="Daftar titik lokasi absen"
              >
                {filteredRows.map((r, index) => {
                  const alamatRingkas = lokasiAlamatRingkas(r)
                  const alamatTip = lokasiAlamatJudulTooltip(r)
                  const aktif = Number(r.aktif) === 1
                  const lembagaLabel = r.lembaga_nama || (r.id_lembaga ? `#${r.id_lembaga}` : 'Semua lembaga')
                  return (
                    <motion.li
                      key={r.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
                      className="min-w-0"
                    >
                      <div
                        role={rowClickable ? 'button' : undefined}
                        tabIndex={rowClickable ? 0 : undefined}
                        onClick={() => rowClickable && openEdit(r)}
                        onKeyDown={(e) => {
                          if (!rowClickable) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(r)
                          }
                        }}
                        className={[
                          'relative flex flex-col gap-2 rounded-xl border px-3 py-3 sm:px-3.5 sm:py-3.5 text-left min-h-[4.5rem] transition-colors',
                          'border-gray-200 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-900/30',
                          rowClickable
                            ? 'cursor-pointer hover:border-teal-300 dark:hover:border-teal-700 hover:bg-white dark:hover:bg-gray-800/80 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500'
                            : 'opacity-95'
                        ].join(' ')}
                      >
                        <div className="flex min-w-0 flex-col gap-2">
                          {/* Baris 1: judul | lembaga */}
                          <div className="flex items-start justify-between gap-3 min-w-0">
                            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
                              {r.nama}
                            </h3>
                            <span className="shrink-0 max-w-[min(14rem,46%)] rounded-lg border border-indigo-200/80 bg-indigo-50/90 px-2 py-1 text-[11px] font-medium leading-snug text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-100">
                              <span className="block text-right break-words">{lembagaLabel}</span>
                            </span>
                          </div>
                          {/* Jadwal pagi/sore/malam (efektif) */}
                          <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                            {SESI_LIST.map((sesi) => {
                              const e = effectiveJadwalSesi(r, sesi, jadwalDefault)
                              return (
                                <span
                                  key={sesi.key}
                                  title={`${sesi.label}: jam mulai ${e.mulai}`}
                                  className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-amber-200/90 bg-amber-50/90 px-1.5 py-0.5 font-medium text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100"
                                >
                                  <span className="shrink-0">{sesi.label}</span>
                                  <span className="min-w-0 truncate font-mono tabular-nums">mulai {e.mulai}</span>
                                  {e.mulaiDariDefault && (
                                    <span className="text-[9px] text-amber-700/90 dark:text-amber-300/90" title="Dari pengaturan default">
                                      ·def
                                    </span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                          {/* Baris 2: koordinat + radius | status */}
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                              <span className="inline-flex items-center gap-1 rounded-md bg-white/90 dark:bg-gray-800/90 px-1.5 py-0.5 border border-gray-200/80 dark:border-gray-600 font-mono tabular-nums break-all">
                                {r.latitude}, {r.longitude}
                              </span>
                              <span className="inline-flex items-center rounded-md bg-white/90 dark:bg-gray-800/90 px-1.5 py-0.5 border border-gray-200/80 dark:border-gray-600">
                                R {r.radius_meter} m
                              </span>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                aktif
                                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200'
                                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {aktif ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                          {/* Baris 3: alamat penuh lebar */}
                          <p
                            className="w-full min-w-0 text-xs leading-relaxed text-gray-600 dark:text-gray-400 break-words"
                            title={alamatTip || undefined}
                          >
                            {alamatRingkas ? (
                              <span>
                                <span className="text-gray-500 dark:text-gray-500">Alamat · </span>
                                {alamatRingkas}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">Alamat pratinjau belum diisi</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <AbsenLokasiOffcanvas
        isOpen={offcanvasOpen}
        onClose={closeOffcanvas}
        title={offcanvasTitle}
        form={form}
        setForm={setForm}
        saving={saving}
        deleting={deleting}
        onSave={save}
        onDelete={hapus}
        canEdit={offcanvasCanEdit}
        canDelete={absenFitur.lokasiHapus}
        isEdit={!!editingId}
        scopeAll={scopeAll}
        lembagaPilihan={lembagaPilihan}
        lokasiList={rows}
        editingId={editingId}
        jadwalDefault={jadwalDefault}
      />
    </div>
  )
}
