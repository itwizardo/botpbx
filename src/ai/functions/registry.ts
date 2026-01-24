/**
 * AI Function Registry
 * Manages function definitions for AI agents
 */

import { FunctionDefinition, FunctionResult, ConversationContext } from '../conversationEngine';
import { db } from '../../db/compat';
import { logger } from '../../utils/logger';

// =============================================================================
// REGISTRY
// =============================================================================

const functions = new Map<string, FunctionDefinition>();

/**
 * Register a function
 */
export function registerFunction(fn: FunctionDefinition): void {
  functions.set(fn.name, fn);
  logger.debug(`Registered AI function: ${fn.name}`);
}

/**
 * Get a function by name
 */
export function getFunction(name: string): FunctionDefinition | undefined {
  return functions.get(name);
}

/**
 * Get all registered functions
 */
export function getAllFunctions(): FunctionDefinition[] {
  return Array.from(functions.values());
}

/**
 * Get functions for an agent (filtered by enabled list)
 */
export function getFunctionsForAgent(enabledFunctions?: string[]): FunctionDefinition[] {
  const all = getAllFunctions();

  if (!enabledFunctions || enabledFunctions.length === 0) {
    return all; // Return all if no filter specified
  }

  return all.filter((fn) => enabledFunctions.includes(fn.name));
}

/**
 * Check if a function exists
 */
export function hasFunction(name: string): boolean {
  return functions.has(name);
}

/**
 * Execute a function by name
 */
export async function executeFunction(
  name: string,
  args: Record<string, unknown>,
  context: ConversationContext
): Promise<FunctionResult> {
  const fn = functions.get(name);

  if (!fn) {
    return {
      success: false,
      message: `Function not found: ${name}`,
    };
  }

  try {
    return await fn.handler(args, context);
  } catch (error) {
    logger.error(`Function ${name} error: ${error}`);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Function execution failed',
    };
  }
}

// =============================================================================
// DATABASE SYNC
// =============================================================================

/**
 * Load custom functions from database
 */
export async function loadFunctionsFromDatabase(): Promise<void> {
  try {
    const dbFunctions = await db.query<{
      id: string;
      name: string;
      description: string;
      parameters: string;
      handler_type: 'builtin' | 'webhook';
      handler_config: string | null;
      enabled: number;
    }>('SELECT * FROM ai_functions WHERE enabled = 1');

    for (const dbFn of dbFunctions) {
      if (dbFn.handler_type === 'webhook' && dbFn.handler_config) {
        const config = JSON.parse(dbFn.handler_config);

        registerFunction({
          name: dbFn.name,
          description: dbFn.description,
          parameters: JSON.parse(dbFn.parameters),
          handler: createWebhookHandler(config),
        });
      }
    }

    logger.info(`Loaded ${dbFunctions.length} functions from database`);
  } catch (error) {
    logger.error(`Failed to load functions from database: ${error}`);
  }
}

/**
 * Create a webhook handler function
 */
function createWebhookHandler(config: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}): FunctionDefinition['handler'] {
  return async (args, context) => {
    try {
      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          function_args: args,
          conversation_id: context.conversationId,
          agent_id: context.agentId,
          caller_number: context.callerNumber,
          called_number: context.calledNumber,
        }),
        signal: AbortSignal.timeout(config.timeout || 10000),
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Webhook returned ${response.status}`,
        };
      }

      const result = await response.json() as {
        action?: string;
        transfer_target?: string;
        message?: string;
        [key: string]: unknown;
      };
      const action = (result.action || 'continue') as 'transfer' | 'end' | 'continue';
      return {
        success: true,
        result,
        action,
        transferTarget: result.transfer_target,
        message: result.message,
      };
    } catch (error) {
      logger.error(`Webhook error: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Webhook failed',
      };
    }
  };
}

// =============================================================================
// FUNCTION DEFINITION HELPERS
// =============================================================================

/**
 * Create a function definition with type safety
 */
export function defineFunction(
  name: string,
  description: string,
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  },
  handler: FunctionDefinition['handler']
): FunctionDefinition {
  return {
    name,
    description,
    parameters,
    handler,
  };
}
