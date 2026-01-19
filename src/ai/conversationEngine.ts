/**
 * AI Conversation Engine
 * State machine that orchestrates real-time AI phone conversations
 *
 * Flow: INIT → GREETING → LISTENING → THINKING → SPEAKING → (loop) → END
 *
 * Target latency: <500ms end-to-end
 * - Audio capture + VAD: 50ms
 * - STT processing: 100ms (Deepgram streaming)
 * - LLM inference: 200ms (GPT-4o streaming)
 * - TTS generation: 100ms (streaming)
 * - Audio delivery: 50ms
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  AudioSocketSession,
  VADProcessor,
  BargeInDetector,
  SAMPLE_RATE,
} from './audioSocket';
import {
  STTProvider,
  STTStream,
  STTTranscriptResult,
  getSTTProvider,
} from './stt';
import {
  LLMProvider,
  LLMMessage,
  LLMCompletionResult,
  getLLMProvider,
  systemMessage,
  userMessage,
  assistantMessage,
  functionMessage,
} from './llm';
import { getTTSService } from '../services/ttsService';
import { logger } from '../utils/logger';
import { db } from '../db/compat';

// =============================================================================
// TYPES
// =============================================================================

export enum ConversationState {
  INIT = 'init',
  GREETING = 'greeting',
  LISTENING = 'listening',
  THINKING = 'thinking',
  SPEAKING = 'speaking',
  FUNCTION_CALL = 'function_call',
  TRANSFERRING = 'transferring',
  ENDING = 'ending',
  ENDED = 'ended',
}

export interface AIAgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  greetingText: string;
  voiceProvider: string;
  voiceId: string;
  language: string;
  llmProvider: string;
  llmModel: string;
  sttProvider: string;
  enabledFunctions?: string[];
  maxTurns?: number;
  maxDurationMs?: number;
}

export interface ConversationTurn {
  id: string;
  turnNumber: number;
  role: 'user' | 'assistant' | 'function';
  content: string;
  functionName?: string;
  functionArgs?: string;
  functionResult?: string;
  latencyMs: number;
  timestamp: number;
}

export interface ConversationContext {
  conversationId: string;
  agentId: string;
  callUuid: string;
  callLogId?: string;
  direction: 'inbound' | 'outbound';
  callerNumber?: string;
  calledNumber?: string;
  startTime: number;
  turns: ConversationTurn[];
  messages: LLMMessage[];
  totalTokens: number;
  outcome?: string;
  sentimentScore?: number;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ConversationContext) => Promise<FunctionResult>;
}

export interface FunctionResult {
  success: boolean;
  result?: unknown;
  message?: string;
  action?: 'continue' | 'transfer' | 'end';
  transferTarget?: string;
}

export interface ConversationEngineEvents {
  stateChange: (oldState: ConversationState, newState: ConversationState) => void;
  transcript: (text: string, isFinal: boolean) => void;
  response: (text: string, isComplete: boolean) => void;
  turn: (turn: ConversationTurn) => void;
  functionCall: (name: string, args: Record<string, unknown>) => void;
  functionResult: (name: string, result: FunctionResult) => void;
  transfer: (target: string) => void;
  end: (context: ConversationContext) => void;
  error: (error: Error) => void;
}

// =============================================================================
// CONVERSATION ENGINE
// =============================================================================

export class ConversationEngine extends EventEmitter {
  private state: ConversationState = ConversationState.INIT;
  private context: ConversationContext;
  private agentConfig: AIAgentConfig;

  // Providers
  private sttProvider: STTProvider | null = null;
  private llmProvider: LLMProvider | null = null;
  private sttStream: STTStream | null = null;

  // Audio session
  private audioSession: AudioSocketSession | null = null;
  private vad: VADProcessor;
  private bargeInDetector: BargeInDetector;

  // Buffers and state
  private transcriptBuffer: string = '';
  private isAISpeaking: boolean = false;
  private currentTurnNumber: number = 0;
  private turnStartTime: number = 0;

  // Functions
  private functions: Map<string, FunctionDefinition> = new Map();

  // Cleanup handlers
  private cleanupHandlers: (() => void)[] = [];

  constructor(agentConfig: AIAgentConfig, callUuid: string, direction: 'inbound' | 'outbound' = 'inbound') {
    super();

    this.agentConfig = agentConfig;
    this.vad = new VADProcessor({ maxSilenceMs: 700 });
    this.bargeInDetector = new BargeInDetector();

    // Initialize context
    this.context = {
      conversationId: uuidv4(),
      agentId: agentConfig.id,
      callUuid,
      direction,
      startTime: Date.now(),
      turns: [],
      messages: [systemMessage(agentConfig.systemPrompt)],
      totalTokens: 0,
    };

    // Setup VAD events
    this.vad.on('speechEnd', () => {
      if (this.state === ConversationState.LISTENING) {
        this.handleUserFinishedSpeaking();
      }
    });

    // Setup barge-in events
    this.bargeInDetector.on('bargeIn', () => {
      if (this.state === ConversationState.SPEAKING) {
        this.handleBargeIn();
      }
    });
  }

  /**
   * Initialize the conversation engine
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing conversation engine for call ${this.context.callUuid}`);

    // Get providers
    this.sttProvider = getSTTProvider(this.agentConfig.sttProvider as any) || null;
    this.llmProvider = getLLMProvider(this.agentConfig.llmProvider as any) || null;

    if (!this.sttProvider) {
      throw new Error(`STT provider not found: ${this.agentConfig.sttProvider}`);
    }

    if (!this.llmProvider) {
      throw new Error(`LLM provider not found: ${this.agentConfig.llmProvider}`);
    }

    // Create STT stream
    this.sttStream = await this.sttProvider.createStream({
      language: this.agentConfig.language,
      interimResults: true,
      endpointing: 700,
      sampleRate: SAMPLE_RATE,
      encoding: 'linear16',
      channels: 1,
    });

    // Handle STT events
    this.sttStream.on('transcript', (result: STTTranscriptResult) => {
      this.handleTranscript(result);
    });

    this.sttStream.on('utterance_end', () => {
      if (this.state === ConversationState.LISTENING && this.transcriptBuffer.trim()) {
        this.handleUserFinishedSpeaking();
      }
    });

    this.sttStream.on('error', (error) => {
      logger.error(`STT stream error: ${error.message}`);
      this.emit('error', error);
    });

    // Save conversation to database
    await this.saveConversation();
  }

  /**
   * Attach to an AudioSocket session
   */
  attachAudioSession(session: AudioSocketSession): void {
    this.audioSession = session;

    // Handle incoming audio
    session.on('audio', (audio: Buffer) => {
      this.handleIncomingAudio(audio);
    });

    // Handle hangup
    session.on('hangup', () => {
      this.end('caller_hangup');
    });

    session.on('close', () => {
      if (this.state !== ConversationState.ENDED) {
        this.end('connection_lost');
      }
    });

    // Cleanup handler
    this.cleanupHandlers.push(() => {
      session.removeAllListeners();
    });
  }

  /**
   * Start the conversation (play greeting)
   */
  async start(): Promise<void> {
    this.setState(ConversationState.GREETING);

    // Speak the greeting
    await this.speak(this.agentConfig.greetingText);

    // Add greeting to context
    this.addTurn('assistant', this.agentConfig.greetingText);
    this.context.messages.push(assistantMessage(this.agentConfig.greetingText));

    // Start listening
    this.setState(ConversationState.LISTENING);
  }

  /**
   * Register a function for function calling
   */
  registerFunction(fn: FunctionDefinition): void {
    this.functions.set(fn.name, fn);
  }

  /**
   * Register multiple functions
   */
  registerFunctions(fns: FunctionDefinition[]): void {
    fns.forEach((fn) => this.registerFunction(fn));
  }

  /**
   * Get available function definitions for LLM
   */
  private getFunctionDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    const enabledFunctions = this.agentConfig.enabledFunctions || [];

    return Array.from(this.functions.values())
      .filter((fn) => enabledFunctions.length === 0 || enabledFunctions.includes(fn.name))
      .map((fn) => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      }));
  }

  /**
   * Handle incoming audio from AudioSocket
   */
  private handleIncomingAudio(audio: Buffer): void {
    // Check for barge-in
    if (this.isAISpeaking) {
      this.bargeInDetector.setAISpeaking(true);
      if (this.bargeInDetector.checkBargeIn(audio)) {
        return; // Barge-in handled
      }
    }

    // Process VAD
    this.vad.process(audio);

    // Send to STT if listening
    if (this.state === ConversationState.LISTENING && this.sttStream?.isOpen()) {
      this.sttStream.sendAudio(audio);
    }
  }

  /**
   * Handle STT transcript
   */
  private handleTranscript(result: STTTranscriptResult): void {
    if (result.isFinal && result.text.trim()) {
      this.transcriptBuffer = result.text.trim();
      this.emit('transcript', result.text, true);
    } else if (!result.isFinal) {
      this.emit('transcript', result.text, false);
    }
  }

  /**
   * Handle user finished speaking
   */
  private async handleUserFinishedSpeaking(): Promise<void> {
    if (!this.transcriptBuffer.trim()) return;

    const userText = this.transcriptBuffer.trim();
    this.transcriptBuffer = '';

    logger.info(`User said: "${userText}"`);

    // Add user turn
    this.addTurn('user', userText);
    this.context.messages.push(userMessage(userText));

    // Generate response
    this.setState(ConversationState.THINKING);
    this.turnStartTime = Date.now();

    try {
      await this.generateResponse();
    } catch (error) {
      logger.error(`Error generating response: ${error}`);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.setState(ConversationState.LISTENING);
    }
  }

  /**
   * Handle barge-in (user interrupting AI)
   */
  private handleBargeIn(): void {
    logger.info('Barge-in detected, stopping AI speech');

    // Stop TTS playback
    this.isAISpeaking = false;
    this.bargeInDetector.setAISpeaking(false);

    // Reset VAD
    this.vad.reset();

    // Switch to listening
    this.setState(ConversationState.LISTENING);
  }

  /**
   * Generate AI response
   */
  private async generateResponse(): Promise<void> {
    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }

    const functions = this.getFunctionDefinitions();

    // Stream response for lowest latency
    const stream = this.llmProvider.stream(this.context.messages, {
      model: this.agentConfig.llmModel,
      maxTokens: 150,
      temperature: 0.7,
      functions: functions.length > 0 ? functions : undefined,
      functionCall: functions.length > 0 ? 'auto' : undefined,
    });

    let responseText = '';
    let functionCall: { name: string; arguments: string } | undefined;
    let firstChunk = true;

    stream.on('chunk', async (chunk) => {
      if (chunk.content) {
        responseText += chunk.content;

        // Start speaking as soon as we have enough text
        if (firstChunk && responseText.length > 20) {
          firstChunk = false;
          this.setState(ConversationState.SPEAKING);
          // Start TTS in background
          this.startStreamingTTS(responseText);
        }

        this.emit('response', chunk.content, false);
      }

      if (chunk.functionCall) {
        functionCall = chunk.functionCall;
      }
    });

    stream.on('done', async (result: LLMCompletionResult) => {
      this.context.totalTokens += result.usage.totalTokens;

      if (functionCall) {
        // Handle function call
        await this.handleFunctionCall(functionCall.name, functionCall.arguments);
      } else if (responseText) {
        // Finish speaking
        await this.finishSpeaking(responseText);
      }
    });

    stream.on('error', (error) => {
      logger.error(`LLM stream error: ${error.message}`);
      this.emit('error', error);
      this.setState(ConversationState.LISTENING);
    });
  }

  /**
   * Start streaming TTS playback
   */
  private async startStreamingTTS(text: string): Promise<void> {
    this.isAISpeaking = true;
    this.bargeInDetector.setAISpeaking(true);

    try {
      const ttsService = await getTTSService();
      const audioBuffer = await ttsService.synthesize(text, {
        provider: this.agentConfig.voiceProvider,
        voiceId: this.agentConfig.voiceId,
        outputFormat: 'pcm',
        sampleRate: SAMPLE_RATE,
      });

      // Send to AudioSocket
      if (this.audioSession && this.isAISpeaking) {
        this.audioSession.sendAudio(audioBuffer);
      }
    } catch (error) {
      logger.error(`TTS error: ${error}`);
    }
  }

  /**
   * Finish speaking and transition to listening
   */
  private async finishSpeaking(text: string): Promise<void> {
    const latencyMs = Date.now() - this.turnStartTime;

    // Add assistant turn
    this.addTurn('assistant', text, latencyMs);
    this.context.messages.push(assistantMessage(text));

    this.emit('response', '', true);

    // Wait for audio to finish playing (approximate)
    const speechDurationMs = (text.length / 15) * 1000; // ~15 chars/sec speaking rate
    await new Promise((resolve) => setTimeout(resolve, speechDurationMs));

    this.isAISpeaking = false;
    this.bargeInDetector.setAISpeaking(false);

    // Check for max turns
    if (this.agentConfig.maxTurns && this.currentTurnNumber >= this.agentConfig.maxTurns) {
      this.end('max_turns_reached');
      return;
    }

    // Check for max duration
    if (this.agentConfig.maxDurationMs) {
      const elapsed = Date.now() - this.context.startTime;
      if (elapsed >= this.agentConfig.maxDurationMs) {
        this.end('max_duration_reached');
        return;
      }
    }

    // Start listening for next turn
    this.setState(ConversationState.LISTENING);
  }

  /**
   * Handle function call
   */
  private async handleFunctionCall(name: string, argsJson: string): Promise<void> {
    this.setState(ConversationState.FUNCTION_CALL);

    logger.info(`Function call: ${name}(${argsJson})`);

    const fn = this.functions.get(name);
    if (!fn) {
      logger.warn(`Unknown function: ${name}`);
      const errorResult = { success: false, message: `Unknown function: ${name}` };
      await this.processFunctionResult(name, argsJson, errorResult);
      return;
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsJson);
    } catch (e) {
      logger.error(`Invalid function arguments: ${argsJson}`);
    }

    this.emit('functionCall', name, args);

    try {
      const result = await fn.handler(args, this.context);
      this.emit('functionResult', name, result);
      await this.processFunctionResult(name, argsJson, result);
    } catch (error) {
      logger.error(`Function error: ${error}`);
      const errorResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Function execution failed',
      };
      await this.processFunctionResult(name, argsJson, errorResult);
    }
  }

  /**
   * Process function result and continue conversation
   */
  private async processFunctionResult(
    name: string,
    argsJson: string,
    result: FunctionResult
  ): Promise<void> {
    // Add function turn
    this.addTurn('function', JSON.stringify(result), 0, name, argsJson, JSON.stringify(result));

    // Add to messages for LLM context
    this.context.messages.push(functionMessage(name, JSON.stringify(result)));

    // Handle action
    switch (result.action) {
      case 'transfer':
        if (result.transferTarget) {
          this.transfer(result.transferTarget);
        }
        return;

      case 'end':
        this.end(result.message || 'function_requested_end');
        return;

      case 'continue':
      default:
        // Generate follow-up response
        this.setState(ConversationState.THINKING);
        this.turnStartTime = Date.now();
        await this.generateResponse();
    }
  }

  /**
   * Speak text
   */
  private async speak(text: string): Promise<void> {
    this.isAISpeaking = true;
    this.bargeInDetector.setAISpeaking(true);

    try {
      const ttsService = await getTTSService();
      const audioBuffer = await ttsService.synthesize(text, {
        provider: this.agentConfig.voiceProvider,
        voiceId: this.agentConfig.voiceId,
        outputFormat: 'pcm',
        sampleRate: SAMPLE_RATE,
      });

      if (this.audioSession) {
        this.audioSession.sendAudio(audioBuffer);
      }

      // Wait for audio to finish
      const speechDurationMs = (text.length / 15) * 1000;
      await new Promise((resolve) => setTimeout(resolve, speechDurationMs));
    } catch (error) {
      logger.error(`Speak error: ${error}`);
    }

    this.isAISpeaking = false;
    this.bargeInDetector.setAISpeaking(false);
  }

  /**
   * Add a conversation turn
   */
  private addTurn(
    role: 'user' | 'assistant' | 'function',
    content: string,
    latencyMs: number = 0,
    functionName?: string,
    functionArgs?: string,
    functionResult?: string
  ): void {
    this.currentTurnNumber++;

    const turn: ConversationTurn = {
      id: uuidv4(),
      turnNumber: this.currentTurnNumber,
      role,
      content,
      functionName,
      functionArgs,
      functionResult,
      latencyMs,
      timestamp: Date.now(),
    };

    this.context.turns.push(turn);
    this.emit('turn', turn);

    // Save turn to database
    this.saveTurn(turn).catch((error) => {
      logger.error(`Failed to save turn: ${error}`);
    });
  }

  /**
   * Set conversation state
   */
  private setState(newState: ConversationState): void {
    const oldState = this.state;
    this.state = newState;
    logger.debug(`Conversation state: ${oldState} → ${newState}`);
    this.emit('stateChange', oldState, newState);
  }

  /**
   * Transfer call to another destination
   */
  transfer(target: string): void {
    this.setState(ConversationState.TRANSFERRING);
    this.emit('transfer', target);
    // Actual transfer handled by caller
  }

  /**
   * End the conversation
   */
  async end(outcome: string = 'completed'): Promise<void> {
    if (this.state === ConversationState.ENDED) return;

    this.setState(ConversationState.ENDING);

    this.context.outcome = outcome;

    // Close STT stream
    if (this.sttStream?.isOpen()) {
      this.sttStream.close();
    }

    // Hangup AudioSocket
    if (this.audioSession) {
      this.audioSession.hangup();
    }

    // Run cleanup handlers
    this.cleanupHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        // Ignore
      }
    });

    // Update database
    await this.updateConversationEnd();

    this.setState(ConversationState.ENDED);
    this.emit('end', this.context);

    logger.info(`Conversation ${this.context.conversationId} ended: ${outcome}`);
  }

  /**
   * Get current state
   */
  getState(): ConversationState {
    return this.state;
  }

  /**
   * Get conversation context
   */
  getContext(): ConversationContext {
    return this.context;
  }

  // =============================================================================
  // DATABASE OPERATIONS
  // =============================================================================

  private async saveConversation(): Promise<void> {
    try {
      db.run(
        `INSERT INTO ai_conversations (
          id, call_log_id, ai_agent_id, direction, state, start_time
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          this.context.conversationId,
          this.context.callLogId || null,
          this.context.agentId,
          this.context.direction,
          this.state,
          this.context.startTime,
        ]
      );
    } catch (error) {
      logger.error(`Failed to save conversation: ${error}`);
    }
  }

  private async saveTurn(turn: ConversationTurn): Promise<void> {
    try {
      db.run(
        `INSERT INTO ai_conversation_turns (
          id, conversation_id, turn_number, role, content,
          function_name, function_args, function_result, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          turn.id,
          this.context.conversationId,
          turn.turnNumber,
          turn.role,
          turn.content,
          turn.functionName || null,
          turn.functionArgs || null,
          turn.functionResult || null,
          turn.latencyMs,
          turn.timestamp,
        ]
      );
    } catch (error) {
      logger.error(`Failed to save turn: ${error}`);
    }
  }

  private async updateConversationEnd(): Promise<void> {
    try {
      db.run(
        `UPDATE ai_conversations SET
          state = ?,
          end_time = ?,
          outcome = ?,
          sentiment_score = ?,
          total_llm_tokens = ?,
          context_snapshot = ?
        WHERE id = ?`,
        [
          this.state,
          Date.now(),
          this.context.outcome,
          this.context.sentimentScore || null,
          this.context.totalTokens,
          JSON.stringify({
            turns: this.context.turns.length,
            messages: this.context.messages.length,
          }),
          this.context.conversationId,
        ]
      );
    } catch (error) {
      logger.error(`Failed to update conversation: ${error}`);
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a conversation engine for an AI agent
 */
export async function createConversationEngine(
  agentId: string,
  callUuid: string,
  direction: 'inbound' | 'outbound' = 'inbound'
): Promise<ConversationEngine> {
  // Load agent config from database
  const agent = await db.queryOne<{
    id: string;
    name: string;
    system_prompt: string;
    greeting_text: string;
    voice_provider: string;
    voice_id: string;
    language: string;
    llm_provider: string;
    llm_model: string;
    stt_provider: string;
    enabled_functions: string | null;
  }>('SELECT * FROM ai_agents WHERE id = $1 AND enabled = 1', [agentId]);

  if (!agent) {
    throw new Error(`AI agent not found: ${agentId}`);
  }

  const config: AIAgentConfig = {
    id: agent.id,
    name: agent.name,
    systemPrompt: agent.system_prompt,
    greetingText: agent.greeting_text,
    voiceProvider: agent.voice_provider,
    voiceId: agent.voice_id,
    language: agent.language,
    llmProvider: agent.llm_provider,
    llmModel: agent.llm_model,
    sttProvider: agent.stt_provider,
    enabledFunctions: agent.enabled_functions ? JSON.parse(agent.enabled_functions) : undefined,
  };

  const engine = new ConversationEngine(config, callUuid, direction);
  await engine.initialize();

  return engine;
}
