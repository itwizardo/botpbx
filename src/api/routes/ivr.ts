import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerIvrRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List IVR menus with options - requires ivr.view
  server.get('/menus', {
    preHandler: [ctx.requirePermission('ivr.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const menus = await ctx.ivrMenuRepo.findAllWithOptions();
    return { menus };
  });

  // Get single IVR menu with options - requires ivr.view
  server.get('/menus/:id', {
    preHandler: [ctx.requirePermission('ivr.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const menu = await ctx.ivrMenuRepo.findByIdWithOptions(id);
    if (!menu) {
      return reply.status(404).send({ error: 'Not Found', message: 'IVR menu not found' });
    }

    return menu;
  });

  // Create IVR menu - requires ivr.manage
  server.post('/menus', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      welcomePromptId?: string;
      invalidPromptId?: string;
      timeoutPromptId?: string;
      timeoutSeconds?: number;
      maxRetries?: number;
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Menu name required' });
    }

    const menu = await ctx.ivrMenuRepo.create({
      name: body.name,
      welcomePromptId: body.welcomePromptId || null,
      invalidPromptId: body.invalidPromptId || null,
      timeoutPromptId: body.timeoutPromptId || null,
      timeoutSeconds: body.timeoutSeconds || 5,
      maxRetries: body.maxRetries || 3,
    });

    return reply.status(201).send(menu);
  });

  // Update IVR menu - requires ivr.manage
  server.put('/menus/:id', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      welcomePromptId?: string;
      invalidPromptId?: string;
      timeoutPromptId?: string;
      timeoutSeconds?: number;
      maxRetries?: number;
    };

    const menu = await ctx.ivrMenuRepo.findById(id);
    if (!menu) {
      return reply.status(404).send({ error: 'Not Found', message: 'IVR menu not found' });
    }

    const success = await ctx.ivrMenuRepo.update(id, body);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update menu' });
    }

    const updated = await ctx.ivrMenuRepo.findByIdWithOptions(id);
    return updated;
  });

  // Delete IVR menu - requires ivr.manage
  server.delete('/menus/:id', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const menu = await ctx.ivrMenuRepo.findById(id);
    if (!menu) {
      return reply.status(404).send({ error: 'Not Found', message: 'IVR menu not found' });
    }

    const success = await ctx.ivrMenuRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete menu' });
    }

    return { success: true };
  });

  // Add option to menu - requires ivr.manage
  server.post('/menus/:id/options', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      keyPress: string;
      actionType: string;
      destination?: string;
      preConnectPromptId?: string;
      postCallPromptId?: string;
      transferTrunkId?: string;
      transferDestination?: string;
      transferMode?: 'internal' | 'trunk';
    };

    const menu = await ctx.ivrMenuRepo.findById(id);
    if (!menu) {
      return reply.status(404).send({ error: 'Not Found', message: 'IVR menu not found' });
    }

    if (!body.keyPress || !body.actionType) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'keyPress and actionType required',
      });
    }

    // Check if key already exists for this menu
    const existingOption = await ctx.ivrMenuRepo.findOptionByKey(id, body.keyPress);
    if (existingOption) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `Key "${body.keyPress}" is already configured for this menu`,
      });
    }

    const option = await ctx.ivrMenuRepo.addOption({
      menuId: id,
      keyPress: body.keyPress,
      actionType: body.actionType as any,
      destination: body.destination || null,
      preConnectPromptId: body.preConnectPromptId || null,
      postCallPromptId: body.postCallPromptId || null,
      transferTrunkId: body.transferTrunkId || null,
      transferDestination: body.transferDestination || null,
      transferMode: body.transferMode || 'internal',
    });

    return reply.status(201).send(option);
  });

  // Update option - requires ivr.manage
  server.put('/options/:id', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      keyPress?: string;
      actionType?: string;
      destination?: string;
      preConnectPromptId?: string;
      postCallPromptId?: string;
      transferTrunkId?: string;
      transferDestination?: string;
      transferMode?: 'internal' | 'trunk';
    };

    const success = await ctx.ivrMenuRepo.updateOption(id, body as any);
    if (!success) {
      return reply.status(404).send({ error: 'Not Found', message: 'Option not found' });
    }

    return { success: true };
  });

  // Delete option - requires ivr.manage
  server.delete('/options/:id', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const success = await ctx.ivrMenuRepo.deleteOption(id);
    if (!success) {
      return reply.status(404).send({ error: 'Not Found', message: 'Option not found' });
    }

    return { success: true };
  });

  // List prompts - requires prompts.view
  server.get('/prompts', {
    preHandler: [ctx.requirePermission('prompts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const prompts = await ctx.promptRepo.findAll();
    return { prompts };
  });

  // List routing rules - requires routing.view
  server.get('/routing', {
    preHandler: [ctx.requirePermission('routing.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const rules = await ctx.routingRepo.findAll();
    return { rules };
  });

  // Create routing rule - requires routing.manage
  server.post('/routing', {
    preHandler: [ctx.requirePermission('routing.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      did: string;
      targetType: string;
      targetId: string;
      enabled?: boolean;
    };

    if (!body.did || !body.targetType || !body.targetId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'did, targetType, and targetId required',
      });
    }

    const rule = await ctx.routingRepo.create({
      did: body.did,
      targetType: body.targetType as any,
      targetId: body.targetId,
      enabled: body.enabled !== false,
    });

    return reply.status(201).send(rule);
  });

  // Update routing rule - requires routing.manage
  server.put('/routing/:id', {
    preHandler: [ctx.requirePermission('routing.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      did?: string;
      targetType?: string;
      targetId?: string;
      enabled?: boolean;
    };

    const rule = await ctx.routingRepo.findById(id);
    if (!rule) {
      return reply.status(404).send({ error: 'Not Found', message: 'Routing rule not found' });
    }

    const success = await ctx.routingRepo.update(id, body as any);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update rule' });
    }

    const updated = await ctx.routingRepo.findById(id);
    return updated;
  });

  // Delete routing rule - requires routing.manage
  server.delete('/routing/:id', {
    preHandler: [ctx.requirePermission('routing.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const success = await ctx.routingRepo.delete(id);
    if (!success) {
      return reply.status(404).send({ error: 'Not Found', message: 'Routing rule not found' });
    }

    return { success: true };
  });

  // Test IVR menu by calling into it - requires ivr.manage
  // Supports both internal extension test and external phone number test
  server.post('/menus/:id/test-call', {
    preHandler: [ctx.requirePermission('ivr.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { extension, phoneNumber, trunkId } = request.body as {
      extension?: string;
      phoneNumber?: string;  // External phone number (like AI agent test)
      trunkId?: string;      // Trunk to use for external calls
    };

    const menu = await ctx.ivrMenuRepo.findByIdWithOptions(id);
    if (!menu) {
      return reply.status(404).send({ error: 'Not Found', message: 'IVR menu not found' });
    }

    if (!ctx.amiClient) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'AMI connection not available',
      });
    }

    try {
      // External phone number call (like AI agent test)
      if (phoneNumber) {
        // Get trunk - either specified or first enabled
        let trunk;
        if (trunkId) {
          trunk = await ctx.db.get<{ id: string; name: string; username: string; from_user: string | null }>(
            'SELECT id, name, username, from_user FROM sip_trunks WHERE id = $1 AND enabled = 1',
            [trunkId]
          );
          if (!trunk) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'Specified trunk not found or not enabled',
            });
          }
        } else {
          trunk = await ctx.db.get<{ id: string; name: string; username: string; from_user: string | null }>(
            'SELECT id, name, username, from_user FROM sip_trunks WHERE enabled = 1 LIMIT 1'
          );
          if (!trunk) {
            return reply.status(503).send({
              error: 'Service Unavailable',
              message: 'No enabled SIP trunk available',
            });
          }
        }

        // Build the channel string
        const trunkName = trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const channel = `PJSIP/${phoneNumber}@${trunkName}`;
        const cid = trunk.from_user || trunk.username;

        const result = await ctx.amiClient.originate({
          channel,
          context: 'ivr-test',
          exten: 's',
          priority: 1,
          callerid: `"IVR Test" <${cid}>`,
          timeout: 30000,
          variable: `IVR_MENU_ID=${menu.id}`,
        });

        return {
          success: true,
          message: `Calling ${phoneNumber} via trunk "${trunk.name}" and connecting to IVR "${menu.name}"`,
          menuId: menu.id,
          menuName: menu.name,
          phoneNumber,
          trunkName: trunk.name,
          actionId: result.ActionID,
        };
      }

      // Internal extension call (original behavior)
      if (extension) {
        // Originate call to extension, then connect to IVR
        const ext = await ctx.extensionRepo.findByNumber(extension);
        if (!ext) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Extension ${extension} not found`,
          });
        }

        const result = await ctx.amiClient.originate({
          channel: `PJSIP/${extension}`,
          context: 'ivr-test',
          exten: 's',
          priority: 1,
          callerid: '"IVR Test" <000>',
          timeout: 30000,
          variable: `IVR_MENU_ID=${menu.id}`,
        });

        return {
          success: true,
          message: `Calling extension ${extension} and connecting to IVR "${menu.name}"`,
          menuId: menu.id,
          menuName: menu.name,
          extension,
          actionId: result.ActionID,
        };
      }

      // Return instructions for testing
      return {
        success: true,
        message: 'To test this IVR, provide an extension or phone number',
        menuId: menu.id,
        menuName: menu.name,
        options: menu.options?.length || 0,
        instructions: 'POST with { "extension": "1001" } or { "phoneNumber": "+1234567890", "trunkId": "..." }',
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Call Failed',
        message: error.message || 'Failed to initiate test call',
      });
    }
  });
}
