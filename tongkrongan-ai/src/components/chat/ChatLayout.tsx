'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { Sidebar } from '@/components/sidebar/Sidebar';

export function ChatLayout() {
  const { isSidebarOpen, setSidebarOpen } = useChatStore();

  return (
    <div className="h-full flex relative">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -320 }}
        animate={{ x: isSidebarOpen ? 0 : -320 }}
        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
        className="fixed left-0 top-0 bottom-0 w-80 bg-whatsapp-background border-r border-whatsapp-divider z-40 md:relative md:translate-x-0 md:z-auto"
      >
        <Sidebar />
      </motion.aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <ChatHeader />
        <ChatMessages />
        <ChatInput />
      </div>
    </div>
  );
}
