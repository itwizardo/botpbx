import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerTrunkRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get enabled trunks for dialing (used by browser phone) - requires trunks.view
  server.get('/for-dialing', {
    preHandler: [ctx.requirePermission('trunks.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const trunks = await ctx.trunkRepo.findEnabled();

    // Return simplified trunk info for dial dropdown
    const dialTrunks = trunks.map(trunk => ({
      id: trunk.id,
      name: trunk.name,
      // Generate the endpoint name (same format used in pjsip_trunks.conf)
      endpoint: trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      // Mark first enabled trunk as default
      isDefault: false,
    }));

    // Set first trunk as default
    if (dialTrunks.length > 0) {
      dialTrunks[0].isDefault = true;
    }

    return { trunks: dialTrunks };
  });

  // List trunks - requires trunks.view
  server.get('/', {
    preHandler: [ctx.requirePermission('trunks.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const trunks = await ctx.trunkRepo.findAll();
    // Don't expose passwords
    const safeTrunks = trunks.map(({ password, ...safe }) => safe);
    return { trunks: safeTrunks };
  });

  // Get single trunk - requires trunks.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('trunks.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    // Don't expose password
    const { password, ...safe } = trunk;
    return safe;
  });

  // Create trunk - requires trunks.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('trunks.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      host: string;
      port?: number;
      username: string;
      password: string;
      authUsername?: string;
      fromUser?: string;
      fromDomain?: string;
      context?: string;
      codecs?: string | string[];
      enabled?: boolean;
      register?: boolean;
      stirShakenEnabled?: boolean;
      stirShakenAttest?: 'A' | 'B' | 'C';
      stirShakenProfile?: string;
    };

    if (!body.name || !body.host || !body.username || !body.password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'name, host, username, and password required',
      });
    }

    // Handle codecs - convert array to string if needed
    const codecs = Array.isArray(body.codecs)
      ? body.codecs.join(',')
      : body.codecs || 'ulaw,alaw';

    const trunk = await ctx.trunkRepo.create({
      name: body.name,
      host: body.host,
      port: body.port || 5060,
      username: body.username,
      password: body.password,
      authUsername: body.authUsername || null,
      fromUser: body.fromUser || null,
      fromDomain: body.fromDomain || null,
      context: body.context || 'from-trunk',
      codecs,
      enabled: body.enabled !== false,
      register: body.register !== false,
      stirShakenEnabled: body.stirShakenEnabled || false,
      stirShakenAttest: body.stirShakenAttest || null,
      stirShakenProfile: body.stirShakenProfile || null,
    });

    // Auto-reload Asterisk trunk config
    try {
      await ctx.asteriskConfigService.writeTrunkConfig();
      if (ctx.amiClient?.isConnected()) {
        await ctx.amiClient.command('pjsip reload');
      }
    } catch (err) {
      console.error('Failed to reload trunk config after create:', err);
    }

    const { password, ...safe } = trunk;
    return reply.status(201).send(safe);
  });

  // Update trunk - requires trunks.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('trunks.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      authUsername?: string;
      fromUser?: string;
      fromDomain?: string;
      context?: string;
      codecs?: string | string[];
      enabled?: boolean;
      register?: boolean;
    };

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    // Handle codecs - convert array to string if needed
    const updates: any = { ...body };
    if (body.codecs) {
      updates.codecs = Array.isArray(body.codecs) ? body.codecs.join(',') : body.codecs;
    }

    const success = await ctx.trunkRepo.update(id, updates);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update trunk' });
    }

    // Auto-reload Asterisk trunk config
    try {
      await ctx.asteriskConfigService.writeTrunkConfig();
      if (ctx.amiClient?.isConnected()) {
        await ctx.amiClient.command('pjsip reload');
      }
    } catch (err) {
      console.error('Failed to reload trunk config after update:', err);
    }

    const updated = await ctx.trunkRepo.findById(id);
    if (updated) {
      const { password, ...safe } = updated;
      return safe;
    }

    return { success: true };
  });

  // Delete trunk - requires trunks.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('trunks.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    const success = await ctx.trunkRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete trunk' });
    }

    // Auto-reload Asterisk trunk config
    try {
      await ctx.asteriskConfigService.writeTrunkConfig();
      if (ctx.amiClient?.isConnected()) {
        await ctx.amiClient.command('pjsip reload');
      }
    } catch (err) {
      console.error('Failed to reload trunk config after delete:', err);
    }

    return { success: true };
  });

  // Test trunk connection - requires trunks.test
  server.post('/:id/test', {
    preHandler: [ctx.requirePermission('trunks.test')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    // Perform real SIP connectivity test
    const testResult = await ctx.sipTestService.testTrunk(
      trunk.host,
      trunk.port || 5060,
      trunk.username,
      trunk.fromDomain || undefined
    );

    return {
      success: testResult.success,
      trunk: trunk.name,
      dnsOk: testResult.dnsOk,
      portOk: testResult.portOk,
      sipOptionsOk: testResult.sipOptionsOk,
      latencyMs: testResult.latencyMs,
      error: testResult.error,
      details: testResult.details,
    };
  });

  // Quick connectivity check for a trunk - requires trunks.test
  server.post('/:id/quick-check', {
    preHandler: [ctx.requirePermission('trunks.test')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    const result = await ctx.sipTestService.quickCheck(trunk.host, trunk.port || 5060);

    return {
      ok: result.ok,
      trunk: trunk.name,
      error: result.error,
    };
  });

  // Make a test call through the trunk - requires trunks.test
  server.post('/:id/test-call', {
    preHandler: [ctx.requirePermission('trunks.test')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { destination, callerId } = request.body as { destination: string; callerId?: string };

    if (!destination) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Destination number is required',
      });
    }

    const trunk = await ctx.trunkRepo.findById(id);
    if (!trunk) {
      return reply.status(404).send({ error: 'Not Found', message: 'Trunk not found' });
    }

    if (!ctx.amiClient) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'AMI connection not available',
      });
    }

    try {
      // Originate a test call through this trunk
      const channel = `PJSIP/${destination}@${trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const cid = callerId || trunk.fromUser || trunk.username;

      const result = await ctx.amiClient.originate({
        channel: channel,
        context: 'test-call',
        exten: 's',
        priority: 1,
        callerid: `"Test Call" <${cid}>`,
        timeout: 30000,
        variable: 'TRUNK_TEST=1',
      });

      return {
        success: true,
        message: 'Test call initiated',
        destination,
        trunk: trunk.name,
        actionId: result.ActionID,
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Call Failed',
        message: error.message || 'Failed to initiate test call',
      });
    }
  });
}
