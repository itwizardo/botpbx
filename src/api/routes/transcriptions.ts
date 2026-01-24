/**
 * Transcription API Routes
 * Endpoints for managing recording transcriptions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { apiLogger } from '../../utils/logger';

export function registerTranscriptionRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List transcriptions - requires recordings.view
  server.get('/', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', offset = '0', sourceType } = request.query as {
      limit?: string;
      offset?: string;
      sourceType?: string;
    };

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;

    const transcriptions = await ctx.transcriptionRepo.findTranscriptions(
      limitNum,
      offsetNum,
      sourceType
    );
    const total = await ctx.transcriptionRepo.countTranscriptions(sourceType);

    return {
      transcriptions,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + transcriptions.length < total,
      },
    };
  });

  // Search transcriptions - requires recordings.view
  server.get('/search', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, limit = '50' } = request.query as {
      q?: string;
      limit?: string;
    };

    if (!q || q.trim().length < 2) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Search query must be at least 2 characters',
      });
    }

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const results = await ctx.transcriptionRepo.searchTranscriptions(q, limitNum);

    return { results, query: q };
  });

  // Get transcription by ID - requires recordings.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const transcription = await ctx.transcriptionRepo.findTranscriptionById(id);
    if (!transcription) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Transcription not found',
      });
    }

    return transcription;
  });

  // Get transcription for a source (recording/voicemail) - requires recordings.view
  server.get('/source/:sourceType/:sourceId', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { sourceType, sourceId } = request.params as {
      sourceType: string;
      sourceId: string;
    };

    const transcription = await ctx.transcriptionRepo.findTranscriptionBySource(
      sourceType,
      sourceId
    );

    if (!transcription) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'No transcription found for this source',
      });
    }

    return transcription;
  });

  // Delete transcription - requires recordings.delete
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('recordings.delete')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const success = await ctx.transcriptionRepo.deleteTranscription(id);
    if (!success) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Transcription not found',
      });
    }

    return { success: true };
  });

  // ==========================================
  // JOB MANAGEMENT
  // ==========================================

  // Get job queue stats - requires recordings.view
  server.get('/jobs/stats', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ctx.transcriptionService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Transcription service not initialized',
      });
    }

    const stats = await ctx.transcriptionService.getStats();
    return {
      ...stats,
      serviceRunning: ctx.transcriptionService.isServiceRunning(),
    };
  });

  // Get job by ID - requires recordings.view
  server.get('/jobs/:id', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const job = await ctx.transcriptionRepo.findJobById(id);
    if (!job) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Transcription job not found',
      });
    }

    return job;
  });

  // ==========================================
  // RECORDING TRANSCRIPTION ENDPOINTS
  // ==========================================

  // Get transcription for a recording - requires recordings.view
  server.get('/recording/:recordingId', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { recordingId } = request.params as { recordingId: string };

    // First check if recording exists
    const recording = await ctx.recordingRepo.findById(recordingId);
    if (!recording) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Recording not found',
      });
    }

    // Get transcription
    const transcription = await ctx.transcriptionRepo.findTranscriptionBySource(
      'recording',
      recordingId
    );

    // Get job status if no transcription
    if (!transcription) {
      const job = await ctx.transcriptionRepo.findJobBySource('recording', recordingId);
      return {
        recording: {
          id: recording.id,
          callId: recording.callLogId || recording.uniqueId,
          duration: recording.durationSeconds || 0,
        },
        transcription: null,
        job: job ? {
          id: job.id,
          status: job.status,
          attempts: job.attempts,
          errorMessage: job.errorMessage,
          createdAt: job.createdAt,
        } : null,
      };
    }

    return {
      recording: {
        id: recording.id,
        callId: recording.callLogId || recording.uniqueId,
        duration: recording.durationSeconds || 0,
      },
      transcription,
      job: null,
    };
  });

  // Trigger transcription for a recording - requires recordings.manage
  server.post('/recording/:recordingId/transcribe', {
    preHandler: [ctx.requirePermission('recordings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { recordingId } = request.params as { recordingId: string };
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

    // Get recording
    const recording = await ctx.recordingRepo.findById(recordingId);
    if (!recording) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Recording not found',
      });
    }

    if (recording.status !== 'completed') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Recording is not ready',
      });
    }

    try {
      const job = await ctx.transcriptionService.queueTranscription(
        'recording',
        recordingId,
        recording.filePath,
        { provider, language, priority }
      );

      apiLogger.info(`Transcription queued for recording ${recordingId}: job ${job.id}`);

      return {
        success: true,
        job: {
          id: job.id,
          status: job.status,
          priority: job.priority,
        },
      };
    } catch (error) {
      apiLogger.error(`Failed to queue transcription for recording ${recordingId}:`, error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error instanceof Error ? error.message : 'Failed to queue transcription',
      });
    }
  });

  // ==========================================
  // SERVICE MANAGEMENT (Admin only)
  // ==========================================

  // Refresh providers (after key changes) - admin only
  server.post('/service/refresh', {
    preHandler: [ctx.requirePermission('settings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ctx.transcriptionService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Transcription service not initialized',
      });
    }

    await ctx.transcriptionService.refreshProviders();
    const stats = await ctx.transcriptionService.getStats();

    return {
      success: true,
      providersAvailable: stats.providersAvailable,
    };
  });

  // Cleanup old completed jobs - admin only
  server.post('/jobs/cleanup', {
    preHandler: [ctx.requirePermission('settings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { daysOld = 30 } = request.body as { daysOld?: number };

    if (!ctx.transcriptionService) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Transcription service not initialized',
      });
    }

    const deleted = await ctx.transcriptionService.cleanupOldJobs(daysOld);

    return {
      success: true,
      deleted,
      message: `Deleted ${deleted} completed jobs older than ${daysOld} days`,
    };
  });
}
