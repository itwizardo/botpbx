/**
 * AI Insights Repository
 * Stores and retrieves AI-generated insights including intents, FAQs, and agent scores
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// ==========================================
// INSIGHT INTERFACES
// ==========================================

export type InsightType = 'intent' | 'faq' | 'agent_score' | 'topic' | 'keyword';

export interface AIInsight {
  id: string;
  insightType: InsightType;
  entityId: string | null;  // e.g., agent_id, conversation_id
  data: Record<string, any>;
  confidence: number | null;
  generatedAt: number;
}

export interface CreateInsightInput {
  insightType: InsightType;
  entityId?: string;
  data: Record<string, any>;
  confidence?: number;
}

// Intent insights
export interface IntentDistribution {
  intent: string;
  count: number;
  percentage: number;
}

// FAQ insights
export interface FAQ {
  id: string;
  question: string;
  suggestedAnswer: string | null;
  frequency: number;
  category: string | null;
  lastSeen: number;
}

// Agent score insights
export interface AgentScore {
  agentId: string;
  agentName: string;
  overallScore: number;
  successScore: number;
  efficiencyScore: number;
  sentimentScore: number;
  resolutionScore: number;
  totalCalls: number;
  scoredCalls: number;
  lastUpdated: number;
}

// Topic/keyword insights
export interface TopicInsight {
  topic: string;
  count: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  relatedKeywords: string[];
}

// ==========================================
// ROW TYPES
// ==========================================

interface InsightRow {
  id: string;
  insight_type: string;
  entity_id: string | null;
  data: string;
  confidence: number | null;
  generated_at: Date | string;
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class AIInsightsRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new insight
   */
  async create(input: CreateInsightInput): Promise<AIInsight> {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(`
      INSERT INTO ai_insights (id, insight_type, entity_id, data, confidence, generated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      id,
      input.insightType,
      input.entityId || null,
      JSON.stringify(input.data),
      input.confidence || null,
      now,
    ]);

    dbLogger.info(`AI insight created: ${id} (${input.insightType})`);

    return {
      id,
      insightType: input.insightType,
      entityId: input.entityId || null,
      data: input.data,
      confidence: input.confidence || null,
      generatedAt: now,
    };
  }

  /**
   * Find insight by ID
   */
  async findById(id: string): Promise<AIInsight | null> {
    const row = await this.db.get<InsightRow>(
      'SELECT * FROM ai_insights WHERE id = $1',
      [id]
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find insights by type
   */
  async findByType(type: InsightType, limit = 100): Promise<AIInsight[]> {
    const rows = await this.db.all<InsightRow>(`
      SELECT * FROM ai_insights
      WHERE insight_type = $1
      ORDER BY generated_at DESC
      LIMIT $2
    `, [type, limit]);
    return rows.map(row => this.mapRow(row));
  }

  /**
   * Find insights by entity
   */
  async findByEntity(entityId: string, type?: InsightType): Promise<AIInsight[]> {
    let query = 'SELECT * FROM ai_insights WHERE entity_id = $1';
    const params: any[] = [entityId];

    if (type) {
      query += ' AND insight_type = $2';
      params.push(type);
    }

    query += ' ORDER BY generated_at DESC';

    const rows = await this.db.all<InsightRow>(query, params);
    return rows.map(row => this.mapRow(row));
  }

  /**
   * Delete old insights
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    const result = await this.db.run(`
      DELETE FROM ai_insights
      WHERE generated_at < $1
    `, [cutoff]);
    return result.rowCount;
  }

  // ==========================================
  // INTENT ANALYSIS
  // ==========================================

  /**
   * Get intent distribution from stored insights
   */
  async getIntentDistribution(days = 30): Promise<IntentDistribution[]> {
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    const rows = await this.db.all<{
      intent: string;
      count: string;
    }>(`
      SELECT
        data->>'intent' as intent,
        COUNT(*) as count
      FROM ai_insights
      WHERE insight_type = 'intent'
        AND generated_at >= $1
      GROUP BY data->>'intent'
      ORDER BY count DESC
    `, [cutoff]);

    const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    return rows.map(row => ({
      intent: row.intent,
      count: parseInt(row.count, 10),
      percentage: total > 0 ? (parseInt(row.count, 10) / total) * 100 : 0,
    }));
  }

  /**
   * Store intent classification for a conversation
   */
  async storeIntent(
    conversationId: string,
    intent: string,
    confidence: number,
    subIntents?: string[]
  ): Promise<AIInsight> {
    return this.create({
      insightType: 'intent',
      entityId: conversationId,
      data: { intent, subIntents: subIntents || [] },
      confidence,
    });
  }

  // ==========================================
  // FAQ MANAGEMENT
  // ==========================================

  /**
   * Store or update an FAQ
   */
  async storeFAQ(
    question: string,
    suggestedAnswer?: string,
    category?: string
  ): Promise<AIInsight> {
    // Check if similar FAQ exists
    const existing = await this.db.get<{ id: string; data: string }>(`
      SELECT id, data FROM ai_insights
      WHERE insight_type = 'faq'
        AND LOWER(data->>'question') = LOWER($1)
      LIMIT 1
    `, [question]);

    if (existing) {
      // Update frequency
      const data = JSON.parse(existing.data);
      data.frequency = (data.frequency || 1) + 1;
      data.lastSeen = Date.now();
      if (suggestedAnswer) data.suggestedAnswer = suggestedAnswer;
      if (category) data.category = category;

      const now = Math.floor(Date.now() / 1000);
      await this.db.run(`
        UPDATE ai_insights
        SET data = $1, generated_at = $2
        WHERE id = $3
      `, [JSON.stringify(data), now, existing.id]);

      return {
        id: existing.id,
        insightType: 'faq',
        entityId: null,
        data,
        confidence: null,
        generatedAt: now,
      };
    }

    // Create new FAQ
    return this.create({
      insightType: 'faq',
      data: {
        question,
        suggestedAnswer: suggestedAnswer || null,
        category: category || null,
        frequency: 1,
        lastSeen: Date.now(),
      },
    });
  }

  /**
   * Get top FAQs
   */
  async getTopFAQs(limit = 20): Promise<FAQ[]> {
    const rows = await this.db.all<InsightRow>(`
      SELECT * FROM ai_insights
      WHERE insight_type = 'faq'
      ORDER BY (data->>'frequency')::int DESC, generated_at DESC
      LIMIT $1
    `, [limit]);

    return rows.map(row => {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        question: data.question,
        suggestedAnswer: data.suggestedAnswer,
        frequency: data.frequency || 1,
        category: data.category,
        lastSeen: data.lastSeen || Math.floor(new Date(row.generated_at).getTime() / 1000),
      };
    });
  }

  /**
   * Update FAQ answer
   */
  async updateFAQAnswer(id: string, suggestedAnswer: string): Promise<boolean> {
    const insight = await this.findById(id);
    if (!insight || insight.insightType !== 'faq') return false;

    const data = { ...insight.data, suggestedAnswer };
    const result = await this.db.run(`
      UPDATE ai_insights
      SET data = $1
      WHERE id = $2
    `, [JSON.stringify(data), id]);

    return result.rowCount > 0;
  }

  // ==========================================
  // AGENT SCORING
  // ==========================================

  /**
   * Store or update agent score
   */
  async storeAgentScore(score: Omit<AgentScore, 'lastUpdated'>): Promise<AIInsight> {
    // Delete old score for this agent
    await this.db.run(`
      DELETE FROM ai_insights
      WHERE insight_type = 'agent_score' AND entity_id = $1
    `, [score.agentId]);

    return this.create({
      insightType: 'agent_score',
      entityId: score.agentId,
      data: {
        agentName: score.agentName,
        overallScore: score.overallScore,
        successScore: score.successScore,
        efficiencyScore: score.efficiencyScore,
        sentimentScore: score.sentimentScore,
        resolutionScore: score.resolutionScore,
        totalCalls: score.totalCalls,
        scoredCalls: score.scoredCalls,
      },
    });
  }

  /**
   * Get agent score
   */
  async getAgentScore(agentId: string): Promise<AgentScore | null> {
    const row = await this.db.get<InsightRow>(`
      SELECT * FROM ai_insights
      WHERE insight_type = 'agent_score' AND entity_id = $1
      ORDER BY generated_at DESC
      LIMIT 1
    `, [agentId]);

    if (!row) return null;

    const data = JSON.parse(row.data);
    return {
      agentId: row.entity_id!,
      agentName: data.agentName,
      overallScore: data.overallScore,
      successScore: data.successScore,
      efficiencyScore: data.efficiencyScore,
      sentimentScore: data.sentimentScore,
      resolutionScore: data.resolutionScore,
      totalCalls: data.totalCalls,
      scoredCalls: data.scoredCalls,
      lastUpdated: Math.floor(new Date(row.generated_at).getTime() / 1000),
    };
  }

  /**
   * Get all agent scores
   */
  async getAllAgentScores(): Promise<AgentScore[]> {
    const rows = await this.db.all<InsightRow>(`
      SELECT DISTINCT ON (entity_id) *
      FROM ai_insights
      WHERE insight_type = 'agent_score'
      ORDER BY entity_id, generated_at DESC
    `);

    return rows.map(row => {
      const data = JSON.parse(row.data);
      return {
        agentId: row.entity_id!,
        agentName: data.agentName,
        overallScore: data.overallScore,
        successScore: data.successScore,
        efficiencyScore: data.efficiencyScore,
        sentimentScore: data.sentimentScore,
        resolutionScore: data.resolutionScore,
        totalCalls: data.totalCalls,
        scoredCalls: data.scoredCalls,
        lastUpdated: Math.floor(new Date(row.generated_at).getTime() / 1000),
      };
    });
  }

  // ==========================================
  // TOPIC/KEYWORD INSIGHTS
  // ==========================================

  /**
   * Store topic insight
   */
  async storeTopic(
    topic: string,
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed',
    relatedKeywords: string[] = []
  ): Promise<AIInsight> {
    // Check if topic exists
    const existing = await this.db.get<{ id: string; data: string }>(`
      SELECT id, data FROM ai_insights
      WHERE insight_type = 'topic'
        AND LOWER(data->>'topic') = LOWER($1)
      LIMIT 1
    `, [topic]);

    if (existing) {
      const data = JSON.parse(existing.data);
      data.count = (data.count || 1) + 1;
      // Merge keywords
      const existingKeywords = new Set(data.relatedKeywords || []);
      relatedKeywords.forEach(k => existingKeywords.add(k));
      data.relatedKeywords = Array.from(existingKeywords);

      const now = Math.floor(Date.now() / 1000);
      await this.db.run(`
        UPDATE ai_insights
        SET data = $1, generated_at = $2
        WHERE id = $3
      `, [JSON.stringify(data), now, existing.id]);

      return {
        id: existing.id,
        insightType: 'topic',
        entityId: null,
        data,
        confidence: null,
        generatedAt: now,
      };
    }

    return this.create({
      insightType: 'topic',
      data: {
        topic,
        count: 1,
        sentiment,
        relatedKeywords,
      },
    });
  }

  /**
   * Get top topics
   */
  async getTopTopics(limit = 20): Promise<TopicInsight[]> {
    const rows = await this.db.all<InsightRow>(`
      SELECT * FROM ai_insights
      WHERE insight_type = 'topic'
      ORDER BY (data->>'count')::int DESC
      LIMIT $1
    `, [limit]);

    return rows.map(row => {
      const data = JSON.parse(row.data);
      return {
        topic: data.topic,
        count: data.count || 1,
        sentiment: data.sentiment || 'neutral',
        relatedKeywords: data.relatedKeywords || [],
      };
    });
  }

  // ==========================================
  // AGGREGATE STATS
  // ==========================================

  /**
   * Get insight counts by type
   */
  async getInsightCounts(): Promise<Record<InsightType, number>> {
    const rows = await this.db.all<{
      insight_type: string;
      count: string;
    }>(`
      SELECT insight_type, COUNT(*) as count
      FROM ai_insights
      GROUP BY insight_type
    `);

    const result: Record<string, number> = {
      intent: 0,
      faq: 0,
      agent_score: 0,
      topic: 0,
      keyword: 0,
    };

    for (const row of rows) {
      result[row.insight_type] = parseInt(row.count, 10);
    }

    return result as Record<InsightType, number>;
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary(): Promise<{
    intentDistribution: IntentDistribution[];
    topFAQs: FAQ[];
    agentScores: AgentScore[];
    topTopics: TopicInsight[];
    insightCounts: Record<InsightType, number>;
  }> {
    const [intentDistribution, topFAQs, agentScores, topTopics, insightCounts] = await Promise.all([
      this.getIntentDistribution(30),
      this.getTopFAQs(10),
      this.getAllAgentScores(),
      this.getTopTopics(10),
      this.getInsightCounts(),
    ]);

    return {
      intentDistribution,
      topFAQs,
      agentScores,
      topTopics,
      insightCounts,
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private mapRow(row: InsightRow): AIInsight {
    return {
      id: row.id,
      insightType: row.insight_type as InsightType,
      entityId: row.entity_id,
      data: JSON.parse(row.data),
      confidence: row.confidence,
      generatedAt: Math.floor(new Date(row.generated_at).getTime() / 1000),
    };
  }
}
