import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// ==========================================
// VOICEMAIL INTERFACES
// ==========================================

export interface Voicemail {
  id: string;
  mailbox: string;
  callerId: string | null;
  callerName: string | null;
  durationSeconds: number | null;
  filePath: string;
  transcriptionId: string | null;
  read: boolean;
  notified: boolean;
  urgent: boolean;
  msgId: string | null;
  origDate: string | null;
  origTime: string | null;
  createdAt: number;
}

export interface CreateVoicemailInput {
  mailbox: string;
  callerId?: string;
  callerName?: string;
  durationSeconds?: number;
  filePath: string;
  transcriptionId?: string;
  urgent?: boolean;
  msgId?: string;
  origDate?: string;
  origTime?: string;
}

// ==========================================
// ROW TYPES
// ==========================================

interface VoicemailRow {
  id: string;
  mailbox: string;
  caller_id: string | null;
  caller_name: string | null;
  duration_seconds: number | null;
  file_path: string;
  transcription_id: string | null;
  read: boolean;
  notified: boolean;
  urgent: boolean;
  msg_id: string | null;
  origdate: string | null;
  origtime: string | null;
  created_at: Date | string;
}

function toTimestamp(val: Date | string | number | null): number | null {
  if (typeof val === 'number') return Math.floor(val);
  if (!val) return null;
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(val.getTime() / 1000);
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class VoicemailRepository {
  constructor(private db: DatabaseManager) {}

  async create(input: CreateVoicemailInput): Promise<Voicemail> {
    const id = uuidv4();

    await this.db.run(`
      INSERT INTO voicemails (
        id, mailbox, caller_id, caller_name, duration_seconds, file_path,
        transcription_id, urgent, msg_id, origdate, origtime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id,
      input.mailbox,
      input.callerId || null,
      input.callerName || null,
      input.durationSeconds || null,
      input.filePath,
      input.transcriptionId || null,
      input.urgent ?? false,
      input.msgId || null,
      input.origDate || null,
      input.origTime || null,
    ]);

    dbLogger.info(`Voicemail created: ${id} for mailbox ${input.mailbox}`);

    return {
      id,
      mailbox: input.mailbox,
      callerId: input.callerId || null,
      callerName: input.callerName || null,
      durationSeconds: input.durationSeconds || null,
      filePath: input.filePath,
      transcriptionId: input.transcriptionId || null,
      read: false,
      notified: false,
      urgent: input.urgent || false,
      msgId: input.msgId || null,
      origDate: input.origDate || null,
      origTime: input.origTime || null,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async findById(id: string): Promise<Voicemail | null> {
    const row = await this.db.get<VoicemailRow>(
      'SELECT * FROM voicemails WHERE id = $1',
      [id]
    );
    return row ? this.mapRow(row) : null;
  }

  async findByMailbox(
    mailbox: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ): Promise<Voicemail[]> {
    let query = 'SELECT * FROM voicemails WHERE mailbox = $1';
    const params: any[] = [mailbox];

    if (options?.unreadOnly) {
      query += ' AND read = false';
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const rows = await this.db.all<VoicemailRow>(query, params);
    return rows.map(row => this.mapRow(row));
  }

  async findRecent(limit = 50, offset = 0): Promise<Voicemail[]> {
    const rows = await this.db.all<VoicemailRow>(`
      SELECT * FROM voicemails
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return rows.map(row => this.mapRow(row));
  }

  async findUnread(limit = 50): Promise<Voicemail[]> {
    const rows = await this.db.all<VoicemailRow>(`
      SELECT * FROM voicemails
      WHERE read = false
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return rows.map(row => this.mapRow(row));
  }

  async findByMsgId(mailbox: string, msgId: string): Promise<Voicemail | null> {
    const row = await this.db.get<VoicemailRow>(
      'SELECT * FROM voicemails WHERE mailbox = $1 AND msg_id = $2',
      [mailbox, msgId]
    );
    return row ? this.mapRow(row) : null;
  }

  async markAsRead(id: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE voicemails SET read = true WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async markAsUnread(id: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE voicemails SET read = false WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async markAsNotified(id: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE voicemails SET notified = true WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async setTranscriptionId(id: string, transcriptionId: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE voicemails SET transcription_id = $1 WHERE id = $2',
      [transcriptionId, id]
    );
    return result.rowCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM voicemails WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async deleteByMailbox(mailbox: string): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM voicemails WHERE mailbox = $1',
      [mailbox]
    );
    return result.rowCount;
  }

  async count(mailbox?: string, unreadOnly?: boolean): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM voicemails';
    const params: any[] = [];
    const conditions: string[] = [];

    if (mailbox) {
      conditions.push(`mailbox = $${params.length + 1}`);
      params.push(mailbox);
    }

    if (unreadOnly) {
      conditions.push('read = false');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  async getUnreadCountByMailbox(): Promise<Map<string, number>> {
    const rows = await this.db.all<{ mailbox: string; count: string }>(`
      SELECT mailbox, COUNT(*) as count
      FROM voicemails
      WHERE read = false
      GROUP BY mailbox
    `);

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.mailbox, parseInt(row.count, 10));
    }
    return counts;
  }

  async getStats(): Promise<{
    total: number;
    unread: number;
    read: number;
    transcribed: number;
  }> {
    const result = await this.db.get<{
      total: string;
      unread: string;
      read: string;
      transcribed: string;
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE read = false) as unread,
        COUNT(*) FILTER (WHERE read = true) as read,
        COUNT(*) FILTER (WHERE transcription_id IS NOT NULL) as transcribed
      FROM voicemails
    `);

    return {
      total: result ? parseInt(result.total, 10) : 0,
      unread: result ? parseInt(result.unread, 10) : 0,
      read: result ? parseInt(result.read, 10) : 0,
      transcribed: result ? parseInt(result.transcribed, 10) : 0,
    };
  }

  async deleteOldVoicemails(daysOld: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - (daysOld * 86400);
    const result = await this.db.run(`
      DELETE FROM voicemails
      WHERE created_at < $1
    `, [cutoff]);
    return result.rowCount;
  }

  private mapRow(row: VoicemailRow): Voicemail {
    return {
      id: row.id,
      mailbox: row.mailbox,
      callerId: row.caller_id,
      callerName: row.caller_name,
      durationSeconds: row.duration_seconds,
      filePath: row.file_path,
      transcriptionId: row.transcription_id,
      read: row.read,
      notified: row.notified,
      urgent: row.urgent,
      msgId: row.msg_id,
      origDate: row.origdate,
      origTime: row.origtime,
      createdAt: toTimestamp(row.created_at) || 0,
    };
  }
}
