/**
 * Built-in AI Function Handlers
 * Common operations that AI agents can perform
 */

import { FunctionDefinition, FunctionResult, ConversationContext } from '../../conversationEngine';
import { registerFunction, defineFunction } from '../registry';
import { db } from '../../../db/compat';
import { logger } from '../../../utils/logger';

// =============================================================================
// TRANSFER TO EXTENSION
// =============================================================================

export const transferToExtension = defineFunction(
  'transfer_to_extension',
  'Transfer the call to a specific extension number. Use when the caller needs to speak with a specific person or department.',
  {
    type: 'object',
    properties: {
      extension: {
        type: 'string',
        description: 'The extension number to transfer to (e.g., "100", "sales")',
      },
      reason: {
        type: 'string',
        description: 'Brief reason for the transfer to include in the handoff',
      },
    },
    required: ['extension'],
  },
  async (args, context): Promise<FunctionResult> => {
    const extension = args.extension as string;
    const reason = args.reason as string || 'Transferred by AI assistant';

    logger.info(`Transferring call ${context.callUuid} to extension ${extension}`);

    return {
      success: true,
      result: { extension, reason },
      action: 'transfer',
      transferTarget: extension,
      message: `Transferring to extension ${extension}`,
    };
  }
);

// =============================================================================
// TRANSFER TO QUEUE
// =============================================================================

export const transferToQueue = defineFunction(
  'transfer_to_queue',
  'Transfer the call to a call queue. Use when the caller needs to speak with a team or department.',
  {
    type: 'object',
    properties: {
      queue: {
        type: 'string',
        description: 'The queue name to transfer to (e.g., "support", "sales", "billing")',
      },
      priority: {
        type: 'string',
        description: 'Call priority (high, normal, low)',
        enum: ['high', 'normal', 'low'],
      },
      reason: {
        type: 'string',
        description: 'Brief reason for the transfer',
      },
    },
    required: ['queue'],
  },
  async (args, context): Promise<FunctionResult> => {
    const queue = args.queue as string;
    const priority = args.priority as string || 'normal';
    const reason = args.reason as string || 'Transferred by AI assistant';

    logger.info(`Transferring call ${context.callUuid} to queue ${queue} (priority: ${priority})`);

    // Map priority to queue position
    const priorityMap: Record<string, number> = {
      high: 1,
      normal: 5,
      low: 10,
    };

    return {
      success: true,
      result: { queue, priority, reason },
      action: 'transfer',
      transferTarget: `queue:${queue}:${priorityMap[priority] || 5}`,
      message: `Transferring to ${queue} queue`,
    };
  }
);

// =============================================================================
// SEND SMS
// =============================================================================

export const sendSms = defineFunction(
  'send_sms',
  'Send an SMS message to a phone number. Use for confirmations, follow-ups, or sending information.',
  {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'The phone number to send SMS to. If not provided, uses caller\'s number.',
      },
      message: {
        type: 'string',
        description: 'The SMS message content',
      },
    },
    required: ['message'],
  },
  async (args, context): Promise<FunctionResult> => {
    const to = (args.to as string) || context.callerNumber;
    const message = args.message as string;

    if (!to) {
      return {
        success: false,
        message: 'No phone number available to send SMS',
      };
    }

    logger.info(`Sending SMS to ${to}: ${message.substring(0, 50)}...`);

    // Queue SMS for sending
    try {
      db.run(
        `INSERT INTO sms_queue (id, to_number, from_number, message, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [
          `sms_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          to,
          context.calledNumber || '',
          message,
          Date.now(),
        ]
      );

      return {
        success: true,
        result: { to, message: 'SMS queued for delivery' },
        action: 'continue',
        message: `I've sent an SMS to ${to}`,
      };
    } catch (error) {
      logger.error(`Failed to queue SMS: ${error}`);
      return {
        success: false,
        message: 'Failed to send SMS',
      };
    }
  }
);

// =============================================================================
// END CALL
// =============================================================================

export const endCall = defineFunction(
  'end_call',
  'End the current call. Use when the conversation is complete or the caller wants to hang up.',
  {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'The reason for ending the call',
        enum: ['completed', 'caller_request', 'no_further_help', 'callback_scheduled'],
      },
      farewell_message: {
        type: 'string',
        description: 'Optional farewell message to say before hanging up',
      },
    },
    required: ['reason'],
  },
  async (args, context): Promise<FunctionResult> => {
    const reason = args.reason as string;
    const farewellMessage = args.farewell_message as string;

    logger.info(`Ending call ${context.callUuid}: ${reason}`);

    return {
      success: true,
      result: { reason, farewell_message: farewellMessage },
      action: 'end',
      message: farewellMessage || 'Thank you for calling. Goodbye!',
    };
  }
);

