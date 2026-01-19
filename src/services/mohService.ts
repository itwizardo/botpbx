import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { AMIClient } from '../asterisk/amiClient';

const mohLogger = createLogger('MOH');

// MOH directory base path
const MOH_BASE_PATH = process.env.MOH_PATH || '/var/lib/asterisk/moh';
const MOH_CONFIG_PATH = process.env.MOH_CONFIG_PATH || '/etc/asterisk/musiconhold_custom.conf';

export class MohService {
  private amiClient: AMIClient;

  constructor(amiClient: AMIClient) {
    this.amiClient = amiClient;
    this.ensureBaseDirectory();
    this.ensureConfigIncluded();
  }

  /**
   * Ensure base MOH directory exists
   */
  private ensureBaseDirectory(): void {
    if (!fs.existsSync(MOH_BASE_PATH)) {
      fs.mkdirSync(MOH_BASE_PATH, { recursive: true });
    }
  }

  /**
   * Ensure our custom config is included in musiconhold.conf
   */
  private ensureConfigIncluded(): void {
    const configPath = process.env.ASTERISK_CONFIG_PATH || '/etc/asterisk';
    const mainConfigPath = path.join(configPath, 'musiconhold.conf');
    const includeLine = '#include "musiconhold_custom.conf"';

    try {
      if (fs.existsSync(mainConfigPath)) {
        const content = fs.readFileSync(mainConfigPath, 'utf-8');
        if (!content.includes('musiconhold_custom.conf')) {
          fs.appendFileSync(mainConfigPath, `\n${includeLine}\n`);
          mohLogger.info('Added custom config include to musiconhold.conf');
        }
      }

      // Create custom config file if it doesn't exist
      if (!fs.existsSync(MOH_CONFIG_PATH)) {
        fs.writeFileSync(MOH_CONFIG_PATH, '; Custom MOH classes for BotPBX campaigns\n\n');
        mohLogger.info('Created musiconhold_custom.conf');
      }
    } catch (error) {
      mohLogger.error('Failed to setup MOH config:', error);
    }
  }

  /**
   * Setup hold music for a campaign
   * @param campaignId The campaign ID
   * @param audioFilePath Path to the audio file (prompt file)
   */
  async setupCampaignMoh(campaignId: string, audioFilePath: string): Promise<boolean> {
    try {
      const mohClass = `campaign-${campaignId}`;
      const mohDir = path.join(MOH_BASE_PATH, mohClass);

      // Create campaign MOH directory
      if (!fs.existsSync(mohDir)) {
        fs.mkdirSync(mohDir, { recursive: true });
      }

      // Clear existing files in directory
      const existingFiles = fs.readdirSync(mohDir);
      for (const file of existingFiles) {
        fs.unlinkSync(path.join(mohDir, file));
      }

      // Copy audio file to MOH directory
      // We need the file without extension for Asterisk, but copy with extension
      const fileName = path.basename(audioFilePath);
      const destPath = path.join(mohDir, fileName);

      // Check for both .sln and .wav versions
      const slnPath = audioFilePath.replace(/\.[^.]+$/, '.sln');
      const wavPath = audioFilePath.replace(/\.[^.]+$/, '.wav');
      const slnPath16 = audioFilePath.replace(/\.[^.]+$/, '.sln16');

      // Copy all available formats
      if (fs.existsSync(slnPath16)) {
        fs.copyFileSync(slnPath16, path.join(mohDir, 'holdmusic.sln16'));
        mohLogger.debug(`Copied sln16 file to ${mohDir}`);
      }
      if (fs.existsSync(slnPath)) {
        fs.copyFileSync(slnPath, path.join(mohDir, 'holdmusic.sln'));
        mohLogger.debug(`Copied sln file to ${mohDir}`);
      }
      if (fs.existsSync(wavPath)) {
        fs.copyFileSync(wavPath, path.join(mohDir, 'holdmusic.wav'));
        mohLogger.debug(`Copied wav file to ${mohDir}`);
      }

      // Set proper ownership
      try {
        const { execSync } = require('child_process');
        execSync(`chown -R asterisk:asterisk ${mohDir}`);
      } catch {
        mohLogger.warn('Could not set ownership on MOH directory');
      }

      // Update MOH config
      await this.updateMohConfig(campaignId);

      mohLogger.info(`MOH setup complete for campaign ${campaignId}`);
      return true;
    } catch (error) {
      mohLogger.error(`Failed to setup MOH for campaign ${campaignId}:`, error);
      return false;
    }
  }

  /**
   * Update the MOH config file with campaign entry
   */
  private async updateMohConfig(campaignId: string): Promise<void> {
    const mohClass = `campaign-${campaignId}`;
    const mohDir = path.join(MOH_BASE_PATH, mohClass);

    // Read existing config
    let config = '';
    if (fs.existsSync(MOH_CONFIG_PATH)) {
      config = fs.readFileSync(MOH_CONFIG_PATH, 'utf-8');
    }

    // Check if class already exists
    const classRegex = new RegExp(`\\[${mohClass}\\]`, 'g');
    if (!classRegex.test(config)) {
      // Add new class
      const newClass = `
[${mohClass}]
mode=files
directory=${mohDir}
sort=alpha
`;
      config += newClass;
      fs.writeFileSync(MOH_CONFIG_PATH, config);
      mohLogger.info(`Added MOH class ${mohClass} to config`);
    }

    // Reload MOH module
    await this.reloadMoh();
  }

  /**
   * Remove MOH setup for a campaign
   */
  async removeCampaignMoh(campaignId: string): Promise<void> {
    try {
      const mohClass = `campaign-${campaignId}`;
      const mohDir = path.join(MOH_BASE_PATH, mohClass);

      // Remove directory
      if (fs.existsSync(mohDir)) {
        fs.rmSync(mohDir, { recursive: true });
        mohLogger.info(`Removed MOH directory for campaign ${campaignId}`);
      }

      // Remove from config
      if (fs.existsSync(MOH_CONFIG_PATH)) {
        let config = fs.readFileSync(MOH_CONFIG_PATH, 'utf-8');

        // Remove the class section
        const classRegex = new RegExp(`\\[${mohClass}\\][\\s\\S]*?(?=\\[|$)`, 'g');
        config = config.replace(classRegex, '');

        fs.writeFileSync(MOH_CONFIG_PATH, config);
        mohLogger.info(`Removed MOH class ${mohClass} from config`);
      }

      await this.reloadMoh();
    } catch (error) {
      mohLogger.error(`Failed to remove MOH for campaign ${campaignId}:`, error);
    }
  }

  /**
   * Reload Asterisk MOH module
   */
  private async reloadMoh(): Promise<void> {
    try {
      await this.amiClient.action('Command', {
        Command: 'moh reload',
      });
      mohLogger.info('Reloaded MOH module');
    } catch (error) {
      mohLogger.error('Failed to reload MOH:', error);
    }
  }

  /**
   * Get the MOH class name for a campaign
   */
  getMohClass(campaignId: string): string {
    return `campaign-${campaignId}`;
  }

  /**
   * Check if campaign has MOH configured
   */
  hasMohConfigured(campaignId: string): boolean {
    const mohDir = path.join(MOH_BASE_PATH, `campaign-${campaignId}`);
    if (!fs.existsSync(mohDir)) return false;

    const files = fs.readdirSync(mohDir);
    return files.length > 0;
  }
}
