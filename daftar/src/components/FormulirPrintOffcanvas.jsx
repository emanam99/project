import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { buildFormulirBiodata } from '../utils/buildFormulirBiodata'
import { buildFormulirPdfFilename, downloadFormulirPdf } from '../utils/downloadFormulirPdf'
import PrintBiodataFormulir from '../print/PrintBiodataFormulir'
import '../print/PrintFormulirPendaftaran.css'

function formatTanggalCetak(date) {
  try {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return String(date)
  }
}

function FormulirPrintOffcanvas({ isOpen, onClose, idSantri, tahunHijriyah, tahunMasehi }) {
  const { showNotification } = useNotification()
  const formulirRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState('')
  const [biodata, setBiodata] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('print-offcanvas-open')
    return () => {
      document.body.classList.remove('print-offcanvas-open')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !idSantri) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      setBiodata(null)
      try {
        const th = String(tahunHijriyah || '').trim()
        const tm = String(tahunMasehi || '').trim()
        const [bioRes, regRes] = await Promise.all([
          pendaftaranAPI.getBiodata(idSantri),
          th && tm ? pendaftaranAPI.getRegistrasi(idSantri, th, tm) : Promise.resolve({ success: false, data: null })
        ])
        if (cancelled) return
        if (!bioRes?.success || !bioRes?.data) {
          throw new Error(bioRes?.message || 'Gagal memuat biodata')
        }
        const merged = buildFormulirBiodata(bioRes.data, regRes?.success ? regRes.data : null)
        setBiodata(merged)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Gagal memuat formulir')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen, idSantri, tahunHijriyah, tahunMasehi])

  const handlePrint = () => {
    if (!biodata) return
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (!biodata || !formulirRef.current || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      await downloadFormulirPdf(formulirRef.current, buildFormulirPdfFilename(biodata))
      showNotification('PDF formulir berhasil diunduh', 'success')
    } catch (e) {
      console.error('downloadFormulirPdf:', e)
      showNotification(e?.message || 'Gagal mengunduh PDF', 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black bg-opacity-50 z-40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Formulir Pendaftaran</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="no-print px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/20 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || !biodata}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Cetak
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={loading || !biodata || downloadingPdf}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {downloadingPdf ? 'Menyiapkan PDF…' : 'Download PDF'}
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-white">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-500">Memuat formulir…</div>
              ) : error ? (
                <div className="p-6 text-center text-red-600 text-sm">{error}</div>
              ) : biodata ? (
                <div className="print-biodata-formulir-outer" ref={formulirRef}>
                  <PrintBiodataFormulir biodata={biodata} formatTanggal={formatTanggalCetak} />
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default FormulirPrintOffcanvas
