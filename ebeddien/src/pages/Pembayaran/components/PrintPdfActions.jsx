import { useEffect, useRef, useState } from 'react'
import { buildKwitansiImageCaption, captureKwitansiJpeg, captureKwitansiPdf } from '../../../utils/kwitansiPdf'
import { waAPI } from '../../../services/api'

function formatPhoneForWa(raw) {
  let nomor = String(raw || '').replace(/\D/g, '')
  if (nomor.startsWith('0')) nomor = '62' + nomor.slice(1)
  else if (nomor && !nomor.startsWith('62')) nomor = '62' + nomor
  return nomor
}

export default function PrintPdfActions({
  filename,
  caption,
  printData,
  printMode = 'uwaba',
  uwabaPrices,
  waNumber,
  waRegistered,
  instance = 'uwaba1',
  idSantri,
  onNotify,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const ensureWaReady = () => {
    if (!String(waNumber || '').trim()) {
      onNotify?.('Masukkan nomor HP terlebih dahulu.', 'error')
      return false
    }
    if (!waRegistered) {
      onNotify?.('Cek nomor WhatsApp dulu sebelum kirim.', 'error')
      return false
    }
    return true
  }

  const runPdf = async (mode) => {
    if (busy) return
    if (mode === 'send-pdf' || mode === 'send-image') {
      if (!ensureWaReady()) return
    }

    setBusy(true)
    setOpen(false)
    try {
      const wrapper = wrapRef.current?.closest('.print-offcanvas-wrapper')

      if (mode === 'send-image') {
        const imageBase64 = await captureKwitansiJpeg(wrapper)
        const nomor = formatPhoneForWa(waNumber)
        const imageCaption = printData
          ? buildKwitansiImageCaption(printData, { mode: printMode, prices: uwabaPrices })
          : caption || 'Kwitansi'
        const result = await waAPI.send(nomor, imageCaption, instance, {
          id_santri: idSantri,
          imageBase64,
          mimetype: 'image/jpeg',
        })
        const ok = result && (result.success === true || (result.success !== false && !result.message))
        if (!ok) throw new Error(result?.message || 'Gagal mengirim gambar')
        onNotify?.('Kwitansi gambar terkirim ke nomor HP.', 'success')
        return
      }

      const { pdf, filename: outName, base64 } = await captureKwitansiPdf(wrapper, filename, {
        firstColumnOnly: mode === 'send-pdf',
      })

      if (mode === 'download') {
        pdf.save(outName)
        onNotify?.('PDF berhasil diunduh.', 'success')
        return
      }

      const nomor = formatPhoneForWa(waNumber)
      const result = await waAPI.send(nomor, caption || 'Kwitansi PDF', instance, {
        id_santri: idSantri,
        documentBase64: base64,
        fileName: outName,
        mimetype: 'application/pdf',
      })
      const ok = result && (result.success === true || (result.success !== false && !result.message))
      if (!ok) throw new Error(result?.message || 'Gagal mengirim PDF')
      onNotify?.('Kwitansi PDF terkirim sebagai dokumen WhatsApp.', 'success')
    } catch (err) {
      onNotify?.(err?.message || 'Gagal memproses PDF', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        title="Kirim PDF, kirim gambar, atau unduh"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex items-center">
          {busy ? (
            <span className="mr-1 text-xs">⏳</span>
          ) : (
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 3v5h5M9 13h6M9 17h4" />
            </svg>
          )}
          <span className="text-xs">{busy ? 'PDF…' : 'PDF'}</span>
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[13rem] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runPdf('send-pdf')}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Kirim PDF ke nomor HP
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runPdf('send-image')}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Kirim gambar ke nomor HP
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runPdf('download')}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Simpan / unduh PDF
          </button>
        </div>
      ) : null}
    </div>
  )
}
