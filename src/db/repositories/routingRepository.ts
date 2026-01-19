import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { RoutingRule } from '../../models/types';
import { dbLogger } from '../../utils/logger';

interface RoutingRow {
  id: string;
  did: string;
  target_type: string;
  target_id: string;
  enabled: boolean;
  tenant_id: string;
  created_at: Date | string;
}

function rowToRouting(row: RoutingRow): RoutingRule & { tenantId: string } {
  return {
    id: row.id,
    did: row.did,
    targetType: row.target_type as RoutingRule['targetType'],
    targetId: row.target_id,
    enabled: row.enabled,
    tenantId: row.tenant_id,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() / 1000 : Math.floor(new Date(row.created_at).getTime() / 1000),
  };
}

export class RoutingRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new routing rule
   */
  async create(rule: Omit<RoutingRule, 'id' | 'createdAt'>, tenantId: string = 'default'): Promise<RoutingRule & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO routing_rules (id, did, target_type, target_id, enabled, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id, rule.did, rule.targetType, rule.targetId, rule.enabled, tenantId]
    );

    dbLogger.info(`Routing rule created: ${rule.did} -> ${rule.targetType}:${rule.targetId} for tenant ${tenantId}`);

    return {
      id,
      ...rule,
      tenantId,
      createdAt,
    };
  }

  /**
   * Get a routing rule by ID
   */
  async findById(id: string, tenantId?: string): Promise<(RoutingRule & { tenantId: string }) | null> {
    let query = 'SELECT * FROM routing_rules WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<RoutingRow>(query, params);
    return row ? rowToRouting(row) : null;
  }

  /**
   * Get a routing rule by DID
   */
  async findByDID(did: string, tenantId?: string): Promise<(RoutingRule & { tenantId: string }) | null> {
    let query = 'SELECT * FROM routing_rules WHERE did = $1';
    const params: unknown[] = [did];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<RoutingRow>(query, params);
    return row ? rowToRouting(row) : null;
  }

  /**
   * Get enabled routing rule by DID
   */
  async findEnabledByDID(did: string, tenantId?: string): Promise<(RoutingRule & { tenantId: string }) | null> {
    let query = 'SELECT * FROM routing_rules WHERE did = $1 AND enabled = 1';
    const params: unknown[] = [did];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<RoutingRow>(query, params);
    return row ? rowToRouting(row) : null;
  }

  /**
   * Get all routing rules
   */
  async findAll(tenantId?: string): Promise<(RoutingRule & { tenantId: string })[]> {
    let query = 'SELECT * FROM routing_rules';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY did';

    const rows = await this.db.all<RoutingRow>(query, params);
    return rows.map(rowToRouting);
  }

  /**
   * Get all routing rules for Asterisk config generation (all tenants)
   */
  async findAllForAsterisk(): Promise<(RoutingRule & { tenantId: string })[]> {
    const rows = await this.db.all<RoutingRow>(
      'SELECT * FROM routing_rules WHERE enabled = 1 ORDER BY tenant_id, did'
    );
    return rows.map(rowToRouting);
  }

  /**
   * Get enabled routing rules
   */
  async findEnabled(tenantId?: string): Promise<(RoutingRule & { tenantId: string })[]> {
    let query = 'SELECT * FROM routing_rules WHERE enabled = 1';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' AND tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY did';

    const rows = await this.db.all<RoutingRow>(query, params);
    return rows.map(rowToRouting);
  }

  /**
   * Get routing rules by target type
   */
  async findByTargetType(targetType: RoutingRule['targetType'], tenantId?: string): Promise<(RoutingRule & { tenantId: string })[]> {
    let query = 'SELECT * FROM routing_rules WHERE target_type = $1';
    const params: unknown[] = [targetType];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    query += ' ORDER BY did';

    const rows = await this.db.all<RoutingRow>(query, params);
    return rows.map(rowToRouting);
  }

  /**
   * Update a routing rule
   */
  async update(id: string, updates: Partial<Omit<RoutingRule, 'id' | 'createdAt'>>, tenantId?: string): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.did !== undefined) {
      fields.push(`did = $${paramIndex++}`);
      values.push(updates.did);
    }
    if (updates.targetType !== undefined) {
      fields.push(`target_type = $${paramIndex++}`);
      values.push(updates.targetType);
    }
    if (updates.targetId !== undefined) {
      fields.push(`target_id = $${paramIndex++}`);
      values.push(updates.targetId);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (fields.length === 0) return false;

    let query = `UPDATE routing_rules SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    if (result.rowCount > 0) {
      dbLogger.info(`Routing rule updated: ${id}`);
    }

    return result.rowCount > 0;
  }

  /**
   * Delete a routing rule
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM routing_rules WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Routing rule deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Enable/disable a routing rule
   */
  async setEnabled(id: string, enabled: boolean, tenantId?: string): Promise<boolean> {
    return this.update(id, { enabled }, tenantId);
  }

  /**
   * Check if a DID has a routing rule
   */
  async existsByDID(did: string, tenantId?: string): Promise<boolean> {
    let query = 'SELECT did FROM routing_rules WHERE did = $1';
    const params: unknown[] = [did];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.get<{ did: string }>(query, params);
    return result !== undefined;
  }

  /**
   * Count routing rules
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM routing_rules';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get rules pointing to a specific target
   */
  async findByTarget(targetType: RoutingRule['targetType'], targetId: string, tenantId?: string): Promise<(RoutingRule & { tenantId: string })[]> {
    let query = 'SELECT * FROM routing_rules WHERE target_type = $1 AND target_id = $2';
    const params: unknown[] = [targetType, targetId];

    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }

    const rows = await this.db.all<RoutingRow>(query, params);
    return rows.map(rowToRouting);
  }
}
