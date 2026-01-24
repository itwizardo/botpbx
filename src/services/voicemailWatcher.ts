/**
 * Voicemail Watcher Service
 * Watches Asterisk voicemail directory for new messages and processes them
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { logger } from '../utils/logger';
import { VoicemailRepository, Voicemail } from '../db/repositories/voicemailRepository';
import { TranscriptionService } from './transcriptionService';

// Default Asterisk voicemail path
const DEFAULT_VOICEMAIL_PATH = '/var/spool/asterisk/voicemail';

export interface VoicemailWatcherConfig {
  voicemailPath?: string;
  autoTranscribe?: boolean;
  contexts?: string[];  // Which voicemail contexts to watch (default: 'default')
}

export interface VoicemailMetadata {
  callerId: string;
  callerName: string;
  origDate: string;
  origTime: string;
  duration: number;
  msgId: string;
  origMailbox: string;
  context: string;
}

export class VoicemailWatcher extends EventEmitter {
  private voicemailRepo: VoicemailRepository;
  private transcriptionService: TranscriptionService | null;
  private config: Required<VoicemailWatcherConfig>;
  private watcher: FSWatcher | null = null;
  private isRunning = false;
  private processedFiles = new Set<string>();

  constructor(
    voicemailRepo: VoicemailRepository,
    transcriptionService: TranscriptionService | null,
    config?: VoicemailWatcherConfig
  ) {
    super();
    this.voicemailRepo = voicemailRepo;
    this.transcriptionService = transcriptionService;
    this.config = {
      voicemailPath: config?.voicemailPath ?? DEFAULT_VOICEMAIL_PATH,
      autoTranscribe: config?.autoTranscribe ?? true,
      contexts: config?.contexts ?? ['default'],
    };
  }

  /**
   * Start watching for voicemails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('VoicemailWatcher already running');
      return;
    }

    // Check if voicemail directory exists
    if (!fs.existsSync(this.config.voicemailPath)) {
      logger.warn(`Voicemail path does not exist: ${this.config.voicemailPath}`);
      return;
    }

    logger.info(`Starting VoicemailWatcher on ${this.config.voicemailPath}`);

    // Build watch paths for each context
    const watchPaths = this.config.contexts.map(ctx =>
      path.join(this.config.voicemailPath, ctx, '**', 'INBOX', '*.txt')
    );

    // Initialize watcher
    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: false,  // Process existing voicemails on startup
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleNewFile(filePath));
    this.watcher.on('change', (filePath) => this.handleNewFile(filePath));
    this.watcher.on('error', (error: any) => {
      logger.error('VoicemailWatcher error:', error);
      this.emit('error', error);
    });

    this.watcher.on('ready', () => {
      logger.info('VoicemailWatcher ready and watching for voicemails');
      this.isRunning = true;
      this.emit('ready');
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.watcher) return;

    logger.info('Stopping VoicemailWatcher');
    await this.watcher.close();
    this.watcher = null;
    this.isRunning = false;
  }

  /**
   * Handle new voicemail file (txt metadata file)
   */
  private async handleNewFile(filePath: string): Promise<void> {
    // Only process .txt files (metadata)
    if (!filePath.endsWith('.txt')) return;

    // Skip if already processed
    if (this.processedFiles.has(filePath)) return;
    this.processedFiles.add(filePath);

    try {
      // Parse the file path to get mailbox info
      // Path format: /var/spool/asterisk/voicemail/{context}/{mailbox}/INBOX/msg0000.txt
      const pathParts = filePath.split(path.sep);
      const inboxIndex = pathParts.indexOf('INBOX');
      if (inboxIndex < 2) {
        logger.warn(`Invalid voicemail path: ${filePath}`);
        return;
      }

      const mailbox = pathParts[inboxIndex - 1];
      const context = pathParts[inboxIndex - 2];
      const msgFile = pathParts[inboxIndex + 1];
      const msgId = msgFile.replace('.txt', '');

      // Check if voicemail already exists in database
      const existing = await this.voicemailRepo.findByMsgId(mailbox, msgId);
      if (existing) {
        logger.debug(`Voicemail already exists: ${mailbox}/${msgId}`);
        return;
      }

      // Read metadata file
      const metadata = await this.parseMetadataFile(filePath);
      if (!metadata) {
        logger.warn(`Failed to parse voicemail metadata: ${filePath}`);
        return;
      }

      // Find the audio file
      const basePath = filePath.replace('.txt', '');
      const audioExtensions = ['.wav', '.WAV', '.gsm', '.GSM'];
      let audioPath: string | null = null;

      for (const ext of audioExtensions) {
        const testPath = basePath + ext;
        if (fs.existsSync(testPath)) {
          audioPath = testPath;
          break;
        }
      }

      if (!audioPath) {
        logger.warn(`No audio file found for voicemail: ${filePath}`);
        return;
      }

      // Create voicemail record
      const voicemail = await this.voicemailRepo.create({
        mailbox,
        callerId: metadata.callerId,
        callerName: metadata.callerName,
        durationSeconds: metadata.duration,
        filePath: audioPath,
        msgId,
        origDate: metadata.origDate,
        origTime: metadata.origTime,
        urgent: false,
      });

      logger.info(`New voicemail detected: ${voicemail.id} for mailbox ${mailbox}`);
      this.emit('voicemail', voicemail);

      // Auto-transcribe if enabled
      if (this.config.autoTranscribe && this.transcriptionService) {
        await this.queueTranscription(voicemail);
      }

    } catch (error) {
      logger.error(`Error processing voicemail file ${filePath}:`, error);
    }
  }

  /**
   * Parse Asterisk voicemail metadata file
   */
  private async parseMetadataFile(filePath: string): Promise<VoicemailMetadata | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const metadata: Partial<VoicemailMetadata> = {};

      for (const line of lines) {
        const match = line.match(/^(\w+)=(.*)$/);
        if (!match) continue;

        const [, key, value] = match;
        switch (key) {
          case 'callerid':
            // Parse callerid format: "Name" <number> or just <number>
            const cidMatch = value.match(/"?([^"]*)"?\s*<?(\d+)>?/);
            if (cidMatch) {
              metadata.callerName = cidMatch[1]?.trim() || '';
              metadata.callerId = cidMatch[2] || value;
            } else {
              metadata.callerId = value.replace(/[<>"]/g, '');
            }
            break;
          case 'origdate':
            metadata.origDate = value;
            break;
          case 'origtime':
            metadata.origTime = value;
            break;
          case 'duration':
            metadata.duration = parseInt(value, 10) || 0;
            break;
          case 'msg_id':
            metadata.msgId = value;
            break;
          case 'origmailbox':
            metadata.origMailbox = value;
            break;
          case 'context':
            metadata.context = value;
            break;
        }
      }

      return {
        callerId: metadata.callerId || 'Unknown',
        callerName: metadata.callerName || '',
        origDate: metadata.origDate || '',
        origTime: metadata.origTime || '',
        duration: metadata.duration || 0,
        msgId: metadata.msgId || '',
        origMailbox: metadata.origMailbox || '',
        context: metadata.context || 'default',
      };
    } catch (error) {
      logger.error(`Failed to parse metadata file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Queue voicemail for transcription
   */
  private async queueTranscription(voicemail: Voicemail): Promise<void> {
    if (!this.transcriptionService) return;

    try {
      const job = await this.transcriptionService.queueTranscription(
        'voicemail',
        voicemail.id,
        voicemail.filePath,
        { priority: 5 }  // Higher priority for voicemails
      );

      logger.info(`Voicemail ${voicemail.id} queued for transcription: job ${job.id}`);

      // Listen for transcription completion
      this.transcriptionService.once('job:completed', (event) => {
        if (event.sourceType === 'voicemail' && event.sourceId === voicemail.id) {
          this.handleTranscriptionCompleted(voicemail.id, event.transcriptionId, event.text);
        }
      });
    } catch (error) {
      logger.error(`Failed to queue transcription for voicemail ${voicemail.id}:`, error);
    }
  }

  /**
   * Handle transcription completion
   */
  private async handleTranscriptionCompleted(
    voicemailId: string,
    transcriptionId: string,
    text?: string
  ): Promise<void> {
    try {
      await this.voicemailRepo.setTranscriptionId(voicemailId, transcriptionId);

      // Get updated voicemail
      const voicemail = await this.voicemailRepo.findById(voicemailId);
      if (voicemail) {
        this.emit('voicemail:transcribed', { voicemail, transcriptionId, text });
        logger.info(`Voicemail ${voicemailId} transcription completed`);
      }
    } catch (error) {
      logger.error(`Failed to update voicemail transcription ID:`, error);
    }
  }

  /**
   * Manually scan for voicemails
   */
  async scanExisting(): Promise<number> {
    let count = 0;

    for (const context of this.config.contexts) {
      const contextPath = path.join(this.config.voicemailPath, context);
      if (!fs.existsSync(contextPath)) continue;

      const mailboxes = fs.readdirSync(contextPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const mailbox of mailboxes) {
        const inboxPath = path.join(contextPath, mailbox, 'INBOX');
        if (!fs.existsSync(inboxPath)) continue;

        const files = fs.readdirSync(inboxPath)
          .filter(f => f.endsWith('.txt'));

        for (const file of files) {
          const filePath = path.join(inboxPath, file);
          await this.handleNewFile(filePath);
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Create VoicemailWatcher instance
 */
export function createVoicemailWatcher(
  voicemailRepo: VoicemailRepository,
  transcriptionService: TranscriptionService | null,
  config?: VoicemailWatcherConfig
): VoicemailWatcher {
  return new VoicemailWatcher(voicemailRepo, transcriptionService, config);
}
