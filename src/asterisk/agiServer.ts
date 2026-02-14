import * as net from 'net';
import { EventEmitter } from 'events';
import { agiLogger } from '../utils/logger';
import { AGISession, AGIResponse } from '../models/types';

/**
 * AGI Connection handler for a single call
 */
export class AGIConnection {
  private socket: net.Socket;
  private buffer = '';
  public session: AGISession;
  private responseQueue: Array<(response: AGIResponse) => void> = [];

  constructor(socket: net.Socket, session: AGISession) {
    this.socket = socket;
    this.session = session;

    this.socket.on('data', (data) => this.handleData(data as Buffer));
    this.socket.on('error', (err) => {
      agiLogger.error(`AGI socket error: ${err.message}`);
    });
    this.socket.on('close', () => {
      agiLogger.debug(`AGI connection closed for ${session.uniqueId}`);
    });
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this.processResponse(line.trim());
      }
    }
  }

  private processResponse(line: string): void {
    // Parse AGI response format: "200 result=X [data]"
    const match = line.match(/^(\d{3})\s+result=(-?\d+)(?:\s+\((.+)\))?(?:\s+(.*))?$/);

    if (match) {
      const response: AGIResponse = {
        code: parseInt(match[1], 10),
        result: match[2],
        data: match[3] || match[4],
      };

      const handler = this.responseQueue.shift();
      if (handler) {
        handler(response);
      }
    } else if (line.startsWith('HANGUP')) {
      // Handle hangup notification
      agiLogger.debug('AGI received HANGUP');
    }
  }

  /**
   * Send an AGI command and wait for response
   */
  private async command(cmd: string, timeoutMs: number = 30000): Promise<AGIResponse> {
    return new Promise((resolve, reject) => {
      if (this.socket.destroyed) {
        reject(new Error('Socket closed'));
        return;
      }

      this.responseQueue.push(resolve);
      this.socket.write(`${cmd}\n`, (err) => {
        if (err) {
          this.responseQueue.pop();
          reject(err);
        }
      });

      // Timeout with configurable duration
      setTimeout(() => {
        const index = this.responseQueue.indexOf(resolve);
        if (index > -1) {
          this.responseQueue.splice(index, 1);
          reject(new Error('AGI command timeout'));
        }
      }, timeoutMs);
    });
  }

  // =====================
  // AGI Commands
  // =====================

  /**
   * Answer the channel
   */
  async answer(): Promise<AGIResponse> {
    return this.command('ANSWER');
  }

  /**
   * Hangup the channel
   */
  async hangup(channelName?: string): Promise<void> {
    try {
      await this.command(`HANGUP${channelName ? ` ${channelName}` : ''}`);
    } catch {
      // Ignore errors on hangup
    }
    this.socket.end();
  }

  /**
   * Stream a file and optionally wait for DTMF
   * Returns the digit pressed if any, or empty string
   */
  async streamFile(filename: string, escapeDigits: string = ''): Promise<string> {
    const response = await this.command(`STREAM FILE "${filename}" "${escapeDigits}"`);
    // If a digit was pressed, result will be the ASCII code of the digit
    const code = parseInt(response.result, 10);
    if (code > 0) {
      return String.fromCharCode(code);
    }
    return '';
  }

  /**
   * Get data (play file and collect digits)
   * Returns the digits entered
   */
  async getData(filename: string, timeout: number = 5000, maxDigits: number = 1): Promise<string> {
    const response = await this.command(`GET DATA "${filename}" ${timeout} ${maxDigits}`);
    return response.result === '-1' ? '' : response.result;
  }

  /**
   * Get a single digit with timeout
   */
  async waitForDigit(timeout: number = 5000): Promise<string> {
    const response = await this.command(`WAIT FOR DIGIT ${timeout}`);
    const code = parseInt(response.result, 10);
    if (code > 0) {
      return String.fromCharCode(code);
    }
    return '';
  }

  /**
   * Say digits
   */
  async sayDigits(digits: string, escapeDigits: string = ''): Promise<string> {
    const response = await this.command(`SAY DIGITS ${digits} "${escapeDigits}"`);
    const code = parseInt(response.result, 10);
    if (code > 0) {
      return String.fromCharCode(code);
    }
    return '';
  }

  /**
   * Say a number
   */
  async sayNumber(number: number, escapeDigits: string = ''): Promise<string> {
    const response = await this.command(`SAY NUMBER ${number} "${escapeDigits}"`);
    const code = parseInt(response.result, 10);
    if (code > 0) {
      return String.fromCharCode(code);
    }
    return '';
  }

  /**
   * Set a channel variable
   */
  async setVariable(name: string, value: string): Promise<AGIResponse> {
    return this.command(`SET VARIABLE ${name} "${value}"`);
  }

  /**
   * Get a channel variable
   */
  async getVariable(name: string): Promise<string> {
    const response = await this.command(`GET VARIABLE ${name}`);
    return response.data || '';
  }

  /**
   * Execute a dialplan application
   */
  async exec(application: string, options: string = ''): Promise<AGIResponse> {
    // Use longer timeout for Dial application (can take 60+ seconds)
    const timeout = application.toLowerCase() === 'dial' ? 120000 : 30000;
    return this.command(`EXEC ${application} ${options}`, timeout);
  }

  /**
   * Set the context for channel continuation
   */
  async setContext(context: string): Promise<AGIResponse> {
    return this.command(`SET CONTEXT ${context}`);
  }

  /**
   * Set the extension for channel continuation
   */
  async setExtension(extension: string): Promise<AGIResponse> {
    return this.command(`SET EXTENSION ${extension}`);
  }

  /**
   * Set the priority for channel continuation
   */
  async setPriority(priority: number): Promise<AGIResponse> {
    return this.command(`SET PRIORITY ${priority}`);
  }

  /**
   * Record to a file
   */
  async recordFile(
    filename: string,
    format: string = 'wav',
    escapeDigits: string = '#',
    timeout: number = -1,
    beep: boolean = true,
    silence: number = 0
  ): Promise<AGIResponse> {
    const beepStr = beep ? 'BEEP' : '';
    return this.command(
      `RECORD FILE "${filename}" ${format} "${escapeDigits}" ${timeout} ${beepStr} s=${silence}`
    );
  }

  /**
   * Verbose log message
   */
  async verbose(message: string, level: number = 1): Promise<AGIResponse> {
    return this.command(`VERBOSE "${message}" ${level}`);
  }

  /**
   * Check if socket is still connected
   */
  isConnected(): boolean {
    return !this.socket.destroyed;
  }
}

