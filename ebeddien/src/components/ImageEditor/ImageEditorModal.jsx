import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ImageEditor from './ImageEditor'

/**
 * Editor gambar layar penuh di atas konten (tanpa ganti route) — pola sama aplikasi daftar.
 */
function ImageEditorModal({ isOpen, onClose, imageFile, onSave, zIndex = 10050 }) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSave = async (editedFile) => {
    setIsProcessing(true)
    try {
      if (onSave) await onSave(editedFile)
      onClose?.()
    } catch (error) {
      console.error('Error saving edited image:', error)
      alert('Gagal menyimpan gambar. Silakan coba lagi.')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen || !imageFile) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isProcessing && onClose?.()}
            className="fixed inset-0 bg-black/80"
            style={{ zIndex }}
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="fixed inset-2 sm:inset-4 md:inset-8 bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700"
            style={{ zIndex: zIndex + 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <ImageEditor
              imageFile={imageFile}
              onSave={handleSave}
              onCancel={() => !isProcessing && onClose?.()}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default ImageEditorModal
