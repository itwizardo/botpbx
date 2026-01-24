import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';

// ==========================================
// CALL SUMMARY INTERFACES
// ==========================================

export interface CallSummary {
  id: string;
  conversationId: string;
  summaryText: string;
  keyPoints: string[] | null;
  actionItems: string[] | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  callerIntent: string | null;
  followUpNeeded: boolean;
  followUpNotes: string | null;
  generatedBy: string;
  modelUsed: string | null;
  tokensUsed: number | null;
  createdAt: number;
}

export interface CreateCallSummaryInput {
  conversationId: string;
  summaryText: string;
  keyPoints?: string[];
  actionItems?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  callerIntent?: string;
  followUpNeeded?: boolean;
  followUpNotes?: string;
  generatedBy: string;
  modelUsed?: string;
  tokensUsed?: number;
}

// ==========================================
// ROW TYPES
// ==========================================

interface CallSummaryRow {
  id: string;
  conversation_id: string;
  summary_text: string;
  key_points: string | null;
  action_items: string | null;
  sentiment: string | null;
  caller_intent: string | null;
  follow_up_needed: boolean;
  follow_up_notes: string | null;
  generated_by: string;
  model_used: string | null;
  tokens_used: number | null;
  created_at: Date | string;
}

function toTimestamp(val: Date | string | number | null): number | null {
  if (typeof val === 'number') return Math.floor(val);
  if (!val) return null;
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(val.getTime() / 1000);
}

// ==========================================
// REPOSITORY CLASS
// ==========================================

export class CallSummaryRepository {
  constructor(private db: DatabaseManager) {}

  async create(input: CreateCallSummaryInput): Promise<CallSummary> {
    const id = uuidv4();

    await this.db.run(`
      INSERT INTO call_summaries (
        id, conversation_id, summary_text, key_points, action_items,
        sentiment, caller_intent, follow_up_needed, follow_up_notes,
        generated_by, model_used, tokens_used
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      id,
      input.conversationId,
      input.summaryText,
      input.keyPoints ? JSON.stringify(input.keyPoints) : null,
      input.actionItems ? JSON.stringify(input.actionItems) : null,
      input.sentiment || null,
      input.callerIntent || null,
      input.followUpNeeded ?? false,
      input.followUpNotes || null,
      input.generatedBy,
      input.modelUsed || null,
      input.tokensUsed || null,
    ]);

    dbLogger.info(`Call summary created: ${id} for conversation ${input.conversationId}`);

    return {
      id,
      conversationId: input.conversationId,
      summaryText: input.summaryText,
      keyPoints: input.keyPoints || null,
      actionItems: input.actionItems || null,
      sentiment: input.sentiment || null,
      callerIntent: input.callerIntent || null,
      followUpNeeded: input.followUpNeeded || false,
      followUpNotes: input.followUpNotes || null,
      generatedBy: input.generatedBy,
      modelUsed: input.modelUsed || null,
      tokensUsed: input.tokensUsed || null,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async findById(id: string): Promise<CallSummary | null> {
    const row = await this.db.get<CallSummaryRow>(
      'SELECT * FROM call_summaries WHERE id = $1',
      [id]
    );
    return row ? this.mapRow(row) : null;
  }

  async findByConversationId(conversationId: string): Promise<CallSummary | null> {
    const row = await this.db.get<CallSummaryRow>(
      'SELECT * FROM call_summaries WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
      [conversationId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findRecent(limit = 50, offset = 0): Promise<CallSummary[]> {
    const rows = await this.db.all<CallSummaryRow>(`
      SELECT * FROM call_summaries
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return rows.map(row => this.mapRow(row));
  }

  async findByFollowUpNeeded(limit = 50): Promise<CallSummary[]> {
    const rows = await this.db.all<CallSummaryRow>(`
      SELECT * FROM call_summaries
      WHERE follow_up_needed = true
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return rows.map(row => this.mapRow(row));
  }

  async findBySentiment(
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed',
    limit = 50
  ): Promise<CallSummary[]> {
    const rows = await this.db.all<CallSummaryRow>(`
      SELECT * FROM call_summaries
      WHERE sentiment = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [sentiment, limit]);
    return rows.map(row => this.mapRow(row));
  }

  async updateFollowUp(
    id: string,
    followUpNeeded: boolean,
    followUpNotes?: string
  ): Promise<boolean> {
    const result = await this.db.run(`
      UPDATE call_summaries
      SET follow_up_needed = $1, follow_up_notes = $2
      WHERE id = $3
    `, [followUpNeeded, followUpNotes || null, id]);
    return result.rowCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM call_summaries WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async count(): Promise<number> {
    const result = await this.db.get<{ count: string }>(
      'SELECT COUNT(*) as count FROM call_summaries'
    );
    return result ? parseInt(result.count, 10) : 0;
  }

  async getStats(): Promise<{
    total: number;
    followUpNeeded: number;
    bySentiment: {
      positive: number;
      neutral: number;
      negative: number;
      mixed: number;
    };
    avgTokensUsed: number;
  }> {
    const result = await this.db.get<{
      total: string;
      follow_up_needed: string;
      positive: string;
      neutral: string;
      negative: string;
      mixed: string;
      avg_tokens: string;
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE follow_up_needed = true) as follow_up_needed,
        COUNT(*) FILTER (WHERE sentiment = 'positive') as positive,
        COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral,
        COUNT(*) FILTER (WHERE sentiment = 'negative') as negative,
        COUNT(*) FILTER (WHERE sentiment = 'mixed') as mixed,
        COALESCE(AVG(tokens_used), 0)::INTEGER as avg_tokens
      FROM call_summaries
    `);

    return {
      total: parseInt(result?.total || '0', 10),
      followUpNeeded: parseInt(result?.follow_up_needed || '0', 10),
      bySentiment: {
        positive: parseInt(result?.positive || '0', 10),
        neutral: parseInt(result?.neutral || '0', 10),
        negative: parseInt(result?.negative || '0', 10),
        mixed: parseInt(result?.mixed || '0', 10),
      },
      avgTokensUsed: parseInt(result?.avg_tokens || '0', 10),
    };
  }

  private mapRow(row: CallSummaryRow): CallSummary {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      summaryText: row.summary_text,
      keyPoints: row.key_points ? JSON.parse(row.key_points) : null,
      actionItems: row.action_items ? JSON.parse(row.action_items) : null,
      sentiment: row.sentiment as CallSummary['sentiment'],
      callerIntent: row.caller_intent,
      followUpNeeded: row.follow_up_needed,
      followUpNotes: row.follow_up_notes,
      generatedBy: row.generated_by,
      modelUsed: row.model_used,
      tokensUsed: row.tokens_used,
      createdAt: toTimestamp(row.created_at) || 0,
    };
  }
}
