/**
 * AudioSocket Server
 * Real-time bidirectional audio streaming between Asterisk and AI
 *
 * Asterisk AudioSocket Protocol:
 * - TCP connection on port 9092
 * - First message: UUID of the call (36 bytes)
 * - Audio: 16kHz, 16-bit signed linear PCM, mono
 * - Packet format: [type: 1 byte][length: 2 bytes big-endian][payload]
 *
 * Message types:
 * - 0x00: UUID (call identifier)
 * - 0x01: Audio from Asterisk (caller's voice)
 * - 0x02: Audio to Asterisk (AI's voice)
 * - 0x10: Hangup notification
 * - 0x11: Error
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// =============================================================================
// CONSTANTS
// =============================================================================

export const AUDIO_SOCKET_PORT = parseInt(process.env.AUDIO_SOCKET_PORT || '9092');

// AudioSocket message types
export const MSG_TYPE_UUID = 0x00;
export const MSG_TYPE_AUDIO_IN = 0x01;
export const MSG_TYPE_AUDIO_OUT = 0x02;
export const MSG_TYPE_HANGUP = 0x10;
export const MSG_TYPE_ERROR = 0x11;

// Audio parameters
export const SAMPLE_RATE = 16000;
export const BITS_PER_SAMPLE = 16;
export const CHANNELS = 1;
export const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
export const FRAME_MS = 20; // 20ms frames
export const FRAME_SIZE = (SAMPLE_RATE * FRAME_MS / 1000) * BYTES_PER_SAMPLE; // 640 bytes

// =============================================================================
// TYPES
// =============================================================================

export interface AudioSocketSession extends EventEmitter {
  uuid: string;
  socket: net.Socket;
  startTime: number;
  audioReceived: number;
  audioSent: number;

  // Methods
  sendAudio(audio: Buffer): void;
  hangup(): void;
  close(): void;
}

export interface AudioSocketServerOptions {
  port?: number;
  host?: string;
}

export interface AudioSocketEvents {
  session: (session: AudioSocketSession) => void;
  error: (error: Error) => void;
}

// =============================================================================
// AUDIO SOCKET SESSION
// =============================================================================

class AudioSocketSessionImpl extends EventEmitter implements AudioSocketSession {
  public uuid: string = '';
  public startTime: number;
  public audioReceived: number = 0;
  public audioSent: number = 0;

  private buffer: Buffer = Buffer.alloc(0);
  private isConnected: boolean = true;

  constructor(public socket: net.Socket) {
    super();
    this.startTime = Date.now();
    this.setupSocket();
  }

  private setupSocket(): void {
    this.socket.on('data', (data) => this.handleData(data as Buffer));
    this.socket.on('close', () => this.handleClose());
    this.socket.on('error', (error) => this.handleError(error));
  }

  private handleData(data: Buffer): void {
    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, data]);

    // Process complete packets
    while (this.buffer.length >= 3) {
      const type = this.buffer[0];
      const length = this.buffer.readUInt16BE(1);

      // Check if we have complete packet
      if (this.buffer.length < 3 + length) {
        break;
      }

      // Extract payload
      const payload = this.buffer.slice(3, 3 + length);
      this.buffer = this.buffer.slice(3 + length);

      // Handle packet
      this.handlePacket(type, payload);
    }
  }

  private handlePacket(type: number, payload: Buffer): void {
    switch (type) {
      case MSG_TYPE_UUID:
        this.uuid = payload.toString('utf8').trim();
        logger.info(`AudioSocket session started: ${this.uuid}`);
        this.emit('ready');
        break;

      case MSG_TYPE_AUDIO_IN:
        this.audioReceived += payload.length;
        this.emit('audio', payload);
        break;

      case MSG_TYPE_HANGUP:
        logger.info(`AudioSocket hangup received: ${this.uuid}`);
        this.emit('hangup');
        this.close();
        break;

      case MSG_TYPE_ERROR:
        const errorMsg = payload.toString('utf8');
        logger.error(`AudioSocket error from Asterisk: ${errorMsg}`);
        this.emit('error', new Error(errorMsg));
        break;

      default:
        logger.warn(`Unknown AudioSocket message type: 0x${type.toString(16)}`);
    }
  }

  private handleClose(): void {
    if (this.isConnected) {
      this.isConnected = false;
      logger.info(`AudioSocket session closed: ${this.uuid}, received: ${this.audioReceived} bytes, sent: ${this.audioSent} bytes`);
      this.emit('close');
    }
  }

  private handleError(error: Error): void {
    logger.error(`AudioSocket socket error: ${error.message}`);
    this.emit('error', error);
  }

  /**
   * Send audio to Asterisk (AI's voice)
   */
  sendAudio(audio: Buffer): void {
    if (!this.isConnected) return;

    // Split into frame-sized chunks for smoother playback
    let offset = 0;
    while (offset < audio.length) {
      const chunkSize = Math.min(FRAME_SIZE, audio.length - offset);
      const chunk = audio.slice(offset, offset + chunkSize);

      // Create packet: type(1) + length(2) + payload
      const packet = Buffer.alloc(3 + chunk.length);
      packet[0] = MSG_TYPE_AUDIO_OUT;
      packet.writeUInt16BE(chunk.length, 1);
      chunk.copy(packet, 3);

      try {
        this.socket.write(packet);
        this.audioSent += chunk.length;
      } catch (error) {
        logger.error(`Failed to send audio: ${error}`);
      }

      offset += chunkSize;
    }
  }

  /**
   * Send hangup to Asterisk
   */
  hangup(): void {
    if (!this.isConnected) return;

    const packet = Buffer.alloc(3);
    packet[0] = MSG_TYPE_HANGUP;
    packet.writeUInt16BE(0, 1);

    try {
      this.socket.write(packet);
    } catch (error) {
      logger.error(`Failed to send hangup: ${error}`);
    }
  }

  /**
   * Close the session
   */
  close(): void {
    if (!this.isConnected) return;
    this.isConnected = false;

    try {
      this.socket.end();
    } catch (error) {
      // Ignore close errors
    }

    this.emit('close');
  }
}

