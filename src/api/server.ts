import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { DatabaseManager } from '../db/database';
import { WebUserRepository } from '../db/repositories/webUserRepository';
import { SessionRepository } from '../db/repositories/sessionRepository';
import { RecordingRepository } from '../db/repositories/recordingRepository';
import { CallLogRepository } from '../db/repositories/callLogRepository';
import { IVRMenuRepository } from '../db/repositories/ivrMenuRepository';
import { ExtensionRepository } from '../db/repositories/extensionRepository';
import { TrunkRepository } from '../db/repositories/trunkRepository';
import { DialerCampaignRepository } from '../db/repositories/dialerCampaignRepository';
import { CampaignContactRepository } from '../db/repositories/campaignContactRepository';
import { PromptRepository } from '../db/repositories/promptRepository';
import { RoutingRepository } from '../db/repositories/routingRepository';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import { RingGroupRepository } from '../db/repositories/ringGroupRepository';
import { ContactRepository } from '../db/repositories/contactRepository';
import { ContactGroupRepository } from '../db/repositories/contactGroupRepository';
import { QueueRepository } from '../db/repositories/queueRepository';
import { OutboundRouteRepository } from '../db/repositories/outboundRouteRepository';
import { PermissionRepository, Permission as PermissionType, ALL_PERMISSIONS } from '../db/repositories/permissionRepository';
import { TranscriptionRepository } from '../db/repositories/transcriptionRepository';
import { VoicemailRepository } from '../db/repositories/voicemailRepository';
import { AIAnalyticsRepository } from '../db/repositories/aiAnalyticsRepository';
import { CallSummaryRepository } from '../db/repositories/callSummaryRepository';
import { AIInsightsRepository } from '../db/repositories/aiInsightsRepository';
import { TeamRepository } from '../db/repositories/teamRepository';

// Local type alias used within this module
type Permission = PermissionType;
import { AuthService, TokenPayload } from '../services/authService';
import { TTSService } from '../services/ttsService';
import { TranscriptionService, createTranscriptionService } from '../services/transcriptionService';
import { VoicemailWatcher, createVoicemailWatcher } from '../services/voicemailWatcher';
import { CallSummaryService } from '../services/callSummaryService';
import { AIInsightsService } from '../services/aiInsightsService';
import { SipTestService } from '../services/sipTestService';
import { DialerService } from '../services/dialerService';
import { QueueAnnouncementService } from '../services/queueAnnouncementService';
import { AMIClient } from '../asterisk/amiClient';
import { BrowserAudioServer } from '../asterisk/browserAudioServer';
import { AudioSocketServer } from '../asterisk/audioSocketServer';
import { apiLogger } from '../utils/logger';

import { registerAuthRoutes } from './routes/auth';
import { registerCallRoutes } from './routes/calls';
import { registerIvrRoutes } from './routes/ivr';
import { registerExtensionRoutes } from './routes/extensions';
import { registerTrunkRoutes } from './routes/trunks';
import { registerCampaignRoutes } from './routes/campaigns';
import { registerRecordingRoutes } from './routes/recordings';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerSettingsRoutes } from './routes/settings';
import { registerTeamRoutes } from './routes/teams';
import { registerSystemRoutes } from './routes/system';
import { registerRingGroupRoutes } from './routes/ringGroups';
import { registerContactRoutes } from './routes/contacts';
import { registerContactGroupRoutes } from './routes/contactGroups';
import { registerPromptRoutes } from './routes/prompts';
import { registerQueueRoutes } from './routes/queues';
import { registerOutboundRouteRoutes } from './routes/outboundRoutes';
import { registerAIAgentRoutes } from './routes/aiAgentsFastify';
import { registerAITemplateRoutes } from './routes/aiTemplatesFastify';
import { registerAIVoicePreviewRoutes } from './routes/aiVoicePreviewFastify';
import { registerSearchRoutes } from './routes/search';
import { registerAIMetricsRoutes } from './routes/aiMetricsFastify';
import { registerTwilioRoutes } from './routes/twilio';
import { registerTranscriptionRoutes } from './routes/transcriptions';
import { registerVoicemailRoutes } from './routes/voicemails';
import { registerAIAnalyticsRoutes } from './routes/aiAnalytics';
import { callSummaryRoutes } from './routes/callSummaries';
import { aiInsightsRoutes } from './routes/aiInsights';
import { registerLocalTtsRoutes } from './routes/localTts';
import { registerWebRTCRoutes } from './routes/webrtc';
import { setupWebSocket, WebSocketManager } from './websocket';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
  interface FastifyInstance {
    ctx: ApiContext;
  }
}

