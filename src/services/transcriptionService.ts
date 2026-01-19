/**
 * Transcription Service
 * Queue-based transcription processing with provider fallback and retry logic
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { TranscriptionRepository, CreateTranscriptionInput, TranscriptionJob } from '../db/repositories/transcriptionRepository';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import {
  STTProvider,
  STTProviderType,
  TranscribeFileResult,
} from '../ai/providers/sttProvider';
import {
  DeepgramProvider,
  WhisperProvider,
  AssemblyAIProvider,
} from '../ai/stt';

// Provider priority order for fallback
const PROVIDER_PRIORITY: STTProviderType[] = ['deepgram', 'whisper', 'assemblyai'];

export interface TranscriptionServiceConfig {
  pollIntervalMs?: number;     // How often to check for pending jobs
  maxConcurrent?: number;      // Max concurrent transcriptions
  enabled?: boolean;           // Enable/disable the service
}

export interface TranscriptionEvent {
  jobId: string;
  sourceType: string;
  sourceId: string;
  transcriptionId?: string;
  text?: string;
  error?: string;
}

export class TranscriptionService extends EventEmitter {
  private transcriptionRepo: TranscriptionRepository;
  private settingsRepo: SettingsRepository;
  private config: Required<TranscriptionServiceConfig>;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeJobs: Set<string> = new Set();
  private providers: Map<STTProviderType, STTProvider> = new Map();

  constructor(
    transcriptionRepo: TranscriptionRepository,
    settingsRepo: SettingsRepository,
    config?: TranscriptionServiceConfig
  ) {
    super();
    this.transcriptionRepo = transcriptionRepo;
    this.settingsRepo = settingsRepo;
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? 5000,
      maxConcurrent: config?.maxConcurrent ?? 3,
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Start the transcription service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('TranscriptionService already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('TranscriptionService disabled by config');
      return;
    }

    logger.info('Starting TranscriptionService...');
    this.isRunning = true;

    // Initialize providers
    await this.initializeProviders();

    // Start polling for jobs
    this.pollTimer = setInterval(() => {
      this.processQueue().catch(err => {
        logger.error('Error processing transcription queue:', err);
      });
    }, this.config.pollIntervalMs);

    // Process immediately on start
    this.processQueue().catch(err => {
      logger.error('Error processing transcription queue:', err);
    });

    logger.info('TranscriptionService started');
  }

  /**
   * Stop the transcription service
   */
  stop(): void {
    if (!this.isRunning) return;

    logger.info('Stopping TranscriptionService...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info('TranscriptionService stopped');
  }

  /**
   * Initialize STT providers from settings
   */
  async initializeProviders(): Promise<void> {
    this.providers.clear();

    // Try to initialize Deepgram
    const deepgramKey = await this.settingsRepo.get('deepgram_api_key');
    if (deepgramKey) {
      try {
        const provider = new DeepgramProvider({
          apiKey: deepgramKey,
          defaultModel: 'nova-2-phonecall',
        });
        this.providers.set('deepgram', provider);
        logger.info('TranscriptionService: Deepgram provider initialized');
      } catch (err) {
        logger.error('Failed to initialize Deepgram provider:', err);
      }
    }

    // Try to initialize Whisper (OpenAI)
    const openaiKey = await this.settingsRepo.get('openai_api_key');
    if (openaiKey) {
      try {
        const provider = new WhisperProvider({
          apiKey: openaiKey,
          defaultModel: 'whisper-1',
        });
        this.providers.set('whisper', provider);
        logger.info('TranscriptionService: Whisper provider initialized');
      } catch (err) {
        logger.error('Failed to initialize Whisper provider:', err);
      }
    }

    // Try to initialize AssemblyAI
    const assemblyaiKey = await this.settingsRepo.get('assemblyai_api_key');
    if (assemblyaiKey) {
      try {
        const provider = new AssemblyAIProvider({
          apiKey: assemblyaiKey,
        });
        this.providers.set('assemblyai', provider);
        logger.info('TranscriptionService: AssemblyAI provider initialized');
      } catch (err) {
        logger.error('Failed to initialize AssemblyAI provider:', err);
      }
    }

    if (this.providers.size === 0) {
      logger.warn('TranscriptionService: No STT providers configured');
    }
  }

  /**
   * Refresh providers (call when API keys change)
   */
  async refreshProviders(): Promise<void> {
    await this.initializeProviders();
  }

  /**
   * Queue a transcription job
   */
  async queueTranscription(
    sourceType: 'recording' | 'voicemail' | 'conversation',
    sourceId: string,
    audioPath: string,
    options?: {
      provider?: string;
      language?: string;
      priority?: number;
    }
  ): Promise<TranscriptionJob> {
    // Check if audio file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Check for existing pending/processing job
    const existingJob = await this.transcriptionRepo.findJobBySource(sourceType, sourceId);
    if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'processing')) {
      logger.info(`Transcription job already exists for ${sourceType}:${sourceId}`);
      return existingJob;
    }

    // Create new job
    const job = await this.transcriptionRepo.createJob({
      sourceType,
      sourceId,
      audioPath,
      provider: options?.provider,
      language: options?.language,
      priority: options?.priority,
    });

    logger.info(`Transcription job queued: ${job.id} for ${sourceType}:${sourceId}`);
    this.emit('job:queued', { jobId: job.id, sourceType, sourceId });

    // Trigger immediate processing
    if (this.isRunning) {
      setImmediate(() => {
        this.processQueue().catch(err => {
          logger.error('Error processing transcription queue:', err);
        });
      });
    }

    return job;
  }

  /**
   * Process the transcription queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeJobs.size >= this.config.maxConcurrent) return;

    // Get next pending job
    const job = await this.transcriptionRepo.getNextPendingJob();
    if (!job) return;

    // Skip if already being processed
    if (this.activeJobs.has(job.id)) return;

    // Mark as active
    this.activeJobs.add(job.id);

    // Process job async
    this.processJob(job).finally(() => {
      this.activeJobs.delete(job.id);
      // Check for more jobs
      if (this.isRunning) {
        setImmediate(() => {
          this.processQueue().catch(err => {
            logger.error('Error processing transcription queue:', err);
          });
        });
      }
    });
  }

  /**
   * Process a single transcription job
   */
  private async processJob(job: TranscriptionJob): Promise<void> {
    logger.info(`Processing transcription job: ${job.id}`);

    try {
      // Mark as processing
      await this.transcriptionRepo.markJobProcessing(job.id);
      this.emit('job:started', { jobId: job.id, sourceType: job.sourceType, sourceId: job.sourceId });

      // Check if audio file exists
      if (!fs.existsSync(job.audioPath)) {
        throw new Error(`Audio file not found: ${job.audioPath}`);
      }

      // Transcribe the audio
      const result = await this.transcribeWithFallback(job);

      // Create transcription record
      const transcription = await this.transcriptionRepo.createTranscription({
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        fullText: result.text,
        segments: result.words ? JSON.stringify(result.words) : undefined,
        languageDetected: result.language,
        confidence: result.confidence,
        provider: result.provider,
        processingTimeMs: result.latencyMs,
        wordCount: result.text.split(/\s+/).filter(w => w).length,
        durationSeconds: result.duration,
      });

      // Mark job as completed
      await this.transcriptionRepo.markJobCompleted(job.id, transcription.id);

      logger.info(`Transcription completed: ${job.id} -> ${transcription.id}`);
      this.emit('job:completed', {
        jobId: job.id,
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        transcriptionId: transcription.id,
        text: transcription.fullText,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Transcription job failed: ${job.id} - ${errorMessage}`);

      await this.transcriptionRepo.markJobFailed(job.id, errorMessage);
      this.emit('job:failed', {
        jobId: job.id,
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        error: errorMessage,
      });
    }
  }

  /**
   * Transcribe audio with provider fallback
   */
  private async transcribeWithFallback(
    job: TranscriptionJob
  ): Promise<TranscribeFileResult & { provider: string }> {
    const errors: string[] = [];

    // If specific provider requested, try it first
    if (job.provider && this.providers.has(job.provider as STTProviderType)) {
      try {
        const provider = this.providers.get(job.provider as STTProviderType)!;
        const result = await provider.transcribeFile(job.audioPath, {
          language: job.language,
        });
        return { ...result, provider: job.provider };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${job.provider}: ${errMsg}`);
        logger.warn(`Preferred provider ${job.provider} failed: ${errMsg}`);
      }
    }

    // Try providers in priority order
    for (const providerName of PROVIDER_PRIORITY) {
      if (!this.providers.has(providerName)) continue;
      if (providerName === job.provider) continue; // Already tried

      try {
        const provider = this.providers.get(providerName)!;
        logger.info(`Trying ${providerName} for job ${job.id}`);

        const result = await provider.transcribeFile(job.audioPath, {
          language: job.language,
        });

        return { ...result, provider: providerName };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${providerName}: ${errMsg}`);
        logger.warn(`Provider ${providerName} failed: ${errMsg}`);
      }
    }

    // All providers failed
    throw new Error(`All transcription providers failed: ${errors.join('; ')}`);
  }

  /**
   * Manually transcribe a file (not queued)
   */
  async transcribeImmediate(
    audioPath: string,
    options?: {
      provider?: STTProviderType;
      language?: string;
    }
  ): Promise<TranscribeFileResult & { provider: string }> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const errors: string[] = [];

    // If specific provider requested
    if (options?.provider && this.providers.has(options.provider)) {
      const provider = this.providers.get(options.provider)!;
      const result = await provider.transcribeFile(audioPath, {
        language: options.language,
      });
      return { ...result, provider: options.provider };
    }

    // Try providers in priority order
    for (const providerName of PROVIDER_PRIORITY) {
      if (!this.providers.has(providerName)) continue;

      try {
        const provider = this.providers.get(providerName)!;
        const result = await provider.transcribeFile(audioPath, {
          language: options?.language,
        });
        return { ...result, provider: providerName };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${providerName}: ${errMsg}`);
      }
    }

    throw new Error(`All transcription providers failed: ${errors.join('; ')}`);
  }

  /**
   * Get job statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    providersAvailable: string[];
  }> {
    const stats = await this.transcriptionRepo.getJobStats();
    return {
      ...stats,
      providersAvailable: Array.from(this.providers.keys()),
    };
  }

  /**
   * Check if service has available providers
   */
  hasProviders(): boolean {
    return this.providers.size > 0;
  }

  /**
   * Get available provider names
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs(daysOld: number = 30): Promise<number> {
    const deleted = await this.transcriptionRepo.deleteOldCompletedJobs(daysOld);
    logger.info(`Cleaned up ${deleted} old transcription jobs`);
    return deleted;
  }
}

/**
 * Create TranscriptionService instance
 */
export function createTranscriptionService(
  transcriptionRepo: TranscriptionRepository,
  settingsRepo: SettingsRepository,
  config?: TranscriptionServiceConfig
): TranscriptionService {
  return new TranscriptionService(transcriptionRepo, settingsRepo, config);
}
