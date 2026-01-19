import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { ApiContext } from './server';
import { wsLogger } from '../utils/logger';

export interface WsClient {
  socket: WebSocket;
  userId: number;
  username: string;
  role: string;
  subscriptions: Set<string>;
  audioSubscriptions: Set<string>; // Audio session IDs
}

export interface WsMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

export class WebSocketManager {
  private clients: Map<WebSocket, WsClient> = new Map();
  private audioCallbacks: Map<string, (audio: Buffer) => void> = new Map();

  addClient(socket: WebSocket, userId: number, username: string, role: string): void {
    this.clients.set(socket, {
      socket,
      userId,
      username,
      role,
      subscriptions: new Set(['calls', 'system']),
      audioSubscriptions: new Set(),
    });
    wsLogger.info(`Client connected: ${username} (${this.clients.size} total)`);
  }

  removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (client) {
      wsLogger.info(`Client disconnected: ${client.username}`);
      // Clean up audio subscriptions
      for (const sessionId of client.audioSubscriptions) {
        this.unsubscribeFromAudio(socket, sessionId);
      }
    }
    this.clients.delete(socket);
  }

  subscribe(socket: WebSocket, channel: string): void {
    const client = this.clients.get(socket);
    if (client) {
      client.subscriptions.add(channel);
    }
  }

  unsubscribe(socket: WebSocket, channel: string): void {
    const client = this.clients.get(socket);
    if (client) {
      client.subscriptions.delete(channel);
    }
  }

  broadcast(channel: string, type: string, data: unknown): void {
    const message: WsMessage = {
      type,
      data,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);

    for (const [socket, client] of this.clients) {
      if (client.subscriptions.has(channel) && socket.readyState === WebSocket.OPEN) {
        socket.send(json);
      }
    }
  }

  broadcastToAll(type: string, data: unknown): void {
    const message: WsMessage = {
      type,
      data,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);

    for (const [socket] of this.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(json);
      }
    }
  }

  sendToUser(userId: number, type: string, data: unknown): void {
    const message: WsMessage = {
      type,
      data,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);

    for (const [socket, client] of this.clients) {
      if (client.userId === userId && socket.readyState === WebSocket.OPEN) {
        socket.send(json);
      }
    }
  }

  getConnectedCount(): number {
    return this.clients.size;
  }

  getConnectedUsers(): Array<{ userId: number; username: string; role: string }> {
    const users: Array<{ userId: number; username: string; role: string }> = [];
    for (const client of this.clients.values()) {
      users.push({
        userId: client.userId,
        username: client.username,
        role: client.role,
      });
    }
    return users;
  }

  /**
   * Subscribe to audio for a browser spy session
   */
  subscribeToAudio(socket: WebSocket, sessionId: string, browserAudioServer: any): boolean {
    const client = this.clients.get(socket);
    if (!client) {
      return false;
    }

    // Only admins and supervisors can listen to calls
    if (client.role !== 'admin' && client.role !== 'supervisor') {
      wsLogger.warn(`User ${client.username} attempted to subscribe to audio without permission`);
      return false;
    }

    // Create callback to forward audio to this WebSocket
    const callback = (audioData: Buffer) => {
      if (socket.readyState === WebSocket.OPEN) {
        // Send as binary with a type header
        const header = Buffer.alloc(1 + 32); // type byte + session ID
        header[0] = 0x01; // Audio data type
        header.write(sessionId.padEnd(32, '\0'), 1);
        const message = Buffer.concat([header, audioData]);
        socket.send(message);
      }
    };

    // Store callback reference for cleanup
    const callbackKey = `${sessionId}:${client.userId}`;
    this.audioCallbacks.set(callbackKey, callback);

    // Subscribe to the browser audio server
    if (browserAudioServer) {
      browserAudioServer.subscribeToAudio(sessionId, callback);
    }

    client.audioSubscriptions.add(sessionId);
    wsLogger.info(`User ${client.username} subscribed to audio session ${sessionId}`);

    return true;
  }

  /**
   * Unsubscribe from audio for a browser spy session
   */
  unsubscribeFromAudio(socket: WebSocket, sessionId: string, browserAudioServer?: any): void {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }

    const callbackKey = `${sessionId}:${client.userId}`;
    const callback = this.audioCallbacks.get(callbackKey);

    if (callback && browserAudioServer) {
      browserAudioServer.unsubscribeFromAudio(sessionId, callback);
    }

    this.audioCallbacks.delete(callbackKey);
    client.audioSubscriptions.delete(sessionId);
    wsLogger.info(`User ${client.username} unsubscribed from audio session ${sessionId}`);
  }

  /**
   * Send audio notification to subscribed clients
   */
  sendAudioNotification(sessionId: string, type: string, data: unknown): void {
    const message: WsMessage = {
      type: `audio:${type}`,
      data: { sessionId, ...data as object },
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);

    for (const [socket, client] of this.clients) {
      if (client.audioSubscriptions.has(sessionId) && socket.readyState === WebSocket.OPEN) {
        socket.send(json);
      }
    }
  }
}

