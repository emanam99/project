'use client';

import { useEffect } from 'react';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { connectSocket, getSocket } from '@/services/socket-service';

export default function Home() {
  useEffect(() => {
    // Connect socket on mount
    connectSocket();

    return () => {
      const socket = getSocket();
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden bg-whatsapp-background">
      <ChatLayout />
    </main>
  );
}
