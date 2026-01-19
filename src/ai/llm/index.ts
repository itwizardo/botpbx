/**
 * LLM Providers Index
 * Export all LLM providers and utilities
 */

export { OpenAIProvider, createOpenAIProvider } from './openaiProvider';
export { AnthropicProvider, createAnthropicProvider } from './anthropicProvider';
export { GroqProvider, createGroqProvider } from './groqProvider';

export {
  LLMProvider,
  LLMProviderType,
  LLMMessage,
  LLMFunctionDefinition,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMStreamChunk,
  LLMStreamResult,
  LLMProviderConfig,
  registerLLMProvider,
  getLLMProvider,
  getAllLLMProviders,
  hasLLMProvider,
  systemMessage,
  userMessage,
  assistantMessage,
  functionMessage,
} from '../providers/llmProvider';

import { registerLLMProvider, LLMProviderType } from '../providers/llmProvider';
import { createOpenAIProvider } from './openaiProvider';
import { createAnthropicProvider } from './anthropicProvider';
import { createGroqProvider } from './groqProvider';

/**
 * Initialize all LLM providers from environment/config
 */
export function initializeLLMProviders(config: {
  openai?: { apiKey: string; model?: string };
  anthropic?: { apiKey: string; model?: string };
  groq?: { apiKey: string; model?: string };
}): void {
  if (config.openai?.apiKey) {
    registerLLMProvider(createOpenAIProvider(config.openai.apiKey, {
      defaultModel: config.openai.model,
    }));
  }

  if (config.anthropic?.apiKey) {
    registerLLMProvider(createAnthropicProvider(config.anthropic.apiKey, {
      defaultModel: config.anthropic.model,
    }));
  }

  if (config.groq?.apiKey) {
    registerLLMProvider(createGroqProvider(config.groq.apiKey, {
      defaultModel: config.groq.model,
    }));
  }
}

/**
 * Create an LLM provider by type
 */
export function createLLMProvider(
  type: LLMProviderType,
  apiKey: string,
  options?: { model?: string }
) {
  switch (type) {
    case 'openai':
      return createOpenAIProvider(apiKey, { defaultModel: options?.model });
    case 'anthropic':
      return createAnthropicProvider(apiKey, { defaultModel: options?.model });
    case 'groq':
      return createGroqProvider(apiKey, { defaultModel: options?.model });
    default:
      throw new Error(`Unknown LLM provider: ${type}`);
  }
}
