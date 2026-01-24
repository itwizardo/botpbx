import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { kokoroSetupService } from '../../services/kokoroSetupService';

// Valid Piper model ID pattern: xx_XX-name-quality (e.g., en_US-lessac-medium)
const PIPER_MODEL_PATTERN = /^[a-z]{2}_[A-Z]{2}-[\w_]+-(?:low|medium|high|x_low)$/;

// Valid Kokoro model ID pattern: af_name, am_name, bf_name, bm_name
const KOKORO_MODEL_PATTERN = /^[ab][fm]_\w+$/;

// Model validation functions - frontend is source of truth for available models
function isValidPiperModel(modelId: string): boolean {
  return PIPER_MODEL_PATTERN.test(modelId);
}

function isValidKokoroModel(modelId: string): boolean {
  return KOKORO_MODEL_PATTERN.test(modelId);
}

function isValidModelForProvider(provider: string, modelId: string): boolean {
  switch (provider) {
    case 'piper':
      return isValidPiperModel(modelId);
    case 'kokoro':
      return isValidKokoroModel(modelId);
    default:
      return false;
  }
}

// Supported providers
const SUPPORTED_PROVIDERS = ['piper', 'kokoro'];

// Base path for local TTS installations
const LOCAL_TTS_BASE_PATH = process.env.LOCAL_TTS_PATH || '/opt/botpbx/local-tts';

