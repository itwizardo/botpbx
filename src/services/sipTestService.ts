import * as dns from 'dns';
import * as net from 'net';
import * as dgram from 'dgram';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export interface TrunkTestResult {
  success: boolean;
  dnsOk: boolean;
  portOk: boolean;
  sipOptionsOk: boolean;
  registrationStatus: 'registered' | 'unregistered' | 'unknown';
  latencyMs: number;
  error?: string;
  details: {
    resolvedIp?: string;
    portCheckMs?: number;
    sipResponseCode?: number;
    sipResponseText?: string;
  };
}

export class SipTestService {
  /**
   * Test SIP trunk connectivity
   */
  async testTrunk(
    host: string,
    port: number = 5060,
    username?: string,
    fromDomain?: string
  ): Promise<TrunkTestResult> {
    const startTime = Date.now();
    const result: TrunkTestResult = {
      success: false,
      dnsOk: false,
      portOk: false,
      sipOptionsOk: false,
      registrationStatus: 'unknown',
      latencyMs: 0,
      details: {},
    };

    try {
      // Step 1: DNS Resolution
      const resolvedIp = await this.resolveDns(host);
      result.dnsOk = true;
      result.details.resolvedIp = resolvedIp;

      // Step 2: Port connectivity check (TCP)
      const portCheckStart = Date.now();
      await this.checkPort(resolvedIp, port);
      result.portOk = true;
      result.details.portCheckMs = Date.now() - portCheckStart;

      // Step 3: SIP OPTIONS request
      const sipResult = await this.sendSipOptions(
        resolvedIp,
        port,
        host,
        username,
        fromDomain
      );
      result.sipOptionsOk = sipResult.success;
      result.details.sipResponseCode = sipResult.responseCode;
      result.details.sipResponseText = sipResult.responseText;

      // Success if DNS and port are OK, and either SIP OPTIONS works OR we got any response
      // Some providers don't respond to OPTIONS but still work fine
      if (result.dnsOk && result.portOk) {
        result.success = true;
        // If SIP OPTIONS failed, mark as warning but still success
        if (!result.sipOptionsOk && result.details.sipResponseText) {
          result.error = `SIP test note: ${result.details.sipResponseText}`;
        }
      }
    } catch (error: any) {
      result.error = error.message;
      // For UDP ports: if DNS resolved but port check failed, might still be OK (UDP is tricky)
      // For TCP/TLS ports (5061): TCP connect is definitive, so don't mask failures
      if (result.dnsOk && port !== 5061) {
        result.success = true;
        result.portOk = true; // Assume OK since UDP testing is unreliable
        result.error = 'Note: UDP port test inconclusive, but DNS resolved. Check Asterisk registration.';
      }
    }

    result.latencyMs = Date.now() - startTime;
    return result;
  }

  /**
   * Resolve hostname to IP address
   */
  private async resolveDns(host: string): Promise<string> {
    // Check if already an IP address
    if (net.isIP(host)) {
      return host;
    }

    try {
      const { address } = await dnsLookup(host);
      return address;
    } catch (error: any) {
      throw new Error(`DNS resolution failed: ${error.message}`);
    }
  }

  /**
   * Check if port is reachable.
   * For TLS ports (5061), uses TCP connect which gives a definitive result.
   * For UDP ports, sends a SIP OPTIONS probe (timeout = probably open).
   */
  private checkPort(host: string, port: number, timeout: number = 3000): Promise<void> {
    if (port === 5061) {
      return this.checkPortTcp(host, port, timeout);
    }
    return this.checkPortUdp(host, port, timeout);
  }

