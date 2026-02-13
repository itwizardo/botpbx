/**
 * OpenAI Realtime API Service
 * Provides real-time bidirectional audio streaming for AI conversations
 *
 * Features:
 * - WebSocket connection to OpenAI Realtime API
 * - Real-time audio streaming (input/output)
 * - Voice activity detection (VAD)
 * - Interruption handling
 * - Function calling support
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Realtime API models
export type RealtimeModel = 'gpt-4o-realtime-preview' | 'gpt-4o-realtime-preview-2024-10-01' | 'gpt-4o-realtime-preview-2024-12-17';

// Audio formats supported by Realtime API
export type AudioFormat = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

// Voice options
export type RealtimeVoice = 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';

// Session configuration
export interface RealtimeSessionConfig {
  model?: RealtimeModel;
  voice?: RealtimeVoice;
  instructions?: string;
  inputAudioFormat?: AudioFormat;
  outputAudioFormat?: AudioFormat;
  inputAudioTranscription?: {
    model: 'whisper-1';
  };
  turnDetection?: {
    type: 'server_vad';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  } | null;
  tools?: RealtimeTool[];
  temperature?: number;
  maxResponseOutputTokens?: number | 'inf';
}

// Tool/function definition
export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Events emitted by RealtimeSession
export interface RealtimeSessionEvents {
  'connected': () => void;
  'disconnected': (reason: string) => void;
  'error': (error: Error) => void;
  'audio': (audioData: Buffer) => void;
  'transcript': (text: string, isFinal: boolean) => void;
  'response_text': (text: string, isFinal: boolean) => void;
  'speech_started': () => void;
  'speech_stopped': () => void;
  'response_started': () => void;
  'response_done': (text: string) => void;
  'function_call': (name: string, args: any, callId: string) => void;
  'input_transcript': (text: string) => void;
  'interruption': () => void;
}

/**
 * Represents a single real-time conversation session
 */
