'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  Sun,
  Moon,
  Monitor,
  LogOut,
  User,
  Settings,
  Menu,
  Key,
  Loader2,
  Phone,
  Wifi,
  WifiOff,
  Upload,
  HelpCircle,
  Wand2,
} from 'lucide-react';
import { useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import { usePhone } from '@/contexts/phone-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SetupWizard } from '@/components/setup/setup-wizard';

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const {
    theme,
    setTheme,
    notificationCount,
    sidebarCollapsed,
    setSidebarMobileOpen,
    setCommandMenuOpen,
  } = useUIStore();

  // Phone
  const { isConnected, isRegistered, callState, openDialDialog } = usePhone();

  // Password change state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Setup wizard state
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);


  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handlePasswordChange = async () => {
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully. Please log in again.');
      setPasswordDialogOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Force logout after password change
      await logout();
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 border-b bg-background/80 backdrop-blur-xl transition-all duration-300',
        sidebarCollapsed ? 'left-16' : 'left-64',
        'max-md:left-0'
      )}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <Button
            variant="outline"
            className="hidden md:flex items-center gap-2 text-muted-foreground w-72 justify-start hover:bg-accent/50 transition-colors"
            onClick={() => setCommandMenuOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search everything...</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Phone Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={callState !== 'idle' ? 'default' : 'ghost'}
                  size="icon"
                  className={cn(
                    'relative',
                    callState !== 'idle' && 'bg-green-500 hover:bg-green-600 text-white'
                  )}
                  onClick={openDialDialog}
                >
                  <Phone className="h-5 w-5" />
                  {/* Connection indicator */}
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
                      isRegistered
                        ? 'bg-green-500'
                        : isConnected
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {callState !== 'idle'
                    ? 'Call in progress'
                    : isRegistered
                      ? 'Make a call'
                      : isConnected
                        ? 'Connecting...'
                        : 'Disconnected'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Help Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open('https://botpbx.com/docs', '_blank')}
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Documentation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="py-4 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      user ? getInitials(user.username) : 'U'
                    )}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.username}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                  <Badge variant="secondary" className="w-fit mt-1 capitalize">
                    {user?.role}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Theme Selector */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === 'light' && <Sun className="h-4 w-4 mr-2" />}
                  {theme === 'dark' && <Moon className="h-4 w-4 mr-2" />}
                  {theme === 'system' && <Monitor className="h-4 w-4 mr-2" />}
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <Sun className="h-4 w-4 mr-2" />
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <Moon className="h-4 w-4 mr-2" />
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')}>
                    <Monitor className="h-4 w-4 mr-2" />
                    System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
                <Key className="h-4 w-4 mr-2" />
                Change Password
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setSetupWizardOpen(true)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Setup Wizard
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => window.open('https://botpbx.com/docs', '_blank')}>
                <HelpCircle className="h-4 w-4 mr-2" />
                Help & Docs
              </DropdownMenuItem>

              {user?.role === 'admin' && (
                <DropdownMenuItem onClick={() => router.push('/settings/users')}>
                  <User className="h-4 w-4 mr-2" />
                  Manage Users
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordDialogOpen(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handlePasswordChange} disabled={isChangingPassword}>
              {isChangingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setup Wizard */}
      <SetupWizard open={setupWizardOpen} onOpenChange={setSetupWizardOpen} />
    </header>
  );
}
