import { DatabaseManager } from '../database';
import { dbLogger } from '../../utils/logger';
import type { TTSProvider } from '../../services/ttsService';

export class SettingsRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Get a setting value by key
   */
  async get(key: string): Promise<string | null> {
    const result = await this.db.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    return result?.value ?? null;
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key, value]
    );
    dbLogger.debug(`Setting updated: ${key}`);
  }

  /**
   * Delete a setting
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM settings WHERE key = $1', [key]);
    return result.rowCount > 0;
  }

  /**
   * Get all settings
   */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  // Convenience methods for common settings

  /**
   * Check if campaign is active
   */
  async isCampaignActive(): Promise<boolean> {
    return (await this.get('campaign_active')) === 'true';
  }

  /**
   * Set campaign active state
   */
  async setCampaignActive(active: boolean): Promise<void> {
    await this.set('campaign_active', active.toString());
  }

  /**
   * Get ElevenLabs API key
   */
  async getElevenLabsApiKey(): Promise<string | null> {
    return this.get('elevenlabs_api_key');
  }

  /**
   * Set ElevenLabs API key
   */
  async setElevenLabsApiKey(apiKey: string): Promise<void> {
    await this.set('elevenlabs_api_key', apiKey);
  }

  /**
   * Get default ElevenLabs voice
   */
  async getDefaultVoice(): Promise<string> {
    return (await this.get('elevenlabs_default_voice')) || '21m00Tcm4TlvDq8ikWAM';
  }

  /**
   * Set default ElevenLabs voice
   */
  async setDefaultVoice(voiceId: string): Promise<void> {
    await this.set('elevenlabs_default_voice', voiceId);
  }

  // =====================
  // TTS Provider Settings
  // =====================

  /**
   * Get TTS provider
   * Defaults to 'piper' since it works locally without API key
   */
  async getTTSProvider(): Promise<'piper' | 'elevenlabs' | 'openai' | 'cartesia' | 'deepgram' | 'playht' | 'google'> {
    const provider = await this.get('tts_provider');
    const validProviders = ['piper', 'elevenlabs', 'openai', 'cartesia', 'deepgram', 'playht', 'google'];
    if (provider && validProviders.includes(provider)) {
      return provider as 'piper' | 'elevenlabs' | 'openai' | 'cartesia' | 'deepgram' | 'playht' | 'google';
    }
    return 'piper';
  }

  /**
   * Set TTS provider
   */
  async setTTSProvider(provider: TTSProvider): Promise<void> {
    await this.set('tts_provider', provider);
  }

  /**
   * Get Piper TTS server URL
   */
  async getPiperUrl(): Promise<string> {
    return (await this.get('piper_url')) || 'http://127.0.0.1:5050';
  }

  /**
   * Set Piper TTS server URL
   */
  async setPiperUrl(url: string): Promise<void> {
    await this.set('piper_url', url);
  }

  /**
   * Get default Piper voice
   */
  async getPiperVoice(): Promise<string> {
    return (await this.get('piper_voice')) || 'en_US-lessac-medium';
  }

  /**
   * Set default Piper voice
   */
  async setPiperVoice(voice: string): Promise<void> {
    await this.set('piper_voice', voice);
  }

  /**
   * Check if a Telegram user is an admin
   */
  async isAdmin(telegramId: number): Promise<boolean> {
    const result = await this.db.get<{ telegram_id: number }>(
      'SELECT telegram_id FROM admin_users WHERE telegram_id = $1',
      [telegramId]
    );
    return result !== undefined && result !== null;
  }

  /**
   * Add an admin user
   */
  async addAdmin(telegramId: number, username?: string, role: 'admin' | 'viewer' = 'admin'): Promise<void> {
    await this.db.run(
      `INSERT INTO admin_users (telegram_id, username, role, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT(telegram_id) DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role`,
      [telegramId, username || null, role]
    );
    dbLogger.info(`Admin added: ${telegramId} (${username || 'no username'})`);
  }

  /**
   * Remove an admin user
   */
  async removeAdmin(telegramId: number): Promise<boolean> {
    const result = await this.db.run('DELETE FROM admin_users WHERE telegram_id = $1', [telegramId]);
    return result.rowCount > 0;
  }

  /**
   * Get all admin users
   */
  async getAllAdmins(): Promise<Array<{ telegramId: number; username: string | null; role: string }>> {
    const rows = await this.db.all<{ telegram_id: number; username: string | null; role: string }>(
      'SELECT telegram_id, username, role FROM admin_users ORDER BY created_at'
    );
    return rows.map((row) => ({
      telegramId: row.telegram_id,
      username: row.username,
      role: row.role,
    }));
  }

  /**
   * Count admin users
   */
  async getAdminCount(): Promise<number> {
    const result = await this.db.get<{ count: string }>('SELECT COUNT(*) as count FROM admin_users');
    return result ? parseInt(result.count, 10) : 0;
  }
}
