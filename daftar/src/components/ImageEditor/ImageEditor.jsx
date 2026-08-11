import { useState, useRef, useEffect } from 'react'
import { detectDocumentCorners, detectDocumentCornersOpenCV, perspectiveTransform } from '../../utils/documentDetection'
import { enhanceImageWithCanvas } from '../../utils/imageEnhancement'
import ControlDrawer from './ControlDrawer'

function ImageEditor({ imageFile, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const sourceCanvasRef = useRef(null)
  const containerRef = useRef(null)
  
  const [image, setImage] = useState(null)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [cropCorners, setCropCorners] = useState(null)
  const [isAutoCropping, setIsAutoCropping] = useState(false)
  const [showCropOverlay, setShowCropOverlay] = useState(false)
  const [useOpenCV, setUseOpenCV] = useState(false)
  const [isManualCropMode, setIsManualCropMode] = useState(false)
  const [draggingCorner, setDraggingCorner] = useState(null)
  const [dragStartPos, setDragStartPos] = useState(null)

  useEffect(() => {
    if (imageFile) {
      loadImage(imageFile)
    }
  }, [imageFile])

  useEffect(() => {
    if (image) {
      applyFilters()
    }
  }, [image, brightness, contrast, rotation, cropCorners])

  const loadImage = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setImage(img)
        // Reset filters
        setBrightness(0)
        setContrast(100)
        setRotation(0)
        setCropCorners(null)
        setShowCropOverlay(false)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  const applyFilters = () => {
    if (!image || !sourceCanvasRef.current || !canvasRef.current) return

    const sourceCanvas = sourceCanvasRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })

    // Set source canvas size
    sourceCanvas.width = image.width
    sourceCanvas.height = image.height
    sourceCtx.drawImage(image, 0, 0)

    // Apply rotation
    canvas.width = image.width
    canvas.height = image.height
    ctx.save()
    
    if (rotation !== 0) {
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-canvas.width / 2, -canvas.height / 2)
    }

    // Apply crop if exists
    if (cropCorners && showCropOverlay) {
      // Draw cropped area
      ctx.beginPath()
      ctx.moveTo(cropCorners[0].x, cropCorners[0].y)
      ctx.lineTo(cropCorners[1].x, cropCorners[1].y)
      ctx.lineTo(cropCorners[2].x, cropCorners[2].y)
      ctx.lineTo(cropCorners[3].x, cropCorners[3].y)
      ctx.closePath()
      ctx.clip()
    }

    // Draw image
    ctx.drawImage(sourceCanvas, 0, 0)

    // Apply brightness and contrast
    const brightnessValue = 1 + (brightness / 100)
    const contrastValue = contrast / 100
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      // Brightness
      data[i] = Math.min(255, Math.max(0, data[i] * brightnessValue))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * brightnessValue))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * brightnessValue))

      // Contrast
      data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * contrastValue) + 128))
      data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * contrastValue) + 128))
      data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * contrastValue) + 128))
    }

    ctx.putImageData(imageData, 0, 0)
    ctx.restore()
  }

  const handleAutoCrop = async () => {
    if (!image || !sourceCanvasRef.current) return

    setIsAutoCropping(true)
    try {
      const sourceCanvas = sourceCanvasRef.current
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
      
      sourceCanvas.width = image.width
      sourceCanvas.height = image.height
      ctx.drawImage(image, 0, 0)

      let corners
      if (useOpenCV) {
        try {
          corners = await detectDocumentCornersOpenCV(sourceCanvas)
        } catch (err) {
          console.warn('OpenCV detection failed, using fallback:', err)
          corners = await detectDocumentCorners(sourceCanvas)
        }
      } else {
        corners = await detectDocumentCorners(sourceCanvas)
      }

      setCropCorners(corners)
      setShowCropOverlay(true)
      setIsManualCropMode(true) // Aktifkan mode manual setelah auto crop
    } catch (error) {
      console.error('Error in auto crop:', error)
      alert('Gagal melakukan auto crop. Silakan coba lagi.')
    } finally {
      setIsAutoCropping(false)
    }
  }

  const handleManualCropToggle = () => {
    if (!image) return
    
    if (!showCropOverlay) {
      // Aktifkan manual crop dengan default corners
      const defaultCorners = [
        { x: image.width * 0.1, y: image.height * 0.1 },
        { x: image.width * 0.9, y: image.height * 0.1 },
        { x: image.width * 0.9, y: image.height * 0.9 },
        { x: image.width * 0.1, y: image.height * 0.9 }
      ]
      setCropCorners(defaultCorners)
      setShowCropOverlay(true)
      setIsManualCropMode(true)
    } else {
      setShowCropOverlay(false)
      setIsManualCropMode(false)
    }
  }

  const getCornerPosition = (cornerIndex) => {
    if (!cropCorners || !canvasRef.current) return { x: 0, y: 0 }
    const corner = cropCorners[cornerIndex]
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: (corner.x / scaleX) + rect.left,
      y: (corner.y / scaleY) + rect.top
    }
  }

  const handleCornerMouseDown = (e, cornerIndex) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingCorner(cornerIndex)
    setDragStartPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e) => {
    if (draggingCorner === null || !canvasRef.current || !cropCorners) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || dragStartPos.x
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || dragStartPos.y

    const deltaX = (clientX - dragStartPos.x) * scaleX
    const deltaY = (clientY - dragStartPos.y) * scaleY

    const newCorners = [...cropCorners]
    newCorners[draggingCorner] = {
      x: Math.max(0, Math.min(canvas.width, newCorners[draggingCorner].x + deltaX)),
      y: Math.max(0, Math.min(canvas.height, newCorners[draggingCorner].y + deltaY))
    }

    setCropCorners(newCorners)
    setDragStartPos({ x: clientX, y: clientY })
  }

  const handleMouseUp = () => {
    setDraggingCorner(null)
    setDragStartPos(null)
  }

  useEffect(() => {
    if (draggingCorner !== null) {
      const handleMove = (e) => handleMouseMove(e)
      const handleUp = () => handleMouseUp()
      const handleTouchMove = (e) => {
        e.preventDefault()
        handleMouseMove(e)
      }
      const handleTouchEnd = () => handleMouseUp()

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
      
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [draggingCorner, dragStartPos, cropCorners])

  const handleSave = async () => {
    if (!canvasRef.current || !sourceCanvasRef.current || !image) return

    try {
      // Buat canvas baru untuk hasil akhir
      const finalCanvas = document.createElement('canvas')
      const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true })
      
      let sourceCanvas = sourceCanvasRef.current
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
      
      // Reset source canvas dengan gambar asli
      sourceCanvas.width = image.width
      sourceCanvas.height = image.height
      sourceCtx.drawImage(image, 0, 0)
      
      // Apply crop terlebih dahulu jika ada
      if (cropCorners && showCropOverlay) {
        sourceCanvas = perspectiveTransform(sourceCanvas, cropCorners)
      }
      
      // Set ukuran final canvas
      finalCanvas.width = sourceCanvas.width
      finalCanvas.height = sourceCanvas.height
      
      // Apply rotation
      if (rotation !== 0) {
        finalCtx.save()
        finalCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2)
        finalCtx.rotate((rotation * Math.PI) / 180)
        finalCtx.translate(-finalCanvas.width / 2, -finalCanvas.height / 2)
      }
      
      finalCtx.drawImage(sourceCanvas, 0, 0)
      
      if (rotation !== 0) {
        finalCtx.restore()
      }
      
      // Apply brightness and contrast
      const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height)
      const data = imageData.data
      const brightnessValue = 1 + (brightness / 100)
      const contrastValue = contrast / 100

      for (let i = 0; i < data.length; i += 4) {
        // Brightness
        data[i] = Math.min(255, Math.max(0, data[i] * brightnessValue))
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * brightnessValue))
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * brightnessValue))

        // Contrast
        data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * contrastValue) + 128))
        data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * contrastValue) + 128))
        data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * contrastValue) + 128))
      }

      finalCtx.putImageData(imageData, 0, 0)

      // Convert to blob
      finalCanvas.toBlob((blob) => {
        if (blob) {
          const file = new File(
            [blob],
            `edited_${Date.now()}.jpg`,
            { type: 'image/jpeg', lastModified: Date.now() }
          )
          if (onSave) {
            onSave(file)
          }
        } else {
          alert('Gagal membuat file. Silakan coba lagi.')
        }
      }, 'image/jpeg', 0.92)
    } catch (error) {
      console.error('Error saving image:', error)
      alert('Gagal menyimpan gambar. Silakan coba lagi.')
    }
  }

  const handleReset = () => {
    setBrightness(0)
    setContrast(100)
    setRotation(0)
    if (image) {
      const defaultCorners = [
        { x: 0, y: 0 },
        { x: image.width, y: 0 },
        { x: image.width, y: image.height },
        { x: 0, y: image.height }
      ]
      setCropCorners(defaultCorners)
    } else {
      setCropCorners(null)
    }
    setShowCropOverlay(false)
    setIsManualCropMode(false)
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat gambar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-gray-900 flex items-center justify-center overflow-hidden">
      {/* Top Bar - Header dengan tombol Save/Cancel */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors backdrop-blur-sm flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            <span>Batal</span>
          </button>
          <h2 className="text-white font-semibold text-lg">Edit Gambar</h2>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <span>Simpan</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas Preview - Full Screen */}
      <div className="flex-1 overflow-auto p-4 pt-20 pb-24">
        <div ref={containerRef} className="flex items-center justify-center min-h-full">
          <div className="relative" style={{ display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[calc(100vh-200px)] border border-gray-700 rounded-lg shadow-2xl"
              style={{ display: 'block' }}
            />
            {showCropOverlay && cropCorners && isManualCropMode && canvasRef.current && (
              <>
                {/* Overlay dengan area gelap di luar crop */}
                <div
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: '100%',
                    height: '100%'
                  }}
                >
                  <svg
                    width="100%"
                    height="100%"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                    viewBox={`0 0 ${canvasRef.current.width} ${canvasRef.current.height}`}
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <mask id="crop-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <polygon
                          points={cropCorners.map(c => `${c.x},${c.y}`).join(' ')}
                          fill="black"
                        />
                      </mask>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(0, 0, 0, 0.5)"
                      mask="url(#crop-mask)"
                    />
                    <polygon
                      points={cropCorners.map(c => `${c.x},${c.y}`).join(' ')}
                      fill="none"
                      stroke="rgb(59, 130, 246)"
                      strokeWidth="3"
                    />
                  </svg>
                </div>
                
                {/* Corner handles - bisa di-drag */}
                {cropCorners.map((corner, index) => {
                  if (!canvasRef.current) return null
                  
                  const canvas = canvasRef.current
                  
                  // Hitung posisi dalam persentase dari canvas
                  const leftPercent = (corner.x / canvas.width) * 100
                  const topPercent = (corner.y / canvas.height) * 100
                  
                  return (
                    <div
                      key={index}
                      className="absolute w-8 h-8 bg-blue-600 border-2 border-white rounded-full cursor-move shadow-lg hover:bg-blue-700 hover:scale-125 transition-transform z-10"
                      style={{
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                        touchAction: 'none'
                      }}
                      onMouseDown={(e) => handleCornerMouseDown(e, index)}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        const touch = e.touches[0]
                        handleCornerMouseDown({
                          preventDefault: () => {},
                          stopPropagation: () => {},
                          clientX: touch.clientX,
                          clientY: touch.clientY
                        }, index)
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-full"></div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            {showCropOverlay && cropCorners && !isManualCropMode && (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="w-full h-full" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <polygon
                    points={cropCorners.map(c => `${c.x},${c.y}`).join(' ')}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="rgb(59, 130, 246)"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden source canvas */}
      <canvas ref={sourceCanvasRef} className="hidden" />

      {/* Control Drawer */}
      <ControlDrawer
        brightness={brightness}
        setBrightness={setBrightness}
        contrast={contrast}
        setContrast={setContrast}
        rotation={rotation}
        setRotation={setRotation}
        onAutoCrop={handleAutoCrop}
        onManualCropToggle={handleManualCropToggle}
        isAutoCropping={isAutoCropping}
        showCropOverlay={showCropOverlay}
        isManualCropMode={isManualCropMode}
        onReset={handleReset}
      />
    </div>
  )
}

export default ImageEditor
