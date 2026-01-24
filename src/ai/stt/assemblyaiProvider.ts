/**
 * AssemblyAI STT Provider
 * Real-time streaming transcription with excellent accuracy
 */

import { AssemblyAI, RealtimeTranscript, RealtimeTranscriber } from 'assemblyai';
import * as fs from 'fs';
import {
  STTProvider,
  STTProviderConfig,
  STTStream,
  STTStreamConfig,
  STTTranscriptResult,
  TranscribeFileOptions,
  TranscribeFileResult,
  BaseSTTStream,
} from '../providers/sttProvider';

// =============================================================================
// ASSEMBLYAI STREAM
// =============================================================================

class AssemblyAISTTStream extends BaseSTTStream implements STTStream {
  private transcriber: RealtimeTranscriber | null = null;
  private startTime: number;

  constructor(
    private client: AssemblyAI,
    private config: STTStreamConfig
  ) {
    super();
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    this.transcriber = this.client.realtime.transcriber({
      sampleRate: this.config.sampleRate || 16000,
      encoding: this.mapEncoding(this.config.encoding),
      endUtteranceSilenceThreshold: this.config.endpointing || 700,
    });

    // Handle session opened
    this.transcriber.on('open', ({ sessionId }) => {
      this._isOpen = true;
      this.emit('ready');
    });

    // Handle transcripts
    this.transcriber.on('transcript', (transcript: RealtimeTranscript) => {
      if (!transcript.text) return;

      const result: STTTranscriptResult = {
        text: transcript.text,
        words: transcript.words?.map((w) => ({
          word: w.text,
          start: w.start / 1000, // Convert ms to seconds
          end: w.end / 1000,
          confidence: w.confidence,
        })),
        confidence: transcript.confidence || 0,
        isFinal: transcript.message_type === 'FinalTranscript',
        latencyMs: Date.now() - this.startTime,
      };

      this.emit('transcript', result);

      // Emit utterance end for final transcripts
      if (transcript.message_type === 'FinalTranscript') {
        this.emit('utterance_end');
      }
    });

    // Handle errors
    this.transcriber.on('error', (error) => {
      this.emit('error', new Error(error.message || 'AssemblyAI error'));
    });

    // Handle close
    this.transcriber.on('close', (code, reason) => {
      this._isOpen = false;
      this.emit('close');
    });

    // Connect to AssemblyAI
    await this.transcriber.connect();
  }

  sendAudio(audio: Buffer): void {
    if (!this._isOpen || !this.transcriber) return;
    // Convert Buffer to ArrayBuffer for SDK compatibility
    const arrayBuffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.length);
    this.transcriber.sendAudio(arrayBuffer);
  }

  finish(): void {
    if (!this._isOpen || !this.transcriber) return;
    // Force end of utterance
    this.transcriber.forceEndUtterance();
  }

  async close(): Promise<void> {
    if (this.transcriber) {
      await this.transcriber.close();
      this.transcriber = null;
    }
    this._isOpen = false;
    this.emit('close');
  }

  private mapEncoding(encoding?: string): 'pcm_s16le' | 'pcm_mulaw' | undefined {
    switch (encoding) {
      case 'linear16':
        return 'pcm_s16le';
      case 'mulaw':
        return 'pcm_mulaw';
      default:
        return 'pcm_s16le';
    }
  }
}

// =============================================================================
// ASSEMBLYAI PROVIDER
// =============================================================================

export class AssemblyAIProvider extends STTProvider {
  private client: AssemblyAI;

  constructor(config: STTProviderConfig) {
    super(config, 'assemblyai');

    this.client = new AssemblyAI({
      apiKey: config.apiKey,
    });
  }

  /**
   * Create a streaming transcription session
   */
  async createStream(config?: STTStreamConfig): Promise<STTStream> {
    const stream = new AssemblyAISTTStream(this.client, {
      language: this.config.defaultLanguage || 'en',
      ...config,
    });

    await stream.initialize();
    return stream;
  }

  /**
   * Transcribe an audio file
   */
  async transcribeFile(
    audioPath: string,
    options?: TranscribeFileOptions
  ): Promise<TranscribeFileResult> {
    const startTime = Date.now();

    const transcript = await this.client.transcripts.transcribe({
      audio: audioPath,
      language_code: options?.language || this.config.defaultLanguage || 'en',
      punctuate: options?.punctuate !== false,
      speaker_labels: options?.diarize || false,
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'AssemblyAI transcription failed');
    }

    return {
      text: transcript.text || '',
      words: transcript.words?.map((w) => ({
        word: w.text,
        start: w.start / 1000,
        end: w.end / 1000,
        confidence: w.confidence,
      })),
      confidence: transcript.confidence || 0,
      language: transcript.language_code,
      duration: (transcript.audio_duration || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Transcribe audio buffer
   */
  async transcribeBuffer(
    audio: Buffer,
    options?: TranscribeFileOptions & { mimeType?: string }
  ): Promise<TranscribeFileResult> {
    const startTime = Date.now();

    // AssemblyAI accepts base64 encoded audio
    const transcript = await this.client.transcripts.transcribe({
      audio: audio,
      language_code: options?.language || this.config.defaultLanguage || 'en',
      punctuate: options?.punctuate !== false,
      speaker_labels: options?.diarize || false,
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'AssemblyAI transcription failed');
    }

    return {
      text: transcript.text || '',
      words: transcript.words?.map((w) => ({
        word: w.text,
        start: w.start / 1000,
        end: w.end / 1000,
        confidence: w.confidence,
      })),
      confidence: transcript.confidence || 0,
      language: transcript.language_code,
      duration: (transcript.audio_duration || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Test connection to AssemblyAI
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Test by checking API status (upload a tiny audio)
      // AssemblyAI doesn't have a simple ping endpoint, so we just verify the client works
      const transcript = await this.client.transcripts.list({ limit: 1 });

      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    // AssemblyAI uses a single best model, optionally with nano for speed
    return ['best', 'nano'];
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<string[]> {
    // AssemblyAI supported languages
    return [
      'en', 'en_au', 'en_uk', 'en_us',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'nl',
      'hi',
      'ja',
      'zh',
      'fi',
      'ko',
      'pl',
      'ru',
      'tr',
      'uk',
      'vi',
    ];
  }
}

/**
 * Create and configure AssemblyAI provider
 */
export function createAssemblyAIProvider(apiKey: string, options?: Partial<STTProviderConfig>): AssemblyAIProvider {
  return new AssemblyAIProvider({
    apiKey,
    ...options,
  });
}
