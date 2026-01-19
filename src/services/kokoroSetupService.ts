/**
 * Kokoro TTS Setup Service
 * Handles automatic setup of Kokoro TTS infrastructure when users install a Kokoro voice.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = createLogger('KokoroSetup');

export interface SetupResult {
  success: boolean;
  error?: string;
  details?: string;
}

export class KokoroSetupService {
  private readonly venvPath = '/opt/botpbx/kokoro-venv';
  private readonly scriptPath = '/opt/botpbx/scripts/kokoro-tts-server.py';
  private readonly serverUrl = 'http://127.0.0.1:5003';
  private readonly pm2ProcessName = 'kokoro-tts';

  /**
   * Check if Kokoro server is running and healthy
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.serverUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { status: string };
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Ensure Kokoro TTS is set up and running
   * This is the main entry point - call this before installing Kokoro voices
   */
  async ensureSetup(): Promise<SetupResult> {
    logger.info('Checking Kokoro TTS setup...');

    // First check if already running
    if (await this.isServerRunning()) {
      logger.info('Kokoro TTS server is already running');
      return { success: true, details: 'Server already running' };
    }

    // Check if PM2 process exists but not responding
    const pm2Status = await this.checkPM2Process();
    if (pm2Status === 'online') {
      // Process exists but not responding - restart it
      logger.info('Kokoro TTS PM2 process exists but not responding, restarting...');
      await this.restartPM2Process();
      const running = await this.waitForServer(30000);
      if (running) {
        return { success: true, details: 'Server restarted' };
      }
      return { success: false, error: 'Server failed to respond after restart' };
    }

    // Need to set up from scratch
    try {
      // Step 1: Check if Python venv exists
      if (!await this.venvExists()) {
        logger.info('Creating Python virtual environment...');
        await this.createVenv();
      }

      // Step 2: Check if packages are installed
      if (!await this.packagesInstalled()) {
        logger.info('Installing Kokoro packages...');
        await this.installPackages();
      }

      // Step 3: Verify server script exists
      if (!fs.existsSync(this.scriptPath)) {
        return {
          success: false,
          error: `Server script not found at ${this.scriptPath}`
        };
      }

      // Step 4: Start PM2 process
      logger.info('Starting Kokoro TTS server...');
      await this.startPM2Process();

      // Step 5: Wait for server to be ready (may take a while for model download)
      logger.info('Waiting for Kokoro TTS server to be ready (model may need to download)...');
      const ready = await this.waitForServer(120000); // 2 minutes for model download

      if (ready) {
        logger.info('Kokoro TTS setup complete');
        return { success: true, details: 'Setup complete, server running' };
      } else {
        return {
          success: false,
          error: 'Server started but not responding. Check logs with: pm2 logs kokoro-tts'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Kokoro TTS setup failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if venv exists
   */
  private async venvExists(): Promise<boolean> {
    const pythonPath = path.join(this.venvPath, 'bin', 'python');
    return fs.existsSync(pythonPath);
  }

  /**
   * Create Python virtual environment
   */
  private async createVenv(): Promise<void> {
    // Ensure parent directory exists
    const parentDir = path.dirname(this.venvPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Create venv
    const { stderr } = await execAsync(`python3 -m venv ${this.venvPath}`);
    if (stderr && stderr.includes('Error')) {
      throw new Error(`Failed to create venv: ${stderr}`);
    }

    logger.info('Python virtual environment created');
  }

  /**
   * Check if required packages are installed
   */
  private async packagesInstalled(): Promise<boolean> {
    const pipPath = path.join(this.venvPath, 'bin', 'pip');
    if (!fs.existsSync(pipPath)) {
      return false;
    }

    try {
      const { stdout } = await execAsync(`${pipPath} show kokoro-onnx soundfile 2>/dev/null`);
      return stdout.includes('Name: kokoro-onnx') && stdout.includes('Name: soundfile');
    } catch {
      return false;
    }
  }

  /**
   * Install required Python packages
   */
  private async installPackages(): Promise<void> {
    const pipPath = path.join(this.venvPath, 'bin', 'pip');

    // Upgrade pip first
    await execAsync(`${pipPath} install --upgrade pip`);

    // Install packages
    const { stderr } = await execAsync(`${pipPath} install kokoro-onnx soundfile`, {
      timeout: 300000, // 5 minutes timeout for package installation
    });

    if (stderr && stderr.includes('ERROR')) {
      throw new Error(`Failed to install packages: ${stderr}`);
    }

    logger.info('Kokoro packages installed');
  }

  /**
   * Check PM2 process status
   */
  private async checkPM2Process(): Promise<'online' | 'stopped' | 'errored' | 'not_found'> {
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      const kokoroProcess = processes.find((p: { name: string }) => p.name === this.pm2ProcessName);

      if (!kokoroProcess) {
        return 'not_found';
      }

      return kokoroProcess.pm2_env?.status || 'not_found';
    } catch {
      return 'not_found';
    }
  }

  /**
   * Start Kokoro TTS as PM2 process
   */
  private async startPM2Process(): Promise<void> {
    const pythonPath = path.join(this.venvPath, 'bin', 'python');

    // Delete existing process if any
    try {
      await execAsync(`pm2 delete ${this.pm2ProcessName} 2>/dev/null`);
    } catch {
      // Ignore error if process doesn't exist
    }

    // Start new process
    const { stderr } = await execAsync(
      `pm2 start ${this.scriptPath} --name ${this.pm2ProcessName} --interpreter ${pythonPath}`
    );

    if (stderr && stderr.includes('Error')) {
      throw new Error(`Failed to start PM2 process: ${stderr}`);
    }

    // Save PM2 process list
    await execAsync('pm2 save');

    logger.info('Kokoro TTS PM2 process started');
  }

  /**
   * Restart existing PM2 process
   */
  private async restartPM2Process(): Promise<void> {
    await execAsync(`pm2 restart ${this.pm2ProcessName}`);
    logger.info('Kokoro TTS PM2 process restarted');
  }

  /**
   * Wait for server to become available
   */
  private async waitForServer(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isServerRunning()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * Get current server status for API response
   */
  async getStatus(): Promise<{
    installed: boolean;
    serverRunning: boolean;
    venvExists: boolean;
    packagesInstalled: boolean;
  }> {
    const venvExists = await this.venvExists();
    const packagesInstalled = venvExists ? await this.packagesInstalled() : false;
    const serverRunning = await this.isServerRunning();

    return {
      installed: venvExists && packagesInstalled,
      serverRunning,
      venvExists,
      packagesInstalled,
    };
  }
}

// Export singleton instance
export const kokoroSetupService = new KokoroSetupService();
