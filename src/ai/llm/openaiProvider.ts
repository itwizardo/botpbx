/**
 * OpenAI LLM Provider
 * Supports GPT-4o, GPT-4, GPT-3.5-turbo with streaming and function calling
 */

import OpenAI from 'openai';
import { EventEmitter } from 'events';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMStreamResult,
  LLMStreamChunk,
} from '../providers/llmProvider';

// =============================================================================
// OPENAI PROVIDER
// =============================================================================

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: LLMProviderConfig) {
    super(config, 'openai');

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
    });

    this.defaultModel = config.defaultModel || 'gpt-4o';
  }

  /**
   * Convert our message format to OpenAI format
   */
  private convertMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'function') {
        return {
          role: 'function' as const,
          name: msg.name || 'function',
          content: msg.content,
        };
      }

      if (msg.role === 'assistant' && msg.function_call) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          function_call: msg.function_call,
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  /**
   * Convert function definitions to OpenAI format
   */
  private convertFunctions(functions?: LLMCompletionOptions['functions']): OpenAI.Chat.ChatCompletionCreateParams['functions'] {
    if (!functions) return undefined;

    return functions.map((fn) => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters as OpenAI.FunctionParameters,
    }));
  }

  /**
   * Generate a completion (non-streaming)
   */
  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: this.convertMessages(messages),
      temperature: options?.temperature ?? this.config.defaultTemperature ?? 0.7,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 150,
      functions: this.convertFunctions(options?.functions),
      function_call: options?.functionCall,
      stop: options?.stopSequences,
    });

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    return {
      content: choice.message.content || '',
      finishReason: this.mapFinishReason(choice.finish_reason),
      functionCall: choice.message.function_call ? {
        name: choice.message.function_call.name,
        arguments: choice.message.function_call.arguments,
      } : undefined,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      latencyMs,
    };
  }

  /**
   * Generate a streaming completion
   */
  stream(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): LLMStreamResult {
    const emitter = new EventEmitter() as LLMStreamResult;
    const startTime = Date.now();

    // Start streaming in background
    this.runStream(messages, options, emitter, startTime).catch((error) => {
      emitter.emit('error', error);
    });

    return emitter;
  }

  private async runStream(
    messages: LLMMessage[],
    options: LLMCompletionOptions | undefined,
    emitter: LLMStreamResult,
    startTime: number
  ): Promise<void> {
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: this.convertMessages(messages),
      temperature: options?.temperature ?? this.config.defaultTemperature ?? 0.7,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 150,
      functions: this.convertFunctions(options?.functions),
      function_call: options?.functionCall,
      stop: options?.stopSequences,
      stream: true,
    });

    let fullContent = '';
    let functionCallName = '';
    let functionCallArgs = '';
    let isFirst = true;
    let finishReason: LLMCompletionResult['finishReason'] = 'stop';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const finish = chunk.choices[0]?.finish_reason;

      if (finish) {
        finishReason = this.mapFinishReason(finish);
      }

      // Handle content
      if (delta?.content) {
        fullContent += delta.content;

        const streamChunk: LLMStreamChunk = {
          content: delta.content,
          isFirst,
          isLast: false,
        };

        emitter.emit('chunk', streamChunk);
        isFirst = false;
      }

      // Handle function calls
      if (delta?.function_call) {
        if (delta.function_call.name) {
          functionCallName += delta.function_call.name;
        }
        if (delta.function_call.arguments) {
          functionCallArgs += delta.function_call.arguments;
        }
      }
    }

    // Emit final chunk
    const finalChunk: LLMStreamChunk = {
      content: '',
      isFirst: false,
      isLast: true,
      functionCall: functionCallName ? {
        name: functionCallName,
        arguments: functionCallArgs,
      } : undefined,
    };
    emitter.emit('chunk', finalChunk);

    // Emit completion result
    const latencyMs = Date.now() - startTime;
    const result: LLMCompletionResult = {
      content: fullContent,
      finishReason,
      functionCall: functionCallName ? {
        name: functionCallName,
        arguments: functionCallArgs,
      } : undefined,
      usage: {
        promptTokens: 0, // Not available in streaming
        completionTokens: 0,
        totalTokens: 0,
      },
      latencyMs,
    };

    emitter.emit('done', result);
  }

  /**
   * Test connection to OpenAI
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      await this.client.models.list();
      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    const response = await this.client.models.list();
    return response.data
      .filter((model) => model.id.includes('gpt'))
      .map((model) => model.id)
      .sort();
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(messages: LLMMessage[]): number {
    // Rough estimate: ~4 chars per token
    const totalChars = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Map OpenAI finish reason to our format
   */
  private mapFinishReason(reason: string | null): LLMCompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'function_call':
        return 'function_call';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and configure OpenAI provider
 */
export function createOpenAIProvider(apiKey: string, options?: Partial<LLMProviderConfig>): OpenAIProvider {
  return new OpenAIProvider({
    apiKey,
    ...options,
  });
}
