import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerWebRTCRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get WebRTC password for browser phone
  // This is protected by authentication - only logged in users can get the password
  server.get('/password', async (request: FastifyRequest, reply: FastifyReply) => {
    // Require authentication
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const password = process.env.BROWSER_WEBRTC_PASSWORD || 'ChangeThisPassword!';

    return {
      password,
    };
  });
}