// Re-export Permission type for routes
export { Permission } from '../db/repositories/permissionRepository';

// Permission middleware type
export type PermissionMiddleware = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface ApiContext {
  db: DatabaseManager;
  authService: AuthService;
  userRepo: WebUserRepository;
  sessionRepo: SessionRepository;
  recordingRepo: RecordingRepository;
  callLogRepo: CallLogRepository;
  ivrMenuRepo: IVRMenuRepository;
  extensionRepo: ExtensionRepository;
  trunkRepo: TrunkRepository;
  campaignRepo: DialerCampaignRepository;
  campaignContactRepo: CampaignContactRepository;
  promptRepo: PromptRepository;
  routingRepo: RoutingRepository;
  settingsRepo: SettingsRepository;
  ringGroupRepo: RingGroupRepository;
  contactRepo: ContactRepository;
  queueRepo: QueueRepository;
  outboundRouteRepo: OutboundRouteRepository;
  permissionRepo: PermissionRepository;
  transcriptionRepo: TranscriptionRepository;
  voicemailRepo: VoicemailRepository;
  aiAnalyticsRepo: AIAnalyticsRepository;
  callSummaryRepo: CallSummaryRepository;
  aiInsightsRepo: AIInsightsRepository;
  ttsService: TTSService;
  transcriptionService: TranscriptionService | null;
  voicemailWatcher: VoicemailWatcher | null;
  callSummaryService: CallSummaryService;
  aiInsightsService: AIInsightsService;
  sipTestService: SipTestService;
  amiClient: AMIClient | null;
  wsManager: WebSocketManager;
  dialerService: DialerService | null;
  browserAudioServer: BrowserAudioServer | null;
  audioSocketServer: AudioSocketServer | null;
  asteriskConfigService: any;
  reloadAsteriskPJSIP: () => Promise<void>;
  reloadAsteriskDialplan: () => Promise<void>;
  contactGroupRepo: ContactGroupRepository;
  queueAnnouncementService: QueueAnnouncementService | null;
  teamRepo: TeamRepository;
  // Permission middleware factory
  requirePermission: (permission: Permission) => PermissionMiddleware;
}

