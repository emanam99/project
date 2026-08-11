'use client';

import { motion } from 'framer-motion';
import { AIChatMood } from '@/types';

interface AvatarProps {
  name: string;
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  color: string;
  isOnline?: boolean;
  isActive?: boolean;
  mood?: AIChatMood;
  showStatus?: boolean;
  className?: string;
}

const moodEmoji: Record<AIChatMood, string> = {
  happy: '😊',
  malas: '😴',
  aktif: '⚡',
  ngantuk: '😪',
  sensitif: '😤',
  absurd: '🤪',
};

const moodColors: Record<AIChatMood, string> = {
  happy: '#22c55e',
  malas: '#eab308',
  aktif: '#3b82f6',
  ngantuk: '#8b5cf6',
  sensitif: '#ef4444',
  absurd: '#f97316',
};

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

const statusSizeMap = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export function Avatar({
  name,
  avatar,
  size = 'md',
  color,
  isOnline,
  isActive,
  mood,
  showStatus = false,
  className = '',
}: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const statusColor = isActive === false ? '#8696a0' : (mood ? moodColors[mood] : '#22c55e');
  const statusLabel = isActive === false ? 'offline' : (isOnline ? 'online' : 'offline');

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <motion.div
        className={`${sizeMap[size]} rounded-full flex items-center justify-center font-bold text-white select-none overflow-hidden`}
        style={{ backgroundColor: color || '#00a884' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={`${name} - ${mood ? moodEmoji[mood] + ' ' + mood : ''}`}
      >
        {avatar ? (
          <img
            src={`/avatars/${avatar}.svg`}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initials on error
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerText = initials;
            }}
          />
        ) : (
          initials
        )}
      </motion.div>

      {/* Online/Status indicator */}
      {showStatus && (
        <>
          <motion.div
            className={`${statusSizeMap[size]} rounded-full border-2 border-whatsapp-background absolute -bottom-0.5 -right-0.5`}
            style={{ backgroundColor: statusColor }}
            animate={{ scale: isOnline ? [1, 1.2, 1] : 1 }}
            transition={{ repeat: isOnline ? Infinity : 0, duration: 2 }}
          />
          {mood && (
            <span className="absolute -top-1 -right-1 text-xs" title={mood}>
              {moodEmoji[mood]}
            </span>
          )}
        </>
      )}
    </div>
  );
}
