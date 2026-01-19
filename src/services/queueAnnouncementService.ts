import { TTSService } from './ttsService';
import { QueueRepository, Queue, PositionAnnounceConfig } from '../db/repositories/queueRepository';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const logger = createLogger('QueueAnnouncement');

interface AnnouncementResult {
  audioPath: string;
  text: string;
  cached: boolean;
  position: number;
  estimatedWaitMinutes?: number;
}

interface QueueStats {
  availableAgents: number;
  avgHandleTimeSeconds: number;
}

// Default announcement templates
const DEFAULT_VARIATIONS: PositionAnnounceConfig = {
  ranges: [
    { min: 1, max: 1, template: "Great news! You're next in line. An agent will be with you momentarily." },
    { min: 2, max: 3, template: "You're almost there! You're number {position} in the queue. Estimated wait: {waitTime}." },
    { min: 4, max: 10, template: "Thank you for your patience. You're currently number {position}. Your estimated wait time is {waitTime}." },
    { min: 11, max: null, template: "We appreciate you holding. You're number {position} in our queue. Estimated wait is approximately {waitTime}. We'll be with you as soon as possible." }
  ],
  includeWaitTime: true,
  waitTimeFormat: "about {minutes} minutes"
};

export class QueueAnnouncementService {
  private ttsService: TTSService;
  private queueRepository: QueueRepository;
  private cacheDir: string;
  private cacheMaxAgeMs: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(ttsService: TTSService, queueRepository: QueueRepository) {
    this.ttsService = ttsService;
    this.queueRepository = queueRepository;
    this.cacheDir = path.join(process.cwd(), 'data', 'cache', 'queue-announcements');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.info(`Created queue announcement cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Generate a position announcement for a caller in a queue
   */
  async generateAnnouncement(
    queueId: string,
    position: number,
    stats?: QueueStats
  ): Promise<AnnouncementResult | null> {
    const queue = await this.queueRepository.findById(queueId);
    if (!queue) {
      logger.error(`Queue not found: ${queueId}`);
      return null;
    }

    if (!queue.positionAnnounceEnabled) {
      logger.debug(`Position announcements not enabled for queue: ${queue.name}`);
      return null;
    }

    // Calculate estimated wait time
    const estimatedWaitMinutes = stats
      ? this.calculateWaitTime(position, stats)
      : undefined;

    // Get the appropriate template for this position
    const text = this.generateAnnouncementText(queue, position, estimatedWaitMinutes);

    // Generate cache key
    const cacheKey = this.generateCacheKey(queueId, position, queue.positionAnnounceLanguage, text);
    const cachedPath = this.getCachedAudio(cacheKey);

    if (cachedPath) {
      logger.debug(`Using cached announcement for queue ${queue.name}, position ${position}`);
      return {
        audioPath: cachedPath,
        text,
        cached: true,
        position,
        estimatedWaitMinutes
      };
    }

    // Generate new TTS audio
    try {
      const audioPath = await this.generateTTSAudio(queue, text, cacheKey);

      logger.info(`Generated position announcement for queue ${queue.name}, position ${position}`);

      return {
        audioPath,
        text,
        cached: false,
        position,
        estimatedWaitMinutes
      };
    } catch (error) {
      logger.error(`Failed to generate announcement for queue ${queue.name}:`, error);
      return null;
    }
  }

  /**
   * Generate announcement text from template
   */
  private generateAnnouncementText(
    queue: Queue,
    position: number,
    estimatedWaitMinutes?: number
  ): string {
    const config = queue.positionAnnounceVariations || DEFAULT_VARIATIONS;

    // Find the appropriate template for this position
    let template = config.ranges[config.ranges.length - 1].template; // Default to last (highest) range

    for (const range of config.ranges) {
      if (position >= range.min && (range.max === null || position <= range.max)) {
        template = range.template;
        break;
      }
    }

    // Format wait time
    let waitTimeStr = '';
    if (config.includeWaitTime && estimatedWaitMinutes !== undefined) {
      waitTimeStr = config.waitTimeFormat.replace('{minutes}', String(estimatedWaitMinutes));
    } else if (config.includeWaitTime) {
      waitTimeStr = 'a few minutes';
    }

    // Replace placeholders
    let text = template
      .replace(/{position}/g, String(position))
      .replace(/{waitTime}/g, waitTimeStr)
      .replace(/{queueName}/g, queue.name);

    return text;
  }

  /**
   * Calculate estimated wait time based on position and queue stats
   */
  private calculateWaitTime(position: number, stats: QueueStats): number {
    if (stats.availableAgents <= 0) {
      // No agents available, estimate based on average handle time alone
      return Math.ceil((position * stats.avgHandleTimeSeconds) / 60);
    }

    // Calculate wait time considering available agents
    const estimatedSeconds = (position / stats.availableAgents) * stats.avgHandleTimeSeconds;
    const minutes = Math.ceil(estimatedSeconds / 60);

    // Cap at reasonable maximum
    return Math.min(minutes, 60);
  }

  /**
   * Generate TTS audio for the announcement
   */
  private async generateTTSAudio(queue: Queue, text: string, cacheKey: string): Promise<string> {
    // Use TTS service to generate audio
    const provider = queue.positionAnnounceProvider || 'elevenlabs';
    const voice = queue.positionAnnounceVoice;
    const language = queue.positionAnnounceLanguage || 'en';

    // Generate TTS
    const result = await this.ttsService.generateAudio(text, `queue-announce-${cacheKey}`, {
      voice: voice || undefined,
      language
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'TTS generation failed - no file path returned');
    }

    // Copy to cache location
    const cachePath = path.join(this.cacheDir, `${cacheKey}.wav`);

    // The TTS service returns a path in result.data, we need to copy it to our cache
    const ttsFilePath = result.data;
    if (fs.existsSync(ttsFilePath)) {
      fs.copyFileSync(ttsFilePath, cachePath);
    }

    return cachePath;
  }

  /**
   * Generate a cache key for an announcement
   */
  private generateCacheKey(
    queueId: string,
    position: number,
    language: string,
    text: string
  ): string {
    const textHash = crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
    return `${queueId}-pos${position}-${language}-${textHash}`;
  }

  /**
   * Get cached audio if it exists and is still valid
   */
  private getCachedAudio(cacheKey: string): string | null {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.wav`);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    // Check if cache is still valid
    const stats = fs.statSync(cachePath);
    const age = Date.now() - stats.mtimeMs;

    if (age > this.cacheMaxAgeMs) {
      // Cache expired, delete it
      fs.unlinkSync(cachePath);
      return null;
    }

    return cachePath;
  }