export function registerLocalTtsRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get status of all local TTS providers
  server.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const piperInstalled = await getInstalledModels(ctx, 'piper');
    const kokoroInstalled = await getInstalledModels(ctx, 'kokoro');
    const piperSelectedVoice = await ctx.settingsRepo.get('local_tts_piper_voice');
    const kokoroSelectedVoice = await ctx.settingsRepo.get('local_tts_kokoro_voice');

    // Check Kokoro server status
    const kokoroStatus = await kokoroSetupService.getStatus();

    return {
      piper: {
        installed: piperInstalled.length > 0,
        modelsCount: piperInstalled.length,
        installedModels: piperInstalled,
        selectedVoice: piperSelectedVoice,
        available: true,
      },
      kokoro: {
        installed: kokoroInstalled.length > 0,
        modelsCount: kokoroInstalled.length,
        installedModels: kokoroInstalled,
        selectedVoice: kokoroSelectedVoice,
        available: true,
        serverRunning: kokoroStatus.serverRunning,
        setupComplete: kokoroStatus.installed,
      },
    };
  });

  // Get status for a specific provider
  server.get('/:provider/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);
    const selectedVoice = await ctx.settingsRepo.get(`local_tts_${provider}_voice`);

    return {
      provider,
      installed: installedModels.length > 0,
      modelsCount: installedModels.length,
      installedModels,
      selectedVoice,
      // Frontend has the full model list - backend just tracks installed models
    };
  });

  // Get available models for a provider (frontend is source of truth)
  server.get('/:provider/models', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);

    // Return installed models - frontend has the full available list
    return {
      provider,
      installedModels,
    };
  });

  // Get installed models for a provider
  server.get('/:provider/installed', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);

    return {
      provider,
      installedModels,
    };
  });

  // Install models for a provider
  server.post('/:provider/install', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider } = request.params as { provider: string };
    const { modelIds } = request.body as { modelIds: string[] };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'modelIds array is required' });
    }

    // Validate model IDs using pattern matching
    const validModelIds = modelIds.filter(id => isValidModelForProvider(provider, id));
    if (validModelIds.length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'No valid model IDs provided' });
    }

    // For Kokoro, ensure the server is set up and running
    if (provider === 'kokoro') {
      const isRunning = await kokoroSetupService.isServerRunning();
      if (!isRunning) {
        request.log.info('Kokoro server not running, initiating setup...');
        const setupResult = await kokoroSetupService.ensureSetup();
        if (!setupResult.success) {
          return reply.status(500).send({
            error: 'Setup Failed',
            message: setupResult.error || 'Failed to set up Kokoro TTS server',
            details: 'Kokoro TTS requires Python environment setup. Check server logs for details.'
          });
        }
        request.log.info('Kokoro setup completed successfully');
      }
    }

    // Get currently installed models
    const installedModels = await getInstalledModels(ctx, provider);
    const newModels = validModelIds.filter(id => !installedModels.includes(id));

    if (newModels.length === 0) {
      return { success: true, message: 'All models already installed', installedModels };
    }

    // Save installed models to settings
    const updatedModels = [...installedModels, ...newModels];
    await ctx.settingsRepo.set(`local_tts_${provider}_models`, JSON.stringify(updatedModels));

    // Set default voice if not set
    const currentVoice = await ctx.settingsRepo.get(`local_tts_${provider}_voice`);
    if (!currentVoice && updatedModels.length > 0) {
      await ctx.settingsRepo.set(`local_tts_${provider}_voice`, updatedModels[0]);
    }

    // Broadcast update via WebSocket
    ctx.wsManager.broadcast('system', 'local-tts:installed', {
      provider,
      modelIds: newModels,
      totalInstalled: updatedModels.length,
    });

    return {
      success: true,
      message: `Installed ${newModels.length} model(s)`,
      installedModels: updatedModels,
      newlyInstalled: newModels,
    };
  });

  // Uninstall a model
  server.delete('/:provider/models/:modelId', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider, modelId } = request.params as { provider: string; modelId: string };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);

    if (!installedModels.includes(modelId)) {
      return reply.status(404).send({ error: 'Not Found', message: 'Model not installed' });
    }

    // Remove from installed list
    const updatedModels = installedModels.filter(id => id !== modelId);
    await ctx.settingsRepo.set(`local_tts_${provider}_models`, JSON.stringify(updatedModels));

    // Update selected voice if it was the uninstalled model
    const currentVoice = await ctx.settingsRepo.get(`local_tts_${provider}_voice`);
    if (currentVoice === modelId) {
      const newVoice = updatedModels.length > 0 ? updatedModels[0] : null;
      if (newVoice) {
        await ctx.settingsRepo.set(`local_tts_${provider}_voice`, newVoice);
      } else {
        await ctx.settingsRepo.delete(`local_tts_${provider}_voice`);
      }
    }

    // Broadcast update via WebSocket
    ctx.wsManager.broadcast('system', 'local-tts:uninstalled', {
      provider,
      modelId,
      remainingModels: updatedModels.length,
    });

    return {
      success: true,
      message: `Uninstalled model: ${modelId}`,
      installedModels: updatedModels,
    };
  });

  // Set selected voice for a provider
  server.put('/:provider/voice', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider } = request.params as { provider: string };
    const { modelId } = request.body as { modelId: string };

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);

    if (!installedModels.includes(modelId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Model not installed' });
    }

    await ctx.settingsRepo.set(`local_tts_${provider}_voice`, modelId);

    return {
      success: true,
      selectedVoice: modelId,
    };
  });

  // Test TTS generation - actually generates audio using the TTS service
  server.post('/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider, modelId, text } = request.body as {
      provider: string;
      modelId: string;
      text?: string;
    };

    if (!provider || !modelId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'provider and modelId are required' });
    }

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: 'Not Found', message: `Unknown provider: ${provider}` });
    }

    const installedModels = await getInstalledModels(ctx, provider);
    if (!installedModels.includes(modelId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Model not installed' });
    }

    const testText = text || 'Hello, this is a test of the local text to speech system.';
    const previewId = `local_tts_test_${Date.now()}`;

    // Save current provider and switch to the local TTS provider
    const originalProvider = ctx.ttsService.getProvider();

    if (provider === 'piper') {
      ctx.ttsService.setProvider('piper');
    } else if (provider === 'kokoro') {
      ctx.ttsService.setProvider('kokoro');
    } else {
      return reply.status(501).send({
        error: 'Not Implemented',
        message: `${provider} TTS is not yet implemented`
      });
    }

    // Generate actual audio
    const result = await ctx.ttsService.generateAudio(testText, previewId, { voice: modelId });

    // Restore original provider
    ctx.ttsService.setProvider(originalProvider);

    if (!result.success) {
      return reply.status(500).send({
        error: 'TTS Error',
        message: result.error || 'Failed to generate audio'
      });
    }

    return {
      success: true,
      provider,
      model: modelId,
      text: testText,
      previewId,
      message: 'Test audio generated successfully',
    };
  });
}

// Helper function to get installed models from settings
async function getInstalledModels(ctx: ApiContext, provider: string): Promise<string[]> {
  const modelsJson = await ctx.settingsRepo.get(`local_tts_${provider}_models`);
  if (!modelsJson) return [];
  try {
    return JSON.parse(modelsJson);
  } catch {
    return [];
  }
}
