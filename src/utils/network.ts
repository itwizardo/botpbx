import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { logger } from './logger';

let cachedPublicIP: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 60000; // Cache for 1 minute

/**
 * Get the server's public IP address
 * Tries multiple methods: env var, external service, then local interface
 */
export async function getPublicIP(): Promise<string> {
  // Check environment variable first
  if (process.env.SIP_SERVER) {
    return process.env.SIP_SERVER;
  }
  if (process.env.PUBLIC_IP) {
    return process.env.PUBLIC_IP;
  }

  // Check cache
  if (cachedPublicIP && (Date.now() - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedPublicIP;
  }

  // Try to fetch from external services
  const services = [
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
    'https://icanhazip.com',
    'http://checkip.amazonaws.com',
  ];

  for (const service of services) {
    try {
      const ip = await fetchIP(service);
      if (ip && isValidIP(ip)) {
        cachedPublicIP = ip;
        cacheTimestamp = Date.now();
        return ip;
      }
    } catch {
      // Try next service
    }
  }

  // Fallback to local network interface (first non-internal IPv4)
  const localIP = getLocalIP();
  if (localIP) {
    cachedPublicIP = localIP;
    cacheTimestamp = Date.now();
    return localIP;
  }

  return 'YOUR_SERVER_IP';
}

/**
 * Fetch IP from an external service
 */
function fetchIP(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(data.trim());
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Get first non-internal IPv4 address from network interfaces
 */
function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (!netInterface) continue;

    for (const iface of netInterface) {
      // Skip internal and non-IPv4 addresses
      if (iface.internal || iface.family !== 'IPv4') continue;
      // Skip docker/virtual interfaces
      if (name.startsWith('docker') || name.startsWith('br-') || name.startsWith('veth')) continue;
      return iface.address;
    }
  }
  return null;
}

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every(part => part >= 0 && part <= 255);
}

/**
 * Get public IP synchronously (returns cached or env value)
 * Use this when you can't await
 */
export function getPublicIPSync(): string {
  if (process.env.SIP_SERVER) return process.env.SIP_SERVER;
  if (process.env.PUBLIC_IP) return process.env.PUBLIC_IP;
  if (cachedPublicIP) return cachedPublicIP;
  return getLocalIP() || 'YOUR_SERVER_IP';
}

/**
 * Initialize the public IP cache at startup
 */
export async function initPublicIP(): Promise<string> {
  const ip = await getPublicIP();
  logger.info(`Detected public IP: ${ip}`);
  return ip;
}
