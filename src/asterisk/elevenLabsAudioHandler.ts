/**
 * ElevenLabs Audio Handler for Asterisk AudioSocket
 *
 * Orchestrates the full conversation flow using ElevenLabs services:
 * - STT: ElevenLabs Scribe v2 Realtime
 * - LLM: OpenAI GPT-4 (or other configured LLM)
 * - TTS: ElevenLabs Streaming TTS
 *
 * Audio flow:
 * 1. Receive 8kHz audio from Asterisk
 * 2. Upsample to 16kHz for Scribe STT
 * 3. Get transcript from Scribe
 * 4. Send transcript to LLM for response
 * 5. Stream LLM response to ElevenLabs TTS
 * 6. Downsample TTS audio to 8kHz for Asterisk
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { ElevenLabsScribeService, ScribeSession, ScribeAudioUtils } from '../services/elevenLabsScribeService';
import { ElevenLabsTtsService, TtsSession, TtsAudioUtils, ElevenLabsVoiceModel } from '../services/elevenLabsTtsService';

// LLM provider options
export type LLMProvider = 'openai' | 'anthropic';

// Handler configuration
export interface ElevenLabsHandlerConfig {
  // ElevenLabs settings
  elevenLabsApiKey: string;
  voiceId: string;
  ttsModel?: ElevenLabsVoiceModel;

  // LLM settings
  llmProvider: LLMProvider;
  llmApiKey: string;
  llmModel?: string;
  systemPrompt: string;
  temperature?: number;

  // Session info
  sessionId: string;
  agentName?: string;
  greetingText?: string;
}

// Conversation message
interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * ElevenLabs Audio Handler
 * Handles a single call using ElevenLabs STT + LLM + TTS
 */
export class ElevenLabsAudioHandler extends EventEmitter {
  private config: ElevenLabsHandlerConfig;
  private scribeService: ElevenLabsScribeService;
  private ttsService: ElevenLabsTtsService;
  private scribeSession: ScribeSession | null = null;
  private ttsSession: TtsSession | null = null;

  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  private conversationHistory: ConversationMessage[] = [];
  private isProcessing = false;
  private isActive = false;
  private currentTranscript = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private silenceThresholdMs = 1000; // Wait 1 second of silence before processing

  // Audio buffers
  private audioInputBuffer: Buffer = Buffer.alloc(0);
  private audioOutputBuffer: Buffer = Buffer.alloc(0);

