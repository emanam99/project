import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { dashboardAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

export function buildManageWaBulkDefaultMessage(page) {
  const pageLabel = page === 'khusus' ? 'Khusus' : page === 'tunggakan' ? 'Tunggakan' : 'Uwaba'
  return `Assalamualaikum,
Kepada wali santri yang terhormat, berikut pengingat pembayaran ${pageLabel} bulanan.
Mohon segera menyelesaikan administrasi di kantor UWABA Al-Utsmani. Jam buka kantor 08.00 - 16.00 WIB.

Terima kasih.

> Simpan nomor ini untuk informasi pembayaran.
> Pembayaran ini akan menjadi persyaratan Kwartal ke 3`
}

export default function ManageWaBulkMassModal({ isOpen, onClose, page, idSantriList, santriCount }) {
  const { showNotification } = useNotification()
  const [pesan, setPesan] = useState('')
  const [sendTo, setSendTo] = useState('santri_primary')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setPesan(buildManageWaBulkDefaultMessage(page))
      setSendTo('santri_primary')
    }
  }, [isOpen, page])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = pesan.trim()
    if (!text) {
      showNotification('Pesan tidak boleh kosong', 'warning')
      return
    }
    if (!idSantriList?.length) {
      showNotification('Tidak ada santri terpilih', 'warning')
      return
    }
    setSubmitting(true)
    try {
      const r = await dashboardAPI.startWaBulk({
        page,
        pesan: text,
        send_to: sendTo,
        id_santri: idSantriList,
      })
      if (r?.success) {
        showNotification(
          `Antrian pengiriman dibuat (${r.total_items ?? idSantriList.length} pesan). Proses berjalan di server.`,
          'success',
        )
        onClose?.()
      } else if (r?.blocking_job_id) {
        showNotification(r.message || 'Masih ada job lain berjalan', 'warning')
      } else {
        showNotification(r?.message || 'Gagal memulai pengiriman', 'error')
      }
    } catch (err) {
      const data = err?.response?.data
      const code = err?.response?.status
      if (code === 409 && data?.message) {
        showNotification(data.message, 'warning')
      } else {
        showNotification(data?.message || err?.message || 'Gagal memulai pengiriman', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !submitting && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-600 overflow-hidden"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kirim WA massal</h3>
              <button
                type="button"
                disabled={submitting}
                onClick={() => onClose?.()}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <strong>{santriCount ?? idSantriList?.length ?? 0}</strong> santri terpilih (beberapa baris satu santri dihitung satu).
                Jeda acak <strong>2–60 detik</strong> antar pesan diproses di server.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tujuan nomor</label>
                <select
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                >
                  <option value="santri_primary">Utama (No WA santri, fallback telpon)</option>
                  <option value="wali">Wali saja</option>
                  <option value="both">Utama + Wali (dua pesan bila nomor beda)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Isi pesan</label>
                <textarea
                  value={pesan}
                  onChange={(e) => setPesan(e.target.value)}
                  rows={10}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onClose?.()}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {submitting ? 'Mengirim…' : 'Mulai antrian'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
