import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export async function registerContactGroupRoutes(server: FastifyInstance, ctx: ApiContext): Promise<void> {
  // ============ Global DNC Endpoints (must be before /:id routes) ============

  // Get global DNC stats - requires contacts.view
  server.get('/dnc/stats', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const count = await ctx.contactGroupRepo.getGlobalDNCCount();
    return { totalCalled: count };
  });

  // Get global DNC list - requires contacts.view
  server.get('/dnc/list', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { limit?: string; offset?: string };
    const entries = await ctx.contactGroupRepo.getGlobalDNCList({
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
    const count = await ctx.contactGroupRepo.getGlobalDNCCount();
    return { entries, total: count };
  });

  // Check if number is in global DNC - requires contacts.view
  server.get('/dnc/check/:phoneNumber', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { phoneNumber } = request.params as { phoneNumber: string };
    const dncEntry = await ctx.contactGroupRepo.findGlobalDNC(phoneNumber);
    return {
      phoneNumber,
      isCalled: dncEntry !== null,
      entry: dncEntry,
    };
  });

  // Remove number from global DNC - requires contacts.manage
  server.delete('/dnc/:phoneNumber', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { phoneNumber } = request.params as { phoneNumber: string };
    const success = await ctx.contactGroupRepo.removeFromGlobalDNC(phoneNumber);
    return { success };
  });

  // Clear all global DNC entries - requires contacts.manage
  server.delete('/dnc', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const count = await ctx.contactGroupRepo.clearGlobalDNC();
    return { success: true, cleared: count };
  });

  // Manually mark number as called - requires contacts.manage
  server.post('/dnc/mark', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { phoneNumber: string; campaignId?: string };

    if (!body.phoneNumber?.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Phone number is required' });
    }

    await ctx.contactGroupRepo.markAsCalled(body.phoneNumber.trim(), body.campaignId);
    return { success: true };
  });

  // ============ Contact Group Endpoints ============

  // List all contact groups - requires contacts.view
  server.get('/', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const groups = await ctx.contactGroupRepo.findAllGroups();
    return { groups };
  });

  // Get single contact group with stats - requires contacts.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }
    return group;
  });

  // Create contact group - requires contacts.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { name: string; description?: string; allowRedial?: boolean };

    if (!body.name?.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Name is required' });
    }

    // Check for duplicate name
    const existing = await ctx.contactGroupRepo.findGroupByName(body.name.trim());
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'A group with this name already exists' });
    }

    const group = await ctx.contactGroupRepo.createGroup({
      name: body.name.trim(),
      description: body.description?.trim(),
      allowRedial: body.allowRedial ?? false,
    });

    return reply.status(201).send(group);
  });

  // Update contact group - requires contacts.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; description?: string; allowRedial?: boolean };

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    // If name is changing, check for duplicate
    if (body.name && body.name.trim() !== group.name) {
      const existing = await ctx.contactGroupRepo.findGroupByName(body.name.trim());
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'A group with this name already exists' });
      }
    }

    await ctx.contactGroupRepo.updateGroup(id, {
      name: body.name?.trim(),
      description: body.description?.trim(),
      allowRedial: body.allowRedial,
    });

    const updated = await ctx.contactGroupRepo.findGroupById(id);
    return updated;
  });

  // Delete contact group - requires contacts.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    await ctx.contactGroupRepo.deleteGroup(id);
    return { success: true };
  });

  // Get members of a group - requires contacts.view
  server.get('/:id/members', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { filter?: string; limit?: string; offset?: string };

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    const members = await ctx.contactGroupRepo.findMembersByGroup(id, {
      calledOnly: query.filter === 'called',
      uncalledOnly: query.filter === 'uncalled',
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return { members, total: group.totalMembers || 0 };
  });

  // Add single member to group - requires contacts.manage
  server.post('/:id/members', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { phoneNumber: string; name?: string };

    if (!body.phoneNumber?.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Phone number is required' });
    }

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    try {
      const member = await ctx.contactGroupRepo.addMember({
        groupId: id,
        phoneNumber: body.phoneNumber.trim(),
        name: body.name?.trim(),
      });
      return reply.status(201).send(member);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        return reply.status(409).send({ error: 'Conflict', message: 'Phone number already exists in this group' });
      }
      throw error;
    }
  });

  // Bulk add members (import) - requires contacts.manage
  server.post('/:id/members/bulk', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { members: Array<{ phoneNumber: string; name?: string }> };

    if (!Array.isArray(body.members) || body.members.length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Members array is required' });
    }

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    const result = await ctx.contactGroupRepo.addMembersBulk(id, body.members);
    return {
      success: true,
      added: result.added,
      skipped: result.skipped,
      message: `Added ${result.added} members, skipped ${result.skipped} duplicates`,
    };
  });

  // Remove member from group - requires contacts.manage
  server.delete('/:groupId/members/:memberId', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { groupId, memberId } = request.params as { groupId: string; memberId: string };

    const member = await ctx.contactGroupRepo.findMemberById(memberId);
    if (!member || member.groupId !== groupId) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in this group' });
    }

    await ctx.contactGroupRepo.removeMember(memberId);
    return { success: true };
  });

  // Clear all members from group - requires contacts.manage
  server.delete('/:id/members', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    const count = await ctx.contactGroupRepo.clearGroupMembers(id);
    return { success: true, removed: count };
  });

  // Export uncalled numbers from group (for campaign import) - requires contacts.view
  server.get('/:id/export', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { uncalledOnly?: string };

    const group = await ctx.contactGroupRepo.findGroupById(id);
    if (!group) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact group not found' });
    }

    const uncalledOnly = query.uncalledOnly !== 'false';
    const contacts = await ctx.contactGroupRepo.exportGroupToCampaign(id, uncalledOnly);

    return { contacts, count: contacts.length };
  });
}
