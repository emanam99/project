// ===========================================
// Socket Manager - Manages connections & state
// ===========================================

import { Server as SocketServer, Socket } from 'socket.io';
import { CharacterEngine } from '../services/character-engine';
import { AIService } from '../services/ai-service';

export class SocketManager {
  private io: SocketServer;
  private characterEngine: CharacterEngine;
  private aiService: AIService;
  private connectedUsers: Map<string, { socketId: string; joinedAt: Date }> = new Map();

  constructor(
    io: SocketServer,
    characterEngine: CharacterEngine,
    aiService: AIService
  ) {
    this.io = io;
    this.characterEngine = characterEngine;
    this.aiService = aiService;
  }

  handleConnection(socket: Socket) {
    const clientId = socket.handshake.auth?.clientId || socket.id;

    console.log(`[Socket] Client connected: ${clientId} (socket: ${socket.id})`);

    // Register user
    this.connectedUsers.set(clientId, {
      socketId: socket.id,
      joinedAt: new Date(),
    });

    // Send initial data
    this.sendInitialData(socket);

    // Broadcast online status update
    this.broadcastConnectionStatus();

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${clientId} (reason: ${reason})`);
      this.connectedUsers.delete(clientId);
      this.broadcastConnectionStatus();
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[Socket] Error for client ${clientId}:`, error.message);
    });
  }

  private async sendInitialData(socket: Socket) {
    try {
      const { prisma } = await import('../../src/lib/prisma');

      // Send characters
      const characters = this.characterEngine.getAllCharacters();
      socket.emit('characters:list', characters);

      // Send message history
      const messages = await prisma.message.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          replyTo: true,
          aiCharacter: true,
        },
        take: 100,
      });

      socket.emit('chat:history', messages);

    } catch (error) {
      console.error('[Socket] Error sending initial data:', error);
    }
  }

  private broadcastConnectionStatus() {
    this.io.emit('connection:status', {
      isConnected: true,
      connectedUsers: this.connectedUsers.size,
    });
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  broadcastMessage(event: string, data: any) {
    this.io.emit(event, data);
  }
}
