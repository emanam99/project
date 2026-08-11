// ===========================================
// Character Engine - Manages AI personalities
// ===========================================

import { AICharacter, AIChatMood, SleepSchedule } from '../../src/types';

interface CharacterState extends AICharacter {
  cooldownUntil: number;
  lastMessageAt: Date | null;
  messageCount: number;
  currentTypingDuration: number;
}

export class CharacterEngine {
  private characters: Map<string, CharacterState> = new Map();
  private initialized = false;

  async loadCharacters() {
    try {
      const { prisma } = await import('../../src/lib/prisma');
      
      const characters = await prisma.aiCharacter.findMany();

      this.characters.clear();
      
      for (const char of characters) {
        const personality = typeof char.personality === 'string' 
          ? JSON.parse(char.personality) 
          : char.personality;
        
        const interests = typeof char.interests === 'string'
          ? JSON.parse(char.interests)
          : char.interests;

        this.characters.set(char.id, {
          id: char.id,
          name: char.name,
          gender: char.gender as 'male' | 'female',
          age: char.age,
          personality: personality || [],
          prompt: char.prompt,
          avatar: char.avatar,
          color: char.color,
          typingSpeed: char.typingSpeed,
          responseChance: char.responseChance,
          cooldownMin: char.cooldownMin,
          cooldownMax: char.cooldownMax,
          isActive: char.isActive,
          isOnline: char.isOnline,
          mood: (char.mood as AIChatMood) || 'happy',
          sleepSchedule: char.sleepSchedule ? JSON.parse(char.sleepSchedule) : null,
          interests: interests || [],
          affiliation: char.affiliation,
          createdAt: char.createdAt.toISOString(),
          updatedAt: char.updatedAt.toISOString(),
          cooldownUntil: Date.now(),
          lastMessageAt: null,
          messageCount: 0,
          currentTypingDuration: 0,
        });
      }

      this.initialized = true;
      console.log(`[CharacterEngine] Loaded ${this.characters.size} characters`);
    } catch (error) {
      console.error('[CharacterEngine] Error loading characters:', error);
      throw error;
    }
  }

  getCharacter(id: string): CharacterState | undefined {
    return this.characters.get(id);
  }

  getCharacterByName(name: string): CharacterState | undefined {
    return Array.from(this.characters.values()).find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
  }

  getAllCharacters(): CharacterState[] {
    return Array.from(this.characters.values());
  }

  getActiveCharacters(): CharacterState[] {
    return Array.from(this.characters.values()).filter(
      (c) => c.isActive && this.isCharacterAwake(c)
    );
  }

  getOnlineCharacters(): CharacterState[] {
    return Array.from(this.characters.values()).filter((c) => c.isOnline && c.isActive);
  }

  isCharacterAwake(character: CharacterState): boolean {
    if (!character.sleepSchedule) return true;
    
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const [startH, startM] = character.sleepSchedule.activeStart.split(':').map(Number);
    const [endH, endM] = character.sleepSchedule.activeEnd.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    // Handle overnight schedules
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    const adjustedCurrent = currentMinutes + (currentMinutes < startMinutes ? 24 * 60 : 0);
    return adjustedCurrent >= startMinutes && adjustedCurrent <= endMinutes;
  }

  setCharacterCooldown(id: string) {
    const char = this.characters.get(id);
    if (!char) return;

    const cooldown = char.cooldownMin + Math.random() * (char.cooldownMax - char.cooldownMin);
    char.cooldownUntil = Date.now() + cooldown;
    char.lastMessageAt = new Date();
    char.messageCount++;
  }

  canCharacterRespond(id: string): boolean {
    const char = this.characters.get(id);
    if (!char || !char.isActive || !char.isOnline) return false;
    if (!this.isCharacterAwake(char)) return false;
    if (Date.now() < char.cooldownUntil) return false;

    // Random response chance based on character's responseChance
    return Math.random() < char.responseChance;
  }

  getTypingDuration(characterId: string, messageLength: number): number {
    const char = this.characters.get(characterId);
    if (!char) return 3000;

    // Calculate typing time based on message length and typing speed
    const baseTime = (messageLength / char.typingSpeed) * 1000;
    const jitter = (Math.random() - 0.5) * 1000;
    
    return Math.max(500, Math.min(15000, baseTime + jitter));
  }

  setCharacterMood(id: string, mood: AIChatMood) {
    const char = this.characters.get(id);
    if (char) {
      char.mood = mood;
    }
  }

  async changeRandomMoods() {
    const moods: AIChatMood[] = ['happy', 'malas', 'aktif', 'ngantuk', 'sensitif', 'absurd'];
    
    for (const char of this.characters.values()) {
      // 20% chance of mood change
      if (Math.random() < 0.2) {
        const newMood = moods[Math.floor(Math.random() * moods.length)];
        char.mood = newMood;

        // Update in database
        try {
          const { prisma } = await import('../../src/lib/prisma');
          await prisma.aiCharacter.update({
            where: { id: char.id },
            data: { mood: newMood },
          });
        } catch (error) {
          // Silent fail for mood updates
        }
      }
    }
  }

  /**
   * Check if a character should respond to a message
   * based on the message content and character interests
   */
  shouldRespondBasedOnContent(character: CharacterState, messageContent: string): number {
    let priority = 0.5; // Base priority

    // Check if message contains character's name
    if (messageContent.toLowerCase().includes(character.name.toLowerCase())) {
      priority += 0.4;
    }

    // Check interests
    const content = messageContent.toLowerCase();
    for (const interest of character.interests) {
      if (content.includes(interest.toLowerCase())) {
        priority += 0.15;
      }
    }

    // Check if message mentions characters this character affiliates with
    if (character.affiliation) {
      const affiliates = character.affiliation.split(',').map(a => a.trim().toLowerCase());
      for (const affiliate of affiliates) {
        if (content.includes(affiliate)) {
          priority += 0.1;
        }
      }
    }

    // Mood modifiers
    switch (character.mood) {
      case 'aktif':
        priority += 0.2;
        break;
      case 'happy':
        priority += 0.1;
        break;
      case 'malas':
      case 'ngantuk':
        priority -= 0.2;
        break;
      case 'sensitif':
        priority -= 0.1;
        break;
    }

    return Math.max(0, Math.min(1, priority));
  }
}
