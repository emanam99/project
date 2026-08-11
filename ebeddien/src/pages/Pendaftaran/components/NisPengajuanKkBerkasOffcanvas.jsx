import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { createTypedObjectUrl, isImageMime, isPdfMime } from '../../../utils/filePreviewMedia'

const BTN_PRIMARY =
  'w-full py-2 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60'
const BTN_SECONDARY =
  'w-full py-2 px-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60'

import NisPengajuanBiodataCompare from './NisPengajuanBiodataCompare'

function ComparePane({ title, blob, mime, fileName, subtitle }) {
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!blob || blob.size < 1) {
      setPreview(null)
      return undefined
    }
    const { url, mime: resolvedMime } = createTypedObjectUrl(blob, mime, fileName)
    setPreview({ url, mime: resolvedMime })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [blob, mime, fileName])

  const url = preview?.url ?? null
  const isPdf = isPdfMime(preview?.mime, fileName)
  const isImage = isImageMime(preview?.mime, fileName)

  const handleDownload = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'berkas'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="flex flex-col min-w-0 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 overflow-hidden">
      <div className="px-2.5 py-2 border-b border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/50">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{title}</p>
        {subtitle ? (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="p-2 min-h-[120px] flex flex-col">
        {!url ? (
          <p className="text-xs text-gray-500 m-auto text-center py-6">Tidak ada pratinjau</p>
        ) : isImage ? (
          <img src={url} alt={title} className="w-full max-h-40 object-contain rounded-lg bg-white dark:bg-gray-900" />
        ) : isPdf ? (
          <>
            <iframe title={title} src={url} className="w-full h-36 rounded-lg bg-white border-0" />
            <p className="text-[10px] text-gray-500 text-center mt-1">
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                Buka di tab baru
              </a>
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-500 m-auto text-center py-4">Format tidak dapat dipratinjau</p>
        )}
        {url ? (
          <button
            type="button"
            onClick={handleDownload}
            className="mt-2 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline self-center"
          >
            Unduh
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Offcanvas bawah: sinkron KK + biodata pengajuan ke santri terpilih.
 */
export default function NisPengajuanKkBerkasOffcanvas({ isOpen, pengajuanId, onClose, onDone }) {
  const { showNotification } = useNotification()
  const handleClose = useOffcanvasBackClose(isOpen, onClose, {
    state: { ebOffcanvas: 'nis_pengajuan_kk_berkas' },
  })

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [info, setInfo] = useState(null)
  const [pengajuanBlob, setPengajuanBlob] = useState(null)
  const [existingBlob, setExistingBlob] = useState(null)
  const [syncBiodata, setSyncBiodata] = useState(false)

  useEffect(() => {
    if (!isOpen || !pengajuanId) {
      setInfo(null)
      setPengajuanBlob(null)
      setExistingBlob(null)
      setSyncBiodata(true)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const res = await pendaftaranAPI.getNisPengajuanKkBerkasInfo(pengajuanId)
        if (cancelled) return
        if (!res.success) {
          showNotification(res.message || 'Gagal memuat info berkas', 'error')
          handleClose()
          return
        }
        const data = res.data
        setInfo(data)

        if (!data?.can_sync) {
          showNotification('Tautkan santri terlebih dahulu.', 'warning')
          return
        }

        const [baru, lama] = await Promise.all([
          pendaftaranAPI.fetchNisPengajuanKkBlob(pengajuanId),
          data?.existing?.id && data?.has_existing_file
            ? pendaftaranAPI.downloadBerkas(data.existing.id)
            : Promise.resolve(null),
        ])

        if (cancelled) return
        setPengajuanBlob(baru)
        setExistingBlob(lama)
      } catch (e) {
        if (!cancelled) {
          showNotification(e.response?.data?.message || 'Gagal memuat perbandingan', 'error')
          handleClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, pengajuanId, showNotification, handleClose])

  const runAction = useCallback(
    async (action) => {
      if (!pengajuanId || submitting) return
      setSubmitting(true)
      try {
        const res = await pendaftaranAPI.syncNisPengajuanKkBerkas(pengajuanId, action, syncBiodata)
        if (res.success) {
          showNotification(res.message || 'Selesai', action === 'skip' && !syncBiodata ? 'info' : 'success')
          onDone?.(action, res.data)
          handleClose()
        } else {
          showNotification(res.message || 'Gagal', 'error')
        }
      } catch (e) {
        showNotification(e.response?.data?.message || 'Gagal menyimpan', 'error')
      } finally {
        setSubmitting(false)
      }
    },
    [pengajuanId, submitting, syncBiodata, showNotification, onDone, handleClose]
  )

  const hasExisting = !!info?.has_existing_file
  const samePath = !!info?.same_path
  const biodata = info?.biodata
  const biodataDiffers = !!biodata?.has_difference

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="kk-berkas-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[120]"
        onClick={handleClose}
        aria-hidden
      />
      <motion.div
        key="kk-berkas-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[121] flex flex-col bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[min(92vh,780px)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kk-berkas-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 shrink-0" aria-hidden />

        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 id="kk-berkas-title" className="text-base font-semibold text-gray-800 dark:text-white">
              Sinkron ke data santri
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              KK berkas + nama, NIK, tanggal lahir dari pengajuan
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Memuat…</p>
          ) : null}

          {!loading && info?.can_sync && biodata ? (
            <div className="mt-4">
              <NisPengajuanBiodataCompare biodata={biodata} />
            </div>
          ) : null}

          {!loading && info?.can_sync && biodata ? (
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncBiodata}
                onChange={(e) => setSyncBiodata(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                Timpa <strong>nama, NIK, dan tanggal lahir</strong> di biodata santri dengan data pengajuan
              </span>
            </label>
          ) : null}

          {!loading && samePath ? (
            <p className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 rounded-lg px-3 py-2 mt-3">
              Berkas KK santri sudah memakai file yang sama dengan pengajuan ini.
            </p>
          ) : null}

          {!loading && info?.can_sync && pengajuanBlob && (!samePath || hasExisting) ? (
            <div className={`grid gap-3 mt-3 ${hasExisting ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {hasExisting ? (
                <ComparePane
                  title="KK di berkas santri (lama)"
                  blob={existingBlob}
                  mime={info.existing?.tipe_file}
                  fileName={info.existing?.nama_file}
                  subtitle={info.existing?.nama_file}
                />
              ) : null}
              <ComparePane
                title={hasExisting ? 'KK dari pengajuan (baru)' : 'KK dari pengajuan'}
                blob={pengajuanBlob}
                mime={info.pengajuan?.tipe_file}
                fileName={info.pengajuan?.nama_file}
                subtitle={info.pengajuan?.nama_file}
              />
            </div>
          ) : null}

          {!loading && !info?.can_sync ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 text-center py-6">
              Santri belum ditautkan. Isi NIS/ID santri di detail pengajuan lalu coba lagi.
            </p>
          ) : null}
        </div>

        <div className="shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-1.5">
          {info?.can_sync && samePath && biodataDiffers && syncBiodata ? (
            <button
              type="button"
              disabled={submitting || loading}
              onClick={() => runAction('biodata_only')}
              className={`${BTN_PRIMARY} bg-teal-600 hover:bg-teal-700`}
            >
              {submitting ? 'Menyimpan…' : 'Timpa data biodata santri'}
            </button>
          ) : null}

          {info?.can_sync && hasExisting && !samePath ? (
            <>
              <button
                type="button"
                disabled={submitting || loading}
                onClick={() => runAction('overwrite')}
                className={`${BTN_PRIMARY} bg-amber-600 hover:bg-amber-700`}
              >
                {submitting ? 'Menyimpan…' : syncBiodata ? 'Timpa KK & biodata' : 'Timpa berkas KK'}
              </button>
              <button
                type="button"
                disabled={submitting || loading}
                onClick={() => runAction('skip')}
                className={BTN_SECONDARY}
              >
                Lewati
              </button>
            </>
          ) : null}

          {info?.can_sync && (!hasExisting || samePath) && !samePath ? (
            <>
              <button
                type="button"
                disabled={submitting || loading}
                onClick={() => runAction('save')}
                className={`${BTN_PRIMARY} bg-teal-600 hover:bg-teal-700`}
              >
                {submitting ? 'Menyimpan…' : syncBiodata ? 'Simpan KK & biodata' : 'Simpan KK ke berkas'}
              </button>
              <button
                type="button"
                disabled={submitting || loading}
                onClick={() => runAction('skip')}
                className={BTN_SECONDARY}
              >
                Lewati
              </button>
            </>
          ) : null}

          {info?.can_sync && samePath && (!biodataDiffers || !syncBiodata) ? (
            <button
              type="button"
              disabled={submitting || loading}
              onClick={() => runAction('skip')}
              className={BTN_SECONDARY}
            >
              {samePath ? 'Tutup' : 'Lewati'}
            </button>
          ) : null}

          {info?.can_sync && samePath && biodataDiffers && !syncBiodata ? (
            <button
              type="button"
              disabled={submitting || loading}
              onClick={() => runAction('skip')}
              className={BTN_SECONDARY}
            >
              Tutup
            </button>
          ) : null}

          {!info?.can_sync ? (
            <button type="button" onClick={handleClose} className={BTN_SECONDARY}>
              Tutup
            </button>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
