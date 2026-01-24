/**
 * ElevenLabs Streaming TTS Service
 *
 * Provides real-time text-to-speech using ElevenLabs WebSocket streaming API.
 * Endpoint: wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input
 *
 * Audio output formats:
 * - mp3_44100_128 (default)
 * - pcm_16000, pcm_22050, pcm_24000, pcm_44100
 *
 * Voice models:
 * - eleven_flash_v2_5: ~75ms latency, good quality
 * - eleven_turbo_v2_5: ~250ms latency, better quality
 * - eleven_multilingual_v2: ~500ms latency, best quality, multilingual
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Voice model options
export type ElevenLabsVoiceModel =
  | 'eleven_flash_v2_5'
  | 'eleven_turbo_v2_5'
  | 'eleven_multilingual_v2'
  | 'eleven_monolingual_v1';

// Output audio format
export type ElevenLabsOutputFormat =
  | 'mp3_44100_128'
  | 'mp3_22050_32'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'ulaw_8000';

// Session configuration
export interface TtsSessionConfig {
  voiceId: string;
  model?: ElevenLabsVoiceModel;
  outputFormat?: ElevenLabsOutputFormat;
  stability?: number; // 0-1, default 0.5
  similarity_boost?: number; // 0-1, default 0.75
  style?: number; // 0-1, default 0
  use_speaker_boost?: boolean;
  optimize_streaming_latency?: number; // 0-4, higher = lower latency but quality tradeoff
}

// Voice settings for the stream
interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

// Events emitted by TtsSession
export interface TtsSessionEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  audio: (audioData: Buffer) => void;
  audio_done: () => void;
  flush_done: () => void;
}

/**
 * Represents a single TTS streaming session
 */
