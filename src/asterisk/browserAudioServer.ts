/**
 * Browser Audio Server for Asterisk ChanSpy
 *
 * Implements AudioSocket protocol to receive audio from Asterisk's ChanSpy
 * and forward it to browser clients via WebSocket.
 *
 * This allows supervisors to listen to calls directly from the web admin
 * without needing a phone extension.
 *
 * AudioSocket Protocol:
 * - Each frame has a 3-byte header: type (1 byte) + length (2 bytes big-endian)
 * - Types:
 *   - 0x00: UUID (16-byte session ID)
 *   - 0x01: Silence/comfort noise
 *   - 0x10: Audio data (slin16, 16-bit signed linear, 8kHz mono)
 *   - 0x11: Error/hangup
 *
 * Audio flow:
 * - Asterisk ChanSpy -> AudioSocket (port 9093) -> WebSocket -> Browser
 * - Audio format: 8kHz, 16-bit signed linear, mono (converted to suitable format for browser)
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// AudioSocket message types
const MSG_TYPE_UUID = 0x00;
const MSG_TYPE_SILENCE = 0x01;
const MSG_TYPE_AUDIO = 0x10;
const MSG_TYPE_ERROR = 0x11;

// Audio configuration
const SAMPLE_RATE = 8000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

/**
 * Represents a single browser spy audio session
 */
export class BrowserSpySession extends EventEmitter {
  private socket: net.Socket;
  private uuid: string = '';
  private buffer: Buffer = Buffer.alloc(0);
  private isClosed = false;
  private targetChannel: string = '';
  private startTime: Date;

  constructor(socket: net.Socket) {
    super();
    this.startTime = new Date();
    this.socket = socket;

    socket.on('data', (data) => this.handleData(data as Buffer));
    socket.on('error', (err) => {
      logger.error(`[BrowserSpy] Socket error:`, err);
      this.close();
    });
    socket.on('close', () => {
      logger.info(`[BrowserSpy:${this.uuid}] Connection closed`);
      this.close();
    });
  }

  /**
   * Set the target channel being spied on
   */
  setTargetChannel(channel: string): void {
    this.targetChannel = channel;
  }

  /**
   * Get the target channel
   */
  getTargetChannel(): string {
    return this.targetChannel;
  }

  /**
   * Handle incoming data from Asterisk
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 3) {
      const type = this.buffer[0];
      const length = this.buffer.readUInt16BE(1);

      // Wait for complete message
      if (this.buffer.length < 3 + length) {
        break;
      }

      const payload = this.buffer.slice(3, 3 + length);
      this.buffer = this.buffer.slice(3 + length);

      this.handleMessage(type, payload);
    }
  }

  /**
   * Handle a complete AudioSocket message
   */
  private handleMessage(type: number, payload: Buffer): void {
    switch (type) {
      case MSG_TYPE_UUID:
        this.uuid = this.parseUUID(payload);
        logger.info(`[BrowserSpy] New spy session: ${this.uuid}`);
        this.emit('uuid', this.uuid);
        break;

      case MSG_TYPE_SILENCE:
        // Could emit silence events for UI feedback
        break;

      case MSG_TYPE_AUDIO:
        // Emit audio for WebSocket forwarding
        this.emit('audio', payload);
        break;

      case MSG_TYPE_ERROR:
        logger.warn(`[BrowserSpy:${this.uuid}] Received error/hangup`);
        this.close();
        break;

      default:
        logger.debug(`[BrowserSpy:${this.uuid}] Unknown message type: ${type}`);
    }
  }

  /**
   * Parse UUID from binary format
   */
  private parseUUID(data: Buffer): string {
    if (data.length !== 16) {
      return data.toString('hex');
    }

    // Format as UUID string
    const hex = data.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * Get the session UUID
   */
  getUUID(): string {
    return this.uuid;
  }

  /**
   * Get session start time
   */
  getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return !this.isClosed && !this.socket.destroyed;
  }

  /**
   * Close the session
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (!this.socket.destroyed) {
      this.socket.end();
    }

    this.emit('close');
  }
}

/**
 * Browser Audio Server
 * Listens for AudioSocket connections from Asterisk ChanSpy
 * and forwards audio to WebSocket clients
 */
export class BrowserAudioServer extends EventEmitter {
  private server: net.Server | null = null;
  private port: number;
  private sessions: Map<string, BrowserSpySession> = new Map();
  private pendingSessions: Map<string, BrowserSpySession> = new Map();
  private audioSubscribers: Map<string, Set<(audio: Buffer) => void>> = new Map();

