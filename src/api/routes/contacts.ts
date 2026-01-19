import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerContactRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get all contacts with filtering and pagination - requires contacts.view
  server.get('/', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      status?: string;
      tag?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const { contacts, total } = await ctx.contactRepo.findAll({
      status: query.status as any,
      tag: query.tag,
      search: query.search,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });

    return {
      contacts,
      total,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    };
  });

  // Get contact stats - requires contacts.view
  server.get('/stats', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return await ctx.contactRepo.getStats();
  });

  // Get single contact - requires contacts.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const contact = await ctx.contactRepo.findById(id);

    if (!contact) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    return contact;
  });

  // Create contact - requires contacts.manage
  server.post('/', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      phoneNumber: string;
      name?: string;
      email?: string;
      company?: string;
      notes?: string;
      tags?: string;
      status?: 'active' | 'dnc' | 'invalid' | 'archived';
    };

    if (!body.phoneNumber) {
      return reply.status(400).send({ error: 'Bad Request', message: 'phoneNumber is required' });
    }

    // Check for duplicate
    const existing = await ctx.contactRepo.findByPhone(body.phoneNumber);
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'Contact with this phone number already exists' });
    }

    const contact = await ctx.contactRepo.create({
      phoneNumber: body.phoneNumber,
      name: body.name || null,
      email: body.email || null,
      company: body.company || null,
      notes: body.notes || null,
      tags: body.tags || null,
      status: body.status || 'active',
    });

    return reply.status(201).send(contact);
  });

  // Update contact - requires contacts.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      phoneNumber?: string;
      name?: string;
      email?: string;
      company?: string;
      notes?: string;
      tags?: string;
      status?: 'active' | 'dnc' | 'invalid' | 'archived';
    };

    const contact = await ctx.contactRepo.update(id, body);

    if (!contact) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    return contact;
  });

  // Delete contact - requires contacts.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await ctx.contactRepo.delete(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    return { success: true };
  });

  // Bulk delete contacts - requires contacts.manage
  server.post('/bulk-delete', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ids: string[] };

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'ids array is required' });
    }

    const deleted = await ctx.contactRepo.bulkDelete(body.ids);

    return { success: true, deleted };
  });

  // Import from CSV - requires contacts.import
  server.post('/import/csv', {
    preHandler: [ctx.requirePermission('contacts.import')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      data: string;
      skipDuplicates?: boolean;
      updateExisting?: boolean;
    };

    if (!body.data) {
      return reply.status(400).send({ error: 'Bad Request', message: 'CSV data is required' });
    }

    const result = await ctx.contactRepo.importFromCSV(body.data, {
      skipDuplicates: body.skipDuplicates,
      updateExisting: body.updateExisting,
    });

    return result;
  });

  // Import from text (one number per line) - requires contacts.import
  server.post('/import/text', {
    preHandler: [ctx.requirePermission('contacts.import')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { data: string };

    if (!body.data) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Text data is required' });
    }

    const result = await ctx.contactRepo.importFromText(body.data);

    return result;
  });

  // Export to CSV - requires contacts.export
  server.get('/export/csv', {
    preHandler: [ctx.requirePermission('contacts.export')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const csv = await ctx.contactRepo.exportToCSV();

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="contacts.csv"');

    return csv;
  });

  // Mark contact as DNC (Do Not Call) - requires contacts.manage
  server.post('/:id/dnc', {
    preHandler: [ctx.requirePermission('contacts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const contact = await ctx.contactRepo.update(id, { status: 'dnc' });

    if (!contact) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    return contact;
  });

  // Search by phone number - requires contacts.view
  server.get('/search/phone/:phoneNumber', {
    preHandler: [ctx.requirePermission('contacts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { phoneNumber } = request.params as { phoneNumber: string };
    const contact = await ctx.contactRepo.findByPhone(phoneNumber);

    if (!contact) {
      return reply.status(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    return contact;
  });
}
