/**
 * AI Module Index
 * Export all AI-related components
 */

// LLM Providers
export {
  LLMProvider,
  LLMProviderType,
  LLMMessage,
  LLMCompletionResult,
  LLMStreamResult,
  createLLMProvider,
  getLLMProvider,
  getAllLLMProviders,
  registerLLMProvider,
  initializeLLMProviders,
  OpenAIProvider,
  AnthropicProvider,
  GroqProvider,
  systemMessage,
  userMessage,
  assistantMessage,
  functionMessage,
} from './llm';

// STT Providers
export {
  STTProvider,
  STTProviderType,
  STTStream,
  STTStreamConfig,
  STTTranscriptResult,
  createSTTProvider,
  getSTTProvider,
  getAllSTTProviders,
  registerSTTProvider,
  initializeSTTProviders,
  DeepgramProvider,
  WhisperProvider,
  AssemblyAIProvider,
} from './stt';

// AudioSocket
export {
  AudioSocketServer,
  AudioSocketSession,
  VADProcessor,
  BargeInDetector,
  getAudioSocketServer,
  startAudioSocketServer,
  stopAudioSocketServer,
  AUDIO_SOCKET_PORT,
  SAMPLE_RATE,
} from './audioSocket';

// Conversation Engine
export {
  ConversationEngine,
  ConversationState,
  ConversationContext,
  ConversationTurn,
  AIAgentConfig,
  FunctionDefinition,
  FunctionResult,
  createConversationEngine,
} from './conversationEngine';

// Functions
export {
  registerFunction,
  getFunction,
  getAllFunctions,
  getFunctionsForAgent,
  executeFunction,
  initializeFunctions,
  defineFunction,
} from './functions';

// Transcription Service
export {
  getTranscriptionService,
  initializeTranscriptionService,
  TranscriptionRequest,
  TranscriptionResult,
} from './transcriptionService';

import { initializeLLMProviders } from './llm';
import { initializeSTTProviders } from './stt';
import { initializeFunctions } from './functions';
import { startAudioSocketServer } from './audioSocket';
import { initializeTranscriptionService } from './transcriptionService';
import { logger } from '../utils/logger';

/**
 * Initialize all AI components
 */
export async function initializeAI(config: {
  llm?: {
    openai?: { apiKey: string; model?: string };
    anthropic?: { apiKey: string; model?: string };
    groq?: { apiKey: string; model?: string };
  };
  stt?: {
    deepgram?: { apiKey: string; model?: string };
    whisper?: { apiKey: string; model?: string };
    assemblyai?: { apiKey: string };
  };
  audioSocket?: {
    enabled?: boolean;
    port?: number;
  };
  transcription?: {
    enabled?: boolean;
  };
}): Promise<void> {
  logger.info('Initializing AI module...');

  // Initialize LLM providers
  if (config.llm) {
    initializeLLMProviders(config.llm);
    logger.info('LLM providers initialized');
  }

  // Initialize STT providers
  if (config.stt) {
    initializeSTTProviders(config.stt);
    logger.info('STT providers initialized');
  }

  // Initialize AI functions
  await initializeFunctions();
  logger.info('AI functions initialized');

  // Start AudioSocket server
  if (config.audioSocket?.enabled !== false) {
    await startAudioSocketServer();
    logger.info('AudioSocket server started');
  }

  // Initialize transcription service
  if (config.transcription?.enabled !== false) {
    await initializeTranscriptionService();
    logger.info('Transcription service initialized');
  }

  logger.info('AI module initialized successfully');
}
