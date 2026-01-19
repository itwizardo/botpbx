'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useUIStore } from '@/stores/ui-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
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
  }, [theme]);

  return <>{children}</>;
}

function AuthListener({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleUnauthorized = () => {
      window.location.href = '/login';
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return <>{children}</>;
}

function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
            gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
            refetchOnWindowFocus: false, // Don't refetch when switching tabs
            refetchOnMount: true, // But do fetch when mounting if stale
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KeyboardShortcutsProvider>
          <AuthListener>{children}</AuthListener>
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: 'bg-background border-border',
                title: 'text-foreground',
                description: 'text-muted-foreground',
              },
            }}
          />
        </KeyboardShortcutsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
