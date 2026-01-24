/**
 * OpenAI Whisper STT Provider
 * High accuracy transcription via OpenAI Whisper API
 * Note: Whisper API is file-based, not real-time streaming
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
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
// WHISPER BUFFERED STREAM (Simulated streaming via buffering)
// =============================================================================

/**
 * Whisper doesn't support true streaming, so we buffer audio
 * and transcribe when silence is detected or buffer is full
 */
class WhisperBufferedStream extends BaseSTTStream implements STTStream {
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private maxBufferSize = 5 * 1024 * 1024; // 5MB max (Whisper limit is 25MB)
  private minBufferSize = 32000; // ~1 second of 16kHz audio
  private transcribeTimeout: NodeJS.Timeout | null = null;
  private silenceMs: number;
  private startTime: number;

  constructor(
    private client: OpenAI,
    private config: STTStreamConfig
  ) {
    super();
    this.silenceMs = config.endpointing || 1500; // 1.5s silence = end of utterance
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    this._isOpen = true;
    // Emit ready immediately since we're just buffering
    setTimeout(() => this.emit('ready'), 0);
  }

  sendAudio(audio: Buffer): void {
    if (!this._isOpen) return;

    this.buffer.push(audio);
    this.bufferSize += audio.length;

    // Reset silence timeout
    if (this.transcribeTimeout) {
      clearTimeout(this.transcribeTimeout);
    }

    // Set timeout to transcribe on silence
    this.transcribeTimeout = setTimeout(() => {
      this.transcribeBuffer();
    }, this.silenceMs);

    // Transcribe if buffer is getting large
    if (this.bufferSize >= this.maxBufferSize) {
      this.transcribeBuffer();
    }
  }

  finish(): void {
    if (!this._isOpen) return;

    if (this.transcribeTimeout) {
      clearTimeout(this.transcribeTimeout);
    }

    // Transcribe any remaining audio
    if (this.bufferSize >= this.minBufferSize) {
      this.transcribeBuffer();
    }
  }

  close(): void {
    if (this.transcribeTimeout) {
      clearTimeout(this.transcribeTimeout);
    }
    this.buffer = [];
    this.bufferSize = 0;
    this._isOpen = false;
    this.emit('close');
  }

  private async transcribeBuffer(): Promise<void> {
    if (this.bufferSize < this.minBufferSize) return;

    const audioBuffer = Buffer.concat(this.buffer);
    this.buffer = [];
    this.bufferSize = 0;

    try {
      // Create temp file for Whisper API
      const tempPath = path.join('/tmp', `whisper_${Date.now()}.wav`);

      // Write WAV header + audio data
      const wavBuffer = this.createWavBuffer(audioBuffer);
      fs.writeFileSync(tempPath, wavBuffer);

      const response = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: this.config.model || 'whisper-1',
        language: this.config.language?.split('-')[0], // Whisper uses ISO 639-1
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      // Clean up temp file
      fs.unlinkSync(tempPath);

      const result: STTTranscriptResult = {
        text: response.text || '',
        words: (response as { words?: { word: string; start: number; end: number }[] }).words?.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: 1.0, // Whisper doesn't provide per-word confidence
        })),
        confidence: 1.0,
        language: response.language,
        isFinal: true,
        latencyMs: Date.now() - this.startTime,
      };

      this.emit('transcript', result);
      this.emit('utterance_end');

    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error('Whisper transcription failed'));
    }
  }

  /**
   * Create a WAV buffer from raw PCM audio
   */
  private createWavBuffer(pcmData: Buffer): Buffer {
    const sampleRate = this.config.sampleRate || 16000;
    const channels = this.config.channels || 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // audio format (PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);

    return Buffer.concat([header, pcmData]);
  }
}

// =============================================================================
// WHISPER PROVIDER
// =============================================================================

export class WhisperProvider extends STTProvider {
  private client: OpenAI;

  constructor(config: STTProviderConfig) {
    super(config, 'whisper');

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 60000, // Longer timeout for transcription
    });
  }

  /**
   * Create a streaming transcription session (simulated via buffering)
   */
  async createStream(config?: STTStreamConfig): Promise<STTStream> {
    const stream = new WhisperBufferedStream(this.client, {
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

    const response = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: options?.model || 'whisper-1',
      language: options?.language?.split('-')[0],
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    const verboseResponse = response as {
      text: string;
      language?: string;
      duration?: number;
      words?: Array<{ word: string; start: number; end: number }>;
    };

    return {
      text: verboseResponse.text || '',
      words: verboseResponse.words?.map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: 1.0,
      })),
      confidence: 1.0,
      language: verboseResponse.language,
      duration: verboseResponse.duration || 0,
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

    // Create a File object from buffer
    const file = new File([new Uint8Array(audio)], 'audio.wav', { type: options?.mimeType || 'audio/wav' });

    const response = await this.client.audio.transcriptions.create({
      file: file,
      model: options?.model || 'whisper-1',
      language: options?.language?.split('-')[0],
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    const verboseResponse = response as {
      text: string;
      language?: string;
      duration?: number;
      words?: Array<{ word: string; start: number; end: number }>;
    };

    return {
      text: verboseResponse.text || '',
      words: verboseResponse.words?.map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: 1.0,
      })),
      confidence: 1.0,
      language: verboseResponse.language,
      duration: verboseResponse.duration || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Test connection to OpenAI Whisper
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Test with models list (Whisper doesn't have a dedicated test endpoint)
      await this.client.models.list();

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
    return ['whisper-1'];
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<string[]> {
    // Whisper supports many languages via auto-detection
    // These are the commonly used ones
    return [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko',
      'ar', 'hi', 'tr', 'pl', 'uk', 'vi', 'th', 'id', 'ms', 'sv', 'da',
      'fi', 'no', 'el', 'he', 'cs', 'ro', 'hu', 'sk', 'bg', 'hr', 'sr',
    ];
  }
}

/**
 * Create and configure Whisper provider
 */
export function createWhisperProvider(apiKey: string, options?: Partial<STTProviderConfig>): WhisperProvider {
  return new WhisperProvider({
    apiKey,
    ...options,
  });
}
