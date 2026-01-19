'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Monitor, RefreshCw, Database, Server, HardDrive, HelpCircle } from 'lucide-react';
import { systemApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function SystemPage() {
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: systemApi.status,
    refetchInterval: 10000,
  });

  const reloadMutation = useMutation({
    mutationFn: systemApi.asteriskReload,
    onSuccess: () => {
      toast.success('Asterisk configuration reloaded');
      refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reload Asterisk');
    },
  });

  // Parse backend response format
  const asteriskConnected = data?.services?.asterisk === 'online';
  const amiConnected = data?.services?.ami === 'connected';
  const databaseConnected = data?.services?.database === 'connected';
  const wsClients = data?.services?.websocket || '0 clients';

  const memoryPercent = data?.system
    ? Math.round(((data.system.totalMemory - data.system.freeMemory) / data.system.totalMemory) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground">Monitor system health and performance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Asterisk Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Asterisk</CardTitle>
              {isLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Badge variant={asteriskConnected ? 'success' : 'destructive'}>
                  {asteriskConnected ? 'Online' : 'Offline'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-xs">{data?.services?.asteriskVersion || 'unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AMI Status</span>
                  <Badge variant={amiConnected ? 'success' : 'secondary'} className="text-xs">
                    {amiConnected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WebSocket</span>
                  <span className="font-mono text-xs">{wsClients}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Database</CardTitle>
              {isLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Badge variant={databaseConnected ? 'success' : 'destructive'}>
                  {databaseConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-4 w-full" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span>{data?.services?.databaseType || 'PostgreSQL'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={databaseConnected ? 'text-green-600' : 'text-red-600'}>
                    {databaseConnected ? 'Healthy' : 'Error'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">System</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="capitalize">{data?.system?.platform} ({data?.system?.arch})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hostname</span>
                  <span className="font-mono text-xs">{data?.system?.hostname?.substring(0, 20)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPUs</span>
                  <span>{data?.system?.cpus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span>{data?.uptimeHuman || 'N/A'}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory</span>
                    <span>{memoryPercent}%</span>
                  </div>
                  <Progress value={memoryPercent} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Used: {data?.system ? formatBytes((data.system.totalMemory - data.system.freeMemory) * 1024 * 1024) : 0}</span>
                    <span>Total: {data?.system ? formatBytes(data.system.totalMemory * 1024 * 1024) : 0}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Process Memory */}
      <Card>
        <CardHeader>
          <CardTitle>Application Memory</CardTitle>
          <CardDescription>Node.js process memory usage</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{data?.memory?.heapUsed || 0} MB</div>
                <div className="text-muted-foreground">Heap Used</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{data?.memory?.heapTotal || 0} MB</div>
                <div className="text-muted-foreground">Heap Total</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{data?.memory?.rss || 0} MB</div>
                <div className="text-muted-foreground">RSS</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common system management tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => reloadMutation.mutate()}
              disabled={reloadMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {reloadMutation.isPending ? 'Reloading...' : 'Reload Asterisk'}
            </Button>
            <Button variant="outline">
              <Database className="h-4 w-4 mr-2" />
              Backup Database
            </Button>
            <Button variant="outline">
              <Server className="h-4 w-4 mr-2" />
              View Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>System Status Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Service Status</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Asterisk:</strong> The core PBX engine - must be Online for calls</li>
                <li><strong>AMI:</strong> Manager Interface connection to Asterisk</li>
                <li><strong>Database:</strong> SQLite database for storing configuration</li>
                <li><strong>WebSocket:</strong> Real-time browser connections</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Status Indicators</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Green:</strong> Service is running normally</li>
                <li><strong>Red:</strong> Service is offline or has an error</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Quick Actions</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Reload Asterisk:</strong> Apply configuration changes without restart</li>
                <li><strong>Backup Database:</strong> Create a backup of your settings</li>
                <li><strong>View Logs:</strong> Check system logs for troubleshooting</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Memory Usage</h4>
              <p className="text-sm text-muted-foreground">
                Monitor system and application memory. High memory usage may indicate a need to restart services or add resources.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
