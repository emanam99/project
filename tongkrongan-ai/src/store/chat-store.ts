'use client';

import { create } from 'zustand';
import { Message, AICharacter, TypingStatus, TypingStatusMap, AIChatMood, ReplyPreview } from '@/types';

interface ChatStore {
  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  removeMessage: (messageId: string) => void;

  // Characters
  characters: AICharacter[];
  setCharacters: (characters: AICharacter[]) => void;
  toggleCharacterActive: (characterId: string) => void;
  setCharacterMood: (characterId: string, mood: AIChatMood) => void;
  setCharacterOnline: (characterId: string, isOnline: boolean) => void;

  // Typing
  typingStatuses: TypingStatusMap;
  setTypingStatus: (status: TypingStatus) => void;
  removeTypingStatus: (characterId: string) => void;

  // Connection
  isConnected: boolean;
  setConnected: (status: boolean) => void;

  // UI
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  unreadCount: number;
  incrementUnread: () => void;
  resetUnread: () => void;

  // Reply
  replyPreview: ReplyPreview | null;
  setReplyPreview: (preview: ReplyPreview | null) => void;

  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Messages
  messages: [],
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      unreadCount: state.unreadCount + 1,
    }));
  },
  setMessages: (messages) => set({ messages }),
  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
  },

  // Characters
  characters: [],
  setCharacters: (characters) => set({ characters }),
  toggleCharacterActive: (characterId) => {
    set((state) => ({
      characters: state.characters.map((char) =>
        char.id === characterId ? { ...char, isActive: !char.isActive } : char
      ),
    }));
  },
  setCharacterMood: (characterId, mood) => {
    set((state) => ({
      characters: state.characters.map((char) =>
        char.id === characterId ? { ...char, mood } : char
      ),
    }));
  },
  setCharacterOnline: (characterId, isOnline) => {
    set((state) => ({
      characters: state.characters.map((char) =>
        char.id === characterId ? { ...char, isOnline } : char
      ),
    }));
  },

  // Typing
  typingStatuses: {},
  setTypingStatus: (status) => {
    set((state) => ({
      typingStatuses: {
        ...state.typingStatuses,
        [status.aiCharacterId]: status,
      },
    }));
  },
  removeTypingStatus: (characterId) => {
    set((state) => {
      const newStatuses = { ...state.typingStatuses };
      delete newStatuses[characterId];
      return { typingStatuses: newStatuses };
    });
  },

  // Connection
  isConnected: false,
  setConnected: (status) => set({ isConnected: status }),

  // UI
  isLoading: true,
  setIsLoading: (loading) => set({ isLoading: loading }),
  unreadCount: 0,
  incrementUnread: () => {
    set((state) => ({ unreadCount: state.unreadCount + 1 }));
  },
  resetUnread: () => set({ unreadCount: 0 }),

  // Reply
  replyPreview: null,
  setReplyPreview: (preview) => set({ replyPreview: preview }),

  // Sidebar
  isSidebarOpen: false,
  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
}));
