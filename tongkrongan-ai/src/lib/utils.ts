// ===========================================
// Utility functions
// ===========================================

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random item from an array
 */
export function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get initials from a name
 */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, maxChars);
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'baru saja';
  if (diffMin < 60) return `${diffMin}m yang lalu`;
  if (diffHour < 24) return `${diffHour}j yang lalu`;
  if (diffDay < 7) return `${diffDay}h yang lalu`;

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if a string contains any of the keywords
 */
export function containsKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/**
 * Simulate a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random boolean with probability
 */
export function randomBoolean(probability = 0.5): boolean {
  return Math.random() < probability;
}

/**
 * Generate a random color
 */
export function randomColor(): string {
  const colors = [
    '#4FC3F7', '#F48FB1', '#A5D6A7', '#CE93D8',
    '#FFB74D', '#FFF176', '#90A4AE', '#E57373',
    '#81C784', '#F06292', '#64B5F6', '#B39DDB',
    '#FF8A65', '#4DD0E1', '#AED581', '#FFD54F',
  ];
  return randomPick(colors);
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a unique key for React components
 */
export function generateKey(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Format message count
 */
export function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return (count / 1000).toFixed(1) + 'rb';
  return (count / 1000000).toFixed(1) + 'jt';
}

/**
 * Get greeting based on time
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/**
 * Check if it's night time
 */
export function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 22;
}

/**
 * Smoothly scroll an element to bottom
 */
export function scrollToBottom(element: HTMLElement, smooth = true): void {
  element.scrollTo({
    top: element.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}
