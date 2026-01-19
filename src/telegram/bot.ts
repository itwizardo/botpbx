import { Bot, Context, session, SessionFlavor, InlineKeyboard, InputFile } from 'grammy';
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from '@grammyjs/conversations';
import { telegramLogger } from '../utils/logger';
import { SessionData } from '../models/types';

// Global services reference for conversations
let globalServices: BotServices | null = null;

export function getServices(): BotServices {
  if (!globalServices) {
    throw new Error('Services not initialized');
  }
  return globalServices;
}

// Services and repositories types (injected at runtime)
export interface BotServices {
  settingsRepo: import('../db/repositories/settingsRepository').SettingsRepository;
  promptRepo: import('../db/repositories/promptRepository').PromptRepository;
  ivrMenuRepo: import('../db/repositories/ivrMenuRepository').IVRMenuRepository;
  extensionRepo: import('../db/repositories/extensionRepository').ExtensionRepository;
  routingRepo: import('../db/repositories/routingRepository').RoutingRepository;
  callLogRepo: import('../db/repositories/callLogRepository').CallLogRepository;
  trunkRepo: import('../db/repositories/trunkRepository').TrunkRepository;
  dialerCampaignRepo: import('../db/repositories/dialerCampaignRepository').DialerCampaignRepository;
  campaignContactRepo: import('../db/repositories/campaignContactRepository').CampaignContactRepository;
  ttsService: import('../services/ttsService').TTSService;
  audioService: import('../services/audioService').AudioService;
  asteriskConfigService: import('../services/asteriskConfigService').AsteriskConfigService;
  amiClient: import('../asterisk/amiClient').AMIClient;
  ivrController: import('../asterisk/ivrController').IVRController;
  dialerService?: import('../services/dialerService').DialerService;
  mohService?: import('../services/mohService').MohService;
  initialAdminId: number | null;
}

// Context types
export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context> & {
  services: BotServices;
};

export type MyConversation = Conversation<MyContext>;

/**
 * Create and configure the Telegram bot
 */
export function createBot(token: string, services: BotServices): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Store services globally for conversation access
  globalServices = services;

  // Session middleware
  bot.use(session({
    initial: (): SessionData => ({}),
  }));

  // Inject services into context
  bot.use((ctx, next) => {
    ctx.services = services;
    return next();
  });

  // Authorization middleware - must be an admin
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
      telegramLogger.warn('Message without user ID');
      return;
    }

    // Check if user is an admin
    const isAdmin = await ctx.services.settingsRepo.isAdmin(userId);
    const isInitialAdmin = ctx.services.initialAdminId === userId;

    // Auto-add initial admin if not exists
    if (isInitialAdmin && !isAdmin) {
      await ctx.services.settingsRepo.addAdmin(userId, ctx.from?.username);
      telegramLogger.info(`Initial admin added: ${userId}`);
    }

    if (!isAdmin && !isInitialAdmin) {
      telegramLogger.warn(`Unauthorized access attempt: ${userId}`);
      await ctx.reply('Unauthorized. Contact administrator.');
      return;
    }

    return next();
  });

  // Conversations middleware
  bot.use(conversations());

  // Error handler
  bot.catch((err) => {
    telegramLogger.error('Bot error:', err);
  });

  telegramLogger.info('Telegram bot created');

  return bot;
}

/**
 * Create IVR menu conversation
 */
export async function createIVRMenuConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  // Step 1: Get menu name
  await ctx.reply('📞 *Create New IVR Menu*\n\nEnter a name for the new IVR menu:', {
    parse_mode: 'Markdown',
  });
  const nameCtx = await conversation.wait();
  const menuName = nameCtx.message?.text?.trim();

  if (!menuName) {
    await nameCtx.reply('❌ Invalid name. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back to IVR Menus', 'menu:ivr'),
    });
    return;
  }

  // Step 2: Create menu with defaults using global services
  const services = getServices();
  const menu = await services.ivrMenuRepo.create({
    name: menuName,
    welcomePromptId: null,
    invalidPromptId: null,
    timeoutPromptId: null,
    timeoutSeconds: 5,
    maxRetries: 3,
  });

  await nameCtx.reply(
    `✅ *IVR Menu Created!*\n\n` +
    `📛 Name: ${menuName}\n` +
    `🆔 ID: \`${menu.id}\`\n\n` +
    `Now configure prompts and options.`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('⚙️ Configure Menu', `ivr:view:${menu.id}`).row()
        .text('⬅️ Back to IVR Menus', 'menu:ivr'),
    }
  );
}

