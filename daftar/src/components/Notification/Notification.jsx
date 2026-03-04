import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'

function Notification({ message, type = 'info', onClose, duration = null }) {
  // Tentukan icon dan warna berdasarkan type
  let icon, bgColor, textColor, borderColor, iconBg
  
  switch(type) {
    case 'success':
      icon = '✅'
      bgColor = 'bg-green-50 dark:bg-green-900/20'
      textColor = 'text-green-800 dark:text-green-200'
      borderColor = 'border-green-200 dark:border-green-800'
      iconBg = 'bg-green-100 dark:bg-green-800'
      break
    case 'error':
      icon = '❌'
      bgColor = 'bg-red-50 dark:bg-red-900/20'
      textColor = 'text-red-800 dark:text-red-200'
      borderColor = 'border-red-200 dark:border-red-800'
      iconBg = 'bg-red-100 dark:bg-red-800'
      break
    case 'warning':
      icon = '⚠️'
      bgColor = 'bg-yellow-50 dark:bg-yellow-900/20'
      textColor = 'text-yellow-800 dark:text-yellow-200'
      borderColor = 'border-yellow-200 dark:border-yellow-800'
      iconBg = 'bg-yellow-100 dark:bg-yellow-800'
      break
    case 'loading':
      icon = '⏳'
      bgColor = 'bg-blue-50 dark:bg-blue-900/20'
      textColor = 'text-blue-800 dark:text-blue-200'
      borderColor = 'border-blue-200 dark:border-blue-800'
      iconBg = 'bg-blue-100 dark:bg-blue-800'
      break
    default:
      icon = 'ℹ️'
      bgColor = 'bg-gray-50 dark:bg-gray-800'
      textColor = 'text-gray-800 dark:text-gray-200'
      borderColor = 'border-gray-200 dark:border-gray-700'
      iconBg = 'bg-gray-100 dark:bg-gray-700'
  }
  
  // Auto close untuk notifikasi non-loading
  useEffect(() => {
    if (type !== 'loading' && duration !== null) {
      const timer = setTimeout(() => {
        if (onClose) onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [type, duration, onClose])
  
  return createPortal(
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'tween', duration: 0.3 }}
      className={`fixed top-4 right-4 z-[9999] w-full max-w-xs sm:max-w-sm md:max-w-md ${bgColor} ${borderColor} border rounded-lg shadow-lg`}
    >
      <div className="flex items-start p-4">
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 ${iconBg} rounded-full flex items-center justify-center`}>
            <span className="text-lg">{icon}</span>
          </div>
        </div>
        <div className="ml-3 flex-1">
          <p className={`text-sm font-medium ${textColor}`}>{message}</p>
        </div>
        <div className="ml-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      {type === 'loading' && (
        <div className="h-1 bg-blue-200 dark:bg-blue-800 rounded-b-lg">
          <div className="h-1 bg-blue-500 dark:bg-blue-400 rounded-b-lg animate-pulse" style={{ width: '100%' }}></div>
        </div>
      )}
    </motion.div>,
    document.body
  )
}

export default Notification
