import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { PositionAnnounceConfig } from '../../db/repositories/queueRepository';

export function registerQueueRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get all queues - requires queues.view
  server.get('/', {
    preHandler: [ctx.requirePermission('queues.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const queues = await ctx.queueRepo.findAll();
    return { queues };
  });

  // Get single queue - requires queues.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('queues.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const queue = await ctx.queueRepo.findById(id);

    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    return queue;
  });

  // Create queue - requires queues.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      strategy?: 'ringall' | 'hunt' | 'random' | 'roundrobin' | 'leastrecent';
      timeoutSeconds?: number;
      retrySeconds?: number;
      maxWaitTime?: number;
      holdMusicPromptId?: string | null;
      joinAnnouncementId?: string | null;
      announceFrequency?: number;
      announcePosition?: number;
      // Dynamic position announcements
      positionAnnounceEnabled?: boolean;
      positionAnnounceVoice?: string | null;
      positionAnnounceProvider?: string;
      positionAnnounceLanguage?: string;
      positionAnnounceInterval?: number;
      positionAnnounceVariations?: PositionAnnounceConfig | null;
      enabled?: boolean;
      members?: { extensionNumber: string; penalty: number }[];
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'name is required' });
    }

    // Check if queue name already exists
    const existing = await ctx.queueRepo.findByName(body.name);
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'Queue with this name already exists' });
    }

    const queue = await ctx.queueRepo.create({
      name: body.name,
      strategy: body.strategy || 'ringall',
      timeoutSeconds: body.timeoutSeconds ?? 30,
      retrySeconds: body.retrySeconds ?? 5,
      maxWaitTime: body.maxWaitTime ?? 300,
      holdMusicPromptId: body.holdMusicPromptId || null,
      joinAnnouncementId: body.joinAnnouncementId || null,
      announceFrequency: body.announceFrequency ?? 0,
      announcePosition: body.announcePosition ?? 0,
      positionAnnounceEnabled: body.positionAnnounceEnabled ?? false,
      positionAnnounceVoice: body.positionAnnounceVoice || null,
      positionAnnounceProvider: body.positionAnnounceProvider || 'elevenlabs',
      positionAnnounceLanguage: body.positionAnnounceLanguage || 'en',
      positionAnnounceInterval: body.positionAnnounceInterval ?? 60,
      positionAnnounceVariations: body.positionAnnounceVariations || null,
      enabled: body.enabled ?? true,
    });

    // Add members if provided
    if (body.members && body.members.length > 0) {
      await ctx.queueRepo.setMembers(queue.id, body.members);
      queue.members = await ctx.queueRepo.getMembers(queue.id);
      queue.memberCount = queue.members.length;
    }

    // Pre-warm announcement cache if enabled
    if (queue.positionAnnounceEnabled && ctx.queueAnnouncementService) {
      ctx.queueAnnouncementService.prewarmCache(queue.id).catch(() => {});
    }

    return reply.status(201).send(queue);
  });

  // Update queue - requires queues.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      strategy?: 'ringall' | 'hunt' | 'random' | 'roundrobin' | 'leastrecent';
      timeoutSeconds?: number;
      retrySeconds?: number;
      maxWaitTime?: number;
      holdMusicPromptId?: string | null;
      joinAnnouncementId?: string | null;
      announceFrequency?: number;
      announcePosition?: number;
      // Dynamic position announcements
      positionAnnounceEnabled?: boolean;
      positionAnnounceVoice?: string | null;
      positionAnnounceProvider?: string;
      positionAnnounceLanguage?: string;
      positionAnnounceInterval?: number;
      positionAnnounceVariations?: PositionAnnounceConfig | null;
      enabled?: boolean;
      members?: { extensionNumber: string; penalty: number }[];
    };

    // Check if name change conflicts with existing queue
    if (body.name) {
      const existing = await ctx.queueRepo.findByName(body.name);
      if (existing && existing.id !== id) {
        return reply.status(409).send({ error: 'Conflict', message: 'Queue with this name already exists' });
      }
    }

    // Get existing queue to check for announcement config changes
    const existingQueue = await ctx.queueRepo.findById(id);
    const announcementConfigChanged = existingQueue && (
      body.positionAnnounceEnabled !== undefined ||
      body.positionAnnounceVoice !== undefined ||
      body.positionAnnounceLanguage !== undefined ||
      body.positionAnnounceVariations !== undefined
    );

    const queue = await ctx.queueRepo.update(id, {
      name: body.name,
      strategy: body.strategy,
      timeoutSeconds: body.timeoutSeconds,
      retrySeconds: body.retrySeconds,
      maxWaitTime: body.maxWaitTime,
      holdMusicPromptId: body.holdMusicPromptId,
      joinAnnouncementId: body.joinAnnouncementId,
      announceFrequency: body.announceFrequency,
      announcePosition: body.announcePosition,
      positionAnnounceEnabled: body.positionAnnounceEnabled,
      positionAnnounceVoice: body.positionAnnounceVoice,
      positionAnnounceProvider: body.positionAnnounceProvider,
      positionAnnounceLanguage: body.positionAnnounceLanguage,
      positionAnnounceInterval: body.positionAnnounceInterval,
      positionAnnounceVariations: body.positionAnnounceVariations,
      enabled: body.enabled,
    });

    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    // Update members if provided
    if (body.members !== undefined) {
      await ctx.queueRepo.setMembers(id, body.members);
      queue.members = await ctx.queueRepo.getMembers(id);
      queue.memberCount = queue.members.length;
    }

    // Clear and re-warm announcement cache if config changed
    if (announcementConfigChanged && ctx.queueAnnouncementService) {
      ctx.queueAnnouncementService.clearQueueCache(id);
      if (queue.positionAnnounceEnabled) {
        ctx.queueAnnouncementService.prewarmCache(id).catch(() => {});
      }
    }

    return queue;
  });

  // Delete queue - requires queues.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await ctx.queueRepo.delete(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    return { success: true };
  });

  // Get queue members - requires queues.view
  server.get('/:id/members', {
    preHandler: [ctx.requirePermission('queues.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const queue = await ctx.queueRepo.findById(id);

    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    return { members: queue.members || [] };
  });

  // Add member to queue - requires queues.manage
  server.post('/:id/members', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { extensionNumber: string; penalty?: number };

    if (!body.extensionNumber) {
      return reply.status(400).send({ error: 'Bad Request', message: 'extensionNumber is required' });
    }

    const queue = await ctx.queueRepo.findById(id);
    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    // Check if extension exists
    const extension = await ctx.extensionRepo.findByNumber(body.extensionNumber);
    if (!extension) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Extension not found' });
    }

    const member = await ctx.queueRepo.addMember(id, body.extensionNumber, body.penalty ?? 0);

    if (!member) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Failed to add member (may already exist)' });
    }

    return reply.status(201).send(member);
  });

  // Remove member from queue - requires queues.manage
  server.delete('/:id/members/:extensionNumber', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, extensionNumber } = request.params as { id: string; extensionNumber: string };

    const removed = await ctx.queueRepo.removeMember(id, extensionNumber);

    if (!removed) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found' });
    }

    return { success: true };
  });

  // Pause member in queue - requires queues.manage
  server.post('/:id/members/:extensionNumber/pause', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, extensionNumber } = request.params as { id: string; extensionNumber: string };

    const paused = await ctx.queueRepo.pauseMember(id, extensionNumber);

    if (!paused) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in queue' });
    }

    return { success: true, paused: true };
  });

  // Unpause member in queue - requires queues.manage
  server.post('/:id/members/:extensionNumber/unpause', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, extensionNumber } = request.params as { id: string; extensionNumber: string };

    const unpaused = await ctx.queueRepo.unpauseMember(id, extensionNumber);

    if (!unpaused) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in queue' });
    }

    return { success: true, paused: false };
  });

  // Update member penalty - requires queues.manage
  server.put('/:id/members/:extensionNumber', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, extensionNumber } = request.params as { id: string; extensionNumber: string };
    const body = request.body as { penalty?: number };

    if (body.penalty === undefined) {
      return reply.status(400).send({ error: 'Bad Request', message: 'penalty is required' });
    }

    const updated = await ctx.queueRepo.updateMemberPenalty(id, extensionNumber, body.penalty);

    if (!updated) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in queue' });
    }

    return { success: true, penalty: body.penalty };
  });

  // Get queue stats - requires queues.view
  server.get('/:id/stats', {
    preHandler: [ctx.requirePermission('queues.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const queue = await ctx.queueRepo.findById(id);

    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    const stats = await ctx.queueRepo.getStats(id);

    return {
      queueId: id,
      queueName: queue.name,
      ...stats,
    };
  });

  // =============================================
  // Position Announcement Endpoints
  // =============================================

  // Get position announcement for a queue (called by Asterisk AGI)
  // This is a public endpoint - no auth required as it's called from Asterisk
  server.post('/:id/announce', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      position: number;
      availableAgents?: number;
      avgHandleTimeSeconds?: number;
    };

    if (!ctx.queueAnnouncementService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Queue announcement service not initialized'
      });
    }

    if (typeof body.position !== 'number' || body.position < 1) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Valid position number is required'
      });
    }

    const stats = body.availableAgents !== undefined ? {
      availableAgents: body.availableAgents,
      avgHandleTimeSeconds: body.avgHandleTimeSeconds ?? 180
    } : await ctx.queueAnnouncementService.getQueueStats(id);

    const result = await ctx.queueAnnouncementService.generateAnnouncement(
      id,
      body.position,
      stats
    );

    if (!result) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Queue not found or announcements not enabled'
      });
    }

    return {
      audioPath: result.audioPath,
      text: result.text,
      cached: result.cached,
      position: result.position,
      estimatedWaitMinutes: result.estimatedWaitMinutes
    };
  });

  // Preview announcement for a specific position (for admin UI)
  server.get('/:id/announce/preview', {
    preHandler: [ctx.requirePermission('queues.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { position?: string };
    const position = parseInt(query.position || '1', 10);

    if (!ctx.queueAnnouncementService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Queue announcement service not initialized'
      });
    }

    const queue = await ctx.queueRepo.findById(id);
    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    // Generate announcement with mock stats for preview
    const result = await ctx.queueAnnouncementService.generateAnnouncement(
      id,
      position,
      { availableAgents: 2, avgHandleTimeSeconds: 180 }
    );

    if (!result) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Position announcements not enabled for this queue'
      });
    }

    return {
      text: result.text,
      audioPath: result.audioPath,
      position: result.position,
      estimatedWaitMinutes: result.estimatedWaitMinutes
    };
  });

  // Pre-warm announcement cache - requires queues.manage
  server.post('/:id/announce/prewarm', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { maxPosition?: number };

    if (!ctx.queueAnnouncementService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Queue announcement service not initialized'
      });
    }

    const queue = await ctx.queueRepo.findById(id);
    if (!queue) {
      return reply.status(404).send({ error: 'Not Found', message: 'Queue not found' });
    }

    if (!queue.positionAnnounceEnabled) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Position announcements not enabled for this queue'
      });
    }

    // Start pre-warming in background
    ctx.queueAnnouncementService.prewarmCache(id, body.maxPosition || 20).catch(() => {});

    return {
      success: true,
      message: `Pre-warming cache for positions 1-${body.maxPosition || 20}`
    };
  });

  // Clear announcement cache - requires queues.manage
  server.delete('/:id/announce/cache', {
    preHandler: [ctx.requirePermission('queues.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!ctx.queueAnnouncementService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Queue announcement service not initialized'
      });
    }

    ctx.queueAnnouncementService.clearQueueCache(id);

    return { success: true, message: 'Cache cleared' };
  });
}
