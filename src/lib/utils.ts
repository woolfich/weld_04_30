import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize article format: uppercase letters, remove spaces, keep digits attached
 * e.g., "хт 44" → "ХТ44", "Хт13" → "ХТ13"
 */
export function normalizeArticle(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/**
 * Format a number with 2 decimal places using comma as separator (Russian locale)
 * e.g., 0.5 → "0,50", 1.3 → "1,30"
 */
export function formatQty(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/**
 * Format a number for display, stripping unnecessary trailing zeros
 * e.g., 10.00 → "10", 1.30 → "1,3", 0.50 → "0,5"
 */
export function formatQtyShort(n: number): string {
  const fixed = n.toFixed(2).replace('.', ',');
  // Remove trailing zeros after comma, but keep at least one decimal if there are decimals
  return fixed.replace(/,?0+$/, '').replace(/,$/, '') || '0';
}

/**
 * Parse a quantity from input (handles both dot and comma as decimal separator)
 */
export function parseQty(input: string): number {
  const normalized = input.replace(',', '.').trim();
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Format date for display (Russian format)
 * e.g., "2024-01-15" → "15.01.2024"
 */
export function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Format date as short DD.MM (no year)
 * e.g., "2024-01-15" → "15.01"
 */
export function formatDateShort(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}`;
}

/**
 * Format a Date object as YYYY-MM-DD string
 */
export function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get today's date as ISO string YYYY-MM-DD
 */
export function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get the most recent Saturday (today if today is Saturday, otherwise the previous Saturday)
 * Used for СБ button: on Monday, returns the Saturday just before
 */
export function getSaturdayStr(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  let diff: number;
  if (dayOfWeek === 6) {
    diff = 0; // Today is Saturday
  } else if (dayOfWeek === 0) {
    diff = -1; // Today is Sunday, yesterday was Saturday
  } else {
    diff = -(dayOfWeek + 1); // Mon=-2, Tue=-3, Wed=-4, Thu=-5, Fri=-6
  }
  const sat = new Date(now);
  sat.setDate(now.getDate() + diff);
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
}

/**
 * Get the most recent Sunday (today if today is Sunday, otherwise the previous Sunday)
 * Used for ВС button: on Monday, returns the Sunday just before
 */
export function getSundayStr(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  let diff: number;
  if (dayOfWeek === 0) {
    diff = 0; // Today is Sunday
  } else {
    diff = -dayOfWeek; // Mon=-1, Tue=-2, ..., Sat=-6
  }
  const sun = new Date(now);
  sun.setDate(now.getDate() + diff);
  return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
}

/**
 * Calculate hours from quantity using proportional method
 * If norm is 10h and quantity is 0.5, then hours = 5h
 */
export function calcHours(quantity: number, normHours: number): number {
  return Math.round(quantity * normHours * 100) / 100;
}

/**
 * Sort articles in ascending alphabetical/numerical order
 * e.g., ХТ04, ХТ13, ХТ44, ХТ55
 */
export function sortArticles<T extends { article: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.article.localeCompare(b.article, 'ru'));
}

/**
 * Sort items by updatedAt descending (most recent first)
 */
export function sortByUpdatedDesc<T extends { updatedAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get short day name in Russian
 */
export function getShortDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[date.getDay()];
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string): boolean {
  return dateStr === getTodayStr();
}

/**
 * Format a date for day group header with day name
 * e.g., "15.01.2024 (Пн)"
 */
export function formatDateHeader(dateStr: string): string {
  return `${formatDate(dateStr)} (${getShortDayName(dateStr)})`;
}

/**
 * Daily work hours limit - maximum hours per day before overflow
 */
export const DAILY_HOURS_LIMIT = 8;

/**
 * Add N days to a date string
 * e.g., addDays("2024-01-15", 1) → "2024-01-16"
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Get the next workday (Monday-Friday) after the given date
 * Skips Saturday and Sunday
 */
export function getNextWorkday(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const next = new Date(date);
  next.setDate(date.getDate() + 1);

  const day = next.getDay();
  if (day === 6) { // Saturday → skip to Monday
    next.setDate(next.getDate() + 2);
  } else if (day === 0) { // Sunday → skip to Monday
    next.setDate(next.getDate() + 1);
  }

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Get dayType for a date ('sb' for Saturday, 'vs' for Sunday, 'workday' otherwise)
 */
export function getDayTypeForDate(dateStr: string): 'workday' | 'sb' | 'vs' {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  if (day === 6) return 'sb';
  if (day === 0) return 'vs';
  return 'workday';
}
