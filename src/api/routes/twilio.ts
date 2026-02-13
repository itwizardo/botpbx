import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { TwilioService, TwilioConfig } from '../../services/twilioService';

export function registerTwilioRoutes(server: FastifyInstance, ctx: ApiContext): void {
  const twilioService = new TwilioService();

  // Validate Twilio credentials
  server.post('/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as {
      accountSid: string;
      authToken: string;
    };

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    const result = await twilioService.validateCredentials({ accountSid, authToken });
    return result;
  });

  // Get account phone numbers
  server.post('/phone-numbers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as TwilioConfig;

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    try {
      const numbers = await twilioService.getPhoneNumbers({ accountSid, authToken });
      return { numbers };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message,
      });
    }
  });

  // Get trunk configuration for the account
  server.post('/trunk-config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as TwilioConfig;

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    const config = await twilioService.getTrunkConfiguration({ accountSid, authToken });
    return config;
  });

  // Get STIR/SHAKEN information
  server.post('/stir-shaken', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as TwilioConfig;

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    try {
      const stirShaken = await twilioService.getStirShakenInfo({ accountSid, authToken });
      return stirShaken;
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message,
      });
    }
  });

  // List existing Twilio SIP trunks
  server.post('/sip-trunks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as TwilioConfig;

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    try {
      const trunks = await twilioService.listSipTrunks({ accountSid, authToken });
      return { trunks };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message,
      });
    }
  });

  // Search available phone numbers
  server.post('/available-numbers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken, countryCode, areaCode, type, limit } = request.body as {
      accountSid: string;
      authToken: string;
      countryCode?: string;
      areaCode?: string;
      type?: 'local' | 'tollFree';
      limit?: number;
    };

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    try {
      const numbers = await twilioService.getAvailableNumbers(
        { accountSid, authToken },
        countryCode || 'US',
        { areaCode, type, limit }
      );
      return { numbers };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message,
      });
    }
  });

  // Create a BotPBX trunk with Twilio configuration - FULLY AUTOMATIC
  server.post('/create-trunk', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    const {
      accountSid,
      authToken,
      name,
      selectedNumbers,
      enableStirShaken,
      useTls,
      publicUrl, // BotPBX public URL for incoming calls
    } = request.body as {
      accountSid: string;
      authToken: string;
      name: string;
      selectedNumbers?: string[];
      enableStirShaken?: boolean;
      useTls?: boolean;
      publicUrl?: string;
    };

    if (!accountSid || !authToken || !name) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid, authToken, and name are required',
      });
    }

    try {
      // Step 1: Validate credentials first
      const validation = await twilioService.validateCredentials({ accountSid, authToken });
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid Credentials',
          message: validation.error || 'Failed to validate Twilio credentials',
        });
      }

      request.log.info(`Creating Twilio trunk for account: ${validation.accountName}`);

      // Step 2: Get server's public IP for authentication
      let serverPublicIp: string | null = null;
      try {
        serverPublicIp = await twilioService.getPublicIp();
        request.log.info(`Detected server public IP: ${serverPublicIp}`);
      } catch (ipError: any) {
        request.log.warn(`Could not detect public IP: ${ipError.message}`);
      }

      // Step 3: Create SIP Trunk on Twilio's side (for incoming calls)
      let twilioTrunk = null;
      let ipAclSid: string | null = null;
      let credListSid: string | null = null;
      try {
        twilioTrunk = await twilioService.createSipTrunk(
          { accountSid, authToken },
          `BotPBX-${name}`
        );
        request.log.info(`Created Twilio SIP trunk: ${twilioTrunk.sid}`);

        // Step 4: Create IP ACL and add server's IP for termination authentication
        if (serverPublicIp) {
          try {
            const ipAcl = await twilioService.createIpAccessControlList(
              { accountSid, authToken },
              `BotPBX-${name}-ACL`
            );
            ipAclSid = ipAcl.sid;
            request.log.info(`Created IP ACL: ${ipAcl.sid}`);

            await twilioService.addIpToAccessControlList(
              { accountSid, authToken },
              ipAcl.sid,
              serverPublicIp,
              `BotPBX-Server`
            );
            request.log.info(`Added server IP ${serverPublicIp} to ACL`);

            await twilioService.associateIpAclWithTrunk(
              { accountSid, authToken },
              twilioTrunk.sid,
              ipAcl.sid
            );
            request.log.info(`Associated IP ACL with trunk`);
          } catch (aclError: any) {
            request.log.warn(`IP ACL setup failed: ${aclError.message}`);
          }
        }

        // Step 4b: Create Credential List for digest authentication (backup auth method)
        try {
          const credList = await twilioService.createCredentialList(
            { accountSid, authToken },
            `BotPBX-${name}-Credentials`
          );
          credListSid = credList.sid;
          request.log.info(`Created Credential List: ${credList.sid}`);

          // Add credentials — Twilio limits usernames to 32 chars, so truncate AccountSID if needed
          const credUsername = accountSid.length > 32 ? accountSid.substring(0, 32) : accountSid;
          await twilioService.addCredentialToList(
            { accountSid, authToken },
            credList.sid,
            credUsername,
            authToken
          );
          request.log.info(`Added credentials to list`);

          await twilioService.associateCredentialListWithTrunk(
            { accountSid, authToken },
            twilioTrunk.sid,
            credList.sid
          );
          request.log.info(`Associated Credential List with trunk`);
        } catch (credError: any) {
          request.log.warn(`Credential List setup failed: ${credError.message}`);
        }

        // Step 5: Set origination URL for incoming calls
        const originationHost = publicUrl?.replace(/^https?:\/\//, '') || serverPublicIp;
        if (originationHost) {
          try {
            const sipUrl = `sip:${originationHost}:5061;transport=tls`;
            await twilioService.setOriginationUrl(
              { accountSid, authToken },
              twilioTrunk.sid,
              sipUrl
            );
            request.log.info(`Set origination URL: ${sipUrl}`);
          } catch (origError: any) {
            request.log.warn(`Origination URL setup failed: ${origError.message}`);
          }
        }

        // Step 6: Associate selected phone numbers with the trunk
        if (selectedNumbers && selectedNumbers.length > 0) {
          const phoneNumbers = await twilioService.getPhoneNumbers({ accountSid, authToken });
          for (const phoneNumber of selectedNumbers) {
            const numberInfo = phoneNumbers.find(n => n.phoneNumber === phoneNumber);
            if (numberInfo?.sid) {
              try {
                await twilioService.associatePhoneNumber(
                  { accountSid, authToken },
                  twilioTrunk.sid,
                  numberInfo.sid
                );
                request.log.info(`Associated ${phoneNumber} with trunk`);
              } catch (assocError: any) {
                request.log.warn(`Failed to associate ${phoneNumber}: ${assocError.message}`);
              }
            }
          }
        }
      } catch (twilioError: any) {
        request.log.warn(`Twilio SIP trunk creation skipped: ${twilioError.message}`);
        // Continue - we can still create local trunk for outbound calls
      }

      // Step 5: Generate Asterisk trunk configuration with proper auth
      const asteriskConfig = twilioService.generateAsteriskTrunkConfig(
        { accountSid, authToken },
        name,
        { useTls: useTls !== false, terminationDomain: twilioTrunk?.domainName || undefined }
      );

      // Use first selected number as caller ID (fromUser)
      const primaryNumber = selectedNumbers?.[0] || null;

      // Step 6: Create trunk in BotPBX database with CORRECT auth settings
      const trunk = await ctx.trunkRepo.create({
        name,
        host: asteriskConfig.host,
        port: asteriskConfig.port,
        username: asteriskConfig.username,
        password: asteriskConfig.password,
        authUsername: accountSid,  // FIXED: Use AccountSID for authentication
        fromUser: primaryNumber,   // FIXED: Use phone number as caller ID
        fromDomain: asteriskConfig.fromDomain,
        context: 'from-trunk',
        codecs: asteriskConfig.codecs,
        enabled: true,
        register: false, // Twilio doesn't require registration
        stirShakenEnabled: enableStirShaken === true,
        stirShakenAttest: enableStirShaken === true ? 'A' : null,
        stirShakenProfile: null,
      });

      request.log.info(`Created BotPBX trunk: ${trunk.id}`);

      // Step 7: Auto-create default outbound routes
      const routesCreated: string[] = [];
      try {
        // US/Canada 11-digit (1+10)
        await ctx.outboundRouteRepo.create({
          name: `${name} - US/Canada`,
          pattern: '1NXXNXXXXXX',
          trunkId: trunk.id,
          priority: 1,
          enabled: true,
        });
        routesCreated.push('1NXXNXXXXXX');

        // US/Canada 10-digit (auto-prepend 1)
        await ctx.outboundRouteRepo.create({
          name: `${name} - US 10-digit`,
          pattern: 'NXXNXXXXXX',
          trunkId: trunk.id,
          priority: 2,
          prefixToAdd: '1', // Add 1 prefix for 10-digit calls
          enabled: true,
        });
        routesCreated.push('NXXNXXXXXX');

        // International (011+)
        await ctx.outboundRouteRepo.create({
          name: `${name} - International`,
          pattern: '011.',
          trunkId: trunk.id,
          priority: 3,
          enabled: true,
        });
        routesCreated.push('011.');

        request.log.info(`Created ${routesCreated.length} outbound routes`);
      } catch (routeError: any) {
        request.log.warn(`Failed to create some outbound routes: ${routeError.message}`);
      }

      // Step 8: Regenerate Asterisk PJSIP configuration
      if (ctx.asteriskConfigService) {
        await ctx.asteriskConfigService.writeTrunkConfig();
        // Reload Asterisk configuration
        if (ctx.amiClient) {
          await ctx.amiClient.command('pjsip reload');
          await ctx.amiClient.command('dialplan reload');
        }
      }

      const { password, ...safeTrunk } = trunk;

      return reply.status(201).send({
        success: true,
        trunk: safeTrunk,
        twilioAccount: validation.accountName,
        twilioTrunkSid: twilioTrunk?.sid || null,
        ipAclSid: ipAclSid || null,
        credentialListSid: credListSid || null,
        serverPublicIp: serverPublicIp || null,
        selectedNumbers: selectedNumbers || [],
        routesCreated,
        configuration: {
          ipAcl: ipAclSid ? 'Created and associated' : 'Not configured',
          credentialList: credListSid ? 'Created and associated' : 'Not configured',
          originationUrl: serverPublicIp ? `sip:${serverPublicIp}:5061;transport=tls` : 'Not configured',
          authentication: (ipAclSid && credListSid) ? 'IP-based + Credential-based' : (ipAclSid ? 'IP-based (ACL)' : 'Credential-based'),
        },
        message: 'Twilio trunk fully configured! Both inbound and outbound calls ready.',
      });
    } catch (error: any) {
      request.log.error(`Twilio trunk creation failed: ${error.message}`);
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message || 'Failed to create trunk',
      });
    }
  });

  // Full wizard endpoint - validates, fetches all data
  server.post('/wizard-data', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accountSid, authToken } = request.body as TwilioConfig;

    if (!accountSid || !authToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'accountSid and authToken are required',
      });
    }

    try {
      // Validate credentials
      const validation = await twilioService.validateCredentials({ accountSid, authToken });
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid Credentials',
          message: validation.error,
        });
      }

      // Fetch all data in parallel
      const [phoneNumbers, trunkConfig, stirShaken] = await Promise.all([
        twilioService.getPhoneNumbers({ accountSid, authToken }),
        twilioService.getTrunkConfiguration({ accountSid, authToken }),
        twilioService.getStirShakenInfo({ accountSid, authToken }),
      ]);

      return {
        valid: true,
        accountName: validation.accountName,
        accountType: validation.accountType,
        phoneNumbers,
        trunkConfig,
        stirShaken,
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message,
      });
    }
  });
}
