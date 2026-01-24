import { AGIConnection } from './agiServer';
import { AGISession } from '../models/types';
import { IVRMenuRepository } from '../db/repositories/ivrMenuRepository';
import { DialerCampaignRepository } from '../db/repositories/dialerCampaignRepository';
import { CampaignContactRepository } from '../db/repositories/campaignContactRepository';
import { PromptRepository } from '../db/repositories/promptRepository';
import { CallLogRepository } from '../db/repositories/callLogRepository';
import { CallRecordingRepository } from '../db/repositories/callRecordingRepository';
import { TrunkRepository } from '../db/repositories/trunkRepository';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import { RingGroupRepository } from '../db/repositories/ringGroupRepository';
import { QueueRepository } from '../db/repositories/queueRepository';
import { ExtensionRepository } from '../db/repositories/extensionRepository';
import { DialerService } from '../services/dialerService';
import { MohService } from '../services/mohService';
import { createLogger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

const outboundLogger = createLogger('OutboundIVR');

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

export class OutboundIvrHandler {
  private menuRepo: IVRMenuRepository;
  private campaignRepo: DialerCampaignRepository;
  private contactRepo: CampaignContactRepository;
  private promptRepo: PromptRepository;
  private callLogRepo: CallLogRepository;
  private recordingRepo: CallRecordingRepository | null;
  private settingsRepo: SettingsRepository | null;
  private trunkRepo: TrunkRepository | null;
  private ringGroupRepo: RingGroupRepository | null;
  private queueRepo: QueueRepository | null;
  private extensionRepo: ExtensionRepository | null;
  private dialerService: DialerService;
  private mohService: MohService | null;
  private audioPath: string;
  private recordingsPath: string;

  constructor(
    menuRepo: IVRMenuRepository,
    campaignRepo: DialerCampaignRepository,
    contactRepo: CampaignContactRepository,
    promptRepo: PromptRepository,
    callLogRepo: CallLogRepository,
    dialerService: DialerService,
    audioPath: string,
    mohService?: MohService,
    trunkRepo?: TrunkRepository,
    settingsRepo?: SettingsRepository,
    recordingRepo?: CallRecordingRepository,
    ringGroupRepo?: RingGroupRepository,
    queueRepo?: QueueRepository,
    extensionRepo?: ExtensionRepository
  ) {
    this.menuRepo = menuRepo;
    this.campaignRepo = campaignRepo;
    this.contactRepo = contactRepo;
    this.promptRepo = promptRepo;
    this.callLogRepo = callLogRepo;
    this.dialerService = dialerService;
    this.audioPath = audioPath;
    this.mohService = mohService || null;
    this.trunkRepo = trunkRepo || null;
    this.settingsRepo = settingsRepo || null;
    this.recordingRepo = recordingRepo || null;
    this.ringGroupRepo = ringGroupRepo || null;
    this.queueRepo = queueRepo || null;
    this.extensionRepo = extensionRepo || null;
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
        outboundLogger.info(`Recording completed: ${recordingFilePath}, duration=${durationSeconds}s, size=${fileSize}`);
      }
    } catch (error) {
      outboundLogger.error('Failed to complete recording:', error);
    }
  }

  /**
   * Handle an outbound dialer call
   */
  async handleCall(agi: AGIConnection, session: AGISession): Promise<void> {
    // Get campaign and contact IDs from channel variables
    const campaignId = await agi.getVariable('CAMPAIGN_ID');
    const contactId = await agi.getVariable('CONTACT_ID');
    const handlerType = await agi.getVariable('HANDLER_TYPE');
    const handlerId = await agi.getVariable('HANDLER_ID');

    if (!campaignId || !contactId) {
      outboundLogger.error('Missing CAMPAIGN_ID or CONTACT_ID in outbound call');
      await agi.hangup();
      return;
    }

    outboundLogger.info(`Outbound call answered: campaign=${campaignId}, contact=${contactId}, handler=${handlerType}/${handlerId}`);

    // Get campaign and contact
    const campaign = await this.campaignRepo.findById(campaignId);
    const contact = await this.contactRepo.findById(contactId);

    // Check AMD status (set by Asterisk's AMD() application in dialplan)
    const amdStatus = await agi.getVariable('AMDSTATUS');
    const amdCause = await agi.getVariable('AMDCAUSE');

    if (amdStatus) {
      outboundLogger.info(`AMD result: ${amdStatus}, cause: ${amdCause}`);

      // If answering machine detected and campaign has AMD enabled
      if (campaign && campaign.amdEnabled && amdStatus === 'MACHINE') {
        outboundLogger.info(`Answering machine detected for ${contact?.phoneNumber}, hanging up`);

        // Handle AMD result through dialer service
        if (contact) {
          this.dialerService.handleAmd(contactId, amdStatus, true);
        }

        await agi.hangup();
        return;
      }
    }

    if (!campaign || !contact) {
      outboundLogger.error('Campaign or contact not found');
      this.dialerService.handleCallFailed(contactId, 'failed');
      await agi.hangup();
      return;
    }

    // Create call log entry
    const callLog = await this.callLogRepo.create({
      callerId: session.callerId,
      did: contact.phoneNumber,
      ivrMenuId: campaign.ivrMenuId,
      optionsPressed: '',
      finalDestination: null,
      durationSeconds: null,
      disposition: 'OUTBOUND_IN_PROGRESS',
      uniqueId: session.uniqueId,
    });

    const startTime = Date.now();
    let optionsPressed: string[] = [];
    let recordingFilePath: string | null = null;

    // Start call recording if enabled
    if (this.settingsRepo && this.recordingRepo) {
      const recordingEnabled = (await this.settingsRepo.get('call_recording_enabled')) === 'true';
      if (recordingEnabled) {
        try {
          // Generate unique filename: YYYYMMDD-HHMMSS-uniqueid.wav
          const now = new Date();
          const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
          const filename = `${dateStr}-${session.uniqueId}.wav`;
          recordingFilePath = path.join(this.recordingsPath, filename);

          // Start MixMonitor to record both sides of the call
          await agi.exec('MixMonitor', `${recordingFilePath},ab`);
          outboundLogger.info(`Recording started: ${filename}`);

          // Create recording entry in database
          await this.recordingRepo.create({
            callLogId: callLog.id,
            filePath: recordingFilePath,
            durationSeconds: 0, // Will be updated later
          });
        } catch (recError) {
          outboundLogger.error('Failed to start recording:', recError);
          // Continue without recording
        }
      }
    }

    try {
      // Route based on handler type
      const effectiveHandlerType = handlerType || campaign.handlerType || 'ivr';
      const effectiveHandlerId = handlerId || '';

      // Handle AI Agent type - route to AudioSocket for realtime conversation
      if (effectiveHandlerType === 'ai_agent' && effectiveHandlerId) {
        outboundLogger.info(`Routing to AI Agent: ${effectiveHandlerId} for ${contact?.phoneNumber}`);

        // Set variables for the AI agent handler
        await agi.setVariable('AGENT_ID', effectiveHandlerId);
        await agi.setVariable('USE_REALTIME', '1');
        await agi.setVariable('CAMPAIGN_CONTACT_ID', contactId);

        // Mark as answered before routing to AI
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);

        // Route to AudioSocket for AI conversation
        await agi.exec('AudioSocket', '127.0.0.1:9092');

        // After AI conversation ends, mark as connected (successful conversation)
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          disposition: 'AI_CONVERSATION_COMPLETE',
          finalDestination: `ai_agent:${effectiveHandlerId}`,
        });
        await this.completeRecording(callLog.id, recordingFilePath, duration);
        this.dialerService.handleCallResult(contactId, 'connected', callLog.id);

        try {
          await agi.hangup();
        } catch {
          // Ignore hangup errors
        }
        return;
      }

      // Handle Ring Group type - direct transfer to ring group
      if (effectiveHandlerType === 'ring_group' && effectiveHandlerId && this.ringGroupRepo) {
        outboundLogger.info(`Routing to Ring Group: ${effectiveHandlerId} for ${contact?.phoneNumber}`);

        const ringGroup = await this.ringGroupRepo.findById(effectiveHandlerId);
        if (ringGroup && ringGroup.members && ringGroup.members.length > 0) {
          // Mark as answered
          this.dialerService.handleCallResult(contactId, 'answered', callLog.id);

          // Build dial string from ring group members
          const dialTargets: string[] = [];
          for (const member of ringGroup.members) {
            if (this.extensionRepo) {
              const ext = await this.extensionRepo.findByNumber(member.extensionNumber);
              if (ext?.forwardNumber && this.trunkRepo) {
                const trunks = await this.trunkRepo.findEnabled();
                if (trunks.length > 0) {
                  const trunkName = trunks[0].name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                  dialTargets.push(`PJSIP/${ext.forwardNumber}@${trunkName}`);
                }
              } else {
                dialTargets.push(`PJSIP/${member.extensionNumber}`);
              }
            } else {
              dialTargets.push(`PJSIP/${member.extensionNumber}`);
            }
          }

          const dialString = dialTargets.join('&');
          outboundLogger.info(`Dialing ring group "${ringGroup.name}": ${dialString}`);

          await this.callLogRepo.update(callLog.id, {
            finalDestination: `ring_group:${ringGroup.name}`,
            disposition: 'CONNECTING',
          });

          // Dial the ring group
          const dialResult = await agi.exec('Dial', `${dialString},30,tTwW`);
          const dialStatus = await agi.getVariable('DIALSTATUS');
          const duration = Math.floor((Date.now() - startTime) / 1000);

          if (dialStatus === 'ANSWER') {
            await this.callLogRepo.update(callLog.id, {
              durationSeconds: duration,
              disposition: 'CONNECTED',
            });
            await this.completeRecording(callLog.id, recordingFilePath, duration);
            this.dialerService.handleCallResult(contactId, 'connected', callLog.id);
          } else {
            await this.callLogRepo.update(callLog.id, {
              durationSeconds: duration,
              disposition: `DIAL_${dialStatus}`,
            });
            await this.completeRecording(callLog.id, recordingFilePath, duration);
          }

          try {
            await agi.hangup();
          } catch {
            // Ignore hangup errors
          }
          return;
        } else {
          outboundLogger.error(`Ring group not found or empty: ${effectiveHandlerId}`);
        }
      }

      // Handle Extension type - direct transfer to extensions
      if (effectiveHandlerType === 'extension' && effectiveHandlerId) {
        outboundLogger.info(`Routing to Extensions: ${effectiveHandlerId} for ${contact?.phoneNumber}`);

        // Mark as answered
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);

        const extensions = effectiveHandlerId.split(',').map(e => e.trim()).filter(Boolean);
        const dialTargets: string[] = [];

        for (const extNum of extensions) {
          if (this.extensionRepo) {
            const ext = await this.extensionRepo.findByNumber(extNum);
            if (ext?.forwardNumber && this.trunkRepo) {
              const trunks = await this.trunkRepo.findEnabled();
              if (trunks.length > 0) {
                const trunkName = trunks[0].name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                dialTargets.push(`PJSIP/${ext.forwardNumber}@${trunkName}`);
              }
            } else {
              dialTargets.push(`PJSIP/${extNum}`);
            }
          } else {
            dialTargets.push(`PJSIP/${extNum}`);
          }
        }

        const dialString = dialTargets.join('&');
        outboundLogger.info(`Dialing extensions: ${dialString}`);

        await this.callLogRepo.update(callLog.id, {
          finalDestination: `ext:${extensions.join(',')}`,
          disposition: 'CONNECTING',
        });

        // Dial the extensions
        const dialResult = await agi.exec('Dial', `${dialString},30,tTwW`);
        const dialStatus = await agi.getVariable('DIALSTATUS');
        const duration = Math.floor((Date.now() - startTime) / 1000);

        if (dialStatus === 'ANSWER') {
          await this.callLogRepo.update(callLog.id, {
            durationSeconds: duration,
            disposition: 'CONNECTED',
          });
          await this.completeRecording(callLog.id, recordingFilePath, duration);
          this.dialerService.handleCallResult(contactId, 'connected', callLog.id);
        } else {
          await this.callLogRepo.update(callLog.id, {
            durationSeconds: duration,
            disposition: `DIAL_${dialStatus}`,
          });
          await this.completeRecording(callLog.id, recordingFilePath, duration);
        }

        try {
          await agi.hangup();
        } catch {
          // Ignore hangup errors
        }
        return;
      }

      // Handle IVR type (default) - play IVR menu and wait for DTMF
      // Get the IVR menu for this campaign
      const ivrMenuId = effectiveHandlerId || campaign.ivrMenuId;
      if (!ivrMenuId) {
        outboundLogger.error(`Campaign ${campaign.name} has no handler configured`);
        this.dialerService.handleCallResult(contactId, 'failed', callLog.id);
        await agi.hangup();
        return;
      }

      const menu = await this.menuRepo.findByIdWithOptions(ivrMenuId);
      if (!menu) {
        outboundLogger.error(`IVR menu not found: ${ivrMenuId}`);
        this.dialerService.handleCallResult(contactId, 'failed', callLog.id);
        await agi.hangup();
        return;
      }

      outboundLogger.info(`Playing IVR menu: ${menu.name} for ${contact.phoneNumber}`);

      // Play welcome prompt and wait for DTMF
      let digit = '';
      let retryCount = 0;

      while (retryCount <= menu.maxRetries) {
        if (menu.welcomePromptId) {
          const promptPath = await this.getPromptPath(menu.welcomePromptId);
          digit = await agi.getData(promptPath, menu.timeoutSeconds * 1000, 1);
        } else {
          digit = await agi.waitForDigit(menu.timeoutSeconds * 1000);
        }

        if (digit) {
          optionsPressed.push(digit);
          break;
        }

        // Timeout
        retryCount++;
        if (retryCount <= menu.maxRetries) {
          outboundLogger.debug(`Timeout, retry ${retryCount} of ${menu.maxRetries}`);
          if (menu.timeoutPromptId) {
            await agi.streamFile(await this.getPromptPath(menu.timeoutPromptId));
          }
        }
      }

      // No response after retries
      if (!digit) {
        outboundLogger.info(`No response from ${contact.phoneNumber} after ${menu.maxRetries} retries`);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          optionsPressed: optionsPressed.join(','),
          disposition: 'NO_RESPONSE',
        });
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);
        await agi.hangup();
        return;
      }

      outboundLogger.info(`DTMF pressed: ${digit} from ${contact.phoneNumber}`);

      // Find matching option
      const option = menu.options.find((o) => o.keyPress === digit);

      if (!option) {
        // Invalid option
        outboundLogger.info(`Invalid option ${digit} from ${contact.phoneNumber}`);
        if (menu.invalidPromptId) {
          await agi.streamFile(await this.getPromptPath(menu.invalidPromptId));
        }
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          optionsPressed: optionsPressed.join(','),
          disposition: 'INVALID_OPTION',
        });
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);
        await agi.hangup();
        return;
      }

      // Check if this is a transfer-type response
      // Use IVR option configuration to determine where to transfer
      const transferActions = ['transfer', 'queue', 'extension', 'ring_group'];
      const shouldTransfer = transferActions.includes(option.actionType);

      if (shouldTransfer) {
        outboundLogger.info(`LEAD! ${contact.phoneNumber} pressed ${digit} - initiating transfer (action: ${option.actionType}, dest: ${option.destination})`);

        // Update to press1 status (this triggers the Telegram alert via event)
        this.dialerService.handleCallResult(contactId, 'press1', callLog.id);

        // Play pre-connect prompt if configured
        if (option.preConnectPromptId) {
          await agi.streamFile(await this.getPromptPath(option.preConnectPromptId));
        }

        // Determine transfer destination based on IVR option action type
        let dialString: string = '';
        let destinationLog: string = '';
        let dialTimeout: number = 30;

        // Build dial string based on action type using PBX configuration
        if (option.actionType === 'ring_group' || option.actionType === 'queue') {
          // Look up ring group members from the destination ID
          if (this.ringGroupRepo && option.destination) {
            const ringGroup = await this.ringGroupRepo.findById(option.destination);
            if (ringGroup && ringGroup.members && ringGroup.members.length > 0) {
              // Get extension numbers from ring group members
              const extensions = ringGroup.members.map(m => m.extensionNumber);

              // Check if extensions have forwarding configured
              const dialTargets: string[] = [];
              for (const extNum of extensions) {
                if (this.extensionRepo) {
                  const ext = await this.extensionRepo.findByNumber(extNum);
                  if (ext?.forwardNumber && this.trunkRepo) {
                    // Extension has forwarding - dial via trunk
                    const trunks = await this.trunkRepo.findEnabled();
                    if (trunks.length > 0) {
                      const trunkName = trunks[0].name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                      dialTargets.push(`PJSIP/${ext.forwardNumber}@${trunkName}`);
                      outboundLogger.info(`Extension ${extNum} forwarding to ${ext.forwardNumber} via trunk`);
                    }
                  } else {
                    // No forwarding - dial extension directly
                    dialTargets.push(`PJSIP/${extNum}`);
                  }
                } else {
                  dialTargets.push(`PJSIP/${extNum}`);
                }
              }

              dialString = dialTargets.join('&');
              destinationLog = `ring_group:${ringGroup.name}:${extensions.join(',')}`;
              outboundLogger.info(`Dialing ring group "${ringGroup.name}": ${dialString}`);
            } else {
              outboundLogger.error(`Ring group not found or empty: ${option.destination}`);
            }
          }
        } else if (option.actionType === 'extension') {
          // Dial single extension
          const extNum = option.destination || '';
          if (this.extensionRepo && extNum) {
            const ext = await this.extensionRepo.findByNumber(extNum);
            if (ext?.forwardNumber && this.trunkRepo) {
              // Extension has forwarding
              const trunks = await this.trunkRepo.findEnabled();
              if (trunks.length > 0) {
                const trunkName = trunks[0].name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                dialString = `PJSIP/${ext.forwardNumber}@${trunkName}`;
                destinationLog = `ext:${extNum}->fwd:${ext.forwardNumber}`;
                outboundLogger.info(`Extension ${extNum} forwarding to ${ext.forwardNumber}`);
              }
            } else {
              dialString = `PJSIP/${extNum}`;
              destinationLog = `ext:${extNum}`;
            }
          } else {
            dialString = `PJSIP/${extNum}`;
            destinationLog = `ext:${extNum}`;
          }
          outboundLogger.info(`Dialing extension: ${dialString}`);
        } else if (option.actionType === 'transfer' && option.transferMode === 'trunk') {
          // External trunk transfer (legacy support)
          if (this.trunkRepo && option.transferTrunkId && option.transferDestination) {
            const trunk = await this.trunkRepo.findById(option.transferTrunkId);
            if (trunk && trunk.enabled) {
              const trunkName = trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
              dialString = `PJSIP/${option.transferDestination}@${trunkName}`;
              destinationLog = `trunk:${trunk.name}:${option.transferDestination}`;
              dialTimeout = 60;
              outboundLogger.info(`Dialing via trunk: ${dialString}`);
            }
          }
        }

        // Fallback to campaign settings if no dial string built
        if (!dialString) {
          const extensions = (campaign.targetExtensions || '').split(',').map(e => e.trim()).filter(Boolean);
          if (extensions.length > 0) {
            dialString = extensions.map(e => `PJSIP/${e}`).join('&');
            destinationLog = `ext:${extensions.join(',')}`;
            outboundLogger.info(`Fallback to campaign extensions: ${dialString}`);
          } else {
            outboundLogger.error('No transfer destination configured');
            const duration = Math.floor((Date.now() - startTime) / 1000);
            await this.callLogRepo.update(callLog.id, {
              durationSeconds: duration,
              optionsPressed: optionsPressed.join(','),
              finalDestination: 'no_destination',
              disposition: 'NO_DESTINATION',
            });
            await this.completeRecording(callLog.id, recordingFilePath, duration);
            await agi.hangup();
            return;
          }
        }

        await this.callLogRepo.update(callLog.id, {
          optionsPressed: optionsPressed.join(','),
          finalDestination: destinationLog,
          disposition: 'CONNECTING',
        });

        // Build dial options: t=allow transfer, T=allow called transfer, w=whisper, W=whisper to called
        // m=music on hold, m(class)=specific MOH class
        let dialOptions = 'tTwW';

        // Add music on hold if configured for this campaign
        if (campaign.holdMusicPromptId && this.mohService) {
          const mohClass = this.mohService.getMohClass(campaign.id);
          if (this.mohService.hasMohConfigured(campaign.id)) {
            dialOptions = `tTwWm(${mohClass})`;
            outboundLogger.info(`Using MOH class: ${mohClass}`);
          } else {
            // Fallback to default MOH
            dialOptions = 'tTwWm';
            outboundLogger.info('Using default MOH (campaign MOH not configured)');
          }
        }

        // Dial with appropriate timeout
        try {
          const dialResult = await agi.exec('Dial', `${dialString},${dialTimeout},${dialOptions}`);
          outboundLogger.info(`Dial result: ${dialResult}`);

          // Update call log with result
          const duration = Math.floor((Date.now() - startTime) / 1000);
          const dialStatus = await agi.getVariable('DIALSTATUS');

          if (dialStatus === 'ANSWER') {
            await this.callLogRepo.update(callLog.id, {
              durationSeconds: duration,
              disposition: 'CONNECTED',
            });
            await this.completeRecording(callLog.id, recordingFilePath, duration);
            this.dialerService.handleCallResult(contactId, 'connected', callLog.id);
          } else {
            await this.callLogRepo.update(callLog.id, {
              durationSeconds: duration,
              disposition: `DIAL_${dialStatus}`,
            });
            await this.completeRecording(callLog.id, recordingFilePath, duration);
          }
        } catch (error) {
          outboundLogger.error('Dial failed:', error);
          const duration = Math.floor((Date.now() - startTime) / 1000);
          await this.callLogRepo.update(callLog.id, {
            durationSeconds: duration,
            disposition: 'DIAL_ERROR',
          });
          await this.completeRecording(callLog.id, recordingFilePath, duration);
        }

      } else {
        // Other options - just mark as answered
        outboundLogger.info(`${contact.phoneNumber} pressed ${digit} (action: ${option.actionType})`);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          optionsPressed: optionsPressed.join(','),
          disposition: 'ANSWERED',
        });
        await this.completeRecording(callLog.id, recordingFilePath, duration);
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);
      }

    } catch (error) {
      if ((error as Error).message.includes('Socket closed') ||
          (error as Error).message.includes('timeout')) {
        outboundLogger.info(`Call ${session.uniqueId} ended by callee`);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          optionsPressed: optionsPressed.join(','),
          disposition: 'CALLER_HANGUP',
        });
        await this.completeRecording(callLog.id, recordingFilePath, duration);
        this.dialerService.handleCallResult(contactId, 'answered', callLog.id);
      } else {
        outboundLogger.error(`Outbound IVR error for ${session.uniqueId}:`, error);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await this.callLogRepo.update(callLog.id, {
          durationSeconds: duration,
          disposition: 'ERROR',
        });
        await this.completeRecording(callLog.id, recordingFilePath, duration);
        this.dialerService.handleCallFailed(contactId, 'failed');
      }
    }

    // Ensure hangup
    try {
      await agi.hangup();
    } catch {
      // Ignore hangup errors
    }
  }

  /**
   * Get the file path for a prompt (without extension)
   */
  private async getPromptPath(promptId: string): Promise<string> {
    const prompt = await this.promptRepo.findById(promptId);
    if (prompt && prompt.filePath) {
      const ext = path.extname(prompt.filePath);
      return prompt.filePath.slice(0, -ext.length);
    }
    return path.join(this.audioPath, 'prompts', promptId);
  }
}
