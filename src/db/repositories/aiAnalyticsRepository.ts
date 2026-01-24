/**
 * AI Analytics Repository
 * Provides analytics and metrics for AI conversations
 */

import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// ==========================================
// ANALYTICS INTERFACES
// ==========================================

export interface AIConversationStats {
  totalConversations: number;
  completedConversations: number;
  failedConversations: number;
  transferredConversations: number;
  averageDurationSeconds: number;
  averageTurns: number;
  successRate: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
  unknown: number;
}

export interface OutcomeDistribution {
  completed: number;
  transferred: number;
  abandoned: number;
  failed: number;
  other: number;
}

export interface LatencyMetrics {
  avgSttLatencyMs: number;
  avgLlmLatencyMs: number;
  avgTtsLatencyMs: number;
  avgTotalLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface AgentStats {
  agentId: string;
  agentName: string;
  totalCalls: number;
  completedCalls: number;
  successRate: number;
  averageDurationSeconds: number;
  averageTurns: number;
  sentimentBreakdown: SentimentBreakdown;
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  completedCalls: number;
  averageDurationSeconds: number;
}

export interface HourlyStats {
  hour: number;
  totalCalls: number;
  averageDurationSeconds: number;
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class AIAnalyticsRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Get overall AI conversation stats for a date range
   */
  async getOverallStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<AIConversationStats> {
    let query = `
      SELECT
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE state = 'ended' OR outcome = 'completed') as completed_conversations,
        COUNT(*) FILTER (WHERE outcome = 'error') as failed_conversations,
        COUNT(*) FILTER (WHERE outcome = 'transferred') as transferred_conversations,
        COALESCE(AVG(total_duration_seconds), 0)::INTEGER as average_duration_seconds,
        COALESCE((SELECT AVG(turn_count)::INTEGER FROM (SELECT conversation_id, COUNT(*) as turn_count FROM ai_conversation_turns GROUP BY conversation_id) t), 0) as average_turns
      FROM ai_conversations
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` WHERE start_time >= $1 AND start_time <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` WHERE start_time >= $1`;
      params.push(startDate);
    }

    const result = await this.db.get<{
      total_conversations: string;
      completed_conversations: string;
      failed_conversations: string;
      transferred_conversations: string;
      average_duration_seconds: string;
      average_turns: string;
    }>(query, params);

    const total = parseInt(result?.total_conversations || '0', 10);
    const completed = parseInt(result?.completed_conversations || '0', 10);

    return {
      totalConversations: total,
      completedConversations: completed,
      failedConversations: parseInt(result?.failed_conversations || '0', 10),
      transferredConversations: parseInt(result?.transferred_conversations || '0', 10),
      averageDurationSeconds: parseInt(result?.average_duration_seconds || '0', 10),
      averageTurns: parseInt(result?.average_turns || '0', 10),
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }

  /**
   * Get sentiment breakdown for AI conversations
   */
  async getSentimentBreakdown(
    startDate?: Date,
    endDate?: Date
  ): Promise<SentimentBreakdown> {
    let query = `
      SELECT
        COUNT(*) FILTER (WHERE sentiment_score > 0.3) as positive,
        COUNT(*) FILTER (WHERE sentiment_score BETWEEN -0.3 AND 0.3) as neutral,
        COUNT(*) FILTER (WHERE sentiment_score < -0.3) as negative,
        0 as mixed,
        COUNT(*) FILTER (WHERE sentiment_score IS NULL) as unknown
      FROM ai_conversations
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` WHERE start_time >= $1 AND start_time <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` WHERE start_time >= $1`;
      params.push(startDate);
    }

    const result = await this.db.get<{
      positive: string;
      neutral: string;
      negative: string;
      mixed: string;
      unknown: string;
    }>(query, params);

    return {
      positive: parseInt(result?.positive || '0', 10),
      neutral: parseInt(result?.neutral || '0', 10),
      negative: parseInt(result?.negative || '0', 10),
      mixed: parseInt(result?.mixed || '0', 10),
      unknown: parseInt(result?.unknown || '0', 10),
    };
  }

  /**
   * Get outcome distribution for AI conversations
   */
  async getOutcomeDistribution(
    startDate?: Date,
    endDate?: Date
  ): Promise<OutcomeDistribution> {
    let query = `
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'completed') as completed,
        COUNT(*) FILTER (WHERE outcome = 'transferred') as transferred,
        COUNT(*) FILTER (WHERE outcome = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE outcome = 'failed') as failed,
        COUNT(*) FILTER (WHERE outcome NOT IN ('completed', 'transferred', 'abandoned', 'failed') OR outcome IS NULL) as other
      FROM ai_conversations
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` WHERE start_time >= $1 AND start_time <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` WHERE start_time >= $1`;
      params.push(startDate);
    }

    const result = await this.db.get<{
      completed: string;
      transferred: string;
      abandoned: string;
      failed: string;
      other: string;
    }>(query, params);

