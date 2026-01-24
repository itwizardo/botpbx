/**
 * LLM Provider Abstraction Layer
 * Unified interface for multiple LLM providers with streaming support
 */

import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export type LLMProviderType = 'openai' | 'anthropic' | 'groq';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; // For function messages
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface LLMFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  functions?: LLMFunctionDefinition[];
  functionCall?: 'auto' | 'none' | { name: string };
  stopSequences?: string[];
}

export interface LLMCompletionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'function_call' | 'content_filter';
  functionCall?: {
    name: string;
    arguments: string;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface LLMStreamChunk {
  content: string;
  isFirst: boolean;
  isLast: boolean;
  functionCall?: {
    name: string;
    arguments: string;
  };
}

export interface LLMStreamResult extends EventEmitter {
  on(event: 'chunk', listener: (chunk: LLMStreamChunk) => void): this;
  on(event: 'done', listener: (result: LLMCompletionResult) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface LLMProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  timeout?: number;
}

// =============================================================================
// ABSTRACT PROVIDER
// =============================================================================

export abstract class LLMProvider {
  protected config: LLMProviderConfig;
  protected providerName: LLMProviderType;

  constructor(config: LLMProviderConfig, providerName: LLMProviderType) {
    this.config = config;
    this.providerName = providerName;
  }

  /**
   * Get provider name
   */
  getName(): LLMProviderType {
    return this.providerName;
  }

  /**
   * Generate a completion (non-streaming)
   */
  abstract complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;

  /**
   * Generate a streaming completion
   */
  abstract stream(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): LLMStreamResult;

  /**
   * Test the provider connection
   */
  abstract testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }>;

  /**
   * Get available models
   */
  abstract getModels(): Promise<string[]>;

  /**
   * Estimate token count for messages
   */
  abstract estimateTokens(messages: LLMMessage[]): number;
}

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

const providers = new Map<LLMProviderType, LLMProvider>();

/**
 * Register an LLM provider
 */
export function registerLLMProvider(provider: LLMProvider): void {
  providers.set(provider.getName(), provider);
}

/**
 * Get an LLM provider by name
 */
export function getLLMProvider(name: LLMProviderType): LLMProvider | undefined {
  return providers.get(name);
}

/**
 * Get all registered providers
 */
export function getAllLLMProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Check if a provider is registered
 */
export function hasLLMProvider(name: LLMProviderType): boolean {
  return providers.has(name);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a system message
 */
export function systemMessage(content: string): LLMMessage {
  return { role: 'system', content };
}

/**
 * Create a user message
 */
export function userMessage(content: string): LLMMessage {
  return { role: 'user', content };
}

/**
 * Create an assistant message
 */
export function assistantMessage(content: string): LLMMessage {
  return { role: 'assistant', content };
}

/**
 * Create a function result message
 */
export function functionMessage(name: string, result: string): LLMMessage {
  return { role: 'function', name, content: result };
}
