import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerRingGroupRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get all ring groups - requires ring_groups.view
  server.get('/', {
    preHandler: [ctx.requirePermission('ring_groups.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ringGroups = await ctx.ringGroupRepo.findAll();
    return { ringGroups };
  });

  // Get single ring group - requires ring_groups.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('ring_groups.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ringGroup = await ctx.ringGroupRepo.findById(id);

    if (!ringGroup) {
      return reply.status(404).send({ error: 'Not Found', message: 'Ring group not found' });
    }

    return ringGroup;
  });

  // Create ring group - requires ring_groups.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('ring_groups.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      strategy?: 'ringall' | 'hunt' | 'random' | 'roundrobin';
      ringTime?: number;
      failoverDestination?: string;
      failoverType?: 'voicemail' | 'extension' | 'ivr' | 'hangup';
      enabled?: boolean;
      members?: { number: string; priority: number }[];
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'name is required' });
    }

    const ringGroup = await ctx.ringGroupRepo.create({
      name: body.name,
      strategy: body.strategy || 'ringall',
      ringTime: body.ringTime || 20,
      failoverDestination: body.failoverDestination || null,
      failoverType: body.failoverType || 'voicemail',
      enabled: body.enabled ?? true,
    });

    // Add members if provided
    if (body.members && body.members.length > 0) {
      await ctx.ringGroupRepo.setMembers(ringGroup.id, body.members);
      ringGroup.members = await ctx.ringGroupRepo.getMembers(ringGroup.id);
    }

    return reply.status(201).send(ringGroup);
  });

  // Update ring group - requires ring_groups.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('ring_groups.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      strategy?: 'ringall' | 'hunt' | 'random' | 'roundrobin';
      ringTime?: number;
      failoverDestination?: string;
      failoverType?: 'voicemail' | 'extension' | 'ivr' | 'hangup';
      enabled?: boolean;
      members?: { number: string; priority: number }[];
    };

    const ringGroup = await ctx.ringGroupRepo.update(id, {
      name: body.name,
      strategy: body.strategy,
      ringTime: body.ringTime,
      failoverDestination: body.failoverDestination,
      failoverType: body.failoverType,
      enabled: body.enabled,
    });

    if (!ringGroup) {
      return reply.status(404).send({ error: 'Not Found', message: 'Ring group not found' });
    }

    // Update members if provided
    if (body.members !== undefined) {
      await ctx.ringGroupRepo.setMembers(id, body.members);
      ringGroup.members = await ctx.ringGroupRepo.getMembers(id);
    }

    return ringGroup;
  });

  // Delete ring group - requires ring_groups.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('ring_groups.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await ctx.ringGroupRepo.delete(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Not Found', message: 'Ring group not found' });
    }

    return { success: true };
  });

  // Get ring group members - requires ring_groups.view
  server.get('/:id/members', {
    preHandler: [ctx.requirePermission('ring_groups.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ringGroup = await ctx.ringGroupRepo.findById(id);

    if (!ringGroup) {
      return reply.status(404).send({ error: 'Not Found', message: 'Ring group not found' });
    }

    return { members: ringGroup.members || [] };
  });

  // Add member to ring group - requires ring_groups.manage
  server.post('/:id/members', {
    preHandler: [ctx.requirePermission('ring_groups.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { extensionNumber: string; priority?: number };

    if (!body.extensionNumber) {
      return reply.status(400).send({ error: 'Bad Request', message: 'extensionNumber is required' });
    }

    const ringGroup = await ctx.ringGroupRepo.findById(id);
    if (!ringGroup) {
      return reply.status(404).send({ error: 'Not Found', message: 'Ring group not found' });
    }

    const member = await ctx.ringGroupRepo.addMember(id, body.extensionNumber, body.priority || 1);

    if (!member) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Failed to add member (may already exist)' });
    }

    return reply.status(201).send(member);
  });

  // Remove member from ring group - requires ring_groups.manage
  server.delete('/:id/members/:extensionNumber', {
    preHandler: [ctx.requirePermission('ring_groups.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, extensionNumber } = request.params as { id: string; extensionNumber: string };

    const removed = await ctx.ringGroupRepo.removeMember(id, extensionNumber);

    if (!removed) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found' });
    }

    return { success: true };
  });
}