    return {
      completed: parseInt(result?.completed || '0', 10),
      transferred: parseInt(result?.transferred || '0', 10),
      abandoned: parseInt(result?.abandoned || '0', 10),
      failed: parseInt(result?.failed || '0', 10),
      other: parseInt(result?.other || '0', 10),
    };
  }

  /**
   * Get latency metrics from conversation turns
   */
  async getLatencyMetrics(
    startDate?: Date,
    endDate?: Date
  ): Promise<LatencyMetrics> {
    let query = `
      SELECT
        COALESCE(AVG(total_stt_latency_ms), 0)::INTEGER as avg_stt_latency_ms,
        COALESCE(AVG(total_llm_latency_ms), 0)::INTEGER as avg_llm_latency_ms,
        COALESCE(AVG(total_tts_latency_ms), 0)::INTEGER as avg_tts_latency_ms,
        COALESCE(AVG(total_llm_latency_ms), 0)::INTEGER as avg_total_latency_ms,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_llm_latency_ms), 0)::INTEGER as p50_latency_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_llm_latency_ms), 0)::INTEGER as p95_latency_ms,
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_llm_latency_ms), 0)::INTEGER as p99_latency_ms
      FROM ai_conversations c
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` WHERE c.start_time >= $1 AND c.start_time <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` WHERE c.start_time >= $1`;
      params.push(startDate);
    }

    const result = await this.db.get<{
      avg_stt_latency_ms: string;
      avg_llm_latency_ms: string;
      avg_tts_latency_ms: string;
      avg_total_latency_ms: string;
      p50_latency_ms: string;
      p95_latency_ms: string;
      p99_latency_ms: string;
    }>(query, params);

    return {
      avgSttLatencyMs: parseInt(result?.avg_stt_latency_ms || '0', 10),
      avgLlmLatencyMs: parseInt(result?.avg_llm_latency_ms || '0', 10),
      avgTtsLatencyMs: parseInt(result?.avg_tts_latency_ms || '0', 10),
      avgTotalLatencyMs: parseInt(result?.avg_total_latency_ms || '0', 10),
      p50LatencyMs: parseInt(result?.p50_latency_ms || '0', 10),
      p95LatencyMs: parseInt(result?.p95_latency_ms || '0', 10),
      p99LatencyMs: parseInt(result?.p99_latency_ms || '0', 10),
    };
  }

  /**
   * Get per-agent statistics
   */
  async getAgentStats(
    agentId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AgentStats[]> {
    let query = `
      SELECT
        a.id as agent_id,
        a.name as agent_name,
        COUNT(c.id) as total_calls,
        COUNT(c.id) FILTER (WHERE c.state = 'ended' OR c.outcome = 'completed') as completed_calls,
        COALESCE(AVG(c.total_duration_seconds), 0)::INTEGER as average_duration_seconds,
        COALESCE((SELECT AVG(turn_count)::INTEGER FROM (SELECT conversation_id, COUNT(*) as turn_count FROM ai_conversation_turns GROUP BY conversation_id) t), 0) as average_turns,
        COUNT(c.id) FILTER (WHERE c.sentiment_score > 0.3) as sentiment_positive,
        COUNT(c.id) FILTER (WHERE c.sentiment_score BETWEEN -0.3 AND 0.3) as sentiment_neutral,
        COUNT(c.id) FILTER (WHERE c.sentiment_score < -0.3) as sentiment_negative,
        0 as sentiment_mixed,
        COUNT(c.id) FILTER (WHERE c.sentiment_score IS NULL) as sentiment_unknown
      FROM ai_agents a
      LEFT JOIN ai_conversations c ON c.ai_agent_id = a.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (agentId) {
      conditions.push(`a.id = $${params.length + 1}`);
      params.push(agentId);
    }

    if (startDate && endDate) {
      conditions.push(`(c.start_time >= $${params.length + 1} AND c.start_time <= $${params.length + 2})`);
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push(`c.start_time >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY a.id, a.name ORDER BY total_calls DESC`;

    const rows = await this.db.all<{
      agent_id: string;
      agent_name: string;
      total_calls: string;
      completed_calls: string;
      average_duration_seconds: string;
      average_turns: string;
      sentiment_positive: string;
      sentiment_neutral: string;
      sentiment_negative: string;
      sentiment_mixed: string;
      sentiment_unknown: string;
    }>(query, params);

    return rows.map(row => {
      const total = parseInt(row.total_calls, 10);
      const completed = parseInt(row.completed_calls, 10);

      return {
        agentId: row.agent_id,
        agentName: row.agent_name,
        totalCalls: total,
        completedCalls: completed,
        successRate: total > 0 ? (completed / total) * 100 : 0,
        averageDurationSeconds: parseInt(row.average_duration_seconds, 10),
        averageTurns: parseInt(row.average_turns, 10),
        sentimentBreakdown: {
          positive: parseInt(row.sentiment_positive, 10),
          neutral: parseInt(row.sentiment_neutral, 10),
          negative: parseInt(row.sentiment_negative, 10),
          mixed: parseInt(row.sentiment_mixed, 10),
          unknown: parseInt(row.sentiment_unknown, 10),
        },
      };
    });
  }

  /**
   * Get daily stats for a date range
   */
  async getDailyStats(days: number = 30): Promise<DailyStats[]> {
    const query = `
      SELECT
        DATE(start_time) as date,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE state = 'ended' OR outcome = 'completed') as completed_calls,
        COALESCE(AVG(total_duration_seconds), 0)::INTEGER as average_duration_seconds
      FROM ai_conversations
      WHERE start_time >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(start_time)
      ORDER BY date DESC
    `;

    const rows = await this.db.all<{
      date: string;
      total_calls: string;
      completed_calls: string;
      average_duration_seconds: string;
    }>(query);

    return rows.map(row => ({
      date: row.date,
      totalCalls: parseInt(row.total_calls, 10),
      completedCalls: parseInt(row.completed_calls, 10),
      averageDurationSeconds: parseInt(row.average_duration_seconds, 10),
    }));
  }

  /**
   * Get hourly distribution of calls
   */
  async getHourlyDistribution(days: number = 7): Promise<HourlyStats[]> {
    const query = `
      SELECT
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as total_calls,
        COALESCE(AVG(total_duration_seconds), 0)::INTEGER as average_duration_seconds
      FROM ai_conversations
      WHERE start_time >= NOW() - INTERVAL '${days} days'
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY hour
    `;

    const rows = await this.db.all<{
      hour: string;
      total_calls: string;
      average_duration_seconds: string;
    }>(query);

    return rows.map(row => ({
      hour: parseInt(row.hour, 10),
      totalCalls: parseInt(row.total_calls, 10),
      averageDurationSeconds: parseInt(row.average_duration_seconds, 10),
    }));
  }

  /**
   * Get recent conversations with details
   */
  async getRecentConversations(limit: number = 20): Promise<Array<{
    id: string;
    agentId: string;
    agentName: string;
    callerNumber: string;
    direction: string;
    state: string;
    outcome: string | null;
    sentiment: string | null;
    durationSeconds: number | null;
    totalTurns: number | null;
    startTime: number;
  }>> {
    const query = `
      SELECT
        c.id,
        c.ai_agent_id as agent_id,
        a.name as agent_name,
        c.called_number as caller_number,
        c.direction,
        c.state,
        c.outcome,
        CASE
          WHEN c.sentiment_score > 0.3 THEN 'positive'
          WHEN c.sentiment_score < -0.3 THEN 'negative'
          ELSE 'neutral'
        END as sentiment,
        c.total_duration_seconds as duration_seconds,
        (SELECT COUNT(*) FROM ai_conversation_turns WHERE conversation_id = c.id) as total_turns,
        c.start_time
      FROM ai_conversations c
      LEFT JOIN ai_agents a ON c.ai_agent_id = a.id
      ORDER BY c.start_time DESC
      LIMIT $1
    `;

    const rows = await this.db.all<{
      id: string;
      agent_id: string;
      agent_name: string;
      caller_number: string;
      direction: string;
      state: string;
      outcome: string | null;
      sentiment: string | null;
      duration_seconds: number | null;
      total_turns: number | null;
      start_time: string;
    }>(query, [limit]);

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      agentName: row.agent_name || 'Unknown Agent',
      callerNumber: row.caller_number || 'Unknown',
      direction: row.direction,
      state: row.state,
      outcome: row.outcome,
      sentiment: row.sentiment,
      durationSeconds: row.duration_seconds,
      totalTurns: row.total_turns,
      startTime: Math.floor(new Date(row.start_time).getTime() / 1000),
    }));
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary(days: number = 7): Promise<{
    stats: AIConversationStats;
    sentiment: SentimentBreakdown;
    outcomes: OutcomeDistribution;
    latency: LatencyMetrics;
    dailyStats: DailyStats[];
    topAgents: AgentStats[];
    recentConversations: Array<{
      id: string;
      agentName: string;
      callerNumber: string;
      state: string;
      sentiment: string | null;
      durationSeconds: number | null;
      startTime: number;
    }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [stats, sentiment, outcomes, latency, dailyStats, agentStats, recentConversations] = await Promise.all([
      this.getOverallStats(startDate),
      this.getSentimentBreakdown(startDate),
      this.getOutcomeDistribution(startDate),
      this.getLatencyMetrics(startDate),
      this.getDailyStats(days),
      this.getAgentStats(undefined, startDate),
      this.getRecentConversations(10),
    ]);

    return {
      stats,
      sentiment,
      outcomes,
      latency,
      dailyStats,
      topAgents: agentStats.slice(0, 5),
      recentConversations: recentConversations.map(c => ({
        id: c.id,
        agentName: c.agentName,
        callerNumber: c.callerNumber,
        state: c.state,
        sentiment: c.sentiment,
        durationSeconds: c.durationSeconds,
        startTime: c.startTime,
      })),
    };
  }
}
