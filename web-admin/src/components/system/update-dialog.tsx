'use client';

import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { systemApi } from '@/lib/api';
import { useUIStore } from '@/stores/ui-store';

export function UpdateDialog() {
  const {
    updateInfo,
    updateDialogOpen,
    autoUpdateEnabled,
    setUpdateDialogOpen,
    setAutoUpdateEnabled,
    setUpdateInfo,
    setUpdateChecking,
  } = useUIStore();

  // Fetch auto-update setting on mount
  const { data: autoUpdateData } = useQuery({
    queryKey: ['auto-update-setting'],
    queryFn: systemApi.getAutoUpdate,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (autoUpdateData) {
      setAutoUpdateEnabled(autoUpdateData.enabled);
    }
  }, [autoUpdateData, setAutoUpdateEnabled]);

  // Check for updates mutation
  const { mutate: checkForUpdates, isPending: isChecking } = useMutation({
    mutationFn: systemApi.checkUpdates,
    onSuccess: (data) => {
      setUpdateInfo(data);
      setUpdateChecking(false);
      if (data.hasUpdate) {
        setUpdateDialogOpen(true);
      } else {
        toast.success('You are running the latest version');
      }
    },
    onError: (error: Error) => {
      setUpdateChecking(false);
      toast.error(error.message || 'Failed to check for updates');
    },
  });

  // Trigger update mutation
  const { mutate: triggerUpdate, isPending: isUpdating } = useMutation({
    mutationFn: systemApi.triggerUpdate,
    onSuccess: (data) => {
      toast.success(data.message);
      setUpdateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to trigger update');
    },
  });

  // Toggle auto-update mutation
  const { mutate: toggleAutoUpdate } = useMutation({
    mutationFn: (enabled: boolean) => systemApi.setAutoUpdate(enabled),
    onSuccess: (data) => {
      setAutoUpdateEnabled(data.enabled);
      toast.success(`Auto-updates ${data.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update setting');
    },
  });

  const handleAutoUpdateToggle = (checked: boolean) => {
    toggleAutoUpdate(checked);
  };

  const handleUpdate = () => {
    triggerUpdate();
  };

  const handleCheckForUpdates = () => {
    setUpdateChecking(true);
    checkForUpdates();
  };

  return (
    <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Update Available
          </DialogTitle>
          <DialogDescription>
            A new version of BotPBX is available for installation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Version Info */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Current Version</p>
              <p className="text-2xl font-bold text-muted-foreground">
                v{updateInfo?.currentVersion || '...'}
              </p>
            </div>
            <div className="text-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 mx-auto mb-1" />
            </div>
            <div className="space-y-1 text-right">
              <p className="text-sm font-medium">New Version</p>
              <p className="text-2xl font-bold text-primary">
                v{updateInfo?.latestVersion || '...'}
              </p>
            </div>
          </div>

          {/* Release Notes Link */}
          {updateInfo?.releaseUrl && (
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View release notes on GitHub
            </a>
          )}

          <Separator />

          {/* Auto-Update Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-update" className="text-sm font-medium">
                Automatic Updates
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically install updates when available
              </p>
            </div>
            <Switch
              id="auto-update"
              checked={autoUpdateEnabled}
              onCheckedChange={handleAutoUpdateToggle}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} loading={isUpdating}>
            <Download className="h-4 w-4" />
            Update Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Export a button component for triggering update check
export function CheckForUpdatesButton() {
  const { setUpdateChecking, setUpdateInfo, setUpdateDialogOpen, updateChecking } = useUIStore();

  const { mutate: checkForUpdates, isPending } = useMutation({
    mutationFn: systemApi.checkUpdates,
    onSuccess: (data) => {
      setUpdateInfo(data);
      setUpdateChecking(false);
      if (data.hasUpdate) {
        setUpdateDialogOpen(true);
      } else {
        toast.success('You are running the latest version');
      }
    },
    onError: (error: Error) => {
      setUpdateChecking(false);
      toast.error(error.message || 'Failed to check for updates');
    },
  });

  const handleClick = () => {
    setUpdateChecking(true);
    checkForUpdates();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      loading={isPending || updateChecking}
    >
      <RefreshCw className="h-4 w-4" />
      Check for Updates
    </Button>
  );
}
