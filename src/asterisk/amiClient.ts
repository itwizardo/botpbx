import AsteriskManager from 'asterisk-manager';
import { EventEmitter } from 'events';
import { amiLogger } from '../utils/logger';
import { AMIConfig, AMIEvent } from '../models/types';

export interface AMIClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  newCall: (event: AMIEvent) => void;
  hangup: (event: AMIEvent) => void;
  dtmf: (event: AMIEvent) => void;
  bridge: (event: AMIEvent) => void;
  dialEnd: (event: AMIEvent) => void;
  event: (event: AMIEvent) => void;
}

export class AMIClient extends EventEmitter {
  private ami: InstanceType<typeof AsteriskManager> | null = null;
  private config: AMIConfig;
  private connected = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  constructor(config: AMIConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to Asterisk AMI
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ami = new AsteriskManager(
          this.config.port,
          this.config.host,
          this.config.user,
          this.config.secret,
          true // Events on
        );

        this.ami.keepConnected();

        this.ami.on('connect', () => {
          this.connected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          amiLogger.info('Connected to Asterisk AMI');
          this.emit('connected');
          resolve();
        });

        this.ami.on('error', (error: Error) => {
          amiLogger.error('AMI error:', error);
          this.emit('error', error);
          if (!this.connected) {
            reject(error);
          }
        });

        this.ami.on('close', () => {
          this.connected = false;
          amiLogger.warn('AMI connection closed');
          this.emit('disconnected');
          this.handleReconnect();
        });

        // Handle all manager events
        this.ami.on('managerevent', (event: AMIEvent) => {
          this.handleEvent(event);
        });

      } catch (error) {
        amiLogger.error('Failed to initialize AMI:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnecting) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      amiLogger.error('Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    amiLogger.info(`Reconnecting to AMI (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.reconnecting = false;
      this.connect().catch((err) => {
        amiLogger.error('Reconnection failed:', err);
      });
    }, this.reconnectDelay);
  }

  /**
   * Handle incoming AMI events
   */
  private handleEvent(event: AMIEvent): void {
    // Emit all events for general handling
    this.emit('event', event);

    switch (event.event) {
      case 'Newchannel':
        amiLogger.debug(`New channel: ${event.channel} from ${event.calleridnum}`);
        this.emit('newchannel', event);
        this.emit('newCall', event); // Keep for backwards compatibility
        break;

      case 'Newstate':
        amiLogger.debug(`New state: ${event.channel} - ${event.channelstatedesc}`);
        this.emit('newstate', event);
        break;

      case 'Hangup':
        amiLogger.debug(`Hangup: ${event.channel} (${event.cause} - ${event.causeTxt})`);
        this.emit('hangup', event);
        break;

      case 'DTMFEnd':
        amiLogger.debug(`DTMF: ${event.digit} on ${event.channel}`);
        this.emit('dtmf', event);
        break;

      case 'BridgeEnter':
      case 'Bridge':
        amiLogger.debug(`Bridge: ${event.channel}`);
        this.emit('bridge', event);
        break;

      case 'DialEnd':
        amiLogger.debug(`DialEnd: ${event.channel} - ${event.dialstatus}`);
        this.emit('dialEnd', event);
        break;
    }
  }

  /**
   * Execute an AMI action
   */
  async action(action: string, params: Record<string, string> = {}): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      if (!this.ami || !this.connected) {
        reject(new Error('AMI not connected'));
        return;
      }

      this.ami.action(
        { action, ...params },
        (err: Error | null, res: Record<string, string>) => {
          if (err) {
            amiLogger.error(`AMI action ${action} failed:`, err);
            reject(err);
          } else {
            resolve(res);
          }
        }
      );
    });
  }

  /**
   * Originate a new call
   */
  async originate(params: {
    channel: string;
    context: string;
    exten: string;
    priority?: number;
    callerid?: string;
    timeout?: number;
    variable?: string;
  }): Promise<Record<string, string>> {
    return this.action('Originate', {
      Channel: params.channel,
      Context: params.context,
      Exten: params.exten,
      Priority: (params.priority || 1).toString(),
      CallerID: params.callerid || '',
      Timeout: (params.timeout || 30000).toString(),
      Variable: params.variable || '',
      Async: 'true',
    });
  }

  /**
   * Redirect a channel to a new context/extension
   */
  async redirect(channel: string, context: string, exten: string, priority: number = 1): Promise<Record<string, string>> {
    return this.action('Redirect', {
      Channel: channel,
      Context: context,
      Exten: exten,
      Priority: priority.toString(),
    });
  }

  /**
   * Hangup a channel
   */
  async hangup(channel: string, cause?: number): Promise<Record<string, string>> {
    const params: Record<string, string> = { Channel: channel };
    if (cause !== undefined) {
      params.Cause = cause.toString();
    }
    return this.action('Hangup', params);
  }

  /**
   * Set a channel variable
   */
  async setVar(channel: string, variable: string, value: string): Promise<Record<string, string>> {
    return this.action('Setvar', {
      Channel: channel,
      Variable: variable,
      Value: value,
    });
  }

  /**
   * Get a channel variable
   */
  async getVar(channel: string, variable: string): Promise<string> {
    const result = await this.action('Getvar', {
      Channel: channel,
      Variable: variable,
    });
    return result.Value || '';
  }

  /**
   * Reload a module (e.g., 'res_pjsip.so')
   */
  async reload(module?: string): Promise<Record<string, string>> {
    const params: Record<string, string> = {};
    if (module) {
      params.Module = module;
    }
    return this.action('Reload', params);
  }

  /**
   * Execute a CLI command
   */
  async command(command: string): Promise<string> {
    const result = await this.action('Command', { Command: command });
    // The output might be in different fields depending on asterisk-manager version
    const output = result.output || result.content || result.data || '';
    if (!output) {
      amiLogger.debug(`Command "${command}" returned:`, JSON.stringify(result));
    }
    return output;
  }

  /**
   * Get active channels with details
   */
  async getActiveChannels(): Promise<Array<{
    channel: string;
    callerIdNum: string;
    callerIdName: string;
    context: string;
    extension: string;
    state: string;
    duration: number;
    application: string;
  }>> {
    try {
      const output = await this.command('core show channels concise');
      const lines = output.split('\n').filter(l => l.trim().length > 0 && !l.includes('active channel'));

      return lines.map(line => {
        // Format: Channel!Context!Extension!Priority!State!Application!Data!CallerID!Accountcode!Peeraccount!AMAflags!Duration!Bridged
        const parts = line.split('!');
        return {
          channel: parts[0] || '',
          context: parts[1] || '',
          extension: parts[2] || '',
          state: parts[4] || '',
          application: parts[5] || '',
          callerIdNum: parts[7]?.split('/')[0] || '',
          callerIdName: parts[7]?.split('/')[1] || '',
          duration: parseInt(parts[11]) || 0,
        };
      }).filter(c => c.channel.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get channel count and basic info
   */
  async getChannelCount(): Promise<{ count: number; channels: string[] }> {
    try {
      const output = await this.command('core show channels concise');
      const lines = output.split('\n').filter(l => l.trim().length > 0 && !l.includes('active channel'));
      return {
        count: lines.length,
        channels: lines.slice(0, 10), // Limit to first 10
      };
    } catch {
      return { count: 0, channels: [] };
    }
  }

  /**
   * Get PJSIP endpoints status
   */
  async getPJSIPEndpoints(): Promise<Array<{ endpoint: string; state: string }>> {
    try {
      const output = await this.command('pjsip show endpoints');
      const lines = output.split('\n');
      const endpoints: Array<{ endpoint: string; state: string }> = [];

      for (const line of lines) {
        // Parse lines like: " Endpoint:  1001/1001                                          Not in use    0 of inf"
        const match = line.match(/Endpoint:\s+(\d+)\/\S+\s+(\S+(?:\s+\S+)?)/);
        if (match) {
          endpoints.push({
            endpoint: match[1],
            state: match[2].trim(),
          });
        }
      }

      return endpoints;
    } catch {
      return [];
    }
  }

  /**
   * Ping Asterisk CLI to check responsiveness
   */
  async pingCLI(): Promise<{ responsive: boolean; responseTime: number }> {
    const start = Date.now();
    try {
      await this.command('core show version');
      return {
        responsive: true,
        responseTime: Date.now() - start,
      };
    } catch {
      return {
        responsive: false,
        responseTime: -1,
      };
    }
  }

  /**
   * Get Asterisk version
   */
  async getVersion(): Promise<string> {
    try {
      const output = await this.command('core show version');
      // Extract version from output like "Asterisk 18.x.x built by..."
      const match = output.match(/Asterisk\s+(\S+)/);
      return match ? `Asterisk ${match[1]}` : output.trim().substring(0, 50);
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from AMI
   */
  disconnect(): void {
    if (this.ami) {
      this.maxReconnectAttempts = 0; // Prevent reconnection
      this.ami.disconnect();
      this.ami = null;
      this.connected = false;
      amiLogger.info('Disconnected from AMI');
    }
  }
}
