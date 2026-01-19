import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

export interface WebSession {
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: number;
  createdAt: number;
}

interface SessionRow {
  id: string;
  user_id: number;
  refresh_token_hash: string;
  expires_at: Date | string | number;
  created_at: Date | string | number;
}

function rowToSession(row: SessionRow): WebSession {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash,
    expiresAt: typeof row.expires_at === 'object' ? Math.floor(new Date(row.expires_at).getTime() / 1000) :
      typeof row.expires_at === 'string' ? Math.floor(new Date(row.expires_at).getTime() / 1000) : row.expires_at,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
      typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
  };
}

export class SessionRepository {
  constructor(private db: DatabaseManager) { }

  async create(data: {
    userId: number;
    refreshTokenHash: string;
    expiresAt: number;
  }): Promise<WebSession> {
    const id = uuidv4();

    await this.db.run(
      `INSERT INTO web_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, data.userId, data.refreshTokenHash, data.expiresAt]
    );

    dbLogger.debug(`Session created for user ${data.userId}`);

    return {
      id,
      userId: data.userId,
      refreshTokenHash: data.refreshTokenHash,
      expiresAt: data.expiresAt,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async findById(id: string): Promise<WebSession | null> {
    const row = await this.db.get<SessionRow>(
      'SELECT * FROM web_sessions WHERE id = $1',
      [id]
    );
    return row ? rowToSession(row) : null;
  }

  async findByUserId(userId: number): Promise<WebSession[]> {
    const rows = await this.db.all<SessionRow>(
      'SELECT * FROM web_sessions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(rowToSession);
  }

  async findValidByUserId(userId: number): Promise<WebSession[]> {
    const rows = await this.db.all<SessionRow>(
      'SELECT * FROM web_sessions WHERE user_id = $1 AND expires_at > EXTRACT(EPOCH FROM NOW())::INTEGER ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(rowToSession);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM web_sessions WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async deleteByUserId(userId: number): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM web_sessions WHERE user_id = $1',
      [userId]
    );
    dbLogger.debug(`Deleted ${result.rowCount} sessions for user ${userId}`);
    return result.rowCount;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM web_sessions WHERE expires_at < EXTRACT(EPOCH FROM NOW())::INTEGER'
    );
    if (result.rowCount > 0) {
      dbLogger.debug(`Cleaned up ${result.rowCount} expired sessions`);
    }
    return result.rowCount;
  }

  async countByUserId(userId: number): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM web_sessions WHERE user_id = $1',
      [userId]
    );
    return result ? parseInt(result.count, 10) : 0;
  }
}
