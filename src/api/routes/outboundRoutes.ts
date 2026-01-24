import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerOutboundRouteRoutes(server: FastifyInstance, ctx: ApiContext) {
  // List all outbound routes
  server.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const routes = await ctx.outboundRouteRepo.findAll();
    return { routes };
  });

  // Get single route
  server.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const route = await ctx.outboundRouteRepo.findById(id);

    if (!route) {
      return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
    }

    return route;
  });

  // Create outbound route
  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      pattern: string;
      trunkId: string;
      priority?: number;
      prefixToAdd?: string;
      prefixToStrip?: number;
      callerId?: string;
      enabled?: boolean;
    };

    if (!body.name || !body.pattern || !body.trunkId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Name, pattern, and trunkId are required',
      });
    }

    // Verify trunk exists
    const trunk = await ctx.trunkRepo.findById(body.trunkId);
    if (!trunk) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Trunk not found',
      });
    }

    try {
      const route = await ctx.outboundRouteRepo.create(body);
      return reply.status(201).send(route);
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Update outbound route
  server.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      pattern: string;
      trunkId: string;
      priority: number;
      prefixToAdd: string | null;
      prefixToStrip: number;
      callerId: string | null;
      enabled: boolean;
    }>;

    const route = await ctx.outboundRouteRepo.findById(id);
    if (!route) {
      return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
    }

    // If changing trunk, verify it exists
    if (body.trunkId) {
      const trunk = await ctx.trunkRepo.findById(body.trunkId);
      if (!trunk) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Trunk not found',
        });
      }
    }

    try {
      const updated = await ctx.outboundRouteRepo.update(id, body);
      return updated;
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Delete outbound route
  server.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const route = await ctx.outboundRouteRepo.findById(id);
    if (!route) {
      return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
    }

    try {
      await ctx.outboundRouteRepo.delete(id);
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Reorder routes
  server.post('/reorder', async (request: FastifyRequest, reply: FastifyReply) => {
    const { routeIds } = request.body as { routeIds: string[] };

    if (!Array.isArray(routeIds)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'routeIds must be an array',
      });
    }

    try {
      await ctx.outboundRouteRepo.reorder(routeIds);
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Test which route matches a number
  server.post('/test-match', async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = request.body as { number: string };

    if (!number) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Number is required',
      });
    }

    const matchingRoute = await ctx.outboundRouteRepo.findMatchingRoute(number);

    return {
      number,
      matched: !!matchingRoute,
      route: matchingRoute,
    };
  });
}
