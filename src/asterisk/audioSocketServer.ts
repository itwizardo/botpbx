/**
 * AudioSocket Server for Asterisk
 *
 * Implements Asterisk's AudioSocket protocol to stream audio bidirectionally.
 * This bridges Asterisk audio to OpenAI Realtime API for real-time AI conversations.
 *
 * AudioSocket Protocol:
 * - Each frame has a 3-byte header: type (1 byte) + length (2 bytes big-endian)
 * - Types:
 *   - 0x00: UUID (16-byte session ID)
 *   - 0x01: Silence/comfort noise
 *   - 0x10: Audio data (slin, 16-bit signed linear, 8kHz mono)
 *   - 0x11: Error/hangup
 *
 * Audio format:
 * - Asterisk: 8kHz, 16-bit signed linear, mono (slin)
 * - OpenAI Realtime: 24kHz, 16-bit PCM, mono
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  RealtimeSession,
  OpenAIRealtimeService,
  RealtimeSessionConfig,
  AudioUtils,
} from '../services/openaiRealtimeService';
import { FlowExecutionService, FlowExecutionContext } from '../services/flowExecutionService';
import type { FlowData } from '../types/flow';
import { ElevenLabsAudioHandler, ElevenLabsHandlerConfig, createElevenLabsHandler } from './elevenLabsAudioHandler';

// AudioSocket message types (per Asterisk documentation)
// https://docs.asterisk.org/Configuration/Channel-Drivers/AudioSocket/
const MSG_TYPE_HANGUP = 0x00;  // Terminate connection
const MSG_TYPE_UUID = 0x01;    // UUID identifier (16 bytes)
const MSG_TYPE_DTMF = 0x03;    // DTMF digit (1 ASCII byte)
const MSG_TYPE_AUDIO = 0x10;   // Audio data (8kHz PCM)
const MSG_TYPE_ERROR = 0xff;   // Error

// Audio configuration
const ASTERISK_SAMPLE_RATE = 8000;
const OPENAI_SAMPLE_RATE = 24000;
const SAMPLE_RATE_RATIO = OPENAI_SAMPLE_RATE / ASTERISK_SAMPLE_RATE; // 3

// Buffer for smooth playback (accumulate before sending to reduce jitter)
const MIN_PLAYBACK_BUFFER_MS = 60;
const MIN_PLAYBACK_SAMPLES = (ASTERISK_SAMPLE_RATE * MIN_PLAYBACK_BUFFER_MS) / 1000;

/**
 * Represents a single AudioSocket connection/call
 */
export class AudioSocketCall extends EventEmitter {
  private socket: net.Socket;
  private uuid: string = '';
  private buffer: Buffer = Buffer.alloc(0);
  private realtimeSession: RealtimeSession | null = null;
  private playbackBuffer: Buffer = Buffer.alloc(0);
  private isPlaying = false;
  private isClosed = false;
  private agentConfig: any = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private silenceFrame: Buffer;

  // Flow mode properties
  private flowMode = false;
  private flowContext: FlowExecutionContext | null = null;
  private flowService: FlowExecutionService | null = null;

  // ElevenLabs mode properties
  private elevenLabsMode = false;
  private elevenLabsHandler: ElevenLabsAudioHandler | null = null;
  private elevenLabsPlaybackInterval: NodeJS.Timeout | null = null;

  constructor(socket: net.Socket) {
    super();
    this.socket = socket;

    // Create a silence frame (320 bytes = 20ms at 8kHz, 16-bit)
    this.silenceFrame = Buffer.alloc(320, 0);

    socket.on('data', (data) => this.handleData(data as Buffer));
    socket.on('error', (err) => {
      logger.error(`[AudioSocket] Socket error:`, err);
      this.close();
    });
    socket.on('close', () => {
      logger.info(`[AudioSocket:${this.uuid}] Connection closed`);
      this.close();
    });
  }

