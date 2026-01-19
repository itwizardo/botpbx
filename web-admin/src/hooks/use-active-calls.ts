'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callsApi } from '@/lib/api';
import { useCallsStore, selectActiveCallsArray, selectActiveCallCount } from '@/stores/calls-store';
import { useCallEvents } from './use-websocket';
import type { ActiveCall } from '@/types/models';

export function useActiveCalls() {
  const queryClient = useQueryClient();
  const { setActiveCalls, activeCalls } = useCallsStore();
  const initialized = useRef(false);

  // Listen for WebSocket events
  useCallEvents();

  // Initial fetch of active calls
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activeCalls'],
    queryFn: async () => {
      const response = await callsApi.listActive();
      return response.calls;
    },
    refetchInterval: 30000, // Fallback polling every 30s
    staleTime: 10000,
  });

  // Sync initial data to store
  useEffect(() => {
    if (data && !initialized.current) {
      setActiveCalls(data);
      initialized.current = true;
    }
  }, [data, setActiveCalls]);

  // Get calls from store
  const calls = selectActiveCallsArray(useCallsStore.getState());
  const callCount = selectActiveCallCount(useCallsStore.getState());

  return {
    calls: initialized.current ? calls : data || [],
    callCount: initialized.current ? callCount : data?.length || 0,
    isLoading,
    error,
    refetch,
  };
}

// Hook for a single call with live duration
export function useCallDuration(call: ActiveCall): number {
  const startTime = call.answerTime || call.startTime;
  const now = Date.now() / 1000;

  // This would need a timer to update, but for now return static
  return Math.floor(now - startTime);
}
