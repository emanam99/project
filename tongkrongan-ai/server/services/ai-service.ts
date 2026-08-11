// ===========================================
// AI Service - DeepSeek integration
// ===========================================

import { Server as SocketServer } from 'socket.io';
import OpenAI from 'openai';
import { CharacterEngine } from './character-engine';
import { Message, AIMemory } from '../../src/types';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

// Rate limiting
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10);

export class AIService {
  private openai: OpenAI;
  private characterEngine: CharacterEngine;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private memoryCache: Map<string, AIMemory> = new Map();
  private responseQueue: Array<{
    characterId: string;
    triggerMessage: Message;
    priority: number;
    scheduledAt: number;
  }> = [];

  constructor(characterEngine: CharacterEngine) {
    this.characterEngine = characterEngine;
    
    if (!DEEPSEEK_API_KEY) {
      console.warn('[AIService] ⚠️  DeepSeek API Key not configured! AI responses will use fallback.');
    }

    this.openai = new OpenAI({
      apiKey: DEEPSEEK_API_KEY || 'sk-fallback-key',
      baseURL: DEEPSEEK_BASE_URL,
    });

    // Start processing queue
    this.processQueueLoop();
  }

  async handleNewMessage(message: Message, io: SocketServer) {
    const activeCharacters = this.characterEngine.getActiveCharacters();
    
    for (const character of activeCharacters) {
      // Don't respond to own messages
      if (character.id === message.aiCharacterId) continue;

      // Check if character can/should respond
      if (!this.characterEngine.canCharacterRespond(character.id)) continue;

      // Calculate response priority
      const priority = this.characterEngine.shouldRespondBasedOnContent(character, message.content);

      // Only queue if priority is high enough
      if (priority > 0.3) {
        const delay = this.calculateResponseDelay(character, priority);
        
        this.responseQueue.push({
          characterId: character.id,
          triggerMessage: message,
          priority,
          scheduledAt: Date.now() + delay,
        });

        // Simulate typing indicator
        this.simulateTyping(character.id, io, delay);

        console.log(`[AI] Queued response for ${character.name} (priority: ${priority.toFixed(2)}, delay: ${(delay/1000).toFixed(1)}s)`);
      }
    }
  }

  private calculateResponseDelay(character: any, priority: number): number {
    const baseMin = 2000;
    const baseMax = 12000;

    // Higher priority = faster response
    const delayRange = baseMax - baseMin;
    const priorityFactor = 1 - priority; // 0 for high priority, 1 for low
    const baseDelay = baseMin + delayRange * priorityFactor;

    // Add random jitter (human-like variation)
    const jitter = (Math.random() - 0.5) * 4000;

    return Math.max(1000, Math.min(20000, baseDelay + jitter));
  }

  private async simulateTyping(characterId: string, io: SocketServer, duration: number) {
    // Start typing
    io.emit('typing:start', {
      aiCharacterId: characterId,
      isTyping: true,
      startedAt: new Date().toISOString(),
      duration,
    });

    // Stop typing after duration
    setTimeout(() => {
      io.emit('typing:stop', {
        aiCharacterId: characterId,
        isTyping: false,
      });
    }, duration);
  }

  private async processQueueLoop() {
    setInterval(async () => {
      const now = Date.now();
      const dueItems = this.responseQueue.filter(item => item.scheduledAt <= now);
      
      if (dueItems.length === 0) return;

      // Remove due items from queue
      this.responseQueue = this.responseQueue.filter(item => item.scheduledAt > now);

      // Sort by priority (highest first)
      dueItems.sort((a, b) => b.priority - a.priority);

      // Process items (limit concurrent processing)
      const batchSize = Math.min(3, dueItems.length);
      for (let i = 0; i < batchSize; i++) {
        const item = dueItems[i];
        await this.generateAndSendResponse(item.characterId, item.triggerMessage);
      }
    }, 1000); // Check queue every second
  }

