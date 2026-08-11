// ============ AI Character Types ============

export interface AICharacter {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  personality: string[];
  prompt: string;
  avatar: string;
  color: string;
  typingSpeed: number;
  responseChance: number;
  cooldownMin: number;
  cooldownMax: number;
  isActive: boolean;
  isOnline: boolean;
  mood: AIChatMood;
  sleepSchedule: SleepSchedule | null;
  interests: string[];
  affiliation: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AIChatMood = 'happy' | 'malas' | 'aktif' | 'ngantuk' | 'sensitif' | 'absurd';

export interface SleepSchedule {
  activeStart: string;
  activeEnd: string;
}

// ============ Message Types ============

export interface Message {
  id: string;
  content: string;
  senderId: string | null;
  senderName: string;
  senderType: 'ai' | 'user';
  senderAvatar: string | null;
  replyToId: string | null;
  replyTo?: Message | null;
  aiCharacterId: string | null;
  aiCharacter?: AICharacter | null;
  createdAt: string;
  updatedAt: string;
}

// ============ Chat Types ============

export interface ChatState {
  messages: Message[];
  characters: AICharacter[];
  typingStatuses: TypingStatusMap;
  isConnected: boolean;
  isLoading: boolean;
  unreadCount: number;
  scrollPosition: number;
}

// ============ Typing Status ============

export interface TypingStatus {
  aiCharacterId: string;
  isTyping: boolean;
  startedAt: string | null;
  duration: number | null;
  messageLength: number | null;
  character?: AICharacter;
}

export interface TypingStatusMap {
  [key: string]: TypingStatus;
}

// ============ Socket Events ============

export interface ServerToClientEvents {
  'chat:message': (message: Message) => void;
  'chat:history': (messages: Message[]) => void;
  'chat:message-deleted': (messageId: string) => void;
  'typing:start': (data: TypingStatus) => void;
  'typing:stop': (data: TypingStatus) => void;
  'ai:online-status': (data: { aiCharacterId: string; isOnline: boolean }) => void;
  'ai:mood-change': (data: { aiCharacterId: string; mood: AIChatMood }) => void;
  'ai:active-toggle': (data: { aiCharacterId: string; isActive: boolean }) => void;
  'connection:status': (data: { isConnected: boolean }) => void;
}

export interface ClientToServerEvents {
  'chat:send': (data: { content: string; replyToId?: string | null }) => void;
  'chat:delete': (messageId: string) => void;
  'typing:start': (data: { characterId?: string }) => void;
  'typing:stop': (data: { characterId?: string }) => void;
  'ai:toggle': (data: { aiCharacterId: string; isActive: boolean }) => void;
  'user:join': () => void;
}

// ============ AI Service Types ============

export interface AIResponseQueueItem {
  characterId: string;
  triggerMessageId: string;
  delay: number;
  priority: number;
}

export interface AIMemory {
  recentTopics: string[];
  recentMessages: Array<{
    id: string;
    content: string;
    senderName: string;
    senderType: string;
    createdAt: string;
  }>;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  lastInteraction: string | null;
  mentionCount: {
    [key: string]: number;
  };
}

// ============ UI Types ============

export interface SidebarItem {
  id: string;
  name: string;
  avatar: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  isActive?: boolean;
  mood?: AIChatMood;
}

export interface ReplyPreview {
  messageId: string;
  content: string;
  senderName: string;
}

// ============ API Types ============

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