export function setupWebSocket(server: FastifyInstance, ctx: ApiContext): void {
  server.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    // Defensive check - ensure we received a valid WebSocket
    if (!socket || typeof socket.close !== 'function') {
      wsLogger.error('WebSocket handler received invalid socket object', {
        socketType: typeof socket,
        hasClose: socket ? typeof (socket as any).close : 'no socket',
      });
      return;
    }

    // Verify token from query parameter
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Missing authentication token');
      return;
    }

    const payload = ctx.authService.verifyJwt(token);
    if (!payload) {
      socket.close(4001, 'Invalid or expired token');
      return;
    }

    // Check user exists and is enabled (async operation wrapped)
    ctx.userRepo.findById(payload.userId).then(user => {
      if (!user || !user.enabled) {
        socket.close(4001, 'User account disabled');
        return;
      }

      // User is valid - complete WebSocket setup
      wsLogger.info(`Client connected: ${payload.username}`);

      // Add client
      ctx.wsManager.addClient(socket, payload.userId, payload.username, payload.role);

      // Send welcome message
      socket.send(JSON.stringify({
        type: 'connected',
        data: {
          userId: payload.userId,
          username: payload.username,
          role: payload.role,
        },
        timestamp: Date.now(),
      }));

      // Handle messages
      socket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          switch (message.type) {
            case 'subscribe':
              ctx.wsManager.subscribe(socket, message.channel);
              break;
            case 'unsubscribe':
              ctx.wsManager.unsubscribe(socket, message.channel);
              break;
            case 'audio:subscribe':
              // Subscribe to audio session for browser spy
              if (message.sessionId) {
                const success = ctx.wsManager.subscribeToAudio(
                  socket,
                  message.sessionId,
                  ctx.browserAudioServer
                );
                socket.send(JSON.stringify({
                  type: 'audio:subscribed',
                  data: { sessionId: message.sessionId, success },
                  timestamp: Date.now(),
                }));
              }
              break;
            case 'audio:unsubscribe':
              // Unsubscribe from audio session
              if (message.sessionId) {
                ctx.wsManager.unsubscribeFromAudio(
                  socket,
                  message.sessionId,
                  ctx.browserAudioServer
                );
                socket.send(JSON.stringify({
                  type: 'audio:unsubscribed',
                  data: { sessionId: message.sessionId },
                  timestamp: Date.now(),
                }));
              }
              break;
            case 'ping':
              socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
            default:
              wsLogger.debug(`Unknown message type: ${message.type}`);
          }
        } catch (error) {
          wsLogger.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle close
      socket.on('close', () => {
        ctx.wsManager.removeClient(socket);
      });

      // Handle error
      socket.on('error', (error: Error) => {
        wsLogger.error('WebSocket error:', error);
        ctx.wsManager.removeClient(socket);
      });
    }).catch(error => {
      wsLogger.error('Error checking user:', error);
      socket.close(4001, 'Authentication error');
    });
  });
}
