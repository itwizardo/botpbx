import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { AudioConversionResult, ServiceResult } from '../models/types';

const execAsync = promisify(exec);

export class AudioService {
  private audioPath: string;

  constructor(audioPath: string) {
    this.audioPath = audioPath;

    // Ensure directories exist
    const dirs = [
      this.audioPath,
      path.join(this.audioPath, 'prompts'),
      path.join(this.audioPath, 'uploads'),
      path.join(this.audioPath, 'system'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created audio directory: ${dir}`);
      }
    }
  }

  /**
   * Check if ffmpeg is available
   */
  async checkFFmpeg(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch {
      logger.error('ffmpeg not found. Please install ffmpeg for audio conversion.');
      return false;
    }
  }

  /**
   * Convert audio to Asterisk-compatible format
   * Creates WAV (8kHz), SLN (8kHz raw), and SLN16 (16kHz raw) using SoX high-quality resampler
   */
  async convertToAsteriskFormat(inputPath: string): Promise<ServiceResult<AudioConversionResult>> {
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    const baseName = path.basename(inputPath, path.extname(inputPath));
    const inputExt = path.extname(inputPath).toLowerCase();
    const outputDir = path.dirname(inputPath);

    const wavPath = path.join(outputDir, `${baseName}.wav`);
    const slnPath = path.join(outputDir, `${baseName}.sln`);
    const sln16Path = path.join(outputDir, `${baseName}.sln16`);

    try {
      // If input is already WAV, we need to use a temp file to avoid read/write conflict
      let sourceForConversion = inputPath;

      if (inputExt === '.wav') {
        // Check if already 8kHz - if so, we can skip WAV conversion
        try {
          const { stdout } = await execAsync(
            `ffprobe -v quiet -show_entries stream=sample_rate,channels -of csv=p=0 "${inputPath}"`
          );
          const [sampleRate, channels] = stdout.trim().split(',');

          if (sampleRate === '8000' && channels === '1') {
            // Already in correct format, just create SLN and SLN16
            logger.info(`WAV already in Asterisk format (8kHz mono): ${inputPath}`);

            // Create SLN from the existing WAV
            await execAsync(
              `ffmpeg -i "${inputPath}" -f s16le -y "${slnPath}" 2>/dev/null`
            );
            logger.info(`Created SLN: ${slnPath}`);

            // Create SLN16 (upsample 8kHz to 16kHz with SoX resampler)
            await execAsync(
              `ffmpeg -i "${inputPath}" -af aresample=resampler=soxr -ar 16000 -ac 1 -f s16le -y "${sln16Path}" 2>/dev/null`
            );
            logger.info(`Created SLN16: ${sln16Path}`);

            return {
              success: true,
              data: {
                originalPath: inputPath,
                wavPath,
                slnPath,
                asteriskPath: path.join(outputDir, baseName),
              },
            };
          }
        } catch {
          // ffprobe failed, proceed with conversion
        }

        // Need to convert - use temp file
        const tempPath = path.join(outputDir, `${baseName}_temp.wav`);
        fs.copyFileSync(inputPath, tempPath);
        sourceForConversion = tempPath;
      }

      // Convert to WAV (8kHz, 16-bit, mono, PCM) using SoX high-quality resampler
      await execAsync(
        `ffmpeg -i "${sourceForConversion}" -af aresample=resampler=soxr -ar 8000 -ac 1 -acodec pcm_s16le -y "${wavPath}" 2>/dev/null`
      );
      logger.info(`Converted to WAV (8kHz soxr): ${wavPath}`);

      // Convert to SLN (raw signed linear, 8kHz, 16-bit, mono)
      await execAsync(
        `ffmpeg -i "${wavPath}" -f s16le -y "${slnPath}" 2>/dev/null`
      );
      logger.info(`Converted to SLN: ${slnPath}`);

      // Convert to SLN16 (raw signed linear, 16kHz, 16-bit, mono) for wideband channels
      await execAsync(
        `ffmpeg -i "${sourceForConversion}" -af aresample=resampler=soxr -ar 16000 -ac 1 -f s16le -y "${sln16Path}" 2>/dev/null`
      );
      logger.info(`Converted to SLN16 (16kHz soxr): ${sln16Path}`);

      // Clean up temp file if we created one
      if (sourceForConversion !== inputPath && fs.existsSync(sourceForConversion)) {
        fs.unlinkSync(sourceForConversion);
      }

      return {
        success: true,
        data: {
          originalPath: inputPath,
          wavPath,
          slnPath,
          asteriskPath: path.join(outputDir, baseName),
        },
      };
    } catch (error) {
      logger.error(`Audio conversion failed: ${(error as Error).message}`);
      return { success: false, error: `Conversion failed: ${(error as Error).message}` };
    }
  }

  /**
   * Save uploaded audio buffer to disk and convert
   */
  async saveUploadedAudio(
    buffer: Buffer,
    originalFilename: string,
    promptId: string
  ): Promise<ServiceResult<AudioConversionResult>> {
    const uploadsDir = path.join(this.audioPath, 'uploads');
    const ext = path.extname(originalFilename) || '.mp3';
    const originalPath = path.join(uploadsDir, `${promptId}${ext}`);

    try {
      // Save original file
      fs.writeFileSync(originalPath, buffer);
      logger.info(`Saved uploaded audio: ${originalPath}`);

      // Convert to Asterisk format
      return await this.convertToAsteriskFormat(originalPath);
    } catch (error) {
      logger.error(`Failed to save uploaded audio: ${(error as Error).message}`);
      return { success: false, error: `Failed to save audio: ${(error as Error).message}` };
    }
  }

  /**
   * Download file from URL and save
   */
  async downloadAndSave(url: string, promptId: string): Promise<ServiceResult<string>> {
    const uploadsDir = path.join(this.audioPath, 'uploads');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `Failed to download: ${response.status}` };
      }

      const contentType = response.headers.get('content-type') || '';
      let ext = '.mp3';
      if (contentType.includes('ogg')) ext = '.ogg';
      else if (contentType.includes('wav')) ext = '.wav';
      else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = '.m4a';

      const filePath = path.join(uploadsDir, `${promptId}${ext}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      logger.info(`Downloaded audio to: ${filePath}`);
      return { success: true, data: filePath };
    } catch (error) {
      logger.error(`Failed to download audio: ${(error as Error).message}`);
      return { success: false, error: `Download failed: ${(error as Error).message}` };
    }
  }

  /**
   * Get the Asterisk-compatible path for a prompt (without extension)
   */
  getAsteriskPath(promptId: string, subdir: 'prompts' | 'uploads' | 'system' = 'prompts'): string {
    return path.join(this.audioPath, subdir, promptId);
  }

  /**
   * Get the full path to a specific audio format
   */
  getFilePath(
    promptId: string,
    format: 'wav' | 'sln' | 'mp3',
    subdir: 'prompts' | 'uploads' | 'system' = 'prompts'
  ): string {
    return path.join(this.audioPath, subdir, `${promptId}.${format}`);
  }

  /**
   * Check if audio files exist for a prompt
   */
  audioExists(promptId: string, subdir: 'prompts' | 'uploads' | 'system' = 'prompts'): boolean {
    const wavPath = this.getFilePath(promptId, 'wav', subdir);
    const mp3Path = this.getFilePath(promptId, 'mp3', subdir);
    return fs.existsSync(wavPath) || fs.existsSync(mp3Path);
  }

  /**
   * Delete all audio files for a prompt
   */
  deleteAudio(promptId: string, subdir: 'prompts' | 'uploads' | 'system' = 'prompts'): boolean {
    const formats = ['mp3', 'wav', 'sln', 'sln16', 'raw', 'ogg', 'm4a'];
    let deleted = false;

    for (const format of formats) {
      const filePath = path.join(this.audioPath, subdir, `${promptId}.${format}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
        logger.info(`Deleted audio file: ${filePath}`);
      }
    }

    return deleted;
  }

  /**
   * Get audio file info
   */
  getAudioInfo(filePath: string): { exists: boolean; size: number; format: string } | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    const format = path.extname(filePath).slice(1);

    return {
      exists: true,
      size: stats.size,
      format,
    };
  }

  /**
   * List all audio files in a directory
   */
  listAudioFiles(subdir: 'prompts' | 'uploads' | 'system' = 'prompts'): string[] {
    const dir = path.join(this.audioPath, subdir);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir);
    const audioExtensions = ['.mp3', '.wav', '.sln', '.ogg', '.m4a'];

    return files.filter((f) => audioExtensions.includes(path.extname(f).toLowerCase()));
  }

  /**
   * Copy system sounds to audio directory
   */
  async installSystemSounds(): Promise<void> {
    const systemDir = path.join(this.audioPath, 'system');

    // These would typically come from bundled assets
    // For now, we just ensure the directory exists
    logger.info(`System sounds directory: ${systemDir}`);
  }

  /**
   * Get audio duration using ffprobe
   */
  async getAudioDuration(filePath: string): Promise<number | null> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
      );
      const duration = parseFloat(stdout.trim());
      return isNaN(duration) ? null : duration;
    } catch {
      return null;
    }
  }
}
