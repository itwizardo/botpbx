import { AGIConnection } from './agiServer';
import { AGISession } from '../models/types';
import { IVRMenuRepository } from '../db/repositories/ivrMenuRepository';
import { RoutingRepository } from '../db/repositories/routingRepository';
import { CallLogRepository } from '../db/repositories/callLogRepository';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import { PromptRepository } from '../db/repositories/promptRepository';
import { TrunkRepository } from '../db/repositories/trunkRepository';
import { CallRecordingRepository } from '../db/repositories/callRecordingRepository';
import { agiLogger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Get file size safely, returns null if file doesn't exist
 */
async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}

interface CallState {
  callLogId: string;
  optionsPressed: string[];
  startTime: number;
  recordingFilePath: string | null;
}

export class IVRController {
  private menuRepo: IVRMenuRepository;
  private routingRepo: RoutingRepository;
  private callLogRepo: CallLogRepository;
  private settingsRepo: SettingsRepository;
  private promptRepo: PromptRepository;
  private trunkRepo: TrunkRepository | null;
  private recordingRepo: CallRecordingRepository | null;
  private audioPath: string;
  private recordingsPath: string;
  private activeCalls: Map<string, CallState> = new Map();

  constructor(
    menuRepo: IVRMenuRepository,
    routingRepo: RoutingRepository,
    callLogRepo: CallLogRepository,
    settingsRepo: SettingsRepository,
    promptRepo: PromptRepository,
    audioPath: string,
    trunkRepo?: TrunkRepository,
    recordingRepo?: CallRecordingRepository
  ) {
    this.menuRepo = menuRepo;
    this.routingRepo = routingRepo;
    this.callLogRepo = callLogRepo;
    this.settingsRepo = settingsRepo;
    this.promptRepo = promptRepo;
    this.audioPath = audioPath;
    this.trunkRepo = trunkRepo || null;
    this.recordingRepo = recordingRepo || null;
    this.recordingsPath = path.join(audioPath, '..', 'recordings');

    // Ensure recordings directory exists
    if (!fs.existsSync(this.recordingsPath)) {
      fs.mkdirSync(this.recordingsPath, { recursive: true });
    }
  }

  /**
   * Complete a call recording with duration and file size
   */
  private async completeRecording(
    callLogId: string,
    recordingFilePath: string | null,
    durationSeconds: number
  ): Promise<void> {
    if (!this.recordingRepo || !recordingFilePath) return;

    try {
      const recording = await this.recordingRepo.findByCallLogId(callLogId);
      if (recording) {
        const fileSize = await getFileSize(recordingFilePath);
        await this.recordingRepo.complete(recording.id, durationSeconds, fileSize || undefined);
        agiLogger.info(`Recording completed: ${recordingFilePath}, duration=${durationSeconds}s, size=${fileSize}`);
      }
    } catch (error) {
      agiLogger.error('Failed to complete recording:', error);
    }
  }

