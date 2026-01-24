/**
 * Deepgram STT Provider
 * Ultra-low latency real-time speech-to-text with streaming support
 */

import { createClient, DeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
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
// DEEPGRAM STREAM
// =============================================================================

class DeepgramSTTStream extends BaseSTTStream implements STTStream {
  private connection: ReturnType<DeepgramClient['listen']['live']> | null = null;
  private startTime: number;

  constructor(
    private client: DeepgramClient,
    private config: STTStreamConfig
  ) {
    super();
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    const options: Record<string, unknown> = {
      model: this.config.model || 'nova-2',
      language: this.config.language || 'en-US',
      punctuate: this.config.punctuate !== false,
      profanity_filter: this.config.profanityFilter || false,
      diarize: this.config.diarize || false,
      interim_results: this.config.interimResults !== false,
      endpointing: this.config.endpointing || 300, // 300ms silence
      encoding: this.config.encoding || 'linear16',
      sample_rate: this.config.sampleRate || 16000,
      channels: this.config.channels || 1,
      smart_format: true,
    };

    this.connection = this.client.listen.live(options);

    // Handle transcription events
    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0];
      if (!transcript) return;

      const result: STTTranscriptResult = {
        text: transcript.transcript || '',
        words: transcript.words?.map((w: { word: string; start: number; end: number; confidence: number }) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        })),
        confidence: transcript.confidence || 0,
        language: data.channel?.detected_language,
        isFinal: data.is_final || false,
        latencyMs: Date.now() - this.startTime,
      };

      this.emit('transcript', result);
    });

    // Handle utterance end (speaker stopped talking)
    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit('utterance_end');
    });

    // Handle errors
    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      this.emit('error', new Error(error.message || 'Deepgram error'));
    });

    // Handle close
    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this._isOpen = false;
      this.emit('close');
    });

    // Handle open/ready
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      this.emit('ready');
    });
  }

  sendAudio(audio: Buffer): void {
    if (!this._isOpen || !this.connection) return;
    // Convert Buffer to ArrayBuffer for SDK compatibility
    const arrayBuffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.length);
    this.connection.send(arrayBuffer);
  }

  finish(): void {
    if (!this._isOpen || !this.connection) return;
    // Send empty ArrayBuffer to signal end
    this.connection.send(new ArrayBuffer(0));
  }

  close(): void {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
    this._isOpen = false;
    this.emit('close');
  }
}

// =============================================================================
// DEEPGRAM PROVIDER
// =============================================================================

export class DeepgramProvider extends STTProvider {
  private client: DeepgramClient;
  private defaultModel: string;

  constructor(config: STTProviderConfig) {
    super(config, 'deepgram');

    this.client = createClient(config.apiKey);
    this.defaultModel = config.defaultModel || 'nova-2';
  }

  /**
   * Create a streaming transcription session
   */
  async createStream(config?: STTStreamConfig): Promise<STTStream> {
    const stream = new DeepgramSTTStream(this.client, {
      model: this.defaultModel,
      language: this.config.defaultLanguage || 'en-US',
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

    const audioBuffer = fs.readFileSync(audioPath);
    const mimeType = this.getMimeType(audioPath);

    const { result, error } = await this.client.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: options?.model || this.defaultModel,
        language: options?.language || this.config.defaultLanguage || 'en-US',
        punctuate: options?.punctuate !== false,
        diarize: options?.diarize || false,
        smart_format: true,
        mimetype: mimeType,
      }
    );

    if (error) {
      throw new Error(error.message || 'Deepgram transcription failed');
    }

    const channel = result?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    return {
      text: alternative?.transcript || '',
      words: alternative?.words?.map((w) => ({
        word: w.word || '',
        start: w.start || 0,
        end: w.end || 0,
        confidence: w.confidence || 0,
      })),
      confidence: alternative?.confidence || 0,
      language: channel?.detected_language,
      duration: result?.metadata?.duration || 0,
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

    const { result, error } = await this.client.listen.prerecorded.transcribeFile(
      audio,
      {
        model: options?.model || this.defaultModel,
        language: options?.language || this.config.defaultLanguage || 'en-US',
        punctuate: options?.punctuate !== false,
        diarize: options?.diarize || false,
        smart_format: true,
        mimetype: options?.mimeType || 'audio/wav',
      }
    );

    if (error) {
      throw new Error(error.message || 'Deepgram transcription failed');
    }

    const channel = result?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    return {
      text: alternative?.transcript || '',
      words: alternative?.words?.map((w) => ({
        word: w.word || '',
        start: w.start || 0,
        end: w.end || 0,
        confidence: w.confidence || 0,
      })),
      confidence: alternative?.confidence || 0,
      language: channel?.detected_language,
      duration: result?.metadata?.duration || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Test connection to Deepgram
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Test with a simple API call
      const { result, error } = await this.client.manage.getProjects();

      if (error) {
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          error: error.message,
        };
      }

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
    // Deepgram models - no API to list them
    return [
      'nova-2',           // Latest, best accuracy
      'nova-2-general',
      'nova-2-meeting',
      'nova-2-phonecall',
      'nova-2-voicemail',
      'nova-2-finance',
      'nova-2-conversationalai',
      'nova-2-video',
      'nova-2-medical',
      'nova-2-drivethru',
      'nova',
      'enhanced',
      'base',
      'whisper-tiny',
      'whisper-base',
      'whisper-small',
      'whisper-medium',
      'whisper-large',
    ];
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<string[]> {
    // Deepgram supported languages
    return [
      'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ',
      'es', 'es-419',
      'fr', 'fr-CA',
      'de',
      'it',
      'pt', 'pt-BR',
      'nl',
      'hi',
      'ja',
      'ko',
      'zh-CN', 'zh-TW',
      'ru',
      'uk',
      'pl',
      'tr',
      'sv',
      'da',
      'fi',
      'no',
      'id',
      'ms',
      'th',
      'vi',
      'ta',
      'te',
    ];
  }

  /**
   * Get MIME type from file path
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'wav': 'audio/wav',
      'mp3': 'audio/mp3',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'm4a': 'audio/m4a',
      'webm': 'audio/webm',
    };
    return mimeTypes[ext || ''] || 'audio/wav';
  }
}

/**
 * Create and configure Deepgram provider
 */
export function createDeepgramProvider(apiKey: string, options?: Partial<STTProviderConfig>): DeepgramProvider {
  return new DeepgramProvider({
    apiKey,
    ...options,
  });
}
