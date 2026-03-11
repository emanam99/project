import { useState, useRef, useEffect } from 'react'
import { compressImageUnderMaxBytes } from '../../../utils/imageCompress'

const MAX_SIZE = 400
const VIEW_SIZE = 300
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

function getTouchDistance(t0, t1) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
}

function getTouchCenter(t0, t1) {
  return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }
}

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

  useEffect(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(file)
    setPosition({ x: 0, y: 0 })
    setScale(1)
    setZoom(1)
    return () => {}
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
    if (!containerRef.current) return
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
    if (!containerRef.current) return
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

  if (!file || !preview) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Atur posisi foto</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Geser dan zoom foto agar posisi pas. Scroll atau pinch untuk zoom. Maks. 500 KB.</p>
        </div>
        <div
          ref={containerRef}
          className="crop-drag-area relative mx-auto my-4 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 touch-none"
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
            alt="Crop"
            className="absolute select-none pointer-events-none"
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
        <div className="px-4 pb-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="w-10 h-10 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center text-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[4rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="w-10 h-10 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center text-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
        <div className="p-4 flex gap-2 justify-end border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}
