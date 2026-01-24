import * as dotenv from 'dotenv';
import * as path from 'path';
import { AppConfig } from '../models/types';

// Load environment variables from .env file
dotenv.config();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarOptional(key: string): string | null {
  return process.env[key] || null;
}

function getEnvVarInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }
  return parsed;
}

function getEnvVarIntOptional(key: string): number | null {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return null;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return null;
  }
  return parsed;
}

// Validate and load configuration
function loadConfig(): AppConfig {
  const config: AppConfig = {
    // Asterisk AMI Configuration
    asteriskAmiHost: getEnvVar('ASTERISK_AMI_HOST', '127.0.0.1'),
    asteriskAmiPort: getEnvVarInt('ASTERISK_AMI_PORT', 5038),
    asteriskAmiUser: getEnvVar('ASTERISK_AMI_USER', 'botpbx'),
    asteriskAmiSecret: getEnvVar('ASTERISK_AMI_SECRET'),

    // AGI Server Configuration
    agiServerPort: getEnvVarInt('AGI_SERVER_PORT', 4573),

    // Telegram Configuration (optional - can run without bot)
    telegramBotToken: getEnvVarOptional('TELEGRAM_BOT_TOKEN') || '',
    initialAdminId: getEnvVarIntOptional('INITIAL_ADMIN_ID'),

    // ElevenLabs Configuration (optional - can be set via Telegram)
    elevenLabsApiKey: getEnvVarOptional('ELEVENLABS_API_KEY'),
    elevenLabsDefaultVoice: getEnvVar('ELEVENLABS_DEFAULT_VOICE', '21m00Tcm4TlvDq8ikWAM'),

    // Storage Paths
    audioFilesPath: getEnvVar('AUDIO_FILES_PATH', '/var/lib/asterisk/sounds/botpbx'),
    asteriskConfigPath: getEnvVar('ASTERISK_CONFIG_PATH', '/etc/asterisk'),
  };

  return config;
}

// Resolve paths to absolute
function resolvePaths(config: AppConfig): AppConfig {
  return {
    ...config,
    audioFilesPath: path.resolve(config.audioFilesPath),
  };
}

// Export the configuration
export const config = resolvePaths(loadConfig());

// Export a function to get the current config (useful for runtime updates)
export function getConfig(): AppConfig {
  return config;
}

// Validate configuration at startup
export function validateConfig(): void {
  const errors: string[] = [];

  // Telegram is now optional - warn if not configured
  if (!config.telegramBotToken) {
    console.warn('TELEGRAM_BOT_TOKEN not set - Telegram bot will be disabled');
  }

  if (!config.asteriskAmiSecret) {
    errors.push('ASTERISK_AMI_SECRET is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