// =============================================================================
// AUDIO SOCKET SERVER
// =============================================================================

export class AudioSocketServer extends EventEmitter {
  private server: net.Server | null = null;
  private sessions: Map<string, AudioSocketSession> = new Map();
  private port: number;
  private host: string;

  constructor(options: AudioSocketServerOptions = {}) {
    super();
    this.port = options.port || AUDIO_SOCKET_PORT;
    this.host = options.host || '0.0.0.0';
  }

  /**
   * Start the AudioSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (error) => {
        logger.error(`AudioSocket server error: ${error.message}`);
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`AudioSocket server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the AudioSocket server
   */
  async stop(): Promise<void> {
    // Close all active sessions
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();

    // Close the server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('AudioSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(socket: net.Socket): void {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.debug(`AudioSocket connection from ${remoteAddr}`);

    const session = new AudioSocketSessionImpl(socket);

    // Wait for UUID before registering session
    session.once('ready', () => {
      this.sessions.set(session.uuid, session);
      this.emit('session', session);
    });

    // Clean up on close
    session.on('close', () => {
      this.sessions.delete(session.uuid);
    });
  }

  /**
   * Get active session by UUID
   */
  getSession(uuid: string): AudioSocketSession | undefined {
    return this.sessions.get(uuid);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): AudioSocketSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

// =============================================================================
// VAD (Voice Activity Detection) Processor
// =============================================================================

export interface VADConfig {
  threshold?: number;        // Energy threshold (0-1)
  speechPadMs?: number;      // Padding before/after speech (ms)
  minSpeechMs?: number;      // Minimum speech duration (ms)
  maxSilenceMs?: number;     // Max silence before end of speech (ms)
}

export interface VADResult {
  isSpeech: boolean;
  energy: number;
  speechStart?: number;      // timestamp
  speechEnd?: number;        // timestamp
}

export class VADProcessor extends EventEmitter {
  private config: Required<VADConfig>;
  private isSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private lastSpeechTime: number = 0;
  private silenceStartTime: number = 0;

  constructor(config: VADConfig = {}) {
    super();
    this.config = {
      threshold: config.threshold ?? 0.01,
      speechPadMs: config.speechPadMs ?? 100,
      minSpeechMs: config.minSpeechMs ?? 200,
      maxSilenceMs: config.maxSilenceMs ?? 700,
    };
  }

