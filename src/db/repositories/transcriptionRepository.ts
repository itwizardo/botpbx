import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// ==========================================
// TRANSCRIPTION INTERFACES
// ==========================================

export interface Transcription {
  id: string;
  sourceType: 'recording' | 'voicemail' | 'conversation';
  sourceId: string;
  fullText: string;
  segments: string | null;
  languageDetected: string | null;
  confidence: number | null;
  provider: string;
  processingTimeMs: number | null;
  wordCount: number | null;
  durationSeconds: number | null;
  summary: string | null;
  keywords: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  createdAt: number;
}

export interface CreateTranscriptionInput {
  sourceType: 'recording' | 'voicemail' | 'conversation';
  sourceId: string;
  fullText: string;
  segments?: string;
  languageDetected?: string;
  confidence?: number;
  provider: string;
  processingTimeMs?: number;
  wordCount?: number;
  durationSeconds?: number;
  summary?: string;
  keywords?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// ==========================================
// TRANSCRIPTION JOB INTERFACES
// ==========================================

export interface TranscriptionJob {
  id: string;
  sourceType: 'recording' | 'voicemail' | 'conversation';
  sourceId: string;
  audioPath: string;
  provider: string | null;
  language: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  transcriptionId: string | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface CreateJobInput {
  sourceType: 'recording' | 'voicemail' | 'conversation';
  sourceId: string;
  audioPath: string;
  provider?: string;
  language?: string;
  priority?: number;
}

// ==========================================
// ROW TYPES
// ==========================================

interface TranscriptionRow {
  id: string;
  source_type: string;
  source_id: string;
  full_text: string;
  segments: string | null;
  language_detected: string | null;
  confidence: number | null;
  provider: string;
  processing_time_ms: number | null;
  word_count: number | null;
  duration_seconds: number | null;
  summary: string | null;
  keywords: string | null;
  sentiment: string | null;
  created_at: Date | string;
}

interface JobRow {
  id: string;
  source_type: string;
  source_id: string;
  audio_path: string;
  provider: string | null;
  language: string;
  priority: number;
  status: string;
  attempts: number;
  max_attempts: number;
  transcription_id: string | null;
  error_message: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

function toTimestamp(val: Date | string | null): number | null {
  if (!val) return null;
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(val.getTime() / 1000);
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class TranscriptionRepository {
  constructor(private db: DatabaseManager) {}

  // ==========================================
  // TRANSCRIPTION METHODS
  // ==========================================

  async createTranscription(input: CreateTranscriptionInput): Promise<Transcription> {
    const id = uuidv4();

    await this.db.run(`
      INSERT INTO transcriptions (
        id, source_type, source_id, full_text, segments, language_detected,
        confidence, provider, processing_time_ms, word_count, duration_seconds,
        summary, keywords, sentiment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      id,
      input.sourceType,
      input.sourceId,
      input.fullText,
      input.segments || null,
      input.languageDetected || null,
      input.confidence || null,
      input.provider,
      input.processingTimeMs || null,
      input.wordCount || input.fullText.split(/\s+/).length,
      input.durationSeconds || null,
      input.summary || null,
      input.keywords || null,
      input.sentiment || null,
    ]);

    dbLogger.info(`Transcription created: ${id} for ${input.sourceType}:${input.sourceId}`);

    return {
      id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fullText: input.fullText,
      segments: input.segments || null,
      languageDetected: input.languageDetected || null,
      confidence: input.confidence || null,
      provider: input.provider,
      processingTimeMs: input.processingTimeMs || null,
      wordCount: input.wordCount || input.fullText.split(/\s+/).length,
      durationSeconds: input.durationSeconds || null,
      summary: input.summary || null,
      keywords: input.keywords || null,
      sentiment: input.sentiment || null,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async findTranscriptionById(id: string): Promise<Transcription | null> {
    const row = await this.db.get<TranscriptionRow>(
      'SELECT * FROM transcriptions WHERE id = $1',
      [id]
    );
    return row ? this.mapTranscriptionRow(row) : null;
  }

  async findTranscriptionBySource(
    sourceType: string,
    sourceId: string
  ): Promise<Transcription | null> {
    const row = await this.db.get<TranscriptionRow>(
      'SELECT * FROM transcriptions WHERE source_type = $1 AND source_id = $2',
      [sourceType, sourceId]
    );
    return row ? this.mapTranscriptionRow(row) : null;
  }

  async findTranscriptions(
    limit = 50,
    offset = 0,
    sourceType?: string
  ): Promise<Transcription[]> {
    let query = 'SELECT * FROM transcriptions';
    const params: any[] = [];

    if (sourceType) {
      query += ' WHERE source_type = $1';
      params.push(sourceType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const rows = await this.db.all<TranscriptionRow>(query, params);
    return rows.map(row => this.mapTranscriptionRow(row));
  }

  async searchTranscriptions(query: string, limit = 50): Promise<Transcription[]> {
    const rows = await this.db.all<TranscriptionRow>(`
      SELECT * FROM transcriptions
      WHERE full_text ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [`%${query}%`, limit]);
    return rows.map(row => this.mapTranscriptionRow(row));
  }

  async updateTranscriptionAnalysis(
    id: string,
    summary: string,
    keywords: string,
    sentiment: 'positive' | 'neutral' | 'negative'
  ): Promise<void> {
    await this.db.run(`
      UPDATE transcriptions
      SET summary = $1, keywords = $2, sentiment = $3
      WHERE id = $4
    `, [summary, keywords, sentiment, id]);
  }

  async deleteTranscription(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM transcriptions WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async countTranscriptions(sourceType?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM transcriptions';
    const params: any[] = [];

    if (sourceType) {
      query += ' WHERE source_type = $1';
      params.push(sourceType);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  // ==========================================
  // JOB QUEUE METHODS
  // ==========================================

  async createJob(input: CreateJobInput): Promise<TranscriptionJob> {
    const id = uuidv4();

    await this.db.run(`
      INSERT INTO transcription_jobs (
        id, source_type, source_id, audio_path, provider, language, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      id,
      input.sourceType,
      input.sourceId,
      input.audioPath,
      input.provider || null,
      input.language || 'en-US',
      input.priority || 0,
    ]);

    dbLogger.info(`Transcription job queued: ${id} for ${input.sourceType}:${input.sourceId}`);

    return {
      id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      audioPath: input.audioPath,
      provider: input.provider || null,
      language: input.language || 'en-US',
      priority: input.priority || 0,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      transcriptionId: null,
      errorMessage: null,
      createdAt: Math.floor(Date.now() / 1000),
      startedAt: null,
      completedAt: null,
    };
  }

  async findJobById(id: string): Promise<TranscriptionJob | null> {
    const row = await this.db.get<JobRow>(
      'SELECT * FROM transcription_jobs WHERE id = $1',
      [id]
    );
    return row ? this.mapJobRow(row) : null;
  }

  async findJobBySource(
    sourceType: string,
    sourceId: string
  ): Promise<TranscriptionJob | null> {
    const row = await this.db.get<JobRow>(
      'SELECT * FROM transcription_jobs WHERE source_type = $1 AND source_id = $2 ORDER BY created_at DESC LIMIT 1',
      [sourceType, sourceId]
    );
    return row ? this.mapJobRow(row) : null;
  }

  async getNextPendingJob(): Promise<TranscriptionJob | null> {
    // Get highest priority pending job that hasn't exceeded max attempts
    const row = await this.db.get<JobRow>(`
      SELECT * FROM transcription_jobs
      WHERE status = 'pending' AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);
    return row ? this.mapJobRow(row) : null;
  }

  async getPendingJobsCount(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM transcription_jobs WHERE status = \'pending\''
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async markJobProcessing(id: string): Promise<void> {
    await this.db.run(`
      UPDATE transcription_jobs
      SET status = 'processing', started_at = NOW(), attempts = attempts + 1
      WHERE id = $1
    `, [id]);
  }

  async markJobCompleted(id: string, transcriptionId: string): Promise<void> {
    await this.db.run(`
      UPDATE transcription_jobs
      SET status = 'completed', completed_at = NOW(), transcription_id = $1
      WHERE id = $2
    `, [transcriptionId, id]);
    dbLogger.info(`Transcription job completed: ${id}`);
  }

  async markJobFailed(id: string, errorMessage: string): Promise<void> {
    // Check if we should retry or mark as permanently failed
    const job = await this.findJobById(id);
    if (!job) return;

    const newStatus = job.attempts >= job.maxAttempts ? 'failed' : 'pending';

    await this.db.run(`
      UPDATE transcription_jobs
      SET status = $1, error_message = $2, completed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE NULL END
      WHERE id = $3
    `, [newStatus, errorMessage, id]);

    if (newStatus === 'failed') {
      dbLogger.error(`Transcription job failed permanently: ${id} - ${errorMessage}`);
    } else {
      dbLogger.warn(`Transcription job will retry: ${id} (attempt ${job.attempts}/${job.maxAttempts})`);
    }
  }

  async getJobStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const result = await this.db.all<{ status: string; count: string }>(`
      SELECT status, COUNT(*) as count
      FROM transcription_jobs
      GROUP BY status
    `);

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of result) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = parseInt(row.count, 10);
      }
    }
    return stats;
  }

  async deleteOldCompletedJobs(daysOld: number): Promise<number> {
    const result = await this.db.run(`
      DELETE FROM transcription_jobs
      WHERE status = 'completed'
        AND completed_at < NOW() - INTERVAL '${daysOld} days'
    `);
    return result.rowCount;
  }

  // ==========================================
  // MAPPING HELPERS
  // ==========================================

  private mapTranscriptionRow(row: TranscriptionRow): Transcription {
    return {
      id: row.id,
      sourceType: row.source_type as Transcription['sourceType'],
      sourceId: row.source_id,
      fullText: row.full_text,
      segments: row.segments,
      languageDetected: row.language_detected,
      confidence: row.confidence,
      provider: row.provider,
      processingTimeMs: row.processing_time_ms,
      wordCount: row.word_count,
      durationSeconds: row.duration_seconds,
      summary: row.summary,
      keywords: row.keywords,
      sentiment: row.sentiment as Transcription['sentiment'],
      createdAt: toTimestamp(row.created_at) || 0,
    };
  }

  private mapJobRow(row: JobRow): TranscriptionJob {
    return {
      id: row.id,
      sourceType: row.source_type as TranscriptionJob['sourceType'],
      sourceId: row.source_id,
      audioPath: row.audio_path,
      provider: row.provider,
      language: row.language,
      priority: row.priority,
      status: row.status as TranscriptionJob['status'],
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      transcriptionId: row.transcription_id,
      errorMessage: row.error_message,
      createdAt: toTimestamp(row.created_at) || 0,
      startedAt: toTimestamp(row.started_at),
      completedAt: toTimestamp(row.completed_at),
    };
  }
}