/**
 * FastAGI Server
 */
export class AGIServer extends EventEmitter {
  private server: net.Server | null = null;
  private port: number;

  constructor(port: number = 4573) {
    super();
    this.port = port;
  }

  /**
   * Start the AGI server
   */
  start(): void {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (err) => {
      agiLogger.error('AGI server error:', err);
      this.emit('error', err);
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      agiLogger.info(`AGI server listening on 127.0.0.1:${this.port}`);
      this.emit('listening');
    });
  }

  /**
   * Handle new connection
   */
  private async handleConnection(socket: net.Socket): Promise<void> {
    try {
      const session = await this.parseAGIVariables(socket);
      agiLogger.info(`New AGI connection: ${session.uniqueId} from ${session.callerId}`);

      const agi = new AGIConnection(socket, session);

      // Detect call type based on AGI request path
      const agiRequest = session.variables.get('agi_request') || '';
      const agiContext = session.context;

      if (agiRequest.includes('/ai-call-end')) {
        agiLogger.info(`AI Agent call ended: ${session.uniqueId}`);
        this.emit('ai-call-end', agi, session);
      } else if (agiRequest.includes('/test-call-end')) {
        agiLogger.info(`Test call ended: ${session.uniqueId}`);
        this.emit('test-call-end', agi, session);
      } else if (agiRequest.includes('/browser-call')) {
        agiLogger.info(`Browser call start: ${session.uniqueId}`);
        this.emit('browser-call-start', agi, session);
      } else if (agiRequest.includes('/browser-hangup')) {
        agiLogger.info(`Browser call hangup: ${session.uniqueId}`);
        this.emit('browser-call-end', agi, session);
      } else if (agiRequest.includes('/outbound') || agiContext === 'outbound-dialer') {
        agiLogger.info(`Outbound dialer call detected: ${session.uniqueId}`);
        this.emit('outbound-call', agi, session);
      } else if (agiRequest.includes('/ai-agent') || agiContext === 'ai-agent-test') {
        agiLogger.info(`AI Agent call detected: ${session.uniqueId}`);
        this.emit('ai-agent-call', agi, session);
      } else {
        this.emit('call', agi, session);
      }
    } catch (error) {
      agiLogger.error('Failed to parse AGI session:', error);
      socket.end();
    }
  }

  /**
   * Parse AGI environment variables from connection
   */
  private parseAGIVariables(socket: net.Socket): Promise<AGISession> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const variables = new Map<string, string>();

      const timeout = setTimeout(() => {
        socket.removeListener('data', onData);
        reject(new Error('AGI variable parsing timeout'));
      }, 10000);

      const onData = (data: Buffer) => {
        buffer += data.toString();

        // AGI variables end with empty line
        if (buffer.includes('\n\n')) {
          clearTimeout(timeout);
          socket.removeListener('data', onData);

          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('agi_')) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                variables.set(key, value);
              }
            }
          }

          resolve({
            variables,
            channel: variables.get('agi_channel') || '',
            uniqueId: variables.get('agi_uniqueid') || '',
            callerId: variables.get('agi_callerid') || '',
            callerIdName: variables.get('agi_calleridname') || '',
            dnid: variables.get('agi_dnid') || variables.get('agi_extension') || '',
            context: variables.get('agi_context') || '',
            extension: variables.get('agi_extension') || '',
          });
        }
      };

      socket.on('data', onData);
    });
  }

  /**
   * Stop the AGI server
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        agiLogger.info('AGI server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}