  constructor(config: ElevenLabsHandlerConfig) {
    super();
    this.config = {
      ttsModel: 'eleven_flash_v2_5',
      llmModel: config.llmProvider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o',
      temperature: 0.7,
      ...config,
    };

    // Initialize services
    this.scribeService = new ElevenLabsScribeService(config.elevenLabsApiKey);
    this.ttsService = new ElevenLabsTtsService(config.elevenLabsApiKey);

    // Initialize LLM client
    if (this.config.llmProvider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: this.config.llmApiKey });
    } else {
      this.openaiClient = new OpenAI({ apiKey: this.config.llmApiKey });
    }

    // Initialize conversation with system prompt
    this.conversationHistory.push({
      role: 'system',
      content: this.config.systemPrompt,
    });
  }

  /**
   * Initialize the handler and connect to services
   */
  async initialize(): Promise<void> {
    logger.info(`[ElevenLabs:${this.config.sessionId}] Initializing audio handler...`);

    try {
      // Connect to Scribe STT
      this.scribeSession = await this.scribeService.createSession(this.config.sessionId, {
        model: 'scribe_v2',
        language_code: 'en',
      });

      // Wire up Scribe events
      this.scribeSession.on('transcript', (text: string, isFinal: boolean) => {
        if (isFinal) {
          this.handleFinalTranscript(text);
        } else {
          this.currentTranscript = text;
          this.resetSilenceTimer();
        }
      });

      this.scribeSession.on('speech_started', () => {
        logger.debug(`[ElevenLabs:${this.config.sessionId}] Speech started`);
        // If AI is speaking, stop (barge-in)
        if (this.ttsSession && this.isProcessing) {
          logger.info(`[ElevenLabs:${this.config.sessionId}] Barge-in detected, stopping TTS`);
          this.audioOutputBuffer = Buffer.alloc(0); // Clear output buffer
          this.emit('interruption');
        }
      });

      this.scribeSession.on('error', (error: Error) => {
        logger.error(`[ElevenLabs:${this.config.sessionId}] Scribe error:`, error);
        this.emit('error', error);
      });

      this.scribeSession.on('disconnected', (reason: string) => {
        logger.info(`[ElevenLabs:${this.config.sessionId}] Scribe disconnected: ${reason}`);
        if (this.isActive) {
          this.emit('disconnected', reason);
        }
      });

      // Connect to TTS with μ-law 8kHz output (native Asterisk format - no resampling!)
      this.ttsSession = await this.ttsService.createSession(this.config.sessionId, {
        voiceId: this.config.voiceId,
        model: this.config.ttsModel,
        outputFormat: 'ulaw_8000', // Native 8kHz μ-law - no downsampling needed!
      });

      // Wire up TTS events
      this.ttsSession.on('audio', (audioData: Buffer) => {
        // Decode μ-law to slin (8kHz PCM16) for Asterisk - no sample rate conversion!
        const audio8k = TtsAudioUtils.ulawToPcm16(audioData);
        this.audioOutputBuffer = Buffer.concat([this.audioOutputBuffer, audio8k]);
        this.emit('audio', audio8k);
      });

      this.ttsSession.on('audio_done', () => {
        logger.debug(`[ElevenLabs:${this.config.sessionId}] TTS audio complete`);
        this.isProcessing = false;
        this.emit('response_done');
      });

      this.ttsSession.on('error', (error: Error) => {
        logger.error(`[ElevenLabs:${this.config.sessionId}] TTS error:`, error);
        this.emit('error', error);
      });

      this.ttsSession.on('disconnected', (reason: string) => {
        logger.info(`[ElevenLabs:${this.config.sessionId}] TTS disconnected: ${reason}`);
        if (this.isActive) {
          this.emit('disconnected', reason);
        }
      });

      this.isActive = true;
      logger.info(`[ElevenLabs:${this.config.sessionId}] Audio handler initialized`);

      // Send greeting if configured
      if (this.config.greetingText) {
        await this.speakText(this.config.greetingText);
      }
    } catch (error) {
      logger.error(`[ElevenLabs:${this.config.sessionId}] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming audio from Asterisk (8kHz slin)
   */
  handleAudioInput(audioData: Buffer): void {
    if (!this.isActive || !this.scribeSession) {
      return;
    }

    // Upsample from 8kHz to 16kHz for Scribe
    const audio16k = ScribeAudioUtils.upsample8kTo16k(audioData);

    // Send to Scribe for transcription
    this.scribeSession.sendAudio(audio16k);
  }

  /**
   * Get audio output for Asterisk (if any available)
   */
  getAudioOutput(chunkSize: number = 320): Buffer | null {
    if (this.audioOutputBuffer.length >= chunkSize) {
      const chunk = this.audioOutputBuffer.slice(0, chunkSize);
      this.audioOutputBuffer = this.audioOutputBuffer.slice(chunkSize);
      return chunk;
    }
    return null;
  }

  /**
   * Check if there's audio output available
   */
  hasAudioOutput(): boolean {
    return this.audioOutputBuffer.length > 0;
  }

  /**
   * Handle final transcript from Scribe
   */
  private handleFinalTranscript(text: string): void {
    if (!text || text.trim().length === 0) {
      return;
    }

    logger.info(`[ElevenLabs:${this.config.sessionId}] User said: "${text}"`);
    this.emit('transcript', text);

    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: text,
    });

    // Process with LLM
    this.processWithLLM(text);
  }

  /**
   * Reset silence timer
   */
  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      if (this.currentTranscript.trim().length > 0) {
        this.handleFinalTranscript(this.currentTranscript);
        this.currentTranscript = '';
      }
    }, this.silenceThresholdMs);
  }

  /**
   * Process user input with LLM and generate response
   */
  private async processWithLLM(userInput: string): Promise<void> {
    if (this.isProcessing) {
      logger.debug(`[ElevenLabs:${this.config.sessionId}] Already processing, skipping`);
      return;
    }

    this.isProcessing = true;

    try {
      let responseText = '';

      if (this.config.llmProvider === 'anthropic' && this.anthropicClient) {
        responseText = await this.getAnthropicResponse();
      } else if (this.openaiClient) {
        responseText = await this.getOpenAIResponse();
      }

      if (responseText) {
        logger.info(`[ElevenLabs:${this.config.sessionId}] AI response: "${responseText.substring(0, 100)}..."`);

        // Add to conversation history
        this.conversationHistory.push({
          role: 'assistant',
          content: responseText,
        });

        // Speak the response
        await this.speakText(responseText);
      }
    } catch (error) {
      logger.error(`[ElevenLabs:${this.config.sessionId}] LLM error:`, error);
      this.emit('error', error);
      this.isProcessing = false;
    }
  }

  /**
   * Get response from OpenAI
   */
  private async getOpenAIResponse(): Promise<string> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const messages = this.conversationHistory.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    const response = await this.openaiClient.chat.completions.create({
      model: this.config.llmModel || 'gpt-4o',
      messages,
      temperature: this.config.temperature,
      max_tokens: 500, // Keep responses concise for voice
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Get response from Anthropic
   */
  private async getAnthropicResponse(): Promise<string> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    // Extract system message and filter conversation
    const systemMessage = this.conversationHistory.find((m) => m.role === 'system')?.content || '';
    const messages = this.conversationHistory
      .filter((m) => m.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    const response = await this.anthropicClient.messages.create({
      model: this.config.llmModel || 'claude-3-5-sonnet-latest',
      max_tokens: 500,
      system: systemMessage,
      messages,
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : '';
  }

  /**
   * Speak text using ElevenLabs TTS
   */
  private async speakText(text: string): Promise<void> {
    if (!this.ttsSession || !this.isActive) {
      return;
    }

    logger.debug(`[ElevenLabs:${this.config.sessionId}] Speaking: "${text.substring(0, 50)}..."`);

    // Send text to TTS
    this.ttsSession.sendText(text);
    this.ttsSession.flush();

    this.emit('speaking', text);
  }

  /**
   * Send text to be spoken (public API)
   */
  async speak(text: string): Promise<void> {
    // Add to conversation as assistant
    this.conversationHistory.push({
      role: 'assistant',
      content: text,
    });

    await this.speakText(text);
  }

  /**
   * Check if handler is active
   */
  isHandlerActive(): boolean {
    return this.isActive;
  }

  /**
   * Check if currently processing/speaking
   */
  isSpeaking(): boolean {
    return this.isProcessing;
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    this.isActive = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.scribeSession) {
      this.scribeSession.disconnect();
      this.scribeSession = null;
    }

    if (this.ttsSession) {
      this.ttsSession.disconnect();
      this.ttsSession = null;
    }

    this.audioInputBuffer = Buffer.alloc(0);
    this.audioOutputBuffer = Buffer.alloc(0);

    logger.info(`[ElevenLabs:${this.config.sessionId}] Handler disconnected`);
  }
}

/**
 * Factory function to create ElevenLabs handler
 */
export async function createElevenLabsHandler(
  config: ElevenLabsHandlerConfig
): Promise<ElevenLabsAudioHandler> {
  const handler = new ElevenLabsAudioHandler(config);
  await handler.initialize();
  return handler;
}