  /**
   * Start sending keep-alive silence frames to prevent Asterisk timeout
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) return;

    // Send silence every 100ms when not playing audio (well under the 2000ms timeout)
    this.keepAliveInterval = setInterval(() => {
      if (!this.isPlaying && !this.isClosed && !this.socket.destroyed) {
        this.sendAudioToAsterisk(this.silenceFrame);
      }
    }, 100);
  }

  /**
   * Stop the keep-alive interval
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Set the agent configuration
   */
  setAgentConfig(config: any): void {
    this.agentConfig = config;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connectRealtime(realtimeService: OpenAIRealtimeService, config: RealtimeSessionConfig): Promise<void> {
    if (!this.uuid) {
      throw new Error('Cannot connect to Realtime API before receiving UUID');
    }

    this.realtimeSession = await realtimeService.createSession(this.uuid, config);

    // Handle audio output from OpenAI
    this.realtimeSession.on('audio', (audioData: Buffer) => {
      this.handleRealtimeAudio(audioData);
    });

    // Handle transcriptions
    this.realtimeSession.on('input_transcript', (text: string) => {
      logger.info(`[AudioSocket:${this.uuid}] User said: "${text}"`);
      this.emit('transcript', text);
    });

    // Handle AI responses
    this.realtimeSession.on('response_done', (text: string) => {
      logger.info(`[AudioSocket:${this.uuid}] AI response: "${text.substring(0, 100)}..."`);
      this.emit('response', text);
    });

    // Handle speech detection
    this.realtimeSession.on('speech_started', () => {
      this.emit('speech_started');
    });

    this.realtimeSession.on('speech_stopped', () => {
      this.emit('speech_stopped');
    });

    // Handle interruptions
    this.realtimeSession.on('interruption', () => {
      logger.debug(`[AudioSocket:${this.uuid}] Interruption - clearing playback buffer`);
      this.playbackBuffer = Buffer.alloc(0);
      this.emit('interruption');
    });

    // Handle errors
    this.realtimeSession.on('error', (error: Error) => {
      logger.error(`[AudioSocket:${this.uuid}] Realtime error:`, error);
      this.emit('error', error);
    });

    // Handle disconnect - CRITICAL: close the AudioSocket call when OpenAI disconnects
    this.realtimeSession.on('disconnected', (reason: string) => {
      logger.info(`[AudioSocket:${this.uuid}] Realtime disconnected: ${reason}`);
      this.realtimeSession = null;
      // Close the Asterisk AudioSocket to prevent hanging calls
      logger.info(`[AudioSocket:${this.uuid}] Closing AudioSocket due to Realtime disconnect`);
      this.close();
    });

    logger.info(`[AudioSocket:${this.uuid}] Connected to OpenAI Realtime API`);

    // Start keep-alive to prevent Asterisk timeout during silence
    this.startKeepAlive();
  }

  /**
   * Connect in Flow Mode - uses FlowExecutionService to control conversation
   */
  async connectFlowMode(
    flowService: FlowExecutionService,
    realtimeService: OpenAIRealtimeService,
    flowData: FlowData,
    agentConfig: any
  ): Promise<void> {
    if (!this.uuid) {
      throw new Error('Cannot connect flow mode before receiving UUID');
    }

    this.flowMode = true;
    this.flowService = flowService;

    // Initialize flow execution
    this.flowContext = await flowService.initializeFlow(
      this.uuid,
      agentConfig.agentId,
      flowData,
      {
        _caller_id: agentConfig.callerId || 'unknown',
        _agent_name: agentConfig.agentName || 'AI Agent',
      }
    );

    // Connect to OpenAI Realtime for TTS/STT (still needed for audio)
    const realtimeConfig: RealtimeSessionConfig = {
      voice: agentConfig.voice || 'alloy',
      instructions: 'You are processing a structured conversation flow. Respond naturally to user input.',
      inputAudioTranscription: { model: 'whisper-1' },
      turnDetection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
      },
    };

    this.realtimeSession = await realtimeService.createSession(this.uuid, realtimeConfig);

    // Handle audio output from OpenAI
    this.realtimeSession.on('audio', (audioData: Buffer) => {
      this.handleRealtimeAudio(audioData);
    });

    // Handle user transcriptions - feed to flow engine
    this.realtimeSession.on('input_transcript', async (text: string) => {
      logger.info(`[AudioSocket:${this.uuid}] Flow mode - User said: "${text}"`);
      this.emit('transcript', text);

      // Process through flow engine
      if (this.flowContext && this.flowService) {
        try {
          const result = await this.flowService.handleUserInput(this.uuid, text);
          logger.info(`[AudioSocket:${this.uuid}] Flow result: ${JSON.stringify(result)}`);
        } catch (error) {
          logger.error(`[AudioSocket:${this.uuid}] Flow execution error:`, error);
        }
      }
    });

    // Handle interruptions
    this.realtimeSession.on('interruption', () => {
      logger.debug(`[AudioSocket:${this.uuid}] Interruption - clearing playback buffer`);
      this.playbackBuffer = Buffer.alloc(0);
      this.emit('interruption');
    });

    // Handle errors
    this.realtimeSession.on('error', (error: Error) => {
      logger.error(`[AudioSocket:${this.uuid}] Realtime error:`, error);
      this.emit('error', error);
    });

    // Handle disconnect - CRITICAL: close the AudioSocket call when OpenAI disconnects
    this.realtimeSession.on('disconnected', (reason: string) => {
      logger.info(`[AudioSocket:${this.uuid}] Realtime disconnected in flow mode: ${reason}`);
      this.realtimeSession = null;
      // Close the Asterisk AudioSocket to prevent hanging calls
      logger.info(`[AudioSocket:${this.uuid}] Closing AudioSocket due to Realtime disconnect`);
      this.close();
    });

    // Wire up flow events - filter by conversationId to handle only this call's events
    const callUuid = this.uuid;

    const speakHandler = (convId: string, text: string, nodeId: string) => {
      if (convId !== callUuid) return; // Ignore events from other calls
      logger.info(`[AudioSocket:${callUuid}] Flow speak (${nodeId}): "${text.substring(0, 50)}..."`);
      if (this.realtimeSession) {
        this.realtimeSession.sendText(text);
        this.realtimeSession.createResponse();
      }
    };

    const endHandler = async (convId: string, outcome: string, message?: string) => {
      if (convId !== callUuid) return; // Ignore events from other calls
      logger.info(`[AudioSocket:${callUuid}] Flow ended: ${outcome}`);
      if (message && this.realtimeSession) {
        this.realtimeSession.sendText(message);
        this.realtimeSession.createResponse();
        // Wait for audio to play before closing
        setTimeout(() => this.close(), 5000);
      } else {
        this.close();
      }
    };

    const transferHandler = (convId: string, destination: string, type: string) => {
      if (convId !== callUuid) return; // Ignore events from other calls
      logger.info(`[AudioSocket:${callUuid}] Flow transfer: ${type} -> ${destination}`);
      this.emit('transfer_request', { destination, type });
    };

    flowService.on('speak', speakHandler);
    flowService.on('end', endHandler);
    flowService.on('transfer', transferHandler);

    // Clean up listeners when call closes
    this.once('close', () => {
      flowService.off('speak', speakHandler);
      flowService.off('end', endHandler);
      flowService.off('transfer', transferHandler);
    });

    logger.info(`[AudioSocket:${this.uuid}] Connected in Flow Mode`);

    // Start keep-alive
    this.startKeepAlive();

    // Execute the start node
    const result = await flowService.executeCurrentNode(this.uuid);
    logger.info(`[AudioSocket:${this.uuid}] Start node executed: ${JSON.stringify(result)}`);

    // After the start node (greeting), transition to the next node in the flow
    // This typically moves to a Listen node that waits for user input
    try {
      const nextResult = await flowService.transitionToNext(this.uuid);
      logger.info(`[AudioSocket:${this.uuid}] Transitioned after start node: ${JSON.stringify(nextResult)}`);
    } catch (err) {
      logger.error(`[AudioSocket:${this.uuid}] Failed to transition after start:`, err);
    }
  }

