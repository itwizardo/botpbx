import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

// Recent search item structure
export interface RecentSearchItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  url: string;
  timestamp: number;
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;

  // Theme
  theme: Theme;

  // Command menu
  commandMenuOpen: boolean;

  // Recent searches
  recentSearches: RecentSearchItem[];

  // Notifications
  notificationCount: number;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMobileOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setCommandMenuOpen: (open: boolean) => void;
  toggleCommandMenu: () => void;
  setNotificationCount: (count: number) => void;
  incrementNotifications: () => void;
  clearNotifications: () => void;
  addRecentSearch: (item: Omit<RecentSearchItem, 'timestamp'>) => void;
  clearRecentSearches: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      theme: 'system',
      commandMenuOpen: false,
      recentSearches: [],
      notificationCount: 0,

      // Actions
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },

      setSidebarMobileOpen: (open) => {
        set({ sidebarMobileOpen: open });
      },

      setTheme: (theme) => {
        set({ theme });

        // Apply theme to document
        if (typeof window !== 'undefined') {
          const root = window.document.documentElement;
          root.classList.remove('light', 'dark');

          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light';
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme);
          }
        }
      },

      setCommandMenuOpen: (open) => {
        set({ commandMenuOpen: open });
      },

      toggleCommandMenu: () => {
        set((state) => ({ commandMenuOpen: !state.commandMenuOpen }));
      },

      setNotificationCount: (count) => {
        set({ notificationCount: count });
      },

      incrementNotifications: () => {
        set((state) => ({ notificationCount: state.notificationCount + 1 }));
      },

      clearNotifications: () => {
        set({ notificationCount: 0 });
      },

      addRecentSearch: (item) => {
        set((state) => {
          // Remove existing item with same id
          const filtered = state.recentSearches.filter((s) => s.id !== item.id);
          // Add new item at the beginning with timestamp
          const newItem: RecentSearchItem = { ...item, timestamp: Date.now() };
          // Keep only last 5 items
          const updated = [newItem, ...filtered].slice(0, 5);
          return { recentSearches: updated };
        });
      },

      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },
    }),
    {
      name: 'botpbx-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user preferences
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        recentSearches: state.recentSearches,
      }),
    }
  )
);

// Initialize theme on load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('botpbx-ui');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      const theme = state?.theme || 'system';
      const root = window.document.documentElement;

      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    } catch {
      // Ignore parse errors
    }
  }
}