export class RealtimeSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private sessionId: string;
  private config: RealtimeSessionConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private responseText = '';
  private inputTranscript = '';
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private pingTimeoutMs = 30000; // 30 seconds ping interval
  private pongTimeoutMs = 10000; // 10 seconds to receive pong

  constructor(apiKey: string, sessionId: string, config: RealtimeSessionConfig = {}) {
    super();
    this.apiKey = apiKey;
    this.sessionId = sessionId;
    this.config = {
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'alloy',
      // Use native PCM16 at 24kHz for best audio quality from OpenAI
      // Resample locally between Asterisk's 8kHz and OpenAI's 24kHz using FIR filtering
      inputAudioFormat: 'pcm16',
      outputAudioFormat: 'pcm16',
      turnDetection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      temperature: 0.8,
      ...config,
    };
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const model = this.config.model || 'gpt-4o-realtime-preview-2024-12-17';
      const url = `wss://api.openai.com/v1/realtime?model=${model}`;

      logger.info(`[Realtime:${this.sessionId}] Connecting to OpenAI Realtime API...`);

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        logger.info(`[Realtime:${this.sessionId}] Connected to OpenAI Realtime API`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        this.configureSession();
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.ws.on('pong', () => {
        this.lastPongTime = Date.now();
        logger.debug(`[Realtime:${this.sessionId}] Received pong`);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        logger.error(`[Realtime:${this.sessionId}] WebSocket error:`, error);
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || `code: ${code}`;
        logger.info(`[Realtime:${this.sessionId}] WebSocket closed: ${reasonStr}`);
        this.isConnected = false;
        this.emit('disconnected', reasonStr);
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
   * Configure the session after connection
   */
  private configureSession(): void {
    const sessionUpdate: any = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: this.config.voice,
        input_audio_format: this.config.inputAudioFormat,
        output_audio_format: this.config.outputAudioFormat,
        turn_detection: this.config.turnDetection,
        temperature: this.config.temperature,
      },
    };

    if (this.config.instructions) {
      sessionUpdate.session.instructions = this.config.instructions;
    }

    if (this.config.inputAudioTranscription) {
      sessionUpdate.session.input_audio_transcription = this.config.inputAudioTranscription;
    }

    if (this.config.tools && this.config.tools.length > 0) {
      sessionUpdate.session.tools = this.config.tools;
      sessionUpdate.session.tool_choice = 'auto';
    }

    if (this.config.maxResponseOutputTokens) {
      sessionUpdate.session.max_response_output_tokens = this.config.maxResponseOutputTokens;
    }

    this.send(sessionUpdate);
    logger.info(`[Realtime:${this.sessionId}] Session configured`);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'session.created':
          logger.debug(`[Realtime:${this.sessionId}] Session created: ${message.session?.id}`);
          break;

        case 'session.updated':
          logger.debug(`[Realtime:${this.sessionId}] Session updated`);
          break;

        case 'input_audio_buffer.speech_started':
          logger.debug(`[Realtime:${this.sessionId}] Speech started`);
          this.emit('speech_started');
          break;

        case 'input_audio_buffer.speech_stopped':
          logger.debug(`[Realtime:${this.sessionId}] Speech stopped`);
          this.emit('speech_stopped');
          break;

        case 'input_audio_buffer.committed':
          logger.debug(`[Realtime:${this.sessionId}] Audio buffer committed`);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.inputTranscript = message.transcript || '';
          logger.info(`[Realtime:${this.sessionId}] User said: "${this.inputTranscript}"`);
          this.emit('input_transcript', this.inputTranscript);
          break;

        case 'response.created':
          logger.debug(`[Realtime:${this.sessionId}] Response started`);
          this.responseText = '';
          this.emit('response_started');
          break;

        case 'response.output_item.added':
          // New output item (text or audio)
          break;

        case 'response.audio.delta':
          // Receive audio chunk
          if (message.delta) {
            const audioBuffer = Buffer.from(message.delta, 'base64');
            logger.debug(`[Realtime:${this.sessionId}] Audio delta: ${audioBuffer.length} bytes`);
            this.emit('audio', audioBuffer);
          }
          break;

        case 'response.audio_transcript.delta':
          // Real-time transcript of AI's speech
          if (message.delta) {
            this.responseText += message.delta;
            this.emit('response_text', message.delta, false);
          }
          break;

        case 'response.audio_transcript.done':
          // Final transcript
          this.emit('response_text', this.responseText, true);
          break;

        case 'response.text.delta':
          // Text-only response delta
          if (message.delta) {
            this.responseText += message.delta;
            this.emit('response_text', message.delta, false);
          }
          break;

        case 'response.text.done':
          this.emit('response_text', this.responseText, true);
          break;

        case 'response.function_call_arguments.done':
          // Function call completed
          if (message.name && message.call_id) {
            try {
              const args = JSON.parse(message.arguments || '{}');
              logger.info(`[Realtime:${this.sessionId}] Function call: ${message.name}(${JSON.stringify(args)})`);
              this.emit('function_call', message.name, args, message.call_id);
            } catch (e) {
              logger.error(`[Realtime:${this.sessionId}] Failed to parse function args:`, e);
            }
          }
          break;

        case 'response.done':
          logger.info(`[Realtime:${this.sessionId}] Response completed`);
          this.emit('response_done', this.responseText);
          break;

        case 'response.cancelled':
          logger.debug(`[Realtime:${this.sessionId}] Response cancelled (interruption)`);
          this.emit('interruption');
          break;

        case 'error':
          logger.error(`[Realtime:${this.sessionId}] API error:`, message.error);
          this.emit('error', new Error(message.error?.message || 'Unknown error'));
          break;

        default:
          logger.debug(`[Realtime:${this.sessionId}] Unhandled message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`[Realtime:${this.sessionId}] Failed to parse message:`, error);
    }
  }

  /**
   * Send audio data to the API
   * Audio should be PCM 16-bit, 24kHz, mono
   */
  sendAudio(audioData: Buffer): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    this.send({
      type: 'input_audio_buffer.append',
      audio: audioData.toString('base64'),
    });
  }

  /**
   * Commit the audio buffer and trigger response
   * Use this when you want to manually trigger response (with VAD disabled)
   */
  commitAudio(): void {
    this.send({
      type: 'input_audio_buffer.commit',
    });
  }

  /**
   * Clear the audio buffer
   */
  clearAudio(): void {
    this.send({
      type: 'input_audio_buffer.clear',
    });
  }

  /**
   * Cancel current response (interrupt)
   */
  cancelResponse(): void {
    this.send({
      type: 'response.cancel',
    });
  }

  /**
   * Manually trigger a response (useful for text-only or after manual commit)
   */
  createResponse(): void {
    this.send({
      type: 'response.create',
    });
  }

  /**
   * Send a text message to the conversation
   */
  sendText(text: string): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: text,
          },
        ],
      },
    });
  }

  /**
   * Submit function call result
   */
  submitFunctionResult(callId: string, result: any): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    // Trigger response after function result
    this.createResponse();
  }

  /**
   * Update session configuration
   */
  updateSession(config: Partial<RealtimeSessionConfig>): void {
    Object.assign(this.config, config);

    const update: any = {
      type: 'session.update',
      session: {},
    };

    if (config.voice) update.session.voice = config.voice;
    if (config.instructions) update.session.instructions = config.instructions;
    if (config.turnDetection !== undefined) update.session.turn_detection = config.turnDetection;
    if (config.temperature) update.session.temperature = config.temperature;
    if (config.tools) {
      update.session.tools = config.tools;
      update.session.tool_choice = 'auto';
    }

    this.send(update);
  }

  /**
   * Send a message through the WebSocket
   */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    if (this.pingInterval) return;

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopPingInterval();
        return;
      }

      // Check if we received pong recently
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.pingTimeoutMs + this.pongTimeoutMs) {
        logger.warn(`[Realtime:${this.sessionId}] No pong received for ${timeSinceLastPong}ms, disconnecting`);
        this.disconnect();
        return;
      }

      // Send ping
      try {
        this.ws.ping();
        logger.debug(`[Realtime:${this.sessionId}] Sent ping`);
      } catch (error) {
        logger.error(`[Realtime:${this.sessionId}] Failed to send ping:`, error);
        this.disconnect();
      }
    }, this.pingTimeoutMs);

    logger.debug(`[Realtime:${this.sessionId}] Started ping interval`);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      logger.debug(`[Realtime:${this.sessionId}] Stopped ping interval`);
    }
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
    logger.info(`[Realtime:${this.sessionId}] Disconnected`);
  }
}

/**
 * OpenAI Realtime Service
 * Manages multiple real-time sessions
 */
export class OpenAIRealtimeService {
  private apiKey: string;
  private sessions: Map<string, RealtimeSession> = new Map();
  private defaultConfig: RealtimeSessionConfig;

  constructor(apiKey: string, defaultConfig: RealtimeSessionConfig = {}) {
    this.apiKey = apiKey;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Create a new real-time session
   */
  async createSession(sessionId: string, config?: RealtimeSessionConfig): Promise<RealtimeSession> {
    // Clean up existing session if any
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.disconnect();
      this.sessions.delete(sessionId);
    }

    const mergedConfig = { ...this.defaultConfig, ...config };
    const session = new RealtimeSession(this.apiKey, sessionId, mergedConfig);

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
  getSession(sessionId: string): RealtimeSession | undefined {
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

// Pre-computed FIR low-pass filter kernel (48-tap, Blackman window)
// Cutoff at 1/3 normalized frequency (4kHz at 24kHz = Nyquist for 8kHz output)
// Eliminates aliasing artifacts that cause metallic/robotic sound
const FIR_TAPS = 48;
const FIR_CUTOFF = 1.0 / 3.0;
const firKernel: number[] = [];
(function computeFirKernel() {
  const M = FIR_TAPS - 1;
  let sum = 0;
  for (let i = 0; i < FIR_TAPS; i++) {
    const n = i - M / 2;
    const sinc = n === 0 ? 2 * Math.PI * FIR_CUTOFF : Math.sin(2 * Math.PI * FIR_CUTOFF * n) / n;
    const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / M) + 0.08 * Math.cos(4 * Math.PI * i / M);
    firKernel[i] = sinc * window;
    sum += firKernel[i];
  }
  for (let i = 0; i < FIR_TAPS; i++) firKernel[i] /= sum;
})();

/**
 * Audio format conversion utilities
 */
export const AudioUtils = {
  /**
   * Convert 8kHz ulaw (Asterisk native) to 24kHz PCM16 (OpenAI Realtime format)
   */
  ulawTopcm16_24k(ulawData: Buffer): Buffer {
    // First decode ulaw to 8kHz PCM16
    const pcm8k = this.ulawToPcm16(ulawData);
    // Then upsample to 24kHz (3x)
    return this.upsample(pcm8k, 3);
  },

  /**
   * Convert 24kHz PCM16 (OpenAI Realtime) to 8kHz ulaw (Asterisk native)
   */
  pcm16_24kToUlaw(pcmData: Buffer): Buffer {
    // First downsample to 8kHz (1/3)
    const pcm8k = this.downsample(pcmData, 3);
    // Then encode to ulaw
    return this.pcm16ToUlaw(pcm8k);
  },

  /**
   * Decode ulaw to PCM16
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

  /**
   * Encode PCM16 to ulaw
   */
  pcm16ToUlaw(pcmData: Buffer): Buffer {
    const ulawData = Buffer.alloc(pcmData.length / 2);

    for (let i = 0; i < pcmData.length; i += 2) {
      let sample = pcmData.readInt16LE(i);

      // Bias
      const sign = (sample >> 8) & 0x80;
      if (sign) sample = -sample;
      sample = sample + 0x84;
      if (sample > 32767) sample = 32767;

      // Find exponent and mantissa
      let exponent = 7;
      const expMask = 0x4000;
      for (; exponent > 0; exponent--) {
        if (sample & expMask) break;
        sample <<= 1;
      }

      const mantissa = (sample >> 10) & 0x0F;
      const ulawByte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
      ulawData[i / 2] = ulawByte;
    }

    return ulawData;
  },

  /**
   * Upsample by integer factor using zero-insertion + FIR interpolation
   * Produces cleaner output than linear interpolation for speech audio
   */
  upsample(pcmData: Buffer, factor: number): Buffer {
    const inputSamples = pcmData.length / 2;
    const outputSamples = inputSamples * factor;
    const output = Buffer.alloc(outputSamples * 2);

    // Zero-insertion: place input samples at every `factor`-th position
    // Then convolve with FIR kernel scaled by factor to compensate gain
    for (let o = 0; o < outputSamples; o++) {
      let sum = 0;
      for (let k = 0; k < FIR_TAPS; k++) {
        const srcIdx = o - k;
        // Only non-zero at positions that are multiples of factor
        if (srcIdx >= 0 && srcIdx < outputSamples && srcIdx % factor === 0) {
          const inputIdx = srcIdx / factor;
          if (inputIdx < inputSamples) {
            sum += pcmData.readInt16LE(inputIdx * 2) * firKernel[k] * factor;
          }
        }
      }
      const clamped = Math.max(-32768, Math.min(32767, Math.round(sum)));
      output.writeInt16LE(clamped, o * 2);
    }

    return output;
  },

  /**
   * Downsample by integer factor using FIR anti-alias filter + decimation
   * Convolves with low-pass FIR kernel then takes every `factor`-th sample
   */
  downsample(pcmData: Buffer, factor: number): Buffer {
    const inputSamples = pcmData.length / 2;
    const outputSamples = Math.floor(inputSamples / factor);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const center = i * factor;
      let sum = 0;

      // Convolve with FIR kernel centered on the decimation point
      for (let k = 0; k < FIR_TAPS; k++) {
        const srcIdx = center - (FIR_TAPS >> 1) + k;
        if (srcIdx >= 0 && srcIdx < inputSamples) {
          sum += pcmData.readInt16LE(srcIdx * 2) * firKernel[k];
        }
      }

      const clamped = Math.max(-32768, Math.min(32767, Math.round(sum)));
      output.writeInt16LE(clamped, i * 2);
    }

    return output;
  },
};
