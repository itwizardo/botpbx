import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface PositionAnnounceVariation {
  min: number;
  max: number | null;  // null means "and above"
  template: string;
}

export interface PositionAnnounceConfig {
  ranges: PositionAnnounceVariation[];
  includeWaitTime: boolean;
  waitTimeFormat: string;  // e.g., "{minutes} minutes"
}

export interface Queue {
  id: string;
  name: string;
  strategy: 'ringall' | 'hunt' | 'random' | 'roundrobin' | 'leastrecent';
  timeoutSeconds: number;
  retrySeconds: number;
  maxWaitTime: number;
  holdMusicPromptId: string | null;
  joinAnnouncementId: string | null;
  announceFrequency: number;
  announcePosition: number;
  // Dynamic TTS position announcements
  positionAnnounceEnabled: boolean;
  positionAnnounceVoice: string | null;
  positionAnnounceProvider: string;
  positionAnnounceLanguage: string;
  positionAnnounceInterval: number;
  positionAnnounceVariations: PositionAnnounceConfig | null;
  enabled: boolean;
  createdAt: number;
  members?: QueueMember[];
  memberCount?: number;
}

export interface QueueMember {
  id: string;
  queueId: string;
  extensionNumber: string;
  extensionName?: string;
  penalty: number;
  paused: boolean;
  createdAt: number;
}

interface QueueRow {
  id: string;
  name: string;
  strategy: string;
  timeout_seconds: number;
  retry_seconds: number;
  max_wait_time: number;
  hold_music_prompt_id: string | null;
  join_announcement_id: string | null;
  announce_frequency: number;
  announce_position: number;
  // Dynamic TTS position announcements
  position_announce_enabled: number;  // SQLite boolean
  position_announce_voice: string | null;
  position_announce_provider: string;
  position_announce_language: string;
  position_announce_interval: number;
  position_announce_variations: string | null;  // JSON string
  enabled: boolean;
  created_at: Date | string | number;
  tenant_id: string;
}

interface QueueMemberRow {
  id: string;
  queue_id: string;
  extension_number: string;
  extension_name?: string;
  penalty: number;
  paused: boolean;
  created_at: Date | string | number;
}

