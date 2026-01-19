'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
}

// Global shortcuts
const globalShortcuts: ShortcutConfig[] = [
  {
    key: 'k',
    meta: true,
    handler: () => useUIStore.getState().toggleCommandMenu(),
    description: 'Open command menu',
  },
  {
    key: 'k',
    ctrl: true,
    handler: () => useUIStore.getState().toggleCommandMenu(),
    description: 'Open command menu',
  },
  {
    key: 'b',
    meta: true,
    handler: () => useUIStore.getState().toggleSidebar(),
    description: 'Toggle sidebar',
  },
  {
    key: 'b',
    ctrl: true,
    handler: () => useUIStore.getState().toggleSidebar(),
    description: 'Toggle sidebar',
  },
];

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[] = []) {
  useEffect(() => {
    const allShortcuts = [...globalShortcuts, ...shortcuts];

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow command menu shortcut in inputs
        const isCommandShortcut =
          (event.metaKey || event.ctrlKey) && event.key === 'k';
        if (!isCommandShortcut) {
          return;
        }
      }

      for (const shortcut of allShortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // Special handling for meta/ctrl on different platforms
        const modifierMatch =
          (shortcut.meta && (event.metaKey || event.ctrlKey)) ||
          (shortcut.ctrl && (event.ctrlKey || event.metaKey)) ||
          (!shortcut.meta && !shortcut.ctrl && !event.metaKey && !event.ctrlKey);

        if (keyMatch && shiftMatch && altMatch && modifierMatch) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Get all available shortcuts for display
export function getAvailableShortcuts(): Array<{
  keys: string;
  description: string;
}> {
  const isMac = typeof window !== 'undefined' && navigator.platform.includes('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  return globalShortcuts.map((shortcut) => {
    const keys: string[] = [];
    if (shortcut.ctrl || shortcut.meta) keys.push(modKey);
    if (shortcut.shift) keys.push('Shift');
    if (shortcut.alt) keys.push(isMac ? 'Option' : 'Alt');
    keys.push(shortcut.key.toUpperCase());

    return {
      keys: keys.join(' + '),
      description: shortcut.description,
    };
  });
}
