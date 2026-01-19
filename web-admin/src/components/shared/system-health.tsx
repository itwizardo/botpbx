'use client';

import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SystemStatusResponse } from '@/types/api';

interface SystemHealthProps {
  data: SystemStatusResponse | null;
  loading?: boolean;
}

function StatusIndicator({
  status,
  label,
  detail,
}: {
  status: 'ok' | 'error' | 'warning';
  label: string;
  detail?: string;
}) {
  const icons = {
    ok: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
  };

  const colors = {
    ok: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
  };

  const Icon = icons[status];

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', colors[status])} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {detail && (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

export function SystemHealth({ data, loading }: SystemHealthProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">System Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-4 text-center text-sm text-muted-foreground">
            Unable to load system status
          </div>
        </CardContent>
      </Card>
    );
  }

  const asteriskOk = data.services.asterisk === 'online';
  const amiOk = data.services.ami === 'connected';
  const databaseOk = data.services.database === 'connected';
  const memoryPercent = Math.round(((data.system.totalMemory - data.system.freeMemory) / data.system.totalMemory) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">System Health</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <StatusIndicator
          status={asteriskOk ? 'ok' : 'error'}
          label="Asterisk"
          detail={asteriskOk ? 'Online' : 'Offline'}
        />
        <StatusIndicator
          status={amiOk ? 'ok' : 'error'}
          label="AMI Connection"
          detail={amiOk ? 'Connected' : 'Disconnected'}
        />
        <StatusIndicator
          status={databaseOk ? 'ok' : 'error'}
          label="Database"
          detail={databaseOk ? 'Connected' : 'Disconnected'}
        />
        <StatusIndicator
          status={memoryPercent > 90 ? 'warning' : 'ok'}
          label="Memory"
          detail={`${memoryPercent}% used`}
        />
        <StatusIndicator
          status="ok"
          label="System Uptime"
          detail={data.uptimeHuman}
        />
      </CardContent>
    </Card>
  );
}
