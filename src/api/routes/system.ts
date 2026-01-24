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

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
}

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

      const release = await response.json() as GitHubRelease;
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

  // Setup HTTPS with Let's Encrypt (admin only)
  server.post('/setup-https', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { domain } = request.body as { domain: string };

    if (!domain || typeof domain !== 'string') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Domain is required' });
    }

    // Validate domain format (basic check)
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/;
    if (!domainRegex.test(domain)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid domain format. Enter a domain like example.com (no https:// prefix)' });
    }

    apiLogger.info(`Starting HTTPS setup for domain: ${domain} by user: ${request.user?.username}`);

    try {
      const steps: string[] = [];

      // Step 1: Install nginx and certbot if needed
      steps.push('Installing nginx and certbot...');
      try {
        await execAsync('apt update && apt install -y nginx certbot python3-certbot-nginx', { timeout: 120000 });
        steps.push('Nginx and certbot installed successfully');
      } catch (err) {
        steps.push('Note: Could not install packages (may already be installed or need sudo)');
      }

      // Step 2: Create nginx configuration for the domain
      steps.push('Creating nginx configuration...');
      const nginxConfig = `
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
`;

      const nginxPath = `/etc/nginx/sites-available/${domain}`;
      const nginxEnabledPath = `/etc/nginx/sites-enabled/${domain}`;

      try {
        fs.writeFileSync(nginxPath, nginxConfig);
        // Enable site
        if (!fs.existsSync(nginxEnabledPath)) {
          fs.symlinkSync(nginxPath, nginxEnabledPath);
        }
        // Test nginx config
        await execAsync('nginx -t');
        // Reload nginx
        await execAsync('systemctl reload nginx');
        steps.push('Nginx configuration created and loaded');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        steps.push(`Warning: Could not configure nginx: ${errMsg}`);
      }

      // Step 3: Run certbot
      steps.push('Obtaining SSL certificate with certbot...');
      try {
        const { stdout, stderr } = await execAsync(
          `certbot --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email`,
          { timeout: 180000 }
        );
        steps.push('SSL certificate obtained and configured successfully');
        apiLogger.info(`HTTPS setup completed for ${domain}`);
      } catch (err: any) {
        const stderr = err.stderr || '';
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        apiLogger.error(`Certbot failed for ${domain}: ${errMsg}`, { stderr });
        steps.push(`SSL certificate error: ${errMsg}`);

        // Check for common issues
        let userMessage = 'Could not obtain SSL certificate.';
        if (stderr.includes('522') || stderr.includes('Cloudflare')) {
          userMessage = 'Domain is behind Cloudflare proxy. Disable the proxy (grey cloud) in Cloudflare DNS, wait 5 minutes, then try again.';
        } else if (stderr.includes('unauthorized') || stderr.includes('Invalid response')) {
          userMessage = 'Domain verification failed. Make sure the DNS A record points directly to this server (77.110.100.229), not through a proxy.';
        } else if (stderr.includes('NXDOMAIN') || stderr.includes('DNS problem')) {
          userMessage = 'DNS record not found. Add an A record pointing to this server and wait for DNS propagation.';
        }

        return reply.status(500).send({
          error: 'SSL Setup Failed',
          message: userMessage,
          steps,
        });
      }

      return {
        success: true,
        message: `HTTPS setup completed for ${domain}`,
        steps,
        nextStep: `Visit https://${domain} to access BotPBX securely`,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      apiLogger.error('Failed to setup HTTPS:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: `Failed to setup HTTPS: ${errMsg}`,
      });
    }
  });

  // Check HTTPS setup status
  server.get('/https-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if nginx is installed and running
      let nginxInstalled = false;
      let nginxRunning = false;
      try {
        await execAsync('which nginx');
        nginxInstalled = true;
        const { stdout } = await execAsync('systemctl is-active nginx');
        nginxRunning = stdout.trim() === 'active';
      } catch {
        // nginx not installed or not running
      }

      // Check if certbot is installed
      let certbotInstalled = false;
      try {
        await execAsync('which certbot');
        certbotInstalled = true;
      } catch {
        // certbot not installed
      }

      // Check for existing certificates
      let certificates: string[] = [];
      try {
        const { stdout } = await execAsync('certbot certificates 2>/dev/null | grep "Domains:"');
        const matches = stdout.matchAll(/Domains:\s+(\S+)/g);
        for (const match of matches) {
          certificates.push(match[1]);
        }
      } catch {
        // No certificates
      }

      return {
        nginxInstalled,
        nginxRunning,
        certbotInstalled,
        certificates,
        ready: nginxInstalled && certbotInstalled,
      };
    } catch (error) {
      return { nginxInstalled: false, nginxRunning: false, certbotInstalled: false, certificates: [], ready: false };
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
