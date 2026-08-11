'use client';

import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '@/services/socket-service';
import { useChatStore } from '@/store/chat-store';

export function useSocket() {
  const { isConnected, setConnected } = useChatStore();
  const socketRef = useRef(getSocket());

  useEffect(() => {
    connectSocket();

    const socket = socketRef.current;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      disconnectSocket();
    };
  }, [setConnected]);

  return {
    socket: socketRef.current,
    isConnected,
  };
}
