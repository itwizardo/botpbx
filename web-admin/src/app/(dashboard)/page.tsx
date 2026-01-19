'use client';

import { useCallback, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, PhoneIncoming, Clock, Users, HelpCircle, Wifi, WifiOff } from 'lucide-react';
import { useWsEvent, useWebSocket } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';
import { analyticsApi, systemApi, callsApi } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { StatsCard } from '@/components/shared/stats-card';
import { CallsChart } from '@/components/analytics/calls-chart';
import { ActiveCallsMini } from '@/components/calls/active-calls-mini';
import { SystemHealth } from '@/components/shared/system-health';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const { isConnected } = useWebSocket();

  // Force fresh data fetch on component mount (fixes stale cache issue)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
    queryClient.invalidateQueries({ queryKey: ['system-status'] });
    queryClient.invalidateQueries({ queryKey: ['hourly-calls'] });
  }, [queryClient]);

  // WebSocket events trigger instant cache invalidation for real-time updates
  useWsEvent('call:new', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]));

  useWsEvent('call:update', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
  }, [queryClient]));

  useWsEvent('call:ended', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]));

  // Fetch dashboard stats - staleTime: 0 ensures fresh data on every mount
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: analyticsApi.dashboard,
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Fetch hourly call data
  const { data: hourlyData, isLoading: hourlyLoading } = useQuery({
    queryKey: ['hourly-calls'],
    queryFn: analyticsApi.hourly,
    refetchInterval: 60000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Fetch active calls
  const { data: activeCallsData, isLoading: activeCallsLoading } = useQuery({
    queryKey: ['active-calls'],
    queryFn: callsApi.listActive,
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Fetch system status
  const { data: systemData, isLoading: systemLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: systemApi.status,
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your VoIP system performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <div className={cn(
            "flex items-center gap-2 text-sm px-3 py-1 rounded-full border transition-colors",
            isConnected
              ? "text-muted-foreground bg-secondary/50 border-border/50"
              : "text-destructive bg-destructive/10 border-destructive/30"
          )}>
            {isConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-green-500" />
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                Reconnecting...
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Calls Today",
            value: dashboardData?.calls.today ?? 0,
            icon: <Phone className="h-5 w-5" />,
            description: "Total calls received today",
            loading: dashboardLoading
          },
          {
            title: "Active Calls",
            value: activeCallsData?.calls.length ?? 0,
            icon: <PhoneIncoming className="h-5 w-5" />,
            description: "Currently in progress",
            loading: activeCallsLoading
          },
          {
            title: "Avg Duration",
            value: formatDuration(dashboardData?.calls.averageDuration ?? 0),
            icon: <Clock className="h-5 w-5" />,
            description: "Average call duration",
            loading: dashboardLoading
          },
          {
            title: "Connected Clients",
            value: dashboardData?.system.connectedClients ?? 0,
            icon: <Users className="h-5 w-5" />,
            description: "Active admin sessions",
            loading: dashboardLoading,
            variant: "red" as const
          }
        ].map((card, i) => {
          // Map index to other variants if needed, or hardcode above
          const variants = ["yellow", "pink", "blue", "red"] as const;
          const variant = card.variant || variants[i % variants.length];

          return (
            <div key={card.title} className="animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'backwards' }}>
              <StatsCard {...card} variant={variant} />
            </div>
          );
        })}
      </div>

      {/* Charts and Active Calls */}
      <div className="grid gap-6 lg:grid-cols-2 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-backwards">
        {/* Calls Chart */}
        <div>
          <CallsChart
            data={hourlyData?.data ?? []}
            loading={hourlyLoading}
          />
        </div>

        {/* Active Calls */}
        <div>
          <ActiveCallsMini
            calls={activeCallsData?.calls ?? []}
            loading={activeCallsLoading}
          />
        </div>
      </div>

      {/* System Health */}
      <div className="grid gap-6 lg:grid-cols-3 animate-in slide-in-from-bottom-8 duration-700 delay-500 fill-mode-backwards">
        <SystemHealth
          data={systemData ?? null}
          loading={systemLoading}
        />

        {/* Campaign Summary */}
        <div className="lg:col-span-2">
          <div className="h-full rounded-xl border bg-card/50 backdrop-blur-sm p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
              Campaign Summary
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Running Campaigns", value: dashboardData?.campaigns.running ?? 0, color: "text-blue-500" },
                { label: "Total Campaigns", value: dashboardData?.campaigns.total ?? 0, color: "text-foreground" },
                { label: "Total Recordings", value: dashboardData?.recordings.count ?? 0, color: "text-orange-500" },
                { label: "Answered Today", value: dashboardData?.calls.answered ?? 0, color: "text-green-500" }
              ].map((stat, i) => (
                <div key={stat.label} className="p-4 rounded-xl bg-background/50 border border-border/50 hover:bg-background hover:border-primary/20 transition-colors group">
                  <div className={cn("text-3xl font-bold mb-1 transition-transform group-hover:scale-110 origin-left", stat.color)}>
                    {stat.value}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dashboard Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Overview</h4>
              <p className="text-sm text-muted-foreground">
                The dashboard provides a real-time overview of your VoIP system performance, including call statistics, active calls, and system health.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Stats Cards</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Calls Today:</strong> Total calls received since midnight</li>
                <li><strong>Active Calls:</strong> Calls currently in progress</li>
                <li><strong>Avg Duration:</strong> Average call length today</li>
                <li><strong>Connected Clients:</strong> Active admin browser sessions</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Charts</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Calls Chart:</strong> Hourly call volume over the last 24 hours</li>
                <li><strong>Active Calls:</strong> Live view of ongoing calls with caller info</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Real-Time Updates</h4>
              <p className="text-sm text-muted-foreground">
                Data updates automatically via WebSocket. The green "System Online" indicator shows your connection status.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
