/**
 * AI Conversation Service
 * Orchestrates STT → LLM → TTS for real AI phone conversations
 */

import * as fs from 'fs';
import { TTSService } from './ttsService';
import {
  getLLMProvider,
  createLLMProvider,
  LLMMessage,
  systemMessage,
  userMessage,
  assistantMessage,
  LLMProviderType,
} from '../ai/llm';
import {
  getSTTProvider,
  createSTTProvider,
  STTProviderType,
} from '../ai/stt';
import { logger } from '../utils/logger';

// Conversation context for maintaining state across turns
export interface ConversationContext {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  messages: LLMMessage[];
  turnCount: number;
  maxTurns: number;
  llmProvider: LLMProviderType;
  sttProvider: STTProviderType;
  voiceProvider: string;
  voiceId: string;
  language: string;
}

// Configuration for creating a conversation
export interface AIAgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  greetingText: string;
  llmProvider: LLMProviderType;
  llmModel?: string;
  sttProvider: STTProviderType;
  voiceProvider: string;
  voiceId: string;
  language: string;
  maxTurns?: number;
}

// API keys configuration
export interface AIApiKeys {
  openai?: string;
  anthropic?: string;
  groq?: string;
  deepgram?: string;
  assemblyai?: string;
}

// Goodbye detection phrases
const GOODBYE_PHRASES = [
  'goodbye', 'bye', 'bye-bye', 'bye bye', 'good bye',
  'see you', 'take care', 'talk later', 'gotta go',
  'have to go', 'need to go', 'hanging up', 'that\'s all',
  "that's all", 'nothing else', 'no thanks', "no that's it",
  "that is all", 'i\'m done', "i'm done"
];

export class AIConversationService {
  private ttsService: TTSService;
  private apiKeys: AIApiKeys;

  constructor(ttsService: TTSService, apiKeys: AIApiKeys) {
    this.ttsService = ttsService;
    this.apiKeys = apiKeys;
  }

  /**
   * Create a new conversation context
   */
  createContext(config: AIAgentConfig): ConversationContext {
    const context: ConversationContext = {
      agentId: config.id,
      agentName: config.name,
      systemPrompt: config.systemPrompt,
      messages: [systemMessage(config.systemPrompt)],
      turnCount: 0,
      maxTurns: config.maxTurns || 10,
      llmProvider: config.llmProvider,
      sttProvider: config.sttProvider,
      voiceProvider: config.voiceProvider,
      voiceId: config.voiceId,
      language: config.language || 'en-US',
    };

    logger.info(`Created conversation context for agent ${config.name} (${config.id})`);
    return context;
  }

  /**
   * Transcribe audio file to text using configured STT provider
   */
  async transcribeAudio(
    audioPath: string,
    sttProvider: STTProviderType
  ): Promise<{ text: string; success: boolean; error?: string }> {
    try {
      // Check if audio file exists
      if (!fs.existsSync(audioPath)) {
        return { text: '', success: false, error: 'Audio file not found' };
      }

      // Get or create STT provider
      let provider = getSTTProvider(sttProvider);

      if (!provider) {
        // Try to create the provider on-the-fly
        const apiKey = this.getSTTApiKey(sttProvider);
        if (!apiKey) {
          return {
            text: '',
            success: false,
            error: `No API key configured for STT provider: ${sttProvider}`
          };
        }
        // Only create providers we support (local_whisper not yet implemented)
        if (sttProvider === 'local_whisper') {
          return {
            text: '',
            success: false,
            error: 'Local Whisper STT not yet implemented'
          };
        }
        provider = createSTTProvider(sttProvider as 'deepgram' | 'whisper' | 'assemblyai', apiKey);
      }

      logger.info(`Transcribing audio with ${sttProvider}: ${audioPath}`);
      const result = await provider.transcribeFile(audioPath);

      if (!result.text || result.text.trim().length === 0) {
        return { text: '', success: true }; // Empty/silent recording
      }

      logger.info(`Transcription result (${result.latencyMs}ms): "${result.text}"`);
      return { text: result.text, success: true };
    } catch (error) {
      logger.error(`STT transcription failed:`, error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown STT error'
      };
    }
  }

  /**
   * Generate LLM response from conversation context
   */
  async generateResponse(
    userText: string,
    context: ConversationContext
  ): Promise<{ response: string; success: boolean; error?: string }> {
    try {
      // Add user message to context
      context.messages.push(userMessage(userText));
      context.turnCount++;

      // Get or create LLM provider
      let provider = getLLMProvider(context.llmProvider);

      if (!provider) {
        // Try to create the provider on-the-fly
        const apiKey = this.getLLMApiKey(context.llmProvider);
        if (!apiKey) {
          return {
            response: '',
            success: false,
            error: `No API key configured for LLM provider: ${context.llmProvider}`
          };
        }
        provider = createLLMProvider(context.llmProvider, apiKey);
      }

      logger.info(`Generating LLM response with ${context.llmProvider}...`);
      const result = await provider.complete(context.messages, {
        temperature: 0.7,
        maxTokens: 150, // Keep responses concise for phone calls
      });

      const responseText = result.content.trim();

      // Add assistant response to context
      context.messages.push(assistantMessage(responseText));

      logger.info(`LLM response (${result.latencyMs}ms): "${responseText.substring(0, 100)}..."`);
      return { response: responseText, success: true };
    } catch (error) {
      logger.error(`LLM generation failed:`, error);
      return {
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown LLM error'
      };
    }
  }

