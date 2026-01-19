import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { ApiContext } from '../server';
import { apiLogger } from '../../utils/logger';

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);

const GITHUB_REPO = 'itwizardo/botpbx';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export function registerSystemRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // System status
  server.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    // Check Asterisk status and version
    let asteriskStatus = 'unknown';
    let asteriskVersion = 'unknown';
    try {
      const { stdout } = await execAsync('asterisk -rx "core show version" 2>/dev/null || echo "not running"');
      if (stdout.includes('not running')) {
        asteriskStatus = 'offline';
      } else {
        asteriskStatus = 'online';
        // Parse version from output like "Asterisk 20.5.0 built by ..."
        const versionMatch = stdout.match(/Asterisk\s+(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          asteriskVersion = versionMatch[1];
        }
      }
    } catch {
      asteriskStatus = 'offline';
    }

    // Check AMI connection
    const amiStatus = ctx.amiClient ? 'connected' : 'disconnected';

    // Database info
    const dbType = 'PostgreSQL';
    let dbStatus = 'disconnected';
    try {
      // Quick health check
      await ctx.settingsRepo.get('tts_provider');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: 'ok',
      uptime,
      uptimeHuman: formatUptime(uptime),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        loadAvg: os.loadavg(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      },
      services: {
        asterisk: asteriskStatus,
        asteriskVersion,
        ami: amiStatus,
        database: dbStatus,
        databaseType: dbType,
        websocket: ctx.wsManager.getConnectedCount() + ' clients',
      },
    };
  });

  // Reload Asterisk PJSIP
  server.post('/reload/pjsip', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    try {
      const { stdout, stderr } = await execAsync('asterisk -rx "pjsip reload"');
      apiLogger.info('PJSIP reloaded');

      return {
        success: true,
        message: 'PJSIP configuration reloaded',
        output: stdout.trim(),
      };
    } catch (error) {
      apiLogger.error('Failed to reload PJSIP:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to reload PJSIP',
      });
    }
  });

  // Reload Asterisk dialplan
  server.post('/reload/dialplan', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    try {
      const { stdout } = await execAsync('asterisk -rx "dialplan reload"');
      apiLogger.info('Dialplan reloaded');

      return {
        success: true,
        message: 'Dialplan reloaded',
        output: stdout.trim(),
      };
    } catch (error) {
      apiLogger.error('Failed to reload dialplan:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to reload dialplan',
      });
    }
  });

  // Show SIP registrations
  server.get('/sip/registrations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { stdout } = await execAsync('asterisk -rx "pjsip show registrations"');

      // Parse the output
      const lines = stdout.trim().split('\n');
      const registrations: any[] = [];

      for (const line of lines) {
        if (line.includes('<sip:')) {
          // Parse registration line
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            registrations.push({
              endpoint: parts[0],
              uri: parts[1],
              status: parts[2] || 'unknown',
            });
          }
        }
      }

      return {
        registrations,
        raw: stdout.trim(),
      };
    } catch (error) {
      apiLogger.error('Failed to get SIP registrations:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to get SIP registrations',
      });
    }
  });

  // Show active channels
  server.get('/channels', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { stdout } = await execAsync('asterisk -rx "core show channels concise"');

      const lines = stdout.trim().split('\n').filter((l) => l.trim());
      const channels: any[] = [];

      for (const line of lines) {
        const parts = line.split('!');
        if (parts.length >= 10) {
          channels.push({
            channel: parts[0],
            context: parts[1],
            extension: parts[2],
            priority: parts[3],
            state: parts[4],
            application: parts[5],
            data: parts[6],
            callerid: parts[7],
            duration: parts[11] || '0',
            bridgedTo: parts[12] || '',
          });
        }
      }

      return {
        channels,
        count: channels.length,
      };
    } catch (error) {
      apiLogger.error('Failed to get channels:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to get active channels',
      });
    }
  });

  // Hangup a channel (admin/supervisor only)
  server.post('/channels/:channel/hangup', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const { channel } = request.params as { channel: string };

    try {
      const { stdout } = await execAsync(`asterisk -rx "channel request hangup ${channel}"`);
      apiLogger.info(`Channel ${channel} hangup requested`);

      return {
        success: true,
        message: `Hangup requested for channel ${channel}`,
      };
    } catch (error) {
      apiLogger.error(`Failed to hangup channel ${channel}:`, error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to hangup channel',
      });
    }
  });

  // Connected WebSocket users
  server.get('/ws/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const users = ctx.wsManager.getConnectedUsers();
    return {
      users,
      count: users.length,
    };
  });

  // Check for available updates
  server.get('/updates/check', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get current version from package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await readFileAsync(packageJsonPath, 'utf8'));
      const currentVersion = packageJson.version;

      // Fetch latest release from GitHub
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'BotPBX-Update-Checker'
        }
      });

      if (!response.ok) {
        // No releases yet or API error - check for new commits instead
        if (response.status === 404) {
          return {
            currentVersion,
            latestVersion: currentVersion,
            hasUpdate: false,
            releaseUrl: `https://github.com/${GITHUB_REPO}`,
            releaseNotes: null,
            publishedAt: null,
          };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const release = await response.json();
      const latestVersion = release.tag_name?.replace(/^v/, '') || currentVersion;
      const hasUpdate = latestVersion !== currentVersion && compareVersions(latestVersion, currentVersion) > 0;

      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
        releaseNotes: release.body || null,
        publishedAt: release.published_at || null,
      };
    } catch (error) {
      apiLogger.error('Failed to check for updates:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to check for updates',
      });
    }
  });

  // Trigger update (admin only)
  server.post('/updates/trigger', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    try {
      const updateScript = '/opt/botpbx/scripts/botpbx-update.sh';

      // Check if update script exists
      if (!fs.existsSync(updateScript)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Update script not found. Manual update may be required.',
        });
      }

      // Spawn update script in background (don't wait for completion)
      const updateProcess = spawn('sudo', [updateScript], {
        detached: true,
        stdio: 'ignore',
      });
      updateProcess.unref();

      apiLogger.info('Update triggered by user:', request.user?.username);

      return {
        success: true,
        message: 'Update process started. The service will restart automatically.',
      };
    } catch (error) {
      apiLogger.error('Failed to trigger update:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to trigger update',
      });
    }
  });

  // Get auto-update setting
  server.get('/updates/auto-update', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const setting = await ctx.settingsRepo.get('auto_update_enabled');
      return {
        enabled: setting !== 'false', // Default to true
      };
    } catch (error) {
      return { enabled: true }; // Default to true
    }
  });

  // Set auto-update setting (admin only)
  server.put('/updates/auto-update', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { enabled } = request.body as { enabled: boolean };

    try {
      await ctx.settingsRepo.set('auto_update_enabled', enabled ? 'true' : 'false');

      // Also update the .env file if it exists
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = await readFileAsync(envPath, 'utf8');
        if (envContent.includes('AUTO_UPDATE_ENABLED=')) {
          envContent = envContent.replace(/AUTO_UPDATE_ENABLED=.*/g, `AUTO_UPDATE_ENABLED=${enabled}`);
        } else {
          envContent += `\nAUTO_UPDATE_ENABLED=${enabled}`;
        }
        fs.writeFileSync(envPath, envContent);
      }

      apiLogger.info(`Auto-update ${enabled ? 'enabled' : 'disabled'} by user:`, request.user?.username);

      return {
        success: true,
        enabled,
      };
    } catch (error) {
      apiLogger.error('Failed to update auto-update setting:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to update auto-update setting',
      });
    }
  });
}

// Compare semantic versions, returns: -1 if a < b, 0 if a == b, 1 if a > b
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}
