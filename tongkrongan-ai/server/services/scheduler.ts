// ===========================================
// Scheduler Service - Manages AI spontaneous behavior
// ===========================================

import { Server as SocketServer } from 'socket.io';
import { AIService } from './ai-service';
import { CharacterEngine } from './character-engine';

export class SchedulerService {
  private aiService: AIService;
  private characterEngine: CharacterEngine;
  private io: SocketServer;
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  // Scheduler config
  private readonly MOOD_CHANGE_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
  private readonly SPONTANEOUS_CHAT_INTERVAL = 30 * 1000; // Every 30 seconds (min)
  private readonly SPONTANEOUS_CHAT_MAX_INTERVAL = 3 * 60 * 1000; // Every 3 minutes (max)
  private readonly ONLINE_STATUS_INTERVAL = 10 * 60 * 1000; // Every 10 minutes
  private readonly MEMORY_CLEANUP_INTERVAL = 30 * 60 * 1000; // Every 30 minutes

  constructor(
    aiService: AIService,
    characterEngine: CharacterEngine,
    io: SocketServer
  ) {
    this.aiService = aiService;
    this.characterEngine = characterEngine;
    this.io = io;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[Scheduler] Starting AI behavior scheduler...');

    // 1. Mood changer - random mood updates
    this.intervals.push(setInterval(() => {
      this.updateMoods();
    }, this.MOOD_CHANGE_INTERVAL));

    // 2. Spontaneous AI conversations
    this.scheduleNextSpontaneousChat();

    // 3. Online status updates
    this.intervals.push(setInterval(() => {
      this.updateOnlineStatuses();
    }, this.ONLINE_STATUS_INTERVAL));

    // 4. Memory cleanup
    this.intervals.push(setInterval(() => {
      this.cleanupMemory();
    }, this.MEMORY_CLEANUP_INTERVAL));

    console.log('[Scheduler] ✅ All schedulers started');
  }

  stop() {
    this.isRunning = false;
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    console.log('[Scheduler] All schedulers stopped');
  }

  private scheduleNextSpontaneousChat() {
    if (!this.isRunning) return;

    const delay = this.SPONTANEOUS_CHAT_INTERVAL + 
      Math.random() * (this.SPONTANEOUS_CHAT_MAX_INTERVAL - this.SPONTANEOUS_CHAT_INTERVAL);

    const timer = setTimeout(async () => {
      if (!this.isRunning) return;

      try {
        // 40% chance of spontaneous chat
        if (Math.random() < 0.4) {
          await this.aiService.generateRandomConversation(this.io);
        }
      } catch (error) {
        console.error('[Scheduler] Error in spontaneous chat:', error);
      }

      // Schedule next
      this.scheduleNextSpontaneousChat();
    }, delay);

    // Track this timer too
    const originalClear = timer[Symbol.toPrimitive] ? () => clearTimeout(timer) : () => {};
    // We store the timer reference
    this.intervals.push(timer as any);
  }

  private async updateMoods() {
    try {
      const characters = this.characterEngine.getAllCharacters();
      const moods = ['happy', 'malas', 'aktif', 'ngantuk', 'sensitif', 'absurd'] as const;
      
      for (const char of characters) {
        if (Math.random() < 0.25) { // 25% chance of mood change
          const newMood = moods[Math.floor(Math.random() * moods.length)];
          
          this.characterEngine.setCharacterMood(char.id, newMood);
          
          // Broadcast mood change
          this.io.emit('ai:mood-change', {
            aiCharacterId: char.id,
            mood: newMood,
          });

          // Add a small behavior message based on mood change
          if (Math.random() < 0.2) { // 20% chance to announce mood change
            const moodMessages: Record<string, string[]> = {
              happy: ['Mood gue lagi bagus nih hari ini! 😊', 'Hari ini cerah banget! 🌟'],
              malas: ['Ah males banget hari ini... 😴', '*malas-mode activated*'],
              aktif: ['Gas pol hari ini! 🔥', 'Semangat pagi! 💪'],
              ngantuk: ['Ngantuk berat... *yawn* 😪', 'Mata udah berat nih...'],
              sensitif: ['*sigh* lagi agak gimana gitu...', 'Mood swing parah hari ini'],
              absurd: ['🧠💥 *absurd thoughts activated*', 'Okay jadi gini... *random*'],
            };

            if (moodMessages[newMood]) {
              const msg = moodMessages[newMood][Math.floor(Math.random() * moodMessages[newMood].length)];
              
              const { prisma } = await import('../../src/lib/prisma');
              const message = await prisma.message.create({
                data: {
                  content: msg,
                  senderName: char.name,
                  senderType: 'ai',
                  senderAvatar: `/avatars/${char.avatar}.svg`,
                  aiCharacterId: char.id,
                },
                include: {
                  aiCharacter: true,
                },
              });

              this.io.emit('chat:message', message);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error updating moods:', error);
    }
  }

  private async updateOnlineStatuses() {
    try {
      const characters = this.characterEngine.getAllCharacters();
      
      for (const char of characters) {
        if (!char.isActive) continue;

        // 15% chance to change online status
        if (Math.random() < 0.15) {
          const newStatus = !char.isOnline;
          char.isOnline = newStatus;
          
          // Update database
          const { prisma } = await import('../../src/lib/prisma');
          await prisma.aiCharacter.update({
            where: { id: char.id },
            data: { isOnline: newStatus },
          });

          // Broadcast
          this.io.emit('ai:online-status', {
            aiCharacterId: char.id,
            isOnline: newStatus,
          });

          // Sometimes come online with a message
          if (newStatus && Math.random() < 0.3) {
            const onlineMessages = [
              `${char.name} online!`,
              'Aku datang!',
              'Wih pada ngapain?',
              'Maap tadi offline, lagi sibuk',
              'Halo semua!',
            ];

            const msg = onlineMessages[Math.floor(Math.random() * onlineMessages.length)];
            
            const message = await prisma.message.create({
              data: {
                content: msg,
                senderName: char.name,
                senderType: 'ai',
                senderAvatar: `/avatars/${char.avatar}.svg`,
                aiCharacterId: char.id,
              },
              include: {
                aiCharacter: true,
              },
            });

            this.io.emit('chat:message', message);
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error updating online statuses:', error);
    }
  }

  private async cleanupMemory() {
    try {
      const { prisma } = await import('../../src/lib/prisma');
      
      // Clean up old messages from database (keep last 500)
      const messages = await prisma.message.findMany({
        orderBy: { createdAt: 'desc' },
        skip: 500,
        take: 1000,
      });

      if (messages.length > 0) {
        const ids = messages.map(m => m.id);
        await prisma.message.deleteMany({
          where: { id: { in: ids } },
        });
        console.log(`[Scheduler] Cleaned up ${messages.length} old messages`);
      }
    } catch (error) {
      console.error('[Scheduler] Error cleaning up memory:', error);
    }
  }
}
