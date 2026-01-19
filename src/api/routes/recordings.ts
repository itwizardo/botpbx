import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { ApiContext } from '../server';
import { apiLogger } from '../../utils/logger';

export function registerRecordingRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List recordings - requires recordings.view
  server.get('/', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', offset = '0' } = request.query as {
      limit?: string;
      offset?: string;
    };

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;

    const recordings = await ctx.recordingRepo.findRecent(limitNum, offsetNum);
    const total = await ctx.recordingRepo.count();

    return {
      recordings,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + recordings.length < total,
      },
    };
  });

  // Get single recording - requires recordings.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    return recording;
  });

  // Stream recording audio - requires recordings.view
  server.get('/:id/stream', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    if (recording.status !== 'completed') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Recording not ready' });
    }

    const filePath = recording.filePath;
    if (!fs.existsSync(filePath)) {
      apiLogger.error(`Recording file not found: ${filePath}`);
      return reply.status(404).send({ error: 'Not Found', message: 'Recording file not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = request.headers.range;

    if (range) {
      // Support range requests for seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(filePath, { start, end });

      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunkSize);
      reply.header('Content-Type', 'audio/wav');

      return reply.send(stream);
    }

    reply.header('Content-Length', fileSize);
    reply.header('Content-Type', 'audio/wav');
    reply.header('Accept-Ranges', 'bytes');

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // Download recording - requires recordings.download
  server.get('/:id/download', {
    preHandler: [ctx.requirePermission('recordings.download')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    if (recording.status !== 'completed') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Recording not ready' });
    }

    const filePath = recording.filePath;
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording file not found' });
    }

    const filename = path.basename(filePath);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'audio/wav');

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // Delete recording - requires recordings.delete
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('recordings.delete')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    // Delete file if exists
    if (fs.existsSync(recording.filePath)) {
      try {
        fs.unlinkSync(recording.filePath);
      } catch (error) {
        apiLogger.error(`Failed to delete recording file: ${recording.filePath}`, error);
      }
    }

    // Delete from database
    const success = await ctx.recordingRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete recording' });
    }

    return { success: true };
  });

  // Get transcription for a recording - requires recordings.view
  server.get('/:id/transcription', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    const transcription = await ctx.transcriptionRepo.findTranscriptionBySource('recording', id);
    const job = transcription ? null : await ctx.transcriptionRepo.findJobBySource('recording', id);

    return {
      transcription,
      job: job ? {
        id: job.id,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      } : null,
    };
  });

  // Trigger transcription for a recording - requires recordings.manage
  server.post('/:id/transcribe', {
    preHandler: [ctx.requirePermission('recordings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { provider, language, priority } = request.body as {
      provider?: string;
      language?: string;
      priority?: number;
    };

    if (!ctx.transcriptionService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Transcription service not initialized',
      });
    }

    if (!ctx.transcriptionService.hasProviders()) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'No transcription providers configured. Please add API keys in Settings > AI Providers.',
      });
    }

    const recording = await ctx.recordingRepo.findById(id);
    if (!recording) {
      return reply.status(404).send({ error: 'Not Found', message: 'Recording not found' });
    }

    if (recording.status !== 'completed') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Recording is not ready' });
    }

    try {
      const job = await ctx.transcriptionService.queueTranscription(
        'recording',
        id,
        recording.filePath,
        { provider, language, priority }
      );

      return {
        success: true,
        job: {
          id: job.id,
          status: job.status,
          priority: job.priority,
        },
      };
    } catch (error) {
      apiLogger.error(`Failed to queue transcription for recording ${id}:`, error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error instanceof Error ? error.message : 'Failed to queue transcription',
      });
    }
  });

  // Get recording stats - requires recordings.view
  server.get('/stats', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const count = await ctx.recordingRepo.count();
    const totalSize = await ctx.recordingRepo.getTotalSize();
    const totalDuration = await ctx.recordingRepo.getTotalDuration();

    return {
      count,
      totalSize,
      totalSizeHuman: formatBytes(totalSize),
      totalDuration,
      totalDurationHuman: formatDuration(totalDuration),
    };
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
