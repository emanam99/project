'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';
import { sendMessage, sendTypingStart, sendTypingStop } from '@/services/socket-service';

export function ChatInput() {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { replyPreview, setReplyPreview } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px';
    }
  }, [input]);

  // Typing indicator handler
  useEffect(() => {
    if (input && !isTyping) {
      setIsTyping(true);
      sendTypingStart();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        sendTypingStop();
      }
    }, 2000);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [input, isTyping]);

  const handleSubmit = () => {
    const content = input.trim();
    if (!content) return;

    sendMessage(content, replyPreview?.messageId || null);
    setInput('');
    setReplyPreview(null);
    setIsTyping(false);
    sendTypingStop();

    // Focus back on input
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const cancelReply = () => {
    setReplyPreview(null);
    inputRef.current?.focus();
  };

  return (
    <div className="border-t border-whatsapp-divider/50 bg-whatsapp-header px-4 py-3">
      {/* Reply preview */}
      <AnimatePresence>
        {replyPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 mb-2 bg-whatsapp-active/50 rounded-lg p-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-whatsapp-green font-medium">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                </svg>
                Membalas {replyPreview.senderName}
              </div>
              <p className="text-xs text-whatsapp-text-secondary truncate mt-0.5">
                {replyPreview.content}
              </p>
            </div>
            <button
              onClick={cancelReply}
              className="text-whatsapp-text-secondary hover:text-whatsapp-text p-1"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="flex items-end gap-3">
        {/* Emoji button */}
        <button className="text-whatsapp-icon-strong hover:text-whatsapp-text transition-colors p-1 mb-1">
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M9.153 11.603c.795 0 1.44-.645 1.44-1.44s-.645-1.44-1.44-1.44-1.44.645-1.44 1.44.645 1.44 1.44 1.44zm5.694 0c.795 0 1.44-.645 1.44-1.44s-.645-1.44-1.44-1.44-1.44.645-1.44 1.44.645 1.44 1.44 1.44zm-2.847 5.352c-2.29 0-4.297-1.22-5.588-2.99l1.447-1.02c.797 1.122 2.226 2.01 4.141 2.01s3.344-.888 4.141-2.01l1.447 1.02c-1.291 1.77-3.298 2.99-5.588 2.99zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan..."
            rows={1}
            className="chat-input"
            maxLength={2000}
          />
        </div>

        {/* Send button or voice */}
        {input.trim() ? (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleSubmit}
            className="bg-whatsapp-primary hover:bg-whatsapp-green-dark text-white rounded-full p-2 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
            </svg>
          </motion.button>
        ) : (
          <button className="text-whatsapp-icon-strong hover:text-whatsapp-text transition-colors p-1 mb-1">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
              <path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
