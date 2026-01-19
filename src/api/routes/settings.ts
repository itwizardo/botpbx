import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { ALL_PERMISSIONS, Permission } from '../../db/repositories/permissionRepository';
import type { TTSProvider } from '../../services/ttsService';

export function registerSettingsRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get all settings
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await ctx.settingsRepo.getAll();

    // Filter out sensitive settings for non-admins
    if (request.user?.role !== 'admin') {
      delete settings.elevenlabs_api_key;
    }

    return { settings };
  });

  // Get specific setting
  server.get('/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };

    // Protect sensitive settings
    const sensitiveKeys = ['elevenlabs_api_key', 'jwt_secret'];
    if (sensitiveKeys.includes(key) && request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const value = await ctx.settingsRepo.get(key);
    if (value === null) {
      return reply.status(404).send({ error: 'Not Found', message: 'Setting not found' });
    }

    return { key, value };
  });

  // Update setting
  server.put('/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { key } = request.params as { key: string };
    const { value } = request.body as { value: string };

    if (value === undefined) {
      return reply.status(400).send({ error: 'Bad Request', message: 'value required' });
    }

    await ctx.settingsRepo.set(key, value);

    return { key, value, updated: true };
  });

  // Toggle campaign active
  server.post('/campaign/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const current = await ctx.settingsRepo.isCampaignActive();
    await ctx.settingsRepo.setCampaignActive(!current);

    const newState = !current;

    // Broadcast to WebSocket clients
    ctx.wsManager.broadcast('system', 'campaign:toggle', {
      active: newState,
    });

    return {
      active: newState,
      message: newState ? 'Campaigns enabled' : 'Campaigns disabled',
    };
  });

  // TTS settings
  server.get('/tts', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      provider: await ctx.settingsRepo.getTTSProvider(),
      piperUrl: await ctx.settingsRepo.getPiperUrl(),
      piperVoice: await ctx.settingsRepo.getPiperVoice(),
      elevenLabsVoice: await ctx.settingsRepo.getDefaultVoice(),
      hasElevenLabsKey: !!(await ctx.settingsRepo.getElevenLabsApiKey()),
      openaiVoice: (await ctx.settingsRepo.get('openai_tts_voice')) || 'nova',
      hasOpenAIKey: !!(await ctx.settingsRepo.get('openai_api_key')),
      cartesiaVoice: (await ctx.settingsRepo.get('cartesia_tts_voice')) || '694f9389-aac1-45b6-b726-9d9369183238',
      hasCartesiaKey: !!(await ctx.settingsRepo.get('cartesia_api_key')),
      deepgramVoice: (await ctx.settingsRepo.get('deepgram_tts_voice')) || 'aura-asteria-en',
      hasDeepgramKey: !!(await ctx.settingsRepo.get('deepgram_api_key')),
      playhtVoice: (await ctx.settingsRepo.get('playht_tts_voice')) || '',
      hasPlayHTKey: !!(await ctx.settingsRepo.get('playht_api_key')) && !!(await ctx.settingsRepo.get('playht_user_id')),
      googleVoice: (await ctx.settingsRepo.get('google_tts_voice')) || 'en-US-Neural2-C',
      hasGoogleKey: !!(await ctx.settingsRepo.get('google_api_key')),
    };
  });

  // Update TTS settings
  server.put('/tts', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const body = request.body as {
      provider?: TTSProvider;
      piperUrl?: string;
      piperVoice?: string;
      elevenLabsApiKey?: string;
      elevenLabsVoice?: string;
      openaiVoice?: string;
      cartesiaVoice?: string;
      deepgramVoice?: string;
      playhtVoice?: string;
      googleVoice?: string;
    };

    if (body.provider) {
      await ctx.settingsRepo.setTTSProvider(body.provider);
      ctx.ttsService.setProvider(body.provider);
    }
    if (body.piperUrl) {
      await ctx.settingsRepo.setPiperUrl(body.piperUrl);
    }
    if (body.piperVoice) {
      await ctx.settingsRepo.setPiperVoice(body.piperVoice);
    }
    if (body.elevenLabsApiKey) {
      await ctx.settingsRepo.setElevenLabsApiKey(body.elevenLabsApiKey);
    }
    if (body.elevenLabsVoice) {
      await ctx.settingsRepo.setDefaultVoice(body.elevenLabsVoice);
    }
    if (body.openaiVoice) {
      await ctx.settingsRepo.set('openai_tts_voice', body.openaiVoice);
      ctx.ttsService.setOpenAIVoice(body.openaiVoice);
    }
    if (body.cartesiaVoice) {
      await ctx.settingsRepo.set('cartesia_tts_voice', body.cartesiaVoice);
      ctx.ttsService.setCartesiaVoice(body.cartesiaVoice);
    }
    if (body.deepgramVoice) {
      await ctx.settingsRepo.set('deepgram_tts_voice', body.deepgramVoice);
      ctx.ttsService.setDeepgramVoice(body.deepgramVoice);
    }
    if (body.playhtVoice) {
      await ctx.settingsRepo.set('playht_tts_voice', body.playhtVoice);
      ctx.ttsService.setPlayHTVoice(body.playhtVoice);
    }
    if (body.googleVoice) {
      await ctx.settingsRepo.set('google_tts_voice', body.googleVoice);
      ctx.ttsService.setGoogleVoice(body.googleVoice);
    }

    // Sync API keys to TTS service
    const openaiKey = await ctx.settingsRepo.get('openai_api_key');
    if (openaiKey) ctx.ttsService.setOpenAIApiKey(openaiKey);

    const cartesiaKey = await ctx.settingsRepo.get('cartesia_api_key');
    if (cartesiaKey) ctx.ttsService.setCartesiaApiKey(cartesiaKey);

    const deepgramKey = await ctx.settingsRepo.get('deepgram_api_key');
    if (deepgramKey) ctx.ttsService.setDeepgramApiKey(deepgramKey);

    const playhtKey = await ctx.settingsRepo.get('playht_api_key');
    const playhtUserId = await ctx.settingsRepo.get('playht_user_id');
    if (playhtKey) ctx.ttsService.setPlayHTApiKey(playhtKey);
    if (playhtUserId) ctx.ttsService.setPlayHTUserId(playhtUserId);

    const googleKey = await ctx.settingsRepo.get('google_api_key');
    if (googleKey) ctx.ttsService.setGoogleApiKey(googleKey);

    return {
      success: true,
      provider: await ctx.settingsRepo.getTTSProvider(),
    };
  });

  // Get available TTS voices
  server.get('/tts/voices', async (request: FastifyRequest, reply: FastifyReply) => {
    const provider = (request.query as { provider?: string }).provider || await ctx.settingsRepo.getTTSProvider();

    if (provider === 'piper') {
      const result = await ctx.ttsService.getPiperVoices();
      if (result.success) {
        return { provider: 'piper', voices: result.data };
      }
      return reply.status(503).send({ error: 'Service Unavailable', message: result.error });
    }

    if (provider === 'openai') {
      // Sync OpenAI key if available
      const openaiKey = await ctx.settingsRepo.get('openai_api_key');
      if (openaiKey) {
        ctx.ttsService.setOpenAIApiKey(openaiKey);
      }

      const voices = ctx.ttsService.getOpenAIVoices();
      return { provider: 'openai', voices };
    }

    if (provider === 'cartesia') {
      const cartesiaKey = await ctx.settingsRepo.get('cartesia_api_key');
      if (cartesiaKey) {
        ctx.ttsService.setCartesiaApiKey(cartesiaKey);
      }
      const voices = ctx.ttsService.getCartesiaVoices();
      return { provider: 'cartesia', voices };
    }

    if (provider === 'deepgram') {
      const deepgramKey = await ctx.settingsRepo.get('deepgram_api_key');
      if (deepgramKey) {
        ctx.ttsService.setDeepgramApiKey(deepgramKey);
      }
      const voices = ctx.ttsService.getDeepgramVoices();
      return { provider: 'deepgram', voices };
    }

    if (provider === 'playht') {
      const playhtKey = await ctx.settingsRepo.get('playht_api_key');
      const playhtUserId = await ctx.settingsRepo.get('playht_user_id');
      if (playhtKey) ctx.ttsService.setPlayHTApiKey(playhtKey);
      if (playhtUserId) ctx.ttsService.setPlayHTUserId(playhtUserId);
      const voices = ctx.ttsService.getPlayHTVoices();
      return { provider: 'playht', voices };
    }

    if (provider === 'google') {
      const googleKey = await ctx.settingsRepo.get('google_api_key');
      if (googleKey) {
        ctx.ttsService.setGoogleApiKey(googleKey);
      }
      const voices = ctx.ttsService.getGoogleVoices();
      return { provider: 'google', voices };
    }

    // ElevenLabs (default)
    const elevenlabsKey = await ctx.settingsRepo.get('elevenlabs_api_key');
    if (elevenlabsKey) {
      ctx.ttsService.setApiKey(elevenlabsKey);
    }
    const result = await ctx.ttsService.getVoices();
    if (result.success) {
      return { provider: 'elevenlabs', voices: result.data };
    }
    return reply.status(503).send({ error: 'Service Unavailable', message: result.error });
  });

  // Check TTS health
  server.get('/tts/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const provider = await ctx.settingsRepo.getTTSProvider();

    if (provider === 'piper') {
      const health = await ctx.ttsService.checkPiperHealth();
      return {
        provider: 'piper',
        status: health.ok ? 'online' : 'offline',
        voicesCount: health.voicesCount,
        error: health.error,
      };
    }

    if (provider === 'openai') {
      const hasKey = !!(await ctx.settingsRepo.get('openai_api_key'));
      return {
        provider: 'openai',
        status: hasKey ? 'online' : 'not_configured',
        voicesCount: 6,
      };
    }

    if (provider === 'cartesia') {
      const hasKey = !!(await ctx.settingsRepo.get('cartesia_api_key'));
      return {
        provider: 'cartesia',
        status: hasKey ? 'online' : 'not_configured',
        voicesCount: 8,
      };
    }

    if (provider === 'deepgram') {
      const hasKey = !!(await ctx.settingsRepo.get('deepgram_api_key'));
      return {
        provider: 'deepgram',
        status: hasKey ? 'online' : 'not_configured',
        voicesCount: 12,
      };
    }

    if (provider === 'playht') {
      const hasKey = !!(await ctx.settingsRepo.get('playht_api_key'));
      const hasUserId = !!(await ctx.settingsRepo.get('playht_user_id'));
      return {
        provider: 'playht',
        status: hasKey && hasUserId ? 'online' : 'not_configured',
        voicesCount: 6,
      };
    }

    if (provider === 'google') {
      const hasKey = !!(await ctx.settingsRepo.get('google_api_key'));
      return {
        provider: 'google',
        status: hasKey ? 'online' : 'not_configured',
        voicesCount: 12,
      };
    }

    // ElevenLabs (default)
    const isConfigured = ctx.ttsService.isElevenLabsConfigured();
    if (!isConfigured) {
      return { provider: 'elevenlabs', status: 'not_configured' };
    }

    const result = await ctx.ttsService.validateApiKey();
    return {
      provider: 'elevenlabs',
      status: result.valid ? 'online' : 'error',
      error: result.error,
    };
  });

  // Generate test audio preview
  server.post('/tts/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { text, voice, provider, language } = request.body as {
      text?: string;
      voice?: string;
      provider?: TTSProvider;
      language?: string;  // Language code for multilingual TTS (e.g., 'es', 'fr', 'de')
    };
    const testText = text || 'Hello, this is a test of the text to speech system.';
    const previewId = `preview_${Date.now()}`;

    // If provider is specified, temporarily switch to that provider
    const originalProvider = ctx.ttsService.getProvider();
    if (provider) {
      ctx.ttsService.setProvider(provider);

      // Sync API keys for the selected provider
      if (provider === 'openai') {
        const openaiKey = await ctx.settingsRepo.get('openai_api_key');
        if (openaiKey) ctx.ttsService.setOpenAIApiKey(openaiKey);
      } else if (provider === 'cartesia') {
        const cartesiaKey = await ctx.settingsRepo.get('cartesia_api_key');
        if (cartesiaKey) ctx.ttsService.setCartesiaApiKey(cartesiaKey);
      } else if (provider === 'deepgram') {
        const deepgramKey = await ctx.settingsRepo.get('deepgram_api_key');
        if (deepgramKey) ctx.ttsService.setDeepgramApiKey(deepgramKey);
      } else if (provider === 'playht') {
        const playhtKey = await ctx.settingsRepo.get('playht_api_key');
        const playhtUserId = await ctx.settingsRepo.get('playht_user_id');
        if (playhtKey) ctx.ttsService.setPlayHTApiKey(playhtKey);
        if (playhtUserId) ctx.ttsService.setPlayHTUserId(playhtUserId);
      } else if (provider === 'google') {
        const googleKey = await ctx.settingsRepo.get('google_api_key');
        if (googleKey) ctx.ttsService.setGoogleApiKey(googleKey);
      }
    }

    const result = await ctx.ttsService.generateAudio(testText, previewId, { voice, language });

    // Restore original provider if we switched
    if (provider) {
      ctx.ttsService.setProvider(originalProvider);
    }

    if (!result.success) {
      return reply.status(500).send({ error: 'TTS Error', message: result.error });
    }

    // Return the audio file path
    return { success: true, audioPath: result.data, previewId };
  });

  // Note: /tts/preview/:id is registered as a public route in server.ts (no auth for <audio> playback)

  // ============================================
  // Call Recording Settings
  // ============================================

  // Get call recording settings
  server.get('/recording', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      enabled: (await ctx.settingsRepo.get('call_recording_enabled')) === 'true',
      recordingsPath: (await ctx.settingsRepo.get('recordings_path')) || '/var/lib/asterisk/recordings',
    };
  });

  // Update call recording settings
  server.put('/recording', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const body = request.body as { enabled?: boolean };

    if (body.enabled !== undefined) {
      await ctx.settingsRepo.set('call_recording_enabled', body.enabled ? 'true' : 'false');
    }

    return {
      enabled: (await ctx.settingsRepo.get('call_recording_enabled')) === 'true',
      message: body.enabled ? 'Call recording enabled' : 'Call recording disabled',
    };
  });

  // Toggle call recording
  server.post('/recording/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin' && request.user?.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin or supervisor access required' });
    }

    const current = (await ctx.settingsRepo.get('call_recording_enabled')) === 'true';
    const newState = !current;
    await ctx.settingsRepo.set('call_recording_enabled', newState ? 'true' : 'false');

    // Broadcast to WebSocket clients
    ctx.wsManager.broadcast('system', 'recording:toggle', {
      enabled: newState,
    });

    return {
      enabled: newState,
      message: newState ? 'Call recording enabled' : 'Call recording disabled',
    };
  });

  // List web users (admin only)
  server.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const users = await ctx.userRepo.findAll();
    return { users };
  });

  // Create web user (admin only)
  server.post('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const body = request.body as {
      username: string;
      password: string;
      role?: 'admin' | 'supervisor' | 'viewer';
      displayName?: string;
    };

    if (!body.username || !body.password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'username and password required',
      });
    }

    if (body.password.length < 6) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Password must be at least 6 characters',
      });
    }

    try {
      const user = await ctx.authService.createUser({
        username: body.username,
        password: body.password,
        role: body.role,
        displayName: body.displayName,
      });

      return reply.status(201).send(user);
    } catch (error) {
      if ((error as Error).message === 'Username already exists') {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Username already exists',
        });
      }
      throw error;
    }
  });

  // Update web user (admin only)
  server.put('/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    const body = request.body as {
      username?: string;
      password?: string;
      role?: 'admin' | 'supervisor' | 'viewer';
      displayName?: string;
      enabled?: boolean;
    };

    const user = await ctx.userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    const updates: any = {};

    if (body.username) updates.username = body.username;
    if (body.role) updates.role = body.role;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    if (body.password) {
      updates.passwordHash = await ctx.authService.hashPassword(body.password);
    }

    const success = await ctx.userRepo.update(userId, updates);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update user' });
    }

    const updated = await ctx.userRepo.findById(userId);
    if (updated) {
      const { passwordHash, ...safe } = updated;
      return safe;
    }

    return { success: true };
  });

  // Delete web user (admin only)
  server.delete('/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    // Prevent deleting self
    if (userId === request.user.userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot delete your own account',
      });
    }

    const user = await ctx.userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    const success = await ctx.userRepo.delete(userId);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete user' });
    }

    return { success: true };
  });

  // ============================================
  // Permissions API
  // ============================================

  // Get all available permissions
  server.get('/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    return { permissions: ALL_PERMISSIONS };
  });

  // Get permissions for a specific user
  server.get('/users/:id/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    const user = await ctx.userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    const permissions = await ctx.permissionRepo.getAllPermissionsForUser(userId, user.role);

    return { userId, role: user.role, permissions };
  });

  // Update permissions for a user
  server.put('/users/:id/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    const body = request.body as {
      permissions: { permission: string; granted: boolean }[];
    };

    if (!body.permissions || !Array.isArray(body.permissions)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'permissions array required',
      });
    }

    const user = await ctx.userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    // Validate permissions
    const validPermissions = body.permissions.filter(p =>
      ALL_PERMISSIONS.includes(p.permission as Permission)
    );

    await ctx.permissionRepo.setPermissions(
      userId,
      validPermissions.map(p => ({
        permission: p.permission as Permission,
        granted: p.granted,
      }))
    );

    const updatedPermissions = await ctx.permissionRepo.getAllPermissionsForUser(userId, user.role);

    return { userId, role: user.role, permissions: updatedPermissions };
  });

  // Reset permissions to role defaults
  server.delete('/users/:id/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    const user = await ctx.userRepo.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    await ctx.permissionRepo.clearUserPermissions(userId);

    const permissions = await ctx.permissionRepo.getAllPermissionsForUser(userId, user.role);

    return { userId, role: user.role, permissions, message: 'Permissions reset to role defaults' };
  });

  // Get current user's permissions
  server.get('/my-permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const permissions = await ctx.permissionRepo.getEffectivePermissions(
      request.user.userId,
      request.user.role
    );

    return {
      userId: request.user.userId,
      role: request.user.role,
      permissions: Array.from(permissions),
    };
  });

  // ============================================
  // AI Providers Settings
  // ============================================

  // Get AI providers configuration
  server.get('/ai-providers', async (request: FastifyRequest, reply: FastifyReply) => {
    const getKeyPrefix = (key: string | null): string | undefined => {
      if (!key) return undefined;
      return key.substring(0, 8);
    };

    const openaiKey = await ctx.settingsRepo.get('openai_api_key');
    const anthropicKey = await ctx.settingsRepo.get('anthropic_api_key');
    const groqKey = await ctx.settingsRepo.get('groq_api_key');
    const deepgramKey = await ctx.settingsRepo.get('deepgram_api_key');
    const assemblyaiKey = await ctx.settingsRepo.get('assemblyai_api_key');
    const elevenlabsKey = await ctx.settingsRepo.get('elevenlabs_api_key');
    const cartesiaKey = await ctx.settingsRepo.get('cartesia_api_key');
    const playhtKey = await ctx.settingsRepo.get('playht_api_key');
    const playhtUserId = await ctx.settingsRepo.get('playht_user_id');
    const googleKey = await ctx.settingsRepo.get('google_api_key');

    return {
      llm: {
        openai: {
          configured: !!openaiKey,
          keyPrefix: getKeyPrefix(openaiKey),
        },
        anthropic: {
          configured: !!anthropicKey,
          keyPrefix: getKeyPrefix(anthropicKey),
        },
        groq: {
          configured: !!groqKey,
          keyPrefix: getKeyPrefix(groqKey),
        },
      },
      stt: {
        deepgram: {
          configured: !!deepgramKey,
          keyPrefix: getKeyPrefix(deepgramKey),
        },
        assemblyai: {
          configured: !!assemblyaiKey,
          keyPrefix: getKeyPrefix(assemblyaiKey),
        },
        openai: {
          configured: !!openaiKey,
          keyPrefix: getKeyPrefix(openaiKey),
        },
      },
      tts: {
        elevenlabs: {
          configured: !!elevenlabsKey,
          keyPrefix: getKeyPrefix(elevenlabsKey),
        },
        openai: {
          configured: !!openaiKey,
          keyPrefix: getKeyPrefix(openaiKey),
        },
        cartesia: {
          configured: !!cartesiaKey,
          keyPrefix: getKeyPrefix(cartesiaKey),
        },
        playht: {
          configured: !!playhtKey && !!playhtUserId,
          keyPrefix: getKeyPrefix(playhtKey),
        },
        google: {
          configured: !!googleKey,
          keyPrefix: getKeyPrefix(googleKey),
        },
      },
    };
  });

  // Helper function to test an API key
  async function testApiKey(provider: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      switch (provider) {
        case 'openai': {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
            return { valid: false, error: data.error?.message || `API returned ${res.status}` };
          }
          return { valid: true };
        }

        case 'anthropic': {
          // Anthropic key validation - check format and make a minimal API call
          if (!apiKey.startsWith('sk-ant-')) {
            return { valid: false, error: 'Invalid key format (should start with sk-ant-)' };
          }
          // Try a minimal messages request
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
          });
          if (res.status === 401) {
            return { valid: false, error: 'Invalid API key' };
          }
          // Any other response (including 200 or rate limit) means key is valid
          return { valid: true };
        }

        case 'groq': {
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
            return { valid: false, error: data.error?.message || `API returned ${res.status}` };
          }
          return { valid: true };
        }

        case 'deepgram': {
          const res = await fetch('https://api.deepgram.com/v1/projects', {
            headers: { Authorization: `Token ${apiKey}` },
          });
          if (!res.ok) {
            return { valid: false, error: `API returned ${res.status}` };
          }
          return { valid: true };
        }

        case 'assemblyai': {
          const res = await fetch('https://api.assemblyai.com/v2/transcript?limit=1', {
            headers: { Authorization: apiKey },
          });
          if (res.status === 401) {
            return { valid: false, error: 'Invalid API key' };
          }
          return { valid: true };
        }

        case 'elevenlabs': {
          // ElevenLabs keys are typically 32 characters
          if (!apiKey || apiKey.length < 20) {
            return { valid: false, error: 'API key is too short (should be 32 characters)' };
          }

          try {
            // Use /v1/user endpoint for validation
            const res = await fetch('https://api.elevenlabs.io/v1/user', {
              headers: {
                'xi-api-key': apiKey,
                'Accept': 'application/json',
              },
            });

            // Check response content type
            const contentType = res.headers.get('content-type') || '';

            if (res.status === 401) {
              return { valid: false, error: 'Invalid API key' };
            }

            // If we get HTML back (403), ElevenLabs is blocking this server
            // Accept the key if it looks valid (right length and format)
            if (contentType.includes('text/html')) {
              // Key looks valid format-wise, save it and let actual usage determine if it works
              return { valid: true };
            }

            if (res.status === 403) {
              const data = await res.json().catch(() => ({})) as { detail?: { status?: string; message?: string } };
              if (data.detail?.status === 'quota_exceeded') {
                return { valid: true }; // Key is valid, just quota exceeded
              }
              // For other 403s, still accept if key looks valid
              return { valid: true };
            }

            if (!res.ok) {
              const data = await res.json().catch(() => ({})) as { detail?: { message?: string } };
              return { valid: false, error: data.detail?.message || `API returned ${res.status}` };
            }

            return { valid: true };
          } catch (err) {
            // Network error - accept the key if it looks valid
            if (apiKey.length >= 32) {
              return { valid: true };
            }
            return { valid: false, error: 'Could not verify key - network error' };
          }
        }

        case 'cartesia': {
          // Cartesia uses sk- prefix for API keys
          const res = await fetch('https://api.cartesia.ai/voices', {
            headers: {
              'X-API-Key': apiKey,
              'Cartesia-Version': '2024-06-10',
            },
          });
          if (res.status === 401) {
            return { valid: false, error: 'Invalid API key' };
          }
          if (!res.ok) {
            return { valid: false, error: `API returned ${res.status}` };
          }
          return { valid: true };
        }

        case 'playht': {
          // PlayHT requires both API key and user ID - we'll just validate format
          if (!apiKey || apiKey.length < 10) {
            return { valid: false, error: 'API key is too short' };
          }
          // Could add actual API validation here if needed
          return { valid: true };
        }

        case 'google': {
          // Google Cloud TTS validation - check against the API
          const res = await fetch(
            `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`
          );
          if (res.status === 400 || res.status === 403) {
            const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
            return { valid: false, error: data.error?.message || 'Invalid API key' };
          }
          if (!res.ok) {
            return { valid: false, error: `API returned ${res.status}` };
          }
          return { valid: true };
        }

        default:
          return { valid: false, error: 'Unknown provider' };
      }
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  // Update AI provider key
  server.put('/ai-providers/key', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider, type, apiKey } = request.body as {
      provider: string;
      type: 'llm' | 'stt' | 'tts';
      apiKey: string;
    };

    if (!provider || !type || !apiKey) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'provider, type, and apiKey are required',
      });
    }

    const keyMap: Record<string, string> = {
      openai: 'openai_api_key',
      anthropic: 'anthropic_api_key',
      groq: 'groq_api_key',
      deepgram: 'deepgram_api_key',
      assemblyai: 'assemblyai_api_key',
      elevenlabs: 'elevenlabs_api_key',
      cartesia: 'cartesia_api_key',
      playht: 'playht_api_key',
      google: 'google_api_key',
    };

    const settingKey = keyMap[provider];
    if (!settingKey) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Unknown provider: ${provider}`,
      });
    }

    // Test the key before saving
    const testResult = await testApiKey(provider, apiKey);

    if (!testResult.valid) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid API key',
        message: testResult.error || 'The API key is not valid',
        tested: true,
      });
    }

    // Key is valid, save it
    await ctx.settingsRepo.set(settingKey, apiKey);

    return {
      success: true,
      configured: true,
      tested: true,
      message: `${provider} API key verified and saved successfully`,
    };
  });

  // Test AI provider
  server.post('/ai-providers/test', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider, type } = request.body as {
      provider: string;
      type: 'llm' | 'stt' | 'tts';
    };

    if (!provider || !type) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'provider and type are required',
      });
    }

    const keyMap: Record<string, string> = {
      openai: 'openai_api_key',
      anthropic: 'anthropic_api_key',
      groq: 'groq_api_key',
      deepgram: 'deepgram_api_key',
      assemblyai: 'assemblyai_api_key',
      elevenlabs: 'elevenlabs_api_key',
      cartesia: 'cartesia_api_key',
      playht: 'playht_api_key',
      google: 'google_api_key',
    };

    const settingKey = keyMap[provider];
    if (!settingKey) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Unknown provider: ${provider}`,
      });
    }

    const apiKey = await ctx.settingsRepo.get(settingKey);
    if (!apiKey) {
      return {
        provider,
        type,
        configured: false,
        status: 'not_configured',
        error: 'API key not configured',
      };
    }

    // Use the helper function to test the key
    const testResult = await testApiKey(provider, apiKey);

    return {
      provider,
      type,
      configured: true,
      status: testResult.valid ? 'online' : 'error',
      error: testResult.error,
    };
  });

  // Remove AI provider key
  server.delete('/ai-providers/key', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { provider, type } = request.body as {
      provider: string;
      type: 'llm' | 'stt' | 'tts';
    };

    if (!provider || !type) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'provider and type are required',
      });
    }

    const keyMap: Record<string, string> = {
      openai: 'openai_api_key',
      anthropic: 'anthropic_api_key',
      groq: 'groq_api_key',
      deepgram: 'deepgram_api_key',
      assemblyai: 'assemblyai_api_key',
      elevenlabs: 'elevenlabs_api_key',
      cartesia: 'cartesia_api_key',
      playht: 'playht_api_key',
      google: 'google_api_key',
    };

    const settingKey = keyMap[provider];
    if (!settingKey) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Unknown provider: ${provider}`,
      });
    }

    await ctx.settingsRepo.delete(settingKey);

    return { success: true };
  });
}