// =============================================================================
// SCHEDULE CALLBACK
// =============================================================================

export const scheduleCallback = defineFunction(
  'schedule_callback',
  'Schedule a callback for the caller at a specific time.',
  {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'The date for callback in YYYY-MM-DD format',
      },
      time: {
        type: 'string',
        description: 'The time for callback in HH:MM format (24-hour)',
      },
      phone_number: {
        type: 'string',
        description: 'Phone number to call back. If not provided, uses caller\'s number.',
      },
      notes: {
        type: 'string',
        description: 'Notes about what the callback is regarding',
      },
    },
    required: ['date', 'time'],
  },
  async (args, context): Promise<FunctionResult> => {
    const date = args.date as string;
    const time = args.time as string;
    const phoneNumber = (args.phone_number as string) || context.callerNumber;
    const notes = args.notes as string || '';

    if (!phoneNumber) {
      return {
        success: false,
        message: 'No phone number available for callback',
      };
    }

    // Parse scheduled time
    const scheduledTime = new Date(`${date}T${time}:00`).getTime();

    if (scheduledTime <= Date.now()) {
      return {
        success: false,
        message: 'Cannot schedule callback in the past',
      };
    }

    logger.info(`Scheduling callback to ${phoneNumber} at ${date} ${time}`);

    try {
      db.run(
        `INSERT INTO scheduled_callbacks (id, phone_number, scheduled_time, notes, status, created_at, conversation_id)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        [
          `cb_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          phoneNumber,
          scheduledTime,
          notes,
          Date.now(),
          context.conversationId,
        ]
      );

      return {
        success: true,
        result: {
          phone_number: phoneNumber,
          scheduled_time: `${date} ${time}`,
          notes,
        },
        action: 'continue',
        message: `I've scheduled a callback for ${date} at ${time}`,
      };
    } catch (error) {
      logger.error(`Failed to schedule callback: ${error}`);
      return {
        success: false,
        message: 'Failed to schedule callback',
      };
    }
  }
);

// =============================================================================
// COLLECT INFORMATION
// =============================================================================

export const collectInformation = defineFunction(
  'collect_information',
  'Record information collected from the caller for CRM or follow-up purposes.',
  {
    type: 'object',
    properties: {
      field_name: {
        type: 'string',
        description: 'The type of information being collected (e.g., "email", "name", "account_number")',
      },
      field_value: {
        type: 'string',
        description: 'The value provided by the caller',
      },
    },
    required: ['field_name', 'field_value'],
  },
  async (args, context): Promise<FunctionResult> => {
    const fieldName = args.field_name as string;
    const fieldValue = args.field_value as string;

    logger.info(`Collecting ${fieldName}: ${fieldValue} for conversation ${context.conversationId}`);

    try {
      db.run(
        `INSERT INTO collected_data (id, conversation_id, field_name, field_value, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `data_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          context.conversationId,
          fieldName,
          fieldValue,
          Date.now(),
        ]
      );

      return {
        success: true,
        result: { field_name: fieldName, recorded: true },
        action: 'continue',
        message: `Got it, I've recorded your ${fieldName}`,
      };
    } catch (error) {
      logger.error(`Failed to collect information: ${error}`);
      return {
        success: false,
        message: 'Failed to record information',
      };
    }
  }
);

// =============================================================================
// LOOKUP CUSTOMER (webhook-based)
// =============================================================================

