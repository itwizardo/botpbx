import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { CallLog, CallStats, DailyStats } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface CallLogRow {
  id: string;
  caller_id: string | null;
  did: string | null;
  timestamp: Date | string;
  ivr_menu_id: string | null;
  options_pressed: string | null;
  final_destination: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  unique_id: string | null;
  tenant_id: string;
}

function toTimestamp(val: Date | string): number {
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(val.getTime() / 1000);
}

function rowToCallLog(row: CallLogRow): CallLog & { tenantId: string } {
  return {
    id: row.id,
    callerId: row.caller_id,
    did: row.did,
    timestamp: toTimestamp(row.timestamp),
    ivrMenuId: row.ivr_menu_id,
    optionsPressed: row.options_pressed || '',
    finalDestination: row.final_destination,
    durationSeconds: row.duration_seconds,
    disposition: row.disposition,
    uniqueId: row.unique_id || '',
    tenantId: row.tenant_id,
  };
}

export class CallLogRepository {
  constructor(private db: DatabaseManager) { }

  /**
   * Create a new call log entry
   * @param log Call log data
   * @param tenantId Tenant ID (required for multi-tenant)
   */
  async create(log: Omit<CallLog, 'id' | 'timestamp'>, tenantId: string = 'default'): Promise<CallLog & { tenantId: string }> {
    const id = uuidv4();
    const timestamp = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO call_logs (id, caller_id, did, timestamp, ivr_menu_id, options_pressed, final_destination, duration_seconds, disposition, unique_id, tenant_id)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        log.callerId,
        log.did,
        log.ivrMenuId,
        log.optionsPressed,
        log.finalDestination,
        log.durationSeconds,
        log.disposition,
        log.uniqueId,
        tenantId,
      ]
    );

    dbLogger.debug(`Call log created: ${id} for tenant ${tenantId}`);

    return {
      id,
      ...log,
      timestamp,
      tenantId,
    };
  }

  /**
   * Get a call log by ID
   * @param id Call log ID
   * @param tenantId Tenant ID (optional - if not provided, searches all tenants)
   */
  async findById(id: string, tenantId?: string): Promise<(CallLog & { tenantId: string }) | null> {
    let query = 'SELECT * FROM call_logs WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<CallLogRow>(query, params);
    return row ? rowToCallLog(row) : null;
  }

  /**
   * Get a call log by Asterisk unique ID
   * @param uniqueId Asterisk unique ID
   * @param tenantId Tenant ID (optional)
   */
  async findByUniqueId(uniqueId: string, tenantId?: string): Promise<(CallLog & { tenantId: string }) | null> {
    let query = 'SELECT * FROM call_logs WHERE unique_id = $1';
    const params: unknown[] = [uniqueId];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<CallLogRow>(query, params);
    return row ? rowToCallLog(row) : null;
  }

  /**
   * Update a call log (e.g., when call ends)
   */
  async update(id: string, updates: Partial<Omit<CallLog, 'id' | 'timestamp'>>): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.optionsPressed !== undefined) {
      fields.push(`options_pressed = $${paramIndex++}`);
      values.push(updates.optionsPressed);
    }
    if (updates.finalDestination !== undefined) {
      fields.push(`final_destination = $${paramIndex++}`);
      values.push(updates.finalDestination);
    }
    if (updates.durationSeconds !== undefined) {
      fields.push(`duration_seconds = $${paramIndex++}`);
      values.push(updates.durationSeconds);
    }
    if (updates.disposition !== undefined) {
      fields.push(`disposition = $${paramIndex++}`);
      values.push(updates.disposition);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = await this.db.run(
      `UPDATE call_logs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  }

  /**
   * Get recent calls with pagination
   * @param limit Number of records to return
   * @param offset Offset for pagination
   * @param tenantId Tenant ID (optional)
   */
  async findRecent(limit: number = 10, offset: number = 0, tenantId?: string): Promise<(CallLog & { tenantId: string })[]> {
    let query = 'SELECT * FROM call_logs';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const rows = await this.db.all<CallLogRow>(query, params);
    return rows.map(rowToCallLog);
  }

  /**
   * Get calls within a time range
   * @param startTimestamp Start timestamp
   * @param endTimestamp End timestamp
   * @param tenantId Tenant ID (optional)
   */
  async findByTimeRange(startTimestamp: number, endTimestamp: number, tenantId?: string): Promise<(CallLog & { tenantId: string })[]> {
    let query = 'SELECT * FROM call_logs WHERE timestamp >= TO_TIMESTAMP($1) AND timestamp <= TO_TIMESTAMP($2)';
    const params: unknown[] = [startTimestamp, endTimestamp];

    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }

    query += ' ORDER BY timestamp DESC';

    const rows = await this.db.all<CallLogRow>(query, params);
    return rows.map(rowToCallLog);
  }

  /**
   * Get calls for today
   * @param tenantId Tenant ID (optional)
   */
  async findToday(tenantId?: string): Promise<(CallLog & { tenantId: string })[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = Math.floor(Date.now() / 1000);
    return this.findByTimeRange(startTimestamp, endTimestamp, tenantId);
  }

  /**
   * Get statistics for a time range
   * @param startTimestamp Start timestamp
   * @param endTimestamp End timestamp
   * @param useUTC Use UTC timezone
   * @param tenantId Tenant ID (optional)
   */
  async getStats(startTimestamp: number, endTimestamp: number, useUTC: boolean = false, tenantId?: string): Promise<CallStats> {
    const calls = await this.findByTimeRange(startTimestamp, endTimestamp, tenantId);

    const stats: CallStats = {
      totalCalls: calls.length,
      answeredCalls: 0,
      abandonedCalls: 0,
      averageDuration: 0,
      callsByHour: {},
      callsByMenu: {},
      dtmfDistribution: {},
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const call of calls) {
      // Count by disposition
      if (call.disposition === 'ANSWERED') {
        stats.answeredCalls++;
      } else if (call.disposition === 'NO ANSWER' || call.disposition === 'BUSY') {
        stats.abandonedCalls++;
      }

      // Duration stats
      if (call.durationSeconds && call.durationSeconds > 0) {
        totalDuration += call.durationSeconds;
        durationCount++;
      }

      // Calls by hour (use UTC if specified to avoid timezone issues)
      const date = new Date(call.timestamp * 1000);
      const hour = useUTC ? date.getUTCHours() : date.getHours();
      stats.callsByHour[hour] = (stats.callsByHour[hour] || 0) + 1;

      // Calls by menu
      if (call.ivrMenuId) {
        stats.callsByMenu[call.ivrMenuId] = (stats.callsByMenu[call.ivrMenuId] || 0) + 1;
      }

      // DTMF distribution
      if (call.optionsPressed) {
        const options = call.optionsPressed.split(',').filter(Boolean);
        for (const opt of options) {
          stats.dtmfDistribution[opt] = (stats.dtmfDistribution[opt] || 0) + 1;
        }
      }
    }

    // Calculate average duration
    stats.averageDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    return stats;
  }

  /**
   * Get today's statistics (uses UTC)
   * @param tenantId Tenant ID (optional)
   */
  async getTodayStats(tenantId?: string): Promise<CallStats> {
    const now = new Date();
    // Use UTC to avoid timezone issues
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = Math.floor(Date.now() / 1000);
    return this.getStats(startTimestamp, endTimestamp, true, tenantId);
  }

  /**
   * Get today's statistics (original, uses local time)
   * @deprecated Use getTodayStats() instead
   * @param tenantId Tenant ID (optional)
   */
  async getTodayStatsLocal(tenantId?: string): Promise<CallStats> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return this.getStats(
      Math.floor(startOfDay.getTime() / 1000),
      Math.floor(Date.now() / 1000),
      false,
      tenantId
    );
  }

  /**
   * Get daily statistics for the last N days (uses UTC)
   * @param days Number of days
   * @param tenantId Tenant ID (optional)
   */
  async getDailyStats(days: number = 7, tenantId?: string): Promise<DailyStats[]> {
    const results: DailyStats[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      // Use UTC to avoid timezone issues
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const startTimestamp = Math.floor(date.getTime() / 1000);
      const endTimestamp = startTimestamp + 86400; // 24 hours

      const stats = await this.getStats(startTimestamp, endTimestamp, false, tenantId);
      results.push({
        date: date.toISOString().split('T')[0],
        totalCalls: stats.totalCalls,
        answeredCalls: stats.answeredCalls,
        abandonedCalls: stats.abandonedCalls,
        optionBreakdown: stats.dtmfDistribution,
      });
    }

    return results;
  }

  /**
   * Count total calls
   * @param tenantId Tenant ID (optional)
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM call_logs';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Delete old call logs (older than specified days)
   * @param days Days to keep
   * @param tenantId Tenant ID (optional - if not provided, deletes from all tenants)
   */
  async deleteOlderThan(days: number, tenantId?: string): Promise<number> {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - days * 86400;
    let query = 'DELETE FROM call_logs WHERE timestamp < TO_TIMESTAMP($1)';
    const params: unknown[] = [cutoffTimestamp];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Deleted ${result.rowCount} old call logs${tenantId ? ` for tenant ${tenantId}` : ''}`);
    }
    return result.rowCount;
  }
}
