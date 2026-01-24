import { DatabaseManager } from '../database';
import { Extension } from '../../models/types';
import { dbLogger } from '../../utils/logger';
import * as crypto from 'crypto';

interface ExtensionRow {
  number: string;
  name: string;
  password: string;
  enabled: boolean;
  tenant_id: string;
  forward_number: string | null;
  forward_enabled: boolean | null;
  forward_destination: string | null;
  forward_type: string | null;
  forward_timeout: number | null;
  dnd_enabled: boolean | null;
  created_at: Date | string;
}

function rowToExtension(row: ExtensionRow): Extension & { tenantId: string } {
  return {
    number: row.number,
    name: row.name,
    password: row.password,
    enabled: row.enabled,
    tenantId: row.tenant_id,
    forwardNumber: row.forward_number || null,
    forwardEnabled: !!row.forward_enabled,
    forwardDestination: row.forward_destination || null,
    forwardType: (row.forward_type as Extension['forwardType']) || 'always',
    forwardTimeout: row.forward_timeout || 20,
    dndEnabled: !!row.dnd_enabled,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at).getTime() / 1000 : Math.floor(new Date(row.created_at).getTime() / 1000),
  };
}

/**
 * Generate a secure random password for SIP extensions
 */
export function generateSecurePassword(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

export class ExtensionRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new extension
   * @param extension Extension data
   * @param tenantId Tenant ID (required for multi-tenant)
   */
  async create(
    extension: Omit<Extension, 'createdAt'>,
    tenantId: string = 'default'
  ): Promise<Extension & { tenantId: string }> {
    const createdAt = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO extensions (number, name, password, enabled, tenant_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [extension.number, extension.name, extension.password, extension.enabled, tenantId]
    );

    dbLogger.info(`Extension created: ${extension.number} (${extension.name}) for tenant ${tenantId}`);

    return {
      ...extension,
      tenantId,
      createdAt,
    };
  }

  /**
   * Get an extension by number within a tenant
   * @param number Extension number
   * @param tenantId Tenant ID (optional - if not provided, searches all tenants)
   */
  async findByNumber(number: string, tenantId?: string): Promise<(Extension & { tenantId: string }) | null> {
    let query = 'SELECT * FROM extensions WHERE number = $1';
    const params: unknown[] = [number];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const row = await this.db.get<ExtensionRow>(query, params);
    return row ? rowToExtension(row) : null;
  }

  /**
   * Get all extensions for a tenant
   * @param tenantId Tenant ID (optional - if not provided, returns all)
   */
  async findAll(tenantId?: string): Promise<(Extension & { tenantId: string })[]> {
    let query = 'SELECT * FROM extensions';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY number';

    const rows = await this.db.all<ExtensionRow>(query, params);
    return rows.map(rowToExtension);
  }

  /**
   * Get enabled extensions for a tenant
   * @param tenantId Tenant ID (optional)
   */
  async findEnabled(tenantId?: string): Promise<(Extension & { tenantId: string })[]> {
    let query = 'SELECT * FROM extensions WHERE enabled = true';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' AND tenant_id = $1';
      params.push(tenantId);
    }

    query += ' ORDER BY number';

    const rows = await this.db.all<ExtensionRow>(query, params);
    return rows.map(rowToExtension);
  }

  /**
   * Update an extension
   * @param number Extension number
   * @param updates Fields to update
   * @param tenantId Tenant ID (required for security)
   */
  async update(
    number: string,
    updates: Partial<Omit<Extension, 'number' | 'createdAt'>>,
    tenantId?: string
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.password !== undefined) {
      fields.push(`password = $${paramIndex++}`);
      values.push(updates.password);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }
    if (updates.forwardNumber !== undefined) {
      fields.push(`forward_number = $${paramIndex++}`);
      values.push(updates.forwardNumber || null);
    }
    if (updates.forwardEnabled !== undefined) {
      fields.push(`forward_enabled = $${paramIndex++}`);
      values.push(updates.forwardEnabled);
    }
    if (updates.forwardDestination !== undefined) {
      fields.push(`forward_destination = $${paramIndex++}`);
      values.push(updates.forwardDestination || null);
    }
    if (updates.forwardType !== undefined) {
      fields.push(`forward_type = $${paramIndex++}`);
      values.push(updates.forwardType);
    }
    if (updates.forwardTimeout !== undefined) {
      fields.push(`forward_timeout = $${paramIndex++}`);
      values.push(updates.forwardTimeout);
    }
    if (updates.dndEnabled !== undefined) {
      fields.push(`dnd_enabled = $${paramIndex++}`);
      values.push(updates.dndEnabled);
    }

    if (fields.length === 0) return false;

    let query = `UPDATE extensions SET ${fields.join(', ')} WHERE number = $${paramIndex++}`;
    values.push(number);

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex}`;
      values.push(tenantId);
    }

    const result = await this.db.run(query, values);

    if (result.rowCount > 0) {
      dbLogger.info(`Extension updated: ${number}`);
    }

    return result.rowCount > 0;
  }

  /**
   * Delete an extension
   * @param number Extension number
   * @param tenantId Tenant ID (required for security)
   */
  async delete(number: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM extensions WHERE number = $1';
    const params: unknown[] = [number];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.run(query, params);
    if (result.rowCount > 0) {
      dbLogger.info(`Extension deleted: ${number}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Enable/disable an extension
   */
  async setEnabled(number: string, enabled: boolean, tenantId?: string): Promise<boolean> {
    return this.update(number, { enabled }, tenantId);
  }

  /**
   * Regenerate password for an extension
   */
  async regeneratePassword(number: string, tenantId?: string): Promise<string | null> {
    const newPassword = generateSecurePassword();
    const updated = await this.update(number, { password: newPassword }, tenantId);
    return updated ? newPassword : null;
  }

  /**
   * Check if extension number exists within a tenant
   */
  async exists(number: string, tenantId?: string): Promise<boolean> {
    let query = 'SELECT number FROM extensions WHERE number = $1';
    const params: unknown[] = [number];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    const result = await this.db.get<{ number: string }>(query, params);
    return result !== undefined;
  }

  /**
   * Count extensions for a tenant
   */
  async count(tenantId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM extensions';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const result = await this.db.get<{ count: string }>(query, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get next available extension number in a range for a tenant
   */
  async getNextAvailableNumber(tenantId?: string, startFrom: number = 1001): Promise<string> {
    const extensions = (await this.findAll(tenantId))
      .map((e) => parseInt(e.number, 10))
      .filter((n) => !isNaN(n));

    let next = startFrom;
    while (extensions.includes(next)) {
      next++;
    }
    return next.toString();
  }

  /**
   * Toggle Do Not Disturb for an extension
   */
  async setDND(number: string, enabled: boolean, tenantId?: string): Promise<boolean> {
    return this.update(number, { dndEnabled: enabled }, tenantId);
  }

  /**
   * Get DND status for an extension
   */
  async getDNDStatus(number: string, tenantId?: string): Promise<boolean | null> {
    const ext = await this.findByNumber(number, tenantId);
    return ext ? ext.dndEnabled ?? false : null;
  }

  /**
   * Set call forwarding for an extension
   */
  async setForwarding(
    number: string,
    settings: {
      enabled: boolean;
      destination?: string;
      type?: 'always' | 'busy' | 'noanswer' | 'unavailable';
      timeout?: number;
    },
    tenantId?: string
  ): Promise<boolean> {
    return this.update(number, {
      forwardEnabled: settings.enabled,
      forwardDestination: settings.destination,
      forwardType: settings.type || 'always',
      forwardTimeout: settings.timeout || 20,
    }, tenantId);
  }

  /**
   * Get call forwarding settings for an extension
   */
  async getForwarding(number: string, tenantId?: string): Promise<{
    enabled: boolean;
    destination: string | null;
    type: string;
    timeout: number;
  } | null> {
    const ext = await this.findByNumber(number, tenantId);
    if (!ext) return null;

    return {
      enabled: ext.forwardEnabled ?? false,
      destination: ext.forwardDestination || null,
      type: ext.forwardType || 'always',
      timeout: ext.forwardTimeout || 20,
    };
  }

  /**
   * Get all extensions for Asterisk config generation (all tenants)
   * Used internally for PJSIP configuration
   */
  async findAllForAsterisk(): Promise<(Extension & { tenantId: string })[]> {
    const rows = await this.db.all<ExtensionRow>(
      'SELECT * FROM extensions WHERE enabled = true ORDER BY tenant_id, number'
    );
    return rows.map(rowToExtension);
  }
}