export const lookupCustomer = defineFunction(
  'lookup_customer',
  'Look up customer information in the CRM based on phone number or other identifier.',
  {
    type: 'object',
    properties: {
      identifier_type: {
        type: 'string',
        description: 'Type of identifier to search by',
        enum: ['phone', 'email', 'account_number', 'name'],
      },
      identifier_value: {
        type: 'string',
        description: 'The value to search for',
      },
    },
    required: ['identifier_type', 'identifier_value'],
  },
  async (args, context): Promise<FunctionResult> => {
    const identifierType = args.identifier_type as string;
    const identifierValue = args.identifier_value as string;

    logger.info(`Looking up customer by ${identifierType}: ${identifierValue}`);

    // Check if webhook is configured
    const webhookConfig = await db.queryOne<{ handler_config: string }>(
      `SELECT handler_config FROM ai_functions WHERE name = 'lookup_customer' AND handler_type = 'webhook'`
    );

    if (webhookConfig?.handler_config) {
      // Use webhook
      try {
        const config = JSON.parse(webhookConfig.handler_config);
        const response = await fetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...config.headers },
          body: JSON.stringify({
            identifier_type: identifierType,
            identifier_value: identifierValue,
            conversation_id: context.conversationId,
          }),
          signal: AbortSignal.timeout(config.timeout || 10000),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            result: data,
            action: 'continue',
          };
        }
      } catch (error) {
        logger.error(`Customer lookup webhook error: ${error}`);
      }
    }

    // Fallback to local contacts lookup
    try {
      let customer = null;

      if (identifierType === 'phone') {
        customer = db.queryOne(
          `SELECT * FROM contacts WHERE phone = ? OR phone LIKE ?`,
          [identifierValue, `%${identifierValue}%`]
        );
      } else if (identifierType === 'email') {
        customer = db.queryOne(`SELECT * FROM contacts WHERE email = ?`, [identifierValue]);
      } else if (identifierType === 'name') {
        customer = db.queryOne(
          `SELECT * FROM contacts WHERE name LIKE ?`,
          [`%${identifierValue}%`]
        );
      }

      if (customer) {
        return {
          success: true,
          result: customer,
          action: 'continue',
          message: `Found customer: ${(customer as { name?: string }).name || 'Unknown'}`,
        };
      } else {
        return {
          success: true,
          result: null,
          action: 'continue',
          message: `No customer found with that ${identifierType}`,
        };
      }
    } catch (error) {
      logger.error(`Customer lookup error: ${error}`);
      return {
        success: false,
        message: 'Customer lookup failed',
      };
    }
  }
);

// =============================================================================
// PLAY HOLD MUSIC
// =============================================================================

export const playHoldMusic = defineFunction(
  'play_hold_music',
  'Put the caller on hold with music while performing a task.',
  {
    type: 'object',
    properties: {
      duration_seconds: {
        type: 'string',
        description: 'How long to play hold music (max 60 seconds)',
      },
      message_before: {
        type: 'string',
        description: 'Message to say before putting on hold',
      },
    },
    required: [],
  },
  async (args, context): Promise<FunctionResult> => {
    const duration = Math.min(parseInt(args.duration_seconds as string) || 10, 60);
    const messageBefore = args.message_before as string || 'Please hold for a moment.';

    logger.info(`Playing hold music for ${duration} seconds`);

    return {
      success: true,
      result: {
        duration_seconds: duration,
        message_before: messageBefore,
        hold_music: 'default',
      },
      action: 'continue',
      message: messageBefore,
    };
  }
);

// =============================================================================
// CHECK BUSINESS HOURS
// =============================================================================

export const checkBusinessHours = defineFunction(
  'check_business_hours',
  'Check if the business is currently open based on configured hours.',
  {
    type: 'object',
    properties: {
      department: {
        type: 'string',
        description: 'Optional department to check hours for',
      },
    },
    required: [],
  },
  async (args, context): Promise<FunctionResult> => {
    const department = args.department as string || 'general';

    // Get current time
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Default business hours (9 AM - 5 PM, Mon-Fri)
    const defaultHours = {
      days: [1, 2, 3, 4, 5], // Mon-Fri
      open: { hour: 9, minute: 0 },
      close: { hour: 17, minute: 0 },
    };

    // Check if currently open
    const isOpen = defaultHours.days.includes(dayOfWeek) &&
      (currentHour > defaultHours.open.hour ||
        (currentHour === defaultHours.open.hour && currentMinute >= defaultHours.open.minute)) &&
      (currentHour < defaultHours.close.hour ||
        (currentHour === defaultHours.close.hour && currentMinute < defaultHours.close.minute));

    return {
      success: true,
      result: {
        is_open: isOpen,
        current_time: now.toISOString(),
        next_open: isOpen ? null : 'Monday 9:00 AM', // Simplified
        department,
      },
      action: 'continue',
      message: isOpen
        ? 'We are currently open'
        : 'We are currently closed. Our hours are Monday through Friday, 9 AM to 5 PM.',
    };
  }
);

// =============================================================================
// REGISTER ALL BUILT-IN FUNCTIONS
// =============================================================================

export function registerBuiltinFunctions(): void {
  registerFunction(transferToExtension);
  registerFunction(transferToQueue);
  registerFunction(sendSms);
  registerFunction(endCall);
  registerFunction(scheduleCallback);
  registerFunction(collectInformation);
  registerFunction(lookupCustomer);
  registerFunction(playHoldMusic);
  registerFunction(checkBusinessHours);

  logger.info('Registered 9 built-in AI functions');
}
