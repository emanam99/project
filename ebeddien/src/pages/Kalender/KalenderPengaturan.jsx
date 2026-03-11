import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { kalenderAPI, hariPentingAPI } from '../../services/api'
import { getBulanName } from './utils/bulanHijri'
import './Kalender.css'

const TIPE_OPTIONS = [
  { value: 'per_hari', label: 'Per Hari' },
  { value: 'per_pekan', label: 'Per Pekan' },
  { value: 'per_bulan', label: 'Per Bulan' },
  { value: 'per_tahun', label: 'Per Tahun' },
  { value: 'sekali', label: 'Sekali' }
]
const KATEGORI_OPTIONS = [
  { value: 'hijriyah', label: 'Hijriyah' },
  { value: 'masehi', label: 'Masehi' }
]

/** Pilihan warna untuk label hari penting – pilih dari grid, bukan ketik teks */
const WARNA_LABEL_OPTIONS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#84cc16', '#a855f7',
  '#0ea5e9', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#db2777'
]

function KalenderPengaturan() {
  const [tab, setTab] = useState('bulan')
  const [tahunHijriyah, setTahunHijriyah] = useState('1446')
  const [kalenderRows, setKalenderRows] = useState([])
  const [loadingKalender, setLoadingKalender] = useState(false)
  const [savingKalender, setSavingKalender] = useState(false)
  const [messageKalender, setMessageKalender] = useState(null)

  const [showCariOffcanvas, setShowCariOffcanvas] = useState(false)
  const [cariOffcanvasEntered, setCariOffcanvasEntered] = useState(false)
  const [cariOffcanvasExiting, setCariOffcanvasExiting] = useState(false)
  const [tahunList, setTahunList] = useState([])
  const [loadingTahunList, setLoadingTahunList] = useState(false)

  const [hariPentingList, setHariPentingList] = useState([])
  const [loadingHariPenting, setLoadingHariPenting] = useState(false)
  const [formHariPenting, setFormHariPenting] = useState({
    id: '',
    nama_event: '',
    kategori: 'hijriyah',
    tipe: 'per_tahun',
    hari_pekan: '',
    tanggal: '',
    bulan: '',
    tahun: '',
    warna_label: '#3b82f6',
    keterangan: '',
    aktif: 1
  })
  const [showForm, setShowForm] = useState(false)
  const [hpOffcanvasEntered, setHpOffcanvasEntered] = useState(false)
  const [hpOffcanvasExiting, setHpOffcanvasExiting] = useState(false)
  const [savingHariPenting, setSavingHariPenting] = useState(false)
  const [messageHariPenting, setMessageHariPenting] = useState(null)

  const [searchHariPenting, setSearchHariPenting] = useState('')
  const [filterKategoriHariPenting, setFilterKategoriHariPenting] = useState('')
  const [filterTipeHariPenting, setFilterTipeHariPenting] = useState('')
  const [filterBulanHariPenting, setFilterBulanHariPenting] = useState('')
  const [filterTanggalHariPenting, setFilterTanggalHariPenting] = useState('')
  const [filterTahunHariPenting, setFilterTahunHariPenting] = useState('')
  const [isFilterHariPentingOpen, setIsFilterHariPentingOpen] = useState(false)
  const [isInputHariPentingFocused, setIsInputHariPentingFocused] = useState(false)
  const colorPickerInputRef = useRef(null)

  /** Infer jumlah hari (29 atau 30) dari range mulai–akhir */
  const inferJumlahHari = (mulai, akhir) => {
    if (!mulai || !akhir) return 30
    const a = new Date(mulai)
    const b = new Date(akhir)
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 30
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
    return days === 29 ? 29 : 30
  }

  /** Hitung otomatis mulai/akhir semua bulan dari tanggal awal bulan 1 + jumlah hari per bulan (seperti admin kalender) */
  const deriveRowsFromFirstAndDays = (rows) => {
    if (!rows.length) return rows
    let prevAkhir = null
    return rows.map((row, i) => {
      const jumlahHari = row.jumlahHari ?? 30
      let mulai = row.mulai
      let akhir = row.akhir
      if (i === 0) {
        if (mulai) {
          const tgl = new Date(mulai)
          tgl.setDate(tgl.getDate() + jumlahHari - 1)
          akhir = tgl.toISOString().slice(0, 10)
        }
      } else {
        if (prevAkhir) {
          const next = new Date(prevAkhir)
          next.setDate(next.getDate() + 1)
          mulai = next.toISOString().slice(0, 10)
        }
        if (mulai) {
          const tgl = new Date(mulai)
          tgl.setDate(tgl.getDate() + jumlahHari - 1)
          akhir = tgl.toISOString().slice(0, 10)
        }
      }
      prevAkhir = akhir || null
      return { ...row, mulai: mulai || row.mulai, akhir: akhir || row.akhir, jumlahHari }
    })
  }

  const loadKalenderByTahun = async (tahunOverride) => {
    const tahunNum = tahunOverride != null ? Number(tahunOverride) : parseInt(tahunHijriyah, 10)
    if (!Number.isFinite(tahunNum)) {
      setMessageKalender('Tahun tidak valid')
      return
    }
    const tahun = Math.floor(tahunNum)
    if (tahunOverride != null) setTahunHijriyah(String(tahun))
    setLoadingKalender(true)
    setMessageKalender(null)
    try {
      const data = await kalenderAPI.get({ action: 'year', tahun })
      let rows = Array.isArray(data) ? data : []
      if (rows.length === 0) {
        rows = Array.from({ length: 12 }, (_, i) => ({
          tahun,
          id_bulan: i + 1,
          mulai: '',
          akhir: '',
          jumlahHari: 30
        }))
        setKalenderRows(rows)
      } else {
        rows = rows.map((r) => ({
          ...r,
          jumlahHari: inferJumlahHari(r.mulai, r.akhir)
        }))
        rows.sort((a, b) => Number(a.id_bulan) - Number(b.id_bulan))
        setKalenderRows(rows)
      }
    } catch (e) {
      setMessageKalender(e.message || 'Gagal memuat data kalender')
      setKalenderRows(Array.from({ length: 12 }, (_, i) => ({
        tahun,
        id_bulan: i + 1,
        mulai: '',
        akhir: '',
        jumlahHari: 30
      })))
    } finally {
      setLoadingKalender(false)
    }
  }

  const saveKalenderBulk = async () => {
    const payload = kalenderRows.map((r) => ({
      tahun: r.tahun,
      id_bulan: r.id_bulan,
      mulai: r.mulai,
      akhir: r.akhir
    }))
    if (payload.length === 0) {
      setMessageKalender('Tidak ada data untuk disimpan')
      return
    }
    setSavingKalender(true)
    setMessageKalender(null)
    try {
      await kalenderAPI.postBulk(payload)
      setMessageKalender('Data kalender berhasil disimpan')
    } catch (e) {
      setMessageKalender(e.message || 'Gagal menyimpan')
    } finally {
      setSavingKalender(false)
    }
  }

  /** Ambil daftar tahun yang sudah ada di kalender + jumlah bulan (x/12) */
  const loadTahunList = async () => {
    setLoadingTahunList(true)
    setTahunList([])
    try {
      const data = await kalenderAPI.get({ action: 'all' })
      const rows = Array.isArray(data) ? data : []
      const byTahun = {}
      rows.forEach((r) => {
        const t = Number(r.tahun)
        if (!byTahun[t]) byTahun[t] = 0
        byTahun[t] += 1
      })
      const list = Object.entries(byTahun)
        .map(([tahun, count]) => ({ tahun: Number(tahun), count: Math.min(12, count) }))
        .sort((a, b) => b.tahun - a.tahun)
      setTahunList(list)
      setShowCariOffcanvas(true)
    } catch (e) {
      setTahunList([])
      setShowCariOffcanvas(true)
    } finally {
      setLoadingTahunList(false)
    }
  }

  const pilihTahunDariCari = (tahun) => {
    setShowCariOffcanvas(false)
    setTahunHijriyah(String(tahun))
    loadKalenderByTahun(tahun)
  }

  /** Animasi masuk offcanvas: mulai dari tertutup, lalu satu frame kemudian ke terbuka */
  useEffect(() => {
    if (!showCariOffcanvas) {
      setCariOffcanvasEntered(false)
      setCariOffcanvasExiting(false)
      return
    }
    setCariOffcanvasExiting(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setCariOffcanvasEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [showCariOffcanvas])

  /** Lock scroll body saat offcanvas Cari tahun terbuka (sama seperti Cari Santri) */
  useEffect(() => {
    if (showCariOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showCariOffcanvas])

  const tutupCariOffcanvas = () => {
    setCariOffcanvasExiting(true)
  }

  const handleCariOffcanvasTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (cariOffcanvasExiting) {
      setShowCariOffcanvas(false)
      setCariOffcanvasExiting(false)
      setCariOffcanvasEntered(false)
    }
  }

  const loadHariPenting = async () => {
    setLoadingHariPenting(true)
    try {
      const data = await hariPentingAPI.getList()
      setHariPentingList(Array.isArray(data) ? data : [])
    } catch (e) {
      setHariPentingList([])
    } finally {
      setLoadingHariPenting(false)
    }
  }

  const filteredHariPentingList = useMemo(() => {
    let list = hariPentingList
    const q = (searchHariPenting || '').trim().toLowerCase()
    if (q) {
      list = list.filter(
        (item) =>
          (item.nama_event && item.nama_event.toLowerCase().includes(q)) ||
          (item.keterangan && item.keterangan.toLowerCase().includes(q))
      )
    }
    if (filterKategoriHariPenting) {
      list = list.filter((item) => (item.kategori || '') === filterKategoriHariPenting)
    }
    if (filterTipeHariPenting) {
      list = list.filter((item) => (item.tipe || '') === filterTipeHariPenting)
    }
    if (filterBulanHariPenting) {
      const bulanNum = parseInt(filterBulanHariPenting, 10)
      list = list.filter((item) => item.bulan != null && Number(item.bulan) === bulanNum)
    }
    if (filterTanggalHariPenting) {
      const tglNum = parseInt(filterTanggalHariPenting, 10)
      list = list.filter((item) => item.tanggal != null && Number(item.tanggal) === tglNum)
    }
    if (filterTahunHariPenting) {
      const tahunNum = parseInt(filterTahunHariPenting, 10)
      list = list.filter((item) => item.tahun != null && Number(item.tahun) === tahunNum)
    }
    return list
  }, [hariPentingList, searchHariPenting, filterKategoriHariPenting, filterTipeHariPenting, filterBulanHariPenting, filterTanggalHariPenting, filterTahunHariPenting])

  useEffect(() => {
    if (tab === 'bulan' && tahunHijriyah) loadKalenderByTahun()
  }, [tab, tahunHijriyah])

  useEffect(() => {
    if (tab === 'hari-penting') loadHariPenting()
  }, [tab])

  useEffect(() => {
    if (!showForm) {
      setHpOffcanvasEntered(false)
      setHpOffcanvasExiting(false)
      return
    }
    setHpOffcanvasExiting(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setHpOffcanvasEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [showForm])

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showForm])

  const handleKalenderFieldChange = (index, field, value) => {
    setKalenderRows((prev) => {
      let next = [...prev]
      if (next[index]) next[index] = { ...next[index], [field]: value }
      if (field === 'mulai' && index === 0) next = deriveRowsFromFirstAndDays(next)
      if (field === 'jumlahHari') next = deriveRowsFromFirstAndDays(next)
      return next
    })
  }

  const openFormHariPenting = (item = null) => {
    if (item) {
      setFormHariPenting({
        id: item.id,
        nama_event: item.nama_event || '',
        kategori: item.kategori || 'hijriyah',
        tipe: item.tipe || 'per_tahun',
        hari_pekan: item.hari_pekan ?? '',
        tanggal: item.tanggal ?? '',
        bulan: item.bulan ?? '',
        tahun: item.tahun ?? '',
        warna_label: item.warna_label || '#3b82f6',
        keterangan: item.keterangan || '',
        aktif: item.aktif ?? 1
      })
    } else {
      setFormHariPenting({
        id: '',
        nama_event: '',
        kategori: 'hijriyah',
        tipe: 'per_tahun',
        hari_pekan: '',
        tanggal: '',
        bulan: '',
        tahun: '',
        warna_label: '#3b82f6',
        keterangan: '',
        aktif: 1
      })
    }
    setShowForm(true)
    setHpOffcanvasExiting(false)
    setMessageHariPenting(null)
  }

  const tutupHariPentingOffcanvas = () => {
    setHpOffcanvasExiting(true)
  }

  const handleHariPentingOffcanvasTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (hpOffcanvasExiting) {
      setShowForm(false)
      setHpOffcanvasExiting(false)
      setHpOffcanvasEntered(false)
    }
  }

  const saveHariPenting = async () => {
    const payload = {
      ...formHariPenting,
      hari_pekan: formHariPenting.hari_pekan === '' ? null : parseInt(formHariPenting.hari_pekan, 10),
      tanggal: formHariPenting.tanggal === '' ? null : parseInt(formHariPenting.tanggal, 10),
      bulan: formHariPenting.bulan === '' ? null : parseInt(formHariPenting.bulan, 10),
      tahun: formHariPenting.tahun === '' ? null : parseInt(formHariPenting.tahun, 10),
      aktif: formHariPenting.aktif ? 1 : 0
    }
    if (payload.id) {
      payload.id = parseInt(payload.id, 10)
    } else {
      delete payload.id
    }
    setSavingHariPenting(true)
    setMessageHariPenting(null)
    try {
      await hariPentingAPI.post(payload)
      setMessageHariPenting('Data berhasil disimpan')
      setShowForm(false)
      setHpOffcanvasEntered(false)
      loadHariPenting()
    } catch (e) {
      setMessageHariPenting(e.message || 'Gagal menyimpan')
    } finally {
      setSavingHariPenting(false)
    }
  }

  const deleteHariPenting = async (id) => {
    if (!window.confirm('Yakin hapus hari penting ini?')) return
    try {
      await hariPentingAPI.delete(id)
      loadHariPenting()
    } catch (e) {
      setMessageHariPenting(e.message || 'Gagal menghapus')
    }
  }

  return (
    <div className="kalender-pengaturan-page h-full min-h-0 flex flex-col overflow-hidden p-4 max-w-4xl mx-auto pb-24 md:pb-4">
      {/* Tab Bulan / Hari Penting – tetap di atas, tidak ikut scroll */}
      <div className="kalender-page__tabs flex-shrink-0">
        <button
          type="button"
          className={`kalender-page__tab ${tab === 'bulan' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setTab('bulan')}
        >
          Bulan
        </button>
        <button
          type="button"
          className={`kalender-page__tab ${tab === 'hari-penting' ? 'kalender-page__tab--active' : ''}`}
          onClick={() => setTab('hari-penting')}
        >
          Hari Penting
        </button>
      </div>

      {/* Area konten di bawah tab – hanya bagian ini yang scroll */}
      <div className="kalender-pengaturan-scroll flex-1 min-h-0 overflow-y-auto">
      {tab === 'bulan' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="number"
              value={tahunHijriyah}
              onChange={(e) => setTahunHijriyah(e.target.value)}
              placeholder="Tahun"
              className="kalender-pengaturan__input-wrap rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 w-24 text-sm"
              aria-label="Tahun Hijriyah"
            />
            <button
              type="button"
              onClick={() => loadKalenderByTahun()}
              disabled={loadingKalender}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary p-2.5"
              title="Muat"
              aria-label="Muat data kalender"
            >
              {loadingKalender ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={saveKalenderBulk}
              disabled={savingKalender || kalenderRows.length === 0}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary p-2.5"
              title="Simpan"
              aria-label="Simpan data kalender"
            >
              <svg className={`w-5 h-5 ${savingKalender ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={loadTahunList}
              disabled={loadingTahunList}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary p-2.5"
              title="Cari tahun"
              aria-label="Cari tahun yang sudah ada"
            >
              <svg className={`w-5 h-5 ${loadingTahunList ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
          {messageKalender && (
            <div className="mb-4 p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
              {messageKalender}
            </div>
          )}
          <ul className="kalender-pengaturan-list space-y-3 sm:space-y-0 sm:rounded-xl sm:border sm:border-gray-200 dark:sm:border-gray-700 sm:overflow-hidden sm:bg-white dark:sm:bg-gray-800/50">
            {/* Header baris untuk PC: kolom lurus */}
            <li className="hidden sm:grid kalender-pengaturan-list__header" aria-hidden>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bulan</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center">Hari</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mulai</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Akhir</span>
            </li>
            {kalenderRows.map((row, index) => {
              const jumlahHari = row.jumlahHari ?? 30
              const isBulanPertama = index === 0
              return (
                <li
                  key={row.id ?? index}
                  className="kalender-pengaturan-list__row bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 transition-shadow hover:shadow-md sm:rounded-none sm:shadow-none sm:border-0 sm:border-b sm:border-gray-200 dark:sm:border-gray-700 sm:hover:bg-gray-50 dark:sm:hover:bg-gray-800/80 last:sm:border-b-0"
                >
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--bulan flex items-center gap-3 min-w-0 mb-3 sm:mb-0">
                    <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {String(row.id_bulan).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 text-base sm:text-sm truncate">
                        {getBulanName(row.id_bulan, 'hijriyah_ar')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 sm:hidden">
                        Tahun {row.tahun}
                      </div>
                    </div>
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--hari flex items-center gap-2 mb-3 sm:mb-0">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 sm:sr-only">Hari</span>
                    <select
                      value={jumlahHari}
                      onChange={(e) => handleKalenderFieldChange(index, 'jumlahHari', Number(e.target.value))}
                      className="kalender-pengaturan-list__select rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-16 sm:w-full"
                    >
                      <option value={29}>29</option>
                      <option value={30}>30</option>
                    </select>
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--mulai space-y-1 sm:space-y-0">
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 sm:hidden">Mulai</span>
                    {isBulanPertama ? (
                      <input
                        type="date"
                        value={row.mulai || ''}
                        onChange={(e) => handleKalenderFieldChange(index, 'mulai', e.target.value)}
                        className="kalender-pengaturan-list__input w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-teal-600 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    ) : (
                      <span className="block text-sm font-medium text-teal-600 dark:text-teal-400 sm:py-2">{row.mulai || '-'}</span>
                    )}
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--akhir space-y-1 sm:space-y-0">
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 sm:hidden">Akhir</span>
                    <span className="block text-sm font-medium text-teal-600 dark:text-teal-400 sm:py-2">{row.akhir || '-'}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="h-24 sm:h-0 flex-shrink-0" aria-hidden />
        </div>
      )}

      {tab === 'hari-penting' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {filteredHariPentingList.length} hari penting
              {filteredHariPentingList.length !== hariPentingList.length && (
                <span className="text-gray-400 dark:text-gray-500"> dari {hariPentingList.length}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => openFormHariPenting()}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary"
            >
              Tambah Hari Penting
            </button>
          </div>
          {messageHariPenting && (
            <div className="mb-4 p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
              {messageHariPenting}
            </div>
          )}

          {/* Cari & Filter – style seperti Data Ijin */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="relative pb-2 px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchHariPenting}
                  onChange={(e) => setSearchHariPenting(e.target.value)}
                  onFocus={() => setIsInputHariPentingFocused(true)}
                  onBlur={() => setIsInputHariPentingFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                  placeholder="Cari nama event atau keterangan..."
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterHariPentingOpen((v) => !v)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterHariPentingOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {isFilterHariPentingOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={loadHariPenting}
                    className="bg-teal-100 hover:bg-teal-200 dark:bg-teal-700 dark:hover:bg-teal-600 text-teal-700 dark:text-teal-200 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                    title="Refresh"
                    disabled={loadingHariPenting}
                  >
                    <svg className={`w-4 h-4 ${loadingHariPenting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputHariPentingFocused ? 'opacity-100' : 'opacity-0'}`} />
            </div>

            <div
              className={`overflow-hidden transition-all duration-200 ease-out border-t border-gray-200 dark:border-gray-700 ${
                isFilterHariPentingOpen ? 'max-h-52 opacity-100' : 'max-h-0 opacity-0 border-t-0'
              }`}
            >
              <div className="px-4 py-2 flex flex-wrap gap-2 bg-gray-50 dark:bg-gray-700/50">
                <select
                  value={filterKategoriHariPenting}
                  onChange={(e) => setFilterKategoriHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Kategori</option>
                  {KATEGORI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={filterTipeHariPenting}
                  onChange={(e) => setFilterTipeHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Tipe</option>
                  {TIPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={filterTahunHariPenting}
                  onChange={(e) => setFilterTahunHariPenting(e.target.value)}
                  placeholder="Tahun"
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 w-20 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Tahun"
                  aria-label="Filter tahun"
                />
                <select
                  value={filterBulanHariPenting}
                  onChange={(e) => setFilterBulanHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Bulan"
                >
                  <option value="">Bulan</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <select
                  value={filterTanggalHariPenting}
                  onChange={(e) => setFilterTanggalHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Tanggal"
                >
                  <option value="">Tanggal</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loadingHariPenting ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredHariPentingList.map((item) => {
                const parts = []
                if (item.tanggal != null && item.tanggal !== '') parts.push(`Tgl ${item.tanggal}`)
                if (item.bulan != null && item.bulan !== '') parts.push(item.kategori === 'hijriyah' ? getBulanName(Number(item.bulan), 'hijriyah_ar') : `Bulan ${item.bulan}`)
                if (item.tahun != null && item.tahun !== '') parts.push(item.tahun)
                const dateInfo = parts.length ? parts.join(' · ') : null
                return (
                  <li
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFormHariPenting(item)}
                    onKeyDown={(e) => e.key === 'Enter' && openFormHariPenting(item)}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors"
                  >
                    {item.warna_label && (
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: item.warna_label }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium block truncate">{item.nama_event}</span>
                      {(dateInfo || item.tipe) && (
                        <span className="text-xs text-gray-500 block truncate">
                          {[dateInfo, item.tipe].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Form Hari Penting: offcanvas kanan via portal (seperti Data Ijin) */}
        </div>
      )}
      </div>

      {/* Offcanvas kanan Hari Penting: tambah/edit form + Hapus di dalam (seperti Data Ijin) */}
      {createPortal(
        showForm ? (
          <>
            <div
              className={`fixed inset-0 z-[99998] bg-black/40 transition-opacity duration-300 ease-out ${
                hpOffcanvasEntered && !hpOffcanvasExiting ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
              onClick={tutupHariPentingOffcanvas}
            />
            <div
              className={`fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
                hpOffcanvasEntered && !hpOffcanvasExiting ? 'translate-x-0' : 'translate-x-full'
              }`}
              role="dialog"
              aria-label={formHariPenting.id ? 'Edit Hari Penting' : 'Tambah Hari Penting'}
              onTransitionEnd={handleHariPentingOffcanvasTransitionEnd}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {formHariPenting.id ? 'Edit Hari Penting' : 'Tambah Hari Penting'}
                </h2>
                <button
                  type="button"
                  onClick={tutupHariPentingOffcanvas}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4 space-y-3">
                {messageHariPenting && (
                  <div className="p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
                    {messageHariPenting}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nama Event</label>
                  <input
                    type="text"
                    value={formHariPenting.nama_event}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, nama_event: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Kategori</label>
                  <select
                    value={formHariPenting.kategori}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, kategori: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    {KATEGORI_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tipe</label>
                  <select
                    value={formHariPenting.tipe}
                    onChange={(e) => {
                      const tipe = e.target.value
                      setFormHariPenting((p) => ({
                        ...p,
                        tipe,
                        ...(tipe === 'per_tahun' ? { tahun: '' } : {}),
                        ...(tipe === 'per_bulan' ? { bulan: '' } : {})
                      }))
                    }}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    {TIPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tanggal</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formHariPenting.tanggal}
                      onChange={(e) => setFormHariPenting((p) => ({ ...p, tanggal: e.target.value }))}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                    />
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                      formHariPenting.tipe === 'per_bulan'
                        ? 'max-h-0 opacity-0'
                        : 'max-h-[4.5rem] opacity-100'
                    }`}
                  >
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bulan</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={formHariPenting.bulan}
                      onChange={(e) => setFormHariPenting((p) => ({ ...p, bulan: e.target.value }))}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                    />
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                      formHariPenting.tipe === 'per_tahun'
                        ? 'max-h-0 opacity-0'
                        : 'max-h-[4.5rem] opacity-100'
                    }`}
                  >
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tahun</label>
                    <input
                      type="number"
                      value={formHariPenting.tahun}
                      onChange={(e) => setFormHariPenting((p) => ({ ...p, tahun: e.target.value }))}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Warna Label</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {(() => {
                      const current = formHariPenting.warna_label || '#3b82f6'
                      const dipakai = WARNA_LABEL_OPTIONS.includes(current)
                        ? WARNA_LABEL_OPTIONS
                        : [current, ...WARNA_LABEL_OPTIONS]
                      return dipakai.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setFormHariPenting((p) => ({ ...p, warna_label: hex }))}
                          className={`w-8 h-8 rounded-lg border-2 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                            (formHariPenting.warna_label || '#3b82f6') === hex
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
                      value={formHariPenting.warna_label || '#3b82f6'}
                      onChange={(e) => setFormHariPenting((p) => ({ ...p, warna_label: e.target.value }))}
                      className="sr-only"
                      aria-hidden="true"
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
                    value={formHariPenting.keterangan}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, keterangan: e.target.value }))}
                    rows={2}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!formHariPenting.aktif}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, aktif: e.target.checked ? 1 : 0 }))}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
                </label>
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={saveHariPenting}
                  disabled={savingHariPenting || !formHariPenting.nama_event.trim()}
                  className="kalender-pengaturan__btn kalender-pengaturan__btn--primary"
                >
                  {savingHariPenting ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={tutupHariPentingOffcanvas}
                  className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary"
                >
                  Batal
                </button>
                {formHariPenting.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Yakin hapus hari penting ini?')) {
                        deleteHariPenting(formHariPenting.id)
                        setShowForm(false)
                        setHpOffcanvasEntered(false)
                      }
                    }}
                    className="kalender-pengaturan__btn kalender-pengaturan__btn--danger"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null,
        document.body
      )}

      {/* Offcanvas kanan: render di elemen terluar (document.body) seperti Cari Santri */}
      {createPortal(
        showCariOffcanvas ? (
          <>
            <div
              className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out ${
                cariOffcanvasEntered && !cariOffcanvasExiting ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
              onClick={tutupCariOffcanvas}
            />
            <div
              className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-white dark:bg-gray-800 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
                cariOffcanvasEntered && !cariOffcanvasExiting ? 'translate-x-0' : 'translate-x-full'
              }`}
              role="dialog"
              aria-label="Cari tahun"
              onTransitionEnd={handleCariOffcanvasTransitionEnd}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Tahun yang ada</h2>
                <button
                  type="button"
                  onClick={tutupCariOffcanvas}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4">
                {loadingTahunList ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
                  </div>
                ) : tahunList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Belum ada data tahun.</p>
                ) : (
                  <ul className="space-y-1">
                    {tahunList.map(({ tahun, count }) => (
                      <li key={tahun}>
                        <button
                          type="button"
                          onClick={() => pilihTahunDariCari(tahun)}
                          className="w-full text-left px-4 py-3 rounded-lg flex items-center justify-between gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="font-medium text-gray-800 dark:text-gray-200">Tahun {tahun}</span>
                          <span
                            className={`text-sm font-medium shrink-0 ${
                              count === 12
                                ? 'text-teal-600 dark:text-teal-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {count}/12
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null,
        document.body
      )}
    </div>
  )
}

export default KalenderPengaturan