/**
 * Create extension conversation
 */
export async function createExtensionConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  // Use global services reference (not serialized)
  const services = getServices();

  // Step 1: Get extension number
  const nextNumber = await services.extensionRepo.getNextAvailableNumber();
  await ctx.reply(`🔌 *Create New Extension*\n\nEnter extension number (suggested: ${nextNumber}):`, {
    parse_mode: 'Markdown',
  });
  const numberCtx = await conversation.wait();
  const extNumber = numberCtx.message?.text?.trim();

  if (!extNumber || !/^\d{3,6}$/.test(extNumber)) {
    await numberCtx.reply('❌ Invalid extension number. Use 3-6 digits. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Extensions', 'menu:extensions'),
    });
    return;
  }

  if (await services.extensionRepo.exists(extNumber)) {
    await numberCtx.reply(`❌ Extension ${extNumber} already exists. Operation cancelled.`, {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Extensions', 'menu:extensions'),
    });
    return;
  }

  // Step 2: Get extension name
  await numberCtx.reply('Enter a name for this extension (e.g., "Sales", "Support"):');
  const nameCtx = await conversation.wait();
  const extName = nameCtx.message?.text?.trim() || `Extension ${extNumber}`;

  // Step 3: Generate password
  const { generateSecurePassword } = await import('../db/repositories/extensionRepository');
  const password = generateSecurePassword();

  // Create extension
  const ext = await services.extensionRepo.create({
    number: extNumber,
    name: extName,
    password,
    enabled: true,
  });

  // Regenerate PJSIP config
  await services.asteriskConfigService.writePJSIPConfig();

  // Reload Asterisk PJSIP
  try {
    await services.amiClient.reload('res_pjsip.so');
  } catch (error) {
    telegramLogger.warn('Failed to reload PJSIP:', error);
  }

  // Get server IP
  const serverIp = await getServerIP();

  await nameCtx.reply(
    `✅ *Extension Created!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📛 *Name:* ${extName}\n` +
    `🔢 *Extension:* ${extNumber}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `*📱 SIP Login Details:*\n` +
    `┌─────────────────────\n` +
    `│ 🖥️ Server: \`${serverIp}\`\n` +
    `│ 👤 Username: \`${extNumber}\`\n` +
    `│ 🔑 Password: \`${password}\`\n` +
    `│ 🔌 Port: \`5060\`\n` +
    `└─────────────────────\n\n` +
    `_Tap on credentials to copy_`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📋 View Extension', `ext:view:${ext.number}`).row()
        .text('⬅️ Back to Extensions', 'menu:extensions'),
    }
  );
}

// Helper to get server IP
async function getServerIP(): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    const ip = execSync("hostname -I | awk '{print $1}'").toString().trim();
    return ip || 'YOUR_SERVER_IP';
  } catch {
    return 'YOUR_SERVER_IP';
  }
}

/**
 * Create routing rule conversation
 */