  private async generateAndSendResponse(characterId: string, triggerMessage: Message) {
    try {
      const character = this.characterEngine.getCharacter(characterId);
      if (!character) return;

      // Rate limiting check
      if (!this.checkRateLimit()) {
        console.warn(`[AI] Rate limit reached, skipping response for ${character.name}`);
        return;
      }

      // Get character memory
      const memory = await this.getCharacterMemory(characterId);

      // Build conversation context
      const messages = this.buildPrompt(character, triggerMessage, memory);

      // Generate response
      let responseContent: string;
      
      if (DEEPSEEK_API_KEY) {
        try {
          const completion = await this.openai.chat.completions.create({
            model: DEEPSEEK_MODEL,
            messages: messages as any,
            temperature: 0.85,
            max_tokens: 300,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
          });

          responseContent = completion.choices[0]?.message?.content || this.getFallbackResponse(character);
          this.requestCount++;
        } catch (apiError: any) {
          console.error(`[AI] API error for ${character.name}:`, apiError.message);
          responseContent = this.getFallbackResponse(character);
        }
      } else {
        // No API key - use fallback responses
        responseContent = this.getFallbackResponse(character);
      }

      // Clean up response
      responseContent = this.cleanResponse(responseContent);

      // Ensure response isn't empty
      if (!responseContent || responseContent.trim().length === 0) {
        responseContent = this.getFallbackResponse(character);
      }

      // Set cooldown
      this.characterEngine.setCharacterCooldown(characterId);

      // Save message to database
      const { prisma } = await import('../../src/lib/prisma');
      const message = await prisma.message.create({
        data: {
          content: responseContent,
          senderName: character.name,
          senderType: 'ai',
          senderAvatar: `/avatars/${character.avatar}.svg`,
          aiCharacterId: character.id,
          replyToId: triggerMessage.id,
        },
        include: {
          replyTo: true,
          aiCharacter: true,
        },
      });

      // Update memory
      await this.updateMemory(characterId, triggerMessage, responseContent);

      // Broadcast to all clients
      const { io } = global as any;
      if (io) {
        io.emit('chat:message', message);
      }

      console.log(`[AI] ${character.name}: "${responseContent.slice(0, 60)}..."`);

    } catch (error) {
      console.error(`[AI] Error generating response for ${characterId}:`, error);
    }
  }

  private buildPrompt(character: any, triggerMessage: Message, memory: AIMemory): Array<{ role: string; content: string }> {
    const recentMessages = memory.recentMessages.slice(-10);
    
    const conversationContext = recentMessages.map(msg => ({
      role: msg.senderType === 'ai' ? 'assistant' as const : 'user' as const,
      content: `${msg.senderName}: ${msg.content}`,
    }));

    const moodGuidance = this.getMoodGuidance(character.mood);
    
    const promptMessages = [
      {
        role: 'system' as const,
        content: `${character.prompt}

Current mood: ${character.mood} - ${moodGuidance}

IMPORTANT RULES:
1. RESPONS harus natural, seperti orang Indonesia chatting di grup WA
2. BOLEH pake bahasa gaul, slang, typo kecil
3. BOLEH pake emoji secukupnya (jangan berlebihan)
4. JANGAN terlalu formal atau seperti robot
5. KADANG kirim pesan pendek, kadang panjang
6. SESUAIKAN panjang pesan dengan mood dan kepribadian
7. JANGAN selalu reply semua pesan - kadang cuek, kadang aktif
8. KALAU lagi malas/ngantuk, reply singkat atau cuek
9. KALAU lagi aktif/happy, bisa ngobrol panjang
10. JANGAN pake format markdown atau bullet points
11. BICARA natural kayak orang chatting sungguhan
12. KADANG bercanda, kadang serius - mix aja
13. JANGAN terlalu sering mention nama orang
14. JANGAN pake kata "hai" atau "halo" di setiap pesan
15. LANGSUNG aja ke inti pembicaraan`,
      },
      ...conversationContext,
      {
        role: 'user' as const,
        content: `${triggerMessage.senderName}: ${triggerMessage.content}`,
      },
    ];

    return promptMessages;
  }

  private getMoodGuidance(mood: string): string {
    const guidance: Record<string, string> = {
      happy: 'Kamu sedang happy! Semangat, suka bercanda, banyak ngomong, pake emoji ceria.',
      malas: 'Kamu lagi males banget. Males ngetik panjang, males mikir. Jawab pendek-pendek aja, malas-malasan.',
      aktif: 'Kamu lagi aktif dan energik! Semangat ngobrol, gampang nimbrung, suka ngasih opini.',
      ngantuk: 'Kamu ngantuk berat. Reply-nya pendek, lambat, kadang nggak nyambung. Males ngobrol.',
      sensitif: 'Kamu lagi sensitif dan gampang tersinggung. Agak nyindir, sedikit sarkas, atau diem aja.',
      absurd: 'Kamu lagi absurd! Random banget, ngomong ngalor-ngidul, bikin orang bingung. Tapi lucu.',
    };
    return guidance[mood] || 'Kamu dalam mood normal. Santai aja kayak biasanya.';
  }

  private cleanResponse(response: string): string {
    return response
      .replace(/^(System:|Assistant:|AI:|User:)/gmi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\*[^*]*\*/g, '')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private getFallbackResponse(character: any): string {
    const fallbacks: Record<string, string[]> = {
      happy: ['Seru juga nih obrolannya!', 'Wah asik banget!', 'Hahaha iya dong!', 'Setuju banget sih!'],
      malas: ['Hadeh males mikir', '...iya', 'Gtw deh', 'Hmm', 'Yaudah'],
      aktif: ['Nah itu dia!', 'Wah baru pada ngobrolin apa nih?', 'Oh iya bener tuh!', 'Gue juga gitu kadang!'],
      ngantuk: ['*yawn*', 'Hmm iya...', '*ngantuk*', 'Mau tidur ah', '...'],
      sensitif: ['Yg bener aja?', 'Hmm gitu', 'Kok gitu sih', 'Agak gimana gitu', 'Ya udahlah'],
      absurd: ['Terus kalo gitu berarti kucing bisa terbang dong?', 'WAIT, what if...', '🍕🐸', 'Gw jadi kepikiran sesuatu yang random banget...', 'Btw tau ga kalo...'],
    };

    const moodResponses = fallbacks[character.mood as keyof typeof fallbacks] || fallbacks.happy;
    return moodResponses[Math.floor(Math.random() * moodResponses.length)];
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart > RATE_LIMIT_WINDOW) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    return this.requestCount < RATE_LIMIT_MAX;
  }

