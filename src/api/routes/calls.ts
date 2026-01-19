import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { v4 as uuidv4 } from 'uuid';

export function registerCallRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get active calls
  server.get('/active', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ctx.amiClient) {
      return { calls: [], count: 0 };
    }

    try {
      const channels = await ctx.amiClient.getActiveChannels();

      // Map to a cleaner format for the frontend
      const calls = channels.map(ch => ({
        id: ch.channel,
        channel: ch.channel,
        callerId: ch.callerIdNum || 'Unknown',
        callerIdName: ch.callerIdName || '',
        context: ch.context,
        extension: ch.extension,
        state: ch.state,
        duration: ch.duration,
        application: ch.application,
      }));

      return {
        calls,
        count: calls.length,
      };
    } catch (error) {
      return { calls: [], count: 0 };
    }
  });

  // Get call logs with pagination
  server.get('/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', offset = '0', startDate, endDate } = request.query as {
      limit?: string;
      offset?: string;
      startDate?: string;
      endDate?: string;
    };

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;

    let calls;
    if (startDate && endDate) {
      const start = Math.floor(new Date(startDate).getTime() / 1000);
      const end = Math.floor(new Date(endDate).getTime() / 1000);
      calls = await ctx.callLogRepo.findByTimeRange(start, end);
      // Apply pagination manually for date range
      calls = calls.slice(offsetNum, offsetNum + limitNum);
    } else {
      calls = await ctx.callLogRepo.findRecent(limitNum, offsetNum);
    }

    const total = await ctx.callLogRepo.count();

    return {
      calls,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + calls.length < total,
      },
    };
  });

  // Get single call log
  server.get('/logs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const call = await ctx.callLogRepo.findById(id);
    if (!call) {
      return reply.status(404).send({ error: 'Not Found', message: 'Call log not found' });
    }

    // Get recording if exists
    const recording = await ctx.recordingRepo.findByCallLogId(id);

    return {
      ...call,
      recording: recording ? {
        id: recording.id,
        status: recording.status,
        durationSeconds: recording.durationSeconds,
        fileSize: recording.fileSize,
      } : null,
    };
  });

  // Get today's calls
  server.get('/today', async (request: FastifyRequest, reply: FastifyReply) => {
    const calls = await ctx.callLogRepo.findToday();
    return {
      calls,
      count: calls.length,
    };
  });

  // Hangup a channel
  server.post('/hangup', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const { channel } = request.body as { channel: string };

    if (!channel) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Channel required' });
    }

    if (!ctx.amiClient) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'AMI not connected' });
    }

    try {
      await ctx.amiClient.hangup(channel);
      return { success: true, message: `Hungup channel ${channel}` };
    } catch (error) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to hangup call' });
    }
  });

  // Spy on a channel (ChanSpy)
  server.post('/spy', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const { channel, extension } = request.body as { channel: string; extension?: string };

    if (!channel) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Channel required' });
    }

    if (!ctx.amiClient) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'AMI not connected' });
    }

    // Extract the channel prefix for ChanSpy (e.g., PJSIP/1001 from PJSIP/1001-00000001)
    const channelPrefix = channel.split('-')[0];

    try {
      // Originate a call to the extension that will spy on the channel
      const spyExtension = extension || '1001'; // Default spy extension
      await ctx.amiClient.originate({
        channel: `PJSIP/${spyExtension}`,
        context: 'spy',
        exten: 's',
        priority: 1,
        callerid: 'Spy <*99>',
        variable: `SPYCHAN=${channelPrefix}`,
      });
      return { success: true, message: `Spying on ${channelPrefix}` };
    } catch (error) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to start spy' });
    }
  });

  // Browser-based spy (listen to call from web browser without extension)
  server.post('/browser-spy', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const { channel } = request.body as { channel: string };

    if (!channel) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Channel required' });
    }

    if (!ctx.amiClient) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'AMI not connected' });
    }

    if (!ctx.browserAudioServer) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'Browser audio server not running' });
    }

    // Extract the channel prefix for ChanSpy (e.g., PJSIP/1001 from PJSIP/1001-00000001)
    const channelPrefix = channel.split('-')[0];

    // Generate a unique audio session ID (UUID without dashes for Asterisk)
    const audioSessionId = uuidv4().replace(/-/g, '');

    try {
      // Originate a call to the browser-spy context
      // This will connect to AudioSocket on port 9093 for audio streaming
      await ctx.amiClient.originate({
        channel: 'Local/s@browser-spy',
        context: 'browser-spy-setup',
        exten: 's',
        priority: 1,
        callerid: 'BrowserSpy <*98>',
        variable: `SPYCHAN=${channelPrefix},AUDIO_SESSION_ID=${audioSessionId}`,
      });

      return {
        success: true,
        audioSessionId,
        message: `Browser spy started for ${channelPrefix}`,
        audioFormat: {
          sampleRate: 8000,
          bitsPerSample: 16,
          channels: 1,
          encoding: 'pcm-s16le',
        },
      };
    } catch (error) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to start browser spy' });
    }
  });

  // Stop browser spy session
  server.delete('/browser-spy/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const { sessionId } = request.params as { sessionId: string };

    if (!ctx.browserAudioServer) {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'Browser audio server not running' });
    }

    const stopped = ctx.browserAudioServer.stopSession(sessionId);
    if (stopped) {
      return { success: true, message: 'Browser spy session stopped' };
    } else {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }
  });

  // Get active browser spy sessions
  server.get('/browser-spy', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    if (!ctx.browserAudioServer) {
      return { sessions: [] };
    }

    const sessions = ctx.browserAudioServer.getActiveSessions();
    return { sessions };
  });
}
