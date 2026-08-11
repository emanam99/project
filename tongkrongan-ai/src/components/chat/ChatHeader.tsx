'use client';

import { motion } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';

export function ChatHeader() {
  const { isConnected, isSidebarOpen, toggleSidebar, characters } = useChatStore();
  const activeCount = characters.filter((c) => c.isActive).length;
  const onlineCount = characters.filter((c) => c.isOnline && c.isActive).length;

  return (
    <motion.header
      initial={{ y: -50 }}
      animate={{ y: 0 }}
      className="h-16 bg-whatsapp-header flex items-center justify-between px-4 border-b border-whatsapp-divider/50 z-20"
    >
      <div className="flex items-center gap-3">
        {/* Hamburger menu for sidebar */}
        <button
          onClick={toggleSidebar}
          className="text-whatsapp-icon-strong hover:text-whatsapp-text transition-colors p-1"
          aria-label="Toggle sidebar"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </button>

        <div>
          <h1 className="text-lg font-semibold text-whatsapp-text">
            Tongkrongan AI
          </h1>
          <div className="flex items-center gap-2 text-xs text-whatsapp-text-secondary">
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span>{isConnected ? 'Terhubung' : 'Menyambung...'}</span>
            </div>
            <span>•</span>
            <span>{onlineCount}/{activeCount} online</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connection status indicator */}
        <motion.div
          animate={{ scale: isConnected ? 1 : [1, 1.2, 1] }}
          transition={{ repeat: isConnected ? 0 : Infinity, duration: 1.5 }}
          className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
        />

        {/* Search button */}
        <button className="text-whatsapp-icon-strong hover:text-whatsapp-text transition-colors p-1">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.207 5.184 5.184 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.006zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" />
          </svg>
        </button>

        {/* Menu button */}
        <button className="text-whatsapp-icon-strong hover:text-whatsapp-text transition-colors p-1">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z" />
          </svg>
        </button>
      </div>
    </motion.header>
  );
}
