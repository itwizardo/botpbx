'use client';

import { useEffect, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDuration, formatPhoneNumber } from '@/lib/utils';
import type { ActiveCall } from '@/types/models';

interface ActiveCallsMiniProps {
  calls: ActiveCall[];
  loading?: boolean;
}

function CallTimer({ startTime, answerTime }: { startTime: number; answerTime: number | null }) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const baseTime = answerTime || startTime;
    const interval = setInterval(() => {
      setDuration(Math.floor(Date.now() / 1000 - baseTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, answerTime]);

  return <span className="font-mono text-sm">{formatDuration(duration)}</span>;
}

function CallCard({ call }: { call: ActiveCall }) {
  const isInbound = call.context === 'from-trunk' || call.context.includes('inbound');

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          call.state === 'up'
            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
        )}
      >
        {isInbound ? (
          <PhoneIncoming className="h-5 w-5" />
        ) : (
          <PhoneOutgoing className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {formatPhoneNumber(call.callerId)}
          </span>
          {call.state === 'up' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{call.destination}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <CallTimer startTime={call.startTime} answerTime={call.answerTime} />
        <Badge
          variant={call.state === 'up' ? 'success' : 'warning'}
          className="text-xs"
        >
          {call.state === 'up' ? 'Active' : 'Ringing'}
        </Badge>
      </div>
    </div>
  );
}

export function ActiveCallsMini({ calls, loading }: ActiveCallsMiniProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Active Calls</CardTitle>
          <Skeleton className="h-6 w-6 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Active Calls</CardTitle>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{calls.length}</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {calls.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground h-full flex flex-col justify-center">
            <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-base">No active calls</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.slice(0, 5).map((call, index) => (
              <CallCard key={`${call.uniqueId || call.channel}-${index}`} call={call} />
            ))}
            {calls.length > 5 && (
              <div className="text-center text-xs text-muted-foreground pt-2">
                +{calls.length - 5} more calls
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