  constructor(port: number = 9093) {
    super();
    this.port = port;
  }

  /**
   * Start the server
   */
  start(): void {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (err) => {
      logger.error('[BrowserSpy] Server error:', err);
      this.emit('error', err);
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      logger.info(`[BrowserSpy] Server listening on port ${this.port}`);
      this.emit('listening');
    });
  }

  /**
   * Handle new connection from Asterisk ChanSpy
   */
  private handleConnection(socket: net.Socket): void {
    const session = new BrowserSpySession(socket);

    session.on('uuid', (uuid: string) => {
      logger.info(`[BrowserSpy] Session registered: ${uuid}`);
      this.sessions.set(uuid, session);
      this.emit('session-started', uuid, session);
    });

    session.on('audio', (audioData: Buffer) => {
      const uuid = session.getUUID();
      if (uuid) {
        this.forwardAudio(uuid, audioData);
      }
    });

    session.on('close', () => {
      const uuid = session.getUUID();
      if (uuid) {
        this.sessions.delete(uuid);
        this.audioSubscribers.delete(uuid);
        this.emit('session-ended', uuid);
      }
    });
  }

  /**
   * Subscribe to audio for a session
   */
  subscribeToAudio(sessionId: string, callback: (audio: Buffer) => void): void {
    if (!this.audioSubscribers.has(sessionId)) {
      this.audioSubscribers.set(sessionId, new Set());
    }
    this.audioSubscribers.get(sessionId)!.add(callback);
    logger.debug(`[BrowserSpy] Audio subscriber added for session ${sessionId}`);
  }

  /**
   * Unsubscribe from audio for a session
   */
  unsubscribeFromAudio(sessionId: string, callback: (audio: Buffer) => void): void {
    const subscribers = this.audioSubscribers.get(sessionId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.audioSubscribers.delete(sessionId);
      }
    }
    logger.debug(`[BrowserSpy] Audio subscriber removed for session ${sessionId}`);
  }

  /**
   * Forward audio to all subscribers
   */
  private forwardAudio(sessionId: string, audioData: Buffer): void {
    const subscribers = this.audioSubscribers.get(sessionId);
    if (subscribers && subscribers.size > 0) {
      for (const callback of subscribers) {
        try {
          callback(audioData);
        } catch (error) {
          logger.error(`[BrowserSpy] Error in audio callback:`, error);
        }
      }
    }
  }

  /**
   * Get a session by UUID
   */
  getSession(uuid: string): BrowserSpySession | undefined {
    return this.sessions.get(uuid);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{
    uuid: string;
    targetChannel: string;
    startTime: Date;
    subscriberCount: number;
  }> {
    const result: Array<{
      uuid: string;
      targetChannel: string;
      startTime: Date;
      subscriberCount: number;
    }> = [];

    for (const [uuid, session] of this.sessions) {
      result.push({
        uuid,
        targetChannel: session.getTargetChannel(),
        startTime: session.getStartTime(),
        subscriberCount: this.audioSubscribers.get(uuid)?.size || 0,
      });
    }

    return result;
  }

  /**
   * Stop a specific spy session
   */
  stopSession(uuid: string): boolean {
    const session = this.sessions.get(uuid);
    if (session) {
      session.close();
      return true;
    }
    return false;
  }

  /**
   * Stop the server
   */
  stop(): void {
    // Close all active sessions
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
    this.audioSubscribers.clear();

    if (this.server) {
      this.server.close(() => {
        logger.info('[BrowserSpy] Server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get the port number
   */
  getPort(): number {
    return this.port;
  }
}

/**
 * Audio format utilities for browser playback
 */
export class BrowserAudioUtils {
  /**
   * Convert raw PCM (slin16, 8kHz) to WAV format for browser playback
   * This adds the WAV header to raw PCM data
   */
  static pcmToWav(pcmData: Buffer): Buffer {
    const numChannels = CHANNELS;
    const sampleRate = SAMPLE_RATE;
    const bitsPerSample = BITS_PER_SAMPLE;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;

    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }

  /**
   * Convert PCM buffer to base64 for JSON transmission
   */
  static pcmToBase64(pcmData: Buffer): string {
    return pcmData.toString('base64');
  }

  /**
   * Get audio format info for browser
   */
  static getAudioFormat(): {
    sampleRate: number;
    bitsPerSample: number;
    channels: number;
    encoding: string;
  } {
    return {
      sampleRate: SAMPLE_RATE,
      bitsPerSample: BITS_PER_SAMPLE,
      channels: CHANNELS,
      encoding: 'pcm-s16le',
    };
  }
}
