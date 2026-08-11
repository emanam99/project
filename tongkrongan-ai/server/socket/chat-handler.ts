// ===========================================
// Chat Handler - Main socket event handler
// ===========================================

import { Server as SocketServer, Socket } from 'socket.io';
import { CharacterEngine } from '../services/character-engine';
import { AIService } from '../services/ai-service';
import { SchedulerService } from '../services/scheduler';
import { SocketManager } from './socket-manager';

export class ChatSocketHandler {
  private io: SocketServer;
  private aiService: AIService;
  private characterEngine: CharacterEngine;
  private schedulerService: SchedulerService;
  private socketManager: SocketManager;

  constructor(
    io: SocketServer,
    aiService: AIService,
    characterEngine: CharacterEngine,
    schedulerService: SchedulerService,
    socketManager: SocketManager
  ) {
    this.io = io;
    this.aiService = aiService;
    this.characterEngine = characterEngine;
    this.schedulerService = schedulerService;
    this.socketManager = socketManager;

    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[Chat] User connected: ${socket.id}`);

      // Handle socket manager connection
      this.socketManager.handleConnection(socket);

      // Handle chat messages
      this.handleChatSend(socket);

      // Handle typing indicators
      this.handleTyping(socket);

      // Handle AI toggle
      this.handleAIToggle(socket);

      // Handle user join
      socket.on('user:join', () => {
        console.log(`[Chat] User joined chat: ${socket.id}`);
      });
    });
  }

  private handleChatSend(socket: Socket) {
    socket.on('chat:send', async (data: { content: string; replyToId?: string | null }) => {
      try {
        const { content, replyToId } = data;

        if (!content || content.trim().length === 0) return;
        if (content.length > 2000) {
          socket.emit('chat:error', { message: 'Pesan terlalu panjang (maks 2000 karakter)' });
          return;
        }

        const { prisma } = await import('../../src/lib/prisma');

        // Create message in database
        const message = await prisma.message.create({
          data: {
            content: content.trim(),
            senderId: 'user-1',
            senderName: 'Kamu',
            senderType: 'user',
            senderAvatar: null,
            replyToId: replyToId || null,
          },
          include: {
            replyTo: true,
            aiCharacter: true,
          },
        });

        // Broadcast to all clients
        this.io.emit('chat:message', message);

        console.log(`[Chat] User message: "${content.slice(0, 50)}..."`);

        // Trigger AI responses (with delay)
        this.aiService.handleNewMessage(message, this.io);

      } catch (error) {
        console.error('[Chat] Error handling message:', error);
        socket.emit('chat:error', { message: 'Gagal mengirim pesan' });
      }
    });
  }

  private handleTyping(socket: Socket) {
    socket.on('typing:start', (data: { characterId?: string }) => {
      socket.broadcast.emit('typing:start', {
        userId: socket.id,
        characterId: data.characterId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data: { characterId?: string }) => {
      socket.broadcast.emit('typing:stop', {
        userId: socket.id,
        characterId: data.characterId,
        isTyping: false,
      });
    });
  }

  private handleAIToggle(socket: Socket) {
    socket.on('ai:toggle', async (data: { aiCharacterId: string; isActive: boolean }) => {
      try {
        const { prisma } = await import('../../src/lib/prisma');

        await prisma.aiCharacter.update({
          where: { id: data.aiCharacterId },
          data: { isActive: data.isActive },
        });

        // Reload characters
        await this.characterEngine.loadCharacters();

        // Broadcast update
        this.io.emit('ai:active-toggle', data);

        console.log(`[Chat] AI toggle: ${data.aiCharacterId} -> ${data.isActive ? 'ON' : 'OFF'}`);

      } catch (error) {
        console.error('[Chat] Error toggling AI:', error);
      }
    });
  }
}
