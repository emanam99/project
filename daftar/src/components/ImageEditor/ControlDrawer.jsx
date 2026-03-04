import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function ControlDrawer({
  brightness,
  setBrightness,
  contrast,
  setContrast,
  rotation,
  setRotation,
  onAutoCrop,
  onManualCropToggle,
  isAutoCropping,
  showCropOverlay,
  isManualCropMode,
  onReset
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAdjusting, setIsAdjusting] = useState(false)

  const handleSliderPointerDown = () => setIsAdjusting(true)

  // Hanya pointerup = jari benar-benar diangkat. Jangan dengar pointercancel (saat geser jauh browser bisa cancel = transparan balik padahal jari belum lepas).
  useEffect(() => {
    if (!isAdjusting) return
    const release = () => setIsAdjusting(false)
    document.addEventListener('pointerup', release, true)
    return () => document.removeEventListener('pointerup', release, true)
  }, [isAdjusting])

  return (
    <>
      {/* Toggle Button - Floating, lebih kecil */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 w-11 h-11 bg-teal-600/90 hover:bg-teal-700 text-white rounded-full shadow-lg z-40 flex items-center justify-center transition-all hover:scale-105 backdrop-blur-sm"
      >
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop - transparan */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 z-30"
            />

            {/* Drawer - transparan; saat geser slider: 90% transparan + blur hilang */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className={`fixed bottom-0 left-0 right-0 rounded-t-2xl z-40 max-h-[80vh] overflow-y-auto transition-all duration-200 ${
                isAdjusting
                  ? 'bg-black/40 dark:bg-black/50 opacity-10 backdrop-blur-none'
                  : 'bg-black/40 dark:bg-black/50 backdrop-blur-md'
              }`}
            >
              {/* Handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-0.5 bg-white/50 rounded-full"></div>
              </div>

              {/* Header - lebih ringkas */}
              <div className="px-4 pb-2 border-b border-white/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/95">
                    Edit Gambar
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-white/70 hover:text-white rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content - tombol & opsi lebih kecil */}
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={onAutoCrop}
                    disabled={isAutoCropping}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-blue-600/90 hover:bg-blue-700 disabled:bg-gray-500/50 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 font-medium"
                  >
                    {isAutoCropping ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent shrink-0"></div>
                        <span className="truncate">Mendeteksi...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span className="truncate">Auto Crop</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={onManualCropToggle}
                    className={`flex-1 min-w-0 px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5 font-medium ${
                      showCropOverlay && isManualCropMode
                        ? 'bg-green-600/90 hover:bg-green-700 text-white'
                        : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path>
                    </svg>
                    <span className="truncate">{showCropOverlay && isManualCropMode ? 'Matikan Crop Manual' : 'Crop Manual'}</span>
                  </button>
                </div>
                {showCropOverlay && isManualCropMode && (
                  <p className="text-[10px] text-white/60 text-center">Geser pojok biru untuk sesuaikan crop</p>
                )}

                {/* Kecerahan */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/90 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
                      </svg>
                      Kecerahan
                    </label>
                    <span className="text-xs font-semibold text-white/95">{brightness > 0 ? '+' : ''}{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    onPointerDown={handleSliderPointerDown}
                    className="w-full h-1.5 bg-white/30 rounded-full appearance-none cursor-pointer accent-teal-400 touch-none select-none"
                  />
                </div>

                {/* Kontras */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/90 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path>
                      </svg>
                      Kontras
                    </label>
                    <span className="text-xs font-semibold text-white/95">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    onPointerDown={handleSliderPointerDown}
                    className="w-full h-1.5 bg-white/30 rounded-full appearance-none cursor-pointer accent-teal-400 touch-none select-none"
                  />
                </div>

                {/* Rotasi */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/90 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                      Rotasi
                    </label>
                    <span className="text-xs font-semibold text-white/95">{rotation}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRotation(rotation - 90)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    </button>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      onPointerDown={handleSliderPointerDown}
                      className="flex-1 h-1.5 bg-white/30 rounded-full appearance-none cursor-pointer accent-teal-400 touch-none select-none"
                    />
                    <button
                      onClick={() => setRotation(rotation + 90)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 20v-5h-.582m0 0a8.001 8.001 0 00-15.356-2m15.356 2H15m0 0v-5m0 5h5m-11 11a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <button
                  onClick={onReset}
                  className="w-full px-3 py-2 text-sm bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium"
                >
                  Reset Semua
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default ControlDrawer
