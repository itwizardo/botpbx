/**
 * Call Summary API Routes
 * Endpoints for managing AI-generated call summaries
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export async function callSummaryRoutes(
  fastify: FastifyInstance,
  opts: { prefix?: string }
): Promise<void> {
  const ctx = fastify.ctx as ApiContext;

  // ==========================================
  // LIST SUMMARIES
  // ==========================================

  fastify.get('/', {
    schema: {
      description: 'List call summaries with pagination',
      tags: ['Call Summaries'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
          followUpNeeded: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            summaries: { type: 'array' },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Querystring: {
      limit?: number;
      offset?: number;
      sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
      followUpNeeded?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { limit = 50, offset = 0, sentiment, followUpNeeded } = request.query;

    let summaries;

    if (followUpNeeded === true) {
      summaries = await ctx.callSummaryRepo.findByFollowUpNeeded(limit);
    } else if (sentiment) {
      summaries = await ctx.callSummaryRepo.findBySentiment(sentiment, limit);
    } else {
      summaries = await ctx.callSummaryRepo.findRecent(limit, offset);
    }

    const total = await ctx.callSummaryRepo.count();

    return { summaries, total };
  });

  // ==========================================
  // GET SUMMARY STATS
  // ==========================================

  fastify.get('/stats', {
    schema: {
      description: 'Get call summary statistics',
      tags: ['Call Summaries'],
      response: {
        200: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            followUpNeeded: { type: 'number' },
            bySentiment: { type: 'object' },
            avgTokensUsed: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return ctx.callSummaryService.getStats();
  });

  // ==========================================
  // GET SUMMARY BY ID
  // ==========================================

  fastify.get('/:id', {
    schema: {
      description: 'Get a call summary by ID',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const summary = await ctx.callSummaryRepo.findById(request.params.id);
    if (!summary) {
      return reply.code(404).send({ error: 'Summary not found' });
    }
    return summary;
  });

  // ==========================================
  // GET SUMMARY BY CONVERSATION ID
  // ==========================================

  fastify.get('/conversation/:conversationId', {
    schema: {
      description: 'Get summary for a specific conversation',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const summary = await ctx.callSummaryService.getSummary(request.params.conversationId);
    if (!summary) {
      return reply.code(404).send({ error: 'Summary not found for this conversation' });
    }
    return summary;
  });

  // ==========================================
  // GENERATE SUMMARY FOR CONVERSATION
  // ==========================================

  fastify.post('/conversation/:conversationId/generate', {
    schema: {
      description: 'Generate a summary for a conversation',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            summary: { type: 'object' },
            tokensUsed: { type: 'number' },
            latencyMs: { type: 'number' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const result = await ctx.callSummaryService.generateSummary(request.params.conversationId);
    if (!result.success) {
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  // ==========================================
  // REGENERATE SUMMARY
  // ==========================================

  fastify.post('/conversation/:conversationId/regenerate', {
    schema: {
      description: 'Regenerate summary for a conversation (deletes existing)',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            summary: { type: 'object' },
            tokensUsed: { type: 'number' },
            latencyMs: { type: 'number' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const result = await ctx.callSummaryService.regenerateSummary(request.params.conversationId);
    if (!result.success) {
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  // ==========================================
  // UPDATE FOLLOW-UP STATUS
  // ==========================================

  fastify.put('/:id/follow-up', {
    schema: {
      description: 'Update follow-up status for a summary',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          followUpNeeded: { type: 'boolean' },
          followUpNotes: { type: 'string' },
        },
        required: ['followUpNeeded'],
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: { followUpNeeded: boolean; followUpNotes?: string };
  }>, reply: FastifyReply) => {
    const { followUpNeeded, followUpNotes } = request.body;
    const success = await ctx.callSummaryService.updateFollowUp(
      request.params.id,
      followUpNeeded,
      followUpNotes
    );

    if (!success) {
      return reply.code(404).send({ error: 'Summary not found' });
    }

    return { success: true };
  });

  // ==========================================
  // GET FOLLOW-UP REQUIRED
  // ==========================================

  fastify.get('/follow-up-required', {
    schema: {
      description: 'Get all summaries requiring follow-up',
      tags: ['Call Summaries'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
        },
      },
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
    const limit = request.query.limit || 50;
    return ctx.callSummaryService.getFollowUpRequired(limit);
  });

  // ==========================================
  // DELETE SUMMARY
  // ==========================================

  fastify.delete('/:id', {
    schema: {
      description: 'Delete a call summary',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const success = await ctx.callSummaryRepo.delete(request.params.id);
    if (!success) {
      return reply.code(404).send({ error: 'Summary not found' });
    }
    return { success: true };
  });

  // ==========================================
  // GET CONVERSATION DATA (for frontend)
  // ==========================================

  fastify.get('/conversation/:conversationId/data', {
    schema: {
      description: 'Get full conversation data with turns',
      tags: ['Call Summaries'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const data = await ctx.callSummaryService.getConversationData(request.params.conversationId);
    if (!data) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    // Also get the summary if it exists
    const summary = await ctx.callSummaryService.getSummary(request.params.conversationId);

    return {
      ...data,
      summary,
    };
  });
}
