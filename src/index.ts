import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import { initDatabase, closeDatabase, getDatabase } from './db/database';
import { SettingsRepository } from './db/repositories/settingsRepository';
import { PromptRepository } from './db/repositories/promptRepository';
import { IVRMenuRepository } from './db/repositories/ivrMenuRepository';
import { ExtensionRepository } from './db/repositories/extensionRepository';
import { RoutingRepository } from './db/repositories/routingRepository';
import { CallLogRepository } from './db/repositories/callLogRepository';
import { CallRecordingRepository } from './db/repositories/callRecordingRepository';
import { TrunkRepository } from './db/repositories/trunkRepository';
import { DialerCampaignRepository } from './db/repositories/dialerCampaignRepository';
import { CampaignContactRepository } from './db/repositories/campaignContactRepository';
import { ContactRepository } from './db/repositories/contactRepository';
import { RingGroupRepository } from './db/repositories/ringGroupRepository';
import { QueueRepository } from './db/repositories/queueRepository';
import { ContactGroupRepository } from './db/repositories/contactGroupRepository';
import { TTSService } from './services/ttsService';
import { AudioService } from './services/audioService';
import { AIConversationService, AIAgentConfig } from './services/aiConversationService';
import { initializeSTTProviders } from './ai/stt';
import { initializeLLMProviders } from './ai/llm';
import { AsteriskConfigService } from './services/asteriskConfigService';
import { DialerService } from './services/dialerService';
import { MohService } from './services/mohService';
import { AMIClient } from './asterisk/amiClient';
import { AGIServer } from './asterisk/agiServer';
import { IVRController } from './asterisk/ivrController';
import { OutboundIvrHandler } from './asterisk/outboundIvrHandler';
import { createBot, registerConversations, BotServices } from './telegram/bot';
import { setupCallbackHandlers, setupMessageHandlers } from './telegram/handlers/callbacks';
import { sendLeadAlert, sendCampaignNotification } from './telegram/notifications';
import * as kb from './telegram/keyboards';
import { startApiServer } from './api/server';
import { WebSocketManager } from './api/websocket';
import { OpenAIRealtimeService } from './services/openaiRealtimeService';
import { AudioSocketServer } from './asterisk/audioSocketServer';
import { BrowserAudioServer } from './asterisk/browserAudioServer';
import { FlowExecutionService } from './services/flowExecutionService';
import OpenAI from 'openai';
import { initPublicIP } from './utils/network';

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('BotPBX System Starting...');
  logger.info('='.repeat(50));

  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated');

    // Initialize public IP detection (caches for SIP credentials display)
    const publicIP = await initPublicIP();
    logger.info(`Public IP detected: ${publicIP}`);

    // Initialize database (uses DATABASE_URL from environment)
    const connectionString = process.env.DATABASE_URL || 'postgresql://botpbx:botpbx@localhost:5432/botpbx';
    const db = await initDatabase(connectionString);
    logger.info('Database initialized');

    // Initialize repositories
    const settingsRepo = new SettingsRepository(db);
    const promptRepo = new PromptRepository(db);
    const ivrMenuRepo = new IVRMenuRepository(db);
    const extensionRepo = new ExtensionRepository(db);
    const routingRepo = new RoutingRepository(db);
    const callLogRepo = new CallLogRepository(db);
    const callRecordingRepo = new CallRecordingRepository(db);
    const trunkRepo = new TrunkRepository(db);
    const dialerCampaignRepo = new DialerCampaignRepository(db);
    const campaignContactRepo = new CampaignContactRepository(db);
    const contactRepo = new ContactRepository(db);
    const ringGroupRepo = new RingGroupRepository(db);
    const queueRepo = new QueueRepository(db);
    const contactGroupRepo = new ContactGroupRepository(db);
    logger.info('Repositories initialized');

    // Initialize services
    const elevenLabsKey = (await settingsRepo.getElevenLabsApiKey()) || config.elevenLabsApiKey;
    const defaultVoice = (await settingsRepo.getDefaultVoice()) || config.elevenLabsDefaultVoice;
    const ttsProvider = await settingsRepo.getTTSProvider();
    const piperUrl = await settingsRepo.getPiperUrl();
    const piperVoice = await settingsRepo.getPiperVoice();

    const ttsService = new TTSService(
      config.audioFilesPath,
      elevenLabsKey,
      defaultVoice,
      ttsProvider,
      piperUrl,
      piperVoice
    );
    const audioService = new AudioService(config.audioFilesPath);
    const asteriskConfigService = new AsteriskConfigService(config.asteriskConfigPath, extensionRepo, trunkRepo);
    logger.info('Services initialized');

    // Get AI API keys from settings
    const openaiApiKey = (await settingsRepo.get('openai_api_key')) || process.env.OPENAI_API_KEY;
    const anthropicApiKey = (await settingsRepo.get('anthropic_api_key')) || process.env.ANTHROPIC_API_KEY;
    const groqApiKey = (await settingsRepo.get('groq_api_key')) || process.env.GROQ_API_KEY;
    const deepgramApiKey = (await settingsRepo.get('deepgram_api_key')) || process.env.DEEPGRAM_API_KEY;
    const assemblyaiApiKey = (await settingsRepo.get('assemblyai_api_key')) || process.env.ASSEMBLYAI_API_KEY;

    // Initialize LLM providers
    initializeLLMProviders({
      openai: openaiApiKey ? { apiKey: openaiApiKey } : undefined,
      anthropic: anthropicApiKey ? { apiKey: anthropicApiKey } : undefined,
      groq: groqApiKey ? { apiKey: groqApiKey } : undefined,
    });
    logger.info('LLM providers initialized');

    // Initialize STT providers
    initializeSTTProviders({
      deepgram: deepgramApiKey ? { apiKey: deepgramApiKey } : undefined,
      whisper: openaiApiKey ? { apiKey: openaiApiKey } : undefined,
      assemblyai: assemblyaiApiKey ? { apiKey: assemblyaiApiKey } : undefined,
    });
    logger.info('STT providers initialized');

    // Set TTS provider API keys
    const cartesiaApiKey = await settingsRepo.get('cartesia_api_key');
    const playhtApiKey = await settingsRepo.get('playht_api_key');
    const playhtUserId = await settingsRepo.get('playht_user_id');
    const googleApiKey = await settingsRepo.get('google_api_key');

    if (openaiApiKey) ttsService.setOpenAIApiKey(openaiApiKey);
    if (cartesiaApiKey) ttsService.setCartesiaApiKey(cartesiaApiKey);
    if (deepgramApiKey) ttsService.setDeepgramApiKey(deepgramApiKey);
    if (playhtApiKey) ttsService.setPlayHTApiKey(playhtApiKey);
    if (playhtUserId) ttsService.setPlayHTUserId(playhtUserId);
    if (googleApiKey) ttsService.setGoogleApiKey(googleApiKey);
    logger.info('TTS provider API keys configured');

    // Initialize AI Conversation Service
    const aiConversationService = new AIConversationService(ttsService, {
      openai: openaiApiKey,
      anthropic: anthropicApiKey,
      groq: groqApiKey,
      deepgram: deepgramApiKey,
      assemblyai: assemblyaiApiKey,
    });
    logger.info('AI Conversation Service initialized');

    // Initialize OpenAI Realtime Service for low-latency AI calls
    let realtimeService: OpenAIRealtimeService | null = null;
    let audioSocketServer: AudioSocketServer | null = null;

    if (openaiApiKey) {
      realtimeService = new OpenAIRealtimeService(openaiApiKey);
      logger.info('OpenAI Realtime Service initialized');

      // Initialize Flow Execution Service for flow-based AI agents
      const flowService = new FlowExecutionService(db);
      const openaiClient = new OpenAI({ apiKey: openaiApiKey });
      flowService.setOpenAI(openaiClient);
      logger.info('Flow Execution Service initialized');

      // Initialize AudioSocket server for Asterisk audio streaming
      audioSocketServer = new AudioSocketServer(9092);
      audioSocketServer.setRealtimeService(realtimeService);
      audioSocketServer.setFlowService(flowService);
      audioSocketServer.start();
      logger.info('AudioSocket server started on port 9092');
    } else {
      logger.warn('OpenAI API key not configured - Realtime AI calls disabled');
    }

    // Initialize Browser Audio Server for browser-based call listening
    const browserAudioServer = new BrowserAudioServer(9093);
    browserAudioServer.start();
    logger.info('Browser Audio Server started on port 9093');

    // Check ffmpeg availability
    const ffmpegAvailable = await audioService.checkFFmpeg();
    if (!ffmpegAvailable) {
      logger.warn('ffmpeg not found - audio conversion will not work');
    }

    // Initialize AMI client
    const amiClient = new AMIClient({
      host: config.asteriskAmiHost,
      port: config.asteriskAmiPort,
      user: config.asteriskAmiUser,
      secret: config.asteriskAmiSecret,
    });

    // Prevent crash on connection errors
    amiClient.on('error', (err) => {
      // logger.error('AMI Client error:', err); // Optional: log it, but don't crash
    });

    // Connect to AMI
    try {
      await amiClient.connect();
      logger.info('Connected to Asterisk AMI');
    } catch (error) {
      logger.error('Failed to connect to AMI:', error);
      logger.warn('Continuing without AMI connection...');
    }

    // Initialize IVR Controller
    const ivrController = new IVRController(
      ivrMenuRepo,
      routingRepo,
      callLogRepo,
      settingsRepo,
      promptRepo,
      config.audioFilesPath,
      trunkRepo,
      callRecordingRepo
    );

    // Initialize Dialer Service
    const dialerService = new DialerService(
      amiClient,
      dialerCampaignRepo,
      campaignContactRepo,
      trunkRepo,
      contactRepo,
      contactGroupRepo
    );
    logger.info('Dialer service initialized');

    // Initialize MOH Service
    const mohService = new MohService(amiClient);
    logger.info('MOH service initialized');

    // Initialize Outbound IVR Handler
    const outboundIvrHandler = new OutboundIvrHandler(
      ivrMenuRepo,
      dialerCampaignRepo,
      campaignContactRepo,
      promptRepo,
      callLogRepo,
      dialerService,
      config.audioFilesPath,
      mohService,
      trunkRepo,
      settingsRepo,
      callRecordingRepo,
      ringGroupRepo,
      queueRepo,
      extensionRepo
    );
    logger.info('Outbound IVR handler initialized');

    // Initialize AGI Server
    const agiServer = new AGIServer(config.agiServerPort);

    agiServer.on('call', async (agi, session) => {
      logger.info(`New call: ${session.uniqueId} from ${session.callerId}`);
      await ivrController.handleCall(agi, session);
    });

    // Handle outbound dialer calls
    agiServer.on('outbound-call', async (agi, session) => {
      logger.info(`Outbound dialer call: ${session.uniqueId}`);
      await outboundIvrHandler.handleCall(agi, session);
    });

    // Handle browser WebRTC call start - create call log and recording entries
    agiServer.on('browser-call-start', async (agi, session) => {
      try {
        const destination = session.extension || session.dnid;
        const recordingFile = await agi.getVariable('RECORDING_FILE');
        const trunkName = await agi.getVariable('BROWSER_TRUNK');

        logger.info(`Browser call start: ${session.uniqueId} to ${destination} via ${trunkName}`);

        // Create call log entry
        const callLog = await callLogRepo.create({
          callerId: 'browser',
          did: destination,
          ivrMenuId: null,
          optionsPressed: '',
          finalDestination: `trunk:${trunkName}:${destination}`,
          durationSeconds: null,
          disposition: 'BROWSER_OUTBOUND',
          uniqueId: session.uniqueId,
        });

        // Create recording entry if recording is enabled
        if (recordingFile) {
          const recordingEnabled = (await settingsRepo.get('call_recording_enabled')) === 'true';
          if (recordingEnabled) {
            await callRecordingRepo.create({
              callLogId: callLog.id,
              filePath: recordingFile,
              uniqueId: session.uniqueId,
            });
            logger.info(`Browser call recording started: ${recordingFile}`);
          }
        }

        // AGI returns immediately, dialplan continues
      } catch (error) {
        logger.error('Browser call start error:', error);
      }
    });

    // Handle browser WebRTC call end - complete recording
    agiServer.on('browser-call-end', async (agi, session) => {
      try {
        const duration = parseInt(await agi.getVariable('CALL_DURATION') || '0', 10);
        const recordingFile = await agi.getVariable('RECORDING_FILE');

        logger.info(`Browser call end: ${session.uniqueId}, duration=${duration}s`);

        // Find and complete recording
        const recording = await callRecordingRepo.findByUniqueId(session.uniqueId);
        if (recording && recordingFile) {
          // Get file size
          const fs = await import('fs');
          let fileSize: number | undefined;
          try {
            const stats = await fs.promises.stat(recordingFile);
            fileSize = stats.size;
          } catch {
            // File may not exist yet
          }

          await callRecordingRepo.complete(recording.id, duration, fileSize);
          logger.info(`Browser call recording completed: ${recordingFile}, size=${fileSize}`);
        }

        // Update call log duration
        const callLog = await callLogRepo.findByUniqueId(session.uniqueId);
        if (callLog) {
          await callLogRepo.update(callLog.id, { durationSeconds: duration });
        }
      } catch (error) {
        logger.error('Browser call end error:', error);
      }
    });

    // Handle AI agent call end - create call log and complete recording for AI test calls
    agiServer.on('ai-call-end', async (agi, session) => {
      try {
        const duration = parseInt(await agi.getVariable('CALL_DURATION') || '0', 10);
        const recordingFile = await agi.getVariable('RECORDING_FILE');
        const agentId = await agi.getVariable('AGENT_ID');

        logger.info(`AI call end: ${session.uniqueId}, duration=${duration}s, recording=${recordingFile}`);

        // Create or find call log
        let callLog = await callLogRepo.findByUniqueId(session.uniqueId);
        if (!callLog) {
          callLog = await callLogRepo.create({
            callerId: session.callerId || 'ai-test',
            did: session.dnid || session.extension || '',
            ivrMenuId: null,
            optionsPressed: '',
            finalDestination: agentId ? `ai-agent:${agentId}` : 'ai-agent-test',
            durationSeconds: duration,
            disposition: 'AI_TEST',
            uniqueId: session.uniqueId,
          });
          logger.info(`Created call log for AI test call: ${callLog.id}`);
        } else {
          await callLogRepo.update(callLog.id, { durationSeconds: duration });
        }

        // Create and complete recording entry
        if (recordingFile) {
          const fs = await import('fs');
          let fileSize: number | undefined;
          try {
            const stats = await fs.promises.stat(recordingFile);
            fileSize = stats.size;
          } catch {
            // File may not exist yet
          }

          // Check if recording entry already exists
          let recording = await callRecordingRepo.findByUniqueId(session.uniqueId);
          if (!recording) {
            recording = await callRecordingRepo.create({
              callLogId: callLog.id,
              filePath: recordingFile,
              uniqueId: session.uniqueId,
            });
          }

          await callRecordingRepo.complete(recording.id, duration, fileSize);
          logger.info(`AI call recording completed: ${recordingFile}, size=${fileSize}`);
        }
      } catch (error) {
        logger.error('AI call end error:', error);
      }
    });

    // Handle trunk test call end - create call log and recording
    agiServer.on('test-call-end', async (agi, session) => {
      try {
        const duration = parseInt(await agi.getVariable('CALL_DURATION') || '0', 10);
        const recordingFile = await agi.getVariable('RECORDING_FILE');

        logger.info(`Test call end: ${session.uniqueId}, duration=${duration}s, recording=${recordingFile}`);

        // Create call log
        const callLog = await callLogRepo.create({
          callerId: session.callerId || 'trunk-test',
          did: session.dnid || session.extension || '',
          ivrMenuId: null,
          optionsPressed: '',
          finalDestination: 'trunk-test',
          durationSeconds: duration,
          disposition: 'TRUNK_TEST',
          uniqueId: session.uniqueId,
        });

        // Create and complete recording entry
        if (recordingFile) {
          const fs = await import('fs');
          let fileSize: number | undefined;
          try {
            const stats = await fs.promises.stat(recordingFile);
            fileSize = stats.size;
          } catch {
            // File may not exist yet
          }

          const recording = await callRecordingRepo.create({
            callLogId: callLog.id,
            filePath: recordingFile,
            uniqueId: session.uniqueId,
          });

          await callRecordingRepo.complete(recording.id, duration, fileSize);
          logger.info(`Test call recording completed: ${recordingFile}, size=${fileSize}`);
        }
      } catch (error) {
        logger.error('Test call end error:', error);
      }
    });

    // Handle AI agent calls with full conversation
    // Uses OpenAI Realtime API for low-latency streaming when available
    // Falls back to file-based STT → LLM → TTS for other providers
    agiServer.on('ai-agent-call', async (agi, session) => {
      try {
        // Get agent ID from channel variable
        const agentId = await agi.getVariable('AGENT_ID');
        const useRealtime = await agi.getVariable('USE_REALTIME');
        logger.info(`AI Agent call: ${session.uniqueId}, Agent ID: ${agentId}, Realtime: ${useRealtime}`);

        if (!agentId) {
          await agi.streamFile('invalid');
          return;
        }

        // Get agent details from database (with all configuration)
        interface AIAgentRow {
          id: string;
          name: string;
          description: string | null;
          system_prompt: string;
          greeting_text: string;
          voice_provider: string;
          voice_id: string;
          language: string;
          llm_provider: string;
          llm_model: string;
          llm_temperature: number;
          llm_max_tokens: number;
          stt_provider: string;
          stt_language: string;
          max_turn_duration_seconds: number;
          silence_timeout_ms: number;
          use_realtime: boolean;
          flow_enabled: boolean;
          flow_data: string | null;
        }
        const agent = await db.get<AIAgentRow>(
          `SELECT id, name, description, system_prompt, greeting_text,
                 voice_provider, voice_id, language,
                 llm_provider, llm_model, llm_temperature, llm_max_tokens,
                 stt_provider, stt_language,
                 max_turn_duration_seconds, silence_timeout_ms,
                 use_realtime, flow_enabled, flow_data
          FROM ai_agents WHERE id = $1`,
          [agentId]
        );

        if (!agent) {
          logger.warn(`AI Agent not found: ${agentId}`);
          await agi.streamFile('invalid');
          return;
        }

        logger.info(`AI Agent config: LLM=${agent.llm_provider}, STT=${agent.stt_provider}, Voice=${agent.voice_provider}`);

        // Check if we should use OpenAI Realtime API (low-latency mode)
        const canUseRealtime = realtimeService && audioSocketServer &&
          (agent.use_realtime || useRealtime === '1') &&
          agent.llm_provider === 'openai';

        if (canUseRealtime) {
          // ============================================================
          // REAL-TIME MODE: Use OpenAI Realtime API via AudioSocket
          // Provides sub-500ms latency for natural conversations
          // ============================================================
          logger.info(`[AI Agent:${session.uniqueId}] Using OpenAI Realtime mode (low-latency)`);

          // Map voice_id to OpenAI Realtime voice
          const voiceMap: Record<string, string> = {
            'alloy': 'alloy',
            'echo': 'echo',
            'shimmer': 'shimmer',
            'ash': 'ash',
            'ballad': 'ballad',
            'coral': 'coral',
            'sage': 'sage',
            'verse': 'verse',
            // Default mapping for ElevenLabs/other voices
            'default': 'alloy',
          };

          const realtimeVoice = voiceMap[agent.voice_id] || voiceMap['default'];

          // Register agent config with AudioSocket server
          audioSocketServer!.registerCallConfig(session.uniqueId, {
            agentId: agent.id,
            agentName: agent.name,
            systemPrompt: agent.system_prompt,
            greetingText: agent.greeting_text,
            voice: realtimeVoice,
            language: agent.language,
            flowEnabled: agent.flow_enabled,
            flowData: agent.flow_data,
          });

          // Answer the call if not already answered
          await agi.answer();

          // Redirect to AudioSocket application
          // The call will be handled by AudioSocket server with real-time audio streaming
          await agi.exec('AudioSocket', '127.0.0.1:9092');

          logger.info(`[AI Agent:${session.uniqueId}] Realtime call completed`);
          return;
        }

        // ============================================================
        // FILE-BASED MODE: Traditional STT → LLM → TTS flow
        // Works with any LLM provider but has higher latency (2-5s)
        // ============================================================
        logger.info(`[AI Agent:${session.uniqueId}] Using file-based mode (standard)`);

        // Create conversation context
        const agentConfig: AIAgentConfig = {
          id: agent.id,
          name: agent.name,
          systemPrompt: agent.system_prompt,
          greetingText: agent.greeting_text,
          llmProvider: agent.llm_provider as any,
          llmModel: agent.llm_model,
          sttProvider: agent.stt_provider as any,
          voiceProvider: agent.voice_provider,
          voiceId: agent.voice_id,
          language: agent.language,
          maxTurns: 10,
        };

        const context = aiConversationService.createContext(agentConfig);

        // Generate and play greeting
        const greetingPromptId = `ai-greeting-${session.uniqueId}`;
        const greetingResult = await aiConversationService.generateTTS(
          agent.greeting_text,
          greetingPromptId,
          agent.voice_provider,
          agent.voice_id
        );

        if (!greetingResult.success || !greetingResult.audioPath) {
          logger.error(`Failed to generate greeting: ${greetingResult.error}`);
          await agi.streamFile('invalid');
          return;
        }

        // Play the greeting (remove file extension for Asterisk)
        const greetingPlayFile = greetingResult.audioPath.replace(/\.(wav|mp3|gsm|sln16)$/, '');
        await agi.streamFile(greetingPlayFile);

        // Conversation loop
        let conversationEnded = false;
        let silentTurns = 0;
        const maxSilentTurns = 2;

        while (!conversationEnded && context.turnCount < context.maxTurns) {
          // Record caller's speech
          const recordFile = `/tmp/ai-caller-${session.uniqueId}-${context.turnCount}`;
          const maxDurationMs = (agent.max_turn_duration_seconds || 10) * 1000;
          const silenceSeconds = Math.ceil((agent.silence_timeout_ms || 3000) / 1000);

          logger.info(`Recording caller input (turn ${context.turnCount + 1})...`);
          await agi.recordFile(recordFile, 'wav', '#', maxDurationMs, true, silenceSeconds);

          // Process the turn: STT → LLM → TTS
          const promptIdBase = `ai-response-${session.uniqueId}`;
          const turnResult = await aiConversationService.processTurn(
            `${recordFile}.wav`,
            context,
            promptIdBase
          );

          if (!turnResult.success) {
            logger.error(`Turn processing failed: ${turnResult.error}`);
            // Continue with fallback already handled by processTurn
          }

          // Handle empty/silent recordings
          if (turnResult.isEmpty) {
            silentTurns++;
            if (silentTurns >= maxSilentTurns) {
              logger.info('Too many silent turns, ending conversation');
              conversationEnded = true;
            }
          } else {
            silentTurns = 0;
          }

          // Play the response
          if (turnResult.audioFile) {
            const responsePlayFile = turnResult.audioFile.replace(/\.(wav|mp3|gsm|sln16)$/, '');
            await agi.streamFile(responsePlayFile);
          }

          // Check if conversation should end
          if (aiConversationService.shouldEndConversation(context, turnResult.isGoodbye)) {
            conversationEnded = true;
          }

          logger.info(`Turn ${context.turnCount}: User said "${turnResult.userText || '(silence)'}", AI responded with "${turnResult.responseText.substring(0, 50)}..."`);
        }

        // Play farewell
        const farewellPromptId = `ai-farewell-${session.uniqueId}`;
        const farewellResult = await aiConversationService.generateFarewell(
          context,
          farewellPromptId
        );

        if (farewellResult.success && farewellResult.audioPath) {
          const farewellPlayFile = farewellResult.audioPath.replace(/\.(wav|mp3|gsm|sln16)$/, '');
          await agi.streamFile(farewellPlayFile);
        }

        logger.info(`AI Agent call completed: ${session.uniqueId}, Total turns: ${context.turnCount}`);
      } catch (error) {
        logger.error('AI Agent call error:', error);
      }
    });

    agiServer.on('error', (error) => {
      logger.error('AGI server error:', error);
    });

    agiServer.start();
    logger.info(`AGI server started on port ${config.agiServerPort}`);

    // Initialize Telegram bot (optional - only if token provided)
    let bot: any = null;
    if (config.telegramBotToken) {
      const botServices: BotServices = {
        settingsRepo,
        promptRepo,
        ivrMenuRepo,
        extensionRepo,
        routingRepo,
        callLogRepo,
        trunkRepo,
        dialerCampaignRepo,
        campaignContactRepo,
        ttsService,
        audioService,
        asteriskConfigService,
        amiClient,
        ivrController,
        dialerService,
        mohService,
        initialAdminId: config.initialAdminId,
      };

      bot = createBot(config.telegramBotToken, botServices);

      // Setup dialer event listeners for Telegram notifications
      dialerService.on('leadAlert', async ({ campaign, contact, status }) => {
        try {
          await sendLeadAlert(bot, settingsRepo, campaign, contact, status);
        } catch (error) {
          logger.error('Failed to send lead alert:', error);
        }
      });

      dialerService.on('campaignStarted', async (campaign) => {
        try {
          await sendCampaignNotification(bot, settingsRepo, campaign, 'started');
        } catch (error) {
          logger.error('Failed to send campaign notification:', error);
        }
      });

      dialerService.on('campaignPaused', async (campaign) => {
        try {
          await sendCampaignNotification(bot, settingsRepo, campaign, 'paused');
        } catch (error) {
          logger.error('Failed to send campaign notification:', error);
        }
      });

      dialerService.on('campaignStopped', async (campaign) => {
        try {
          await sendCampaignNotification(bot, settingsRepo, campaign, 'completed');
        } catch (error) {
          logger.error('Failed to send campaign notification:', error);
        }
      });

      // Handle trunk errors during campaigns
      dialerService.on('trunkError', async ({ campaign, trunk, error, status }) => {
        logger.error(`Trunk error during campaign ${campaign?.name}: ${error}`);
        try {
          const chatId = await settingsRepo.get('telegram_admin_chat_id');
          if (chatId && bot) {
            await bot.api.sendMessage(
              chatId,
              `🚨 *SIP TRUNK ERROR*\n\n` +
              `Campaign *${campaign?.name || 'Unknown'}* has been paused!\n\n` +
              `📞 Trunk: ${trunk?.name || 'Unknown'}\n` +
              `❌ Status: ${status || 'Unknown'}\n` +
              `📋 Error: ${error}\n\n` +
              `⏸️ The campaign has been automatically paused to prevent call failures.\n` +
              `Please check your SIP trunk configuration and restart the campaign when ready.`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (err) {
          logger.error('Failed to send trunk error notification:', err);
        }
      });

      // Register conversations
      registerConversations(bot);

      // Setup handlers
      setupCallbackHandlers(bot);
      setupMessageHandlers(bot);

      // Start command
      bot.command('start', async (ctx: any) => {
        await ctx.reply('🎉 Welcome to *BotPBX Admin Panel*!\n\nSelect an option below to get started:', {
          parse_mode: 'Markdown',
          reply_markup: kb.mainMenuKeyboard(),
        });
      });

      // Help command
      bot.command('help', async (ctx: any) => {
        await ctx.reply(
          '*📚 BotPBX Help*\n\n' +
          '🔹 Use the menu buttons to:\n' +
          '  📞 Configure IVR menus and options\n' +
          '  🔌 Manage SIP extensions\n' +
          '  🔀 Set up call routing\n' +
          '  🗣️ Generate TTS prompts\n' +
          '  🚀 Control campaign status\n' +
          '  📊 View call statistics\n' +
          '  🔍 Run Asterisk diagnostics\n\n' +
          '*⌨️ Commands:*\n' +
          '  /start - Show main menu\n' +
          '  /help - Show this help\n' +
          '  /status - Show system status',
          { parse_mode: 'Markdown' }
        );
      });

      // Status command
      bot.command('status', async (ctx: any) => {
        const campaignActive = await settingsRepo.isCampaignActive();
        const activeCalls = ivrController.getActiveCallsCount();
        const menuCount = await ivrMenuRepo.count();
        const extensionCount = await extensionRepo.count();
        const todayStats = await callLogRepo.getTodayStats();
        const amiConnected = amiClient.isConnected();
        const agiRunning = agiServer.isRunning();
        const ttsAvailable = ttsService.isAvailable();

        // Get additional Asterisk info if connected
        let pjsipEndpoints = 0;
        let asteriskVersion = 'Unknown';

        if (amiConnected) {
          try {
            const endpoints = await amiClient.getPJSIPEndpoints();
            pjsipEndpoints = endpoints.length;
            asteriskVersion = await amiClient.getVersion();
          } catch {
            // Ignore errors
          }
        }

        const statusEmoji = (ok: boolean) => ok ? '✅' : '❌';
        const campaignEmoji = campaignActive ? '🟢' : '🔴';

        await ctx.reply(
          `*📊 System Status Dashboard*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*🔧 Core Services:*\n` +
          `${statusEmoji(amiConnected)} AMI Connection\n` +
          `${statusEmoji(agiRunning)} AGI Server (port ${config.agiServerPort})\n` +
          `${statusEmoji(ttsAvailable)} ElevenLabs TTS\n\n` +
          `*🚀 Campaign:*\n` +
          `${campaignEmoji} Status: ${campaignActive ? 'ACTIVE' : 'STOPPED'}\n` +
          `📞 Active Calls: ${activeCalls}\n\n` +
          `*⚙️ Configuration:*\n` +
          `📞 IVR Menus: ${menuCount}\n` +
          `🔌 Extensions: ${extensionCount}\n` +
          `📱 PJSIP Endpoints: ${pjsipEndpoints}\n\n` +
          `*📈 Today's Statistics:*\n` +
          `📊 Total Calls: ${todayStats.totalCalls}\n` +
          `✅ Answered: ${todayStats.answeredCalls}\n` +
          `❌ Abandoned: ${todayStats.abandonedCalls}\n\n` +
          `*🖥️ Asterisk:*\n` +
          `${asteriskVersion}`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.mainMenuKeyboard(),
          }
        );
      });

      // Start the bot with retry logic for polling conflicts
      const startBotWithRetry = async (retries = 3, delay = 5000) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await bot.start({
              drop_pending_updates: true,
              onStart: (botInfo: any) => {
                logger.info(`Telegram bot started: @${botInfo.username}`);
              },
            });
            return; // Success, exit retry loop
          } catch (error: any) {
            if (error?.error_code === 409 && attempt < retries) {
              logger.warn(`Telegram bot polling conflict (attempt ${attempt}/${retries}), waiting ${delay / 1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              logger.error('Failed to start Telegram bot:', error);
              logger.warn('Continuing without Telegram bot...');
              return;
            }
          }
        }
      };
      startBotWithRetry();
      logger.info('Telegram bot initialized');
    } else {
      logger.info('Telegram bot disabled (no token configured)');
    }

    // Generate all Asterisk config files (pjsip, trunks, extensions)
    await asteriskConfigService.writeAllConfigs();
    logger.info('Asterisk configs generated');

    // Resume any running dialer campaigns
    if (amiClient.isConnected()) {
      try {
        await dialerService.resumeRunningCampaigns();
        logger.info('Dialer campaigns resumed');
      } catch (error) {
        logger.error('Failed to resume dialer campaigns:', error);
      }
    }

    // Start Web Admin API Server
    let apiServer: any = null;
    let wsManager: WebSocketManager | null = null;
    try {
      const apiResult = await startApiServer(db, amiClient, dialerService, browserAudioServer, audioSocketServer);
      apiServer = apiResult.server;
      wsManager = apiResult.wsManager;
      logger.info(`Web Admin API started on port ${process.env.WEB_API_PORT || 3000}`);

      // Setup AMI event forwarding to WebSocket clients
      if (amiClient.isConnected() && wsManager) {
        amiClient.on('newchannel', (event) => {
          // AMI events use lowercase property names
          wsManager!.broadcast('calls', 'call:new', {
            uniqueId: event.uniqueid || event.Uniqueid,
            channel: event.channel || event.Channel,
            callerIdNum: event.calleridnum || event.CallerIDNum,
            callerIdName: event.calleridname || event.CallerIDName,
            state: event.channelstate || event.ChannelState,
            timestamp: Date.now(),
          });
        });

        amiClient.on('newstate', (event) => {
          wsManager!.broadcast('calls', 'call:update', {
            uniqueId: event.uniqueid || event.Uniqueid,
            channel: event.channel || event.Channel,
            state: event.channelstate || event.ChannelState,
            stateDesc: event.channelstatedesc || event.ChannelStateDesc,
            timestamp: Date.now(),
          });
        });

        amiClient.on('hangup', (event) => {
          wsManager!.broadcast('calls', 'call:ended', {
            uniqueId: event.uniqueid || event.Uniqueid,
            channel: event.channel || event.Channel,
            cause: event.cause || event.Cause,
            causeTxt: event.causeTxt || event['Cause-txt'],
            timestamp: Date.now(),
          });
        });

        amiClient.on('dtmf', (event) => {
          wsManager!.broadcast('calls', 'call:dtmf', {
            uniqueId: event.uniqueid || event.Uniqueid,
            digit: event.digit || event.Digit,
            direction: event.direction || event.Direction,
            timestamp: Date.now(),
          });
        });

        logger.info('AMI events connected to WebSocket');
      }

      // Setup dialer contactCalled event for real-time contact group updates
      if (wsManager) {
        dialerService.on('contactCalled', ({ phoneNumber, campaignId, status, timestamp }) => {
          wsManager!.broadcast('contacts', 'contact:called', {
            phoneNumber,
            campaignId,
            status,
            timestamp,
          });
        });
        logger.info('Dialer contactCalled events connected to WebSocket');
      }
    } catch (error) {
      logger.error('Failed to start Web Admin API:', error);
      logger.warn('Continuing without Web Admin API...');
    }

    logger.info('='.repeat(50));
    logger.info('BotPBX System Ready!');
    logger.info('='.repeat(50));

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down...');

      // Shutdown API server
      if (apiServer) {
        await apiServer.close();
        logger.info('Web Admin API stopped');
      }

      // Shutdown dialer service first
      await dialerService.shutdown();
      logger.info('Dialer service stopped');

      if (bot) {
        await bot.stop();
        logger.info('Telegram bot stopped');
      }

      agiServer.stop();
      logger.info('AGI server stopped');

      // Shutdown AudioSocket server and Realtime sessions
      if (audioSocketServer) {
        audioSocketServer.stop();
        logger.info('AudioSocket server stopped');
      }
      if (realtimeService) {
        realtimeService.endAllSessions();
        logger.info('Realtime sessions ended');
      }

      amiClient.disconnect();
      logger.info('AMI disconnected');

      closeDatabase();
      logger.info('Database closed');

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
