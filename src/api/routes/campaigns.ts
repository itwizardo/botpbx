import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerCampaignRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List campaigns - requires campaigns.view
  server.get('/', {
    preHandler: [ctx.requirePermission('campaigns.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await ctx.campaignRepo.findAll();
    return { campaigns };
  });

  // Get single campaign - requires campaigns.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('campaigns.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    return campaign;
  });

  // Get campaign contacts - requires campaigns.view
  // Uses SQL-level pagination to handle large campaigns (10k+ contacts)
  server.get('/:id/contacts', {
    preHandler: [ctx.requirePermission('campaigns.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status, limit = '100', offset = '0' } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    const limitNum = Math.min(parseInt(limit, 10), 500); // Cap at 500 per page
    const offsetNum = parseInt(offset, 10);

    // Use SQL-level pagination to avoid loading all contacts into memory
    const result = await ctx.campaignContactRepo.findByCampaignPaginated(id, {
      status,
      limit: limitNum,
      offset: offsetNum,
    });

    return {
      contacts: result.contacts,
      total: result.total,
    };
  });

  // Create campaign - requires campaigns.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('campaigns.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      description?: string;
      handlerType?: 'ivr' | 'ai_agent' | 'ring_group' | 'extension';
      ivrMenuId?: string;
      aiAgentId?: string;
      ringGroupId?: string;
      targetExtensions?: string;
      trunkId?: string;
      callerId?: string;
      callsPerMinute?: number;
      maxConcurrent?: number;
      retryAttempts?: number;
      retryDelayMinutes?: number;
      holdMusicPromptId?: string;
      transferTrunkId?: string;
      transferDestination?: string;
      transferMode?: 'internal' | 'trunk';
      amdEnabled?: boolean;
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Campaign name required' });
    }

    // Validate handler type has corresponding ID
    const handlerType = body.handlerType || 'ivr';
    if (handlerType === 'ai_agent' && !body.aiAgentId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'AI Agent ID required when handler type is ai_agent' });
    }
    if (handlerType === 'ivr' && !body.ivrMenuId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'IVR Menu ID required when handler type is ivr' });
    }

    const campaign = await ctx.campaignRepo.create({
      name: body.name,
      description: body.description || null,
      status: 'paused',
      handlerType: handlerType,
      ivrMenuId: body.ivrMenuId || null,
      aiAgentId: body.aiAgentId || null,
      ringGroupId: body.ringGroupId || null,
      targetExtensions: body.targetExtensions || null,
      trunkId: body.trunkId || null,
      callerId: body.callerId || null,
      callsPerMinute: body.callsPerMinute || 10,
      maxConcurrent: body.maxConcurrent || 10,
      retryAttempts: body.retryAttempts || 3,
      retryDelayMinutes: body.retryDelayMinutes || 30,
      holdMusicPromptId: body.holdMusicPromptId || null,
      transferTrunkId: body.transferTrunkId || null,
      transferDestination: body.transferDestination || null,
      transferMode: body.transferMode || 'internal',
      amdEnabled: body.amdEnabled !== false,
    });

    return reply.status(201).send(campaign);
  });

  // Update campaign - requires campaigns.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('campaigns.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      description: string;
      handlerType: 'ivr' | 'ai_agent' | 'ring_group' | 'extension';
      ivrMenuId: string;
      aiAgentId: string;
      ringGroupId: string;
      targetExtensions: string;
      trunkId: string;
      callerId: string;
      callsPerMinute: number;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelayMinutes: number;
      holdMusicPromptId: string;
      transferTrunkId: string;
      transferDestination: string;
      transferMode: 'internal' | 'trunk';
      amdEnabled: boolean;
    }>;

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    const success = await ctx.campaignRepo.update(id, body);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update campaign' });
    }

    const updated = await ctx.campaignRepo.findById(id);
    return updated;
  });

  // Delete campaign - requires campaigns.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('campaigns.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    const success = await ctx.campaignRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete campaign' });
    }

    return { success: true };
  });

  // Start campaign - requires campaigns.start_stop
  server.post('/:id/start', {
    preHandler: [ctx.requirePermission('campaigns.start_stop')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (campaign.status === 'running') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Campaign already running' });
    }

    // Check if dialer service is available
    if (!ctx.dialerService) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'Dialer service not available' });
    }

    // Start the campaign via dialer service
    const result = await ctx.dialerService.startCampaign(id);
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error || 'Failed to start campaign' });
    }

    // Broadcast to WebSocket clients
    ctx.wsManager.broadcast('campaigns', 'campaign:started', {
      campaignId: id,
      name: campaign.name,
    });

    return { success: true, status: 'running' };
  });

  // Pause campaign - requires campaigns.start_stop
  server.post('/:id/pause', {
    preHandler: [ctx.requirePermission('campaigns.start_stop')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (campaign.status !== 'running') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Campaign is not running' });
    }

    // Check if dialer service is available
    if (!ctx.dialerService) {
      await ctx.campaignRepo.updateStatus(id, 'paused');
    } else {
      const result = await ctx.dialerService.pauseCampaign(id);
      if (!result.success) {
        return reply.status(400).send({ error: 'Bad Request', message: result.error || 'Failed to pause campaign' });
      }
    }

    // Broadcast to WebSocket clients
    ctx.wsManager.broadcast('campaigns', 'campaign:paused', {
      campaignId: id,
      name: campaign.name,
    });

    return { success: true, status: 'paused' };
  });

  // Stop campaign (complete it) - requires campaigns.start_stop
  server.post('/:id/stop', {
    preHandler: [ctx.requirePermission('campaigns.start_stop')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (campaign.status === 'completed') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Campaign is already completed' });
    }

    // Stop via dialer service if available
    if (ctx.dialerService) {
      await ctx.dialerService.stopCampaign(id);
    } else {
      await ctx.campaignRepo.updateStatus(id, 'completed');
    }

    // Broadcast to WebSocket clients
    ctx.wsManager.broadcast('campaigns', 'campaign:stopped', {
      campaignId: id,
      name: campaign.name,
    });

    return { success: true, status: 'completed' };
  });

  // Add contacts to campaign - requires campaigns.manage
  server.post('/:id/contacts', {
    preHandler: [ctx.requirePermission('campaigns.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      contacts: Array<{ phoneNumber: string; name?: string }>;
    };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (!body.contacts || !Array.isArray(body.contacts)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'contacts array required' });
    }

    let added = 0;
    for (const contact of body.contacts) {
      if (contact.phoneNumber) {
        await ctx.campaignContactRepo.create(id, {
          phoneNumber: contact.phoneNumber,
          name: contact.name,
        });
        added++;
      }
    }

    // Update campaign total
    await ctx.campaignRepo.setTotalContacts(id, campaign.totalContacts + added);

    return { success: true, added };
  });

  // Get campaign stats - requires campaigns.view
  server.get('/:id/stats', {
    preHandler: [ctx.requirePermission('campaigns.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const campaign = await ctx.campaignRepo.findById(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    const stats = await ctx.campaignContactRepo.countByStatus(id);

    return {
      campaignId: id,
      name: campaign.name,
      status: campaign.status,
      ...stats,
      progress: campaign.totalContacts > 0
        ? Math.round((campaign.dialedCount / campaign.totalContacts) * 100)
        : 0,
    };
  });
}
