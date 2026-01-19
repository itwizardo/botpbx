import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface RingGroup {
  id: string;
  name: string;
  strategy: 'ringall' | 'hunt' | 'random' | 'roundrobin';
  ringTime: number;
  failoverDestination: string | null;
  failoverType: 'voicemail' | 'extension' | 'ivr' | 'hangup';
  enabled: boolean;
  createdAt: number;
  members?: RingGroupMember[];
}

export interface RingGroupMember {
  id: string;
  ringGroupId: string;
  extensionNumber: string;
  extensionName?: string;
  priority: number;
}

interface RingGroupRow {
  id: string;
  name: string;
  strategy: string;
  ring_time: number;
  failover_destination: string | null;
  failover_type: string;
  enabled: boolean;
  tenant_id: string;
  created_at: Date | string | number;
}

interface RingGroupMemberRow {
  id: string;
  ring_group_id: string;
  extension_number: string;
  priority: number;
  extension_name?: string;
}

function rowToRingGroup(row: RingGroupRow): RingGroup & { tenantId: string } {
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy as RingGroup['strategy'],
    ringTime: row.ring_time,
    failoverDestination: row.failover_destination,
    failoverType: row.failover_type as RingGroup['failoverType'],
    enabled: row.enabled,
    tenantId: row.tenant_id,
    createdAt: typeof row.created_at === 'object' ? Math.floor(new Date(row.created_at).getTime() / 1000) :
               typeof row.created_at === 'string' ? Math.floor(new Date(row.created_at).getTime() / 1000) : row.created_at,
  };
}

function rowToMember(row: RingGroupMemberRow): RingGroupMember {
  return {
    id: row.id,
    ringGroupId: row.ring_group_id,
    extensionNumber: row.extension_number,
    extensionName: row.extension_name,
    priority: row.priority,
  };
}

export class RingGroupRepository {
  constructor(private db: DatabaseManager) {}

  async create(ringGroup: Omit<RingGroup, 'id' | 'createdAt' | 'members'>, tenantId: string = 'default'): Promise<RingGroup & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO ring_groups (id, name, strategy, ring_time, failover_destination, failover_type, enabled, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        ringGroup.name,
        ringGroup.strategy,
        ringGroup.ringTime,
        ringGroup.failoverDestination,
        ringGroup.failoverType,
        ringGroup.enabled,
        tenantId,
      ]
    );

    dbLogger.info(`Ring group created: ${ringGroup.name} (${id}) for tenant ${tenantId}`);

    return {
      id,
      ...ringGroup,
      tenantId,
      createdAt,
    };
  }

  async findById(id: string, tenantId?: string): Promise<(RingGroup & { tenantId: string }) | null> {
    let query = 'SELECT * FROM ring_groups WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<RingGroupRow>(query, params);

    if (!row) return null;

    const ringGroup = rowToRingGroup(row);
    ringGroup.members = await this.getMembers(id);
    return ringGroup;
  }

  async findAll(tenantId?: string): Promise<(RingGroup & { tenantId: string })[]> {
    let query = 'SELECT * FROM ring_groups';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY name';

    const rows = await this.db.all<RingGroupRow>(query, params);

    const results: (RingGroup & { tenantId: string })[] = [];
    for (const row of rows) {
      const ringGroup = rowToRingGroup(row);
      ringGroup.members = await this.getMembers(row.id);
      results.push(ringGroup);
    }
    return results;
  }

  /**
   * Get all ring groups for Asterisk config generation (all tenants)
   */
  async findAllForAsterisk(): Promise<(RingGroup & { tenantId: string })[]> {
    const rows = await this.db.all<RingGroupRow>(
      'SELECT * FROM ring_groups WHERE enabled = 1 ORDER BY tenant_id, name'
    );

    const results: (RingGroup & { tenantId: string })[] = [];
    for (const row of rows) {
      const ringGroup = rowToRingGroup(row);
      ringGroup.members = await this.getMembers(row.id);
      results.push(ringGroup);
    }
    return results;
  }

  async update(id: string, updates: Partial<Omit<RingGroup, 'id' | 'createdAt' | 'members'>>, tenantId?: string): Promise<(RingGroup & { tenantId: string }) | null> {
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
    if (updates.ringTime !== undefined) {
      fields.push(`ring_time = $${paramIndex++}`);
      values.push(updates.ringTime);
    }
    if (updates.failoverDestination !== undefined) {
      fields.push(`failover_destination = $${paramIndex++}`);
      values.push(updates.failoverDestination);
    }
    if (updates.failoverType !== undefined) {
      fields.push(`failover_type = $${paramIndex++}`);
      values.push(updates.failoverType);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (fields.length > 0) {
      let query = `UPDATE ring_groups SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
      values.push(id);

      if (tenantId) {
        query += ` AND tenant_id = $${paramIndex}`;
        values.push(tenantId);
      }

      await this.db.run(query, values);
      dbLogger.info(`Ring group updated: ${id}`);
    }

    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM ring_groups WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Ring group deleted: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Count ring groups for a tenant
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM ring_groups';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  // Member management
  async getMembers(ringGroupId: string): Promise<RingGroupMember[]> {
    const rows = await this.db.all<RingGroupMemberRow>(
      `SELECT m.*, e.name as extension_name
       FROM ring_group_members m
       LEFT JOIN extensions e ON m.extension_number = e.number
       WHERE m.ring_group_id = $1
       ORDER BY m.priority`,
      [ringGroupId]
    );

    return rows.map(rowToMember);
  }

  async addMember(ringGroupId: string, extensionNumber: string, priority: number = 1): Promise<RingGroupMember | null> {
    const id = uuidv4();

    try {
      await this.db.run(
        `INSERT INTO ring_group_members (id, ring_group_id, extension_number, priority)
         VALUES ($1, $2, $3, $4)`,
        [id, ringGroupId, extensionNumber, priority]
      );

      dbLogger.info(`Added extension ${extensionNumber} to ring group ${ringGroupId}`);

      return {
        id,
        ringGroupId,
        extensionNumber,
        priority,
      };
    } catch (error) {
      dbLogger.error(`Failed to add member to ring group: ${error}`);
      return null;
    }
  }

  async removeMember(ringGroupId: string, extensionNumber: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM ring_group_members WHERE ring_group_id = $1 AND extension_number = $2',
      [ringGroupId, extensionNumber]
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Removed extension ${extensionNumber} from ring group ${ringGroupId}`);
      return true;
    }
    return false;
  }

  async setMembers(ringGroupId: string, extensions: { number: string; priority: number }[]): Promise<void> {
    await this.db.transaction(async () => {
      // Remove existing members
      await this.db.run('DELETE FROM ring_group_members WHERE ring_group_id = $1', [ringGroupId]);

      // Add new members
      for (const ext of extensions) {
        const id = uuidv4();
        await this.db.run(
          `INSERT INTO ring_group_members (id, ring_group_id, extension_number, priority)
           VALUES ($1, $2, $3, $4)`,
          [id, ringGroupId, ext.number, ext.priority]
        );
      }
    });

    dbLogger.info(`Set ${extensions.length} members for ring group ${ringGroupId}`);
  }
}
