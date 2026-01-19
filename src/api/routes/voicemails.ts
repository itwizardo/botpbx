/**
 * Voicemail API Routes
 * Endpoints for managing voicemails
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { ApiContext } from '../server';
import { apiLogger } from '../../utils/logger';

export function registerVoicemailRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // List voicemails - requires voicemails.view
  server.get('/', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', offset = '0', mailbox, unread } = request.query as {
      limit?: string;
      offset?: string;
      mailbox?: string;
      unread?: string;
    };

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;

    let voicemails;
    if (mailbox) {
      voicemails = await ctx.voicemailRepo.findByMailbox(mailbox, {
        unreadOnly: unread === 'true',
        limit: limitNum,
        offset: offsetNum,
      });
    } else {
      voicemails = await ctx.voicemailRepo.findRecent(limitNum, offsetNum);
    }

    const total = await ctx.voicemailRepo.count(mailbox, unread === 'true');

    return {
      voicemails,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + voicemails.length < total,
      },
    };
  });

  // Get voicemail stats
  server.get('/stats', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await ctx.voicemailRepo.getStats();
    const unreadByMailbox = await ctx.voicemailRepo.getUnreadCountByMailbox();

    return {
      ...stats,
      unreadByMailbox: Object.fromEntries(unreadByMailbox),
    };
  });

  // Get single voicemail
  server.get('/:id', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    // Get transcription if available
    let transcription = null;
    if (voicemail.transcriptionId) {
      transcription = await ctx.transcriptionRepo.findTranscriptionById(voicemail.transcriptionId);
    } else {
      // Check for pending/processing job
      transcription = await ctx.transcriptionRepo.findTranscriptionBySource('voicemail', id);
    }

    // Get job if no transcription
    let job = null;
    if (!transcription) {
      job = await ctx.transcriptionRepo.findJobBySource('voicemail', id);
    }

    return {
      voicemail,
      transcription,
      job: job ? {
        id: job.id,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        errorMessage: job.errorMessage,
      } : null,
    };
  });

  // Stream voicemail audio
  server.get('/:id/stream', {
    preHandler: [ctx.requirePermission('recordings.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    if (!fs.existsSync(voicemail.filePath)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail audio file not found',
      });
    }

    const stat = fs.statSync(voicemail.filePath);
    const fileSize = stat.size;
    const range = request.headers.range;

    // Determine content type based on extension
    const ext = path.extname(voicemail.filePath).toLowerCase();
    const contentType = ext === '.gsm' ? 'audio/x-gsm' : 'audio/wav';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(voicemail.filePath, { start, end });

      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunkSize);
      reply.header('Content-Type', contentType);

      return reply.send(stream);
    }

    reply.header('Content-Length', fileSize);
    reply.header('Content-Type', contentType);
    reply.header('Accept-Ranges', 'bytes');

    const stream = fs.createReadStream(voicemail.filePath);
    return reply.send(stream);
  });

  // Download voicemail
  server.get('/:id/download', {
    preHandler: [ctx.requirePermission('recordings.download')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    if (!fs.existsSync(voicemail.filePath)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail audio file not found',
      });
    }

    const filename = path.basename(voicemail.filePath);
    const ext = path.extname(voicemail.filePath).toLowerCase();
    const contentType = ext === '.gsm' ? 'audio/x-gsm' : 'audio/wav';

    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', contentType);

    const stream = fs.createReadStream(voicemail.filePath);
    return reply.send(stream);
  });

  // Mark voicemail as read
  server.put('/:id/read', {
    preHandler: [ctx.requirePermission('recordings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    await ctx.voicemailRepo.markAsRead(id);
    return { success: true, read: true };
  });

  // Mark voicemail as unread
  server.put('/:id/unread', {
    preHandler: [ctx.requirePermission('recordings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    await ctx.voicemailRepo.markAsUnread(id);
    return { success: true, read: false };
  });

  // Trigger transcription for a voicemail
  server.post('/:id/transcribe', {
    preHandler: [ctx.requirePermission('recordings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { provider, language } = request.body as {
      provider?: string;
      language?: string;
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
        message: 'No transcription providers configured',
      });
    }

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    if (!fs.existsSync(voicemail.filePath)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail audio file not found',
      });
    }

    try {
      const job = await ctx.transcriptionService.queueTranscription(
        'voicemail',
        id,
        voicemail.filePath,
        { provider, language, priority: 5 }
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
      apiLogger.error(`Failed to queue transcription for voicemail ${id}:`, error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error instanceof Error ? error.message : 'Failed to queue transcription',
      });
    }
  });

  // Delete voicemail
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('recordings.delete')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const voicemail = await ctx.voicemailRepo.findById(id);
    if (!voicemail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Voicemail not found',
      });
    }

    // Delete file if exists
    if (fs.existsSync(voicemail.filePath)) {
      try {
        fs.unlinkSync(voicemail.filePath);
        // Also delete .txt metadata file if exists
        const txtPath = voicemail.filePath.replace(/\.(wav|gsm)$/i, '.txt');
        if (fs.existsSync(txtPath)) {
          fs.unlinkSync(txtPath);
        }
      } catch (error) {
        apiLogger.error(`Failed to delete voicemail files: ${voicemail.filePath}`, error);
      }
    }

    // Delete from database
    const success = await ctx.voicemailRepo.delete(id);
    if (!success) {
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to delete voicemail',
      });
    }

    return { success: true };
  });

  // Scan for existing voicemails
  server.post('/scan', {
    preHandler: [ctx.requirePermission('settings.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ctx.voicemailWatcher) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Voicemail watcher not initialized',
      });
    }

    try {
      const count = await ctx.voicemailWatcher.scanExisting();
      return {
        success: true,
        scanned: count,
        message: `Scanned ${count} voicemail files`,
      };
    } catch (error) {
      apiLogger.error('Failed to scan voicemails:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error instanceof Error ? error.message : 'Failed to scan voicemails',
      });
    }
  });
}
