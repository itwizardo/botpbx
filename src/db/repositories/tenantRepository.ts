import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  maxExtensions: number;
  maxConcurrentCalls: number;
  maxAiMinutesMonthly: number;
  maxCampaigns: number;
  maxTrunks: number;
  currentExtensions: number;
  currentAiMinutesUsed: number;
  contextPrefix: string;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  plan: 'starter' | 'professional' | 'enterprise' | 'custom';
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TenantUsage {
  id: string;
  tenantId: string;
  period: string;
  totalCalls: number;
  totalCallMinutes: number;
  inboundCalls: number;
  outboundCalls: number;
  aiConversations: number;
  aiMinutesUsed: number;
  aiTokensUsed: number;
  campaignCalls: number;
  campaignConnected: number;
  recordingStorageBytes: number;
  voicemailStorageBytes: number;
  createdAt: number;
  updatedAt: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  max_extensions: number;
  max_concurrent_calls: number;
  max_ai_minutes_monthly: number;
  max_campaigns: number;
  max_trunks: number;
  current_extensions: number;
  current_ai_minutes_used: number;
  context_prefix: string;
  billing_email: string | null;
  stripe_customer_id: string | null;
  plan: string;
  settings: string;
  created_at: number;
  updated_at: number;
}

interface TenantUsageRow {
  id: string;
  tenant_id: string;
  period: string;
  total_calls: number;
  total_call_minutes: number;
  inbound_calls: number;
  outbound_calls: number;
  ai_conversations: number;
  ai_minutes_used: number;
  ai_tokens_used: number;
  campaign_calls: number;
  campaign_connected: number;
  recording_storage_bytes: number;
  voicemail_storage_bytes: number;
  created_at: number;
  updated_at: number;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as Tenant['status'],
    maxExtensions: row.max_extensions,
    maxConcurrentCalls: row.max_concurrent_calls,
    maxAiMinutesMonthly: row.max_ai_minutes_monthly,
    maxCampaigns: row.max_campaigns,
    maxTrunks: row.max_trunks,
    currentExtensions: row.current_extensions,
    currentAiMinutesUsed: row.current_ai_minutes_used,
    contextPrefix: row.context_prefix,
    billingEmail: row.billing_email,
    stripeCustomerId: row.stripe_customer_id,
    plan: row.plan as Tenant['plan'],
    settings: row.settings ? JSON.parse(row.settings) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUsage(row: TenantUsageRow): TenantUsage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    period: row.period,
    totalCalls: row.total_calls,
    totalCallMinutes: row.total_call_minutes,
    inboundCalls: row.inbound_calls,
    outboundCalls: row.outbound_calls,
    aiConversations: row.ai_conversations,
    aiMinutesUsed: row.ai_minutes_used,
    aiTokensUsed: row.ai_tokens_used,
    campaignCalls: row.campaign_calls,
    campaignConnected: row.campaign_connected,
    recordingStorageBytes: row.recording_storage_bytes,
    voicemailStorageBytes: row.voicemail_storage_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TenantRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new tenant
   */
  async create(data: {
    name: string;
    slug: string;
    plan?: Tenant['plan'];
    maxExtensions?: number;
    maxConcurrentCalls?: number;
    maxAiMinutesMonthly?: number;
    maxCampaigns?: number;
    maxTrunks?: number;
    billingEmail?: string;
  }): Promise<Tenant> {
    const id = uuidv4();
    // Generate context prefix from slug (alphanumeric only)
    const contextPrefix = data.slug.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    await this.db.run(
      `INSERT INTO tenants (
        id, name, slug, context_prefix, plan,
        max_extensions, max_concurrent_calls, max_ai_minutes_monthly,
        max_campaigns, max_trunks, billing_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        data.name,
        data.slug,
        contextPrefix,
        data.plan || 'starter',
        data.maxExtensions || 100,
        data.maxConcurrentCalls || 50,
        data.maxAiMinutesMonthly || 1000,
        data.maxCampaigns || 10,
        data.maxTrunks || 5,
        data.billingEmail || null,
      ]
    );

    dbLogger.info(`Tenant created: ${data.name} (${data.slug})`);

    const tenant = await this.findById(id);
    if (!tenant) throw new Error('Failed to create tenant');
    return tenant;
  }

  /**
   * Find tenant by ID
   */
  async findById(id: string): Promise<Tenant | null> {
    const row = await this.db.get<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return row ? rowToTenant(row) : null;
  }

  /**
   * Find tenant by slug
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db.get<TenantRow>(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );
    return row ? rowToTenant(row) : null;
  }

  /**
   * Find all tenants
   */
  async findAll(): Promise<Tenant[]> {
    const rows = await this.db.all<TenantRow>(
      'SELECT * FROM tenants ORDER BY created_at DESC'
    );
    return rows.map(rowToTenant);
  }

  /**
   * Find active tenants
   */
  async findActive(): Promise<Tenant[]> {
    const rows = await this.db.all<TenantRow>(
      "SELECT * FROM tenants WHERE status = 'active' ORDER BY name"
    );
    return rows.map(rowToTenant);
  }

  /**
   * Update tenant
   */
  async update(id: string, updates: Partial<{
    name: string;
    status: Tenant['status'];
    plan: Tenant['plan'];
    maxExtensions: number;
    maxConcurrentCalls: number;
    maxAiMinutesMonthly: number;
    maxCampaigns: number;
    maxTrunks: number;
    billingEmail: string | null;
    stripeCustomerId: string | null;
    settings: Record<string, unknown>;
  }>): Promise<boolean> {
    const fields: string[] = ['updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.plan !== undefined) {
      fields.push(`plan = $${paramIndex++}`);
      values.push(updates.plan);
    }
    if (updates.maxExtensions !== undefined) {
      fields.push(`max_extensions = $${paramIndex++}`);
      values.push(updates.maxExtensions);
    }
    if (updates.maxConcurrentCalls !== undefined) {
      fields.push(`max_concurrent_calls = $${paramIndex++}`);
      values.push(updates.maxConcurrentCalls);
    }
    if (updates.maxAiMinutesMonthly !== undefined) {
      fields.push(`max_ai_minutes_monthly = $${paramIndex++}`);
      values.push(updates.maxAiMinutesMonthly);
    }
    if (updates.maxCampaigns !== undefined) {
      fields.push(`max_campaigns = $${paramIndex++}`);
      values.push(updates.maxCampaigns);
    }
    if (updates.maxTrunks !== undefined) {
      fields.push(`max_trunks = $${paramIndex++}`);
      values.push(updates.maxTrunks);
    }
    if (updates.billingEmail !== undefined) {
      fields.push(`billing_email = $${paramIndex++}`);
      values.push(updates.billingEmail);
    }
    if (updates.stripeCustomerId !== undefined) {
      fields.push(`stripe_customer_id = $${paramIndex++}`);
      values.push(updates.stripeCustomerId);
    }
    if (updates.settings !== undefined) {
      fields.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(updates.settings));
    }

    values.push(id);
    const result = await this.db.run(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    if (result.rowCount > 0) {
      dbLogger.info(`Tenant updated: ${id}`);
    }

    return result.rowCount > 0;
  }

  /**
   * Delete tenant (and all associated data via CASCADE)
   */
  async delete(id: string): Promise<boolean> {
    // Don't allow deleting the default tenant
    if (id === 'default') {
      throw new Error('Cannot delete the default tenant');
    }

    const result = await this.db.run('DELETE FROM tenants WHERE id = $1', [id]);
    if (result.rowCount > 0) {
      dbLogger.info(`Tenant deleted: ${id}`);
    }
    return result.rowCount > 0;
  }

  /**
   * Suspend tenant
   */
  async suspend(id: string): Promise<boolean> {
    return this.update(id, { status: 'suspended' });
  }

  /**
   * Activate tenant
   */
  async activate(id: string): Promise<boolean> {
    return this.update(id, { status: 'active' });
  }

  /**
   * Check if tenant is within limits
   */
  async checkLimits(tenantId: string): Promise<{
    withinLimits: boolean;
    extensions: { current: number; max: number };
    aiMinutes: { current: number; max: number };
  }> {
    const tenant = await this.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Count current extensions
    const extCount = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM extensions WHERE tenant_id = $1',
      [tenantId]
    );

    const currentExtensions = extCount ? parseInt(extCount.count, 10) : 0;

    return {
      withinLimits:
        currentExtensions < tenant.maxExtensions &&
        tenant.currentAiMinutesUsed < tenant.maxAiMinutesMonthly,
      extensions: {
        current: currentExtensions,
        max: tenant.maxExtensions,
      },
      aiMinutes: {
        current: tenant.currentAiMinutesUsed,
        max: tenant.maxAiMinutesMonthly,
      },
    };
  }

  /**
   * Increment AI minutes used
   */
  async incrementAiMinutes(tenantId: string, minutes: number): Promise<void> {
    await this.db.run(
      `UPDATE tenants
       SET current_ai_minutes_used = current_ai_minutes_used + $1,
           updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER
       WHERE id = $2`,
      [minutes, tenantId]
    );
  }

  /**
   * Reset monthly AI minutes (called by scheduler)
   */
  async resetMonthlyAiMinutes(): Promise<void> {
    await this.db.run(
      `UPDATE tenants SET current_ai_minutes_used = 0, updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER`
    );
    dbLogger.info('Monthly AI minutes reset for all tenants');
  }

  // =========================================================
  // USAGE TRACKING
  // =========================================================

  /**
   * Get or create usage record for current period
   */
  async getOrCreateUsage(tenantId: string, period?: string): Promise<TenantUsage> {
    const currentPeriod = period || new Date().toISOString().slice(0, 7); // YYYY-MM

    let usage = await this.db.get<TenantUsageRow>(
      'SELECT * FROM tenant_usage WHERE tenant_id = $1 AND period = $2',
      [tenantId, currentPeriod]
    );

    if (!usage) {
      const id = uuidv4();
      await this.db.run(
        `INSERT INTO tenant_usage (id, tenant_id, period) VALUES ($1, $2, $3)`,
        [id, tenantId, currentPeriod]
      );
      usage = await this.db.get<TenantUsageRow>(
        'SELECT * FROM tenant_usage WHERE id = $1',
        [id]
      );
    }

    return rowToUsage(usage!);
  }

  /**
   * Increment usage counter
   */
  async incrementUsage(
    tenantId: string,
    field: keyof Pick<TenantUsage,
      'totalCalls' | 'totalCallMinutes' | 'inboundCalls' | 'outboundCalls' |
      'aiConversations' | 'aiMinutesUsed' | 'aiTokensUsed' |
      'campaignCalls' | 'campaignConnected'
    >,
    amount: number = 1
  ): Promise<void> {
    const currentPeriod = new Date().toISOString().slice(0, 7);

    // Map camelCase to snake_case
    const fieldMap: Record<string, string> = {
      totalCalls: 'total_calls',
      totalCallMinutes: 'total_call_minutes',
      inboundCalls: 'inbound_calls',
      outboundCalls: 'outbound_calls',
      aiConversations: 'ai_conversations',
      aiMinutesUsed: 'ai_minutes_used',
      aiTokensUsed: 'ai_tokens_used',
      campaignCalls: 'campaign_calls',
      campaignConnected: 'campaign_connected',
    };

    const dbField = fieldMap[field];
    if (!dbField) return;

    // Ensure usage record exists
    await this.getOrCreateUsage(tenantId, currentPeriod);

    await this.db.run(
      `UPDATE tenant_usage
       SET ${dbField} = ${dbField} + $1,
           updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER
       WHERE tenant_id = $2 AND period = $3`,
      [amount, tenantId, currentPeriod]
    );
  }

  /**
   * Get usage history
   */
  async getUsageHistory(tenantId: string, months: number = 12): Promise<TenantUsage[]> {
    const rows = await this.db.all<TenantUsageRow>(
      `SELECT * FROM tenant_usage
       WHERE tenant_id = $1
       ORDER BY period DESC
       LIMIT $2`,
      [tenantId, months]
    );
    return rows.map(rowToUsage);
  }

  /**
   * Count tenants
   */
  async count(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM tenants'
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await this.findBySlug(slug);
    return !existing;
  }
}
