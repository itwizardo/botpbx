'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { Header } from '@/components/layout/header';
import { CommandMenu } from '@/components/layout/command-menu';
import { cn } from '@/lib/utils';
import { PhoneProvider } from '@/contexts/phone-context';
import { DialDialog, ActiveCall } from '@/components/phone';
import { ForcePasswordChangeDialog } from '@/components/auth/force-password-change-dialog';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, isHydrated, checkAuth } = useAuthStore();
  const { sidebarCollapsed } = useUIStore();

  // Check auth on mount after hydration (always call to ensure WebSocket is created)
  useEffect(() => {
    if (isHydrated) {
      checkAuth();
    }
  }, [isHydrated, checkAuth]);

  // Redirect if not authenticated (after hydration and loading check completes)
  useEffect(() => {
    if (isHydrated && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isHydrated, router]);

  // Show loading state until hydration completes or while actively checking auth
  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render dashboard if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <PhoneProvider>
      <div className="min-h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />
        <MobileSidebar />

        {/* Main content */}
        <div
          className={cn(
            'min-h-screen transition-all duration-300',
            sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
          )}
        >
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="pt-16">
            <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>

        {/* Command Menu */}
        <CommandMenu />

        {/* Phone Components */}
        <DialDialog />
        <ActiveCall />

        {/* Force Password Change Dialog */}
        <ForcePasswordChangeDialog />
      </div>
    </PhoneProvider>
  );
}