export async function createRoutingConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const { routingRepo, ivrMenuRepo, extensionRepo } = ctx.services;

  // Step 1: Get DID
  await ctx.reply(
    'Enter the DID (phone number) for this routing rule:\n' +
    '(Use "default" for a catch-all rule)'
  );
  const didCtx = await conversation.wait();
  const did = didCtx.message?.text?.trim();

  if (!did) {
    await ctx.reply('Invalid DID. Operation cancelled.');
    return;
  }

  if (await routingRepo.existsByDID(did)) {
    await ctx.reply(`Routing rule for ${did} already exists. Operation cancelled.`);
    return;
  }

  // Step 2: Get target type
  await ctx.reply(
    'What should this DID route to?\n\n' +
    '1. IVR Menu\n' +
    '2. Extension\n' +
    '3. Queue\n\n' +
    'Reply with 1, 2, or 3:'
  );
  const typeCtx = await conversation.wait();
  const typeChoice = typeCtx.message?.text?.trim();

  let targetType: 'ivr_menu' | 'extension' | 'queue';
  switch (typeChoice) {
    case '1':
      targetType = 'ivr_menu';
      break;
    case '2':
      targetType = 'extension';
      break;
    case '3':
      targetType = 'queue';
      break;
    default:
      await ctx.reply('Invalid choice. Operation cancelled.');
      return;
  }

  // Step 3: Get target ID
  let targetId = '';

  if (targetType === 'ivr_menu') {
    const menus = await ivrMenuRepo.findAll();
    if (menus.length === 0) {
      await ctx.reply('No IVR menus exist. Create one first.');
      return;
    }

    await ctx.reply(
      'Available IVR Menus:\n' +
      menus.map((m: any, i: number) => `${i + 1}. ${m.name} (${m.id})`).join('\n') +
      '\n\nEnter the number or menu ID:'
    );
    const targetCtx = await conversation.wait();
    const targetInput = targetCtx.message?.text?.trim();

    const index = parseInt(targetInput || '', 10) - 1;
    if (index >= 0 && index < menus.length) {
      targetId = menus[index].id;
    } else {
      targetId = targetInput || '';
    }
  } else if (targetType === 'extension') {
    const extensions = await extensionRepo.findAll();
    if (extensions.length === 0) {
      await ctx.reply('No extensions exist. Create one first.');
      return;
    }

    await ctx.reply(
      'Available Extensions:\n' +
      extensions.map((e: any) => `- ${e.number}: ${e.name}`).join('\n') +
      '\n\nEnter extension number:'
    );
    const targetCtx = await conversation.wait();
    targetId = targetCtx.message?.text?.trim() || '';
  } else {
    await ctx.reply('Enter queue name:');
    const targetCtx = await conversation.wait();
    targetId = targetCtx.message?.text?.trim() || '';
  }

  if (!targetId) {
    await ctx.reply('Invalid target. Operation cancelled.');
    return;
  }

  // Create routing rule
  await routingRepo.create({
    did,
    targetType,
    targetId,
    enabled: true,
  });

  await ctx.reply(
    `Routing rule created!\n\n` +
    `DID: ${did}\n` +
    `Target: ${targetType} -> ${targetId}`
  );
}

/**
 * Generate TTS conversation - supports both Piper (local) and ElevenLabs
 */
