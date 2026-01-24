import { EventEmitter } from 'events';
import { AMIClient } from '../asterisk/amiClient';
import { DialerCampaignRepository } from '../db/repositories/dialerCampaignRepository';
import { CampaignContactRepository } from '../db/repositories/campaignContactRepository';
import { TrunkRepository } from '../db/repositories/trunkRepository';
import { ContactRepository } from '../db/repositories/contactRepository';
import { ContactGroupRepository } from '../db/repositories/contactGroupRepository';
import { DialerCampaign, CampaignContact, ContactStatus } from '../models/types';
import { createLogger } from '../utils/logger';

const dialerLogger = createLogger('Dialer');

interface CampaignRunner {
  campaignId: string;
  intervalId: NodeJS.Timeout | null;
  activeDialing: Set<string>; // contact IDs currently being dialed
}

export class DialerService extends EventEmitter {
  private campaigns: Map<string, CampaignRunner> = new Map();
  private amiClient: AMIClient;
  private campaignRepo: DialerCampaignRepository;
  private contactRepo: CampaignContactRepository;
  private trunkRepo: TrunkRepository;
  private mainContactRepo: ContactRepository;
  private contactGroupRepo?: ContactGroupRepository;

  constructor(
    amiClient: AMIClient,
    campaignRepo: DialerCampaignRepository,
    contactRepo: CampaignContactRepository,
    trunkRepo: TrunkRepository,
    mainContactRepo: ContactRepository,
    contactGroupRepo?: ContactGroupRepository
  ) {
    super();
    this.amiClient = amiClient;
    this.campaignRepo = campaignRepo;
    this.contactRepo = contactRepo;
    this.trunkRepo = trunkRepo;
    this.mainContactRepo = mainContactRepo;
    this.contactGroupRepo = contactGroupRepo;
  }

  /**
   * Start a campaign
   */
  async startCampaign(campaignId: string, resetContacts: boolean = true): Promise<{ success: boolean; error?: string }> {
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    if (this.campaigns.has(campaignId)) {
      return { success: false, error: 'Campaign is already running' };
    }

    // Check if AMI is connected
    if (!this.amiClient.isConnected()) {
      return { success: false, error: 'AMI not connected' };
    }

    // Check if there's an enabled trunk
    const trunks = await this.trunkRepo.findEnabled();
    if (trunks.length === 0) {
      return { success: false, error: 'No enabled SIP trunk available' };
    }

    // Check if campaign has any contacts - if not, import from main contacts table
    const existingContacts = await this.contactRepo.findByCampaign(campaignId);
    if (existingContacts.length === 0) {
      dialerLogger.info(`Campaign ${campaignId} has no contacts, importing from contacts table...`);

      // Get all active contacts from the main contacts table
      const { contacts: mainContacts } = await this.mainContactRepo.findAll({ status: 'active' });

      if (mainContacts.length === 0) {
        return { success: false, error: 'No contacts available. Add contacts first.' };
      }

      // Import each contact to the campaign
      let imported = 0;
      for (const contact of mainContacts) {
        await this.contactRepo.create(campaignId, {
          phoneNumber: contact.phoneNumber,
          name: contact.name || undefined,
        });
        imported++;
      }

      // Update campaign total_contacts
      await this.campaignRepo.setTotalContacts(campaignId, imported);
      dialerLogger.info(`Imported ${imported} contacts to campaign ${campaignId}`);
    } else {
      // Reset all contacts to pending if requested (default behavior)
      // This allows re-dialing all contacts each time campaign starts
      if (resetContacts) {
        const resetAllCount = await this.contactRepo.resetAllToPending(campaignId);
        if (resetAllCount > 0) {
          dialerLogger.info(`Reset ${resetAllCount} contacts to pending for campaign ${campaignId}`);
        }
      }
    }

    // Check if there are contacts to dial
    const hasContacts = await this.contactRepo.hasRemainingContacts(campaignId, campaign.retryAttempts + 1);
    if (!hasContacts) {
      return { success: false, error: 'No contacts remaining to dial' };
    }

    // Reset any stuck 'dialing' contacts from previous runs
    const resetCount = await this.contactRepo.resetDialingToPending(campaignId);
    if (resetCount > 0) {
      dialerLogger.info(`Reset ${resetCount} stuck dialing contacts for campaign ${campaignId}`);
    }

    // Update campaign status
    await this.campaignRepo.updateStatus(campaignId, 'running');

    // Calculate interval based on calls per minute
    const intervalMs = Math.floor(60000 / campaign.callsPerMinute);

    // Create campaign runner
    const runner: CampaignRunner = {
      campaignId,
      intervalId: null,
      activeDialing: new Set(),
    };

    // Start the dialing loop
    runner.intervalId = setInterval(() => {
      this.dialNextContact(campaign.id).catch((err) => {
        dialerLogger.error(`Error in dial loop for campaign ${campaign.id}:`, err);
      });
    }, intervalMs);

    this.campaigns.set(campaignId, runner);
    dialerLogger.info(`Campaign started: ${campaign.name} (${campaignId}), interval: ${intervalMs}ms`);

    // Emit event
    this.emit('campaignStarted', campaign);

    return { success: true };
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
    const runner = this.campaigns.get(campaignId);
    if (!runner) {
      return { success: false, error: 'Campaign is not running' };
    }

    // Stop the interval
    if (runner.intervalId) {
      clearInterval(runner.intervalId);
      runner.intervalId = null;
    }

    this.campaigns.delete(campaignId);
    await this.campaignRepo.updateStatus(campaignId, 'paused');

    const campaign = await this.campaignRepo.findById(campaignId);
    dialerLogger.info(`Campaign paused: ${campaign?.name} (${campaignId})`);

    this.emit('campaignPaused', campaign);

    return { success: true };
  }

