/**
 * AI Agent Metrics API Routes (Fastify)
 * Analytics and performance metrics for AI agents
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

interface AgentMetric {
  id: string;
  agent_id: string;
  date: string;
  total_calls: number;
  successful_calls: number;
  avg_duration_seconds: number;
  avg_sentiment: number;
  transfer_rate: number;
  total_cost_cents: number;
}

interface MetricsSummary {
  totalCalls: number;
  successfulCalls: number;
  successRate: number;
  avgDuration: number;
  avgSentiment: number;
  transferRate: number;
  totalCost: number;
}

interface DailyMetric {
  date: string;
  totalCalls: number;
  successfulCalls: number;
  avgDuration: number;
  avgSentiment: number;
}

export function registerAIMetricsRoutes(server: FastifyInstance, ctx: ApiContext) {
  // GET /api/v1/ai/metrics/overview - Get overall metrics summary
  server.get('/metrics/overview', async (request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      const { period = '30d' } = request.query;
      const days = parseInt(period) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get aggregated metrics from call logs
      const callStats = await ctx.db.get<{
        total_calls: number;
        successful_calls: number;
        avg_duration: number;
        total_cost: number;
      }>(`
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_calls,
          AVG(duration) as avg_duration,
          SUM(COALESCE(cost_cents, 0)) as total_cost
        FROM call_logs
        WHERE agent_id IS NOT NULL
          AND timestamp >= $1
      `, [startDateStr]);

      // Get sentiment data from ai_call_analytics
      const sentimentStats = await ctx.db.get<{
        avg_sentiment: number;
        avg_transfer_rate: number;
      }>(`
        SELECT
          AVG(CASE
            WHEN sentiment = 'positive' THEN 1.0
            WHEN sentiment = 'neutral' THEN 0.5
            ELSE 0.0
          END) as avg_sentiment,
          AVG(CASE WHEN transferred = true THEN 1.0 ELSE 0.0 END) as avg_transfer_rate
        FROM ai_call_analytics
        WHERE created_at >= $1
      `, [startDateStr]);

      const summary: MetricsSummary = {
        totalCalls: callStats?.total_calls || 0,
        successfulCalls: callStats?.successful_calls || 0,
        successRate: callStats?.total_calls ? (callStats.successful_calls / callStats.total_calls) * 100 : 0,
        avgDuration: Math.round(callStats?.avg_duration || 0),
        avgSentiment: sentimentStats?.avg_sentiment || 0.5,
        transferRate: (sentimentStats?.avg_transfer_rate || 0) * 100,
        totalCost: (callStats?.total_cost || 0) / 100, // Convert cents to dollars
      };

      return { success: true, data: summary };
    } catch (error) {
      request.log.error(error, 'Failed to get metrics overview');
      return reply.status(500).send({ success: false, error: 'Failed to get metrics overview' });
    }
  });

  // GET /api/v1/ai/metrics/daily - Get daily metrics trend
  server.get('/metrics/daily', async (request: FastifyRequest<{ Querystring: { period?: string; agentId?: string } }>, reply: FastifyReply) => {
    try {
      const { period = '30d', agentId } = request.query;
      const days = parseInt(period) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      let query = `
        SELECT
          date(timestamp) as date,
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_calls,
          AVG(duration) as avg_duration
        FROM call_logs
        WHERE agent_id IS NOT NULL
          AND timestamp >= $1
      `;
      const params: (string | undefined)[] = [startDateStr];

      if (agentId) {
        query += ` AND agent_id = $2`;
        params.push(agentId);
      }

      query += ` GROUP BY date(timestamp) ORDER BY date ASC`;

      const dailyData = await ctx.db.all<{
        date: string;
        total_calls: number;
        successful_calls: number;
        avg_duration: number;
      }>(query, params.filter(p => p !== undefined));

      const metrics: DailyMetric[] = dailyData.map(row => ({
        date: row.date,
        totalCalls: row.total_calls,
        successfulCalls: row.successful_calls,
        avgDuration: Math.round(row.avg_duration || 0),
        avgSentiment: 0.5, // Default, can be calculated from analytics table
      }));

      return { success: true, data: metrics };
    } catch (error) {
      request.log.error(error, 'Failed to get daily metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get daily metrics' });
    }
  });

  // GET /api/v1/ai/metrics/agents/:id - Get metrics for specific agent
  server.get('/metrics/agents/:id', async (request: FastifyRequest<{ Params: { id: string }; Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { period = '30d' } = request.query;
      const days = parseInt(period) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get agent info
      const agent = await ctx.db.get<{ name: string }>('SELECT name FROM ai_agents WHERE id = $1', [id]);
      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      // Get call stats for this agent
      const callStats = await ctx.db.get<{
        total_calls: number;
        successful_calls: number;
        avg_duration: number;
      }>(`
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_calls,
          AVG(duration) as avg_duration
        FROM call_logs
        WHERE agent_id = $1
          AND timestamp >= $2
      `, [id, startDateStr]);

      // Get function usage from conversation turns
      const functionUsage = await ctx.db.all<{ function_name: string; count: number }>(`
        SELECT t.function_name, COUNT(*) as count
        FROM ai_conversation_turns t
        JOIN ai_conversations c ON t.conversation_id = c.id
        WHERE c.ai_agent_id = $1
          AND c.start_time >= $2
          AND t.function_name IS NOT NULL
        GROUP BY t.function_name
        ORDER BY count DESC
      `, [id, startDateStr]);

      // Get sentiment distribution from conversations
      const sentimentDist = await ctx.db.all<{ sentiment: string; count: number }>(`
        SELECT
          CASE
            WHEN sentiment_score > 0.3 THEN 'positive'
            WHEN sentiment_score < -0.3 THEN 'negative'
            ELSE 'neutral'
          END as sentiment,
          COUNT(*) as count
        FROM ai_conversations
        WHERE ai_agent_id = $1
          AND start_time >= $2
        GROUP BY
          CASE
            WHEN sentiment_score > 0.3 THEN 'positive'
            WHEN sentiment_score < -0.3 THEN 'negative'
            ELSE 'neutral'
          END
      `, [id, startDateStr]);

      return {
        success: true,
        data: {
          agentName: agent.name,
          summary: {
            totalCalls: callStats?.total_calls || 0,
            successfulCalls: callStats?.successful_calls || 0,
            successRate: callStats?.total_calls ? (callStats.successful_calls / callStats.total_calls) * 100 : 0,
            avgDuration: Math.round(callStats?.avg_duration || 0),
          },
          functionUsage: functionUsage.map(f => ({
            name: f.function_name,
            count: f.count,
          })),
          sentimentDistribution: sentimentDist.map(s => ({
            sentiment: s.sentiment,
            count: s.count,
          })),
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to get agent metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get agent metrics' });
    }
  });

  // GET /api/v1/ai/metrics/agents - Get metrics comparison for all agents
  server.get('/metrics/agents', async (request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      const { period = '30d' } = request.query;
      const days = parseInt(period) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      const agentMetrics = await ctx.db.all<{
        agent_id: string;
        agent_name: string;
        total_calls: number;
        successful_calls: number;
        avg_duration: number;
      }>(`
        SELECT
          a.id as agent_id,
          a.name as agent_name,
          COUNT(c.id) as total_calls,
          SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as successful_calls,
          AVG(c.duration) as avg_duration
        FROM ai_agents a
        LEFT JOIN call_logs c ON c.agent_id = a.id AND c.timestamp >= $1
        GROUP BY a.id, a.name
        ORDER BY total_calls DESC
      `, [startDateStr]);

      const metrics = agentMetrics.map(row => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        totalCalls: row.total_calls || 0,
        successfulCalls: row.successful_calls || 0,
        successRate: row.total_calls ? ((row.successful_calls || 0) / row.total_calls) * 100 : 0,
        avgDuration: Math.round(row.avg_duration || 0),
      }));

      return { success: true, data: metrics };
    } catch (error) {
      request.log.error(error, 'Failed to get agents metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get agents metrics' });
    }
  });

  // GET /api/v1/ai/metrics/top-functions - Get most used functions
  server.get('/metrics/top-functions', async (request: FastifyRequest<{ Querystring: { period?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const { period = '30d', limit = '10' } = request.query;
      const days = parseInt(period) || 30;
      const limitNum = parseInt(limit) || 10;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      const topFunctions = await ctx.db.all<{ function_name: string; call_count: number; success_rate: number }>(`
        SELECT
          t.function_name,
          COUNT(*) as call_count,
          100.0 as success_rate
        FROM ai_conversation_turns t
        JOIN ai_conversations c ON t.conversation_id = c.id
        WHERE c.start_time >= $1
          AND t.function_name IS NOT NULL
        GROUP BY t.function_name
        ORDER BY call_count DESC
        LIMIT $2
      `, [startDateStr, limitNum]);

      return {
        success: true,
        data: topFunctions.map(f => ({
          name: f.function_name,
          count: f.call_count,
          successRate: Math.round(f.success_rate || 0),
        })),
      };
    } catch (error) {
      request.log.error(error, 'Failed to get top functions');
      return reply.status(500).send({ success: false, error: 'Failed to get top functions' });
    }
  });
}
