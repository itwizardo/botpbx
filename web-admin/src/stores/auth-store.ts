import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types/models';
import { authApi, clearTokens, hasToken, setTokens } from '@/lib/api';
import { createWebSocketClient, destroyWebSocketClient, getWebSocketClient } from '@/lib/websocket';

interface AuthState {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  mustChangePassword: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setHydrated: (hydrated: boolean) => void;
  hasPermission: (permission: string) => boolean;
  clearMustChangePassword: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,
      mustChangePassword: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.login({ username, password });

          // Create WebSocket connection
          createWebSocketClient(response.token);
          getWebSocketClient()?.connect();

          // Fetch permissions after login
          let permissions: string[] = [];
          try {
            const meResponse = await authApi.me();
            permissions = (meResponse as any).permissions || [];
          } catch {
            // If /me fails, we still have the user from login
          }

          // Check if user must change password
          const mustChangePassword = response.mustChangePassword || response.user.mustChangePassword || false;

          set({
            user: response.user,
            permissions,
            isAuthenticated: true,
            isLoading: false,
            mustChangePassword,
            error: null,
          });
        } catch (error) {
          set({
            user: null,
            permissions: [],
            isAuthenticated: false,
            isLoading: false,
            mustChangePassword: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Ignore errors during logout
        } finally {
          clearTokens();
          destroyWebSocketClient();
          set({
            user: null,
            permissions: [],
            isAuthenticated: false,
            isLoading: false,
            mustChangePassword: false,
            error: null,
          });
        }
      },

      checkAuth: async () => {
        if (!hasToken()) {
          set({ isLoading: false, isAuthenticated: false, user: null, permissions: [], mustChangePassword: false });
          return;
        }

        set({ isLoading: true });

        try {
          const response = await authApi.me();

          // Create WebSocket connection if not exists
          if (!getWebSocketClient()) {
            const token = localStorage.getItem('botpbx_token');
            if (token) {
              createWebSocketClient(token);
              getWebSocketClient()?.connect();
            }
          } else {
            // WebSocket client exists but may be disconnected - reconnect if needed
            const client = getWebSocketClient();
            if (client && !client.isConnected) {
              client.connect();
            }
          }

          set({
            user: response.user,
            permissions: (response as any).permissions || [],
            isAuthenticated: true,
            isLoading: false,
            mustChangePassword: response.user.mustChangePassword || false,
            error: null,
          });
        } catch {
          clearTokens();
          destroyWebSocketClient();
          set({
            user: null,
            permissions: [],
            isAuthenticated: false,
            isLoading: false,
            mustChangePassword: false,
            error: null,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setHydrated: (hydrated: boolean) => {
        set({ isHydrated: hydrated });
      },

      hasPermission: (permission: string) => {
        const state = get();
        // Admin always has all permissions
        if (state.user?.role === 'admin') return true;
        return state.permissions.includes(permission);
      },

      clearMustChangePassword: () => {
        set({ mustChangePassword: false });
      },

      updateUser: (updates: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },
    }),
    {
      name: 'botpbx-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user info, not loading state
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
        mustChangePassword: state.mustChangePassword,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when hydration completes - mark store as hydrated
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);
