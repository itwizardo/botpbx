/**
 * AI Analytics API Routes
 * Endpoints for AI conversation analytics and metrics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerAIAnalyticsRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get dashboard summary - requires analytics.view
  server.get('/dashboard', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '7' } = request.query as { days?: string };
    const daysNum = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);

    const summary = await ctx.aiAnalyticsRepo.getDashboardSummary(daysNum);
    return summary;
  });

  // Get overall stats - requires analytics.view
  server.get('/stats', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const stats = await ctx.aiAnalyticsRepo.getOverallStats(start, end);
    return stats;
  });

  // Get sentiment breakdown - requires analytics.view
  server.get('/sentiment', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const sentiment = await ctx.aiAnalyticsRepo.getSentimentBreakdown(start, end);
    return sentiment;
  });

  // Get outcome distribution - requires analytics.view
  server.get('/outcomes', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const outcomes = await ctx.aiAnalyticsRepo.getOutcomeDistribution(start, end);
    return outcomes;
  });

  // Get latency metrics - requires analytics.view
  server.get('/latency', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const latency = await ctx.aiAnalyticsRepo.getLatencyMetrics(start, end);
    return latency;
  });

  // Get per-agent stats - requires analytics.view
  server.get('/agents', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const agents = await ctx.aiAnalyticsRepo.getAgentStats(undefined, start, end);
    return { agents };
  });

  // Get stats for a specific agent - requires analytics.view
  server.get('/agents/:agentId', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentId } = request.params as { agentId: string };
    const { startDate, endDate } = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const agents = await ctx.aiAnalyticsRepo.getAgentStats(agentId, start, end);
    if (agents.length === 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Agent not found or has no data',
      });
    }

    return agents[0];
  });

  // Get daily stats - requires analytics.view
  server.get('/daily', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '30' } = request.query as { days?: string };
    const daysNum = Math.min(Math.max(parseInt(days, 10) || 30, 1), 90);

    const dailyStats = await ctx.aiAnalyticsRepo.getDailyStats(daysNum);
    return { dailyStats };
  });

  // Get hourly distribution - requires analytics.view
  server.get('/hourly', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '7' } = request.query as { days?: string };
    const daysNum = Math.min(Math.max(parseInt(days, 10) || 7, 1), 30);

    const hourlyStats = await ctx.aiAnalyticsRepo.getHourlyDistribution(daysNum);
    return { hourlyStats };
  });

  // Get recent conversations - requires analytics.view
  server.get('/conversations/recent', {
    preHandler: [ctx.requirePermission('analytics.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '20' } = request.query as { limit?: string };
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const conversations = await ctx.aiAnalyticsRepo.getRecentConversations(limitNum);
    return { conversations };
  });
}
