/**
 * Anthropic Claude LLM Provider
 * Supports Claude 3.5 Sonnet, Claude 3 Opus with streaming and tool use
 */

import Anthropic from '@anthropic-ai/sdk';
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
// ANTHROPIC PROVIDER
// =============================================================================

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: LLMProviderConfig) {
    super(config, 'anthropic');

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
    });

    this.defaultModel = config.defaultModel || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Convert our message format to Anthropic format
   * Anthropic requires system message separately
   */
  private convertMessages(messages: LLMMessage[]): {
    system: string;
    messages: Anthropic.MessageParam[];
  } {
    let system = '';
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else if (msg.role === 'function') {
        // Convert function results to user messages with tool_result
        anthropicMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.name || 'tool',
            content: msg.content,
          }],
        });
      } else if (msg.role === 'assistant' && msg.function_call) {
        // Convert function calls to assistant messages with tool_use
        anthropicMessages.push({
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: msg.function_call.name,
            name: msg.function_call.name,
            input: JSON.parse(msg.function_call.arguments || '{}'),
          }],
        });
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return { system, messages: anthropicMessages };
  }

  /**
   * Convert function definitions to Anthropic tools format
   */
  private convertTools(functions?: LLMCompletionOptions['functions']): Anthropic.Tool[] | undefined {
    if (!functions) return undefined;

    return functions.map((fn) => ({
      name: fn.name,
      description: fn.description,
      input_schema: fn.parameters as Anthropic.Tool.InputSchema,
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
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const response = await this.client.messages.create({
      model: options?.model || this.defaultModel,
      system: system || undefined,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 150,
      temperature: options?.temperature ?? this.config.defaultTemperature ?? 0.7,
      tools: this.convertTools(options?.functions),
      stop_sequences: options?.stopSequences,
    });

    const latencyMs = Date.now() - startTime;

    // Extract content and function calls
    let content = '';
    let functionCall: LLMCompletionResult['functionCall'];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        functionCall = {
          name: block.name,
          arguments: JSON.stringify(block.input),
        };
      }
    }

    return {
      content,
      finishReason: this.mapStopReason(response.stop_reason),
      functionCall,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
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
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const stream = this.client.messages.stream({
      model: options?.model || this.defaultModel,
      system: system || undefined,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 150,
      temperature: options?.temperature ?? this.config.defaultTemperature ?? 0.7,
      tools: this.convertTools(options?.functions),
      stop_sequences: options?.stopSequences,
    });

    let fullContent = '';
    let functionCallName = '';
    let functionCallArgs = '';
    let isFirst = true;
    let inputTokens = 0;
    let outputTokens = 0;

    stream.on('text', (text) => {
      fullContent += text;

      const chunk: LLMStreamChunk = {
        content: text,
        isFirst,
        isLast: false,
      };

      emitter.emit('chunk', chunk);
      isFirst = false;
    });

    stream.on('inputJson', (delta, snapshot) => {
      // Tool use input streaming
      functionCallArgs = JSON.stringify(snapshot);
    });

    stream.on('message', (message) => {
      inputTokens = message.usage.input_tokens;
      outputTokens = message.usage.output_tokens;

      // Check for tool use in final message
      for (const block of message.content) {
        if (block.type === 'tool_use') {
          functionCallName = block.name;
          functionCallArgs = JSON.stringify(block.input);
        }
      }
    });

    // Wait for stream to complete
    const finalMessage = await stream.finalMessage();

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
      finishReason: this.mapStopReason(finalMessage.stop_reason),
      functionCall: functionCallName ? {
        name: functionCallName,
        arguments: functionCallArgs,
      } : undefined,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      latencyMs,
    };

    emitter.emit('done', result);
  }

  /**
   * Test connection to Anthropic
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Simple test completion
      await this.client.messages.create({
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
    // Anthropic doesn't have a models list API, return known models
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(messages: LLMMessage[]): number {
    // Rough estimate: ~4 chars per token (Claude uses similar tokenization)
    const totalChars = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Map Anthropic stop reason to our format
   */
  private mapStopReason(reason: string | null): LLMCompletionResult['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'function_call';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and configure Anthropic provider
 */
export function createAnthropicProvider(apiKey: string, options?: Partial<LLMProviderConfig>): AnthropicProvider {
  return new AnthropicProvider({
    apiKey,
    ...options,
  });
}
