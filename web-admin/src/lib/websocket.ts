/**
 * WebSocket client with automatic reconnection
 */

import type { WsMessage } from '@/types/api';

export type WsEventHandler = (data: unknown) => void;

interface WebSocketClientOptions {
  url: string;
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private handlers: Map<string, Set<WsEventHandler>> = new Map();
  private isConnecting = false;
  private shouldReconnect = true;

  // Callbacks
  private onConnect?: () => void;
  private onDisconnect?: () => void;
  private onError?: (error: Event) => void;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.token = options.token;
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
  }

  connect(): void {
    if (this.ws || this.isConnecting) return;

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const wsUrl = `${this.url}?token=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  subscribe(channel: string): void {
    this.send('subscribe', { channel });
  }

  unsubscribe(channel: string): void {
    this.send('unsubscribe', { channel });
  }

  ping(): void {
    this.send('ping', {});
  }

  on(event: string, handler: WsEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: WsEventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  updateToken(token: string): void {
    this.token = token;

    // Reconnect with new token if currently connected
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  private handleOpen(): void {
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Subscribe to default channels
    this.subscribe('calls');
    this.subscribe('system');

    this.onConnect?.();
  }

  private handleClose(event: CloseEvent): void {
    this.isConnecting = false;
    this.ws = null;

    this.onDisconnect?.();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.onError?.(error);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WsMessage = JSON.parse(event.data);

      // Handle pong
      if (message.type === 'pong') {
        return;
      }

      // Dispatch to handlers
      const handlers = this.handlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(message.data);
          } catch (error) {
            console.error(`Error in WebSocket handler for ${message.type}:`, error);
          }
        });
      }

      // Also dispatch to wildcard handlers
      const wildcardHandlers = this.handlers.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error('Error in WebSocket wildcard handler:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient | null {
  return wsClient;
}

export function createWebSocketClient(token: string): WebSocketClient {
  // Dynamically determine WebSocket URL based on current location
  let wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (!wsUrl && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = 3000; // API server port
    wsUrl = `${protocol}//${host}:${port}`;
  }
  wsUrl = wsUrl || 'ws://localhost:3000';

  wsClient = new WebSocketClient({
    url: `${wsUrl}/ws`,
    token,
  });

  return wsClient;
}

export function destroyWebSocketClient(): void {
  wsClient?.disconnect();
  wsClient = null;
}
