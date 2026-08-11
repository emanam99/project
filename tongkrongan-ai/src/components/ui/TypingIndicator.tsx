'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';

export function TypingIndicator() {
  const typingStatuses = useChatStore((state) => state.typingStatuses);
  const characters = useChatStore((state) => state.characters);
  const activeTyping = Object.values(typingStatuses).filter((t) => t.isTyping);

  if (activeTyping.length === 0) return null;

  const getTypingText = () => {
    const names = activeTyping.map((t) => {
      const char = characters.find((c) => c.id === t.aiCharacterId);
      return char?.name || 'Seseorang';
    });

    if (names.length === 1) return `${names[0]} sedang mengetik...`;
    if (names.length === 2) return `${names[0]} dan ${names[1]} sedang mengetik...`;
    return `${names[0]} dan ${names.length - 1} lainnya sedang mengetik...`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex items-center gap-2 px-4 py-2 text-sm text-whatsapp-typing"
      >
        <div className="flex gap-1">
          <motion.span
            className="typing-dot"
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
          />
          <motion.span
            className="typing-dot"
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
          />
          <motion.span
            className="typing-dot"
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
          />
        </div>
        <span className="text-xs font-light italic">{getTypingText()}</span>
      </motion.div>
    </AnimatePresence>
  );
}