  /**
   * Process audio chunk and detect speech
   */
  process(audio: Buffer): VADResult {
    const energy = this.calculateEnergy(audio);
    const now = Date.now();
    const isSpeech = energy > this.config.threshold;

    const result: VADResult = {
      isSpeech,
      energy,
    };

    if (isSpeech) {
      this.lastSpeechTime = now;

      if (!this.isSpeaking) {
        // Speech started
        this.isSpeaking = true;
        this.speechStartTime = now;
        this.silenceStartTime = 0;
        result.speechStart = now;
        this.emit('speechStart', now);
      }
    } else if (this.isSpeaking) {
      // Currently speaking but no speech detected
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = now;
      }

      const silenceDuration = now - this.silenceStartTime;
      const speechDuration = this.lastSpeechTime - this.speechStartTime;

      if (silenceDuration >= this.config.maxSilenceMs && speechDuration >= this.config.minSpeechMs) {
        // Speech ended
        this.isSpeaking = false;
        result.speechEnd = now;
        this.emit('speechEnd', {
          start: this.speechStartTime,
          end: this.lastSpeechTime,
          duration: speechDuration,
        });
      }
    }

    return result;
  }

  /**
   * Calculate RMS energy of audio chunk
   */
  private calculateEnergy(audio: Buffer): number {
    let sum = 0;
    const samples = audio.length / 2; // 16-bit samples

    for (let i = 0; i < audio.length; i += 2) {
      const sample = audio.readInt16LE(i);
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / samples);
    // Normalize to 0-1 range (max 16-bit value is 32768)
    return rms / 32768;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    this.silenceStartTime = 0;
  }
}

// =============================================================================
// BARGE-IN DETECTOR
// =============================================================================

export interface BargeInConfig {
  energyThreshold?: number;    // Energy threshold to detect barge-in
  minDurationMs?: number;      // Minimum duration to confirm barge-in
  cooldownMs?: number;         // Cooldown after barge-in
}

export class BargeInDetector extends EventEmitter {
  private config: Required<BargeInConfig>;
  private isAISpeaking: boolean = false;
  private bargeInStartTime: number = 0;
  private lastBargeInTime: number = 0;

  constructor(config: BargeInConfig = {}) {
    super();
    this.config = {
      energyThreshold: config.energyThreshold ?? 0.02,
      minDurationMs: config.minDurationMs ?? 100,
      cooldownMs: config.cooldownMs ?? 1000,
    };
  }

  /**
   * Set whether AI is currently speaking
   */
  setAISpeaking(speaking: boolean): void {
    this.isAISpeaking = speaking;
    if (!speaking) {
      this.bargeInStartTime = 0;
    }
  }

  /**
   * Check for barge-in
   */
  checkBargeIn(audio: Buffer): boolean {
    if (!this.isAISpeaking) return false;

    const now = Date.now();

    // Check cooldown
    if (now - this.lastBargeInTime < this.config.cooldownMs) {
      return false;
    }

    const energy = this.calculateEnergy(audio);

    if (energy > this.config.energyThreshold) {
      if (this.bargeInStartTime === 0) {
        this.bargeInStartTime = now;
      }

      const duration = now - this.bargeInStartTime;
      if (duration >= this.config.minDurationMs) {
        this.lastBargeInTime = now;
        this.bargeInStartTime = 0;
        this.emit('bargeIn');
        return true;
      }
    } else {
      this.bargeInStartTime = 0;
    }

    return false;
  }

  private calculateEnergy(audio: Buffer): number {
    let sum = 0;
    const samples = audio.length / 2;

    for (let i = 0; i < audio.length; i += 2) {
      const sample = audio.readInt16LE(i);
      sum += sample * sample;
    }

    return Math.sqrt(sum / samples) / 32768;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.isAISpeaking = false;
    this.bargeInStartTime = 0;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let audioSocketServerInstance: AudioSocketServer | null = null;

export function getAudioSocketServer(): AudioSocketServer {
  if (!audioSocketServerInstance) {
    audioSocketServerInstance = new AudioSocketServer();
  }
  return audioSocketServerInstance;
}

export async function startAudioSocketServer(): Promise<AudioSocketServer> {
  const server = getAudioSocketServer();
  await server.start();
  return server;
}

export async function stopAudioSocketServer(): Promise<void> {
  if (audioSocketServerInstance) {
    await audioSocketServerInstance.stop();
  }
}
