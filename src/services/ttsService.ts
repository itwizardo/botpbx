import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ttsLogger } from '../utils/logger';
import { ElevenLabsVoice, ServiceResult } from '../models/types';

const execAsync = promisify(exec);

interface TTSOptions {
  voice?: string;
  modelId?: string;
  language?: string;  // Language code for multilingual models (e.g., 'fr', 'de', 'es')
}

export interface PiperVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  quality: string;
}

export type TTSProvider = 'piper' | 'kokoro' | 'elevenlabs' | 'openai' | 'cartesia' | 'deepgram' | 'playht' | 'google';

// OpenAI TTS voices
export const OPENAI_TTS_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, versatile' },
  { id: 'echo', name: 'Echo', description: 'Warm male voice' },
  { id: 'fable', name: 'Fable', description: 'British accent' },
  { id: 'onyx', name: 'Onyx', description: 'Deep male voice' },
  { id: 'nova', name: 'Nova', description: 'Friendly female voice' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft female voice' },
];

// Cartesia TTS voices (Sonic model)
export const CARTESIA_TTS_VOICES = [
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Barbershop Man', description: 'Casual male voice' },
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Confident British Man', description: 'British male' },
  { id: 'b7d50908-b17c-442d-ad8d-810c63997ed9', name: 'California Girl', description: 'Young female' },
  { id: '71a7ad14-091c-4e8e-a314-022ece01c121', name: 'Commercial Lady', description: 'Professional female' },
  { id: '5619d38c-cf51-4d8e-9575-48f61a280413', name: 'Doctor Mischief', description: 'Playful male' },
  { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Newsman', description: 'News anchor male' },
  { id: '694f9389-aac1-45b6-b726-9d9369183238', name: 'Friendly Reading Lady', description: 'Warm female' },
  { id: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', name: 'Movie Man', description: 'Deep cinematic male' },
];

// Deepgram Aura voices
export const DEEPGRAM_TTS_VOICES = [
  { id: 'aura-asteria-en', name: 'Asteria', description: 'American female' },
  { id: 'aura-luna-en', name: 'Luna', description: 'American female, warm' },
  { id: 'aura-stella-en', name: 'Stella', description: 'American female, professional' },
  { id: 'aura-athena-en', name: 'Athena', description: 'British female' },
  { id: 'aura-hera-en', name: 'Hera', description: 'American female, friendly' },
  { id: 'aura-orion-en', name: 'Orion', description: 'American male' },
  { id: 'aura-arcas-en', name: 'Arcas', description: 'American male, deep' },
  { id: 'aura-perseus-en', name: 'Perseus', description: 'American male, conversational' },
  { id: 'aura-angus-en', name: 'Angus', description: 'Irish male' },
  { id: 'aura-orpheus-en', name: 'Orpheus', description: 'American male, smooth' },
  { id: 'aura-helios-en', name: 'Helios', description: 'British male' },
  { id: 'aura-zeus-en', name: 'Zeus', description: 'American male, authoritative' },
];

// PlayHT voices (subset of popular ones)
export const PLAYHT_TTS_VOICES = [
  { id: 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d3f63/jennifersaad/manifest.json', name: 'Jennifer', description: 'American female' },
  { id: 's3://voice-cloning-zero-shot/e040bd1b-f190-4bdb-83f0-75ef85b18f84/original/manifest.json', name: 'Michael', description: 'American male' },
  { id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json', name: 'Sofia', description: 'Customer service female' },
  { id: 's3://voice-cloning-zero-shot/801a663f-efd0-4254-98d0-5c175514c3e8/male-narrator/manifest.json', name: 'James', description: 'Narrator male' },
  { id: 's3://voice-cloning-zero-shot/baf1ef41-36b6-428c-9bdf-50ba54682bd8/original/manifest.json', name: 'Charlotte', description: 'British female' },
  { id: 's3://voice-cloning-zero-shot/65977f5e-a22a-4b36-861b-1a7a2c6d59d3/oliver/manifest.json', name: 'Oliver', description: 'British male' },
];

// Google Cloud TTS voices (Neural2 voices)
export const GOOGLE_TTS_VOICES = [
  { id: 'en-US-Neural2-A', name: 'Neural2-A', description: 'American male' },
  { id: 'en-US-Neural2-C', name: 'Neural2-C', description: 'American female' },
  { id: 'en-US-Neural2-D', name: 'Neural2-D', description: 'American male, deep' },
  { id: 'en-US-Neural2-E', name: 'Neural2-E', description: 'American female, friendly' },
  { id: 'en-US-Neural2-F', name: 'Neural2-F', description: 'American female, professional' },
  { id: 'en-US-Neural2-G', name: 'Neural2-G', description: 'American female, warm' },
  { id: 'en-US-Neural2-H', name: 'Neural2-H', description: 'American female, bright' },
  { id: 'en-US-Neural2-I', name: 'Neural2-I', description: 'American male, casual' },
  { id: 'en-US-Neural2-J', name: 'Neural2-J', description: 'American male, authoritative' },
  { id: 'en-GB-Neural2-A', name: 'British Neural2-A', description: 'British female' },
  { id: 'en-GB-Neural2-B', name: 'British Neural2-B', description: 'British male' },
  { id: 'en-GB-Neural2-C', name: 'British Neural2-C', description: 'British female, warm' },
];

export class TTSService {
  // Provider settings
  private provider: TTSProvider = 'piper';

  // ElevenLabs settings
  private apiKey: string | null;
  private defaultVoice: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  // OpenAI settings
  private openaiApiKey: string | null = null;
  private openaiVoice: string = 'nova';

  // Cartesia settings
  private cartesiaApiKey: string | null = null;
  private cartesiaVoice: string = '694f9389-aac1-45b6-b726-9d9369183238'; // Friendly Reading Lady

  // Deepgram settings (for Aura TTS)
  private deepgramApiKey: string | null = null;
  private deepgramVoice: string = 'aura-asteria-en';

  // PlayHT settings
  private playhtApiKey: string | null = null;
  private playhtUserId: string | null = null;
  private playhtVoice: string = 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d3f63/jennifersaad/manifest.json';

  // Google Cloud TTS settings
  private googleApiKey: string | null = null;
  private googleVoice: string = 'en-US-Neural2-C';

  // Piper settings
  private piperUrl: string = 'http://127.0.0.1:5050';
  private piperVoice: string = 'en_US-lessac-medium';

  // Kokoro settings
  private kokoroUrl: string = 'http://127.0.0.1:5003';
  private kokoroVoice: string = 'af_heart';

  // Common settings
  private audioPath: string;

  constructor(
    audioPath: string,
    apiKey?: string | null,
    defaultVoice?: string,
    provider?: TTSProvider,
    piperUrl?: string,
    piperVoice?: string
  ) {
    this.audioPath = audioPath;
    this.apiKey = apiKey || null;
    this.defaultVoice = defaultVoice || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
    this.provider = provider || 'piper';
    this.piperUrl = piperUrl || 'http://127.0.0.1:5050';
    this.piperVoice = piperVoice || 'en_US-lessac-medium';

    // Ensure audio directory exists
    if (!fs.existsSync(this.audioPath)) {
      fs.mkdirSync(this.audioPath, { recursive: true });
      ttsLogger.info(`Created audio directory: ${this.audioPath}`);
    }
  }

  // =====================
  // Audio Conversion
  // =====================

  /**
   * Convert audio to WAV format for Asterisk compatibility
   * Uses SoX high-quality resampler and generates:
   * - 8kHz .wav for Asterisk narrowband
   * - 16kHz .sln16 for Asterisk wideband (G.722)
   * - Full-quality _hq.wav for browser preview
   */
  private async convertToWav(inputPath: string): Promise<string> {
    const wavPath = inputPath.replace(/\.[^.]+$/, '.wav');
    const sln16Path = inputPath.replace(/\.[^.]+$/, '.sln16');
    const hqWavPath = inputPath.replace(/\.[^.]+$/, '_hq.wav');
    try {
      // High-quality WAV for browser preview (preserve original sample rate)
      await execAsync(`ffmpeg -i "${inputPath}" -ac 1 -acodec pcm_s16le -y "${hqWavPath}" 2>/dev/null`);
      ttsLogger.info(`Created HQ preview WAV: ${hqWavPath}`);

      // Convert to 8kHz mono PCM WAV using SoX high-quality resampler
      await execAsync(`ffmpeg -i "${inputPath}" -af aresample=resampler=soxr -ar 8000 -ac 1 -acodec pcm_s16le -y "${wavPath}" 2>/dev/null`);
      ttsLogger.info(`Converted to WAV (8kHz soxr): ${wavPath}`);

      // Also generate 16kHz sln16 for wideband SIP channels (G.722 etc.)
      await execAsync(`ffmpeg -i "${inputPath}" -af aresample=resampler=soxr -ar 16000 -ac 1 -f s16le -y "${sln16Path}" 2>/dev/null`);
      ttsLogger.info(`Converted to SLN16 (16kHz soxr): ${sln16Path}`);

      return wavPath;
    } catch (error) {
      ttsLogger.error(`Failed to convert ${inputPath} to WAV:`, error);
      return inputPath;
    }
  }

  /**
   * Convert raw PCM audio (headerless) to Asterisk formats
   * Used for providers that return raw PCM (ElevenLabs, OpenAI, Google)
   */
  private async convertRawPcmToWav(rawPath: string, sampleRate: number): Promise<string> {
    const wavPath = rawPath.replace(/\.[^.]+$/, '.wav');
    const sln16Path = rawPath.replace(/\.[^.]+$/, '.sln16');
    const hqWavPath = rawPath.replace(/\.[^.]+$/, '_hq.wav');
    try {
      // High-quality WAV for browser preview (wrap raw PCM at native sample rate)
      await execAsync(`ffmpeg -f s16le -ar ${sampleRate} -ac 1 -i "${rawPath}" -acodec pcm_s16le -y "${hqWavPath}" 2>/dev/null`);
      ttsLogger.info(`Created HQ preview WAV (${sampleRate}Hz): ${hqWavPath}`);

      // Convert raw PCM to 8kHz WAV using SoX resampler
      await execAsync(`ffmpeg -f s16le -ar ${sampleRate} -ac 1 -i "${rawPath}" -af aresample=resampler=soxr -ar 8000 -ac 1 -acodec pcm_s16le -y "${wavPath}" 2>/dev/null`);
      ttsLogger.info(`Converted raw PCM (${sampleRate}Hz) to WAV (8kHz soxr): ${wavPath}`);

      // Also generate 16kHz sln16 for wideband channels
      await execAsync(`ffmpeg -f s16le -ar ${sampleRate} -ac 1 -i "${rawPath}" -af aresample=resampler=soxr -ar 16000 -ac 1 -f s16le -y "${sln16Path}" 2>/dev/null`);
      ttsLogger.info(`Converted raw PCM to SLN16 (16kHz soxr): ${sln16Path}`);

      return wavPath;
    } catch (error) {
      ttsLogger.error(`Failed to convert raw PCM to WAV:`, error);
      return rawPath;
    }
  }

  // =====================
  // Provider Management
  // =====================

  /**
   * Get current TTS provider
   */
  getProvider(): TTSProvider {
    return this.provider;
  }

  /**
   * Set TTS provider
   */
  setProvider(provider: TTSProvider): void {
    this.provider = provider;
    ttsLogger.info(`TTS provider changed to: ${provider}`);
  }

  /**
   * Check if TTS is available
   * For Piper: check if server is reachable
   * For ElevenLabs: check if API key is set
   */
  isAvailable(): boolean {
    if (this.provider === 'piper') {
      return true; // Piper is local, always "available" (health check happens at generation)
    }
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Check if ElevenLabs API key is configured
   */
  isElevenLabsConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  // =====================
  // Piper TTS Methods
  // =====================

  /**
   * Set Piper configuration
   */
  setPiperConfig(url: string, voice: string): void {
    this.piperUrl = url;
    this.piperVoice = voice;
    ttsLogger.info(`Piper config updated: ${url}, voice: ${voice}`);
  }

  /**
   * Set Piper URL
   */
  setPiperUrl(url: string): void {
    this.piperUrl = url;
  }

  /**
   * Set default Piper voice
   */
  setPiperVoice(voice: string): void {
    this.piperVoice = voice;
    ttsLogger.info(`Piper voice updated: ${voice}`);
  }

  /**
   * Get current Piper voice
   */
  getPiperVoice(): string {
    return this.piperVoice;
  }

  /**
   * Get available voices from Piper server
   */
  async getPiperVoices(): Promise<ServiceResult<PiperVoice[]>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.piperUrl}/voices`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { success: false, error: `Piper server error: ${response.status}` };
      }

      const data = await response.json() as { voices: PiperVoice[] };
      return { success: true, data: data.voices };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Piper server not responding (timeout)' };
      }
      ttsLogger.error('Failed to fetch Piper voices:', error);
      return { success: false, error: `Cannot reach Piper server: ${(error as Error).message}` };
    }
  }

  /**
   * Check Piper server health
   */
  async checkPiperHealth(): Promise<{ ok: boolean; voicesCount?: number; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.piperUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { ok: false, error: `Server returned ${response.status}` };
      }

      const data = await response.json() as { status: string; voices_count: number; piper_available: boolean };
      return {
        ok: data.status === 'ok' && data.piper_available,
        voicesCount: data.voices_count,
        error: data.status !== 'ok' ? 'Piper not fully operational' : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, error: 'Server not responding (timeout)' };
      }
      return { ok: false, error: `Cannot connect: ${(error as Error).message}` };
    }
  }

  /**
   * Generate audio using Piper TTS
   */
  async generateWithPiper(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    const selectedVoice = voice || this.piperVoice;
    ttsLogger.info(`Generating Piper TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(`${this.piperUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        ttsLogger.error(`Piper TTS generation failed: ${response.status} ${errorText}`);
        return { success: false, error: `Piper error: ${response.status}` };
      }

      // Save the WAV file
      const wavPath = path.join(this.audioPath, `${promptId}.wav`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(wavPath, buffer);

      ttsLogger.info(`Piper TTS audio saved: ${wavPath} (${buffer.length} bytes)`);

      return { success: true, data: wavPath };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        ttsLogger.error('Piper TTS generation timed out');
        return { success: false, error: 'TTS generation timed out' };
      }
      ttsLogger.error('Piper TTS generation failed:', error);
      return { success: false, error: `Piper error: ${(error as Error).message}` };
    }
  }

  // =====================
  // Kokoro TTS Methods
  // =====================

  /**
   * Set Kokoro configuration
   */
  setKokoroConfig(url: string, voice: string): void {
    this.kokoroUrl = url;
    this.kokoroVoice = voice;
    ttsLogger.info(`Kokoro config updated: ${url}, voice: ${voice}`);
  }

  /**
   * Set Kokoro URL
   */
  setKokoroUrl(url: string): void {
    this.kokoroUrl = url;
  }

  /**
   * Set default Kokoro voice
   */
  setKokoroVoice(voice: string): void {
    this.kokoroVoice = voice;
    ttsLogger.info(`Kokoro voice updated: ${voice}`);
  }

  /**
   * Get current Kokoro voice
   */
  getKokoroVoice(): string {
    return this.kokoroVoice;
  }

  /**
   * Check Kokoro server health
   */
  async checkKokoroHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.kokoroUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { ok: false, error: `Server returned ${response.status}` };
      }

      const data = await response.json() as { status: string; engine: string };
      return {
        ok: data.status === 'ok',
        error: data.status !== 'ok' ? 'Kokoro not fully operational' : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, error: 'Server not responding (timeout)' };
      }
      return { ok: false, error: `Cannot connect: ${(error as Error).message}` };
    }
  }

  /**
   * Generate audio using Kokoro TTS
   */
  async generateWithKokoro(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    const selectedVoice = voice || this.kokoroVoice;
    ttsLogger.info(`Generating Kokoro TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      // Use path.resolve to ensure absolute path for Kokoro server (runs from different directory)
      const wavPath = path.resolve(this.audioPath, `${promptId}.wav`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for model loading

      const response = await fetch(`${this.kokoroUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          output_path: wavPath,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        ttsLogger.error(`Kokoro TTS generation failed: ${response.status} ${errorText}`);
        return { success: false, error: `Kokoro error: ${response.status}` };
      }

      const result = await response.json() as { success: boolean; output_path: string; error?: string };

      if (!result.success) {
        return { success: false, error: result.error || 'Kokoro generation failed' };
      }

      ttsLogger.info(`Kokoro TTS audio saved: ${wavPath}`);

      return { success: true, data: wavPath };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        ttsLogger.error('Kokoro TTS generation timed out');
        return { success: false, error: 'TTS generation timed out (model may be loading)' };
      }
      ttsLogger.error('Kokoro TTS generation failed:', error);
      return { success: false, error: `Kokoro error: ${(error as Error).message}` };
    }
  }

  // =====================
  // ElevenLabs Methods
  // =====================

  /**
   * Update API key (can be called when key is set via Telegram)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    ttsLogger.info('ElevenLabs API key updated');
  }

  /**
   * Update default voice
   */
  setDefaultVoice(voiceId: string): void {
    this.defaultVoice = voiceId;
    ttsLogger.info(`Default voice updated: ${voiceId}`);
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices(): Promise<ServiceResult<ElevenLabsVoice[]>> {
    if (!this.isElevenLabsConfigured()) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey!,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`Failed to fetch voices: ${response.status} ${error}`);
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json() as { voices: ElevenLabsVoice[] };
      return { success: true, data: data.voices };
    } catch (error) {
      ttsLogger.error('Failed to fetch voices:', error);
      return { success: false, error: `Network error: ${(error as Error).message}` };
    }
  }

  /**
   * Generate audio using ElevenLabs
   */
  async generateWithElevenLabs(
    text: string,
    promptId: string,
    options?: TTSOptions
  ): Promise<ServiceResult<string>> {
    if (!this.isElevenLabsConfigured()) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const voice = options?.voice || this.defaultVoice;
    const modelId = options?.modelId || 'eleven_multilingual_v2';
    const language = options?.language;  // Language code (e.g., 'fr', 'de', 'es')

    ttsLogger.info(`Generating ElevenLabs TTS for prompt ${promptId} with voice ${voice}${language ? `, language: ${language}` : ''}`);

    try {
      // Build request body - include language_code for multilingual model
      const requestBody: Record<string, unknown> = {
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      };

      // For multilingual v2, we can force the output language with language_code
      // This makes the TTS speak in the specified language regardless of input text
      if (language && modelId === 'eleven_multilingual_v2') {
        requestBody.language_code = language;
        ttsLogger.info(`Using language_code: ${language} for multilingual output`);
      }

      // Request raw PCM at 24kHz to avoid lossy MP3 compression
      const response = await fetch(`${this.baseUrl}/text-to-speech/${voice}?output_format=pcm_24000`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `API error: ${response.status}` };
      }

      // Save raw PCM (24kHz, 16-bit, mono)
      const rawPath = path.join(this.audioPath, `${promptId}.raw`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(rawPath, buffer);

      ttsLogger.info(`TTS raw PCM saved: ${rawPath} (${buffer.length} bytes)`);

      // Convert raw PCM to Asterisk formats (lossless pipeline)
      const wavPath = await this.convertRawPcmToWav(rawPath, 24000);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('TTS generation failed:', error);
      return { success: false, error: `Network error: ${(error as Error).message}` };
    }
  }

  /**
   * Validate API key by making a test request with timeout
   * Returns an object with success status and error details
   */
  async validateApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    const keyToTest = apiKey || this.apiKey;
    if (!keyToTest) {
      return { valid: false, error: 'No API key provided' };
    }

    // Create AbortController for 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        method: 'GET',
        headers: {
          'xi-api-key': keyToTest,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { valid: true };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      } else {
        return { valid: false, error: `API error: ${response.status}` };
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { valid: false, error: 'Connection timeout - ElevenLabs API not responding' };
        }
        return { valid: false, error: `Network error: ${error.message}` };
      }
      return { valid: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * Simple boolean check for API key validity (backward compatible)
   */
  async isApiKeyValid(apiKey?: string): Promise<boolean> {
    const result = await this.validateApiKey(apiKey);
    return result.valid;
  }

  /**
   * Get user info (subscription details)
   */
  async getUserInfo(): Promise<ServiceResult<{ character_count: number; character_limit: number }>> {
    if (!this.isElevenLabsConfigured()) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/user/subscription`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey!,
        },
      });

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json() as { character_count: number; character_limit: number };
      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Network error: ${(error as Error).message}` };
    }
  }

  // =====================
  // OpenAI TTS Methods
  // =====================

  /**
   * Set OpenAI API key for TTS
   */
  setOpenAIApiKey(apiKey: string): void {
    this.openaiApiKey = apiKey;
    ttsLogger.info('OpenAI TTS API key updated');
  }

  /**
   * Get OpenAI API key
   */
  getOpenAIApiKey(): string | null {
    return this.openaiApiKey;
  }

  /**
   * Set default OpenAI voice
   */
  setOpenAIVoice(voice: string): void {
    this.openaiVoice = voice;
    ttsLogger.info(`OpenAI voice updated: ${voice}`);
  }

  /**
   * Get current OpenAI voice
   */
  getOpenAIVoice(): string {
    return this.openaiVoice;
  }

  /**
   * Check if OpenAI TTS is configured
   */
  isOpenAIConfigured(): boolean {
    return this.openaiApiKey !== null && this.openaiApiKey.length > 0;
  }

  /**
   * Get available OpenAI TTS voices
   */
  getOpenAIVoices(): Array<{ id: string; name: string; description: string }> {
    return OPENAI_TTS_VOICES;
  }

  /**
   * Generate audio using OpenAI TTS
   */
  async generateWithOpenAI(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    if (!this.isOpenAIConfigured()) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    const selectedVoice = voice || this.openaiVoice;
    ttsLogger.info(`Generating OpenAI TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      // Use tts-1-hd for highest quality, raw PCM to avoid lossy compression
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          input: text,
          voice: selectedVoice,
          response_format: 'pcm',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`OpenAI TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `OpenAI API error: ${response.status}` };
      }

      // Save raw PCM (24kHz, 16-bit, mono)
      const rawPath = path.join(this.audioPath, `${promptId}.raw`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(rawPath, buffer);

      ttsLogger.info(`OpenAI TTS raw PCM saved: ${rawPath} (${buffer.length} bytes)`);

      // Convert raw PCM to Asterisk formats (lossless pipeline)
      const wavPath = await this.convertRawPcmToWav(rawPath, 24000);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('OpenAI TTS generation failed:', error);
      return { success: false, error: `OpenAI error: ${(error as Error).message}` };
    }
  }

  // =====================
  // Cartesia TTS Methods
  // =====================

  setCartesiaApiKey(apiKey: string): void {
    this.cartesiaApiKey = apiKey;
    ttsLogger.info('Cartesia API key updated');
  }

  getCartesiaApiKey(): string | null {
    return this.cartesiaApiKey;
  }

  setCartesiaVoice(voice: string): void {
    this.cartesiaVoice = voice;
    ttsLogger.info(`Cartesia voice updated: ${voice}`);
  }

  getCartesiaVoice(): string {
    return this.cartesiaVoice;
  }

  isCartesiaConfigured(): boolean {
    return this.cartesiaApiKey !== null && this.cartesiaApiKey.length > 0;
  }

  getCartesiaVoices(): Array<{ id: string; name: string; description: string }> {
    return CARTESIA_TTS_VOICES;
  }

  async generateWithCartesia(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    if (!this.isCartesiaConfigured()) {
      return { success: false, error: 'Cartesia API key not configured' };
    }

    const selectedVoice = voice || this.cartesiaVoice;
    ttsLogger.info(`Generating Cartesia TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'X-API-Key': this.cartesiaApiKey!,
          'Cartesia-Version': '2024-06-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-english',
          transcript: text,
          voice: {
            mode: 'id',
            id: selectedVoice,
          },
          output_format: {
            container: 'mp3',
            bit_rate: 128000,
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`Cartesia TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `Cartesia API error: ${response.status}` };
      }

      const mp3Path = path.join(this.audioPath, `${promptId}.mp3`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(mp3Path, buffer);

      ttsLogger.info(`Cartesia TTS audio saved: ${mp3Path} (${buffer.length} bytes)`);

      // Convert to WAV for Asterisk compatibility
      const wavPath = await this.convertToWav(mp3Path);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('Cartesia TTS generation failed:', error);
      return { success: false, error: `Cartesia error: ${(error as Error).message}` };
    }
  }

  // =====================
  // Deepgram Aura TTS Methods
  // =====================

  setDeepgramApiKey(apiKey: string): void {
    this.deepgramApiKey = apiKey;
    ttsLogger.info('Deepgram API key updated');
  }

  getDeepgramApiKey(): string | null {
    return this.deepgramApiKey;
  }

  setDeepgramVoice(voice: string): void {
    this.deepgramVoice = voice;
    ttsLogger.info(`Deepgram voice updated: ${voice}`);
  }

  getDeepgramVoice(): string {
    return this.deepgramVoice;
  }

  isDeepgramConfigured(): boolean {
    return this.deepgramApiKey !== null && this.deepgramApiKey.length > 0;
  }

  getDeepgramVoices(): Array<{ id: string; name: string; description: string }> {
    return DEEPGRAM_TTS_VOICES;
  }

  async generateWithDeepgram(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    if (!this.isDeepgramConfigured()) {
      return { success: false, error: 'Deepgram API key not configured' };
    }

    const selectedVoice = voice || this.deepgramVoice;
    ttsLogger.info(`Generating Deepgram TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      const response = await fetch(`https://api.deepgram.com/v1/speak?model=${selectedVoice}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`Deepgram TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `Deepgram API error: ${response.status}` };
      }

      const mp3Path = path.join(this.audioPath, `${promptId}.mp3`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(mp3Path, buffer);

      ttsLogger.info(`Deepgram TTS audio saved: ${mp3Path} (${buffer.length} bytes)`);

      // Convert to WAV for Asterisk compatibility
      const wavPath = await this.convertToWav(mp3Path);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('Deepgram TTS generation failed:', error);
      return { success: false, error: `Deepgram error: ${(error as Error).message}` };
    }
  }

  // =====================
  // PlayHT TTS Methods
  // =====================

  setPlayHTApiKey(apiKey: string): void {
    this.playhtApiKey = apiKey;
    ttsLogger.info('PlayHT API key updated');
  }

  getPlayHTApiKey(): string | null {
    return this.playhtApiKey;
  }

  setPlayHTUserId(userId: string): void {
    this.playhtUserId = userId;
    ttsLogger.info('PlayHT User ID updated');
  }

  getPlayHTUserId(): string | null {
    return this.playhtUserId;
  }

  setPlayHTVoice(voice: string): void {
    this.playhtVoice = voice;
    ttsLogger.info(`PlayHT voice updated: ${voice}`);
  }

  getPlayHTVoice(): string {
    return this.playhtVoice;
  }

  isPlayHTConfigured(): boolean {
    return this.playhtApiKey !== null && this.playhtApiKey.length > 0 &&
           this.playhtUserId !== null && this.playhtUserId.length > 0;
  }

  getPlayHTVoices(): Array<{ id: string; name: string; description: string }> {
    return PLAYHT_TTS_VOICES;
  }

  async generateWithPlayHT(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    if (!this.isPlayHTConfigured()) {
      return { success: false, error: 'PlayHT API key or User ID not configured' };
    }

    const selectedVoice = voice || this.playhtVoice;
    ttsLogger.info(`Generating PlayHT TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      const response = await fetch('https://api.play.ht/api/v2/tts/stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.playhtApiKey}`,
          'X-User-ID': this.playhtUserId!,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          output_format: 'mp3',
          voice_engine: 'PlayHT2.0-turbo',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`PlayHT TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `PlayHT API error: ${response.status}` };
      }

      const mp3Path = path.join(this.audioPath, `${promptId}.mp3`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(mp3Path, buffer);

      ttsLogger.info(`PlayHT TTS audio saved: ${mp3Path} (${buffer.length} bytes)`);

      // Convert to WAV for Asterisk compatibility
      const wavPath = await this.convertToWav(mp3Path);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('PlayHT TTS generation failed:', error);
      return { success: false, error: `PlayHT error: ${(error as Error).message}` };
    }
  }

  // =====================
  // Google Cloud TTS Methods
  // =====================

  setGoogleApiKey(apiKey: string): void {
    this.googleApiKey = apiKey;
    ttsLogger.info('Google Cloud API key updated');
  }

  getGoogleApiKey(): string | null {
    return this.googleApiKey;
  }

  setGoogleVoice(voice: string): void {
    this.googleVoice = voice;
    ttsLogger.info(`Google voice updated: ${voice}`);
  }

  getGoogleVoice(): string {
    return this.googleVoice;
  }

  isGoogleConfigured(): boolean {
    return this.googleApiKey !== null && this.googleApiKey.length > 0;
  }

  getGoogleVoices(): Array<{ id: string; name: string; description: string }> {
    return GOOGLE_TTS_VOICES;
  }

  async generateWithGoogle(
    text: string,
    promptId: string,
    voice?: string
  ): Promise<ServiceResult<string>> {
    if (!this.isGoogleConfigured()) {
      return { success: false, error: 'Google Cloud API key not configured' };
    }

    const selectedVoice = voice || this.googleVoice;
    // Extract language code from voice name (e.g., 'en-US-Neural2-C' -> 'en-US')
    const languageCode = selectedVoice.split('-').slice(0, 2).join('-');
    ttsLogger.info(`Generating Google TTS for prompt ${promptId} with voice ${selectedVoice}`);

    try {
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.googleApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text: text },
          voice: {
            languageCode: languageCode,
            name: selectedVoice,
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            sampleRateHertz: 24000,
            speakingRate: 1.0,
            pitch: 0,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        ttsLogger.error(`Google TTS generation failed: ${response.status} ${error}`);
        return { success: false, error: `Google API error: ${response.status}` };
      }

      // Google LINEAR16 returns raw PCM as base64
      const data = await response.json() as { audioContent: string };
      const audioBuffer = Buffer.from(data.audioContent, 'base64');

      const rawPath = path.join(this.audioPath, `${promptId}.raw`);
      fs.writeFileSync(rawPath, audioBuffer);

      ttsLogger.info(`Google TTS raw PCM saved: ${rawPath} (${audioBuffer.length} bytes)`);

      // Convert raw PCM to Asterisk formats (lossless pipeline)
      const wavPath = await this.convertRawPcmToWav(rawPath, 24000);

      return { success: true, data: wavPath };
    } catch (error) {
      ttsLogger.error('Google TTS generation failed:', error);
      return { success: false, error: `Google error: ${(error as Error).message}` };
    }
  }

  // =====================
  // Unified TTS Generation
  // =====================

  /**
   * Generate audio from text using the configured provider
   * Routes to the appropriate provider based on current provider setting
   */
  async generateAudio(
    text: string,
    promptId: string,
    options?: TTSOptions
  ): Promise<ServiceResult<string>> {
    switch (this.provider) {
      case 'piper':
        return this.generateWithPiper(text, promptId, options?.voice);
      case 'kokoro':
        return this.generateWithKokoro(text, promptId, options?.voice);
      case 'openai':
        return this.generateWithOpenAI(text, promptId, options?.voice);
      case 'cartesia':
        return this.generateWithCartesia(text, promptId, options?.voice);
      case 'deepgram':
        return this.generateWithDeepgram(text, promptId, options?.voice);
      case 'playht':
        return this.generateWithPlayHT(text, promptId, options?.voice);
      case 'google':
        return this.generateWithGoogle(text, promptId, options?.voice);
      case 'elevenlabs':
      default:
        return this.generateWithElevenLabs(text, promptId, options);
    }
  }

  // =====================
  // Common Audio Methods
  // =====================

  /**
   * Delete generated audio file
   */
  deleteAudio(promptId: string): boolean {
    const mp3Path = path.join(this.audioPath, `${promptId}.mp3`);
    const wavPath = path.join(this.audioPath, `${promptId}.wav`);
    const slnPath = path.join(this.audioPath, `${promptId}.sln`);
    const sln16Path = path.join(this.audioPath, `${promptId}.sln16`);
    const rawPath = path.join(this.audioPath, `${promptId}.raw`);
    const hqWavPath = path.join(this.audioPath, `${promptId}_hq.wav`);

    let deleted = false;

    for (const filePath of [mp3Path, wavPath, slnPath, sln16Path, rawPath, hqWavPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }
    }

    return deleted;
  }

  /**
   * Check if audio file exists for a prompt
   */
  audioExists(promptId: string): boolean {
    const mp3Path = path.join(this.audioPath, `${promptId}.mp3`);
    const wavPath = path.join(this.audioPath, `${promptId}.wav`);
    return fs.existsSync(mp3Path) || fs.existsSync(wavPath);
  }

  /**
   * Get the file path for a prompt (without extension)
   */
  getAudioPath(promptId: string): string {
    return path.join(this.audioPath, promptId);
  }

  // =====================
  // Real-time Synthesis
  // =====================

  /**
   * Synthesize text to audio buffer for real-time streaming
   * Used by conversation engine for AI phone calls
   */
  async synthesize(
    text: string,
    options: {
      provider?: string;
      voiceId?: string;
      outputFormat?: 'pcm' | 'wav' | 'mp3';
      sampleRate?: number;
    }
  ): Promise<Buffer> {
    // Generate unique ID for this synthesis
    const promptId = `synth_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Set provider if specified
    if (options.provider) {
      const validProviders = ['piper', 'kokoro', 'elevenlabs', 'openai', 'cartesia', 'deepgram', 'playht', 'google'] as const;
      if (validProviders.includes(options.provider as TTSProvider)) {
        this.provider = options.provider as TTSProvider;
      }
    }

    // Generate audio file
    const result = await this.generateAudio(text, promptId, {
      voice: options.voiceId,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'TTS generation failed');
    }

    // Read the generated audio file
    const audioPath = result.data;
    const audioBuffer = fs.readFileSync(audioPath);

    // Clean up the temp file
    this.deleteAudio(promptId);

    // Convert to raw PCM if requested
    if (options.outputFormat === 'pcm' && options.sampleRate) {
      // For PCM output, we need to convert WAV to raw PCM
      // The WAV file is already at 8kHz from convertToWav
      // Skip the 44-byte WAV header to get raw PCM data
      if (audioPath.endsWith('.wav') && audioBuffer.length > 44) {
        return audioBuffer.slice(44);
      }
    }

    return audioBuffer;
  }
}

// =============================================================================
// SINGLETON PATTERN
// =============================================================================

let ttsInstance: TTSService | null = null;

/**
 * Get the TTS service singleton instance
 * @throws Error if service not initialized
 */
export function getTTSService(): TTSService {
  if (!ttsInstance) {
    throw new Error('TTS Service not initialized. Call initializeTTSService first.');
  }
  return ttsInstance;
}

/**
 * Initialize the TTS service singleton
 */
export function initializeTTSService(
  audioPath: string,
  apiKey?: string | null,
  defaultVoice?: string,
  provider?: TTSProvider,
  piperUrl?: string,
  piperVoice?: string
): TTSService {
  ttsInstance = new TTSService(audioPath, apiKey, defaultVoice, provider, piperUrl, piperVoice);
  return ttsInstance;
}

/**
 * Check if TTS service is initialized
 */
export function isTTSInitialized(): boolean {
  return ttsInstance !== null;
}