  /**
   * Main entry point for handling a call
   */
  async handleCall(agi: AGIConnection, session: AGISession): Promise<void> {
    const callState: CallState = {
      callLogId: '',
      optionsPressed: [],
      startTime: Date.now(),
      recordingFilePath: null,
    };

    // Create call log entry
    const callLog = await this.callLogRepo.create({
      callerId: session.callerId,
      did: session.dnid,
      ivrMenuId: null,
      optionsPressed: '',
      finalDestination: null,
      durationSeconds: null,
      disposition: 'IN_PROGRESS',
      uniqueId: session.uniqueId,
    });
    callState.callLogId = callLog.id;
    this.activeCalls.set(session.uniqueId, callState);

    // Setup call recording - MixMonitor is started in the dialplan before AGI
    // to ensure all audio (including AGI-streamed prompts) is captured.
    // We just need to create the DB entry here.
    if (this.recordingRepo) {
      try {
        // Check if MixMonitor was started in the dialplan (RECORDING_FILE set)
        const dialplanRecordingFile = await agi.getVariable('RECORDING_FILE');
        if (dialplanRecordingFile) {
          callState.recordingFilePath = dialplanRecordingFile;
          agiLogger.info(`Using dialplan recording: ${dialplanRecordingFile}`);
        } else {
          // Fallback: start MixMonitor from AGI if not started in dialplan
          const recordingEnabled = (await this.settingsRepo.get('call_recording_enabled')) === 'true';
          if (recordingEnabled) {
            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const filename = `${dateStr}-${session.uniqueId}.wav`;
            callState.recordingFilePath = path.join(this.recordingsPath, filename);
            await agi.exec('MixMonitor', callState.recordingFilePath);
            agiLogger.info(`Recording started from AGI: ${filename}`);
          }
        }

        // Create recording entry in database
        if (callState.recordingFilePath) {
          await this.recordingRepo.create({
            callLogId: callLog.id,
            filePath: callState.recordingFilePath,
            uniqueId: session.uniqueId,
          });
        }
      } catch (recError) {
        agiLogger.error('Failed to setup recording:', recError);
        // Continue without recording
      }
    }

    try {
      // Check for forced IVR menu (Test Mode)
      // Must use agi.getVariable() to read channel variables set via AMI originate
      const testMenuId = await agi.getVariable('IVR_MENU_ID');
      if (testMenuId) {
        agiLogger.info(`Test mode: Running IVR menu ${testMenuId}`);
        await this.runIVRMenu(agi, testMenuId, callState);
        return;
      }

      // Check if campaign is active
      if (!(await this.settingsRepo.isCampaignActive())) {
        agiLogger.info(`Campaign inactive, playing closed message for ${session.uniqueId}`);
        await this.playClosed(agi);
        await this.updateCallLog(callState, { disposition: 'CAMPAIGN_CLOSED' });
        return;
      }

      // Find routing rule for this DID
      let routing = await this.routingRepo.findEnabledByDID(session.dnid);

      // Try 'default' or '*' routing if no specific rule
      if (!routing) {
        routing = await this.routingRepo.findEnabledByDID('default');
      }
      if (!routing) {
        routing = await this.routingRepo.findEnabledByDID('*');
      }

      // Fallback: use first IVR menu if no routing rule exists
      if (!routing) {
        const menus = await this.menuRepo.findAll();
        if (menus.length > 0) {
          agiLogger.info(`No routing rule, using first IVR menu: ${menus[0].name}`);
          await this.runIVRMenu(agi, menus[0].id, callState);
          return;
        }
      }

      if (!routing) {
        agiLogger.warn(`No routing rule for DID ${session.dnid}`);
        await this.playInvalid(agi);
        await this.updateCallLog(callState, { disposition: 'NO_ROUTING' });
        return;
      }

      // Handle based on routing type
      switch (routing.targetType) {
        case 'ivr_menu':
          await this.runIVRMenu(agi, routing.targetId, callState);
          break;

        case 'extension':
          await this.transferToExtension(agi, routing.targetId, callState);
          break;

        case 'queue':
          await this.transferToQueue(agi, routing.targetId, callState);
          break;
      }

    } catch (error) {
      if ((error as Error).message.includes('Socket closed') ||
        (error as Error).message.includes('timeout')) {
        agiLogger.info(`Call ${session.uniqueId} ended by caller`);
        await this.updateCallLog(callState, { disposition: 'CALLER_HANGUP' });
      } else {
        agiLogger.error(`IVR error for ${session.uniqueId}:`, error);
        await this.updateCallLog(callState, { disposition: 'ERROR' });
      }
    } finally {
      // Calculate duration and update call log
      const duration = Math.floor((Date.now() - callState.startTime) / 1000);
      await this.updateCallLog(callState, {
        durationSeconds: duration,
        optionsPressed: callState.optionsPressed.join(','),
      });

      // Complete recording if one was started
      await this.completeRecording(callState.callLogId, callState.recordingFilePath, duration);

      this.activeCalls.delete(session.uniqueId);
    }
  }