  /**
   * Generate TTS audio from text
   */
  async generateTTS(
    text: string,
    promptId: string,
    voiceProvider: string,
    voiceId: string
  ): Promise<{ audioPath: string; success: boolean; error?: string }> {
    try {
      // Set the TTS provider temporarily
      const originalProvider = this.ttsService.getProvider();
      this.ttsService.setProvider(voiceProvider as any);

      logger.info(`Generating TTS with ${voiceProvider}...`);
      const result = await this.ttsService.generateAudio(text, promptId, { voice: voiceId });

      // Restore original provider
      this.ttsService.setProvider(originalProvider);

      if (!result.success || !result.data) {
        return {
          audioPath: '',
          success: false,
          error: result.error || 'TTS generation failed'
        };
      }

      logger.info(`TTS audio generated: ${result.data}`);
      return { audioPath: result.data, success: true };
    } catch (error) {
      logger.error(`TTS generation failed:`, error);
      return {
        audioPath: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown TTS error'
      };
    }
  }

  /**
   * Process a complete conversation turn: STT → LLM → TTS
   */
  async processTurn(
    audioPath: string,
    context: ConversationContext,
    promptIdBase: string
  ): Promise<{
    userText: string;
    responseText: string;
    audioFile: string;
    success: boolean;
    error?: string;
    isEmpty: boolean;
    isGoodbye: boolean;
  }> {
    // Step 1: Transcribe audio
    const sttResult = await this.transcribeAudio(audioPath, context.sttProvider);

    if (!sttResult.success) {
      return {
        userText: '',
        responseText: '',
        audioFile: '',
        success: false,
        error: sttResult.error,
        isEmpty: false,
        isGoodbye: false,
      };
    }

    // Check for empty/silent recording
    if (!sttResult.text || sttResult.text.trim().length === 0) {
      logger.info('Empty/silent recording detected');
      const silenceResponse = "I didn't catch that. Could you please repeat?";
      const ttsResult = await this.generateTTS(
        silenceResponse,
        `${promptIdBase}-silence`,
        context.voiceProvider,
        context.voiceId
      );

      return {
        userText: '',
        responseText: silenceResponse,
        audioFile: ttsResult.success ? ttsResult.audioPath : '',
        success: ttsResult.success,
        error: ttsResult.error,
        isEmpty: true,
        isGoodbye: false,
      };
    }

    // Check for goodbye
    const isGoodbye = this.detectGoodbye(sttResult.text);

    // Step 2: Generate LLM response
    const llmResult = await this.generateResponse(sttResult.text, context);

    if (!llmResult.success) {
      // Fallback response on LLM failure
      const fallbackResponse = "I'm having trouble understanding. Could you try again?";
      const ttsResult = await this.generateTTS(
        fallbackResponse,
        `${promptIdBase}-fallback`,
        context.voiceProvider,
        context.voiceId
      );

      return {
        userText: sttResult.text,
        responseText: fallbackResponse,
        audioFile: ttsResult.success ? ttsResult.audioPath : '',
        success: ttsResult.success,
        error: llmResult.error,
        isEmpty: false,
        isGoodbye,
      };
    }

    // Step 3: Generate TTS
    const ttsResult = await this.generateTTS(
      llmResult.response,
      `${promptIdBase}-turn-${context.turnCount}`,
      context.voiceProvider,
      context.voiceId
    );

    return {
      userText: sttResult.text,
      responseText: llmResult.response,
      audioFile: ttsResult.success ? ttsResult.audioPath : '',
      success: ttsResult.success,
      error: ttsResult.error,
      isEmpty: false,
      isGoodbye,
    };
  }

  /**
   * Check if conversation should end (max turns or goodbye)
   */
  shouldEndConversation(context: ConversationContext, isGoodbye: boolean): boolean {
    if (isGoodbye) {
      logger.info('Goodbye detected, ending conversation');
      return true;
    }

    if (context.turnCount >= context.maxTurns) {
      logger.info(`Max turns (${context.maxTurns}) reached, ending conversation`);
      return true;
    }

    return false;
  }

  /**
   * Generate farewell message
   */
  async generateFarewell(
    context: ConversationContext,
    promptId: string,
    customMessage?: string
  ): Promise<{ audioPath: string; success: boolean; error?: string }> {
    const farewellText = customMessage ||
      "Thank you for calling. Have a great day! Goodbye.";

    return this.generateTTS(
      farewellText,
      promptId,
      context.voiceProvider,
      context.voiceId
    );
  }

  /**
   * Detect goodbye phrases in text
   */
  private detectGoodbye(text: string): boolean {
    const lowerText = text.toLowerCase();
    return GOODBYE_PHRASES.some(phrase => lowerText.includes(phrase));
  }

  /**
   * Get API key for STT provider
   */
  private getSTTApiKey(provider: STTProviderType): string | undefined {
    switch (provider) {
      case 'deepgram':
        return this.apiKeys.deepgram;
      case 'whisper':
        return this.apiKeys.openai; // Whisper uses OpenAI API
      case 'assemblyai':
        return this.apiKeys.assemblyai;
      default:
        return undefined;
    }
  }

  /**
   * Get API key for LLM provider
   */
  private getLLMApiKey(provider: LLMProviderType): string | undefined {
    switch (provider) {
      case 'openai':
        return this.apiKeys.openai;
      case 'anthropic':
        return this.apiKeys.anthropic;
      case 'groq':
        return this.apiKeys.groq;
      default:
        return undefined;
    }
  }

  /**
   * Update API keys
   */
  updateApiKeys(keys: Partial<AIApiKeys>): void {
    Object.assign(this.apiKeys, keys);
  }
}