export async function generateTTSConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const services = getServices();
  const provider = await services.settingsRepo.getTTSProvider();

  // Check if TTS is available
  if (provider === 'elevenlabs' && !services.ttsService.isElevenLabsConfigured()) {
    await ctx.reply('❌ ElevenLabs API key not configured. Set it in Settings first, or switch to Piper TTS.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
    });
    return;
  }

  let selectedVoice: string;
  let selectedVoiceName: string;

  if (provider === 'piper') {
    // Piper TTS flow
    await ctx.reply('🔄 Loading Piper voices...');

    const voicesResult = await services.ttsService.getPiperVoices();
    if (!voicesResult.success || !voicesResult.data || voicesResult.data.length === 0) {
      await ctx.reply(`❌ Piper server not available: ${voicesResult.error || 'No voices found'}`, {
        reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
      });
      return;
    }

    const voices = voicesResult.data;
    const currentVoice = await services.settingsRepo.getPiperVoice();

    // Build inline keyboard with voice buttons
    const voiceKb = new InlineKeyboard();
    voices.forEach((v) => {
      const genderIcon = v.gender === 'female' ? '♀️' : v.gender === 'male' ? '♂️' : '🔊';
      const shortName = v.id.replace('en_US-', 'US: ').replace('en_GB-', 'UK: ').replace('-medium', '');
      const current = v.id === currentVoice ? ' ✓' : '';
      voiceKb.text(`${genderIcon} ${shortName}${current}`, `tts:voice:${v.id}`).row();
    });
    voiceKb.text('❌ Cancel', 'cancel');

    await ctx.reply('🗣️ *Select a Piper Voice:*', {
      parse_mode: 'Markdown',
      reply_markup: voiceKb,
    });

    const voiceCtx = await conversation.wait();
    const callbackData = voiceCtx.callbackQuery?.data;

    if (!callbackData || callbackData === 'cancel') {
      await voiceCtx.answerCallbackQuery?.();
      await voiceCtx.editMessageText?.('❌ Cancelled', {
        reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
      });
      return;
    }

    await voiceCtx.answerCallbackQuery?.();

    // Extract voice ID from callback
    if (callbackData.startsWith('tts:voice:')) {
      selectedVoice = callbackData.replace('tts:voice:', '');
      selectedVoiceName = selectedVoice.replace('en_US-', 'US: ').replace('en_GB-', 'UK: ').replace('-medium', '');
    } else {
      selectedVoice = currentVoice;
      selectedVoiceName = currentVoice.replace('en_US-', 'US: ').replace('en_GB-', 'UK: ').replace('-medium', '');
    }
  } else {
    // ElevenLabs flow
    await ctx.reply('🔄 Loading ElevenLabs voices...');
    const voicesResult = await services.ttsService.getVoices();

    let voices: Array<{ voice_id: string; name: string; category: string; labels: Record<string, string> }> = [];
    if (voicesResult.success && voicesResult.data) {
      voices = voicesResult.data;
    }

    selectedVoice = await services.settingsRepo.getDefaultVoice() || '21m00Tcm4TlvDq8ikWAM';
    selectedVoiceName = 'Default';

    if (voices.length > 0) {
      const premade = voices.filter(v => v.category === 'premade').slice(0, 10);
      const cloned = voices.filter(v => v.category === 'cloned').slice(0, 5);

      let voiceList = '*🗣️ Select an ElevenLabs Voice*\n\n';
      voiceList += '*Premade Voices:*\n';
      premade.forEach((v, i) => {
        const accent = v.labels?.accent || '';
        const gender = v.labels?.gender || '';
        voiceList += `${i + 1}. ${v.name} ${accent ? `(${accent})` : ''} ${gender ? `[${gender}]` : ''}\n`;
      });

      if (cloned.length > 0) {
        voiceList += '\n*Your Cloned Voices:*\n';
        cloned.forEach((v, i) => {
          voiceList += `${premade.length + i + 1}. ${v.name}\n`;
        });
      }

      voiceList += `\n_Reply with number (1-${premade.length + cloned.length}) or "skip" for default_`;

      await ctx.reply(voiceList, { parse_mode: 'Markdown' });
      const voiceCtx = await conversation.wait();
      const voiceChoice = voiceCtx.message?.text?.trim()?.toLowerCase();

      if (voiceChoice && voiceChoice !== 'skip') {
        const idx = parseInt(voiceChoice, 10) - 1;
        const allVoices = [...premade, ...cloned];
        if (idx >= 0 && idx < allVoices.length) {
          selectedVoice = allVoices[idx].voice_id;
          selectedVoiceName = allVoices[idx].name;
        }
      }
    }
  }

  // Step 3: Get text to synthesize
  await ctx.reply('📝 Enter the text to convert to speech:');
  const textCtx = await conversation.wait();
  const text = textCtx.message?.text?.trim();

  if (!text) {
    await textCtx.reply('❌ No text provided. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
    });
    return;
  }

  // Step 4: Get prompt name
  await textCtx.reply('📛 Enter a name for this audio prompt:');
  const nameCtx = await conversation.wait();
  const promptName = nameCtx.message?.text?.trim() || 'Untitled';

  // Step 5: Generate audio
  const providerLabel = provider === 'piper' ? '🖥️ Piper' : '☁️ ElevenLabs';
  await nameCtx.reply(`🔄 Generating audio with ${providerLabel} voice "${selectedVoiceName}"...`);

  const { v4: uuidv4 } = await import('uuid');
  const promptId = uuidv4();

  const result = await services.ttsService.generateAudio(text, promptId, { voice: selectedVoice });

  if (!result.success || !result.data) {
    await nameCtx.reply(`❌ Failed to generate audio: ${result.error}`, {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
    });
    return;
  }

  // Convert to Asterisk format (for Piper, the output is already WAV but may need resampling)
  const convertResult = await services.audioService.convertToAsteriskFormat(result.data);

  if (!convertResult.success || !convertResult.data) {
    await nameCtx.reply(`❌ Audio generated but conversion failed: ${convertResult.error}`, {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Media', 'menu:media'),
    });
    return;
  }

  // Save prompt to database
  await services.promptRepo.create({
    name: promptName,
    type: 'tts',
    filePath: convertResult.data.wavPath,
    text,
    voice: selectedVoice,
  });

  await nameCtx.reply(
    `✅ *Audio Prompt Generated!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📛 *Name:* ${promptName}\n` +
    `🗣️ *Voice:* ${selectedVoiceName}\n` +
    `🔊 *Provider:* ${providerLabel}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `*📝 Text:*\n${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🎵 View Prompts', 'menu:prompts').row()
        .text('⬅️ Back to Media', 'menu:media'),
    }
  );

  // Send the audio file so user can listen to it
  try {
    const fs = await import('fs');
    if (fs.existsSync(convertResult.data.wavPath)) {
      await nameCtx.replyWithAudio(new InputFile(convertResult.data.wavPath), {
        title: promptName,
        performer: `${providerLabel} - ${selectedVoiceName}`,
      });
    }
  } catch (audioSendError) {
    telegramLogger.error('Failed to send audio file:', audioSendError);
  }
}

