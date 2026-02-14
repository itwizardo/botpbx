import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';

export interface CallRecording {
  id: string;
  callLogId: string | null;
  uniqueId: string;
  filePath: string;
  fileSize: number | null;
  durationSeconds: number | null;
  status: 'recording' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number | null;
}

export interface CreateCallRecordingInput {
  callLogId?: string;
  uniqueId?: string;
  filePath: string;
  durationSeconds?: number;
}

interface CallRecordingRow {
  id: string;
  call_log_id: string | null;
  unique_id: string;
  file_path: string;
  file_size: number | null;
  duration_seconds: number | null;
  status: string;
  started_at: Date | string | number;
  completed_at: Date | string | number | null;
  caller_id?: string;
  did?: string;
}

function timestampToNumber(value: Date | string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'object') return Math.floor(new Date(value).getTime() / 1000);
  if (typeof value === 'string') return Math.floor(new Date(value).getTime() / 1000);
  return value;
}

export class CallRecordingRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async create(input: CreateCallRecordingInput): Promise<CallRecording> {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const uniqueId = input.uniqueId || id;

    await this.db.run(`
      INSERT INTO call_recordings (id, call_log_id, unique_id, file_path, duration_seconds, status, started_at)
      VALUES ($1, $2, $3, $4, $5, 'recording', $6)
    `, [id, input.callLogId || null, uniqueId, input.filePath, input.durationSeconds || 0, now]);

    return {
      id,
      callLogId: input.callLogId || null,
      uniqueId,
      filePath: input.filePath,
      fileSize: null,
      durationSeconds: input.durationSeconds || 0,
      status: 'recording',
      startedAt: now,
      completedAt: null,
    };
  }

  async findById(id: string): Promise<CallRecording | null> {
    const row = await this.db.get<CallRecordingRow>('SELECT * FROM call_recordings WHERE id = $1', [id]);
    return row ? this.mapRow(row) : null;
  }

  async findByCallLogId(callLogId: string): Promise<CallRecording | null> {
    const row = await this.db.get<CallRecordingRow>('SELECT * FROM call_recordings WHERE call_log_id = $1', [callLogId]);
    return row ? this.mapRow(row) : null;
  }

  async findByUniqueId(uniqueId: string): Promise<CallRecording | null> {
    const row = await this.db.get<CallRecordingRow>('SELECT * FROM call_recordings WHERE unique_id = $1', [uniqueId]);
    return row ? this.mapRow(row) : null;
  }

  async findAll(limit = 100, offset = 0): Promise<CallRecording[]> {
    const rows = await this.db.all<CallRecordingRow>(`
      SELECT * FROM call_recordings
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return rows.map(row => this.mapRow(row));
  }

  async update(id: string, data: Partial<CallRecording>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.durationSeconds !== undefined) {
      fields.push(`duration_seconds = $${paramIndex++}`);
      values.push(data.durationSeconds);
    }
    if (data.fileSize !== undefined) {
      fields.push(`file_size = $${paramIndex++}`);
      values.push(data.fileSize);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.completedAt !== undefined) {
      fields.push(`completed_at = $${paramIndex++}`);
      values.push(data.completedAt);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.db.run(`UPDATE call_recordings SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
  }

  async complete(id: string, durationSeconds: number, fileSize?: number): Promise<void> {
    const completedAt = Math.floor(Date.now() / 1000);
    await this.db.run(`
      UPDATE call_recordings
      SET status = 'completed', duration_seconds = $1, file_size = $2, completed_at = $3
      WHERE id = $4
    `, [durationSeconds, fileSize || null, completedAt, id]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM call_recordings WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async findRecent(limit = 50, offset = 0): Promise<any[]> {
    const rows = await this.db.all<CallRecordingRow>(`
      SELECT
        r.id,
        r.file_path,
        r.duration_seconds,
        r.file_size,
        r.status,
        r.started_at,
        c.caller_id,
        c.did
      FROM call_recordings r
      LEFT JOIN call_logs c ON r.call_log_id = c.id
      WHERE r.status = 'completed'
      ORDER BY r.started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Map to frontend-friendly format with proper field names
    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      fileName: row.file_path ? row.file_path.split('/').pop() : 'Unknown',
      duration: row.duration_seconds || 0,
      fileSize: row.file_size || 0,
      status: row.status,
      createdAt: timestampToNumber(row.started_at),
      callerId: row.caller_id || 'Unknown',
      did: row.did || '',
    }));
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: string }>('SELECT COUNT(*) as count FROM call_recordings WHERE status = \'completed\'');
    return result ? parseInt(result.count, 10) : 0;
  }

  async getTotalSize(): Promise<number> {
    const result = await this.db.get<{ total: string }>('SELECT COALESCE(SUM(file_size), 0) as total FROM call_recordings');
    return result ? parseInt(result.total, 10) : 0;
  }

  async getTotalDuration(): Promise<number> {
    const result = await this.db.get<{ total: string }>('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM call_recordings');
    return result ? parseInt(result.total, 10) : 0;
  }

  private mapRow(row: CallRecordingRow): CallRecording {
    return {
      id: row.id,
      callLogId: row.call_log_id,
      uniqueId: row.unique_id,
      filePath: row.file_path,
      fileSize: row.file_size,
      durationSeconds: row.duration_seconds,
      status: row.status as CallRecording['status'],
      startedAt: timestampToNumber(row.started_at) || 0,
      completedAt: timestampToNumber(row.completed_at),
    };
  }
}
