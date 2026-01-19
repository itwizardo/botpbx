'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { getWebSocketClient, type WsEventHandler } from '@/lib/websocket';
import { useCallsStore } from '@/stores/calls-store';
import type { ActiveCall } from '@/types/models';
import type { WsCallStarted, WsCallAnswered, WsCallEnded } from '@/types/api';

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);

  // Poll for connection state changes (WebSocket client created async after auth)
  useEffect(() => {
    const checkConnection = () => {
      const client = getWebSocketClient();
      setIsConnected(client?.isConnected ?? false);
    };

    checkConnection();
    const interval = setInterval(checkConnection, 500);
    return () => clearInterval(interval);
  }, []);

  const subscribe = useCallback((channel: string) => {
    getWebSocketClient()?.subscribe(channel);
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    getWebSocketClient()?.unsubscribe(channel);
  }, []);

  const on = useCallback((event: string, handler: WsEventHandler) => {
    return getWebSocketClient()?.on(event, handler) || (() => {});
  }, []);

  const send = useCallback((type: string, data: unknown) => {
    getWebSocketClient()?.send(type, data);
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
    on,
    send,
  };
}

// Hook for handling call events
export function useCallEvents() {
  const { addCall, updateCall, removeCall } = useCallsStore();
  const { on } = useWebSocket();

  // Keep track of cleanup functions
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Handle call started (backend sends call:new)
    const unsubStart = on('call:new', (data) => {
      const callData = data as WsCallStarted;
      const call: ActiveCall = {
        uniqueId: callData.uniqueId,
        channel: callData.channel || '',
        callerId: callData.callerId,
        callerName: callData.callerName,
        destination: callData.destination,
        context: callData.context,
        state: 'ringing',
        startTime: Date.now() / 1000,
        answerTime: null,
        duration: 0,
        bridgedTo: null,
        ivrMenuId: null,
        campaignId: null,
      };
      addCall(call);
    });

    // Handle call update (backend sends call:update)
    const unsubUpdate = on('call:update', (data) => {
      const callData = data as any;
      // Use stateDesc (string) instead of state (numeric from Asterisk)
      // Asterisk sends: state=6 (numeric), stateDesc="Up" (string)
      const state = (callData.stateDesc || callData.state || 'up').toString().toLowerCase();
      const isAnswered = state === 'up';

      updateCall(callData.uniqueId, {
        state: state,
        // Set answerTime when call transitions to 'up' state (answered)
        ...(isAnswered && { answerTime: Date.now() / 1000 }),
      });
    });

    // Handle call ended (backend sends call:ended)
    const unsubEnd = on('call:ended', (data) => {
      const { uniqueId } = data as WsCallEnded;
      removeCall(uniqueId);
    });

    // Store cleanup functions
    cleanupRef.current = [unsubStart, unsubUpdate, unsubEnd];

    return () => {
      cleanupRef.current.forEach((cleanup) => cleanup());
    };
  }, [addCall, updateCall, removeCall, on]);
}

// Hook for subscribing to a specific event type
export function useWsEvent(event: string, handler: WsEventHandler) {
  const { on } = useWebSocket();

  useEffect(() => {
    const cleanup = on(event, handler);
    return cleanup;
  }, [event, handler, on]);
}