  /**
   * Check if call is in flow mode
   */
  isFlowMode(): boolean {
    return this.flowMode;
  }

  /**
   * Check if call is in ElevenLabs mode
   */
  isElevenLabsMode(): boolean {
    return this.elevenLabsMode;
  }

  /**
   * Connect in ElevenLabs Mode - uses ElevenLabs Scribe STT + LLM + ElevenLabs TTS
   */
  async connectElevenLabs(config: ElevenLabsHandlerConfig): Promise<void> {
    if (!this.uuid) {
      throw new Error('Cannot connect ElevenLabs before receiving UUID');
    }

    this.elevenLabsMode = true;
    config.sessionId = this.uuid;

    try {
      this.elevenLabsHandler = await createElevenLabsHandler(config);

      // Handle audio output from ElevenLabs
      this.elevenLabsHandler.on('audio', (audioData: Buffer) => {
        // Audio is already 8kHz from the handler
        this.playbackBuffer = Buffer.concat([this.playbackBuffer, audioData]);
        if (!this.isPlaying && this.playbackBuffer.length >= MIN_PLAYBACK_SAMPLES * 2) {
          this.startPlayback();
        }
      });

      // Handle transcriptions
      this.elevenLabsHandler.on('transcript', (text: string) => {
        logger.info(`[AudioSocket:${this.uuid}] ElevenLabs transcript: "${text}"`);
        this.emit('transcript', text);
      });

      // Handle AI responses
      this.elevenLabsHandler.on('speaking', (text: string) => {
        logger.info(`[AudioSocket:${this.uuid}] ElevenLabs speaking: "${text.substring(0, 50)}..."`);
        this.emit('response', text);
      });

      // Handle errors
      this.elevenLabsHandler.on('error', (error: Error) => {
        logger.error(`[AudioSocket:${this.uuid}] ElevenLabs error:`, error);
        this.emit('error', error);
      });

      // Handle disconnect
      this.elevenLabsHandler.on('disconnected', (reason: string) => {
        logger.info(`[AudioSocket:${this.uuid}] ElevenLabs disconnected: ${reason}`);
        this.elevenLabsHandler = null;
        this.close();
      });

      // Handle interruptions
      this.elevenLabsHandler.on('interruption', () => {
        logger.debug(`[AudioSocket:${this.uuid}] ElevenLabs interruption - clearing playback buffer`);
        this.playbackBuffer = Buffer.alloc(0);
        this.isPlaying = false;
        this.emit('interruption');
      });

      logger.info(`[AudioSocket:${this.uuid}] Connected to ElevenLabs`);

      // Start keep-alive
      this.startKeepAlive();

      // Start polling for audio output from ElevenLabs handler
      this.elevenLabsPlaybackInterval = setInterval(() => {
        if (this.elevenLabsHandler && !this.isClosed) {
          while (this.elevenLabsHandler.hasAudioOutput()) {
            const audio = this.elevenLabsHandler.getAudioOutput(320);
            if (audio) {
              this.playbackBuffer = Buffer.concat([this.playbackBuffer, audio]);
              if (!this.isPlaying && this.playbackBuffer.length >= MIN_PLAYBACK_SAMPLES * 2) {
                this.startPlayback();
              }
            }
          }
        }
      }, 20);
    } catch (error) {
      logger.error(`[AudioSocket:${this.uuid}] Failed to initialize ElevenLabs:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming data from Asterisk
   */
  private handleData(data: Buffer): void {
    // Use debug level for audio data to avoid log spam
    const type = data.length > 0 ? data[0] : -1;
    if (type !== MSG_TYPE_AUDIO) {
      logger.info(`[AudioSocket:${this.uuid || 'unknown'}] Received ${data.length} bytes: ${data.slice(0, 20).toString('hex')}`);
    }
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 3) {
      const msgType = this.buffer[0];
      const length = this.buffer.readUInt16BE(1);
      if (msgType !== MSG_TYPE_AUDIO) {
        logger.info(`[AudioSocket:${this.uuid || 'unknown'}] Message type=${msgType.toString(16)}, length=${length}, buffer=${this.buffer.length}`);
      }

      // Wait for complete message
      if (this.buffer.length < 3 + length) {
        break;
      }

      const payload = this.buffer.slice(3, 3 + length);
      this.buffer = this.buffer.slice(3 + length);

      this.handleMessage(msgType, payload);
    }
  }

  /**
   * Handle a complete AudioSocket message
   */
  private handleMessage(type: number, payload: Buffer): void {
    switch (type) {
      case MSG_TYPE_HANGUP:
        logger.info(`[AudioSocket:${this.uuid}] Received hangup signal`);
        this.close();
        break;

      case MSG_TYPE_UUID:
        this.uuid = this.parseUUID(payload);
        logger.info(`[AudioSocket] New call with UUID: ${this.uuid}`);
        this.emit('uuid', this.uuid);
        break;

      case MSG_TYPE_DTMF:
        const digit = payload.toString('ascii');
        logger.info(`[AudioSocket:${this.uuid}] DTMF: ${digit}`);
        this.emit('dtmf', digit);
        break;

      case MSG_TYPE_AUDIO:
        this.handleAudioInput(payload);
        break;

      case MSG_TYPE_ERROR:
        logger.warn(`[AudioSocket:${this.uuid}] Received error`);
        this.close();
        break;

      default:
        logger.info(`[AudioSocket:${this.uuid}] Unknown message type: 0x${type.toString(16)}`);
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
   * Handle audio input from Asterisk
   * Convert 8kHz slin to G.711 μ-law and send to OpenAI Realtime
   * (No sample rate conversion needed - both use 8kHz!)
   */
  private handleAudioInput(audioData: Buffer): void {
    // Handle ElevenLabs mode
    if (this.elevenLabsMode && this.elevenLabsHandler) {
      // ElevenLabs handler expects 8kHz audio, it will upsample internally
      this.elevenLabsHandler.handleAudioInput(audioData);
      return;
    }

    // Handle OpenAI Realtime mode
    if (!this.realtimeSession || !this.realtimeSession.isActive()) {
      return;
    }

    // Convert slin (8kHz PCM16) to G.711 μ-law (8kHz)
    // This is a simple encoding - no sample rate change, no quality loss!
    const ulawData = AudioUtils.pcm16ToUlaw(audioData);

    // Send to OpenAI Realtime
    this.realtimeSession.sendAudio(ulawData);
  }

  /**
   * Handle audio output from OpenAI Realtime
   * Convert G.711 μ-law to 8kHz slin and send to Asterisk
   * (No sample rate conversion needed - both use 8kHz!)
   */
  private handleRealtimeAudio(audioData: Buffer): void {
    if (this.isClosed || this.socket.destroyed) {
      logger.debug(`[AudioSocket:${this.uuid}] Audio from OpenAI ignored - connection closed`);
      return;
    }

    logger.debug(`[AudioSocket:${this.uuid}] Received ${audioData.length} bytes from OpenAI`);

    // Convert G.711 μ-law (8kHz) to slin (8kHz PCM16)
    // This is a simple decoding - no sample rate change, no quality loss!
    const slin8k = AudioUtils.ulawToPcm16(audioData);

    // Add to playback buffer
    this.playbackBuffer = Buffer.concat([this.playbackBuffer, slin8k]);

    // Start playback if not already playing and buffer is sufficient
    if (!this.isPlaying && this.playbackBuffer.length >= MIN_PLAYBACK_SAMPLES * 2) {
      logger.info(`[AudioSocket:${this.uuid}] Starting audio playback to Asterisk (buffer: ${this.playbackBuffer.length} bytes)`);
      this.startPlayback();
    }
  }

  /**
   * Start continuous playback to Asterisk
   */
  private startPlayback(): void {
    if (this.isPlaying || this.isClosed) return;
    this.isPlaying = true;

    const playChunk = () => {
      if (this.isClosed || this.socket.destroyed) {
        this.isPlaying = false;
        return;
      }

      // Send a 20ms chunk (160 samples at 8kHz = 320 bytes)
      const chunkSize = 320;

      if (this.playbackBuffer.length >= chunkSize) {
        const chunk = this.playbackBuffer.slice(0, chunkSize);
        this.playbackBuffer = this.playbackBuffer.slice(chunkSize);
        this.sendAudioToAsterisk(chunk);

        // Schedule next chunk in ~20ms
        setTimeout(playChunk, 20);
      } else if (this.playbackBuffer.length > 0) {
        // Send remaining audio
        this.sendAudioToAsterisk(this.playbackBuffer);
        this.playbackBuffer = Buffer.alloc(0);
        this.isPlaying = false;
      } else {
        this.isPlaying = false;
      }
    };

    playChunk();
  }

  /**
   * Send audio frame to Asterisk
   */
  private sendAudioToAsterisk(audioData: Buffer): void {
    if (this.socket.destroyed) return;

    // Create AudioSocket frame: type (1) + length (2) + payload
    const frame = Buffer.alloc(3 + audioData.length);
    frame[0] = MSG_TYPE_AUDIO;
    frame.writeUInt16BE(audioData.length, 1);
    audioData.copy(frame, 3);

    this.socket.write(frame);
  }

  /**
   * Send text message to the AI
   */
  sendText(text: string): void {
    if (this.realtimeSession) {
      this.realtimeSession.sendText(text);
      this.realtimeSession.createResponse();
    }
  }

  /**
   * Get the call UUID
   */
  getUUID(): string {
    return this.uuid;
  }

  /**
   * Check if call is active
   */
  isActive(): boolean {
    return !this.isClosed && !this.socket.destroyed;
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    // Stop keep-alive timer
    this.stopKeepAlive();

    // Clean up OpenAI Realtime session
    if (this.realtimeSession) {
      this.realtimeSession.disconnect();
      this.realtimeSession = null;
    }

    // Clean up ElevenLabs handler
    if (this.elevenLabsHandler) {
      this.elevenLabsHandler.disconnect();
      this.elevenLabsHandler = null;
    }

    // Stop ElevenLabs playback interval
    if (this.elevenLabsPlaybackInterval) {
      clearInterval(this.elevenLabsPlaybackInterval);
      this.elevenLabsPlaybackInterval = null;
    }

    if (!this.socket.destroyed) {
      this.socket.end();
    }

    this.emit('close');
  }
}

/**
 * AudioSocket Server
 * Listens for incoming AudioSocket connections from Asterisk
 */
export class AudioSocketServer extends EventEmitter {
  private server: net.Server | null = null;
  private port: number;
  private realtimeService: OpenAIRealtimeService | null = null;
  private flowService: FlowExecutionService | null = null;
  private calls: Map<string, AudioSocketCall> = new Map();
  private pendingCalls: Map<string, AudioSocketCall> = new Map();
  private agentConfigs: Map<string, any> = new Map();
  // ElevenLabs settings
  private elevenLabsApiKey: string | null = null;
  private openAiApiKey: string | null = null;
  private anthropicApiKey: string | null = null;

  constructor(port: number = 9092) {
    super();
    this.port = port;
  }

  /**
   * Set the OpenAI Realtime service
   */
  setRealtimeService(service: OpenAIRealtimeService): void {
    this.realtimeService = service;
  }

  /**
   * Set the Flow Execution service
   */
  setFlowService(service: FlowExecutionService): void {
    this.flowService = service;
  }

  /**
   * Set ElevenLabs API key
   */
  setElevenLabsApiKey(apiKey: string): void {
    this.elevenLabsApiKey = apiKey;
  }

  /**
   * Set OpenAI API key (for ElevenLabs mode LLM)
   */
  setOpenAiApiKey(apiKey: string): void {
    this.openAiApiKey = apiKey;
  }

  /**
   * Set Anthropic API key (for ElevenLabs mode LLM)
   */
  setAnthropicApiKey(apiKey: string): void {
    this.anthropicApiKey = apiKey;
  }

  /**
   * Pre-register an agent config for a call UUID
   */
  registerCallConfig(uuid: string, config: any): void {
    this.agentConfigs.set(uuid, config);
    logger.debug(`[AudioSocket] Registered config for UUID: ${uuid}`);
  }

  /**
   * Start the server
   */
  start(): void {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (err) => {
      logger.error('[AudioSocket] Server error:', err);
      this.emit('error', err);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`[AudioSocket] Server listening on port ${this.port}`);
      this.emit('listening');
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(socket: net.Socket): void {
    logger.info(`[AudioSocket] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
    logger.info(`[AudioSocket] Pre-registered configs: ${Array.from(this.agentConfigs.keys()).join(', ') || '(none)'}`);
    const call = new AudioSocketCall(socket);

    call.on('uuid', async (uuid: string) => {
      logger.info(`[AudioSocket] Call registered: ${uuid}`);
      this.calls.set(uuid, call);

      // Get agent config if pre-registered
      const agentConfig = this.agentConfigs.get(uuid);
      if (agentConfig) {
        call.setAgentConfig(agentConfig);
        this.agentConfigs.delete(uuid);
      }

      // Check if flow mode should be used
      const useFlowMode = agentConfig?.flowEnabled && agentConfig?.flowData;

      // Check if ElevenLabs mode should be used
      const useElevenLabs = agentConfig?.voiceProvider === 'elevenlabs_full';

      if (agentConfig) {
        try {
          if (useElevenLabs && this.elevenLabsApiKey) {
            // ElevenLabs Mode - use ElevenLabs Scribe STT + LLM + ElevenLabs TTS
            logger.info(`[AudioSocket] Starting ElevenLabs Mode for ${uuid}`);

            // Determine which LLM to use
            const llmProvider = agentConfig.llmProvider || 'openai';
            const llmApiKey = llmProvider === 'anthropic' ? this.anthropicApiKey : this.openAiApiKey;

            if (!llmApiKey) {
              logger.error(`[AudioSocket] No ${llmProvider} API key for ElevenLabs mode`);
              call.close();
              return;
            }

            const elevenLabsConfig: ElevenLabsHandlerConfig = {
              elevenLabsApiKey: this.elevenLabsApiKey,
              voiceId: agentConfig.elevenLabsVoiceId || agentConfig.voice || '21m00Tcm4TlvDq8ikWAM',
              ttsModel: agentConfig.elevenLabsModel || 'eleven_flash_v2_5',
              llmProvider: llmProvider as 'openai' | 'anthropic',
              llmApiKey: llmApiKey,
              llmModel: agentConfig.llmModel || (llmProvider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o'),
              systemPrompt: agentConfig.systemPrompt || 'You are a helpful AI assistant.',
              sessionId: uuid,
              agentName: agentConfig.agentName,
              greetingText: agentConfig.greetingText,
            };

            await call.connectElevenLabs(elevenLabsConfig);
            this.emit('call-connected-elevenlabs', uuid, call);
          } else if (useFlowMode && this.flowService && this.realtimeService) {
            // Flow Mode - use FlowExecutionService to control conversation
            logger.info(`[AudioSocket] Starting Flow Mode for ${uuid}`);
            const flowData = typeof agentConfig.flowData === 'string'
              ? JSON.parse(agentConfig.flowData)
              : agentConfig.flowData;

            await call.connectFlowMode(
              this.flowService,
              this.realtimeService,
              flowData,
              agentConfig
            );

            this.emit('call-connected-flow', uuid, call);
          } else if (this.realtimeService) {
            // Legacy Mode - direct OpenAI Realtime conversation
            logger.info(`[AudioSocket] Starting Legacy Mode for ${uuid}`);
            const realtimeConfig: RealtimeSessionConfig = {
              voice: agentConfig.voice || 'alloy',
              instructions: agentConfig.systemPrompt || 'You are a helpful AI assistant.',
              inputAudioTranscription: { model: 'whisper-1' },
              turnDetection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            };

            await call.connectRealtime(this.realtimeService, realtimeConfig);

            // Send greeting if configured
            if (agentConfig.greetingText) {
              call.sendText(agentConfig.greetingText);
            }

            this.emit('call-connected', uuid, call);
          } else {
            logger.warn(`[AudioSocket] No suitable service for ${uuid}`);
            this.emit('call-pending', uuid, call);
          }
        } catch (error) {
          logger.error(`[AudioSocket] Failed to connect for ${uuid}:`, error);
          call.close();
        }
      } else {
        logger.warn(`[AudioSocket] No agent config for ${uuid}`);
        this.emit('call-pending', uuid, call);
      }
    });

    call.on('close', () => {
      const uuid = call.getUUID();
      if (uuid) {
        this.calls.delete(uuid);
        this.emit('call-ended', uuid);
      }
    });

    call.on('error', (error: Error) => {
      logger.error(`[AudioSocket] Call error:`, error);
    });
  }

  /**
   * Get a call by UUID
   */
  getCall(uuid: string): AudioSocketCall | undefined {
    return this.calls.get(uuid);
  }

  /**
   * Get active call count
   */
  getActiveCallCount(): number {
    return this.calls.size;
  }

  /**
   * Stop the server
   */
  stop(): void {
    // Close all active calls
    for (const call of this.calls.values()) {
      call.close();
    }
    this.calls.clear();

    if (this.server) {
      this.server.close(() => {
        logger.info('[AudioSocket] Server stopped');
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
}