export class TtsSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private sessionId: string;
  private config: TtsSessionConfig;
  private isConnected = false;
  private hasInitialized = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private audioBuffer: Buffer[] = [];

  constructor(apiKey: string, sessionId: string, config: TtsSessionConfig) {
    super();
    this.apiKey = apiKey;
    this.sessionId = sessionId;
    this.config = {
      model: 'eleven_flash_v2_5',
      // Use μ-law 8kHz for native Asterisk support - no downsampling needed!
      outputFormat: 'ulaw_8000',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      optimize_streaming_latency: 3,
      ...config,
    };
  }

  /**
   * Connect to ElevenLabs TTS streaming API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const voiceId = this.config.voiceId;
      const model = this.config.model || 'eleven_flash_v2_5';
      const outputFormat = this.config.outputFormat || 'pcm_24000';
      const latencyOptimization = this.config.optimize_streaming_latency ?? 3;

      // Build query params
      const params = new URLSearchParams({
        model_id: model,
        output_format: outputFormat,
        optimize_streaming_latency: String(latencyOptimization),
      });

      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?${params.toString()}`;

      logger.info(`[TTS:${this.sessionId}] Connecting to ElevenLabs TTS API (voice: ${voiceId}, model: ${model})...`);

      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        logger.info(`[TTS:${this.sessionId}] Connected to ElevenLabs TTS API`);
        this.isConnected = true;
        this.initializeStream();
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        logger.error(`[TTS:${this.sessionId}] WebSocket error:`, error);
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || `code: ${code}`;
        logger.info(`[TTS:${this.sessionId}] WebSocket closed: ${reasonStr}`);
        this.isConnected = false;
        this.hasInitialized = false;
        this.stopPingInterval();
        this.emit('disconnected', reasonStr);
      });

      this.ws.on('pong', () => {
        logger.debug(`[TTS:${this.sessionId}] Received pong`);
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
   * Initialize the stream with voice settings
   */
  private initializeStream(): void {
    if (!this.ws || this.hasInitialized) return;

    const voiceSettings: VoiceSettings = {
      stability: this.config.stability ?? 0.5,
      similarity_boost: this.config.similarity_boost ?? 0.75,
    };

    if (this.config.style !== undefined) {
      voiceSettings.style = this.config.style;
    }

    if (this.config.use_speaker_boost !== undefined) {
      voiceSettings.use_speaker_boost = this.config.use_speaker_boost;
    }

    // Send BOS (Beginning of Stream) message
    const initMessage = {
      text: ' ', // Initial space to start the stream
      voice_settings: voiceSettings,
      xi_api_key: this.apiKey,
    };

    this.ws.send(JSON.stringify(initMessage));
    this.hasInitialized = true;
    logger.debug(`[TTS:${this.sessionId}] Stream initialized`);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      // Check if it's binary audio data
      if (data instanceof Buffer) {
        logger.debug(`[TTS:${this.sessionId}] Received audio chunk: ${data.length} bytes`);
        this.emit('audio', data);
        return;
      }

      // Parse JSON message
      const message = JSON.parse(data.toString());

      if (message.audio) {
        // Audio data as base64
        const audioBuffer = Buffer.from(message.audio, 'base64');
        logger.debug(`[TTS:${this.sessionId}] Received audio chunk: ${audioBuffer.length} bytes`);
        this.emit('audio', audioBuffer);
      }

      if (message.isFinal) {
        logger.debug(`[TTS:${this.sessionId}] Audio stream complete`);
        this.emit('audio_done');
      }

      if (message.normalizedAlignment) {
        // Word-level alignment data (optional)
        logger.debug(`[TTS:${this.sessionId}] Received alignment data`);
      }

      if (message.error) {
        logger.error(`[TTS:${this.sessionId}] API error:`, message.error);
        this.emit('error', new Error(message.error.message || 'TTS error'));
      }
    } catch (error) {
      // If not JSON, might be raw audio
      if (data instanceof Buffer) {
        logger.debug(`[TTS:${this.sessionId}] Received raw audio: ${data.length} bytes`);
        this.emit('audio', data);
      } else {
        logger.error(`[TTS:${this.sessionId}] Failed to parse message:`, error);
      }
    }
  }

  /**
   * Send text to be converted to speech
   */
  sendText(text: string): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`[TTS:${this.sessionId}] Cannot send text - not connected`);
      return;
    }

    if (!this.hasInitialized) {
      this.initializeStream();
    }

    // Send text chunk
    const message = {
      text: text,
      try_trigger_generation: true,
    };

    this.ws.send(JSON.stringify(message));
    logger.debug(`[TTS:${this.sessionId}] Sent text: "${text.substring(0, 50)}..."`);
  }

  /**
   * Flush the stream to generate remaining audio
   */
  flush(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    // Send EOS (End of Stream) message
    const message = {
      text: '',
    };

    this.ws.send(JSON.stringify(message));
    logger.debug(`[TTS:${this.sessionId}] Flushed stream`);
    this.emit('flush_done');
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
          logger.debug(`[TTS:${this.sessionId}] Sent ping`);
        } catch (error) {
          logger.error(`[TTS:${this.sessionId}] Failed to send ping:`, error);
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
   * Disconnect from the API
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      // Send close message before disconnecting
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.flush();
        } catch {
          // Ignore errors during close
        }
      }
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.hasInitialized = false;
    logger.info(`[TTS:${this.sessionId}] Disconnected`);
  }
}

/**
 * ElevenLabs TTS Service
 * Manages multiple TTS sessions
 */
export class ElevenLabsTtsService {
  private apiKey: string;
  private sessions: Map<string, TtsSession> = new Map();
  private defaultConfig: Partial<TtsSessionConfig>;

  constructor(apiKey: string, defaultConfig: Partial<TtsSessionConfig> = {}) {
    this.apiKey = apiKey;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Create a new TTS session
   */
  async createSession(sessionId: string, config: TtsSessionConfig): Promise<TtsSession> {
    // Clean up existing session if any
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.disconnect();
      this.sessions.delete(sessionId);
    }

    const mergedConfig = { ...this.defaultConfig, ...config } as TtsSessionConfig;
    const session = new TtsSession(this.apiKey, sessionId, mergedConfig);

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
  getSession(sessionId: string): TtsSession | undefined {
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

  /**
   * Fetch available voices from ElevenLabs API
   */
  async getVoices(): Promise<ElevenLabsVoice[]> {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = await response.json() as { voices?: ElevenLabsVoice[] };
      return data.voices || [];
    } catch (error) {
      logger.error('[ElevenLabs] Failed to fetch voices:', error);
      throw error;
    }
  }
}

/**
 * ElevenLabs Voice info
 */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  description?: string;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability: number;
    similarity_boost: number;
  };
}

