import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0 || isNaN(seconds)) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  // Remove non-digits
  const cleaned = phone.replace(/\D/g, '');

  // Check for US phone number
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  // Check for US phone with country code
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  // Return original for international numbers
  return phone;
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: number | string): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format timestamp to date/time string
 */
export function formatDateTime(timestamp: number | string): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  return date.toLocaleString();
}

/**
 * Format timestamp to time only
 */
export function formatTime(timestamp: number | string | null | undefined): string {
  if (timestamp === null || timestamp === undefined) return '-';

  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  if (isNaN(date.getTime())) return '-';

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format timestamp to date only
 */
export function formatDate(timestamp: number | string): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  return date.toLocaleDateString();
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Get initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Check if value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Get status color for campaign/call status
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Campaign statuses
    draft: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
    running: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    paused: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    completed: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    cancelled: 'text-red-600 bg-red-100 dark:bg-red-900/30',

    // Call statuses
    ringing: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    up: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    answered: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    busy: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    noanswer: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
    failed: 'text-red-600 bg-red-100 dark:bg-red-900/30',

    // Contact statuses
    pending: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
    dialing: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    no_answer: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
    dnc: 'text-red-600 bg-red-100 dark:bg-red-900/30',

    // Default
    default: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
  };

  return colors[status.toLowerCase()] || colors.default;
}