/**
 * Upload audio conversation (handles file messages)
 */
export async function handleAudioUpload(ctx: MyContext): Promise<void> {
  const { audioService, promptRepo } = ctx.services;
  const message = ctx.message;

  if (!message) return;

  // Get file info
  const audio = message.audio;
  const voice = message.voice;
  const document = message.document;

  let fileId: string | undefined;
  let fileName = 'uploaded_audio';

  if (audio) {
    fileId = audio.file_id;
    fileName = audio.file_name || 'audio_file';
  } else if (voice) {
    fileId = voice.file_id;
    fileName = 'voice_message';
  } else if (document) {
    // Check if it's an audio file
    const mimeType = document.mime_type || '';
    if (!mimeType.startsWith('audio/')) {
      await ctx.reply('Please send an audio file.');
      return;
    }
    fileId = document.file_id;
    fileName = document.file_name || 'uploaded_audio';
  }

  if (!fileId) {
    await ctx.reply('Could not process the file.');
    return;
  }

  // Set session state to await prompt name
  ctx.session.awaitingInput = 'upload_name';
  ctx.session.tempData = { fileId, fileName };

  await ctx.reply('Audio received! Enter a name for this prompt:');
}

/**
 * Handle prompt name input for upload
 */
export async function handleUploadName(ctx: MyContext): Promise<void> {
  const { audioService, promptRepo } = ctx.services;
  const promptName = ctx.message?.text?.trim();

  if (!promptName || !ctx.session.tempData?.fileId) {
    await ctx.reply('Invalid input. Upload cancelled.');
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
    return;
  }

  const { fileId, fileName } = ctx.session.tempData as { fileId: string; fileName: string };

  await ctx.reply('Processing audio file...');

  try {
    // Get file from Telegram
    const file = await ctx.api.getFile(fileId);
    const filePath = file.file_path;

    if (!filePath) {
      await ctx.reply('Could not download file.');
      return;
    }

    // Download file
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${filePath}`;
    const { v4: uuidv4 } = await import('uuid');
    const promptId = uuidv4();

    const downloadResult = await audioService.downloadAndSave(fileUrl, promptId);

    if (!downloadResult.success || !downloadResult.data) {
      await ctx.reply(`Download failed: ${downloadResult.error}`);
      return;
    }

    // Convert to Asterisk format
    const convertResult = await audioService.convertToAsteriskFormat(downloadResult.data);

    if (!convertResult.success || !convertResult.data) {
      await ctx.reply(`Conversion failed: ${convertResult.error}`);
      return;
    }

    // Save to database
    await promptRepo.create({
      name: promptName,
      type: 'uploaded',
      filePath: convertResult.data.wavPath,
      text: null,
      voice: null,
    });

    await ctx.reply(
      `Audio prompt "${promptName}" uploaded!\n\n` +
      `File: ${convertResult.data.wavPath}`
    );
  } catch (error) {
    telegramLogger.error('Upload error:', error);
    await ctx.reply(`Upload failed: ${(error as Error).message}`);
  } finally {
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
  }
}

/**
 * Set ElevenLabs API key conversation
 */
export async function setApiKeyConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  await ctx.reply(
    '🔑 *Set ElevenLabs API Key*\n\n' +
    'Enter your ElevenLabs API key:\n' +
    '(Get one at https://elevenlabs.io)',
    { parse_mode: 'Markdown' }
  );

  const keyCtx = await conversation.wait();
  const apiKey = keyCtx.message?.text?.trim();

  if (!apiKey) {
    await keyCtx.reply('❌ No API key provided. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Settings', 'menu:settings'),
    });
    return;
  }

  // Validate the key using global services
  await keyCtx.reply('🔄 Validating API key...');

  const services = getServices();
  const validation = await services.ttsService.validateApiKey(apiKey);

  if (!validation.valid) {
    await keyCtx.reply(`❌ API key validation failed: ${validation.error || 'Invalid key'}`, {
      reply_markup: new InlineKeyboard().text('⬅️ Back to Settings', 'menu:settings'),
    });
    return;
  }

  // Save the key
  await services.settingsRepo.setElevenLabsApiKey(apiKey);
  services.ttsService.setApiKey(apiKey);

  await keyCtx.reply('✅ ElevenLabs API key saved successfully!', {
    reply_markup: new InlineKeyboard().text('⬅️ Back to Settings', 'menu:settings'),
  });
}

/**
 * Create SIP trunk conversation
 */
export async function createTrunkConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  // Step 1: Get trunk name
  await ctx.reply('🌐 *Create New SIP Trunk*\n\nEnter a name for this trunk (e.g., "Twilio", "My Provider"):', {
    parse_mode: 'Markdown',
  });

  const nameCtx = await conversation.wait();
  const name = nameCtx.message?.text?.trim();
  if (!name) {
    await nameCtx.reply('❌ No name provided. Operation cancelled.');
    return;
  }

  // Step 2: Get host/server
  await nameCtx.reply('Enter the SIP server hostname or IP:\n(e.g., sip.twilio.com, provider.voip.com)');

  const hostCtx = await conversation.wait();
  const host = hostCtx.message?.text?.trim();
  if (!host) {
    await hostCtx.reply('❌ No host provided. Operation cancelled.');
    return;
  }

  // Step 3: Get username
  await hostCtx.reply('Enter your SIP username/account:');

  const userCtx = await conversation.wait();
  const username = userCtx.message?.text?.trim();
  if (!username) {
    await userCtx.reply('❌ No username provided. Operation cancelled.');
    return;
  }

  // Step 4: Get password
  await userCtx.reply('Enter your SIP password:');

  const passCtx = await conversation.wait();
  const password = passCtx.message?.text?.trim();
  if (!password) {
    await passCtx.reply('❌ No password provided. Operation cancelled.');
    return;
  }

  try {
    telegramLogger.info(`Creating trunk: ${name} at ${host}`);

    // Use global services reference (not serialized)
    const services = getServices();
    const trunk = await services.trunkRepo.create({
      name,
      host,
      port: 5060,
      username,
      password,
      authUsername: null,
      fromUser: username,
      fromDomain: host,
      context: 'from-trunk',
      codecs: 'ulaw,alaw',
      enabled: true,
      register: true,
      stirShakenEnabled: false,
      stirShakenAttest: null,
      stirShakenProfile: null,
    });

    telegramLogger.info(`Trunk created with ID: ${trunk.id}`);

    await passCtx.reply(
      `✅ *SIP Trunk Created!*\n\n` +
      `📛 Name: ${trunk.name}\n` +
      `🌐 Host: ${trunk.host}:${trunk.port}\n` +
      `👤 Username: ${trunk.username}\n\n` +
      `⏳ Generating config and reloading Asterisk...`,
      { parse_mode: 'Markdown' }
    );

    // Auto-generate trunk config and reload PJSIP
    try {
      await services.asteriskConfigService.writeTrunkConfig();
      await services.amiClient.command('pjsip reload');
      await passCtx.reply('✅ Trunk config applied! You can now use "📞 Test Call" to verify.');
    } catch (reloadError) {
      telegramLogger.error('Failed to reload PJSIP:', reloadError);
      await passCtx.reply('⚠️ Trunk created but auto-reload failed. Use Quick Actions → Reload PJSIP manually.');
    }
  } catch (error) {
    telegramLogger.error('Failed to create trunk:', error);
    await passCtx.reply(`❌ Error creating trunk: ${(error as Error).message}`);
  }
}

/**
 * Test call conversation
 */
export async function testCallConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  // Get services from global reference (not serialized)
  const services = getServices();

  if (!services.amiClient.isConnected()) {
    await ctx.reply('❌ AMI not connected. Cannot make test calls.');
    return;
  }

  const trunks = await services.trunkRepo.findEnabled();
  if (trunks.length === 0) {
    await ctx.reply('❌ No enabled SIP trunks. Create one first.');
    return;
  }

  await ctx.reply(
    '📞 *Test Call*\n\n' +
    'Enter a phone number to call:\n' +
    '(Include country code, e.g., +12125551234)',
    { parse_mode: 'Markdown' }
  );

  const numCtx = await conversation.wait();
  const phoneNumber = numCtx.message?.text?.trim()?.replace(/[^0-9+]/g, '');

  if (!phoneNumber || phoneNumber.length < 10) {
    await numCtx.reply('❌ Invalid phone number. Operation cancelled.');
    return;
  }

  // Use the first enabled trunk
  const trunk = trunks[0];

  await numCtx.reply(`🔄 Initiating test call to ${phoneNumber} via ${trunk.name}...`);

  try {
    // Originate call using global services
    await services.amiClient.originate({
      channel: `PJSIP/${phoneNumber}@${trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      context: 'test-call',
      exten: 's',
      priority: 1,
      callerid: `"Test Call" <${trunk.username}>`,
      timeout: 30000,
    });

    await numCtx.reply(
      `✅ Test call initiated!\n\n` +
      `📞 Calling: ${phoneNumber}\n` +
      `🌐 Via: ${trunk.name}\n\n` +
      `The call should ring shortly. Check the Diagnostics for active channels.`
    );
  } catch (error) {
    telegramLogger.error('Test call failed:', error);
    await numCtx.reply(`❌ Failed to initiate call: ${(error as Error).message}`);
  }
}