  /**
   * Pre-warm cache for a queue by generating common position announcements
   */
  async prewarmCache(queueId: string, maxPosition: number = 20): Promise<void> {
    const queue = await this.queueRepository.findById(queueId);
    if (!queue || !queue.positionAnnounceEnabled) {
      return;
    }

    logger.info(`Pre-warming announcement cache for queue ${queue.name} (positions 1-${maxPosition})`);

    // Generate announcements for positions 1 through maxPosition
    for (let position = 1; position <= maxPosition; position++) {
      try {
        // Use a default wait time estimate for pre-warming
        const estimatedWaitMinutes = Math.ceil(position * 2); // ~2 min per position
        await this.generateAnnouncement(queueId, position, {
          availableAgents: 2,
          avgHandleTimeSeconds: 180
        });
      } catch (error) {
        logger.warn(`Failed to pre-warm position ${position} for queue ${queue.name}:`, error);
      }
    }

    logger.info(`Cache pre-warm complete for queue ${queue.name}`);
  }

  /**
   * Clear cache for a specific queue (call when queue config changes)
   */
  clearQueueCache(queueId: string): void {
    const files = fs.readdirSync(this.cacheDir);
    let cleared = 0;

    for (const file of files) {
      if (file.startsWith(`${queueId}-`)) {
        fs.unlinkSync(path.join(this.cacheDir, file));
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info(`Cleared ${cleared} cached announcements for queue ${queueId}`);
    }
  }

  /**
   * Clear all expired cache entries
   */
  cleanExpiredCache(): void {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = fs.statSync(filePath);
      const age = Date.now() - stats.mtimeMs;

      if (age > this.cacheMaxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Get queue statistics for wait time calculation
   * This could be expanded to pull real data from Asterisk queue stats
   */
  async getQueueStats(queueId: string): Promise<QueueStats> {
    const queue = await this.queueRepository.findById(queueId);
    if (!queue) {
      return { availableAgents: 1, avgHandleTimeSeconds: 180 };
    }

    // Get member count as a proxy for available agents
    const members = queue.members || [];
    const availableAgents = members.filter(m => !m.paused).length || 1;

    // Default average handle time (3 minutes)
    // TODO: Calculate from actual call data in call_logs table
    const avgHandleTimeSeconds = 180;

    return {
      availableAgents,
      avgHandleTimeSeconds
    };
  }
}
