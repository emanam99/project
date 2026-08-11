import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ImageEditor from './ImageEditor'

function ImageEditorModal({ isOpen, onClose, imageFile, onSave }) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSave = async (editedFile) => {
    setIsProcessing(true)
    try {
      if (onSave) {
        await onSave(editedFile)
      }
      if (onClose) {
        onClose()
      }
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
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-75 z-50"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-white dark:bg-gray-800 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            <ImageEditor
              imageFile={imageFile}
              onSave={handleSave}
              onCancel={onClose}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default ImageEditorModal
