import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { compressImageUnderMaxBytes } from '../utils/imageCompress'

const MAX_SIZE = 400
const VIEW_SIZE = 300
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

function getTouchDistance(t0, t1) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
}

function getTouchCenter(t0, t1) {
  return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }
}

/** Offcanvas bawah untuk atur posisi & crop foto profil. */
export default function ProfilFotoCropModal({ file, onConfirm, onCancel }) {
  const [preview, setPreview] = useState(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [pinching, setPinching] = useState(false)
  const pinchStartRef = useRef({ zoom: 1, distance: 0, center: { x: 0, y: 0 }, position: { x: 0, y: 0 } })
  const containerRef = useRef(null)
  const imgRef = useRef(null)

  const effectiveScale = scale * zoom
  const isOpen = Boolean(file)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(file)
    setPosition({ x: 0, y: 0 })
    setScale(1)
    setZoom(1)
  }, [file])

  const onImageLoad = () => {
    if (!imgRef.current) return
    const img = imgRef.current
    const w = img.naturalWidth
    const h = img.naturalHeight
    setImageSize({ w, h })
    const s = Math.max(VIEW_SIZE / w, VIEW_SIZE / h)
    setScale(s)
  }

  const handleZoomIn = () => {
    const centerX = VIEW_SIZE / 2
    const centerY = VIEW_SIZE / 2
    const newZoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP)
    if (newZoom === zoom) return
    setZoom(newZoom)
    setPosition((pos) => {
      const ratio = newZoom / zoom
      return {
        x: centerX - (centerX - pos.x) * ratio,
        y: centerY - (centerY - pos.y) * ratio
      }
    })
  }

  const handleZoomOut = () => {
    const centerX = VIEW_SIZE / 2
    const centerY = VIEW_SIZE / 2
    const newZoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP)
    if (newZoom === zoom) return
    setZoom(newZoom)
    setPosition((pos) => {
      const ratio = newZoom / zoom
      return {
        x: centerX - (centerX - pos.x) * ratio,
        y: centerY - (centerY - pos.y) * ratio
      }
    })
  }

  const handleMouseDown = (e) => {
    if (!e.target.closest('.crop-drag-area') || pinching) return
    setDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e) => {
    if (!dragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => setDragging(false)

  const handleTouchStart = (e) => {
    if (!e.target.closest('.crop-drag-area')) return
    if (e.touches.length === 2) {
      e.preventDefault()
      setDragging(false)
      const dist = getTouchDistance(e.touches[0], e.touches[1])
      const center = getTouchCenter(e.touches[0], e.touches[1])
      const rect = containerRef.current?.getBoundingClientRect()
      const centerInBox = rect
        ? { x: center.x - rect.left, y: center.y - rect.top }
        : { x: VIEW_SIZE / 2, y: VIEW_SIZE / 2 }
      pinchStartRef.current = { zoom, distance: dist, center: centerInBox, position: { ...position } }
      setPinching(true)
    } else if (e.touches.length === 1 && !pinching) {
      const t = e.touches[0]
      setDragging(true)
      setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y })
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const start = pinchStartRef.current
      const dist = getTouchDistance(e.touches[0], e.touches[1])
      if (start.distance <= 0) return
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.zoom * (dist / start.distance)))
      setZoom(newZoom)
      const ratio = newZoom / start.zoom
      setPosition({
        x: start.center.x - (start.center.x - start.position.x) * ratio,
        y: start.center.y - (start.center.y - start.position.y) * ratio
      })
    } else if (e.touches.length === 1 && dragging && !pinching) {
      const t = e.touches[0]
      setPosition({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
    }
  }

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) setPinching(false)
    if (e.touches.length === 0) setDragging(false)
  }

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart])

  useEffect(() => {
    if (!preview) return
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.target.closest('.crop-drag-area')) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const centerX = rect.left + VIEW_SIZE / 2
      const centerY = rect.top + VIEW_SIZE / 2
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((z) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta))
        if (newZoom === z) return z
        setPosition((pos) => {
          const ratio = newZoom / z
          return {
            x: centerX - rect.left - (centerX - rect.left - pos.x) * ratio,
            y: centerY - rect.top - (centerY - rect.top - pos.y) * ratio
          }
        })
        return newZoom
      })
    }
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && e.target.closest('.crop-drag-area')) e.preventDefault()
    }
    const onTouchStartPassive = (e) => {
      if (e.touches.length === 2 && e.target.closest('.crop-drag-area')) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchstart', onTouchStartPassive, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchstart', onTouchStartPassive)
    }
  }, [preview])

  const handleConfirm = () => {
    if (!imgRef.current || !imageSize.w) return
    const img = imgRef.current
    const { w: iw, h: ih } = imageSize
    const s = effectiveScale
    const v = VIEW_SIZE
    let sx = -position.x / s
    let sy = -position.y / s
    const sw = v / s
    const sh = v / s
    sx = Math.max(0, Math.min(iw - sw, sx))
    sy = Math.max(0, Math.min(ih - sh, sy))
    const canvas = document.createElement('canvas')
    canvas.width = MAX_SIZE
    canvas.height = MAX_SIZE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, MAX_SIZE, MAX_SIZE)
    const mime = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg'
    const mimeOut = mime === 'image/png' ? 'image/png' : 'image/jpeg'
    compressImageUnderMaxBytes(canvas, mimeOut, 500 * 1024)
      .then((blob) => onConfirm(blob))
      .catch(() => {
        canvas.toBlob((blob) => blob && onConfirm(blob), 'image/jpeg', 0.7)
      })
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="profil-foto-crop-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-120 bg-black/50"
            onClick={onCancel}
            aria-hidden
          />
          <motion.div
            key="profil-foto-crop-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profil-foto-crop-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={offcanvasTransition}
            className="fixed bottom-0 left-0 right-0 z-121 flex max-h-[min(92vh,100dvh)] flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.18)] dark:border-gray-700 dark:bg-gray-800"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              layout
              className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700"
            >
              <div className="min-w-0">
                <h3 id="profil-foto-crop-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Atur posisi foto
                </h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Geser dan zoom agar posisi pas. Scroll atau pinch untuk zoom. Maks. 500 KB.
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {preview ? (
                <>
                  <div
                    ref={containerRef}
                    className="crop-drag-area relative mx-auto overflow-hidden rounded-full bg-gray-100 touch-none dark:bg-gray-700"
                    style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    role="img"
                    aria-label="Area crop foto profil"
                  >
                    <img
                      ref={imgRef}
                      src={preview}
                      alt="Pratinjau crop"
                      className="pointer-events-none absolute select-none"
                      style={{
                        width: imageSize.w ? imageSize.w * effectiveScale : 'auto',
                        height: imageSize.h ? imageSize.h * effectiveScale : 'auto',
                        left: position.x,
                        top: position.y,
                        maxWidth: 'none'
                      }}
                      onLoad={onImageLoad}
                      draggable={false}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      disabled={zoom <= MIN_ZOOM}
                      className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border-2 border-gray-300 bg-white text-xl font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      aria-label="Zoom out"
                    >
                      −
                    </button>
                    <span className="min-w-16 text-center text-sm text-gray-500 dark:text-gray-400">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      disabled={zoom >= MAX_ZOOM}
                      className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border-2 border-gray-300 bg-white text-xl font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      aria-label="Zoom in"
                    >
                      +
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex justify-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="h-10 w-10 rounded-full border-2 border-primary-500 border-t-transparent"
                  />
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!preview}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
