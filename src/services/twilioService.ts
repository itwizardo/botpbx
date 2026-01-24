import Twilio from 'twilio';
import { dbLogger } from '../utils/logger';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

export interface TwilioPhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  sid: string;
}

export interface TwilioTrunkConfig {
  termination: {
    host: string;
    port: number;
  };
  origination: {
    host: string;
  };
  credentials: {
    username: string;
    password: string;
  };
  codecs: string[];
}

export interface TwilioStirShaken {
  enabled: boolean;
  attestationLevel: 'A' | 'B' | 'C';
  verifiedNumbers: string[];
}

export interface TwilioValidationResult {
  valid: boolean;
  accountName?: string;
  accountType?: string;
  error?: string;
}

export interface TwilioSipTrunk {
  sid: string;
  friendlyName: string;
  domainName: string;
  recording?: {
    mode: string;
    trim: string;
  };
}

export class TwilioService {
  async validateCredentials(config: TwilioConfig): Promise<TwilioValidationResult> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      // Fetch account info to validate credentials
      const account = await client.api.accounts(config.accountSid).fetch();

      dbLogger.info(`Twilio credentials validated for account: ${account.friendlyName}`);

      return {
        valid: true,
        accountName: account.friendlyName,
        accountType: account.type,
      };
    } catch (error: any) {
      dbLogger.warn(`Twilio credential validation failed: ${error.message}`);

      if (error.code === 20003) {
        return {
          valid: false,
          error: 'Invalid Account SID or Auth Token',
        };
      }

      return {
        valid: false,
        error: error.message || 'Failed to validate credentials',
      };
    }
  }

  async getPhoneNumbers(config: TwilioConfig): Promise<TwilioPhoneNumber[]> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const incomingNumbers = await client.incomingPhoneNumbers.list();

      return incomingNumbers.map((number) => ({
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        capabilities: {
          voice: number.capabilities?.voice ?? false,
          sms: number.capabilities?.sms ?? false,
          mms: number.capabilities?.mms ?? false,
        },
        sid: number.sid,
      }));
    } catch (error: any) {
      dbLogger.error(`Failed to fetch Twilio phone numbers: ${error.message}`);
      throw new Error(`Failed to fetch phone numbers: ${error.message}`);
    }
  }

  async getTrunkConfiguration(config: TwilioConfig): Promise<TwilioTrunkConfig> {
    // Twilio's standard SIP trunk configuration
    // Termination URI format: {AccountSid}.pstn.twilio.com
    // This is the endpoint you dial OUT to
    return {
      termination: {
        host: `${config.accountSid}.pstn.twilio.com`,
        port: 5060, // UDP/TCP, use 5061 for TLS
      },
      origination: {
        host: 'sip.twilio.com', // Standard origination domain
      },
      credentials: {
        username: config.accountSid,
        password: config.authToken,
      },
      codecs: ['ulaw', 'alaw', 'opus'],
    };
  }

  async listSipTrunks(config: TwilioConfig): Promise<TwilioSipTrunk[]> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const trunks = await client.trunking.v1.trunks.list();

      return trunks.map((trunk) => ({
        sid: trunk.sid,
        friendlyName: trunk.friendlyName,
        domainName: trunk.domainName,
        recording: trunk.recording ? {
          mode: trunk.recording.mode,
          trim: trunk.recording.trim,
        } : undefined,
      }));
    } catch (error: any) {
      dbLogger.error(`Failed to list Twilio SIP trunks: ${error.message}`);
      throw new Error(`Failed to list SIP trunks: ${error.message}`);
    }
  }

  async getStirShakenInfo(config: TwilioConfig): Promise<TwilioStirShaken> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      // Get phone numbers with voice capability to check verification status
      const numbers = await client.incomingPhoneNumbers.list();

      // Filter numbers that have voice capability
      const voiceNumbers = numbers.filter((n) => n.capabilities?.voice);

      // In Twilio, verified numbers typically get "A" attestation
      // Numbers that are not verified get "B" or "C"
      const verifiedNumbers: string[] = [];

      for (const number of voiceNumbers) {
        // All Twilio phone numbers owned by the account are typically verified
        // and eligible for "A" attestation when calling US numbers
        verifiedNumbers.push(number.phoneNumber);
      }

      return {
        enabled: voiceNumbers.length > 0,
        attestationLevel: verifiedNumbers.length > 0 ? 'A' : 'B',
        verifiedNumbers,
      };
    } catch (error: any) {
      dbLogger.error(`Failed to get STIR/SHAKEN info: ${error.message}`);
      return {
        enabled: false,
        attestationLevel: 'C',
        verifiedNumbers: [],
      };
    }
  }

  async getAvailableNumbers(
    config: TwilioConfig,
    countryCode: string = 'US',
    options?: {
      areaCode?: string;
      type?: 'local' | 'tollFree';
      voiceEnabled?: boolean;
      limit?: number;
    }
  ): Promise<TwilioPhoneNumber[]> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const searchOptions: any = {
        voiceEnabled: options?.voiceEnabled !== false,
        limit: options?.limit || 20,
      };

      if (options?.areaCode) {
        searchOptions.areaCode = options.areaCode;
      }

      let availableNumbers;

      if (options?.type === 'tollFree') {
        availableNumbers = await client
          .availablePhoneNumbers(countryCode)
          .tollFree.list(searchOptions);
      } else {
        availableNumbers = await client
          .availablePhoneNumbers(countryCode)
          .local.list(searchOptions);
      }

      return availableNumbers.map((number) => ({
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        capabilities: {
          voice: number.capabilities?.voice ?? false,
          sms: number.capabilities?.sms ?? false,
          mms: number.capabilities?.mms ?? false,
        },
        sid: '', // Available numbers don't have SIDs yet
      }));
    } catch (error: any) {
      dbLogger.error(`Failed to search available numbers: ${error.message}`);
      throw new Error(`Failed to search available numbers: ${error.message}`);
    }
  }

  async createSipTrunk(
    config: TwilioConfig,
    friendlyName: string
  ): Promise<TwilioSipTrunk> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const trunk = await client.trunking.v1.trunks.create({
        friendlyName,
      });

      dbLogger.info(`Created Twilio SIP trunk: ${trunk.friendlyName} (${trunk.sid})`);

      return {
        sid: trunk.sid,
        friendlyName: trunk.friendlyName,
        domainName: trunk.domainName,
      };
    } catch (error: any) {
      dbLogger.error(`Failed to create Twilio SIP trunk: ${error.message}`);
      throw new Error(`Failed to create SIP trunk: ${error.message}`);
    }
  }

  async setOriginationUrl(
    config: TwilioConfig,
    trunkSid: string,
    sipUrl: string,
    options?: {
      weight?: number;
      priority?: number;
      enabled?: boolean;
    }
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.trunking.v1
        .trunks(trunkSid)
        .originationUrls.create({
          sipUrl,
          weight: options?.weight ?? 10,
          priority: options?.priority ?? 10,
          enabled: options?.enabled !== false,
          friendlyName: 'BotPBX Origination',
        });

      dbLogger.info(`Set origination URL for trunk ${trunkSid}: ${sipUrl}`);
    } catch (error: any) {
      dbLogger.error(`Failed to set origination URL: ${error.message}`);
      throw new Error(`Failed to set origination URL: ${error.message}`);
    }
  }

  async associatePhoneNumber(
    config: TwilioConfig,
    trunkSid: string,
    phoneNumberSid: string
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.trunking.v1
        .trunks(trunkSid)
        .phoneNumbers.create({
          phoneNumberSid,
        });

      dbLogger.info(`Associated phone number ${phoneNumberSid} with trunk ${trunkSid}`);
    } catch (error: any) {
      dbLogger.error(`Failed to associate phone number: ${error.message}`);
      throw new Error(`Failed to associate phone number: ${error.message}`);
    }
  }

  /**
   * Create an IP Access Control List for trunk authentication
   */
  async createIpAccessControlList(
    config: TwilioConfig,
    friendlyName: string
  ): Promise<{ sid: string; friendlyName: string }> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const acl = await client.sip.ipAccessControlLists.create({
        friendlyName,
      });

      dbLogger.info(`Created IP ACL: ${acl.friendlyName} (${acl.sid})`);
      return { sid: acl.sid, friendlyName: acl.friendlyName };
    } catch (error: any) {
      dbLogger.error(`Failed to create IP ACL: ${error.message}`);
      throw new Error(`Failed to create IP ACL: ${error.message}`);
    }
  }

  /**
   * Add an IP address to an IP Access Control List
   */
  async addIpToAccessControlList(
    config: TwilioConfig,
    aclSid: string,
    ipAddress: string,
    friendlyName?: string
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.sip
        .ipAccessControlLists(aclSid)
        .ipAddresses.create({
          ipAddress,
          friendlyName: friendlyName || `BotPBX-${ipAddress}`,
        });

      dbLogger.info(`Added IP ${ipAddress} to ACL ${aclSid}`);
    } catch (error: any) {
      dbLogger.error(`Failed to add IP to ACL: ${error.message}`);
      throw new Error(`Failed to add IP to ACL: ${error.message}`);
    }
  }

  /**
   * Associate an IP ACL with a trunk for termination authentication
   */
  async associateIpAclWithTrunk(
    config: TwilioConfig,
    trunkSid: string,
    aclSid: string
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.trunking.v1
        .trunks(trunkSid)
        .ipAccessControlLists.create({
          ipAccessControlListSid: aclSid,
        });

      dbLogger.info(`Associated IP ACL ${aclSid} with trunk ${trunkSid}`);
    } catch (error: any) {
      dbLogger.error(`Failed to associate IP ACL with trunk: ${error.message}`);
      throw new Error(`Failed to associate IP ACL with trunk: ${error.message}`);
    }
  }

  /**
   * Create a Credential List for trunk authentication
   */
  async createCredentialList(
    config: TwilioConfig,
    friendlyName: string
  ): Promise<{ sid: string; friendlyName: string }> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      const credList = await client.sip.credentialLists.create({
        friendlyName,
      });

      dbLogger.info(`Created Credential List: ${credList.friendlyName} (${credList.sid})`);
      return { sid: credList.sid, friendlyName: credList.friendlyName };
    } catch (error: any) {
      dbLogger.error(`Failed to create Credential List: ${error.message}`);
      throw new Error(`Failed to create Credential List: ${error.message}`);
    }
  }

  /**
   * Add credentials to a Credential List
   */
  async addCredentialToList(
    config: TwilioConfig,
    credListSid: string,
    username: string,
    password: string
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.sip
        .credentialLists(credListSid)
        .credentials.create({
          username,
          password,
        });

      dbLogger.info(`Added credential for ${username} to list ${credListSid}`);
    } catch (error: any) {
      dbLogger.error(`Failed to add credential to list: ${error.message}`);
      throw new Error(`Failed to add credential to list: ${error.message}`);
    }
  }

  /**
   * Associate a Credential List with a trunk for termination authentication
   */
  async associateCredentialListWithTrunk(
    config: TwilioConfig,
    trunkSid: string,
    credListSid: string
  ): Promise<void> {
    try {
      const client = Twilio(config.accountSid, config.authToken);

      await client.trunking.v1
        .trunks(trunkSid)
        .credentialsLists.create({
          credentialListSid: credListSid,
        });

      dbLogger.info(`Associated Credential List ${credListSid} with trunk ${trunkSid}`);
    } catch (error: any) {
      dbLogger.error(`Failed to associate Credential List with trunk: ${error.message}`);
      throw new Error(`Failed to associate Credential List with trunk: ${error.message}`);
    }
  }

  /**
   * Get the server's public IP address
   */
  async getPublicIp(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json() as { ip: string };
      return data.ip;
    } catch (error: any) {
      dbLogger.error(`Failed to get public IP: ${error.message}`);
      throw new Error(`Failed to get public IP: ${error.message}`);
    }
  }

  generateAsteriskTrunkConfig(
    config: TwilioConfig,
    trunkName: string,
    options?: {
      useTls?: boolean;
      fromDomain?: string;
    }
  ): {
    host: string;
    port: number;
    username: string;
    password: string;
    fromDomain: string;
    codecs: string;
    register: boolean;
  } {
    const port = options?.useTls ? 5061 : 5060;
    const host = `${config.accountSid}.pstn.twilio.com`;

    return {
      host,
      port,
      username: config.accountSid,
      password: config.authToken,
      fromDomain: options?.fromDomain || host,
      codecs: 'ulaw,alaw,opus',
      register: false, // Twilio uses credential-based auth, not registration
    };
  }
}
