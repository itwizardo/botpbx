/**
 * STT (Speech-to-Text) Provider Abstraction Layer
 * Unified interface for multiple STT providers with streaming support
 */

import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export type STTProviderType = 'deepgram' | 'whisper' | 'assemblyai' | 'local_whisper';

export interface STTTranscriptWord {
  word: string;
  start: number;  // seconds
  end: number;    // seconds
  confidence: number;
}

export interface STTTranscriptResult {
  text: string;
  words?: STTTranscriptWord[];
  confidence: number;
  language?: string;
  isFinal: boolean;
  latencyMs: number;
}

export interface STTStreamConfig {
  language?: string;
  model?: string;
  punctuate?: boolean;
  profanityFilter?: boolean;
  diarize?: boolean;
  interimResults?: boolean;
  endpointing?: number;  // silence duration to end utterance (ms)
  sampleRate?: number;   // audio sample rate
  encoding?: 'linear16' | 'mulaw' | 'alaw' | 'opus' | 'flac';
  channels?: number;
}

export interface STTStreamEvents extends EventEmitter {
  on(event: 'transcript', listener: (result: STTTranscriptResult) => void): this;
  on(event: 'utterance_end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'ready', listener: () => void): this;
}

export interface STTStream extends STTStreamEvents {
  /**
   * Send audio data to the stream
   */
  sendAudio(audio: Buffer): void;

  /**
   * Signal end of audio stream
   */
  finish(): void;

  /**
   * Close the stream
   */
  close(): void;

  /**
   * Check if stream is open
   */
  isOpen(): boolean;
}

export interface STTProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultLanguage?: string;
  timeout?: number;
}

export interface TranscribeFileOptions {
  language?: string;
  model?: string;
  punctuate?: boolean;
  diarize?: boolean;
}

export interface TranscribeFileResult {
  text: string;
  words?: STTTranscriptWord[];
  confidence: number;
  language?: string;
  duration: number;  // seconds
  latencyMs: number;
}

// =============================================================================
// ABSTRACT PROVIDER
// =============================================================================

export abstract class STTProvider {
  protected config: STTProviderConfig;
  protected providerName: STTProviderType;

  constructor(config: STTProviderConfig, providerName: STTProviderType) {
    this.config = config;
    this.providerName = providerName;
  }

  /**
   * Get provider name
   */
  getName(): STTProviderType {
    return this.providerName;
  }

  /**
   * Create a streaming transcription session
   */
  abstract createStream(config?: STTStreamConfig): Promise<STTStream>;

  /**
   * Transcribe an audio file (non-streaming)
   */
  abstract transcribeFile(
    audioPath: string,
    options?: TranscribeFileOptions
  ): Promise<TranscribeFileResult>;

  /**
   * Transcribe audio buffer (non-streaming)
   */
  abstract transcribeBuffer(
    audio: Buffer,
    options?: TranscribeFileOptions & { mimeType?: string }
  ): Promise<TranscribeFileResult>;

  /**
   * Test the provider connection
   */
  abstract testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }>;

  /**
   * Get available models
   */
  abstract getModels(): Promise<string[]>;

  /**
   * Get supported languages
   */
  abstract getLanguages(): Promise<string[]>;
}

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

const providers = new Map<STTProviderType, STTProvider>();

/**
 * Register an STT provider
 */
export function registerSTTProvider(provider: STTProvider): void {
  providers.set(provider.getName(), provider);
}

/**
 * Get an STT provider by name
 */
export function getSTTProvider(name: STTProviderType): STTProvider | undefined {
  return providers.get(name);
}

/**
 * Get all registered providers
 */
export function getAllSTTProviders(): STTProvider[] {
  return Array.from(providers.values());
}

/**
 * Check if a provider is registered
 */
export function hasSTTProvider(name: STTProviderType): boolean {
  return providers.has(name);
}

// =============================================================================
// BASE STREAM IMPLEMENTATION
// =============================================================================

export class BaseSTTStream extends EventEmitter implements STTStream {
  protected _isOpen = true;

  sendAudio(_audio: Buffer): void {
    throw new Error('Not implemented');
  }

  finish(): void {
    throw new Error('Not implemented');
  }

  close(): void {
    this._isOpen = false;
    this.emit('close');
  }

  isOpen(): boolean {
    return this._isOpen;
  }
}
