import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pengurusAPI } from '../services/api'

/**
 * Offcanvas daftar pengurus (umum).
 * Props:
 * - isOpen, onClose: kontrol tampil/tutup
 * - onSelect: (pengurus) => void — dipanggil saat pengurus dipilih (object: id, nama, whatsapp, dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos)
 * - title: string (opsional, default "Cari Pengurus")
 * - roleKeys: string (opsional) — filter role untuk pengurusAPI.getList({ role_keys }) contoh "admin_ugt,koordinator_ugt"
 */
function formatAlamat(p) {
  if (!p) return ''
  const parts = [
    p.dusun,
    p.rt ? `RT ${p.rt}` : '',
    p.rw ? `RW ${p.rw}` : '',
    p.desa,
    p.kecamatan,
    p.kabupaten,
    p.provinsi,
    p.kode_pos
  ].filter(Boolean)
  return parts.join(', ')
}

export default function CariPengurusOffcanvas({ isOpen, onClose, onSelect, title = 'Cari Pengurus', roleKeys }) {
  const [pengurusList, setPengurusList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const loadList = async () => {
    setLoading(true)
    try {
      const params = roleKeys ? { role_keys: roleKeys } : {}
      const res = await pengurusAPI.getList(params)
      setPengurusList(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setPengurusList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      loadList()
    }
  }, [isOpen, roleKeys])

  const filteredList = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    if (!q) return pengurusList.slice(0, 80)
    return pengurusList.filter(
      (p) =>
        (p.id != null && String(p.id).toLowerCase().includes(q)) ||
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.whatsapp && p.whatsapp.toLowerCase().includes(q))
    ).slice(0, 80)
  }, [pengurusList, searchQuery])

  const handleSelect = (p) => {
    onSelect?.({
      id: p.id,
      nip: p.nip != null ? String(p.nip) : (p.id != null ? String(p.id) : null),
      nama: p.nama,
      whatsapp: p.whatsapp,
      dusun: p.dusun,
      rt: p.rt,
      rw: p.rw,
      desa: p.desa,
      kecamatan: p.kecamatan,
      kabupaten: p.kabupaten,
      provinsi: p.provinsi,
      kode_pos: p.kode_pos
    })
    onClose?.()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[100000]"
          aria-hidden="true"
        />
      )}
      {isOpen && (
        <motion.div
          key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[500px] bg-white dark:bg-gray-800 shadow-xl flex flex-col z-[100001]"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative pb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 pr-10 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500"
              placeholder="Cari ID atau Nama Pengurus"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">Data tidak ditemukan.</p>
          ) : (
            <div className="space-y-0">
              {filteredList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full text-left p-3 border-b border-gray-200 dark:border-gray-700 hover:bg-teal-50 dark:hover:bg-gray-700/50 flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      <strong>{p.id}</strong> – {p.nama || '-'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {p.whatsapp ? `WA: ${p.whatsapp}` : ''}
                      {formatAlamat(p) ? ` · ${formatAlamat(p)}` : ''}
                    </p>
                  </div>
                </button>
              ))}
              {filteredList.length >= 80 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Menampilkan 80 hasil pertama</p>
              )}
            </div>
          )}
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