function rowToQueue(row: QueueRow): Queue & { tenantId: string } {
  // Parse position announce variations from JSON
  let variations: PositionAnnounceConfig | null = null;
  if (row.position_announce_variations) {
    try {
      variations = JSON.parse(row.position_announce_variations);
    } catch {
      variations = null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy as Queue['strategy'],
    timeoutSeconds: row.timeout_seconds,
    retrySeconds: row.retry_seconds,
    maxWaitTime: row.max_wait_time,
    holdMusicPromptId: row.hold_music_prompt_id,
    joinAnnouncementId: row.join_announcement_id,
    announceFrequency: row.announce_frequency,
    announcePosition: row.announce_position,
    positionAnnounceEnabled: Boolean(row.position_announce_enabled),
    positionAnnounceVoice: row.position_announce_voice,
    positionAnnounceProvider: row.position_announce_provider || 'elevenlabs',
    positionAnnounceLanguage: row.position_announce_language || 'en',
    positionAnnounceInterval: row.position_announce_interval || 60,
    positionAnnounceVariations: variations,
    enabled: row.enabled,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
               typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
    tenantId: row.tenant_id,
  };
}

function rowToMember(row: QueueMemberRow): QueueMember {
  return {
    id: row.id,
    queueId: row.queue_id,
    extensionNumber: row.extension_number,
    extensionName: row.extension_name,
    penalty: row.penalty,
    paused: row.paused,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
               typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
  };
}

export class QueueRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new queue
   * @param queue Queue data
   * @param tenantId Tenant ID (required for multi-tenant)
   */
  async create(queue: Omit<Queue, 'id' | 'createdAt' | 'members' | 'memberCount'>, tenantId: string = 'default'): Promise<Queue & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO queues (id, name, strategy, timeout_seconds, retry_seconds, max_wait_time,
       hold_music_prompt_id, join_announcement_id, announce_frequency, announce_position,
       position_announce_enabled, position_announce_voice, position_announce_provider,
       position_announce_language, position_announce_interval, position_announce_variations,
       enabled, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        id,
        queue.name,
        queue.strategy,
        queue.timeoutSeconds,
        queue.retrySeconds,
        queue.maxWaitTime,
        queue.holdMusicPromptId,
        queue.joinAnnouncementId,
        queue.announceFrequency,
        queue.announcePosition,
        queue.positionAnnounceEnabled ? 1 : 0,
        queue.positionAnnounceVoice,
        queue.positionAnnounceProvider,
        queue.positionAnnounceLanguage,
        queue.positionAnnounceInterval,
        queue.positionAnnounceVariations ? JSON.stringify(queue.positionAnnounceVariations) : null,
        queue.enabled ? 1 : 0,
        createdAt,
        tenantId,
      ]
    );

    dbLogger.info(`Queue created: ${queue.name} (${id}) for tenant ${tenantId}`);

    return {
      id,
      ...queue,
      createdAt,
      tenantId,
    };
  }

  /**
   * Find queue by ID
   * @param id Queue ID
   * @param tenantId Tenant ID (optional)
   */
  async findById(id: string, tenantId?: string): Promise<(Queue & { tenantId: string }) | null> {
    let query = 'SELECT * FROM queues WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<QueueRow>(query, params);

    if (!row) return null;

    const queue = rowToQueue(row);
    queue.members = await this.getMembers(id);
    queue.memberCount = queue.members.length;
    return queue;
  }

  /**
   * Find queue by name
   * @param name Queue name
   * @param tenantId Tenant ID (optional)
   */
  async findByName(name: string, tenantId?: string): Promise<(Queue & { tenantId: string }) | null> {
    let query = 'SELECT * FROM queues WHERE name = $1';
    const params: unknown[] = [name];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<QueueRow>(query, params);

    if (!row) return null;

    const queue = rowToQueue(row);
    queue.members = await this.getMembers(row.id);
    queue.memberCount = queue.members.length;
    return queue;
  }

  /**
   * Find all queues
   * @param tenantId Tenant ID (optional)
   */
  async findAll(tenantId?: string): Promise<(Queue & { tenantId: string })[]> {
    let query = 'SELECT * FROM queues';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY name';

    const rows = await this.db.all<QueueRow>(query, params);

    const results: (Queue & { tenantId: string })[] = [];
    for (const row of rows) {
      const queue = rowToQueue(row);
      queue.members = await this.getMembers(row.id);
      queue.memberCount = queue.members.length;
      results.push(queue);
    }
    return results;
  }

  /**
   * Find all enabled queues
   * @param tenantId Tenant ID (optional)
   */
  async findAllEnabled(tenantId?: string): Promise<(Queue & { tenantId: string })[]> {
    let query = 'SELECT * FROM queues WHERE enabled = 1';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' AND tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY name';

    const rows = await this.db.all<QueueRow>(query, params);

    const results: (Queue & { tenantId: string })[] = [];
    for (const row of rows) {
      const queue = rowToQueue(row);
      queue.members = await this.getMembers(row.id);
      queue.memberCount = queue.members.length;
      results.push(queue);
    }
    return results;
  }

  /**
   * Update a queue
   * @param id Queue ID
   * @param updates Fields to update
   * @param tenantId Tenant ID (required for security)
   */
  async update(id: string, updates: Partial<Omit<Queue, 'id' | 'createdAt' | 'members' | 'memberCount'>>, tenantId?: string): Promise<(Queue & { tenantId: string }) | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.strategy !== undefined) {
      fields.push(`strategy = $${paramIndex++}`);
      values.push(updates.strategy);
    }
    if (updates.timeoutSeconds !== undefined) {
      fields.push(`timeout_seconds = $${paramIndex++}`);
      values.push(updates.timeoutSeconds);
    }
    if (updates.retrySeconds !== undefined) {
      fields.push(`retry_seconds = $${paramIndex++}`);
      values.push(updates.retrySeconds);
    }
    if (updates.maxWaitTime !== undefined) {
      fields.push(`max_wait_time = $${paramIndex++}`);
      values.push(updates.maxWaitTime);
    }
    if (updates.holdMusicPromptId !== undefined) {
      fields.push(`hold_music_prompt_id = $${paramIndex++}`);
      values.push(updates.holdMusicPromptId);
    }
    if (updates.joinAnnouncementId !== undefined) {
      fields.push(`join_announcement_id = $${paramIndex++}`);
      values.push(updates.joinAnnouncementId);
    }
    if (updates.announceFrequency !== undefined) {
      fields.push(`announce_frequency = $${paramIndex++}`);
      values.push(updates.announceFrequency);
    }
    if (updates.announcePosition !== undefined) {
      fields.push(`announce_position = $${paramIndex++}`);
      values.push(updates.announcePosition);
    }
    // Position announcement fields
    if (updates.positionAnnounceEnabled !== undefined) {
      fields.push(`position_announce_enabled = $${paramIndex++}`);
      values.push(updates.positionAnnounceEnabled ? 1 : 0);
    }
    if (updates.positionAnnounceVoice !== undefined) {
      fields.push(`position_announce_voice = $${paramIndex++}`);
      values.push(updates.positionAnnounceVoice);
    }
    if (updates.positionAnnounceProvider !== undefined) {
      fields.push(`position_announce_provider = $${paramIndex++}`);
      values.push(updates.positionAnnounceProvider);
    }
    if (updates.positionAnnounceLanguage !== undefined) {
      fields.push(`position_announce_language = $${paramIndex++}`);
      values.push(updates.positionAnnounceLanguage);
    }
    if (updates.positionAnnounceInterval !== undefined) {
      fields.push(`position_announce_interval = $${paramIndex++}`);
      values.push(updates.positionAnnounceInterval);
    }
    if (updates.positionAnnounceVariations !== undefined) {
      fields.push(`position_announce_variations = $${paramIndex++}`);
      values.push(updates.positionAnnounceVariations ? JSON.stringify(updates.positionAnnounceVariations) : null);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled ? 1 : 0);
    }

    if (fields.length > 0) {
      let query = `UPDATE queues SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
      values.push(id);

      if (tenantId) {
        query += ` AND tenant_id = $${paramIndex}`;
        values.push(tenantId);
      }

      await this.db.run(query, values);
      dbLogger.info(`Queue updated: ${id}`);
    }

    return this.findById(id, tenantId);
  }

  /**
   * Delete a queue
   * @param id Queue ID
   * @param tenantId Tenant ID (required for security)
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM queues WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Queue deleted: ${id}`);
      return true;
    }
    return false;
  }

  // Member management
  async getMembers(queueId: string): Promise<QueueMember[]> {
    const rows = await this.db.all<QueueMemberRow>(
      `SELECT m.*, e.name as extension_name
       FROM queue_members m
       LEFT JOIN extensions e ON m.extension_number = e.number
       WHERE m.queue_id = $1
       ORDER BY m.penalty, m.extension_number`,
      [queueId]
    );

    return rows.map(rowToMember);
  }

  async addMember(queueId: string, extensionNumber: string, penalty: number = 0): Promise<QueueMember | null> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    try {
      await this.db.run(
        `INSERT INTO queue_members (id, queue_id, extension_number, penalty, paused, created_at)
         VALUES ($1, $2, $3, $4, 0, $5)`,
        [id, queueId, extensionNumber, penalty, createdAt]
      );

      dbLogger.info(`Added extension ${extensionNumber} to queue ${queueId}`);

      return {
        id,
        queueId,
        extensionNumber,
        penalty,
        paused: false,
        createdAt,
      };
    } catch (error) {
      dbLogger.error(`Failed to add member to queue: ${error}`);
      return null;
    }
  }

  async removeMember(queueId: string, extensionNumber: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM queue_members WHERE queue_id = $1 AND extension_number = $2',
      [queueId, extensionNumber]
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Removed extension ${extensionNumber} from queue ${queueId}`);
      return true;
    }
    return false;
  }

  async pauseMember(queueId: string, extensionNumber: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE queue_members SET paused = 1 WHERE queue_id = $1 AND extension_number = $2',
      [queueId, extensionNumber]
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Paused extension ${extensionNumber} in queue ${queueId}`);
      return true;
    }
    return false;
  }

  async unpauseMember(queueId: string, extensionNumber: string): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE queue_members SET paused = 0 WHERE queue_id = $1 AND extension_number = $2',
      [queueId, extensionNumber]
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Unpaused extension ${extensionNumber} in queue ${queueId}`);
      return true;
    }
    return false;
  }

  async updateMemberPenalty(queueId: string, extensionNumber: string, penalty: number): Promise<boolean> {
    const result = await this.db.run(
      'UPDATE queue_members SET penalty = $1 WHERE queue_id = $2 AND extension_number = $3',
      [penalty, queueId, extensionNumber]
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Updated penalty for ${extensionNumber} in queue ${queueId} to ${penalty}`);
      return true;
    }
    return false;
  }

  async setMembers(queueId: string, members: { extensionNumber: string; penalty: number }[]): Promise<void> {
    await this.db.transaction(async () => {
      // Remove existing members
      await this.db.run('DELETE FROM queue_members WHERE queue_id = $1', [queueId]);

      // Add new members
      for (const member of members) {
        const id = uuidv4();
        const memberCreatedAt = Math.floor(Date.now() / 1000);
        await this.db.run(
          `INSERT INTO queue_members (id, queue_id, extension_number, penalty, paused, created_at)
           VALUES ($1, $2, $3, $4, 0, $5)`,
          [id, queueId, member.extensionNumber, member.penalty, memberCreatedAt]
        );
      }
    });

    dbLogger.info(`Set ${members.length} members for queue ${queueId}`);
  }

  // Get queue stats (for dashboard/monitoring)
  async getStats(queueId: string): Promise<{ totalMembers: number; pausedMembers: number; activeMembers: number }> {
    const members = await this.getMembers(queueId);
    const pausedCount = members.filter(m => m.paused).length;

    return {
      totalMembers: members.length,
      pausedMembers: pausedCount,
      activeMembers: members.length - pausedCount,
    };
  }
}
