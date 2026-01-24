/**
 * STT Providers Index
 * Export all STT providers and utilities
 */

// Provider implementations
export { DeepgramProvider, createDeepgramProvider } from './deepgramProvider';
export { WhisperProvider, createWhisperProvider } from './whisperProvider';
export { AssemblyAIProvider, createAssemblyAIProvider } from './assemblyaiProvider';

// Base types and utilities
export {
  STTProvider,
  STTProviderType,
  STTStream,
  STTStreamConfig,
  STTTranscriptResult,
  STTTranscriptWord,
  STTProviderConfig,
  TranscribeFileOptions,
  TranscribeFileResult,
  BaseSTTStream,
  registerSTTProvider,
  getSTTProvider,
  getAllSTTProviders,
  hasSTTProvider,
} from '../providers/sttProvider';

import { DeepgramProvider } from './deepgramProvider';
import { WhisperProvider } from './whisperProvider';
import { AssemblyAIProvider } from './assemblyaiProvider';
import { registerSTTProvider } from '../providers/sttProvider';
import { logger } from '../../utils/logger';

/**
 * Initialize all STT providers from environment/config
 */
export function initializeSTTProviders(config: {
  deepgram?: { apiKey: string; model?: string };
  whisper?: { apiKey: string; model?: string };
  assemblyai?: { apiKey: string };
}): void {
  if (config.deepgram?.apiKey) {
    const provider = new DeepgramProvider({
      apiKey: config.deepgram.apiKey,
      defaultModel: config.deepgram.model || 'nova-2-phonecall',
    });
    registerSTTProvider(provider);
    logger.info('STT: Deepgram provider initialized');
  }

  if (config.whisper?.apiKey) {
    const provider = new WhisperProvider({
      apiKey: config.whisper.apiKey,
      defaultModel: config.whisper.model || 'whisper-1',
    });
    registerSTTProvider(provider);
    logger.info('STT: Whisper provider initialized');
  }

  if (config.assemblyai?.apiKey) {
    const provider = new AssemblyAIProvider({
      apiKey: config.assemblyai.apiKey,
    });
    registerSTTProvider(provider);
    logger.info('STT: AssemblyAI provider initialized');
  }
}

/**
 * Create an STT provider by type
 */
export function createSTTProvider(
  type: 'deepgram' | 'whisper' | 'assemblyai',
  apiKey: string,
  options?: { model?: string }
) {
  switch (type) {
    case 'deepgram':
      return new DeepgramProvider({
        apiKey,
        defaultModel: options?.model || 'nova-2-phonecall',
      });
    case 'whisper':
      return new WhisperProvider({
        apiKey,
        defaultModel: options?.model || 'whisper-1',
      });
    case 'assemblyai':
      return new AssemblyAIProvider({
        apiKey,
      });
    default:
      throw new Error(`Unknown STT provider type: ${type}`);
  }
}