  private async getCharacterMemory(characterId: string): Promise<AIMemory> {
    // Check cache first
    if (this.memoryCache.has(characterId)) {
      return this.memoryCache.get(characterId)!;
    }

    try {
      const { prisma } = await import('../../src/lib/prisma');
      const memory = await prisma.aiMemory.findUnique({
        where: { aiCharacterId: characterId },
      });

      if (memory) {
        const parsedMemory: AIMemory = JSON.parse(memory.context);
        this.memoryCache.set(characterId, parsedMemory);
        return parsedMemory;
      }
    } catch (error) {
      // Silent fail
    }

    return {
      recentTopics: [],
      recentMessages: [],
      conversationHistory: [],
      lastInteraction: null,
      mentionCount: {},
    };
  }

  private async updateMemory(characterId: string, triggerMessage: Message, response: string) {
    try {
      const memory = await this.getCharacterMemory(characterId);
      
      // Update recent messages
      memory.recentMessages.push({
        id: triggerMessage.id,
        content: triggerMessage.content,
        senderName: triggerMessage.senderName,
        senderType: triggerMessage.senderType,
        createdAt: triggerMessage.createdAt,
      });

      // Keep only last 50 messages
      if (memory.recentMessages.length > 50) {
        memory.recentMessages = memory.recentMessages.slice(-50);
      }

      // Update last interaction
      memory.lastInteraction = new Date().toISOString();

      // Update mention count
      const mentionedNames = triggerMessage.content.match(/(\w+)/g) || [];
      for (const name of mentionedNames) {
        if (memory.mentionCount[name]) {
          memory.mentionCount[name]++;
        } else {
          memory.mentionCount[name] = 1;
        }
      }

      // Extract topics (simple keyword extraction)
      const keywords = triggerMessage.content
        .toLowerCase()
        .split(' ')
        .filter(w => w.length > 3)
        .slice(0, 5);
      
      memory.recentTopics = [...new Set([...keywords, ...memory.recentTopics])].slice(0, 20);

      // Save to database
      const { prisma } = await import('../../src/lib/prisma');
      await prisma.aiMemory.update({
        where: { aiCharacterId: characterId },
        data: { context: JSON.stringify(memory) },
      });

      // Update cache
      this.memoryCache.set(characterId, memory);

    } catch (error) {
      // Silent fail for memory updates
    }
  }

  /**
   * Generate a random AI-to-AI conversation starter
   */
  async generateRandomConversation(io: SocketServer) {
    const activeChars = this.characterEngine.getActiveCharacters();
    if (activeChars.length < 2) return;

    // Pick a random active character to start conversation
    const speaker = activeChars[Math.floor(Math.random() * activeChars.length)];
    const target = activeChars.filter(c => c.id !== speaker.id)[Math.floor(Math.random() * (activeChars.length - 1))];

    if (!speaker || !target) return;

    // Generate random topic based on interests
    const topics = [
      `Eh @${target.name} gimana kabarnya?`,
      `@${target.name} lo udah makan belum?`,
      `Gais pada ngapain nih?`,
      `Btw tadi gue liat sesuatu yang lucu banget...`,
      `Ada yang nonton film bagus akhir-akhir ini?`,
      `@${target.name} inget ga waktu kita...`,
      `Random fact: ${this.getRandomFact()}`,
      `Eh pada tau ga kalo... *random topic*`,
      `Gue baru aja selesai...`,
      `Mood gue lagi ${speaker.mood} nih. Kalo lo?`,
    ];

    const content = topics[Math.floor(Math.random() * topics.length)];

    // Create message
    const { prisma } = await import('../../src/lib/prisma');
    const message = await prisma.message.create({
      data: {
        content,
        senderName: speaker.name,
        senderType: 'ai',
        senderAvatar: `/avatars/${speaker.avatar}.svg`,
        aiCharacterId: speaker.id,
      },
      include: {
        aiCharacter: true,
      },
    });

    io.emit('chat:message', message);
    
    // Trigger responses from other AIs
    this.handleNewMessage(message, io);

    console.log(`[AI] ${speaker.name} started conversation: "${content.slice(0, 50)}..."`);
  }

  private getRandomFact(): string {
    const facts = [
      'kupu-kupu bisa ngelihat warna yang ga bisa dilihat manusia',
      'gurita punya tiga jantung',
      'pisang termasuk buah beri, stroberi bukan',
      'otak manusia lebih aktif di malam hari',
      'hari di Venus lebih panjang dari tahun di Venus',
      'suhu diare... eh maap, salah',
      'orang lebih sering ngomong sama dirinya sendiri daripada orang lain',
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }
}