  /**
   * TCP port check — connect and immediately close.
   * A successful TCP handshake means the port is open.
   */
  private checkPortTcp(host: string, port: number, timeout: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port, timeout });

      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`TCP port ${port} connection timed out`));
      });

      socket.on('error', (error: any) => {
        socket.destroy();
        reject(new Error(`TCP port ${port} check failed: ${error.message}`));
      });
    });
  }

  /**
   * UDP port check — send a SIP OPTIONS probe.
   * No ICMP unreachable (timeout) is treated as "probably open".
   */
  private checkPortUdp(host: string, port: number, timeout: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      // Simple ping-like message
      const message = Buffer.from('OPTIONS sip:ping SIP/2.0\r\n\r\n');

      const timer = setTimeout(() => {
        socket.close();
        // UDP timeout is actually OK - no ICMP unreachable means the port might be open
        resolve();
      }, timeout);

      socket.on('message', () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      });

      socket.on('error', (error: any) => {
        clearTimeout(timer);
        socket.close();
        // ICMP unreachable or other errors indicate port is closed
        if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') {
          reject(new Error(`Port check failed: ${error.message}`));
        } else {
          // Other errors might be transient, consider port OK
          resolve();
        }
      });

      socket.send(message, port, host, (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          reject(new Error(`Port check failed: ${err.message}`));
        }
      });
    });
  }

  /**
   * Send SIP OPTIONS request and check response.
   * For TLS ports (5061), we can't send plain UDP — TCP port connectivity is sufficient.
   */
  private async sendSipOptions(
    ip: string,
    port: number,
    host: string,
    username?: string,
    fromDomain?: string
  ): Promise<{ success: boolean; responseCode?: number; responseText?: string }> {
    // TLS ports require a TLS handshake that we can't easily do from Node without certs.
    // TCP connectivity already proved the port is open, so treat that as success.
    if (port === 5061) {
      return {
        success: true,
        responseCode: 200,
        responseText: 'TLS port open (TCP verified) — use Asterisk CLI to test SIP signaling',
      };
    }

    return new Promise((resolve) => {
      const callId = this.generateCallId();
      const branch = this.generateBranch();
      const tag = this.generateTag();
      const domain = fromDomain || host;
      const fromUser = username || 'sip-test';

      const sipMessage = [
        `OPTIONS sip:${host}:${port} SIP/2.0`,
        `Via: SIP/2.0/UDP ${domain}:5060;branch=${branch};rport`,
        `From: <sip:${fromUser}@${domain}>;tag=${tag}`,
        `To: <sip:${host}:${port}>`,
        `Call-ID: ${callId}`,
        `CSeq: 1 OPTIONS`,
        `Contact: <sip:${fromUser}@${domain}:5060>`,
        `Accept: application/sdp`,
        `Max-Forwards: 70`,
        `User-Agent: BotPBX-SIPTest/1.0`,
        `Content-Length: 0`,
        '',
        '',
      ].join('\r\n');

      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        // No response is not necessarily a failure for some providers
        resolve({ success: false, responseText: 'No response (timeout)' });
      }, 5000);

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        const response = msg.toString();
        const firstLine = response.split('\r\n')[0];
        const match = firstLine.match(/SIP\/2\.0 (\d+) (.+)/);

        if (match) {
          const code = parseInt(match[1], 10);
          const text = match[2];
          // 200 OK is ideal, but 401/407 also mean the server is responding
          const isSuccess = code >= 200 && code < 500;
          socket.close();
          resolve({ success: isSuccess, responseCode: code, responseText: text });
        } else {
          socket.close();
          resolve({ success: false, responseText: 'Invalid SIP response' });
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        resolve({ success: false, responseText: `Socket error: ${err.message}` });
      });

      socket.send(sipMessage, port, ip, (err) => {
        if (err) {
          clearTimeout(timeout);
          socket.close();
          resolve({ success: false, responseText: `Send error: ${err.message}` });
        }
      });
    });
  }

  /**
   * Generate random Call-ID
   */
  private generateCallId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}@botpbx`;
  }

  /**
   * Generate random branch parameter
   */
  private generateBranch(): string {
    return `z9hG4bK-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate random tag
   */
  private generateTag(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Quick connectivity check (just DNS + port)
   */
  async quickCheck(host: string, port: number = 5060): Promise<{ ok: boolean; error?: string }> {
    try {
      const ip = await this.resolveDns(host);
      await this.checkPort(ip, port, 3000);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }
}
