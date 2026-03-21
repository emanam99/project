import { useState, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChatAiHeaderContext } from '../../contexts/ChatAiHeaderContext'

/**
 * Bungkus satu kartu + satu slot header untuk semua rute /chat-ai/*
 * (isi header diisi lewat context dari halaman anak — tidak reload seluruh chrome).
 */
export default function ChatAiLayout() {
  const [header, setHeader] = useState(null)
  const value = useMemo(() => setHeader, [])

  return (
    <ChatAiHeaderContext.Provider value={value}>
      {/* HP: tanpa padding — menempel atas/samping/bawah (atas pakai safe area); bg transparan = latar gradient Layout */}
      <div className="h-full min-h-0 overflow-hidden bg-transparent p-0 sm:bg-primary-50/70 sm:p-3 dark:bg-transparent dark:sm:bg-gray-950 max-sm:pt-[env(safe-area-inset-top,0px)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0 sm:rounded-lg sm:border sm:border-gray-200/90 sm:bg-white sm:shadow-md sm:ring-1 sm:ring-primary-900/5 dark:sm:border-gray-700 dark:sm:bg-gray-800 dark:sm:ring-white/5">
              {header}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
                <Outlet />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </ChatAiHeaderContext.Provider>
  )
}
