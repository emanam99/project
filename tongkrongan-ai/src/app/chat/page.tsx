'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { connectSocket } from '@/services/socket-service';

export default function ChatPage() {
  useEffect(() => {
    connectSocket();
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden bg-whatsapp-background">
      <ChatLayout />
    </main>
  );
}
