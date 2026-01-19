/**
 * Call Summary Service
 * Automatically generates AI-powered summaries of conversations with key points,
 * action items, sentiment analysis, and follow-up recommendations.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DatabaseManager } from '../db/database';
import { CallSummaryRepository, CreateCallSummaryInput, CallSummary } from '../db/repositories/callSummaryRepository';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import {
  getLLMProvider,
  createLLMProvider,
  LLMProvider,
  LLMProviderType,
  systemMessage,
  userMessage,
} from '../ai/llm';

// ==========================================
// INTERFACES
// ==========================================

export interface ConversationTurn {
  id: string;
  turnNumber: number;
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string;
  audioDurationMs: number | null;
  startedAt: number;
  functionName?: string;
  functionArgs?: string;
  functionResult?: string;
}

export interface ConversationData {
  id: string;
  agentId: string;
  agentName: string;
  callerNumber: string;
  calledNumber: string;
  direction: 'inbound' | 'outbound';
  state: string;
  outcome: string | null;
  startTime: number;
  endTime: number | null;
  durationSeconds: number | null;
  turns: ConversationTurn[];
}

export interface SummaryGenerationResult {
  success: boolean;
  summary?: CallSummary;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface CallSummaryServiceConfig {
  enabled?: boolean;
  autoGenerateOnEnd?: boolean;
  minTurnsForSummary?: number;
  preferredProvider?: LLMProviderType;
  summaryModel?: string;
}

// ==========================================
// SUMMARY GENERATION PROMPT
// ==========================================

const SUMMARY_SYSTEM_PROMPT = `You are an expert AI call analyst. Your task is to analyze phone conversations and generate comprehensive summaries. You must respond with valid JSON only.

Analyze the conversation and provide:
1. A brief overview (1-2 sentences summarizing the call purpose and outcome)
2. Key points discussed (3-5 bullet points of main topics)
3. Action items identified (any tasks, follow-ups, or commitments mentioned)
4. Overall sentiment assessment (positive, neutral, negative, or mixed)
5. Caller's primary intent (what the caller was trying to accomplish)
6. Whether follow-up is needed and why

Respond ONLY with a valid JSON object in this exact format:
{
  "summary": "Brief 1-2 sentence overview of the call",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "actionItems": ["Action item 1", "Action item 2"],
  "sentiment": "positive|neutral|negative|mixed",
  "callerIntent": "Brief description of what the caller wanted",
  "followUpNeeded": true|false,
  "followUpNotes": "Reason for follow-up if needed, or null"
}`;

// ==========================================
// SERVICE CLASS
// ==========================================

export class CallSummaryService extends EventEmitter {
  private db: DatabaseManager;
  private summaryRepo: CallSummaryRepository;
  private settingsRepo: SettingsRepository;
  private config: Required<CallSummaryServiceConfig>;
  private provider: LLMProvider | null = null;
  private providerType: LLMProviderType | null = null;

  constructor(
    db: DatabaseManager,
    summaryRepo: CallSummaryRepository,
    settingsRepo: SettingsRepository,
    config?: CallSummaryServiceConfig
  ) {
    super();
    this.db = db;
    this.summaryRepo = summaryRepo;
    this.settingsRepo = settingsRepo;
    this.config = {
      enabled: config?.enabled ?? true,
      autoGenerateOnEnd: config?.autoGenerateOnEnd ?? true,
      minTurnsForSummary: config?.minTurnsForSummary ?? 2,
      preferredProvider: config?.preferredProvider ?? 'openai',
      summaryModel: config?.summaryModel ?? 'gpt-4o-mini',
    };
  }

  /**
   * Initialize the LLM provider for summary generation
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      logger.info('CallSummaryService disabled by config');
      return false;
    }

    logger.info('Initializing CallSummaryService...');

    // Try to get the preferred provider first
    const providers: LLMProviderType[] = [
      this.config.preferredProvider,
      'openai',
      'anthropic',
      'groq',
    ].filter((v, i, a) => a.indexOf(v) === i) as LLMProviderType[]; // Remove duplicates

    for (const providerType of providers) {
      const apiKey = await this.getApiKey(providerType);
      if (apiKey) {
        try {
          // Check if provider already registered
          let provider = getLLMProvider(providerType);
          if (!provider) {
            provider = createLLMProvider(providerType, apiKey);
          }
          this.provider = provider;
          this.providerType = providerType;
          logger.info(`CallSummaryService initialized with ${providerType} provider`);
          return true;
        } catch (err) {
          logger.warn(`Failed to initialize ${providerType} provider:`, err);
        }
      }
    }

    logger.warn('CallSummaryService: No LLM providers available for summary generation');
    return false;
  }

  /**
   * Get API key for a provider
   */
  private async getApiKey(provider: LLMProviderType): Promise<string | null> {
    switch (provider) {
      case 'openai':
        return this.settingsRepo.get('openai_api_key');
      case 'anthropic':
        return this.settingsRepo.get('anthropic_api_key');
      case 'groq':
        return this.settingsRepo.get('groq_api_key');
      default:
        return null;
    }
  }

  /**
   * Get conversation data with turns from the database
   */
  async getConversationData(conversationId: string): Promise<ConversationData | null> {
    try {
      // Get conversation details
      const conversation = await this.db.get<{
        id: string;
        ai_agent_id: string;
        caller_id: string;
        called_number: string;
        direction: string;
        state: string;
        outcome: string | null;
        start_time: string;
        end_time: string | null;
        total_duration_seconds: number | null;
      }>(`
        SELECT
          c.id, c.ai_agent_id, c.caller_id, c.called_number,
          c.direction, c.state, c.outcome, c.start_time, c.end_time,
          c.total_duration_seconds
        FROM ai_conversations c
        WHERE c.id = $1
      `, [conversationId]);

      if (!conversation) {
        return null;
      }

      // Get agent name
      const agent = await this.db.get<{ name: string }>(
        'SELECT name FROM ai_agents WHERE id = $1',
        [conversation.ai_agent_id]
      );

      // Get conversation turns
      const turns = await this.db.all<{
        id: string;
        turn_number: number;
        role: string;
        content: string;
        audio_duration_ms: number | null;
        started_at: string;
        function_name: string | null;
        function_args: string | null;
        function_result: string | null;
      }>(`
        SELECT id, turn_number, role, content, audio_duration_ms,
               started_at, function_name, function_args, function_result
        FROM ai_conversation_turns
        WHERE conversation_id = $1
        ORDER BY turn_number ASC
      `, [conversationId]);

      return {
        id: conversation.id,
        agentId: conversation.ai_agent_id,
        agentName: agent?.name || 'Unknown Agent',
        callerNumber: conversation.caller_id || 'Unknown',
        calledNumber: conversation.called_number || 'Unknown',
        direction: conversation.direction as 'inbound' | 'outbound',
        state: conversation.state,
        outcome: conversation.outcome,
        startTime: Math.floor(new Date(conversation.start_time).getTime() / 1000),
        endTime: conversation.end_time ? Math.floor(new Date(conversation.end_time).getTime() / 1000) : null,
        durationSeconds: conversation.total_duration_seconds,
        turns: turns.map(t => ({
          id: t.id,
          turnNumber: t.turn_number,
          role: t.role as ConversationTurn['role'],
          content: t.content,
          audioDurationMs: t.audio_duration_ms,
          startedAt: Math.floor(new Date(t.started_at).getTime() / 1000),
          functionName: t.function_name || undefined,
          functionArgs: t.function_args || undefined,
          functionResult: t.function_result || undefined,
        })),
      };
    } catch (error) {
      logger.error(`Failed to get conversation data for ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Format conversation turns for the LLM
   */
  private formatConversationForLLM(data: ConversationData): string {
    const lines: string[] = [
      `Call Information:`,
      `- Direction: ${data.direction}`,
      `- Caller: ${data.callerNumber}`,
      `- Called: ${data.calledNumber}`,
      `- Agent: ${data.agentName}`,
      `- Duration: ${data.durationSeconds ? `${Math.round(data.durationSeconds / 60)} minutes` : 'Unknown'}`,
      `- Outcome: ${data.outcome || 'Unknown'}`,
      '',
      'Conversation Transcript:',
    ];

    for (const turn of data.turns) {
      const speaker = turn.role === 'user' ? 'Caller' : turn.role === 'assistant' ? 'Agent' : turn.role;

      if (turn.role === 'function') {
        lines.push(`[Function Call: ${turn.functionName}]`);
        if (turn.functionResult) {
          lines.push(`[Function Result: ${turn.functionResult.substring(0, 200)}...]`);
        }
      } else {
        lines.push(`${speaker}: ${turn.content}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse the LLM response into structured data
   */
  private parseSummaryResponse(response: string): {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    callerIntent: string;
    followUpNeeded: boolean;
    followUpNotes: string | null;
  } | null {
    try {
      // Try to extract JSON from the response
      let jsonStr = response.trim();

      // Handle markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.summary || typeof parsed.summary !== 'string') {
        throw new Error('Missing or invalid summary field');
      }

      return {
        summary: parsed.summary,
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        sentiment: ['positive', 'neutral', 'negative', 'mixed'].includes(parsed.sentiment)
          ? parsed.sentiment
          : 'neutral',
        callerIntent: typeof parsed.callerIntent === 'string' ? parsed.callerIntent : 'Unknown',
        followUpNeeded: Boolean(parsed.followUpNeeded),
        followUpNotes: typeof parsed.followUpNotes === 'string' ? parsed.followUpNotes : null,
      };
    } catch (error) {
      logger.error('Failed to parse summary response:', error);
      logger.debug('Response was:', response);
      return null;
    }
  }

  /**
   * Generate a summary for a conversation
   */
  async generateSummary(conversationId: string): Promise<SummaryGenerationResult> {
    const startTime = Date.now();

    // Check if provider is available
    if (!this.provider) {
      const initialized = await this.initialize();
      if (!initialized || !this.provider) {
        return {
          success: false,
          error: 'No LLM provider available for summary generation',
        };
      }
    }

    // Check if summary already exists
    const existingSummary = await this.summaryRepo.findByConversationId(conversationId);
    if (existingSummary) {
      logger.info(`Summary already exists for conversation ${conversationId}`);
      return {
        success: true,
        summary: existingSummary,
      };
    }

    // Get conversation data
    const conversationData = await this.getConversationData(conversationId);
    if (!conversationData) {
      return {
        success: false,
        error: `Conversation not found: ${conversationId}`,
      };
    }

    // Check minimum turns
    if (conversationData.turns.length < this.config.minTurnsForSummary) {
      logger.info(`Skipping summary for ${conversationId}: only ${conversationData.turns.length} turns`);
      return {
        success: false,
        error: `Conversation has insufficient turns (${conversationData.turns.length} < ${this.config.minTurnsForSummary})`,
      };
    }

    // Format conversation for LLM
    const formattedConversation = this.formatConversationForLLM(conversationData);

    try {
      // Generate summary using LLM
      logger.info(`Generating summary for conversation ${conversationId} using ${this.providerType}...`);

      const result = await this.provider.complete([
        systemMessage(SUMMARY_SYSTEM_PROMPT),
        userMessage(`Please analyze the following phone conversation and provide a structured summary:\n\n${formattedConversation}`),
      ], {
        temperature: 0.3,
        maxTokens: 1000,
      });

      const latencyMs = Date.now() - startTime;

      // Parse the response
      const parsedSummary = this.parseSummaryResponse(result.content);
      if (!parsedSummary) {
        return {
          success: false,
          error: 'Failed to parse LLM response',
          tokensUsed: result.usage?.totalTokens,
          latencyMs,
        };
      }

      // Store the summary
      const summaryInput: CreateCallSummaryInput = {
        conversationId,
        summaryText: parsedSummary.summary,
        keyPoints: parsedSummary.keyPoints,
        actionItems: parsedSummary.actionItems,
        sentiment: parsedSummary.sentiment,
        callerIntent: parsedSummary.callerIntent,
        followUpNeeded: parsedSummary.followUpNeeded,
        followUpNotes: parsedSummary.followUpNotes || undefined,
        generatedBy: this.providerType || 'unknown',
        modelUsed: this.config.summaryModel,
        tokensUsed: result.usage?.totalTokens,
      };

      const summary = await this.summaryRepo.create(summaryInput);

      logger.info(`Summary generated for conversation ${conversationId} in ${latencyMs}ms`);

      // Emit event
      this.emit('summary_generated', {
        conversationId,
        summaryId: summary.id,
        sentiment: summary.sentiment,
        followUpNeeded: summary.followUpNeeded,
      });

      return {
        success: true,
        summary,
        tokensUsed: result.usage?.totalTokens,
        latencyMs,
      };
    } catch (error) {
      logger.error(`Failed to generate summary for ${conversationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle conversation ended event
   */
  async handleConversationEnded(conversationId: string): Promise<void> {
    if (!this.config.enabled || !this.config.autoGenerateOnEnd) {
      return;
    }

    // Small delay to ensure all turns are saved
    setTimeout(async () => {
      try {
        await this.generateSummary(conversationId);
      } catch (error) {
        logger.error(`Failed to auto-generate summary for ${conversationId}:`, error);
      }
    }, 2000);
  }

  /**
   * Get summary for a conversation
   */
  async getSummary(conversationId: string): Promise<CallSummary | null> {
    return this.summaryRepo.findByConversationId(conversationId);
  }

  /**
   * Get all summaries requiring follow-up
   */
  async getFollowUpRequired(limit: number = 50): Promise<CallSummary[]> {
    return this.summaryRepo.findByFollowUpNeeded(limit);
  }

  /**
   * Update follow-up status
   */
  async updateFollowUp(summaryId: string, followUpNeeded: boolean, notes?: string): Promise<boolean> {
    return this.summaryRepo.updateFollowUp(summaryId, followUpNeeded, notes);
  }

  /**
   * Get summary statistics
   */
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
    return this.summaryRepo.getStats();
  }

  /**
   * Regenerate a summary (delete existing and create new)
   */
  async regenerateSummary(conversationId: string): Promise<SummaryGenerationResult> {
    // Delete existing summary if any
    const existing = await this.summaryRepo.findByConversationId(conversationId);
    if (existing) {
      await this.summaryRepo.delete(existing.id);
    }

    return this.generateSummary(conversationId);
  }

  /**
   * Refresh provider (call when API keys change)
   */
  async refreshProvider(): Promise<boolean> {
    this.provider = null;
    this.providerType = null;
    return this.initialize();
  }
}
