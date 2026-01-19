import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { QueueRepository, Queue } from '../db/repositories/queueRepository';
import { PromptRepository } from '../db/repositories/promptRepository';

export class QueueConfigService {
  private configPath: string;
  private queueRepo: QueueRepository;
  private promptRepo: PromptRepository;

  constructor(configPath: string, queueRepo: QueueRepository, promptRepo: PromptRepository) {
    this.configPath = configPath;
    this.queueRepo = queueRepo;
    this.promptRepo = promptRepo;
  }

  /**
   * Generate queues.conf configuration
   */
  async generateQueuesConf(): Promise<string> {
    const queues = await this.queueRepo.findAllEnabled();

    let config = `; ===============================================
; BotPBX Auto-Generated Queues Configuration
; Generated: ${new Date().toISOString()}
; DO NOT EDIT MANUALLY - Changes will be overwritten
; ===============================================

[general]
persistentmembers=yes
autofill=yes
monitor-type=MixMonitor

`;

    for (const queue of queues) {
      config += await this.generateQueueConfig(queue);
    }

    return config;
  }

  /**
   * Generate configuration for a single queue
   */
  private async generateQueueConfig(queue: Queue): Promise<string> {
    const queueName = queue.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const members = queue.members || [];

    // Get MOH class name from prompt
    let mohClass = 'default';
    if (queue.holdMusicPromptId) {
      const prompt = await this.promptRepo.findById(queue.holdMusicPromptId);
      if (prompt) {
        mohClass = `moh-${prompt.id}`;
      }
    }

    // Get join announcement path
    let joinAnnouncement = '';
    if (queue.joinAnnouncementId) {
      const prompt = await this.promptRepo.findById(queue.joinAnnouncementId);
      if (prompt && prompt.filePath) {
        // Strip extension for Asterisk playback
        joinAnnouncement = prompt.filePath.replace(/\.(wav|mp3|gsm)$/, '');
      }
    }

    let config = `
; ===============================================
; Queue: ${queue.name}
; Strategy: ${queue.strategy}
; ===============================================
[${queueName}]
strategy=${this.mapStrategy(queue.strategy)}
timeout=${queue.timeoutSeconds}
retry=${queue.retrySeconds}
maxlen=${queue.maxWaitTime > 0 ? Math.floor(queue.maxWaitTime / queue.timeoutSeconds) : 0}
wrapuptime=0
autopause=no
autopausedelay=0
autopausebusy=no
autopauseunavail=no
musicclass=${mohClass}
`;

    // Add join announcement if configured
    if (joinAnnouncement) {
      config += `announce=${joinAnnouncement}
`;
    }

    // Add position announcements if configured
    if (queue.announceFrequency > 0) {
      config += `announce-frequency=${queue.announceFrequency}
`;
    }

    if (queue.announcePosition > 0) {
      config += `announce-position=yes
announce-position-limit=${queue.announcePosition}
`;
    }

    // Add queue members
    for (const member of members) {
      if (!member.paused) {
        config += `member => PJSIP/${member.extensionNumber},${member.penalty}
`;
      }
    }

    config += `
`;

    return config;
  }

  /**
   * Map our strategy names to Asterisk queue strategy names
   */
  private mapStrategy(strategy: string): string {
    const strategyMap: Record<string, string> = {
      ringall: 'ringall',
      hunt: 'linear',  // Linear is Asterisk's equivalent of "hunt"
      random: 'random',
      roundrobin: 'rrmemory',  // Round-robin with memory
      leastrecent: 'leastrecent',
    };

    return strategyMap[strategy] || 'ringall';
  }

  /**
   * Write queues.conf to Asterisk config directory
   */
  async writeQueuesConf(): Promise<boolean> {
    const configContent = await this.generateQueuesConf();
    const filePath = path.join(this.configPath, 'queues_custom.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        logger.info(`Backed up existing queues config to: ${backupPath}`);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`Queues config written to: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Failed to write queues config: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Generate extensions.conf snippet for queue handling
   */
  async generateQueueExtensions(): Promise<string> {
    const queues = await this.queueRepo.findAllEnabled();

    let config = `
; ===============================================
; Queue Extensions (auto-generated)
; Add this to your extensions.conf
; ===============================================

[queues]
`;

    for (const queue of queues) {
      const queueName = queue.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const extenNum = this.generateQueueExtension(queue.id);

      config += `
; Queue: ${queue.name}
exten => ${extenNum},1,NoOp(Entering queue: ${queue.name})
 same => n,Answer()
 same => n,Queue(${queueName},tT,,,${queue.maxWaitTime})
 same => n,Hangup()
`;
    }

    return config;
  }

  /**
   * Generate a unique extension number for a queue (for internal routing)
   * Uses format 7XXX for queues
   */
  private generateQueueExtension(queueId: string): string {
    // Create a simple hash from queue ID to generate extension
    const hash = queueId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `7${(hash % 900 + 100).toString()}`; // 7100-7999 range
  }

  /**
   * Generate MOH classes config for queue prompts
   */
  async generateMOHConf(): Promise<string> {
    const queues = await this.queueRepo.findAllEnabled();
    const usedPromptIds = new Set<string>();

    // Collect unique prompt IDs
    for (const queue of queues) {
      if (queue.holdMusicPromptId) {
        usedPromptIds.add(queue.holdMusicPromptId);
      }
    }

    let config = `; ===============================================
; Music on Hold for Queues (auto-generated)
; Generated: ${new Date().toISOString()}
; Add this to your musiconhold.conf
; ===============================================

[default]
mode=files
directory=/var/lib/asterisk/moh

`;

    for (const promptId of usedPromptIds) {
      const prompt = await this.promptRepo.findById(promptId);
      if (prompt && prompt.filePath) {
        const mohDir = path.dirname(prompt.filePath);
        config += `[moh-${promptId}]
mode=files
directory=${mohDir}

`;
      }
    }

    return config;
  }

  /**
   * Write MOH config to Asterisk config directory
   */
  async writeMOHConf(): Promise<boolean> {
    const configContent = await this.generateMOHConf();
    const filePath = path.join(this.configPath, 'musiconhold_custom.conf');

    try {
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        logger.info(`Backed up existing MOH config to: ${backupPath}`);
      }

      // Write new config
      fs.writeFileSync(filePath, configContent);
      logger.info(`MOH config written to: ${filePath}`);

      return true;
    } catch (error) {
      logger.error(`Failed to write MOH config: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Write all queue-related Asterisk configs
   */
  async writeAllConfigs(): Promise<void> {
    // Ensure config directory exists
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
      logger.info(`Created Asterisk config directory: ${this.configPath}`);
    }

    await this.writeQueuesConf();
    await this.writeMOHConf();

    logger.info('All queue configs written successfully');
  }

  /**
   * Reload Asterisk queues module (if AMI client available)
   */
  async reloadAsteriskQueues(amiClient: any): Promise<boolean> {
    if (!amiClient || !amiClient.isConnected()) {
      logger.warn('AMI not connected, cannot reload queues');
      return false;
    }

    try {
      await amiClient.sendAction({
        action: 'Command',
        command: 'queue reload all',
      });
      logger.info('Asterisk queues reloaded successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to reload Asterisk queues: ${(error as Error).message}`);
      return false;
    }
  }
}
