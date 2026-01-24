/**
 * AI Insights API Routes
 * Endpoints for managing AI-generated insights including intents, FAQs, and agent scores
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export async function aiInsightsRoutes(
  fastify: FastifyInstance,
  opts: { prefix?: string }
): Promise<void> {
  const ctx = fastify.ctx as ApiContext;

  // ==========================================
  // DASHBOARD
  // ==========================================

  fastify.get('/dashboard', {
    schema: {
      description: 'Get AI insights dashboard summary',
      tags: ['AI Insights'],
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return ctx.aiInsightsService.getDashboard();
  });

  // ==========================================
  // INTENTS
  // ==========================================

  fastify.get('/intents', {
    schema: {
      description: 'Get intent distribution',
      tags: ['AI Insights'],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', default: 30 },
        },
      },
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { days?: number } }>, reply: FastifyReply) => {
    const days = request.query.days || 30;
    return ctx.aiInsightsService.getIntentDistribution(days);
  });

  fastify.post('/intents/classify/:conversationId', {
    schema: {
      description: 'Classify intent for a conversation',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const result = await ctx.aiInsightsService.classifyIntent(request.params.conversationId);
    if (!result) {
      return reply.code(400).send({ error: 'Failed to classify intent' });
    }
    return result;
  });

  // ==========================================
  // FAQs
  // ==========================================

  fastify.get('/faqs', {
    schema: {
      description: 'Get top FAQs',
      tags: ['AI Insights'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
        },
      },
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
    const limit = request.query.limit || 20;
    return ctx.aiInsightsService.getTopFAQs(limit);
  });

  fastify.post('/faqs/extract/:conversationId', {
    schema: {
      description: 'Extract FAQs from a conversation',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const result = await ctx.aiInsightsService.extractFAQs(request.params.conversationId);
    if (!result) {
      return reply.code(400).send({ error: 'Failed to extract FAQs' });
    }
    return result;
  });

  fastify.put('/faqs/:id/answer', {
    schema: {
      description: 'Update FAQ suggested answer',
      tags: ['AI Insights'],
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
          suggestedAnswer: { type: 'string' },
        },
        required: ['suggestedAnswer'],
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: { suggestedAnswer: string };
  }>, reply: FastifyReply) => {
    const success = await ctx.aiInsightsService.updateFAQAnswer(
      request.params.id,
      request.body.suggestedAnswer
    );
    if (!success) {
      return reply.code(404).send({ error: 'FAQ not found' });
    }
    return { success: true };
  });

  // ==========================================
  // AGENT SCORES
  // ==========================================

  fastify.get('/agents/scores', {
    schema: {
      description: 'Get all agent scores',
      tags: ['AI Insights'],
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return ctx.aiInsightsService.getAllAgentScores();
  });

  fastify.get('/agents/:agentId/score', {
    schema: {
      description: 'Get score for a specific agent',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string', format: 'uuid' },
        },
        required: ['agentId'],
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { agentId: string } }>, reply: FastifyReply) => {
    const score = await ctx.aiInsightsService.getAgentScore(request.params.agentId);
    if (!score) {
      return reply.code(404).send({ error: 'Agent score not found' });
    }
    return score;
  });

  fastify.post('/agents/:agentId/score', {
    schema: {
      description: 'Calculate and update score for an agent',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string', format: 'uuid' },
        },
        required: ['agentId'],
      },
      response: {
        200: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { agentId: string } }>, reply: FastifyReply) => {
    const score = await ctx.aiInsightsService.scoreAgent(request.params.agentId);
    if (!score) {
      return reply.code(400).send({ error: 'Failed to calculate agent score' });
    }
    return score;
  });

  fastify.post('/agents/score-all', {
    schema: {
      description: 'Calculate scores for all agents',
      tags: ['AI Insights'],
      response: {
        200: {
          type: 'object',
          properties: {
            scores: { type: 'array' },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const scores = await ctx.aiInsightsService.scoreAllAgents();
    return { scores, count: scores.length };
  });

  // ==========================================
  // TOPICS
  // ==========================================

  fastify.get('/topics', {
    schema: {
      description: 'Get top topics',
      tags: ['AI Insights'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
        },
      },
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
    const limit = request.query.limit || 20;
    return ctx.aiInsightsService.getTopTopics(limit);
  });

  fastify.post('/topics/extract/:conversationId', {
    schema: {
      description: 'Extract topics from a conversation',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'array' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    const topics = await ctx.aiInsightsService.extractTopics(request.params.conversationId);
    return topics;
  });

  // ==========================================
  // PROCESS CONVERSATION
  // ==========================================

  fastify.post('/process/:conversationId', {
    schema: {
      description: 'Process a conversation for all insights (intent, FAQs, topics)',
      tags: ['AI Insights'],
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
        },
        required: ['conversationId'],
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) => {
    await ctx.aiInsightsService.processConversation(request.params.conversationId);
    return { success: true };
  });
}