/**
 * Audio utilities for TTS output
 */
export const TtsAudioUtils = {
  /**
   * Downsample audio from 24kHz to 8kHz for Asterisk
   * Uses weighted averaging for smoother output
   */
  downsample24kTo8k(pcmData: Buffer): Buffer {
    const factor = 3; // 24000 / 8000 = 3
    const inputSamples = pcmData.length / 2;
    const outputSamples = Math.floor(inputSamples / factor);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      // Weighted average centered on the output sample position
      let sum = 0;
      let weight = 0;

      for (let j = 0; j < factor; j++) {
        const idx = i * factor + j;
        if (idx < inputSamples) {
          // Triangle window - center samples weighted more
          const dist = Math.abs(j - factor / 2);
          const w = 1 - dist / factor;
          sum += pcmData.readInt16LE(idx * 2) * w;
          weight += w;
        }
      }

      const sample = Math.round(sum / weight);
      output.writeInt16LE(sample, i * 2);
    }

    return output;
  },

  /**
   * Downsample audio from 22050Hz to 8kHz for Asterisk
   */
  downsample22kTo8k(pcmData: Buffer): Buffer {
    // Ratio is 22050/8000 = 2.75625, use fractional resampling
    const inputRate = 22050;
    const outputRate = 8000;
    const inputSamples = pcmData.length / 2;
    const outputSamples = Math.floor((inputSamples * outputRate) / inputRate);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcPos = (i * inputRate) / outputRate;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;

      if (srcIdx + 1 < inputSamples) {
        const s1 = pcmData.readInt16LE(srcIdx * 2);
        const s2 = pcmData.readInt16LE((srcIdx + 1) * 2);
        const sample = Math.round(s1 * (1 - frac) + s2 * frac);
        output.writeInt16LE(sample, i * 2);
      } else if (srcIdx < inputSamples) {
        output.writeInt16LE(pcmData.readInt16LE(srcIdx * 2), i * 2);
      }
    }

    return output;
  },

  /**
   * Downsample audio from 16kHz to 8kHz for Asterisk
   */
  downsample16kTo8k(pcmData: Buffer): Buffer {
    const factor = 2;
    const inputSamples = pcmData.length / 2;
    const outputSamples = Math.floor(inputSamples / factor);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      // Average of two samples
      const idx = i * factor;
      const s1 = pcmData.readInt16LE(idx * 2);
      const s2 = idx + 1 < inputSamples ? pcmData.readInt16LE((idx + 1) * 2) : s1;
      const sample = Math.round((s1 + s2) / 2);
      output.writeInt16LE(sample, i * 2);
    }

    return output;
  },

  /**
   * Decode μ-law to PCM16 (8kHz) for Asterisk
   * No sample rate conversion - μ-law is already 8kHz!
   */
  ulawToPcm16(ulawData: Buffer): Buffer {
    const ULAW_TABLE = [
      -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
      -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
      -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
      -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
      -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
      -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
      -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
      -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
      -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
      -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
      -876, -844, -812, -780, -748, -716, -684, -652,
      -620, -588, -556, -524, -492, -460, -428, -396,
      -372, -356, -340, -324, -308, -292, -276, -260,
      -244, -228, -212, -196, -180, -164, -148, -132,
      -120, -112, -104, -96, -88, -80, -72, -64,
      -56, -48, -40, -32, -24, -16, -8, 0,
      32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
      23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
      15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
      11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
      7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
      5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
      3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
      2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
      1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
      1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
      876, 844, 812, 780, 748, 716, 684, 652,
      620, 588, 556, 524, 492, 460, 428, 396,
      372, 356, 340, 324, 308, 292, 276, 260,
      244, 228, 212, 196, 180, 164, 148, 132,
      120, 112, 104, 96, 88, 80, 72, 64,
      56, 48, 40, 32, 24, 16, 8, 0
    ];

    const pcmData = Buffer.alloc(ulawData.length * 2);
    for (let i = 0; i < ulawData.length; i++) {
      const sample = ULAW_TABLE[ulawData[i]];
      pcmData.writeInt16LE(sample, i * 2);
    }
    return pcmData;
  },
};
