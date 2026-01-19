'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Phone,
  Mic,
  GitBranch,
  Users,
  Plug,
  Megaphone,
  BarChart3,
  Settings,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Volume2,
  UsersRound,
  Route,
  ListOrdered,
  Bot,
  Key,
  Voicemail,
  MessageSquare,
  FolderOpen,
  Download,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { systemApi } from '@/lib/api';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  permission?: string; // Required permission to view this item
}

// Map routes to their required permissions
export const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'calls.view' },
  { title: 'Recordings', href: '/recordings', icon: Mic, permission: 'recordings.view' },
  { title: 'Voicemails', href: '/voicemails', icon: Voicemail, permission: 'recordings.view' },
  { title: 'IVR Menus', href: '/ivr', icon: GitBranch, permission: 'ivr.view' },
  { title: 'Prompts', href: '/prompts', icon: Volume2, permission: 'prompts.view' },
  { title: 'Routes', href: '/routes', icon: Route, permission: 'routing.view' },
  { title: 'Extensions', href: '/extensions', icon: Users, permission: 'extensions.view' },
  { title: 'Ring Groups', href: '/ring-groups', icon: UsersRound, permission: 'ring_groups.view' },
  { title: 'Queues', href: '/queues', icon: ListOrdered, permission: 'queues.view' },
  { title: 'Trunks', href: '/trunks', icon: Plug, permission: 'trunks.view' },
  { title: 'Contact Groups', href: '/contacts', icon: FolderOpen, permission: 'contacts.view' },
  { title: 'Campaigns', href: '/campaigns', icon: Megaphone, permission: 'campaigns.view' },
  { title: 'AI Agents', href: '/ai-agents', icon: Bot, permission: 'ai_agents.view' },
  { title: 'AI Conversations', href: '/ai-agents/conversations', icon: MessageSquare, permission: 'ai_agents.view' },
  { title: 'AI Providers', href: '/settings/ai-providers', icon: Key, permission: 'settings.view' },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'analytics.view' },
  { title: 'AI Analytics', href: '/analytics/ai', icon: Bot, permission: 'analytics.view' },
];

export const bottomNavItems: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings.view' },
  { title: 'System', href: '/system', icon: Monitor, permission: 'system.view' },
];

// All nav items for checking exact matches
const allNavItems = [...mainNavItems, ...bottomNavItems];

function NavLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const pathname = usePathname();

  // Check if any nav item exactly matches the current pathname
  const hasExactNavMatch = allNavItems.some(nav => pathname === nav.href);

  // If there's an exact match in nav, only highlight that exact item
  // Otherwise, use prefix matching for nested routes not in nav
  const isActive = hasExactNavMatch
    ? pathname === item.href
    : (pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href + '/')));

  const linkContent = (
    <Link
      href={item.href}
      prefetch={true}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'active:scale-[0.98] active:bg-sidebar-accent',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70',
        collapsed && 'justify-center px-2'
      )}
    >
      <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-sidebar-primary')} />
      {!collapsed && (
        <>
          <span className="flex-1">{item.title}</span>
          {item.badge && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          {item.title}
          {item.badge && (
            <span className="ml-auto text-muted-foreground">{item.badge}</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    updateInfo,
    setUpdateInfo,
    setUpdateDialogOpen,
    updateChecking,
    setUpdateChecking
  } = useUIStore();
  const { hasPermission, user } = useAuthStore();

  // Check for updates on mount (for admins only)
  const { mutate: checkForUpdates } = useMutation({
    mutationFn: systemApi.checkUpdates,
    onSuccess: (data) => {
      setUpdateInfo(data);
      setUpdateChecking(false);
    },
    onError: () => {
      setUpdateChecking(false);
    },
  });

  useEffect(() => {
    // Only check for updates if user is admin
    if (user?.role === 'admin' && !updateInfo) {
      checkForUpdates();
    }
  }, [user?.role]);

  // Filter nav items based on user permissions
  const filteredMainNav = mainNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );
  const filteredBottomNav = bottomNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const handleUpdateClick = () => {
    if (updateInfo?.hasUpdate) {
      setUpdateDialogOpen(true);
    } else {
      setUpdateChecking(true);
      checkForUpdates();
    }
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-white/5 bg-sidebar/95 backdrop-blur-xl transition-all duration-300',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div
            className={cn(
              'flex h-16 items-center border-b px-4',
              sidebarCollapsed ? 'justify-center' : 'justify-between'
            )}
          >
            {!sidebarCollapsed && (
              <Link href="/" className="flex items-center gap-2">
                <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                  <Image
                    src="/logo.png"
                    alt="BotPbx Logo"
                    fill
                    className="object-cover"
                  />
                </div>
                <span className="font-bold text-lg">BotPbx</span>
              </Link>
            )}
            {sidebarCollapsed && (
              <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                <Image
                  src="/logo.png"
                  alt="BotPbx Logo"
                  fill
                  className="object-cover"
                />
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 py-4">
            <nav className="flex flex-col gap-1">
              {filteredMainNav.map((item) => (
                <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
              ))}
            </nav>
          </ScrollArea>

          {/* Bottom Navigation */}
          <div className="mt-auto border-t px-3 py-4">
            <nav className="flex flex-col gap-1">
              {filteredBottomNav.map((item) => (
                <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
              ))}
            </nav>

            {/* Update Indicator (Admin only) */}
            {user?.role === 'admin' && (
              <>
                <Separator className="my-4" />
                {sidebarCollapsed ? (
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUpdateClick}
                        className={cn(
                          'w-full justify-center relative',
                          updateInfo?.hasUpdate && 'text-primary'
                        )}
                        disabled={updateChecking}
                      >
                        {updateChecking ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {updateInfo?.hasUpdate && (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-success animate-pulse" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {updateInfo?.hasUpdate
                        ? `Update Available: v${updateInfo.latestVersion}`
                        : `Version ${updateInfo?.currentVersion || '...'}`}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUpdateClick}
                    className={cn(
                      'w-full justify-start relative',
                      updateInfo?.hasUpdate && 'text-primary'
                    )}
                    disabled={updateChecking}
                  >
                    {updateChecking ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    <span className="flex-1 text-left">
                      {updateInfo?.hasUpdate
                        ? 'Update Available'
                        : `v${updateInfo?.currentVersion || '...'}`}
                    </span>
                    {updateInfo?.hasUpdate && (
                      <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    )}
                  </Button>
                )}
              </>
            )}

            <Separator className="my-4" />

            {/* Collapse Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className={cn(
                'w-full justify-center',
                !sidebarCollapsed && 'justify-start'
              )}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  <span>Collapse</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
