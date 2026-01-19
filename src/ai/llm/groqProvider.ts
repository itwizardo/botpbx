/**
 * Groq LLM Provider
 * Ultra-fast inference with Llama 3.1, Mixtral models
 * Groq uses OpenAI-compatible API format
 */

import Groq from 'groq-sdk';
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
// GROQ PROVIDER
// =============================================================================

export class GroqProvider extends LLMProvider {
  private client: Groq;
  private defaultModel: string;

  constructor(config: LLMProviderConfig) {
    super(config, 'groq');

    this.client = new Groq({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
    });

    // Default to Llama 3.1 70B for best quality/speed balance
    this.defaultModel = config.defaultModel || 'llama-3.1-70b-versatile';
  }

  /**
   * Convert our message format to Groq format (OpenAI-compatible)
   */
  private convertMessages(messages: LLMMessage[]): Groq.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'function') {
        // Groq supports tool messages
        return {
          role: 'tool' as const,
          tool_call_id: msg.name || 'tool',
          content: msg.content,
        };
      }

      if (msg.role === 'assistant' && msg.function_call) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: [{
            id: msg.function_call.name,
            type: 'function' as const,
            function: {
              name: msg.function_call.name,
              arguments: msg.function_call.arguments,
            },
          }],
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  /**
   * Convert function definitions to Groq tools format
   */
  private convertTools(functions?: LLMCompletionOptions['functions']): Groq.Chat.ChatCompletionTool[] | undefined {
    if (!functions) return undefined;

    return functions.map((fn) => ({
      type: 'function' as const,
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      },
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
      tools: this.convertTools(options?.functions),
      tool_choice: options?.functionCall === 'auto' ? 'auto' :
                   options?.functionCall === 'none' ? 'none' :
                   typeof options?.functionCall === 'object' ? { type: 'function', function: { name: options.functionCall.name } } :
                   undefined,
      stop: options?.stopSequences,
    });

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    // Extract function call if present
    let functionCall: LLMCompletionResult['functionCall'];
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      functionCall = {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      };
    }

    return {
      content: choice.message.content || '',
      finishReason: this.mapFinishReason(choice.finish_reason),
      functionCall,
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
      tools: this.convertTools(options?.functions),
      tool_choice: options?.functionCall === 'auto' ? 'auto' :
                   options?.functionCall === 'none' ? 'none' :
                   typeof options?.functionCall === 'object' ? { type: 'function', function: { name: options.functionCall.name } } :
                   undefined,
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

      // Handle tool calls
      if (delta?.tool_calls && delta.tool_calls.length > 0) {
        const toolDelta = delta.tool_calls[0];
        if (toolDelta.function?.name) {
          functionCallName += toolDelta.function.name;
        }
        if (toolDelta.function?.arguments) {
          functionCallArgs += toolDelta.function.arguments;
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
   * Test connection to Groq
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Quick test completion
      await this.client.chat.completions.create({
        model: this.defaultModel,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      });

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
    try {
      const response = await this.client.models.list();
      return response.data.map((model) => model.id).sort();
    } catch {
      // Return known models as fallback
      return [
        'llama-3.1-405b-reasoning',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-groq-70b-8192-tool-use-preview',
        'llama3-groq-8b-8192-tool-use-preview',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
      ];
    }
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
   * Map Groq finish reason to our format
   */
  private mapFinishReason(reason: string | null): LLMCompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'function_call';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and configure Groq provider
 */
export function createGroqProvider(apiKey: string, options?: Partial<LLMProviderConfig>): GroqProvider {
  return new GroqProvider({
    apiKey,
    ...options,
  });
}
