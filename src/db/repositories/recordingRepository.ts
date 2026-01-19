import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

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

interface RecordingRow {
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

function rowToRecording(row: RecordingRow): CallRecording {
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

export class RecordingRepository {
  constructor(private db: DatabaseManager) { }

  async create(data: {
    callLogId?: string;
    uniqueId: string;
    filePath: string;
  }): Promise<CallRecording> {
    const id = uuidv4();
    const startedAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO call_recordings (id, call_log_id, unique_id, file_path, status, started_at)
       VALUES ($1, $2, $3, $4, 'recording', NOW())`,
      [id, data.callLogId || null, data.uniqueId, data.filePath]
    );

    dbLogger.debug(`Recording started: ${id} for call ${data.uniqueId}`);

    return {
      id,
      callLogId: data.callLogId || null,
      uniqueId: data.uniqueId,
      filePath: data.filePath,
      fileSize: null,
      durationSeconds: null,
      status: 'recording',
      startedAt,
      completedAt: null,
    };
  }

  async findById(id: string): Promise<CallRecording | null> {
    const row = await this.db.get<RecordingRow>(
      'SELECT * FROM call_recordings WHERE id = $1',
      [id]
    );
    return row ? rowToRecording(row) : null;
  }

  async findByUniqueId(uniqueId: string): Promise<CallRecording | null> {
    const row = await this.db.get<RecordingRow>(
      'SELECT * FROM call_recordings WHERE unique_id = $1',
      [uniqueId]
    );
    return row ? rowToRecording(row) : null;
  }

  async findByCallLogId(callLogId: string): Promise<CallRecording | null> {
    const row = await this.db.get<RecordingRow>(
      'SELECT * FROM call_recordings WHERE call_log_id = $1',
      [callLogId]
    );
    return row ? rowToRecording(row) : null;
  }

  async findRecent(limit: number = 50, offset: number = 0): Promise<any[]> {
    const rows = await this.db.all<RecordingRow>(
      `SELECT
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
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    // Map to frontend-friendly format
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

  async findByTimeRange(startTimestamp: number, endTimestamp: number): Promise<CallRecording[]> {
    const rows = await this.db.all<RecordingRow>(
      'SELECT * FROM call_recordings WHERE started_at >= $1 AND started_at <= $2 ORDER BY started_at DESC',
      [startTimestamp, endTimestamp]
    );
    return rows.map(rowToRecording);
  }

  async findInProgress(): Promise<CallRecording[]> {
    const rows = await this.db.all<RecordingRow>(
      'SELECT * FROM call_recordings WHERE status = \'recording\' ORDER BY started_at DESC'
    );
    return rows.map(rowToRecording);
  }

  async complete(id: string, data: {
    fileSize: number;
    durationSeconds: number;
  }): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE call_recordings
       SET status = 'completed', file_size = $1, duration_seconds = $2, completed_at = NOW()
       WHERE id = $3`,
      [data.fileSize, data.durationSeconds, id]
    );

    if (result.rowCount > 0) {
      dbLogger.debug(`Recording completed: ${id}`);
    }
    return result.rowCount > 0;
  }

  async markFailed(id: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE call_recordings SET status = 'failed', completed_at = NOW() WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }

  async updateCallLogId(id: string, callLogId: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE call_recordings SET call_log_id = $1 WHERE id = $2',
      [callLogId, id]
    );
    return result.rowCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM call_recordings WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async deleteOlderThan(days: number): Promise<number> {
    const result = await this.db.run(
      `DELETE FROM call_recordings WHERE started_at < NOW() - INTERVAL '${days} days'`
    );
    if (result.rowCount > 0) {
      dbLogger.info(`Deleted ${result.rowCount} old recordings from database`);
    }
    return result.rowCount;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM call_recordings WHERE status = \'completed\''
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async getTotalSize(): Promise<number> {
    const result = await this.db.get<{ total: string }>(
      'SELECT COALESCE(SUM(file_size), 0) as total FROM call_recordings WHERE status = \'completed\''
    );
    return result ? parseInt(result.total, 10) : 0;
  }

  async getTotalDuration(): Promise<number> {
    const result = await this.db.get<{ total: string }>(
      'SELECT COALESCE(SUM(duration_seconds), 0) as total FROM call_recordings WHERE status = \'completed\''
    );
    return result ? parseInt(result.total, 10) : 0;
  }
}
