import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { DialerCampaign, CampaignStatus, CampaignHandlerType } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  handler_type: string | null;
  ivr_menu_id: string | null;
  ai_agent_id: string | null;
  ring_group_id: string | null;
  target_extensions: string | null;
  hold_music_prompt_id: string | null;
  trunk_id: string | null;
  transfer_trunk_id: string | null;
  transfer_destination: string | null;
  transfer_mode: string | null;
  caller_id: string | null;
  calls_per_minute: number;
  max_concurrent: number;
  retry_attempts: number;
  retry_delay_minutes: number;
  total_contacts: number;
  dialed_count: number;
  answered_count: number;
  press1_count: number;
  connected_count: number;
  answering_machine_count: number;
  amd_enabled: boolean;
  tenant_id: string;
  created_at: Date | string | number;
  started_at: Date | string | number | null;
  completed_at: Date | string | number | null;
}

function toTimestamp(val: Date | string | number | null): number | null {
  if (!val) return null;
  if (typeof val === 'number') return Math.floor(val);
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  if (val instanceof Date) return Math.floor(val.getTime() / 1000);
  return null;
}

function rowToCampaign(row: CampaignRow): DialerCampaign & { tenantId: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as CampaignStatus,
    handlerType: (row.handler_type || 'ivr') as CampaignHandlerType,
    ivrMenuId: row.ivr_menu_id,
    aiAgentId: row.ai_agent_id,
    ringGroupId: row.ring_group_id,
    targetExtensions: row.target_extensions,
    holdMusicPromptId: row.hold_music_prompt_id,
    trunkId: row.trunk_id,
    transferTrunkId: row.transfer_trunk_id,
    transferDestination: row.transfer_destination,
    transferMode: (row.transfer_mode || 'internal') as 'internal' | 'trunk',
    callerId: row.caller_id,
    callsPerMinute: row.calls_per_minute,
    maxConcurrent: row.max_concurrent,
    retryAttempts: row.retry_attempts,
    retryDelayMinutes: row.retry_delay_minutes,
    totalContacts: row.total_contacts,
    dialedCount: row.dialed_count,
    answeredCount: row.answered_count,
    press1Count: row.press1_count,
    connectedCount: row.connected_count,
    answeringMachineCount: row.answering_machine_count || 0,
    amdEnabled: !!row.amd_enabled,
    tenantId: row.tenant_id,
    createdAt: toTimestamp(row.created_at) || Math.floor(Date.now() / 1000),
    startedAt: toTimestamp(row.started_at),
    completedAt: toTimestamp(row.completed_at),
  };
}