  /**
   * Stop a campaign completely
   */
  async stopCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
    const runner = this.campaigns.get(campaignId);

    // Stop the interval if running
    if (runner?.intervalId) {
      clearInterval(runner.intervalId);
    }

    this.campaigns.delete(campaignId);
    await this.campaignRepo.updateStatus(campaignId, 'completed');

    const campaign = await this.campaignRepo.findById(campaignId);
    dialerLogger.info(`Campaign stopped: ${campaign?.name} (${campaignId})`);

    this.emit('campaignStopped', campaign);

    return { success: true };
  }

  /**
   * Resume all campaigns that were running (called on startup)
   */
  async resumeRunningCampaigns(): Promise<void> {
    const runningCampaigns = await this.campaignRepo.findByStatus('running');

    for (const campaign of runningCampaigns) {
      dialerLogger.info(`Resuming campaign: ${campaign.name}`);
      // Set to paused first, then start to reinitialize properly
      await this.campaignRepo.updateStatus(campaign.id, 'paused');
      await this.startCampaign(campaign.id);
    }
  }

  /**
   * Check if a campaign is running
   */
  isRunning(campaignId: string): boolean {
    return this.campaigns.has(campaignId);
  }

  /**
   * Get active dialing count for a campaign
   */
  getActiveDialingCount(campaignId: string): number {
    const runner = this.campaigns.get(campaignId);
    return runner?.activeDialing.size ?? 0;
  }

  /**
   * Dial the next contact in a campaign
   */
  private async dialNextContact(campaignId: string): Promise<void> {
    const runner = this.campaigns.get(campaignId);
    if (!runner) return;

    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) {
      dialerLogger.error(`Campaign not found: ${campaignId}`);
      await this.stopCampaign(campaignId);
      return;
    }

    // Check concurrent limit
    if (runner.activeDialing.size >= campaign.maxConcurrent) {
      dialerLogger.debug(`Max concurrent reached for ${campaign.name}: ${runner.activeDialing.size}/${campaign.maxConcurrent}`);
      return;
    }

    // Get next contact to dial
    const contacts = await this.contactRepo.findPendingForDialing(
      campaignId,
      1,
      campaign.retryDelayMinutes,
      campaign.retryAttempts + 1
    );

    if (contacts.length === 0) {
      // Check if campaign is complete
      const hasRemaining = await this.contactRepo.hasRemainingContacts(campaignId, campaign.retryAttempts + 1);
      if (!hasRemaining && runner.activeDialing.size === 0) {
        dialerLogger.info(`Campaign ${campaign.name} completed - no more contacts`);
        await this.stopCampaign(campaignId);
      }
      return;
    }

    const contact = contacts[0];

    // Get trunk for dialing - use campaign's selected trunk if set, otherwise first enabled
    let trunk;
    if (campaign.trunkId) {
      // Use the campaign's selected trunk
      trunk = await this.trunkRepo.findById(campaign.trunkId);
      if (!trunk) {
        dialerLogger.error(`Selected trunk ${campaign.trunkId} not found for campaign ${campaign.name}`);
        this.emit('trunkError', { campaign, error: 'Selected trunk not found' });
        await this.pauseCampaign(campaignId);
        return;
      }
      if (!trunk.enabled) {
        dialerLogger.error(`Selected trunk ${trunk.name} is disabled for campaign ${campaign.name}`);
        this.emit('trunkError', { campaign, trunk, error: `Selected trunk "${trunk.name}" is disabled` });
        await this.pauseCampaign(campaignId);
        return;
      }
    } else {
      // Fall back to first enabled trunk
      const trunks = await this.trunkRepo.findEnabled();
      if (trunks.length === 0) {
        dialerLogger.error('No enabled trunk for dialing');
        this.emit('trunkError', { campaign, error: 'No enabled trunk available' });
        await this.pauseCampaign(campaignId);
        return;
      }
      trunk = trunks[0];
    }

    // Check trunk registration status
    const trunkStatus = await this.checkTrunkRegistration(trunk.name);
    if (!trunkStatus.registered) {
      dialerLogger.error(`Trunk ${trunk.name} is not registered: ${trunkStatus.status}`);
      this.emit('trunkError', {
        campaign,
        trunk,
        error: `SIP trunk "${trunk.name}" is offline (${trunkStatus.status})`,
        status: trunkStatus.status
      });
      // Pause campaign instead of continuing with failed trunk
      await this.pauseCampaign(campaignId);
      return;
    }

    // Mark contact as dialing
    await this.contactRepo.updateStatus(contact.id, 'dialing');
    runner.activeDialing.add(contact.id);
    await this.campaignRepo.incrementStat(campaignId, 'dialed');

    dialerLogger.info(`Dialing: ${contact.phoneNumber} (${contact.name || 'Unknown'}) for campaign ${campaign.name}`);

    try {
      // Build trunk name for dial string
      const trunkName = trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      // Determine handler ID based on handler type
      let handlerId = '';
      switch (campaign.handlerType) {
        case 'ai_agent':
          handlerId = campaign.aiAgentId || '';
          break;
        case 'ivr':
          handlerId = campaign.ivrMenuId || '';
          break;
        case 'ring_group':
          handlerId = campaign.ringGroupId || '';
          break;
        case 'extension':
          handlerId = campaign.targetExtensions || '';
          break;
      }

      // Build variables for the call - includes handler routing info
      const callVariables = [
        `CAMPAIGN_ID=${campaignId}`,
        `CONTACT_ID=${contact.id}`,
        `HANDLER_TYPE=${campaign.handlerType}`,
        `HANDLER_ID=${handlerId}`,
        `AMD_ENABLED=${campaign.amdEnabled ? '1' : '0'}`,
      ].join(',');

      // Use custom caller ID if specified, otherwise use trunk username
      const callerId = campaign.callerId || trunk.username;

      // Originate the call
      await this.amiClient.originate({
        channel: `PJSIP/${contact.phoneNumber}@${trunkName}`,
        context: 'outbound-dialer',
        exten: 's',
        priority: 1,
        callerid: `"${campaign.name}" <${callerId}>`,
        timeout: 30000,
        variable: callVariables,
      });

      dialerLogger.debug(`Call originated for ${contact.phoneNumber} (handler: ${campaign.handlerType}/${handlerId})`);

    } catch (error) {
      dialerLogger.error(`Failed to originate call to ${contact.phoneNumber}:`, error);

      // Mark as failed
      await this.contactRepo.updateStatus(contact.id, 'failed');
      runner.activeDialing.delete(contact.id);
    }
  }

  /**
   * Handle call result from outbound IVR handler
   */
  async handleCallResult(contactId: string, status: ContactStatus, callLogId?: string): Promise<void> {
    const contact = await this.contactRepo.findById(contactId);
    if (!contact) {
      dialerLogger.warn(`Contact not found for result: ${contactId}`);
      return;
    }

    const runner = this.campaigns.get(contact.campaignId);

    // Update contact status
    await this.contactRepo.updateStatus(contactId, status, callLogId);

    // Remove from active dialing
    if (runner) {
      runner.activeDialing.delete(contactId);
    }

    // Update campaign stats
    switch (status) {
      case 'answered':
        await this.campaignRepo.incrementStat(contact.campaignId, 'answered');
        break;
      case 'press1':
        await this.campaignRepo.incrementStat(contact.campaignId, 'answered');
        await this.campaignRepo.incrementStat(contact.campaignId, 'press1');
        break;
      case 'connected':
        await this.campaignRepo.incrementStat(contact.campaignId, 'connected');
        break;
    }

    // Mark number as called in global DNC (contact groups)
    // Skip DNC if number is in a group that allows redial
    if ((status === 'answered' || status === 'press1' || status === 'connected') && this.contactGroupRepo) {
      try {
        const isInRedialGroup = await this.contactGroupRepo.isNumberInRedialGroup(contact.phoneNumber);
        if (isInRedialGroup) {
          dialerLogger.debug(`Skipping DNC for ${contact.phoneNumber} - in redial group`);
        } else {
          await this.contactGroupRepo.markAsCalled(contact.phoneNumber, contact.campaignId);
          dialerLogger.debug(`Marked ${contact.phoneNumber} as called in global DNC`);
          // Emit event for WebSocket broadcast
          this.emit('contactCalled', {
            phoneNumber: contact.phoneNumber,
            campaignId: contact.campaignId,
            status,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        dialerLogger.warn(`Failed to mark number as called in DNC: ${contact.phoneNumber}`, err);
      }
    }

    // Emit event for Telegram notifications
    if (status === 'press1' || status === 'connected') {
      const campaign = await this.campaignRepo.findById(contact.campaignId);
      this.emit('leadAlert', { campaign, contact, status });
    }

    dialerLogger.info(`Call result: ${contact.phoneNumber} -> ${status}`);
  }

  /**
   * Handle no answer / failed call
   */
  async handleCallFailed(contactId: string, reason: 'no_answer' | 'busy' | 'failed'): Promise<void> {
    const contact = await this.contactRepo.findById(contactId);
    if (!contact) return;

    const runner = this.campaigns.get(contact.campaignId);

    // Update contact status
    await this.contactRepo.updateStatus(contactId, reason);

    // Remove from active dialing
    if (runner) {
      runner.activeDialing.delete(contactId);
    }

    dialerLogger.info(`Call failed: ${contact.phoneNumber} -> ${reason}`);
  }

  /**
   * Handle AMD (Answering Machine Detection) result
   */
  async handleAmd(contactId: string, amdStatus: string, isMachine: boolean, callLogId?: string): Promise<void> {
    const contact = await this.contactRepo.findById(contactId);
    if (!contact) {
      dialerLogger.warn(`Contact not found for AMD result: ${contactId}`);
      return;
    }

    const runner = this.campaigns.get(contact.campaignId);

    // Update contact with AMD status
    await this.contactRepo.updateAmdStatus(contactId, amdStatus, isMachine);

    // Update call log if provided
    if (callLogId) {
      await this.contactRepo.updateStatus(contactId, isMachine ? 'answering_machine' : 'answered', callLogId);
    }

    // Remove from active dialing
    if (runner) {
      runner.activeDialing.delete(contactId);
    }

    // Update campaign stats
    if (isMachine) {
      await this.campaignRepo.incrementStat(contact.campaignId, 'answering_machine');
    } else {
      await this.campaignRepo.incrementStat(contact.campaignId, 'answered');
    }

    dialerLogger.info(`AMD result: ${contact.phoneNumber} -> ${amdStatus} (machine: ${isMachine})`);

    // Emit event
    const campaign = await this.campaignRepo.findById(contact.campaignId);
    this.emit('amdResult', { campaign, contact, amdStatus, isMachine });
  }

  /**
   * Check if a trunk is registered with the SIP provider
   */
  private async checkTrunkRegistration(trunkName: string): Promise<{ registered: boolean; status: string }> {
    try {
      // Use AMI command to check registration status
      const rawOutput = await this.amiClient.command('pjsip show registrations');
      // Ensure output is a string
      const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput || '');

      const trunkRegName = `${trunkName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-reg`;

      // Parse the output to find the trunk status
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(trunkRegName)) {
          if (line.includes('Registered')) {
            return { registered: true, status: 'Registered' };
          } else if (line.includes('Rejected')) {
            return { registered: false, status: 'Rejected' };
          } else if (line.includes('Unregistered')) {
            return { registered: false, status: 'Unregistered' };
          }
        }
      }

      // If trunk not found in registrations, it might be using IP auth
      // Check if endpoint exists and is available
      const rawEndpointOutput = await this.amiClient.command(
        `pjsip show endpoint ${trunkName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
      );
      const endpointOutput = typeof rawEndpointOutput === 'string' ? rawEndpointOutput : String(rawEndpointOutput || '');

      if (endpointOutput.includes('Avail')) {
        return { registered: true, status: 'Available (IP Auth)' };
      }

      return { registered: false, status: 'Not Found' };
    } catch (error) {
      dialerLogger.error(`Failed to check trunk registration for ${trunkName}:`, error);
      // Assume registered if we can't check (fail open for dialing)
      return { registered: true, status: 'Unknown (check failed)' };
    }
  }

  /**
   * Get running campaign IDs
   */
  getRunningCampaignIds(): string[] {
    return Array.from(this.campaigns.keys());
  }

  /**
   * Shutdown all campaigns gracefully
   */
  async shutdown(): Promise<void> {
    dialerLogger.info('Shutting down dialer service...');

    for (const [campaignId, runner] of this.campaigns) {
      if (runner.intervalId) {
        clearInterval(runner.intervalId);
      }
      // Keep status as 'running' so it resumes on restart
    }

    this.campaigns.clear();
    dialerLogger.info('Dialer service shutdown complete');
  }
}
