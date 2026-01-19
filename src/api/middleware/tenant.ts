import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantRepository, Tenant } from '../../db/repositories/tenantRepository';

// Extend FastifyRequest to include tenant context
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    tenant?: Tenant;
    isSuperAdmin?: boolean;
  }
}

/**
 * Create tenant middleware factory
 * This middleware extracts and validates the tenant context for each request
 */
export function createTenantMiddleware(tenantRepo: TenantRepository) {
  /**
   * Main tenant middleware - attaches tenant context to request
   * Must be called after authentication middleware
   */
  async function tenantMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Get tenant from authenticated user
    const user = (request as any).user;

    if (!user) {
      // No authenticated user - this shouldn't happen if auth middleware ran first
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Super admins (tenant_id = null) can access all tenants
    if (user.tenantId === null || user.tenantId === undefined) {
      request.isSuperAdmin = true;

      // Check for tenant header/query for super admin tenant switching
      const headerTenantId = request.headers['x-tenant-id'] as string;
      const queryTenantId = (request.query as any)?.tenantId as string;
      const targetTenantId = headerTenantId || queryTenantId;

      if (targetTenantId) {
        // Super admin is accessing a specific tenant
        const tenant = await tenantRepo.findById(targetTenantId);
        if (!tenant) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Tenant not found',
          });
        }
        request.tenantId = tenant.id;
        request.tenant = tenant;
      } else {
        // Super admin accessing without tenant context (global view)
        // Some endpoints may require this, others may not
        request.tenantId = undefined;
        request.tenant = undefined;
      }

      return;
    }

    // Regular user - must have tenant
    const tenantId = user.tenantId;

    // Validate tenant exists and is active
    const tenant = await tenantRepo.findById(tenantId);

    if (!tenant) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Tenant not found',
      });
    }

    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Tenant is ${tenant.status}. Please contact support.`,
      });
    }

    // Attach tenant context to request
    request.tenantId = tenant.id;
    request.tenant = tenant;
    request.isSuperAdmin = false;
  }

  /**
   * Require tenant context - fails if no tenant is set
   * Use this for endpoints that must have a tenant
   */
  async function requireTenant(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.tenantId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Tenant context required. Use X-Tenant-Id header or tenantId query parameter.',
      });
    }
  }

  /**
   * Require super admin - fails if user is not a super admin
   */
  async function requireSuperAdmin(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.isSuperAdmin) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Super admin access required',
      });
    }
  }

  /**
   * Check tenant limits before creating resources
   */
  function checkTenantLimits(resourceType: 'extension' | 'campaign' | 'trunk' | 'aiMinutes') {
    return async function(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      if (!request.tenant) return; // Super admin without tenant context

      const tenant = request.tenant;

      switch (resourceType) {
        case 'extension': {
          const limits = await tenantRepo.checkLimits(tenant.id);
          if (limits.extensions.current >= limits.extensions.max) {
            return reply.status(403).send({
              error: 'Limit Exceeded',
              message: `Maximum extensions (${limits.extensions.max}) reached for this tenant`,
            });
          }
          break;
        }
        case 'campaign': {
          const count = await countResource('dialer_campaigns', tenant.id);
          if (count >= tenant.maxCampaigns) {
            return reply.status(403).send({
              error: 'Limit Exceeded',
              message: `Maximum campaigns (${tenant.maxCampaigns}) reached for this tenant`,
            });
          }
          break;
        }
        case 'trunk': {
          const count = await countResource('sip_trunks', tenant.id);
          if (count >= tenant.maxTrunks) {
            return reply.status(403).send({
              error: 'Limit Exceeded',
              message: `Maximum trunks (${tenant.maxTrunks}) reached for this tenant`,
            });
          }
          break;
        }
        case 'aiMinutes': {
          if (tenant.currentAiMinutesUsed >= tenant.maxAiMinutesMonthly) {
            return reply.status(403).send({
              error: 'Limit Exceeded',
              message: `Monthly AI minutes (${tenant.maxAiMinutesMonthly}) exhausted for this tenant`,
            });
          }
          break;
        }
      }
    };
  }

  // Helper to count resources
  async function countResource(table: string, tenantId: string): Promise<number> {
    const { getDatabase } = await import('../../db/database');
    const db = getDatabase();
    const result = await db.get<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = $1`,
      [tenantId]
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  return {
    tenantMiddleware,
    requireTenant,
    requireSuperAdmin,
    checkTenantLimits,
  };
}

/**
 * Helper to get tenant-scoped query
 * Adds WHERE tenant_id = $X clause to queries
 */
export function tenantScope(
  tenantId: string | undefined,
  isSuperAdmin: boolean = false
): { clause: string; params: unknown[] } {
  if (isSuperAdmin && !tenantId) {
    // Super admin without tenant context - return all
    return { clause: '', params: [] };
  }

  return {
    clause: 'tenant_id = $1',
    params: [tenantId],
  };
}

/**
 * Helper to build tenant-aware queries
 */
export function buildTenantQuery(
  baseQuery: string,
  tenantId: string | undefined,
  isSuperAdmin: boolean = false,
  existingParams: unknown[] = []
): { query: string; params: unknown[] } {
  if (isSuperAdmin && !tenantId) {
    return { query: baseQuery, params: existingParams };
  }

  const hasWhere = baseQuery.toLowerCase().includes('where');
  const paramIndex = existingParams.length + 1;

  const query = hasWhere
    ? baseQuery.replace(/where/i, `WHERE tenant_id = $${paramIndex} AND`)
    : `${baseQuery} WHERE tenant_id = $${paramIndex}`;

  return {
    query,
    params: [...existingParams, tenantId],
  };
}
