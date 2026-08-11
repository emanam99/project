'use client';

import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents, Message, TypingStatus, AIChatMood } from '@/types';
import { useChatStore } from '@/store/chat-store';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    }) as TypedSocket;

    setupListeners(socket);
  }
  return socket;
}

function setupListeners(socket: TypedSocket) {
  const store = useChatStore;

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    store.getState().setConnected(true);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    store.getState().setConnected(false);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    store.getState().setConnected(false);
  });

  socket.on('chat:message', (message: Message) => {
    store.getState().addMessage(message);
  });

  socket.on('chat:history', (messages: Message[]) => {
    store.getState().setMessages(messages);
    store.getState().setIsLoading(false);
  });

  socket.on('chat:message-deleted', (messageId: string) => {
    store.getState().removeMessage(messageId);
  });

  socket.on('typing:start', (data: TypingStatus) => {
    store.getState().setTypingStatus(data);
  });

  socket.on('typing:stop', (data: TypingStatus) => {
    store.getState().removeTypingStatus(data.aiCharacterId);
  });

  socket.on('ai:online-status', (data: { aiCharacterId: string; isOnline: boolean }) => {
    store.getState().setCharacterOnline(data.aiCharacterId, data.isOnline);
  });

  socket.on('ai:mood-change', (data: { aiCharacterId: string; mood: AIChatMood }) => {
    store.getState().setCharacterMood(data.aiCharacterId, data.mood);
  });

  socket.on('ai:active-toggle', (data: { aiCharacterId: string; isActive: boolean }) => {
    // handled server-side mainly, but sync if needed
  });
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function sendMessage(content: string, replyToId?: string | null) {
  const s = getSocket();
  if (s.connected) {
    s.emit('chat:send', { content, replyToId });
  }
}

export function sendTypingStart(characterId?: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('typing:start', { characterId });
  }
}

export function sendTypingStop(characterId?: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('typing:stop', { characterId });
  }
}

export function toggleAI(aiCharacterId: string, isActive: boolean) {
  const s = getSocket();
  if (s.connected) {
    s.emit('ai:toggle', { aiCharacterId, isActive });
  }
}

export default {
  getSocket,
  connectSocket,
  disconnectSocket,
  sendMessage,
  sendTypingStart,
  sendTypingStop,
  toggleAI,
};