  /**
   * Run an IVR menu
   */
  private async runIVRMenu(
    agi: AGIConnection,
    menuId: string,
    callState: CallState,
    retryCount: number = 0
  ): Promise<void> {
    const menu = await this.menuRepo.findByIdWithOptions(menuId);

    if (!menu) {
      agiLogger.error(`IVR menu not found: ${menuId}`);
      await this.playInvalid(agi);
      return;
    }

    await this.updateCallLog(callState, { ivrMenuId: menuId });
    agiLogger.info(`Running IVR menu: ${menu.name} (retry: ${retryCount})`);

    // Play welcome prompt and wait for DTMF
    let digit = '';
    if (menu.welcomePromptId) {
      const promptPath = await this.getPromptPath(menu.welcomePromptId);
      digit = await agi.getData(promptPath, menu.timeoutSeconds * 1000, 1);
    } else {
      // No welcome prompt, just wait for digit
      digit = await agi.waitForDigit(menu.timeoutSeconds * 1000);
    }

    // Handle timeout
    if (!digit) {
      if (retryCount < menu.maxRetries) {
        agiLogger.debug(`Timeout, retry ${retryCount + 1} of ${menu.maxRetries}`);
        if (menu.timeoutPromptId) {
          await agi.streamFile(await this.getPromptPath(menu.timeoutPromptId));
        }
        return this.runIVRMenu(agi, menuId, callState, retryCount + 1);
      } else {
        agiLogger.info('Max retries reached, hanging up');
        await this.updateCallLog(callState, { disposition: 'TIMEOUT' });
        await agi.hangup();
        return;
      }
    }

    callState.optionsPressed.push(digit);
    agiLogger.info(`DTMF pressed: ${digit}`);

    // Find matching option
    const option = menu.options.find((o) => o.keyPress === digit);

    if (!option) {
      // Invalid option
      if (retryCount < menu.maxRetries) {
        agiLogger.debug(`Invalid option ${digit}, retry ${retryCount + 1}`);
        if (menu.invalidPromptId) {
          await agi.streamFile(await this.getPromptPath(menu.invalidPromptId));
        }
        return this.runIVRMenu(agi, menuId, callState, retryCount + 1);
      } else {
        agiLogger.info('Max retries reached for invalid input');
        await this.updateCallLog(callState, { disposition: 'MAX_INVALID' });
        await agi.hangup();
        return;
      }
    }

    // Play pre-connect prompt if configured
    if (option.preConnectPromptId) {
      await agi.streamFile(await this.getPromptPath(option.preConnectPromptId));
    }

    // Execute action
    await this.executeOption(agi, option, callState);

    // Play post-call prompt if configured (only if we return to IVR)
    if (option.postCallPromptId && option.actionType === 'submenu') {
      await agi.streamFile(await this.getPromptPath(option.postCallPromptId));
    }
  }

  /**
   * Execute an IVR option action
   */
  private async executeOption(
    agi: AGIConnection,
    option: {
      actionType: string;
      destination: string | null;
      postCallPromptId: string | null;
      transferTrunkId?: string | null;
      transferDestination?: string | null;
      transferMode?: 'internal' | 'trunk';
    },
    callState: CallState
  ): Promise<void> {
    switch (option.actionType) {
      case 'transfer':
        // Check if this is a trunk-based transfer (e.g., to 3CX ring group)
        if (option.transferMode === 'trunk' && option.transferTrunkId && option.transferDestination) {
          await this.transferToTrunk(agi, option.transferTrunkId, option.transferDestination, callState);
        } else if (option.destination) {
          await this.transferToExtension(agi, option.destination, callState);
        }
        break;

      case 'external':
        if (option.destination) {
          await this.transferToExternal(agi, option.destination, callState);
        }
        break;

      case 'submenu':
        if (option.destination) {
          await this.runIVRMenu(agi, option.destination, callState, 0);
        }
        break;

      case 'voicemail':
        if (option.destination) {
          await this.transferToVoicemail(agi, option.destination, callState);
        }
        break;

      case 'queue':
        if (option.destination) {
          await this.transferToQueue(agi, option.destination, callState);
        }
        break;

      case 'hangup':
        await this.updateCallLog(callState, { disposition: 'COMPLETED' });
        await agi.hangup();
        break;

      default:
        agiLogger.warn(`Unknown action type: ${option.actionType}`);
        await agi.hangup();
    }
  }

  /**
   * Transfer to an internal extension
   */
  private async transferToExtension(
    agi: AGIConnection,
    extension: string,
    callState: CallState
  ): Promise<void> {
    agiLogger.info(`Transferring to extension: ${extension}`);
    await this.updateCallLog(callState, {
      finalDestination: `ext:${extension}`,
      disposition: 'TRANSFERRED',
    });

    // Dial the extension directly using PJSIP
    try {
      const result = await agi.exec('Dial', `PJSIP/${extension},30,tTwW`);
      agiLogger.info(`Dial result for ${extension}: ${result}`);
    } catch (error) {
      agiLogger.error(`Dial failed for ${extension}:`, error);
    }
  }

