'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Message, AICharacter, ReplyPreview } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';

interface ChatMessageProps {
  message: Message;
  character?: AICharacter | null;
  onReply: (message: Message) => void;
  isConsecutive?: boolean;
}

export function ChatMessage({ message, character, onReply, isConsecutive = false }: ChatMessageProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [showReplyButton, setShowReplyButton] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const isAI = message.senderType === 'ai';
  const isUser = message.senderType === 'user';
  const hasReply = message.replyToId && message.replyTo;

  // Handle swipe to reply
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart) {
      const diff = touchStart - e.changedTouches[0].clientX;
      if (diff > 50) {
        // Swipe left detected
        onReply(message);
      }
    }
    setTouchStart(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setTouchStart(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (touchStart) {
      const diff = touchStart - e.clientX;
      if (diff > 50) {
        onReply(message);
      }
    }
    setTouchStart(null);
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'HH:mm', { locale: localeID });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) return format(date, 'HH:mm', { locale: localeID });
      if (days === 1) return 'Kemarin';
      if (days < 7) return format(date, 'EEEE', { locale: localeID });
      return format(date, 'dd/MM/yyyy', { locale: localeID });
    } catch {
      return '';
    }
  };

  return (
    <motion.div
      ref={messageRef}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-2 px-4 mb-1 group ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      } ${isConsecutive ? 'mt-0.5' : 'mt-3'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setShowReplyButton(true)}
      onMouseLeave={() => setShowReplyButton(false)}
    >
      {/* Avatar - only show for AI and not consecutive */}
      {isAI && !isConsecutive && character && (
        <div className="self-end mb-1">
          <Avatar
            name={character.name}
            avatar={character.avatar}
            color={character.color}
            size="sm"
            showStatus
            mood={character.mood}
            isOnline={character.isOnline}
            isActive={character.isActive}
          />
        </div>
      )}
      {isAI && isConsecutive && <div className="w-8 flex-shrink-0" />}

      {/* Message content */}
      <div className={`max-w-[85%] md:max-w-[65%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender name */}
        {!isConsecutive && !isUser && character && (
          <span
            className="text-xs font-semibold mb-0.5 ml-1"
            style={{ color: character.color }}
          >
            {character.name}
          </span>
        )}
        {!isConsecutive && isUser && (
          <span className="text-xs font-semibold mb-0.5 mr-1 text-whatsapp-green">
            Kamu
          </span>
        )}

        {/* Reply preview */}
        {hasReply && message.replyTo && (
          <div
            className={`reply-preview text-xs ${isUser ? 'border-whatsapp-green' : 'border-whatsapp-primary'}`}
          >
            <span className="font-medium text-whatsapp-text-secondary">
              {message.replyTo.senderName}
            </span>
            <p className="text-whatsapp-text-secondary truncate max-w-[200px]">
              {message.replyTo.content}
            </p>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`relative ${
            isUser
              ? 'chat-bubble-user'
              : 'chat-bubble-ai'
          }`}
        >
          <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
          
          {/* Time and status */}
          <div className={`flex items-center gap-1 mt-1 ${
            isUser ? 'justify-end' : 'justify-start'
          }`}>
            <span className="text-[10px] text-whatsapp-text-secondary/60">
              {formatTime(message.createdAt)}
            </span>
            {isUser && (
              <svg viewBox="0 0 16 11" className="w-4 h-3 fill-whatsapp-green/70">
                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.336.153.53.53 0 0 0 0 .718l2.394 2.494a.47.47 0 0 0 .336.153.48.48 0 0 0 .345-.178l6.309-7.81a.523.523 0 0 0 .102-.38.468.468 0 0 0-.228-.406.493.493 0 0 0-.381-.102z" />
              </svg>
            )}
          </div>
        </div>

        {/* Reply button on hover */}
        {showReplyButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-xs text-whatsapp-text-secondary hover:text-whatsapp-green mt-1 transition-colors"
            onClick={() => onReply(message)}
          >
            Balas
          </motion.button>
        )}
      </div>

      {/* User avatar placeholder (always show for consistency) */}
      {isUser && (
        <div className="self-end mb-1">
          <Avatar
            name="Kamu"
            avatar=""
            color="#00a884"
            size="sm"
          />
        </div>
      )}
    </motion.div>
  );
}
