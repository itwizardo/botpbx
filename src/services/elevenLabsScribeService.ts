/**
 * ElevenLabs Scribe v2 Realtime STT Service
 *
 * Provides real-time speech-to-text using ElevenLabs Scribe v2 WebSocket API.
 * Endpoint: wss://api.elevenlabs.io/v1/speech-to-text/realtime
 *
 * Audio format:
 * - Input: 16kHz, 16-bit PCM, mono
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Scribe model options
export type ScribeModel = 'scribe_v1' | 'scribe_v2';

// Session configuration
export interface ScribeSessionConfig {
  model?: ScribeModel;
  language_code?: string; // e.g., 'en', 'es', 'fr'
  sample_rate?: number; // Default 16000
  encoding?: 'pcm_s16le' | 'pcm_mulaw';
  enable_extra_session_information?: boolean;
}

// Events emitted by ScribeSession
export interface ScribeSessionEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  transcript: (text: string, isFinal: boolean) => void;
  final_transcript: (text: string) => void;
  speech_started: () => void;
  speech_ended: () => void;
}

/**
 * Represents a single Scribe STT session
 */
export class ScribeSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private sessionId: string;
  private config: ScribeSessionConfig;
  private isConnected = false;
  private currentTranscript = '';
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(apiKey: string, sessionId: string, config: ScribeSessionConfig = {}) {
    super();
    this.apiKey = apiKey;
    this.sessionId = sessionId;
    this.config = {
      model: 'scribe_v2',
      sample_rate: 16000,
      encoding: 'pcm_s16le',
      language_code: 'en',
      ...config,
    };
  }

  /**
   * Connect to ElevenLabs Scribe API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build query params
      const params = new URLSearchParams({
        model_id: this.config.model || 'scribe_v2',
        sample_rate: String(this.config.sample_rate || 16000),
        language_code: this.config.language_code || 'en',
      });

      if (this.config.encoding) {
        params.append('encoding', this.config.encoding);
      }

      const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;

      logger.info(`[Scribe:${this.sessionId}] Connecting to ElevenLabs Scribe API...`);

      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        logger.info(`[Scribe:${this.sessionId}] Connected to ElevenLabs Scribe API`);
        this.isConnected = true;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        logger.error(`[Scribe:${this.sessionId}] WebSocket error:`, error);
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || `code: ${code}`;
        logger.info(`[Scribe:${this.sessionId}] WebSocket closed: ${reasonStr}`);
        this.isConnected = false;
        this.stopPingInterval();
        this.emit('disconnected', reasonStr);
      });

      this.ws.on('pong', () => {
        logger.debug(`[Scribe:${this.sessionId}] Received pong`);
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'transcript':
          // Partial or final transcript
          const text = message.text || message.transcript || '';
          const isFinal = message.is_final === true || message.type === 'final_transcript';

          if (isFinal) {
            this.currentTranscript = text;
            logger.info(`[Scribe:${this.sessionId}] Final transcript: "${text}"`);
            this.emit('final_transcript', text);
            this.emit('transcript', text, true);
          } else {
            logger.debug(`[Scribe:${this.sessionId}] Partial transcript: "${text}"`);
            this.emit('transcript', text, false);
          }
          break;

        case 'speech_started':
          logger.debug(`[Scribe:${this.sessionId}] Speech started`);
          this.emit('speech_started');
          break;

        case 'speech_ended':
          logger.debug(`[Scribe:${this.sessionId}] Speech ended`);
          this.emit('speech_ended');
          break;

        case 'session_started':
          logger.debug(`[Scribe:${this.sessionId}] Session started`);
          break;

        case 'session_ended':
          logger.debug(`[Scribe:${this.sessionId}] Session ended`);
          break;

        case 'error':
          logger.error(`[Scribe:${this.sessionId}] API error:`, message.error || message.message);
          this.emit('error', new Error(message.error?.message || message.message || 'Unknown error'));
          break;

        default:
          logger.debug(`[Scribe:${this.sessionId}] Unhandled message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`[Scribe:${this.sessionId}] Failed to parse message:`, error);
    }
  }

  /**
   * Send audio data to the API
   * Audio should be 16-bit PCM, 16kHz, mono
   */
  sendAudio(audioData: Buffer): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send raw audio bytes
    this.ws.send(audioData);
  }

  /**
   * Signal end of audio stream
   */
  endStream(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    this.ws.send(JSON.stringify({ type: 'end_of_stream' }));
    logger.debug(`[Scribe:${this.sessionId}] Sent end of stream signal`);
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    if (this.pingInterval) return;

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
          logger.debug(`[Scribe:${this.sessionId}] Sent ping`);
        } catch (error) {
          logger.error(`[Scribe:${this.sessionId}] Failed to send ping:`, error);
        }
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get last transcript
   */
  getLastTranscript(): string {
    return this.currentTranscript;
  }

  /**
   * Disconnect from the API
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    logger.info(`[Scribe:${this.sessionId}] Disconnected`);
  }
}

/**
 * ElevenLabs Scribe Service
 * Manages multiple STT sessions
 */
export class ElevenLabsScribeService {
  private apiKey: string;
  private sessions: Map<string, ScribeSession> = new Map();
  private defaultConfig: ScribeSessionConfig;

  constructor(apiKey: string, defaultConfig: ScribeSessionConfig = {}) {
    this.apiKey = apiKey;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Create a new STT session
   */
  async createSession(sessionId: string, config?: ScribeSessionConfig): Promise<ScribeSession> {
    // Clean up existing session if any
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.disconnect();
      this.sessions.delete(sessionId);
    }

    const mergedConfig = { ...this.defaultConfig, ...config };
    const session = new ScribeSession(this.apiKey, sessionId, mergedConfig);

    await session.connect();
    this.sessions.set(sessionId, session);

    // Auto-cleanup on disconnect
    session.on('disconnected', () => {
      this.sessions.delete(sessionId);
    });

    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): ScribeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.disconnect();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * End all sessions
   */
  endAllSessions(): void {
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.sessions.clear();
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Audio utilities for Scribe
 */
export const ScribeAudioUtils = {
  /**
   * Upsample audio from 8kHz to 16kHz (Scribe requires 16kHz)
   */
  upsample8kTo16k(pcmData: Buffer): Buffer {
    const inputSamples = pcmData.length / 2;
    const outputSamples = inputSamples * 2;
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < inputSamples - 1; i++) {
      const s1 = pcmData.readInt16LE(i * 2);
      const s2 = pcmData.readInt16LE((i + 1) * 2);

      // Write original sample
      output.writeInt16LE(s1, i * 4);
      // Write interpolated sample
      const interpolated = Math.round((s1 + s2) / 2);
      output.writeInt16LE(interpolated, i * 4 + 2);
    }

    // Last sample
    if (inputSamples > 0) {
      const lastSample = pcmData.readInt16LE((inputSamples - 1) * 2);
      output.writeInt16LE(lastSample, (inputSamples - 1) * 4);
      output.writeInt16LE(lastSample, (inputSamples - 1) * 4 + 2);
    }

    return output;
  },
};
