import { DatabaseManager } from '../database';
import { SIPTrunk } from '../../models/types';
import { dbLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface TrunkRow {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  auth_username: string | null;
  from_user: string | null;
  from_domain: string | null;
  context: string;
  codecs: string;
  enabled: boolean;
  register: boolean;
  stir_shaken_enabled: boolean;
  stir_shaken_attest: 'A' | 'B' | 'C' | null;
  stir_shaken_profile: string | null;
  created_at: Date | string;
  tenant_id: string;
}

function rowToTrunk(row: TrunkRow): SIPTrunk & { tenantId: string } {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    authUsername: row.auth_username,
    fromUser: row.from_user,
    fromDomain: row.from_domain,
    context: row.context,
    codecs: row.codecs,
    enabled: row.enabled,
    register: row.register,
    stirShakenEnabled: row.stir_shaken_enabled || false,
    stirShakenAttest: row.stir_shaken_attest,
    stirShakenProfile: row.stir_shaken_profile,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() / 1000 : Math.floor(new Date(row.created_at).getTime() / 1000),
    tenantId: row.tenant_id,
  };
}

export class TrunkRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new SIP trunk
   * @param trunk Trunk data
   * @param tenantId Tenant ID (required for multi-tenant)
   */
  async create(trunk: Omit<SIPTrunk, 'id' | 'createdAt'>, tenantId: string = 'default'): Promise<SIPTrunk & { tenantId: string }> {
    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO sip_trunks (id, name, host, port, username, password, auth_username, from_user, from_domain, context, codecs, enabled, register, stir_shaken_enabled, stir_shaken_attest, stir_shaken_profile, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        trunk.name,
        trunk.host,
        trunk.port,
        trunk.username,
        trunk.password,
        trunk.authUsername,
        trunk.fromUser,
        trunk.fromDomain,
        trunk.context,
        trunk.codecs,
        trunk.enabled ?? true,
        trunk.register ?? false,
        trunk.stirShakenEnabled ?? false,
        trunk.stirShakenAttest,
        trunk.stirShakenProfile,
        createdAt,
        tenantId,
      ]
    );

    dbLogger.info(`SIP trunk created: ${trunk.name} (${trunk.host}) for tenant ${tenantId}`);

    return {
      id,
      ...trunk,
      createdAt,
      tenantId,
    };
  }

  /**
   * Get a trunk by ID
   * @param id Trunk ID
   * @param tenantId Tenant ID (optional)
   */
  async findById(id: string, tenantId?: string): Promise<(SIPTrunk & { tenantId: string }) | null> {
    let query = 'SELECT * FROM sip_trunks WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<TrunkRow>(query, params);
    return row ? rowToTrunk(row) : null;
  }

  /**
   * Get all trunks
   * @param tenantId Tenant ID (optional)
   */
  async findAll(tenantId?: string): Promise<(SIPTrunk & { tenantId: string })[]> {
    let query = 'SELECT * FROM sip_trunks';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY name';

    const rows = await this.db.all<TrunkRow>(query, params);
    return rows.map(rowToTrunk);
  }

  /**
   * Get enabled trunks only
   * @param tenantId Tenant ID (optional)
   */
  async findEnabled(tenantId?: string): Promise<(SIPTrunk & { tenantId: string })[]> {
    let query = 'SELECT * FROM sip_trunks WHERE enabled = true';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' AND tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY name';

    const rows = await this.db.all<TrunkRow>(query, params);
    return rows.map(rowToTrunk);
  }

  /**
   * Update a trunk
   * @param id Trunk ID
   * @param updates Fields to update
   * @param tenantId Tenant ID (required for security)
   */
  async update(id: string, updates: Partial<Omit<SIPTrunk, 'id' | 'createdAt'>>, tenantId?: string): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.host !== undefined) {
      fields.push(`host = $${paramIndex++}`);
      values.push(updates.host);
    }
    if (updates.port !== undefined) {
      fields.push(`port = $${paramIndex++}`);
      values.push(updates.port);
    }
    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }
    if (updates.password !== undefined) {
      fields.push(`password = $${paramIndex++}`);
      values.push(updates.password);
    }
    if (updates.authUsername !== undefined) {
      fields.push(`auth_username = $${paramIndex++}`);
      values.push(updates.authUsername);
    }
    if (updates.fromUser !== undefined) {
      fields.push(`from_user = $${paramIndex++}`);
      values.push(updates.fromUser);
    }
    if (updates.fromDomain !== undefined) {
      fields.push(`from_domain = $${paramIndex++}`);
      values.push(updates.fromDomain);
    }
    if (updates.context !== undefined) {
      fields.push(`context = $${paramIndex++}`);
      values.push(updates.context);
    }
    if (updates.codecs !== undefined) {
      fields.push(`codecs = $${paramIndex++}`);
      values.push(updates.codecs);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(!!updates.enabled);
    }
    if (updates.register !== undefined) {
      fields.push(`register = $${paramIndex++}`);
      values.push(!!updates.register);
    }
    if (updates.stirShakenEnabled !== undefined) {
      fields.push(`stir_shaken_enabled = $${paramIndex++}`);
      values.push(!!updates.stirShakenEnabled);
    }
    if (updates.stirShakenAttest !== undefined) {
      fields.push(`stir_shaken_attest = $${paramIndex++}`);
      values.push(updates.stirShakenAttest);
    }
    if (updates.stirShakenProfile !== undefined) {
      fields.push(`stir_shaken_profile = $${paramIndex++}`);
      values.push(updates.stirShakenProfile);
    }

    if (fields.length === 0) return false;

    let query = `UPDATE sip_trunks SET ${fields.join(', ')} WHERE id = $${paramIndex++}`;
    values.push(id);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    if (result.rowCount > 0) {
      dbLogger.info(`SIP trunk updated: ${id}`);
    }

    return result.rowCount > 0;
  }

  /**
   * Delete a trunk
   * @param id Trunk ID
   * @param tenantId Tenant ID (required for security)
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM sip_trunks WHERE id = $1';
    const params: unknown[] = [id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`SIP trunk deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Enable/disable a trunk
   * @param id Trunk ID
   * @param enabled Enable status
   * @param tenantId Tenant ID
   */
  async setEnabled(id: string, enabled: boolean, tenantId?: string): Promise<boolean> {
    return this.update(id, { enabled }, tenantId);
  }

  /**
   * Count trunks
   * @param tenantId Tenant ID (optional)
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM sip_trunks';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get all trunks for Asterisk config generation (all tenants)
   * Used internally for PJSIP configuration
   */
  async findAllForAsterisk(): Promise<(SIPTrunk & { tenantId: string })[]> {
    const rows = await this.db.all<TrunkRow>(
      'SELECT * FROM sip_trunks WHERE enabled = true ORDER BY tenant_id, name'
    );
    return rows.map(rowToTrunk);
  }
}