  /**
   * Transfer to a trunk (e.g., 3CX ring group)
   */
  private async transferToTrunk(
    agi: AGIConnection,
    trunkId: string,
    destination: string,
    callState: CallState
  ): Promise<void> {
    if (!this.trunkRepo) {
      agiLogger.error('Trunk repository not available for trunk transfer');
      await this.updateCallLog(callState, {
        finalDestination: 'trunk_unavailable',
        disposition: 'TRUNK_UNAVAILABLE',
      });
      await agi.hangup();
      return;
    }

    const trunk = await this.trunkRepo.findById(trunkId);
    if (!trunk || !trunk.enabled) {
      agiLogger.error(`Transfer trunk not found or disabled: ${trunkId}`);
      await this.updateCallLog(callState, {
        finalDestination: 'trunk_unavailable',
        disposition: 'TRUNK_UNAVAILABLE',
      });
      await agi.hangup();
      return;
    }

    const trunkName = trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const dialString = `PJSIP/${destination}@${trunkName}`;

    agiLogger.info(`Transferring via trunk: ${dialString}`);
    await this.updateCallLog(callState, {
      finalDestination: `trunk:${trunk.name}:${destination}`,
      disposition: 'TRANSFERRED',
    });

    try {
      const result = await agi.exec('Dial', `${dialString},60,tTwW`);
      agiLogger.info(`Dial result for trunk transfer: ${result}`);
    } catch (error) {
      agiLogger.error(`Trunk dial failed:`, error);
    }
  }

  /**
   * Transfer to an external number
   */
  private async transferToExternal(
    agi: AGIConnection,
    number: string,
    callState: CallState
  ): Promise<void> {
    agiLogger.info(`Transferring to external number: ${number}`);
    await this.updateCallLog(callState, {
      finalDestination: `ext:${number}`,
      disposition: 'TRANSFERRED',
    });

    // Dial external number via trunk
    await agi.exec('Dial', `PJSIP/${number}@trunk-provider,60,tT`);
  }

  /**
   * Transfer to voicemail
   */
  private async transferToVoicemail(
    agi: AGIConnection,
    mailbox: string,
    callState: CallState
  ): Promise<void> {
    agiLogger.info(`Transferring to voicemail: ${mailbox}`);
    await this.updateCallLog(callState, {
      finalDestination: `vm:${mailbox}`,
      disposition: 'VOICEMAIL',
    });

    await agi.exec('VoiceMail', `${mailbox}@default,u`);
  }

  /**
   * Transfer to a queue
   */
  private async transferToQueue(
    agi: AGIConnection,
    queueName: string,
    callState: CallState
  ): Promise<void> {
    agiLogger.info(`Transferring to queue: ${queueName}`);
    await this.updateCallLog(callState, {
      finalDestination: `queue:${queueName}`,
      disposition: 'QUEUED',
    });

    await agi.exec('Queue', queueName);
  }

  /**
   * Play campaign closed message
   */
  private async playClosed(agi: AGIConnection): Promise<void> {
    // Try to play a system "closed" prompt
    try {
      await agi.streamFile('vm-goodbye');
    } catch {
      // Ignore if file doesn't exist
    }
    await agi.hangup();
  }

  /**
   * Play invalid/error message
   */
  private async playInvalid(agi: AGIConnection): Promise<void> {
    try {
      await agi.streamFile('invalid');
    } catch {
      // Ignore if file doesn't exist
    }
    await agi.hangup();
  }

  /**
   * Get the file path for a prompt (without extension)
   */
  private async getPromptPath(promptId: string): Promise<string> {
    const prompt = await this.promptRepo.findById(promptId);
    if (prompt && prompt.filePath) {
      // Return path without extension
      const ext = path.extname(prompt.filePath);
      return prompt.filePath.slice(0, -ext.length);
    }
    // Fallback to default location
    return path.join(this.audioPath, 'prompts', promptId);
  }

  /**
   * Update call log entry
   */
  private async updateCallLog(
    callState: CallState,
    updates: Partial<{
      ivrMenuId: string;
      optionsPressed: string;
      finalDestination: string;
      durationSeconds: number;
      disposition: string;
    }>
  ): Promise<void> {
    if (callState.callLogId) {
      await this.callLogRepo.update(callState.callLogId, updates);
    }
  }

  /**
   * Get active calls count
   */
  getActiveCallsCount(): number {
    return this.activeCalls.size;
  }

  /**
   * Get active call IDs
   */
  getActiveCallIds(): string[] {
    return Array.from(this.activeCalls.keys());
  }

  /**
   * Get all active calls with details
   */
  getActiveCalls(): Array<{
    uniqueId: string;
    callLogId: string;
    optionsPressed: string[];
    duration: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeCalls.entries()).map(([uniqueId, state]) => ({
      uniqueId,
      callLogId: state.callLogId,
      optionsPressed: state.optionsPressed,
      duration: Math.floor((now - state.startTime) / 1000),
    }));
  }
}
