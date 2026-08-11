// ===========================================
// Tongkrongan AI - Socket.IO Server
// ===========================================

import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { ChatSocketHandler } from './socket/chat-handler';
import { AIService } from './services/ai-service';
import { CharacterEngine } from './services/character-engine';
import { SchedulerService } from './services/scheduler';
import { SocketManager } from './socket/socket-manager';

const PORT = parseInt(process.env.SOCKET_PORT || '3001', 10);
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function bootstrap() {
  console.log('==========================================');
  console.log('  Tongkrongan AI - Socket Server');
  console.log('==========================================');
  console.log(`  Port: ${PORT}`);
  console.log(`  Frontend: ${NEXT_PUBLIC_URL}`);
  console.log(`  DeepSeek: ${process.env.DEEPSEEK_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log('==========================================\n');

  // Init Express
  const app = express();
  app.use(cors({
    origin: [NEXT_PUBLIC_URL, `http://localhost:${PORT}`, 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  }));
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: global.io ? (global.io as SocketServer).engine?.clientsCount || 0 : 0,
    });
  });

  // API Routes placeholder for future expansion
  app.get('/api/status', (req, res) => {
    res.json({
      success: true,
      data: {
        server: 'Tongkrongan AI',
        version: '1.0.0',
        connected: global.io ? (global.io as SocketServer).engine?.clientsCount || 0 : 0,
      },
    });
  });

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new SocketServer(server, {
    cors: {
      origin: [NEXT_PUBLIC_URL, `http://localhost:${PORT}`, 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });

  // Make io globally accessible
  (global as any).io = io;

  // Initialize services
  const characterEngine = new CharacterEngine();
  const aiService = new AIService(characterEngine);
  const schedulerService = new SchedulerService(aiService, characterEngine, io);
  const socketManager = new SocketManager(io, characterEngine, aiService);

  // Load characters
  await characterEngine.loadCharacters();
  console.log(`  ✅ Loaded ${characterEngine.getAllCharacters().length} AI characters\n`);

  // Initialize socket handler
  new ChatSocketHandler(io, aiService, characterEngine, schedulerService, socketManager);

  // Start scheduler
  schedulerService.start();

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🚀 Socket.IO server running on http://0.0.0.0:${PORT}`);
    console.log(`  📡 WebSocket ready for connections\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n  📴 Shutting down gracefully...');
    schedulerService.stop();
    io.close();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
