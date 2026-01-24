/**
 * Transcription Service
 * Handles automatic transcription of recordings and voicemails
 * Supports multiple STT providers with automatic fallback
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  STTProvider,
  STTProviderType,
  TranscribeFileResult,
  getSTTProvider,
  getAllSTTProviders,
} from './stt';
import { db } from '../db/compat';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export type TranscriptionSourceType = 'recording' | 'voicemail' | 'file';

export interface TranscriptionRequest {
  id?: string;
  sourceType: TranscriptionSourceType;
  sourceId?: string;
  audioPath: string;
  provider?: STTProviderType;
  language?: string;
  priority?: 'high' | 'normal' | 'low';
  callback?: (result: TranscriptionResult) => void;
}

export interface TranscriptionResult {
  id: string;
  sourceType: TranscriptionSourceType;
  sourceId?: string;
  text: string;
  segments?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  language?: string;
  confidence: number;
  provider: string;
  duration: number;
  latencyMs: number;
  error?: string;
}

export interface TranscriptionJob {
  id: string;
  request: TranscriptionRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TranscriptionResult;
  error?: string;
}

// =============================================================================
// TRANSCRIPTION SERVICE
// =============================================================================

class TranscriptionService extends EventEmitter {
  private queue: TranscriptionJob[] = [];
  private isProcessing: boolean = false;
  private maxConcurrent: number = 3;
  private activeJobs: number = 0;
  private preferredProvider: STTProviderType = 'deepgram';
  private maxRetries: number = 2;

  constructor() {
    super();
  }

  /**
   * Initialize the transcription service
   */
  async initialize(): Promise<void> {
    // Load preferred provider from config
    const config = await db.queryOne<{ stt_provider: string }>(
      `SELECT config FROM provider_configs WHERE provider_type = 'stt' AND enabled = true ORDER BY id LIMIT 1`
    );

    if (config) {
      try {
        const parsed = JSON.parse(config.stt_provider);
        if (parsed.preferred) {
          this.preferredProvider = parsed.preferred as STTProviderType;
        }
      } catch (e) {
        // Use default
      }
    }

    // Resume any pending jobs from database
    this.resumePendingJobs();

    logger.info('Transcription service initialized');
  }

  /**
   * Queue a transcription request
   */
  async transcribe(request: TranscriptionRequest): Promise<string> {
    const job: TranscriptionJob = {
      id: request.id || `trans_${uuidv4()}`,
      request,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };

    // Save job to database
    this.saveJob(job);

    // Add to queue
    if (request.priority === 'high') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    // Start processing if not already
    this.processQueue();

    this.emit('queued', job);
    logger.info(`Queued transcription job: ${job.id}`);

    return job.id;
  }

  /**
   * Transcribe a file immediately (blocking)
   */
  async transcribeNow(audioPath: string, options?: {
    provider?: STTProviderType;
    language?: string;
  }): Promise<TranscriptionResult> {
    const provider = this.getProvider(options?.provider);

    if (!provider) {
      throw new Error('No STT provider available');
    }

    const startTime = Date.now();

    try {
      const result = await provider.transcribeFile(audioPath, {
        language: options?.language,
      });

      return {
        id: `trans_${uuidv4()}`,
        sourceType: 'file',
        text: result.text,
        segments: result.words,
        language: result.language,
        confidence: result.confidence,
        provider: provider.getName(),
        duration: result.duration,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`Transcription failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get transcription status
   */
  async getStatus(jobId: string): Promise<TranscriptionJob | null> {
    const job = this.queue.find((j) => j.id === jobId);
    if (job) return job;

    // Check database
    const dbJob = await db.queryOne<{
      id: string;
      source_type: string;
      source_id: string | null;
      audio_path: string;
      provider: string | null;
      language: string | null;
      status: string;
      attempts: number;
      result: string | null;
      error: string | null;
      created_at: number;
      started_at: number | null;
      completed_at: number | null;
    }>('SELECT * FROM transcription_jobs WHERE id = $1', [jobId]);

    if (!dbJob) return null;

    return {
      id: dbJob.id,
      request: {
        sourceType: dbJob.source_type as TranscriptionSourceType,
        sourceId: dbJob.source_id || undefined,
        audioPath: dbJob.audio_path,
        provider: dbJob.provider as STTProviderType | undefined,
        language: dbJob.language || undefined,
      },
      status: dbJob.status as TranscriptionJob['status'],
      attempts: dbJob.attempts,
      createdAt: dbJob.created_at,
      startedAt: dbJob.started_at || undefined,
      completedAt: dbJob.completed_at || undefined,
      result: dbJob.result ? JSON.parse(dbJob.result) : undefined,
      error: dbJob.error || undefined,
    };
  }

  /**
   * Get transcription result
   */
  async getResult(sourceType: TranscriptionSourceType, sourceId: string): Promise<TranscriptionResult | null> {
    const transcription = await db.queryOne<{
      id: string;
      source_type: string;
      source_id: string;
      full_text: string;
      segments: string | null;
      language_detected: string | null;
      confidence: number;
      provider: string;
      duration: number;
      created_at: number;
    }>(
      'SELECT * FROM transcriptions WHERE source_type = $1 AND source_id = $2',
      [sourceType, sourceId]
    );

    if (!transcription) return null;

    return {
      id: transcription.id,
      sourceType: transcription.source_type as TranscriptionSourceType,
      sourceId: transcription.source_id,
      text: transcription.full_text,
      segments: transcription.segments ? JSON.parse(transcription.segments) : undefined,
      language: transcription.language_detected || undefined,
      confidence: transcription.confidence,
      provider: transcription.provider,
      duration: transcription.duration || 0,
      latencyMs: 0,
    };
  }

  /**
   * Process the transcription queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;

      this.activeJobs++;
      this.processJob(job).finally(() => {
        this.activeJobs--;
        this.processQueue();
      });
    }

    this.isProcessing = false;
  }

  /**
   * Process a single transcription job
   */
  private async processJob(job: TranscriptionJob): Promise<void> {
    job.status = 'processing';
    job.startedAt = Date.now();
    job.attempts++;

    this.updateJob(job);
    this.emit('started', job);

    const provider = this.getProvider(job.request.provider);

    if (!provider) {
      job.status = 'failed';
      job.error = 'No STT provider available';
      job.completedAt = Date.now();
      this.updateJob(job);
      this.emit('failed', job);
      return;
    }

    try {
      // Check if file exists
      if (!fs.existsSync(job.request.audioPath)) {
        throw new Error(`Audio file not found: ${job.request.audioPath}`);
      }

      const result = await provider.transcribeFile(job.request.audioPath, {
        language: job.request.language,
      });

      job.result = {
        id: job.id,
        sourceType: job.request.sourceType,
        sourceId: job.request.sourceId,
        text: result.text,
        segments: result.words,
        language: result.language,
        confidence: result.confidence,
        provider: provider.getName(),
        duration: result.duration,
        latencyMs: Date.now() - job.startedAt!,
      };

      job.status = 'completed';
      job.completedAt = Date.now();

      // Save transcription to database
      this.saveTranscription(job.result);

      // Update source record with transcription
      this.updateSourceWithTranscription(job.request.sourceType, job.request.sourceId, job.result);

      this.updateJob(job);
      this.emit('completed', job);

      // Call callback if provided
      if (job.request.callback) {
        job.request.callback(job.result);
      }

      logger.info(`Transcription completed: ${job.id} (${result.text.substring(0, 50)}...)`);
    } catch (error) {
      logger.error(`Transcription failed: ${job.id} - ${error}`);

      if (job.attempts < this.maxRetries) {
        // Retry with different provider
        job.status = 'pending';
        job.request.provider = this.getNextProvider(job.request.provider);
        this.queue.push(job);
        this.emit('retrying', job);
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Transcription failed';
        job.completedAt = Date.now();
        this.updateJob(job);
        this.emit('failed', job);
      }
    }
  }

  /**
   * Get an STT provider
   */
  private getProvider(preferred?: STTProviderType): STTProvider | null {
    if (preferred) {
      const provider = getSTTProvider(preferred);
      if (provider) return provider;
    }

    // Try preferred provider
    const preferredProvider = getSTTProvider(this.preferredProvider);
    if (preferredProvider) return preferredProvider;

    // Fallback to any available provider
    const allProviders = getAllSTTProviders();
    return allProviders.length > 0 ? allProviders[0] : null;
  }

  /**
   * Get next provider for retry
   */
  private getNextProvider(current?: STTProviderType): STTProviderType | undefined {
    const providers: STTProviderType[] = ['deepgram', 'whisper', 'assemblyai'];
    const currentIndex = current ? providers.indexOf(current) : -1;
    const nextIndex = (currentIndex + 1) % providers.length;
    return providers[nextIndex];
  }

  /**
   * Save job to database
   */
  private saveJob(job: TranscriptionJob): void {
    try {
      db.run(
        `INSERT OR REPLACE INTO transcription_jobs (
          id, source_type, source_id, audio_path, provider, language,
          status, attempts, result, error, created_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.id,
          job.request.sourceType,
          job.request.sourceId || null,
          job.request.audioPath,
          job.request.provider || null,
          job.request.language || null,
          job.status,
          job.attempts,
          job.result ? JSON.stringify(job.result) : null,
          job.error || null,
          job.createdAt,
          job.startedAt || null,
          job.completedAt || null,
        ]
      );
    } catch (error) {
      logger.error(`Failed to save transcription job: ${error}`);
    }
  }

  /**
   * Update job in database
   */
  private updateJob(job: TranscriptionJob): void {
    try {
      db.run(
        `UPDATE transcription_jobs SET
          status = ?, attempts = ?, result = ?, error = ?,
          started_at = ?, completed_at = ?
        WHERE id = ?`,
        [
          job.status,
          job.attempts,
          job.result ? JSON.stringify(job.result) : null,
          job.error || null,
          job.startedAt || null,
          job.completedAt || null,
          job.id,
        ]
      );
    } catch (error) {
      logger.error(`Failed to update transcription job: ${error}`);
    }
  }

  /**
   * Save transcription result to database
   */
  private saveTranscription(result: TranscriptionResult): void {
    try {
      db.run(
        `INSERT INTO transcriptions (
          id, source_type, source_id, full_text, segments,
          language_detected, confidence, provider, duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.id,
          result.sourceType,
          result.sourceId || null,
          result.text,
          result.segments ? JSON.stringify(result.segments) : null,
          result.language || null,
          result.confidence,
          result.provider,
          result.duration,
          Date.now(),
        ]
      );
    } catch (error) {
      logger.error(`Failed to save transcription: ${error}`);
    }
  }

  /**
   * Update source record with transcription reference
   */
  private updateSourceWithTranscription(
    sourceType: TranscriptionSourceType,
    sourceId: string | undefined,
    result: TranscriptionResult
  ): void {
    if (!sourceId) return;

    try {
      if (sourceType === 'recording') {
        db.run(
          'UPDATE recordings SET transcription_id = ?, transcription = ? WHERE id = ?',
          [result.id, result.text, sourceId]
        );
      } else if (sourceType === 'voicemail') {
        db.run(
          'UPDATE voicemails SET transcription_id = ?, transcription = ? WHERE id = ?',
          [result.id, result.text, sourceId]
        );
      }
    } catch (error) {
      logger.error(`Failed to update source with transcription: ${error}`);
    }
  }

  /**
   * Resume pending jobs from database
   */
  private async resumePendingJobs(): Promise<void> {
    try {
      const pendingJobs = await db.query<{
        id: string;
        source_type: string;
        source_id: string | null;
        audio_path: string;
        provider: string | null;
        language: string | null;
        attempts: number;
        created_at: number;
      }>(
        `SELECT * FROM transcription_jobs WHERE status IN ('pending', 'processing')
         ORDER BY created_at ASC`
      );

      for (const dbJob of pendingJobs) {
        const job: TranscriptionJob = {
          id: dbJob.id,
          request: {
            sourceType: dbJob.source_type as TranscriptionSourceType,
            sourceId: dbJob.source_id || undefined,
            audioPath: dbJob.audio_path,
            provider: dbJob.provider as STTProviderType | undefined,
            language: dbJob.language || undefined,
          },
          status: 'pending',
          attempts: dbJob.attempts,
          createdAt: dbJob.created_at,
        };

        this.queue.push(job);
      }

      if (pendingJobs.length > 0) {
        logger.info(`Resumed ${pendingJobs.length} pending transcription jobs`);
        this.processQueue();
      }
    } catch (error) {
      logger.error(`Failed to resume pending jobs: ${error}`);
    }
  }

  /**
   * Transcribe a recording by ID
   */
  async transcribeRecording(recordingId: string, options?: {
    provider?: STTProviderType;
    language?: string;
    priority?: 'high' | 'normal' | 'low';
  }): Promise<string> {
    // Get recording path from database
    const recording = await db.queryOne<{ file_path: string }>(
      'SELECT file_path FROM recordings WHERE id = $1',
      [recordingId]
    );

    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    return this.transcribe({
      sourceType: 'recording',
      sourceId: recordingId,
      audioPath: recording.file_path,
      provider: options?.provider,
      language: options?.language,
      priority: options?.priority,
    });
  }

  /**
   * Transcribe a voicemail by ID
   */
  async transcribeVoicemail(voicemailId: string, options?: {
    provider?: STTProviderType;
    language?: string;
    priority?: 'high' | 'normal' | 'low';
  }): Promise<string> {
    // Get voicemail path from database
    const voicemail = await db.queryOne<{ file_path: string }>(
      'SELECT file_path FROM voicemails WHERE id = $1',
      [voicemailId]
    );

    if (!voicemail) {
      throw new Error(`Voicemail not found: ${voicemailId}`);
    }

    return this.transcribe({
      sourceType: 'voicemail',
      sourceId: voicemailId,
      audioPath: voicemail.file_path,
      provider: options?.provider,
      language: options?.language,
      priority: options?.priority || 'high', // Voicemails are usually high priority
    });
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get active job count
   */
  getActiveJobCount(): number {
    return this.activeJobs;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let transcriptionServiceInstance: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService {
  if (!transcriptionServiceInstance) {
    transcriptionServiceInstance = new TranscriptionService();
  }
  return transcriptionServiceInstance;
}

export async function initializeTranscriptionService(): Promise<TranscriptionService> {
  const service = getTranscriptionService();
  await service.initialize();
  return service;
}
