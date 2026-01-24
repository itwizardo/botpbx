import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TenantRepository, Tenant } from '../../db/repositories/tenantRepository';
import { Permission } from '../../db/repositories/permissionRepository';

interface TenantContext {
  tenantRepo: TenantRepository;
  requirePermission: (permission: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireSuperAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerTenantRoutes(server: FastifyInstance, ctx: TenantContext): void {
  // =========================================================
  // SUPER ADMIN ONLY - Tenant Management
  // =========================================================

  // List all tenants - requires super admin
  server.get('/', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenants = await ctx.tenantRepo.findAll();
    return { tenants };
  });

  // Get single tenant - requires super admin
  server.get('/:id', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    // Get usage stats
    const limits = await ctx.tenantRepo.checkLimits(id);
    const usage = await ctx.tenantRepo.getOrCreateUsage(id);

    return {
      tenant,
      limits,
      currentUsage: usage,
    };
  });

  // Create tenant - requires super admin
  server.post('/', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      slug: string;
      plan?: Tenant['plan'];
      maxExtensions?: number;
      maxConcurrentCalls?: number;
      maxAiMinutesMonthly?: number;
      maxCampaigns?: number;
      maxTrunks?: number;
      billingEmail?: string;
    };

    if (!body.name || !body.slug) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'name and slug are required',
      });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    // Check if slug is available
    const isAvailable = await ctx.tenantRepo.isSlugAvailable(body.slug);
    if (!isAvailable) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Tenant slug already exists',
      });
    }

    const tenant = await ctx.tenantRepo.create(body);

    return reply.status(201).send({ tenant });
  });

  // Update tenant - requires super admin
  server.put('/:id', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
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
    }>;

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    const success = await ctx.tenantRepo.update(id, body);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update tenant' });
    }

    const updated = await ctx.tenantRepo.findById(id);
    return { tenant: updated };
  });

  // Delete tenant - requires super admin
  server.delete('/:id', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (id === 'default') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot delete the default tenant',
      });
    }

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    const success = await ctx.tenantRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete tenant' });
    }

    return { success: true };
  });

  // Suspend tenant - requires super admin
  server.post('/:id/suspend', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (id === 'default') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot suspend the default tenant',
      });
    }

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    await ctx.tenantRepo.suspend(id);
    const updated = await ctx.tenantRepo.findById(id);

    return { success: true, tenant: updated };
  });

  // Activate tenant - requires super admin
  server.post('/:id/activate', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    await ctx.tenantRepo.activate(id);
    const updated = await ctx.tenantRepo.findById(id);

    return { success: true, tenant: updated };
  });

  // Get tenant usage history - requires super admin
  server.get('/:id/usage', {
    preHandler: [ctx.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { months } = request.query as { months?: string };

    const tenant = await ctx.tenantRepo.findById(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    const history = await ctx.tenantRepo.getUsageHistory(id, months ? parseInt(months, 10) : 12);
    const limits = await ctx.tenantRepo.checkLimits(id);

    return {
      tenant: { id: tenant.id, name: tenant.name },
      limits,
      usageHistory: history,
    };
  });

  // =========================================================
  // TENANT USER - Current Tenant Info
  // =========================================================

  // Get current tenant info (for tenant users)
  server.get('/current', {
    preHandler: [ctx.requirePermission('tenants.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (request as any).tenantId;

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No tenant context',
      });
    }

    const tenant = await ctx.tenantRepo.findById(tenantId);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
    }

    // Get limits and usage
    const limits = await ctx.tenantRepo.checkLimits(tenantId);
    const usage = await ctx.tenantRepo.getOrCreateUsage(tenantId);

    // Return sanitized tenant info (no billing details)
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
      },
      limits,
      currentUsage: {
        totalCalls: usage.totalCalls,
        totalCallMinutes: usage.totalCallMinutes,
        aiConversations: usage.aiConversations,
        aiMinutesUsed: usage.aiMinutesUsed,
      },
    };
  });

  // Get current tenant usage (for tenant users)
  server.get('/current/usage', {
    preHandler: [ctx.requirePermission('tenants.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (request as any).tenantId;
    const { months } = request.query as { months?: string };

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No tenant context',
      });
    }

    const history = await ctx.tenantRepo.getUsageHistory(tenantId, months ? parseInt(months, 10) : 6);
    const limits = await ctx.tenantRepo.checkLimits(tenantId);

    return {
      limits,
      usageHistory: history,
    };
  });
}
