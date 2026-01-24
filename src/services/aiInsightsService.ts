/**
 * AI Insights Service
 * Generates AI-powered insights including intent classification, FAQ extraction,
 * and agent performance scoring.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DatabaseManager } from '../db/database';
import { AIInsightsRepository, AgentScore, IntentDistribution, FAQ, TopicInsight } from '../db/repositories/aiInsightsRepository';
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

export interface IntentClassificationResult {
  intent: string;
  confidence: number;
  subIntents: string[];
}

export interface FAQExtractionResult {
  questions: Array<{
    question: string;
    suggestedAnswer: string | null;
    category: string;
  }>;
}

export interface AgentScoreCalculation {
  agentId: string;
  agentName: string;
  successScore: number;
  efficiencyScore: number;
  sentimentScore: number;
  resolutionScore: number;
  overallScore: number;
  totalCalls: number;
}

export interface AIInsightsServiceConfig {
  enabled?: boolean;
  preferredProvider?: LLMProviderType;
  autoScoreInterval?: number; // Hours between auto-scoring
}

// ==========================================
// INTENT CATEGORIES
// ==========================================

const INTENT_CATEGORIES = [
  'Sales Inquiry',
  'Technical Support',
  'Billing Question',
  'Account Management',
  'Complaint',
  'General Information',
  'Appointment/Scheduling',
  'Product Return',
  'Order Status',
  'Other',
];

// ==========================================
// PROMPTS
// ==========================================

const INTENT_CLASSIFICATION_PROMPT = `You are an expert at classifying customer call intents. Analyze the conversation and classify the primary intent.

Available intent categories:
${INTENT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Respond ONLY with a valid JSON object:
{
  "intent": "Primary intent category from the list",
  "confidence": 0.0-1.0,
  "subIntents": ["Optional secondary intents"]
}`;

const FAQ_EXTRACTION_PROMPT = `You are an expert at identifying frequently asked questions from customer conversations. Extract any questions the customer asked that would be useful for an FAQ.

Respond ONLY with a valid JSON object:
{
  "questions": [
    {
      "question": "The customer's question rephrased clearly",
      "suggestedAnswer": "A helpful answer based on the conversation, or null if unknown",
      "category": "Category like: Product, Billing, Technical, Policy, etc."
    }
  ]
}

If no clear questions were asked, return: {"questions": []}`;

// ==========================================
// SERVICE CLASS
// ==========================================

export class AIInsightsService extends EventEmitter {
  private db: DatabaseManager;
  private insightsRepo: AIInsightsRepository;
  private settingsRepo: SettingsRepository;
  private config: Required<AIInsightsServiceConfig>;
  private provider: LLMProvider | null = null;
  private providerType: LLMProviderType | null = null;
  private autoScoreTimer: NodeJS.Timeout | null = null;

  constructor(
    db: DatabaseManager,
    insightsRepo: AIInsightsRepository,
    settingsRepo: SettingsRepository,
    config?: AIInsightsServiceConfig
  ) {
    super();
    this.db = db;
    this.insightsRepo = insightsRepo;
    this.settingsRepo = settingsRepo;
    this.config = {
      enabled: config?.enabled ?? true,
      preferredProvider: config?.preferredProvider ?? 'openai',
      autoScoreInterval: config?.autoScoreInterval ?? 24, // Daily by default
    };
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      logger.info('AIInsightsService disabled by config');
      return false;
    }

    logger.info('Initializing AIInsightsService...');

    // Try to get the preferred provider first
    const providers: LLMProviderType[] = [
      this.config.preferredProvider,
      'openai',
      'anthropic',
      'groq',
    ].filter((v, i, a) => a.indexOf(v) === i) as LLMProviderType[];

    for (const providerType of providers) {
      const apiKey = await this.getApiKey(providerType);
      if (apiKey) {
        try {
          let provider = getLLMProvider(providerType);
          if (!provider) {
            provider = createLLMProvider(providerType, apiKey);
          }
          this.provider = provider;
          this.providerType = providerType;
          logger.info(`AIInsightsService initialized with ${providerType} provider`);

          // Start auto-scoring if configured
          if (this.config.autoScoreInterval > 0) {
            this.startAutoScoring();
          }

          return true;
        } catch (err) {
          logger.warn(`Failed to initialize ${providerType} provider:`, err);
        }
      }
    }

    logger.warn('AIInsightsService: No LLM providers available');
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
   * Start automatic agent scoring
   */
  private startAutoScoring(): void {
    if (this.autoScoreTimer) {
      clearInterval(this.autoScoreTimer);
    }

    const intervalMs = this.config.autoScoreInterval * 60 * 60 * 1000;
    this.autoScoreTimer = setInterval(async () => {
      try {
        await this.scoreAllAgents();
      } catch (error) {
        logger.error('Auto-scoring failed:', error);
      }
    }, intervalMs);

    logger.info(`AIInsightsService: Auto-scoring enabled every ${this.config.autoScoreInterval} hours`);
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.autoScoreTimer) {
      clearInterval(this.autoScoreTimer);
      this.autoScoreTimer = null;
    }
    logger.info('AIInsightsService stopped');
  }

  // ==========================================
  // INTENT CLASSIFICATION
  // ==========================================

  /**
   * Classify the intent of a conversation
   */
  async classifyIntent(conversationId: string): Promise<IntentClassificationResult | null> {
    if (!this.provider) {
      const initialized = await this.initialize();
      if (!initialized || !this.provider) {
        logger.warn('Cannot classify intent: no LLM provider available');
        return null;
      }
    }

    // Get conversation turns
    const turns = await this.db.all<{
      role: string;
      content: string;
    }>(`
      SELECT role, content
      FROM ai_conversation_turns
      WHERE conversation_id = $1
      ORDER BY turn_number ASC
    `, [conversationId]);

    if (turns.length === 0) {
      return null;
    }

    // Format conversation
    const transcript = turns.map(t => {
      const speaker = t.role === 'user' ? 'Customer' : 'Agent';
      return `${speaker}: ${t.content}`;
    }).join('\n');

    try {
      const result = await this.provider.complete([
        systemMessage(INTENT_CLASSIFICATION_PROMPT),
        userMessage(`Classify the intent of this conversation:\n\n${transcript}`),
      ], {
        temperature: 0.3,
        maxTokens: 200,
      });

      const parsed = this.parseJsonResponse<IntentClassificationResult>(result.content);
      if (!parsed) {
        return null;
      }

      // Store the insight
      await this.insightsRepo.storeIntent(
        conversationId,
        parsed.intent,
        parsed.confidence,
        parsed.subIntents
      );

      this.emit('intent_classified', {
        conversationId,
        intent: parsed.intent,
        confidence: parsed.confidence,
      });

      return parsed;
    } catch (error) {
      logger.error(`Intent classification failed for ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Get intent distribution
   */
  async getIntentDistribution(days = 30): Promise<IntentDistribution[]> {
    return this.insightsRepo.getIntentDistribution(days);
  }

  // ==========================================
  // FAQ EXTRACTION
  // ==========================================

  /**
   * Extract FAQs from a conversation
   */
  async extractFAQs(conversationId: string): Promise<FAQExtractionResult | null> {
    if (!this.provider) {
      const initialized = await this.initialize();
      if (!initialized || !this.provider) {
        logger.warn('Cannot extract FAQs: no LLM provider available');
        return null;
      }
    }

    // Get conversation turns
    const turns = await this.db.all<{
      role: string;
      content: string;
    }>(`
      SELECT role, content
      FROM ai_conversation_turns
      WHERE conversation_id = $1
      ORDER BY turn_number ASC
    `, [conversationId]);

    if (turns.length === 0) {
      return null;
    }

    // Format conversation
    const transcript = turns.map(t => {
      const speaker = t.role === 'user' ? 'Customer' : 'Agent';
      return `${speaker}: ${t.content}`;
    }).join('\n');

    try {
      const result = await this.provider.complete([
        systemMessage(FAQ_EXTRACTION_PROMPT),
        userMessage(`Extract FAQs from this conversation:\n\n${transcript}`),
      ], {
        temperature: 0.3,
        maxTokens: 500,
      });

      const parsed = this.parseJsonResponse<FAQExtractionResult>(result.content);
      if (!parsed || !parsed.questions) {
        return { questions: [] };
      }

      // Store each FAQ
      for (const q of parsed.questions) {
        await this.insightsRepo.storeFAQ(
          q.question,
          q.suggestedAnswer || undefined,
          q.category
        );
      }

      if (parsed.questions.length > 0) {
        this.emit('faqs_extracted', {
          conversationId,
          count: parsed.questions.length,
        });
      }

      return parsed;
    } catch (error) {
      logger.error(`FAQ extraction failed for ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Get top FAQs
   */
  async getTopFAQs(limit = 20): Promise<FAQ[]> {
    return this.insightsRepo.getTopFAQs(limit);
  }

  /**
   * Update FAQ answer
   */
  async updateFAQAnswer(id: string, answer: string): Promise<boolean> {
    return this.insightsRepo.updateFAQAnswer(id, answer);
  }

  // ==========================================
  // AGENT SCORING
  // ==========================================

  /**
   * Calculate and store agent score
   * Scoring weights:
   * - Success Rate: 40%
   * - Duration Efficiency: 20%
   * - Sentiment: 25%
   * - Resolution: 15%
   */
  async scoreAgent(agentId: string): Promise<AgentScore | null> {
    // Get agent info
    const agent = await this.db.get<{ id: string; name: string }>(
      'SELECT id, name FROM ai_agents WHERE id = $1',
      [agentId]
    );

    if (!agent) {
      logger.warn(`Agent not found: ${agentId}`);
      return null;
    }

    // Get conversation stats for this agent (last 30 days)
    const stats = await this.db.get<{
      total_calls: string;
      completed_calls: string;
      avg_duration: string;
      positive_sentiment: string;
      neutral_sentiment: string;
      negative_sentiment: string;
      resolved_calls: string;
    }>(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE state = 'completed') as completed_calls,
        COALESCE(AVG(total_duration_seconds), 0) as avg_duration,
        COUNT(*) FILTER (WHERE sentiment_score >= 0.5) as positive_sentiment,
        COUNT(*) FILTER (WHERE sentiment_score >= 0 AND sentiment_score < 0.5) as neutral_sentiment,
        COUNT(*) FILTER (WHERE sentiment_score < 0) as negative_sentiment,
        COUNT(*) FILTER (WHERE outcome = 'completed') as resolved_calls
      FROM ai_conversations
      WHERE ai_agent_id = $1
        AND start_time >= NOW() - INTERVAL '30 days'
    `, [agentId]);

    if (!stats) {
      return null;
    }

    const totalCalls = parseInt(stats.total_calls, 10);
    const completedCalls = parseInt(stats.completed_calls, 10);
    const avgDuration = parseFloat(stats.avg_duration);
    const positiveSentiment = parseInt(stats.positive_sentiment, 10);
    const resolvedCalls = parseInt(stats.resolved_calls, 10);

    if (totalCalls === 0) {
      return null;
    }

    // Calculate individual scores (0-100)
    const successScore = (completedCalls / totalCalls) * 100;

    // Efficiency score: penalize calls over 5 minutes, reward under 2 minutes
    let efficiencyScore = 100;
    if (avgDuration > 300) { // Over 5 min
      efficiencyScore = Math.max(0, 100 - ((avgDuration - 300) / 6)); // Lose points for each 6 seconds over 5 min
    } else if (avgDuration < 120) { // Under 2 min
      efficiencyScore = 100; // Perfect efficiency
    } else {
      efficiencyScore = 100 - ((avgDuration - 120) / 18) * 10; // Gradual decrease
    }
    efficiencyScore = Math.max(0, Math.min(100, efficiencyScore));

    // Sentiment score
    const sentimentScore = totalCalls > 0 ? (positiveSentiment / totalCalls) * 100 : 50;

    // Resolution score
    const resolutionScore = totalCalls > 0 ? (resolvedCalls / totalCalls) * 100 : 50;

    // Calculate weighted overall score
    const overallScore = (
      successScore * 0.40 +
      efficiencyScore * 0.20 +
      sentimentScore * 0.25 +
      resolutionScore * 0.15
    );

    const agentScore: Omit<AgentScore, 'lastUpdated'> = {
      agentId,
      agentName: agent.name,
      overallScore: Math.round(overallScore * 10) / 10,
      successScore: Math.round(successScore * 10) / 10,
      efficiencyScore: Math.round(efficiencyScore * 10) / 10,
      sentimentScore: Math.round(sentimentScore * 10) / 10,
      resolutionScore: Math.round(resolutionScore * 10) / 10,
      totalCalls,
      scoredCalls: completedCalls,
    };

    // Store the score
    await this.insightsRepo.storeAgentScore(agentScore);

    this.emit('agent_scored', {
      agentId,
      agentName: agent.name,
      overallScore: agentScore.overallScore,
    });

    return {
      ...agentScore,
      lastUpdated: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Score all agents
   */
  async scoreAllAgents(): Promise<AgentScore[]> {
    const agents = await this.db.all<{ id: string }>(
      'SELECT id FROM ai_agents WHERE enabled = true'
    );

    const scores: AgentScore[] = [];
    for (const agent of agents) {
      const score = await this.scoreAgent(agent.id);
      if (score) {
        scores.push(score);
      }
    }

    logger.info(`Scored ${scores.length} agents`);
    return scores;
  }

  /**
   * Get agent score
   */
  async getAgentScore(agentId: string): Promise<AgentScore | null> {
    return this.insightsRepo.getAgentScore(agentId);
  }

  /**
   * Get all agent scores
   */
  async getAllAgentScores(): Promise<AgentScore[]> {
    return this.insightsRepo.getAllAgentScores();
  }

  // ==========================================
  // TOPIC ANALYSIS
  // ==========================================

  /**
   * Extract topics from a conversation
   */
  async extractTopics(conversationId: string): Promise<string[]> {
    if (!this.provider) {
      return [];
    }

    const turns = await this.db.all<{ content: string }>(`
      SELECT content FROM ai_conversation_turns
      WHERE conversation_id = $1 AND role = 'user'
      ORDER BY turn_number ASC
    `, [conversationId]);

    if (turns.length === 0) return [];

    const userContent = turns.map(t => t.content).join(' ');

    try {
      const result = await this.provider.complete([
        systemMessage('Extract the main topics discussed by the customer. Return ONLY a JSON array of topic strings, max 5 topics. Example: ["billing", "account access", "refund request"]'),
        userMessage(userContent),
      ], {
        temperature: 0.3,
        maxTokens: 100,
      });

      const topics = this.parseJsonResponse<string[]>(result.content);
      if (!topics || !Array.isArray(topics)) {
        return [];
      }

      // Store topics
      for (const topic of topics) {
        await this.insightsRepo.storeTopic(topic, 'neutral', []);
      }

      return topics;
    } catch (error) {
      logger.error('Topic extraction failed:', error);
      return [];
    }
  }

  /**
   * Get top topics
   */
  async getTopTopics(limit = 20): Promise<TopicInsight[]> {
    return this.insightsRepo.getTopTopics(limit);
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  /**
   * Get insights dashboard
   */
  async getDashboard(): Promise<{
    intentDistribution: IntentDistribution[];
    topFAQs: FAQ[];
    agentScores: AgentScore[];
    topTopics: TopicInsight[];
    insightCounts: Record<string, number>;
  }> {
    return this.insightsRepo.getDashboardSummary();
  }

  /**
   * Process a completed conversation (classify intent, extract FAQs, topics)
   */
  async processConversation(conversationId: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Run in parallel
      await Promise.all([
        this.classifyIntent(conversationId),
        this.extractFAQs(conversationId),
        this.extractTopics(conversationId),
      ]);

      logger.info(`Processed insights for conversation ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to process insights for ${conversationId}:`, error);
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private parseJsonResponse<T>(response: string): T | null {
    try {
      let jsonStr = response.trim();

      // Handle markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Failed to parse JSON response:', error);
      return null;
    }
  }
}