export async function createApiServer(
  db: DatabaseManager,
  amiClient: AMIClient | null,
  dialerService: DialerService | null = null,
  browserAudioServer: BrowserAudioServer | null = null,
  audioSocketServer: AudioSocketServer | null = null
): Promise<{ server: FastifyInstance; wsManager: WebSocketManager }> {
  const server = Fastify({
    logger: false,
  });

  // Register plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await server.register(websocket);

  // Serve static files for recordings
  const recordingPath = path.resolve(process.env.RECORDING_PATH || '/var/spool/asterisk/monitor');
  await server.register(fastifyStatic, {
    root: recordingPath,
    prefix: '/recordings/',
    decorateReply: false,
  });

  // Initialize repositories
  const userRepo = new WebUserRepository(db);
  const sessionRepo = new SessionRepository(db);
  const recordingRepo = new RecordingRepository(db);
  const callLogRepo = new CallLogRepository(db);
  const ivrMenuRepo = new IVRMenuRepository(db);
  const extensionRepo = new ExtensionRepository(db);
  const trunkRepo = new TrunkRepository(db);
  const campaignRepo = new DialerCampaignRepository(db);
  const campaignContactRepo = new CampaignContactRepository(db);
  const promptRepo = new PromptRepository(db);
  const routingRepo = new RoutingRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const ringGroupRepo = new RingGroupRepository(db);
  const contactRepo = new ContactRepository(db);
  const contactGroupRepo = new ContactGroupRepository(db);
  const queueRepo = new QueueRepository(db);
  const outboundRouteRepo = new OutboundRouteRepository(db);
  const permissionRepo = new PermissionRepository(db);
  const transcriptionRepo = new TranscriptionRepository(db);
  const voicemailRepo = new VoicemailRepository(db);
  const aiAnalyticsRepo = new AIAnalyticsRepository(db);
  const callSummaryRepo = new CallSummaryRepository(db);
  const aiInsightsRepo = new AIInsightsRepository(db);
  const teamRepo = new TeamRepository(db);

  // Initialize auth service
  const authService = new AuthService(userRepo, sessionRepo);

  // Ensure default admin exists
  await authService.ensureDefaultAdmin();

  // Initialize TTS service
  const audioPath = process.env.AUDIO_PATH || './audio';
  const ttsService = new TTSService(
    audioPath,
    await settingsRepo.getElevenLabsApiKey(),
    await settingsRepo.getDefaultVoice(),
    await settingsRepo.getTTSProvider() as 'piper' | 'elevenlabs',
    await settingsRepo.getPiperUrl(),
    await settingsRepo.getPiperVoice()
  );

  // Initialize SIP test service
  const sipTestService = new SipTestService();

  // Initialize Transcription service
  const transcriptionService = createTranscriptionService(transcriptionRepo, settingsRepo);
  // Start in background (don't block server startup)
  transcriptionService.start().catch(err => {
    apiLogger.error('Failed to start TranscriptionService:', err);
  });

  // Initialize Voicemail watcher
  const voicemailWatcher = createVoicemailWatcher(voicemailRepo, transcriptionService);
  // Start in background
  voicemailWatcher.start().catch(err => {
    apiLogger.error('Failed to start VoicemailWatcher:', err);
  });

  // Initialize Call Summary service
  const callSummaryService = new CallSummaryService(db, callSummaryRepo, settingsRepo);
  // Initialize in background
  callSummaryService.initialize().catch(err => {
    apiLogger.error('Failed to initialize CallSummaryService:', err);
  });

  // Initialize AI Insights service
  const aiInsightsService = new AIInsightsService(db, aiInsightsRepo, settingsRepo);
  // Initialize in background
  aiInsightsService.initialize().catch(err => {
    apiLogger.error('Failed to initialize AIInsightsService:', err);
  });

  // Set up WebSocket manager
  const wsManager = new WebSocketManager();

  // Create Asterisk config service for extension management
  const { AsteriskConfigService } = await import('../services/asteriskConfigService');
  const asteriskConfigService = new AsteriskConfigService(
    process.env.ASTERISK_CONFIG_PATH || '/etc/asterisk',
    extensionRepo,
    trunkRepo
  );

  // Function to reload PJSIP after extension changes
  const reloadAsteriskPJSIP = async () => {
    try {
      // Regenerate config files
      await asteriskConfigService.writePJSIPConfig();

      // Reload Asterisk PJSIP if AMI is connected
      if (amiClient && amiClient.isConnected()) {
        await amiClient.action('Command', { Command: 'module reload res_pjsip.so' });
      }
    } catch (error) {
      console.error('Failed to reload Asterisk PJSIP:', error);
    }
  };

  // Function to reload dialplan after changes
  const reloadAsteriskDialplan = async () => {
    try {
      // Regenerate dialplan config
      await asteriskConfigService.writeExtensionsConf();

      // Reload Asterisk dialplan if AMI is connected
      if (amiClient && amiClient.isConnected()) {
        await amiClient.action('Command', { Command: 'dialplan reload' });
      }
    } catch (error) {
      console.error('Failed to reload Asterisk dialplan:', error);
    }
  };

  // Queue announcement service (null if not needed)
  const queueAnnouncementService: QueueAnnouncementService | null = null;

  // Permission middleware factory - checks if user has required permission
  // Removed local definition to use the one from ctx context or defined later if needed
  // In the original code, this was defining a factory that wasn't being used or was shadowing
  // The ctx.requirePermission is what routes use.
  // However, looking at the code, `ctx.requirePermission` is assigned `requirePermission` which is defined later.
  // But wait, there are two definitions in the provided file content.
  // One at line 250 and one at line 357.
  // The one at 250 is used to populate ctx.
  // The one at 357 is likely a mistake or redundancy.
  // Let's remove the second one (line 357) in the next step, or rename this one if it's the intended one.
  // Actually, the error "Cannot redeclare block-scoped variable" means they are in the same scope.
  // The first one is inside `createApiServer`.
  // The second one is also inside `createApiServer`.
  // I will rename this first one to `requirePermissionFactory` and use it to populate `ctx`.

  const requirePermissionFactory = (permission: Permission): PermissionMiddleware => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const hasPermission = await permissionRepo.hasPermission(
        request.user.userId,
        request.user.role,
        permission
      );

      if (!hasPermission) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: `Missing permission: ${permission}`,
        });
      }
    };
  };

  // Create context
  const ctx: ApiContext = {
    db,
    authService,
    userRepo,
    sessionRepo,
    recordingRepo,
    callLogRepo,
    ivrMenuRepo,
    extensionRepo,
    trunkRepo,
    campaignRepo,
    campaignContactRepo,
    promptRepo,
    routingRepo,
    settingsRepo,
    ringGroupRepo,
    contactRepo,
    queueRepo,
    outboundRouteRepo,
    permissionRepo,
    transcriptionRepo,
    voicemailRepo,
    aiAnalyticsRepo,
    callSummaryRepo,
    aiInsightsRepo,
    ttsService,
    transcriptionService,
    voicemailWatcher,
    callSummaryService,
    aiInsightsService,
    sipTestService,
    amiClient,
    wsManager,
    dialerService,
    browserAudioServer,
    audioSocketServer,
    asteriskConfigService,
    reloadAsteriskPJSIP,
    reloadAsteriskDialplan,
    contactGroupRepo,
    queueAnnouncementService,
    teamRepo,
    requirePermission: requirePermissionFactory,
  };

  // Add context to request
  server.decorateRequest('ctx', null);
  server.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).ctx = ctx;
  });

  // Auth middleware for protected routes
  const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyJwt(token);

    if (!payload) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    // Check if user still exists and is enabled
    const user = await userRepo.findById(payload.userId);
    if (!user || !user.enabled) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'User account disabled' });
    }

    request.user = payload;
  };

  // Role-based middleware
  const requireRole = (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      if (!roles.includes(request.user.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }
    };
  };

  // Permission-based middleware reference (already defined above as requirePermissionFactory)
  // We don't need to redefine it here.


  // Health check
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Public route for TTS audio preview (no auth required for audio playback)
  server.get('/api/v1/audio/preview/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const fs = require('fs');
    const path = require('path');

    // Validate ID format to prevent path traversal
    // Accept preview_* and local_tts_test_* patterns
    if (!/^(preview|local_tts_test)_\d+$/.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid preview ID' });
    }

    const audioDir = process.env.AUDIO_PATH || './audio';
    const hqWavPath = path.join(audioDir, `${id}_hq.wav`);
    const wavPath = path.join(audioDir, `${id}.wav`);
    const mp3Path = path.join(audioDir, `${id}.mp3`);

    let filePath = '';
    let contentType = '';

    // Prefer high-quality WAV for browser preview, fall back to 8kHz or MP3
    if (fs.existsSync(hqWavPath)) {
      filePath = hqWavPath;
      contentType = 'audio/wav';
    } else if (fs.existsSync(wavPath)) {
      filePath = wavPath;
      contentType = 'audio/wav';
    } else if (fs.existsSync(mp3Path)) {
      filePath = mp3Path;
      contentType = 'audio/mpeg';
    } else {
      return reply.status(404).send({ error: 'Not Found', message: 'Audio file not found' });
    }

    const stream = fs.createReadStream(filePath);
    return reply.type(contentType).send(stream);
  });

  // Register routes
  await server.register(async (instance) => {
    registerAuthRoutes(instance, ctx);
  }, { prefix: '/api/v1/auth' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerSearchRoutes(instance, ctx);
  }, { prefix: '/api/v1/search' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerCallRoutes(instance, ctx);
  }, { prefix: '/api/v1/calls' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerIvrRoutes(instance, ctx);
  }, { prefix: '/api/v1/ivr' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerExtensionRoutes(instance, ctx);
  }, { prefix: '/api/v1/extensions' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerTrunkRoutes(instance, ctx);
  }, { prefix: '/api/v1/trunks' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerCampaignRoutes(instance, ctx);
  }, { prefix: '/api/v1/campaigns' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerRecordingRoutes(instance, ctx);
  }, { prefix: '/api/v1/recordings' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerAnalyticsRoutes(instance, ctx);
  }, { prefix: '/api/v1/analytics' });

  // Public audio preview route (no auth required for <audio> element playback)
  await server.register(async (instance) => {
    instance.get('/tts/preview/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const fs = require('fs');
      const path = require('path');

      // Validate ID format to prevent path traversal
      if (!/^preview_\d+$/.test(id)) {
        return reply.status(400).send({ error: 'Invalid preview ID' });
      }

      const audioDir = process.env.AUDIO_PATH || './audio';
      const hqWavPath = path.join(audioDir, `${id}_hq.wav`);
      const wavPath = path.join(audioDir, `${id}.wav`);
      const mp3Path = path.join(audioDir, `${id}.mp3`);

      let filePath = '';
      let contentType = '';

      // Prefer high-quality WAV for browser preview, fall back to 8kHz or MP3
      if (fs.existsSync(hqWavPath)) {
        filePath = hqWavPath;
        contentType = 'audio/wav';
      } else if (fs.existsSync(wavPath)) {
        filePath = wavPath;
        contentType = 'audio/wav';
      } else if (fs.existsSync(mp3Path)) {
        filePath = mp3Path;
        contentType = 'audio/mpeg';
      } else {
        return reply.status(404).send({ error: 'Audio file not found' });
      }

      const stream = fs.createReadStream(filePath);
      return reply.type(contentType).send(stream);
    });
  }, { prefix: '/api/v1/settings' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerSettingsRoutes(instance, ctx);
  }, { prefix: '/api/v1/settings' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerTeamRoutes(instance, ctx);
  }, { prefix: '/api/v1/teams' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerSystemRoutes(instance, ctx);
  }, { prefix: '/api/v1/system' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerWebRTCRoutes(instance, ctx);
  }, { prefix: '/api/v1/webrtc' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerRingGroupRoutes(instance, ctx);
  }, { prefix: '/api/v1/ring-groups' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerContactRoutes(instance, ctx);
  }, { prefix: '/api/v1/contacts' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerContactGroupRoutes(instance, ctx);
  }, { prefix: '/api/v1/contact-groups' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    await registerPromptRoutes(instance, ctx);
  }, { prefix: '/api/v1/prompts' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerQueueRoutes(instance, ctx);
  }, { prefix: '/api/v1/queues' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerOutboundRouteRoutes(instance, ctx);
  }, { prefix: '/api/v1/outbound-routes' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerAIAgentRoutes(instance, ctx);
    registerAITemplateRoutes(instance, ctx);
    registerAIVoicePreviewRoutes(instance, ctx);
    registerAIMetricsRoutes(instance, ctx);
  }, { prefix: '/api/v1/ai' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerTwilioRoutes(instance, ctx);
  }, { prefix: '/api/v1/twilio' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerTranscriptionRoutes(instance, ctx);
  }, { prefix: '/api/v1/transcriptions' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerVoicemailRoutes(instance, ctx);
  }, { prefix: '/api/v1/voicemails' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerAIAnalyticsRoutes(instance, ctx);
  }, { prefix: '/api/v1/analytics/ai' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    // Add ctx to instance for routes to access
    (instance as any).ctx = ctx;
    await callSummaryRoutes(instance, {});
  }, { prefix: '/api/v1/call-summaries' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    // Add ctx to instance for routes to access
    (instance as any).ctx = ctx;
    await aiInsightsRoutes(instance, {});
  }, { prefix: '/api/v1/ai/insights' });

  await server.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    registerLocalTtsRoutes(instance, ctx);
  }, { prefix: '/api/v1/local-tts' });

  // Setup WebSocket
  setupWebSocket(server, ctx);

  // Error handler
  server.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    apiLogger.error('API Error:', error);
    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
    });
  });

  return { server, wsManager };
}

export async function startApiServer(
  db: DatabaseManager,
  amiClient: AMIClient | null,
  dialerService: DialerService | null = null,
  browserAudioServer: BrowserAudioServer | null = null,
  audioSocketServer: AudioSocketServer | null = null
): Promise<{ server: FastifyInstance; wsManager: WebSocketManager }> {
  const { server, wsManager } = await createApiServer(db, amiClient, dialerService, browserAudioServer, audioSocketServer);

  const port = parseInt(process.env.WEB_API_PORT || '3000', 10);
  const host = process.env.WEB_API_HOST || '0.0.0.0';

  await server.listen({ port, host });
  apiLogger.info(`Web Admin API server listening on http://${host}:${port}`);

  return { server, wsManager };
}
