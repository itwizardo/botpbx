import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { generateSecurePassword } from '../../db/repositories/extensionRepository';
import { getPublicIP } from '../../utils/network';

export function registerExtensionRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List extensions - requires extensions.view
  server.get('/', {
    preHandler: [ctx.requirePermission('extensions.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const extensions = await ctx.extensionRepo.findAll();
    return { extensions };
  });

  // Get single extension - requires extensions.view
  server.get('/:number', {
    preHandler: [ctx.requirePermission('extensions.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    // Don't expose password
    const { password, ...safe } = extension;
    return safe;
  });

  // Create extension (auto-generates password if not provided) - requires extensions.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      number: string;
      name: string;
      password?: string;
      enabled?: boolean;
    };

    if (!body.number || !body.name) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'number and name required',
      });
    }

    // Check if exists
    const existing = await ctx.extensionRepo.findByNumber(body.number);
    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Extension number already exists',
      });
    }

    // Auto-generate password if not provided
    const password = body.password || generateSecurePassword();

    const extension = await ctx.extensionRepo.create({
      number: body.number,
      name: body.name,
      password: password,
      enabled: body.enabled !== false,
    });

    // Regenerate Asterisk configs and reload PJSIP
    await ctx.reloadAsteriskPJSIP();

    // Return password on creation so user can see it
    const serverIP = await getPublicIP();
    return reply.status(201).send({
      ...extension,
      sipDetails: {
        server: serverIP,
        port: 5060,
        username: extension.number,
        password: password,
      },
    });
  });

  // Get SIP details for an extension (includes password) - requires extensions.manage
  server.get('/:number/sip-details', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const serverIP = await getPublicIP();
    return {
      extension: extension.number,
      name: extension.name,
      sipDetails: {
        server: serverIP,
        port: 5060,
        username: extension.number,
        password: extension.password,
      },
    };
  });

  // Regenerate password for an extension - requires extensions.manage
  server.post('/:number/regenerate-password', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const newPassword = await ctx.extensionRepo.regeneratePassword(number);
    if (!newPassword) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const serverIP = await getPublicIP();
    return {
      success: true,
      sipDetails: {
        server: serverIP,
        port: 5060,
        username: number,
        password: newPassword,
      },
    };
  });

  // Update extension - requires extensions.manage
  server.put('/:number', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };
    const body = request.body as {
      name?: string;
      password?: string;
      enabled?: boolean;
    };

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const success = await ctx.extensionRepo.update(number, body);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update extension' });
    }

    // Regenerate Asterisk configs and reload PJSIP
    await ctx.reloadAsteriskPJSIP();

    const updated = await ctx.extensionRepo.findByNumber(number);
    if (updated) {
      const { password, ...safe } = updated;
      return safe;
    }

    return { success: true };
  });

  // Delete extension - requires extensions.manage
  server.delete('/:number', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const success = await ctx.extensionRepo.delete(number);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete extension' });
    }

    // Regenerate Asterisk configs and reload PJSIP
    await ctx.reloadAsteriskPJSIP();

    return { success: true };
  });

  // =============================================
  // DO NOT DISTURB ENDPOINTS
  // =============================================

  // Get DND status - requires extensions.view
  server.get('/:number/dnd', {
    preHandler: [ctx.requirePermission('extensions.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const status = await ctx.extensionRepo.getDNDStatus(number);
    if (status === null) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    return { extension: number, dndEnabled: status };
  });

  // Set DND status - requires extensions.manage
  server.put('/:number/dnd', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };
    const body = request.body as { enabled: boolean };

    if (body.enabled === undefined) {
      return reply.status(400).send({ error: 'Bad Request', message: 'enabled field required' });
    }

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const success = await ctx.extensionRepo.setDND(number, body.enabled);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update DND status' });
    }

    // Regenerate Asterisk dialplan
    await ctx.reloadAsteriskDialplan();

    return { success: true, extension: number, dndEnabled: body.enabled };
  });

  // Toggle DND status - requires extensions.manage
  server.post('/:number/dnd/toggle', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const newStatus = !extension.dndEnabled;
    const success = await ctx.extensionRepo.setDND(number, newStatus);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to toggle DND' });
    }

    // Regenerate Asterisk dialplan
    await ctx.reloadAsteriskDialplan();

    return { success: true, extension: number, dndEnabled: newStatus };
  });

  // =============================================
  // CALL FORWARDING ENDPOINTS
  // =============================================

  // Get forwarding settings - requires extensions.view
  server.get('/:number/forwarding', {
    preHandler: [ctx.requirePermission('extensions.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };

    const forwarding = await ctx.extensionRepo.getForwarding(number);
    if (forwarding === null) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    return { extension: number, forwarding };
  });

  // Set forwarding settings - requires extensions.manage
  server.put('/:number/forwarding', {
    preHandler: [ctx.requirePermission('extensions.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.params as { number: string };
    const body = request.body as {
      enabled: boolean;
      destination?: string;
      type?: 'always' | 'busy' | 'noanswer' | 'unavailable';
      timeout?: number;
    };

    if (body.enabled === undefined) {
      return reply.status(400).send({ error: 'Bad Request', message: 'enabled field required' });
    }

    // If enabling, destination is required
    if (body.enabled && !body.destination) {
      return reply.status(400).send({ error: 'Bad Request', message: 'destination required when enabling forwarding' });
    }

    const extension = await ctx.extensionRepo.findByNumber(number);
    if (!extension) {
      return reply.status(404).send({ error: 'Not Found', message: 'Extension not found' });
    }

    const success = await ctx.extensionRepo.setForwarding(number, {
      enabled: body.enabled,
      destination: body.destination,
      type: body.type || 'always',
      timeout: body.timeout || 20,
    });

    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update forwarding' });
    }

    // Regenerate Asterisk dialplan
    await ctx.reloadAsteriskDialplan();

    const updated = await ctx.extensionRepo.getForwarding(number);
    return { success: true, extension: number, forwarding: updated };
  });
}
