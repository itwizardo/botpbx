'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

const PUBLIC_PATHS = ['/login'];

export function useAuth(options?: { required?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    checkAuth,
    clearError,
  } = useAuthStore();

  const required = options?.required ?? true;

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const isPublicPath = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));

    if (required && !isAuthenticated && !isPublicPath) {
      // Redirect to login
      router.push('/login');
    } else if (isAuthenticated && isPublicPath) {
      // Redirect to dashboard if already logged in
      router.push('/');
    }
  }, [isAuthenticated, isLoading, pathname, router, required]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    clearError,
    isAdmin: user?.role === 'admin',
    isSupervisor: user?.role === 'supervisor' || user?.role === 'admin',
  };
}

export function useRequireAuth() {
  return useAuth({ required: true });
}

export function useOptionalAuth() {
  return useAuth({ required: false });
}