export class DialerCampaignRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new campaign
   */
  async create(campaign: Omit<DialerCampaign, 'id' | 'createdAt' | 'totalContacts' | 'dialedCount' | 'answeredCount' | 'press1Count' | 'connectedCount' | 'answeringMachineCount' | 'startedAt' | 'completedAt'>, tenantId: string = 'default'): Promise<DialerCampaign & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000); // Unix timestamp for INTEGER column

    await this.db.run(
      `INSERT INTO dialer_campaigns (
        id, name, description, status, handler_type, ivr_menu_id, ai_agent_id, ring_group_id,
        target_extensions, trunk_id, caller_id, calls_per_minute, max_concurrent, retry_attempts,
        retry_delay_minutes, amd_enabled, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        campaign.name,
        campaign.description || null,
        campaign.status || 'paused',
        campaign.handlerType || 'ivr',
        campaign.ivrMenuId || null,
        campaign.aiAgentId || null,
        campaign.ringGroupId || null,
        campaign.targetExtensions || null,
        campaign.trunkId || null,
        campaign.callerId || null,
        campaign.callsPerMinute || 10,
        campaign.maxConcurrent || 10,
        campaign.retryAttempts || 3,
        campaign.retryDelayMinutes || 30,
        campaign.amdEnabled !== false,
        tenantId,
        createdAt,
      ]
    );

    dbLogger.info(`Campaign created: ${campaign.name} (${id}) for tenant ${tenantId}`);

    return {
      id,
      ...campaign,
      description: campaign.description || null,
      status: campaign.status || 'paused',
      handlerType: campaign.handlerType || 'ivr',
      ivrMenuId: campaign.ivrMenuId || null,
      aiAgentId: campaign.aiAgentId || null,
      ringGroupId: campaign.ringGroupId || null,
      targetExtensions: campaign.targetExtensions || null,
      holdMusicPromptId: campaign.holdMusicPromptId || null,
      trunkId: campaign.trunkId || null,
      transferTrunkId: campaign.transferTrunkId || null,
      transferDestination: campaign.transferDestination || null,
      transferMode: campaign.transferMode || 'internal',
      callerId: campaign.callerId || null,
      callsPerMinute: campaign.callsPerMinute || 10,
      maxConcurrent: campaign.maxConcurrent || 10,
      retryAttempts: campaign.retryAttempts || 3,
      retryDelayMinutes: campaign.retryDelayMinutes || 30,
      totalContacts: 0,
      dialedCount: 0,
      answeredCount: 0,
      press1Count: 0,
      connectedCount: 0,
      answeringMachineCount: 0,
      amdEnabled: campaign.amdEnabled !== false,
      tenantId,
      createdAt,
      startedAt: null,
      completedAt: null,
    };
  }

  /**
   * Find campaign by ID
   */
  async findById(id: string, tenantId?: string): Promise<(DialerCampaign & { tenantId: string }) | null> {
    let query = 'SELECT * FROM dialer_campaigns WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<CampaignRow>(query, params);
    return row ? rowToCampaign(row) : null;
  }

  /**
   * Find all campaigns
   */
  async findAll(tenantId?: string): Promise<(DialerCampaign & { tenantId: string })[]> {
    let query = 'SELECT * FROM dialer_campaigns';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all<CampaignRow>(query, params);
    return rows.map(rowToCampaign);
  }

  /**
   * Get all campaigns for Asterisk config generation (all tenants)
   */
  async findAllForAsterisk(): Promise<(DialerCampaign & { tenantId: string })[]> {
    const rows = await this.db.all<CampaignRow>(
      'SELECT * FROM dialer_campaigns WHERE status = $1 ORDER BY tenant_id, name',
      ['running']
    );
    return rows.map(rowToCampaign);
  }

  /**
   * Find campaigns by status
   */
  async findByStatus(status: CampaignStatus, tenantId?: string): Promise<(DialerCampaign & { tenantId: string })[]> {
    let query = 'SELECT * FROM dialer_campaigns WHERE status = $1';
    const params: unknown[] = [status];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all<CampaignRow>(query, params);
    return rows.map(rowToCampaign);
  }

  /**
   * Find running campaigns
   */
  async findRunning(tenantId?: string): Promise<(DialerCampaign & { tenantId: string })[]> {
    return this.findByStatus('running', tenantId);
  }

  /**
   * Update campaign status
   */
  async updateStatus(id: string, status: CampaignStatus, tenantId?: string): Promise<boolean> {
    const updates: string[] = ['status = $1'];
    const values: unknown[] = [status];
    let paramIndex = 2;

    if (status === 'running') {
      updates.push('started_at = NOW()');
    } else if (status === 'completed') {
      updates.push('completed_at = NOW()');
    }

    let query = `UPDATE dialer_campaigns SET ${updates.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    if (result.rowCount > 0) {
      dbLogger.info(`Campaign ${id} status updated to ${status}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Update campaign settings
   */
  async update(id: string, updates: Partial<Pick<DialerCampaign, 'name' | 'description' | 'handlerType' | 'ivrMenuId' | 'aiAgentId' | 'ringGroupId' | 'targetExtensions' | 'holdMusicPromptId' | 'trunkId' | 'transferTrunkId' | 'transferDestination' | 'transferMode' | 'callerId' | 'callsPerMinute' | 'maxConcurrent' | 'retryAttempts' | 'retryDelayMinutes' | 'amdEnabled'>>, tenantId?: string): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.handlerType !== undefined) {
      fields.push(`handler_type = $${paramIndex++}`);
      values.push(updates.handlerType);
    }
    if (updates.ivrMenuId !== undefined) {
      fields.push(`ivr_menu_id = $${paramIndex++}`);
      values.push(updates.ivrMenuId);
    }
    if (updates.aiAgentId !== undefined) {
      fields.push(`ai_agent_id = $${paramIndex++}`);
      values.push(updates.aiAgentId);
    }
    if (updates.ringGroupId !== undefined) {
      fields.push(`ring_group_id = $${paramIndex++}`);
      values.push(updates.ringGroupId);
    }
    if (updates.targetExtensions !== undefined) {
      fields.push(`target_extensions = $${paramIndex++}`);
      values.push(updates.targetExtensions);
    }
    if (updates.holdMusicPromptId !== undefined) {
      fields.push(`hold_music_prompt_id = $${paramIndex++}`);
      values.push(updates.holdMusicPromptId);
    }
    if (updates.trunkId !== undefined) {
      fields.push(`trunk_id = $${paramIndex++}`);
      values.push(updates.trunkId);
    }
    if (updates.transferTrunkId !== undefined) {
      fields.push(`transfer_trunk_id = $${paramIndex++}`);
      values.push(updates.transferTrunkId);
    }
    if (updates.transferDestination !== undefined) {
      fields.push(`transfer_destination = $${paramIndex++}`);
      values.push(updates.transferDestination);
    }
    if (updates.transferMode !== undefined) {
      fields.push(`transfer_mode = $${paramIndex++}`);
      values.push(updates.transferMode);
    }
    if (updates.callerId !== undefined) {
      fields.push(`caller_id = $${paramIndex++}`);
      values.push(updates.callerId);
    }
    if (updates.callsPerMinute !== undefined) {
      fields.push(`calls_per_minute = $${paramIndex++}`);
      values.push(updates.callsPerMinute);
    }
    if (updates.maxConcurrent !== undefined) {
      fields.push(`max_concurrent = $${paramIndex++}`);
      values.push(updates.maxConcurrent);
    }
    if (updates.retryAttempts !== undefined) {
      fields.push(`retry_attempts = $${paramIndex++}`);
      values.push(updates.retryAttempts);
    }
    if (updates.retryDelayMinutes !== undefined) {
      fields.push(`retry_delay_minutes = $${paramIndex++}`);
      values.push(updates.retryDelayMinutes);
    }
    if (updates.amdEnabled !== undefined) {
      fields.push(`amd_enabled = $${paramIndex++}`);
      values.push(!!updates.amdEnabled);
    }

    if (fields.length === 0) return false;

    let query = `UPDATE dialer_campaigns SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    return result.rowCount > 0;
  }

  /**
   * Update total contacts count
   */
  async setTotalContacts(id: string, count: number, tenantId?: string): Promise<boolean> {
    let query = 'UPDATE dialer_campaigns SET total_contacts = $1 WHERE id = $2';
    const params: unknown[] = [count, id];

    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    return result.rowCount > 0;
  }

  /**
   * Increment a stat counter
   */
  async incrementStat(id: string, stat: 'dialed' | 'answered' | 'press1' | 'connected' | 'answering_machine', tenantId?: string): Promise<boolean> {
    const column = `${stat}_count`;
    let query = `UPDATE dialer_campaigns SET ${column} = ${column} + 1 WHERE id = $1`;
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    return result.rowCount > 0;
  }

  /**
   * Delete a campaign
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM dialer_campaigns WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Campaign deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Count campaigns
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM dialer_campaigns';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }
}
