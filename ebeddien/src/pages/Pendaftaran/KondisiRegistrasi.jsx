import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import SubNavPendaftaran from './components/SubNavPendaftaran'
import Modal from '../../components/Modal/Modal'

/** Ambil hanya value dari objek condition (tanpa label field), digabung dengan koma */
function conditionValuesOnly(condition) {
  if (!condition || typeof condition !== 'object') return ''
  return Object.values(condition)
    .filter(v => v != null && String(v).trim() !== '')
    .join(', ')
}

function KondisiRegistrasi() {
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const [searchInput, setSearchInput] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterValues, setFilterValues] = useState({}) // { field_name: value }
  const [fields, setFields] = useState([])
  const [valuesByField, setValuesByField] = useState({}) // { field_name: [{ value, value_label }] }
  const [showTambahModal, setShowTambahModal] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [namaSet, setNamaSet] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showDetailOffcanvas, setShowDetailOffcanvas] = useState(false)
  const [detailCondition, setDetailCondition] = useState(null)
  const [detailList, setDetailList] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchList = async (pageNum = page, filters = filterValues) => {
    setLoading(true)
    try {
      const result = await pendaftaranAPI.getUniqueKondisiFromRegistrasi(pageNum, limit, filters)
      if (result.success && Array.isArray(result.data)) {
        setList(result.data)
        setTotal(result.total ?? 0)
        setPage(result.page ?? pageNum)
      } else {
        setList([])
        setTotal(0)
      }
    } catch (error) {
      console.error('Error fetching unique kondisi:', error)
      showNotification('Gagal memuat daftar kondisi dari registrasi', 'error')
      setList([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [fieldsRes, valuesRes] = await Promise.all([
          pendaftaranAPI.getKondisiFields(),
          pendaftaranAPI.getKondisiValues()
        ])
        if (fieldsRes?.success && fieldsRes?.data) {
          setFields(fieldsRes.data.filter(f => f.is_active === 1))
        }
        if (valuesRes?.success && valuesRes?.data) {
          const byField = {}
          valuesRes.data.forEach(v => {
            const key = v.field_name || `field_${v.id_field}`
            if (!byField[key]) byField[key] = []
            byField[key].push({ value: v.value, value_label: v.value_label || v.value })
          })
          setValuesByField(byField)
        }
      } catch (e) {
        console.error('Error loading filter options:', e)
      }
    }
    loadMeta()
  }, [])

  useEffect(() => {
    fetchList(1, {})
  }, [])

  const handleFilterChange = (fieldName, value) => {
    const next = { ...filterValues, [fieldName]: value === '' ? undefined : value }
    setFilterValues(next)
    setPage(1)
    fetchList(1, next)
  }

  const displayedList = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) return list
    return list.filter(row =>
      conditionValuesOnly(row.condition).toLowerCase().includes(q)
    )
  }, [list, searchInput])

  const goToPage = (p) => {
    const next = Math.max(1, Math.min(totalPages, p))
    if (next === page) return
    setPage(next)
    fetchList(next, filterValues)
  }

  useEffect(() => {
    if (showDetailOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showDetailOffcanvas])

  const openTambahModal = (row) => {
    setSelectedRow(row)
    setNamaSet(conditionValuesOnly(row.condition) || '')
    setShowTambahModal(true)
  }

  const closeTambahModal = () => {
    setShowTambahModal(false)
    setSelectedRow(null)
    setNamaSet('')
  }

  const openDetailOffcanvas = async (row) => {
    if (!row?.condition) return
    setDetailCondition(row)
    setShowDetailOffcanvas(true)
    setDetailList([])
    setLoadingDetail(true)
    try {
      const result = await pendaftaranAPI.getRegistrasiByKondisi(row.condition)
      if (result.success && Array.isArray(result.data)) {
        setDetailList(result.data)
      } else {
        setDetailList([])
      }
    } catch (error) {
      console.error('Error fetching registrasi by kondisi:', error)
      showNotification('Gagal memuat daftar registrasi', 'error')
      setDetailList([])
    } finally {
      setLoadingDetail(false)
    }
  }

  const closeDetailOffcanvas = () => {
    setShowDetailOffcanvas(false)
    setDetailCondition(null)
    setDetailList([])
  }

  const handleTambahItemSet = async (e) => {
    e.preventDefault()
    if (!selectedRow || !namaSet.trim()) return
    setSubmitting(true)
    try {
      const result = await pendaftaranAPI.createItemSet({
        nama_set: namaSet.trim(),
        is_active: 1,
        urutan: '',
        keterangan: '',
        kondisi_value_ids: selectedRow.kondisi_value_ids || [],
        item_ids: []
      })
      if (result.success) {
        showNotification('Item set berhasil ditambahkan', 'success')
        closeTambahModal()
        fetchList(page, filterValues)
      } else {
        showNotification(result.message || 'Gagal menambahkan item set', 'error')
      }
    } catch (error) {
      console.error('Error creating item set:', error)
      showNotification(error.response?.data?.message || 'Gagal menambahkan item set', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SubNavPendaftaran />
      <div className="flex-1 flex flex-col overflow-hidden p-2 sm:p-3">
        {/* Search and Filter - style seperti Item */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full p-2 pr-20 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari kondisi..."
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                  title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {isFilterOpen ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
          </div>

          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-3 flex flex-wrap gap-3">
                  {fields.map((field) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {field.field_label}:
                      </label>
                      <select
                        value={filterValues[field.field_name] ?? ''}
                        onChange={(e) => handleFilterChange(field.field_name, e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded p-1.5 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Semua</option>
                        {(valuesByField[field.field_name] || []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value_label || opt.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Belum ada data registrasi atau tidak ada kolom kondisi yang terisi.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {displayedList.map((row, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30"
                  >
                    <button
                      type="button"
                      onClick={() => openDetailOffcanvas(row)}
                      className="flex-1 text-left text-gray-900 dark:text-gray-100 font-medium truncate hover:text-teal-600 dark:hover:text-teal-400 hover:underline focus:outline-none"
                      title={`Klik untuk lihat daftar registrasi: ${conditionValuesOnly(row.condition)}`}
                    >
                      {conditionValuesOnly(row.condition)}
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {row.has_item_set ? (
                        <>
                          <span className="inline-flex items-center text-green-600 dark:text-green-400" title="Sudah ada item set">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </span>
                          {row.item_set_nama && (
                            <button
                              type="button"
                              onClick={() => navigate('/pendaftaran/manage-item-set')}
                              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                            >
                              {row.item_set_nama}
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openTambahModal(row)}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors"
                        >
                          Tambah
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {(displayedList.length === 0 && list.length > 0) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  Tidak ada kondisi yang cocok dengan pencarian.
                </p>
              )}
              {total > limit && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, total)} dari {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-2 text-sm text-gray-500 dark:text-gray-400">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      <Modal
        isOpen={showTambahModal}
        onClose={closeTambahModal}
        title="Tambah Item Set"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleTambahItemSet} className="space-y-5 px-5 pb-5">
          {selectedRow && conditionValuesOnly(selectedRow.condition) && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Kondisi: <span className="font-medium text-gray-700 dark:text-gray-300">{conditionValuesOnly(selectedRow.condition)}</span>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nama Item Set *
            </label>
            <input
              type="text"
              value={namaSet}
              onChange={(e) => setNamaSet(e.target.value)}
              className="w-full min-w-0 px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-teal-500 dark:focus:border-teal-500 transition-shadow"
              placeholder="Misal: Mukim, Perempuan"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={closeTambahModal}
              className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !namaSet.trim()}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium transition-colors shadow-sm"
            >
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Offcanvas kanan: daftar NIS - nama & tahun ajaran untuk kondisi yang diklik */}
      {createPortal(
        <AnimatePresence>
          {showDetailOffcanvas && (
            <div className="fixed inset-0 z-[9999] flex justify-end" key="detail-offcanvas">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/50"
                onClick={closeDetailOffcanvas}
                aria-hidden
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Registrasi dengan kondisi
                    </h3>
                    <button
                      type="button"
                      onClick={closeDetailOffcanvas}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Tutup"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {detailCondition && (
                    <p className="mt-2 text-sm font-medium text-teal-600 dark:text-teal-400">
                      {conditionValuesOnly(detailCondition.condition)}
                    </p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingDetail ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
                    </div>
                  ) : detailList.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-sm">
                      Tidak ada data registrasi dengan kondisi ini.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detailList.map((item, idx) => {
                        const idForUrl = (item.nis != null && item.nis !== '' && /^\d{7}$/.test(String(item.nis).trim()))
                          ? String(item.nis).trim()
                          : String(item.id_santri ?? '').padStart(7, '0')
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => {
                                closeDetailOffcanvas()
                                navigate(`/pendaftaran?nis=${encodeURIComponent(idForUrl)}`)
                              }}
                              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                            >
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {item.nis || '–'} – {item.nama_santri || '–'}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Tahun: {item.tahun_hijriyah || '–'} / {item.tahun_masehi || '–'}
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default KondisiRegistrasi
