/**
 * AI Functions Module Index
 * Export all function-related utilities and built-in handlers
 */

// Export registry functions
export {
  registerFunction,
  getFunction,
  getAllFunctions,
  getFunctionsForAgent,
  hasFunction,
  executeFunction,
  loadFunctionsFromDatabase,
  defineFunction,
} from './registry';

// Export built-in function handlers
export {
  transferToExtension,
  transferToQueue,
  sendSms,
  endCall,
  scheduleCallback,
  collectInformation,
  lookupCustomer,
  playHoldMusic,
  checkBusinessHours,
  registerBuiltinFunctions,
} from './builtins';

import { registerBuiltinFunctions } from './builtins';
import { loadFunctionsFromDatabase } from './registry';
import { logger } from '../../utils/logger';

/**
 * Initialize all AI functions (built-in and from database)
 */
export async function initializeFunctions(): Promise<void> {
  // Register built-in functions
  registerBuiltinFunctions();

  // Load custom functions from database
  await loadFunctionsFromDatabase();

  logger.info('AI functions initialized');
}
