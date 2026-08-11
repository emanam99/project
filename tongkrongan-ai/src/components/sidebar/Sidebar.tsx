'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';
import { Avatar } from '@/components/ui/Avatar';
import { toggleAI } from '@/services/socket-service';
import { AICharacter, AIChatMood } from '@/types';

const moodLabels: Record<AIChatMood, string> = {
  happy: 'Happy',
  malas: 'Malas',
  aktif: 'Aktif',
  ngantuk: 'Ngantuk',
  sensitif: 'Sensitif',
  absurd: 'Absurd',
};

const moodColors: Record<AIChatMood, string> = {
  happy: '#22c55e',
  malas: '#eab308',
  aktif: '#3b82f6',
  ngantuk: '#8b5cf6',
  sensitif: '#ef4444',
  absurd: '#f97316',
};

export function Sidebar() {
  const { characters, setSidebarOpen, messages, toggleCharacterActive } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Get last message for each character
  const getLastMessage = (characterId: string) => {
    const charMessages = messages.filter((m) => m.aiCharacterId === characterId);
    if (charMessages.length === 0) return null;
    return charMessages[charMessages.length - 1];
  };

  const filteredCharacters = characters.filter((char) =>
    char.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = (char: AICharacter) => {
    const newActive = !char.isActive;
    toggleAI(char.id, newActive);
    toggleCharacterActive(char.id);
  };

  const sortedCharacters = [...filteredCharacters].sort((a, b) => {
    // Online/active first
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full flex flex-col">
      {/* Sidebar Header */}
      <div className="bg-whatsapp-header p-4 border-b border-whatsapp-divider/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-whatsapp-text">Tongkrongan AI</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-whatsapp-icon-strong hover:text-whatsapp-text p-1 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 fill-whatsapp-text-secondary absolute left-3 top-1/2 -translate-y-1/2"
          >
            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.207 5.184 5.184 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.006zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari anggota grup..."
            className="w-full bg-whatsapp-input-bg text-whatsapp-text rounded-lg pl-10 pr-4 py-2 text-sm
                       placeholder:text-whatsapp-text-secondary/60 outline-none"
          />
        </div>
      </div>

      {/* Character list */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          {/* Group info header */}
          <div className="px-4 py-2 text-xs font-medium text-whatsapp-text-secondary uppercase tracking-wider">
            Anggota Grup — {characters.filter((c) => c.isActive).length} aktif
          </div>

          <AnimatePresence>
            {sortedCharacters.map((char, index) => {
              const lastMsg = getLastMessage(char.id);
              return (
                <motion.div
                  key={char.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`sidebar-item ${!char.isActive ? 'opacity-50' : ''}`}
                >
                  {/* Avatar */}
                  <div className="relative">
                    <Avatar
                      name={char.name}
                      avatar={char.avatar}
                      color={char.color}
                      size="md"
                      showStatus
                      mood={char.mood}
                      isOnline={char.isOnline}
                      isActive={char.isActive}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-whatsapp-text truncate">
                        {char.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Mood badge */}
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: moodColors[char.mood] + '20',
                            color: moodColors[char.mood],
                          }}
                        >
                          {moodLabels[char.mood]}
                        </span>
                        {/* Toggle switch */}
                        <label
                          className="relative inline-flex items-center cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={char.isActive}
                            onChange={() => handleToggle(char)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-whatsapp-divider rounded-full peer peer-checked:bg-whatsapp-green/30 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:bg-whatsapp-green" />
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastMsg ? (
                        <span className="text-xs text-whatsapp-text-secondary truncate">
                          {lastMsg.content.slice(0, 40)}
                          {lastMsg.content.length > 40 ? '...' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-whatsapp-text-secondary/40 italic">
                          Belum ada pesan
                        </span>
                      )}
                    </div>
                    {/* Character info */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-whatsapp-text-secondary/40">
                        {char.gender === 'male' ? '👤' : '👩'} {char.age} thn
                      </span>
                      <span className="text-[10px] text-whatsapp-text-secondary/40">
                        • {char.isOnline ? '🟢 Online' : '⚪ Offline'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Sidebar footer */}
      <div className="p-4 border-t border-whatsapp-divider/50 bg-whatsapp-header">
        <div className="text-xs text-whatsapp-text-secondary text-center">
          <p>Tongkrongan AI v1.0</p>
          <p className="text-[10px] mt-1">
            {characters.filter((c) => c.isActive).length} AI aktif •{' '}
            {messages.length} pesan
          </p>
        </div>
      </div>
    </div>
  );
}