/**
 * Test IVR Call - calls a number and plays the full IVR
 */
export async function testIVRCallConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  telegramLogger.debug('testIVRCallConversation started');
  const services = getServices();

  if (!services.amiClient.isConnected()) {
    await ctx.reply('❌ AMI not connected. Cannot make test calls.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:ivr'),
    });
    return;
  }

  const trunks = await services.trunkRepo.findEnabled();
  if (trunks.length === 0) {
    await ctx.reply('❌ No enabled SIP trunks. Create one in Extensions & SIP first.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:ivr'),
    });
    return;
  }

  await ctx.reply(
    '📞 *Test IVR Call*\n\n' +
    'This will call your phone and play the IVR.\n\n' +
    'Enter your phone number:\n' +
    '_(Include country code, e.g., +31612345678)_',
    { parse_mode: 'Markdown' }
  );

  const numCtx = await conversation.wait();
  const phoneNumber = numCtx.message?.text?.trim()?.replace(/[^0-9+]/g, '');

  if (!phoneNumber || phoneNumber.length < 10) {
    await numCtx.reply('❌ Invalid phone number. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:ivr'),
    });
    return;
  }

  const trunk = trunks[0];

  await numCtx.reply(`🔄 Calling ${phoneNumber}...\n\nYou will hear the IVR when you answer.`);

  try {
    await services.amiClient.originate({
      channel: `PJSIP/${phoneNumber}@${trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      context: 'test-ivr',
      exten: 's',
      priority: 1,
      callerid: `"IVR Test" <${trunk.username}>`,
      timeout: 30000,
    });

    await numCtx.reply(
      `✅ *IVR Test Call Initiated!*\n\n` +
      `📞 Calling: ${phoneNumber}\n` +
      `🌐 Via: ${trunk.name}\n\n` +
      `Answer the call to hear your IVR!`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⬅️ Back to IVR', 'menu:ivr'),
      }
    );
  } catch (error) {
    telegramLogger.error('IVR test call failed:', error);
    await numCtx.reply(`❌ Failed: ${(error as Error).message}`, {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:ivr'),
    });
  }
}

/**
 * Create dialer campaign conversation
 */
export async function createDialerCampaignConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const services = getServices();

  // Step 1: Get campaign name
  await ctx.reply(
    '📢 *Create New Dialer Campaign*\n\n' +
    'Enter a name for this campaign:',
    { parse_mode: 'Markdown' }
  );

  const nameCtx = await conversation.wait();
  const name = nameCtx.message?.text?.trim();

  if (!name) {
    await nameCtx.reply('❌ No name provided. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:dialer'),
    });
    return;
  }

  // Step 2: Select IVR menu
  const menus = await services.ivrMenuRepo.findAll();
  if (menus.length === 0) {
    await nameCtx.reply(
      '❌ No IVR menus exist. Create one first in the IVR section.',
      { reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:dialer') }
    );
    return;
  }

  let menuList = '*Select IVR Menu:*\n\n';
  menus.forEach((menu, i) => {
    menuList += `${i + 1}. ${menu.name}\n`;
  });
  menuList += `\n_Reply with number (1-${menus.length})_`;

  await nameCtx.reply(menuList, { parse_mode: 'Markdown' });

  const menuCtx = await conversation.wait();
  const menuChoice = parseInt(menuCtx.message?.text?.trim() || '', 10);

  if (isNaN(menuChoice) || menuChoice < 1 || menuChoice > menus.length) {
    await menuCtx.reply('❌ Invalid choice. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:dialer'),
    });
    return;
  }

  const selectedMenu = menus[menuChoice - 1];

  // Step 3: Select target extensions
  const extensions = await services.extensionRepo.findEnabled();
  if (extensions.length === 0) {
    await menuCtx.reply(
      '❌ No extensions exist. Create one first in Extensions & SIP.',
      { reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:dialer') }
    );
    return;
  }

  let extList = '*Select Target Extensions:*\n\n';
  extList += 'These extensions will ring when someone presses 1.\n\n';
  extensions.forEach((ext, i) => {
    extList += `${i + 1}. ${ext.number} - ${ext.name}\n`;
  });
  extList += `\n_Reply with numbers separated by comma (e.g., 1,2,3) or "all"_`;

  await menuCtx.reply(extList, { parse_mode: 'Markdown' });

  const extCtx = await conversation.wait();
  const extInput = extCtx.message?.text?.trim()?.toLowerCase();

  let targetExtensions: string[] = [];

  if (extInput === 'all') {
    targetExtensions = extensions.map(e => e.number);
  } else if (extInput) {
    const indices = extInput.split(',').map(s => parseInt(s.trim(), 10));
    for (const idx of indices) {
      if (idx >= 1 && idx <= extensions.length) {
        targetExtensions.push(extensions[idx - 1].number);
      }
    }
  }

  if (targetExtensions.length === 0) {
    await extCtx.reply('❌ No valid extensions selected. Operation cancelled.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:dialer'),
    });
    return;
  }

  // Step 4: Set calls per minute
  await extCtx.reply(
    '*Calls Per Minute:*\n\n' +
    'How many calls should be made per minute?\n' +
    '_Reply with a number 1-10 (default: 2)_',
    { parse_mode: 'Markdown' }
  );

  const rateCtx = await conversation.wait();
  let callsPerMinute = parseInt(rateCtx.message?.text?.trim() || '2', 10);
  if (isNaN(callsPerMinute) || callsPerMinute < 1) callsPerMinute = 2;
  if (callsPerMinute > 10) callsPerMinute = 10;

  // Step 5: Set max concurrent
  await rateCtx.reply(
    '*Max Concurrent Calls:*\n\n' +
    'Maximum simultaneous outbound calls?\n' +
    '_Reply with a number 1-10 (default: 3)_',
    { parse_mode: 'Markdown' }
  );

  const concurrentCtx = await conversation.wait();
  let maxConcurrent = parseInt(concurrentCtx.message?.text?.trim() || '3', 10);
  if (isNaN(maxConcurrent) || maxConcurrent < 1) maxConcurrent = 3;
  if (maxConcurrent > 10) maxConcurrent = 10;

  // Create the campaign
  const campaign = await services.dialerCampaignRepo.create({
    name,
    description: null,
    status: 'paused',
    handlerType: 'ivr',
    ivrMenuId: selectedMenu.id,
    aiAgentId: null,
    ringGroupId: null,
    targetExtensions: targetExtensions.join(','),
    trunkId: null,
    callerId: null,
    holdMusicPromptId: null,
    transferTrunkId: null,
    transferDestination: null,
    transferMode: 'internal',
    callsPerMinute,
    maxConcurrent,
    retryAttempts: 1,
    retryDelayMinutes: 30,
    amdEnabled: true,
  });

  await concurrentCtx.reply(
    `✅ *Campaign Created!*\n\n` +
    `📛 Name: ${campaign.name}\n` +
    `📞 IVR Menu: ${selectedMenu.name}\n` +
    `🔌 Target Extensions: ${targetExtensions.join(', ')}\n` +
    `📈 Rate: ${callsPerMinute} calls/min\n` +
    `🔀 Max Concurrent: ${maxConcurrent}\n\n` +
    `_Now upload a contact list to start dialing!_`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📤 Upload Contacts', `dialer:upload:${campaign.id}`).row()
        .text('⚙️ View Campaign', `dialer:view:${campaign.id}`).row()
        .text('⬅️ Back to Campaigns', 'menu:dialer'),
    }
  );
}

/**
 * Register all conversations with the bot
 */
export function registerConversations(bot: Bot<MyContext>): void {
  bot.use(createConversation(createIVRMenuConversation as any, 'createIVRMenu'));
  bot.use(createConversation(createExtensionConversation as any, 'createExtension'));
  bot.use(createConversation(createRoutingConversation as any, 'createRouting'));
  bot.use(createConversation(generateTTSConversation as any, 'generateTTS'));
  bot.use(createConversation(setApiKeyConversation as any, 'setApiKey'));
  bot.use(createConversation(createTrunkConversation as any, 'createTrunk'));
  bot.use(createConversation(testCallConversation as any, 'testCall'));
  bot.use(createConversation(testIVRCallConversation as any, 'testIVRCall'));
  bot.use(createConversation(createDialerCampaignConversation as any, 'createDialerCampaign'));
}
