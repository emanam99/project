import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { madrasahAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { EXPORT_COLUMNS } from '../exportMadrasahConfig'

const LABEL_TO_KEY = Object.fromEntries([
  ...EXPORT_COLUMNS.map((c) => [c.label, c.key]),
  ['Wilayah', 'sektor']
])

const BOOL_KEYS = new Set(['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali', 'kegiatan_pagi', 'kegiatan_sore', 'kegiatan_malam'])
const INT_KEYS = new Set(['id_koordinator', 'id_pengasuh', 'id_pjgt', 'jumlah_murid', 'berdiri_tahun'])

function rowToPayload(row, labelToKey) {
  const payload = {}
  for (const [label, value] of Object.entries(row)) {
    const key = labelToKey[label]
    if (!key || key === 'id' || key === 'koordinator_nama' || key === 'koordinator_wa' || key === 'alamat_nama') continue
    let v = value === undefined || value === null || value === '' ? null : value
    if (v !== null && typeof v === 'string') v = v.trim() || null
    if (BOOL_KEYS.has(key)) payload[key] = v === true || v === 1 || String(v).toLowerCase() === 'ya' || v === '1' ? 1 : 0
    else if (INT_KEYS.has(key)) payload[key] = v != null && v !== '' ? parseInt(Number(v), 10) : null
    else payload[key] = v
  }
  return payload
}

export default function ImportMadrasahOffcanvas({ isOpen, onClose, onSuccess }) {
  const { showNotification } = useNotification()
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [importing, setImporting] = useState(false)
  const inputRef = useRef(null)

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setRows([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sh = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sh, { defval: '' })
        setRows(json)
      } catch (err) {
        showNotification('Gagal membaca file: ' + (err.message || ''), 'error')
        setFile(null)
      }
    }
    reader.readAsArrayBuffer(f)
    e.target.value = ''
  }

  const handleImport = async () => {
    if (rows.length === 0) {
      showNotification('Tidak ada data untuk diimport', 'warning')
      return
    }
    setImporting(true)
    let ok = 0
    let fail = 0
    for (let i = 0; i < rows.length; i++) {
      const payload = rowToPayload(rows[i], LABEL_TO_KEY)
      const nama = (payload.nama || '').trim()
      if (!nama) {
        fail++
        continue
      }
      try {
        const res = await madrasahAPI.create(payload)
        if (res?.success) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setImporting(false)
    showNotification(`Import selesai: ${ok} berhasil, ${fail} gagal`, ok > 0 ? 'success' : 'warning')
    onSuccess?.()
    onClose()
    setFile(null)
    setRows([])
  }

  const handleClose = () => {
    setFile(null)
    setRows([])
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        key="import-madrasah-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={handleClose}
        aria-hidden="true"
      />
      <motion.div
        key="import-madrasah-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Import Data Madrasah
          </h3>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Pilih file Excel (format template). Baris pertama = header. Kolom <strong>Nama</strong> wajib diisi.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Pilih file Excel
          </button>
          {file && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              File: <strong>{file.name}</strong>
            </p>
          )}
          {rows.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>{rows.length}</strong> baris siap diimport. Baris tanpa Nama akan dilewati.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={rows.length === 0 || importing}
            className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {importing ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Mengimport...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import ke Data Madrasah
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
