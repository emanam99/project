'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from '@/components/ui/TypingIndicator';

export function ChatMessages() {
  const { messages, characters, isLoading, setReplyPreview, unreadCount, resetUnread } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Auto-scroll on new messages
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  useEffect(() => {
    if (isAutoScrolling) {
      scrollToBottom();
    }
  }, [messages, isAutoScrolling, scrollToBottom]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    setShowScrollButton(!isNearBottom);
    setIsAutoScrolling(isNearBottom);
    
    // Reset unread when scrolled to bottom
    if (isNearBottom && unreadCount > 0) {
      resetUnread();
    }
  }, [unreadCount, resetUnread]);

  // Group consecutive messages by sender
  const getMessageGroups = () => {
    const groups: Array<{
      messages: typeof messages;
      character: any;
    }> = [];

    messages.forEach((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const isConsecutive = prevMsg?.senderName === msg.senderName && prevMsg?.senderType === msg.senderType;
      const character = characters.find((c) => c.id === msg.aiCharacterId);

      if (isConsecutive && groups.length > 0) {
        groups[groups.length - 1].messages.push(msg);
      } else {
        groups.push({ messages: [msg], character });
      }
    });

    return groups;
  };

  const messageGroups = getMessageGroups();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="w-8 h-8 border-2 border-whatsapp-primary border-t-transparent rounded-full mx-auto mb-3"
          />
          <p className="text-whatsapp-text-secondary text-sm">Memuat pesan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Messages container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-2 py-4 space-y-0.5 scroll-smooth"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 50%, rgba(0, 168, 132, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(0, 88, 75, 0.05) 0%, transparent 50%)
          `,
        }}
      >
        {/* Welcome message */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 px-4"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="text-5xl mb-4"
            >
              🏕️
            </motion.div>
            <h2 className="text-xl font-semibold text-whatsapp-text mb-2">
              Selamat datang di Tongkrongan AI!
            </h2>
            <p className="text-whatsapp-text-secondary text-sm max-w-md mx-auto">
              Grup chat penuh AI dengan kepribadian Indonesia yang asik. 
              Mulai ngobrol dan lihat mereka berinteraksi secara alami!
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {characters.slice(0, 6).map((char) => (
                <span
                  key={char.id}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ backgroundColor: char.color + '20', color: char.color }}
                >
                  {char.name}
                </span>
              ))}
              <span className="text-xs px-2 py-1 rounded-full bg-whatsapp-active text-whatsapp-text-secondary">
                +{characters.length - 6} lainnya
              </span>
            </div>
          </motion.div>
        )}

        {/* Messages */}
        <AnimatePresence>
          {messageGroups.map((group, groupIndex) => (
            <div key={group.messages[0].id}>
              {/* Date divider */}
              {groupIndex > 0 && (() => {
                const prevDate = new Date(messageGroups[groupIndex - 1].messages[0].createdAt);
                const currDate = new Date(group.messages[0].createdAt);
                const diffHours = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);
                
                if (diffHours > 2) {
                  return (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-xs text-whatsapp-text-secondary bg-whatsapp-active/50 px-3 py-1 rounded-full">
                        {new Intl.DateTimeFormat('id-ID', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: currDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                        }).format(currDate)}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Unread divider */}
              {groupIndex === Math.floor(messageGroups.length / 2) && unreadCount > 0 && (
                <div className="unread-divider">
                  <span>Pesan baru</span>
                </div>
              )}

              {group.messages.map((msg, msgIndex) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  character={group.character}
                  onReply={(message) => {
                    setReplyPreview({
                      messageId: message.id,
                      content: message.content,
                      senderName: message.senderName,
                    });
                  }}
                  isConsecutive={msgIndex > 0}
                />
              ))}
            </div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <TypingIndicator />

        {/* Invisible anchor for scrolling */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            onClick={() => {
              scrollToBottom();
              setIsAutoScrolling(true);
            }}
            className="scroll-to-bottom"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Unread count badge */}
      <AnimatePresence>
        {!showScrollButton && unreadCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-4 right-4 bg-whatsapp-green text-white text-xs font-bold px-2 py-0.5 rounded-full"
          >
            {unreadCount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
