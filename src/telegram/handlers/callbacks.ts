import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { MyContext, handleUploadName } from '../bot';
import * as kb from '../keyboards';
import { telegramLogger } from '../../utils/logger';
import * as fs from 'fs';

/**
 * Mask sensitive credential (show first 2 chars + asterisks)
 */
function maskCredential(value: string): string {
  if (!value || value.length <= 2) return '****';
  return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 2, 6));
}

/**
 * Mask host (show first part before dot + masked rest)
 */
function maskHost(host: string): string {
  if (!host) return '****';
  const parts = host.split('.');
  if (parts.length <= 1) return '****.' + host.split('.').pop();
  return parts[0] + '.' + '*'.repeat(4) + '.' + parts[parts.length - 1];
}

/**
 * Setup all callback query handlers
 */
export function setupCallbackHandlers(bot: Bot<MyContext>): void {
  // =====================
  // Main Menu Navigation
  // =====================

  bot.callbackQuery('menu:main', async (ctx) => {
    await ctx.editMessageText('🎉 *BotPBX Admin Panel*\n\nSelect an option:', {
      parse_mode: 'Markdown',
      reply_markup: kb.mainMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:ivr', async (ctx) => {
    const menus = await ctx.services.ivrMenuRepo.findAll();
    await ctx.editMessageText('📞 *IVR Menus:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.ivrMenusKeyboard(menus),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:extensions', async (ctx) => {
    const extensions = await ctx.services.extensionRepo.findAll();
    await ctx.editMessageText('🔌 *Extensions & SIP:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.extensionsKeyboard(extensions),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:routing', async (ctx) => {
    const rules = await ctx.services.routingRepo.findAll();
    await ctx.editMessageText('🔀 *Routing Rules:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.routingKeyboard(rules),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:media', async (ctx) => {
    await ctx.editMessageText('🎵 *Media / Audio:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.mediaMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:campaign', async (ctx) => {
    const isActive = await ctx.services.settingsRepo.isCampaignActive();
    const statusEmoji = isActive ? '🟢' : '🔴';
    const status = isActive ? 'ACTIVE - Calls are being processed' : 'STOPPED - Calls will hear closed message';
    await ctx.editMessageText(`🚀 *Campaign Status:*\n\n${statusEmoji} ${status}`, {
      parse_mode: 'Markdown',
      reply_markup: kb.campaignControlKeyboard(isActive),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:stats', async (ctx) => {
    await ctx.editMessageText('📈 *Statistics & Logs:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.statsMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:settings', async (ctx) => {
    const hasApiKey = ctx.services.ttsService.isElevenLabsConfigured();
    const ttsProvider = await ctx.services.settingsRepo.getTTSProvider();
    await ctx.editMessageText('⚙️ Settings:', {
      reply_markup: kb.settingsMenuKeyboard(hasApiKey, ttsProvider),
    });
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Dashboard
  // =====================

  bot.callbackQuery('menu:dashboard', async (ctx) => {
    const { settingsRepo, ivrController, ivrMenuRepo, extensionRepo, callLogRepo, amiClient, ttsService } = ctx.services;

    const campaignActive = await settingsRepo.isCampaignActive();
    const activeCalls = ivrController.getActiveCallsCount();
    const menuCount = await ivrMenuRepo.count();
    const extensionCount = await extensionRepo.count();
    const todayStats = await callLogRepo.getTodayStats();
    const amiConnected = amiClient.isConnected();
    const ttsAvailable = ttsService.isAvailable();

    // Get additional info if AMI is connected
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

    await ctx.editMessageText(
      `*📊 System Status Dashboard*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*🔧 Core Services:*\n` +
      `${statusEmoji(amiConnected)} AMI Connection\n` +
      `${statusEmoji(true)} AGI Server (port 4573)\n` +
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
        reply_markup: kb.dashboardKeyboard(),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Quick Actions
  // =====================

  bot.callbackQuery('menu:quick', async (ctx) => {
    await ctx.editMessageText('⚡ Quick Actions:', {
      reply_markup: kb.quickActionsKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('quick:reload:core', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    try {
      await ctx.services.amiClient.reload();
      await ctx.answerCallbackQuery('✅ Asterisk reloaded');
      await ctx.reply('✅ Asterisk core reload complete!');
    } catch (e) {
      await ctx.answerCallbackQuery('❌ Reload failed');
      await ctx.reply(`❌ Reload failed: ${(e as Error).message}`);
    }
  });

  bot.callbackQuery('quick:reload:pjsip', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    try {
      await ctx.services.amiClient.reload('res_pjsip.so');
      await ctx.answerCallbackQuery('✅ PJSIP reloaded');
      await ctx.reply('✅ PJSIP module reload complete!');
    } catch (e) {
      await ctx.answerCallbackQuery('❌ Reload failed');
      await ctx.reply(`❌ PJSIP reload failed: ${(e as Error).message}`);
    }
  });

  bot.callbackQuery('quick:logs', async (ctx) => {
    const recentCalls = await ctx.services.callLogRepo.findRecent(5);

    const logText = recentCalls.length > 0
      ? recentCalls.map((c: any) => {
        const time = new Date(c.timestamp * 1000).toLocaleTimeString();
        return `${time}: ${c.callerId || 'Unknown'} → ${c.disposition}`;
      }).join('\n')
      : 'No recent calls';

    await ctx.editMessageText(
      `*📋 Recent Call Logs:*\n\n\`\`\`\n${logText}\n\`\`\``,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.quickActionsKeyboard(),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('quick:channels', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    try {
      const info = await ctx.services.amiClient.getChannelCount();
      await ctx.editMessageText(
        `*📞 Active Channels: ${info.count}*\n\n` +
        (info.count > 0 ? `\`\`\`\n${info.channels.join('\n')}\n\`\`\`` : '✨ No active calls'),
        {
          parse_mode: 'Markdown',
          reply_markup: kb.quickActionsKeyboard(),
        }
      );
    } catch {
      await ctx.answerCallbackQuery('❌ Failed to query channels');
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('quick:genpjsip', async (ctx) => {
    try {
      await ctx.services.asteriskConfigService.writePJSIPConfig();
      await ctx.answerCallbackQuery('✅ Config generated');
      await ctx.reply('✅ PJSIP config regenerated!\n\nUse "📱 Reload PJSIP" to apply changes.');
    } catch (e) {
      await ctx.answerCallbackQuery('❌ Generation failed');
      await ctx.reply(`❌ Config generation failed: ${(e as Error).message}`);
    }
  });

  // =====================
  // Diagnostics
  // =====================

  bot.callbackQuery('menu:diagnostics', async (ctx) => {
    await ctx.editMessageText('🔍 Asterisk Diagnostics:', {
      reply_markup: kb.diagnosticsMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('diag:all', async (ctx) => {
    await ctx.answerCallbackQuery('🔍 Running diagnostics...');

    const { amiClient } = ctx.services;
    const amiConnected = amiClient.isConnected();

    let asteriskPing = { responsive: false, responseTime: -1 };
    let channelInfo = { count: 0, channels: [] as string[] };
    let endpoints: Array<{ endpoint: string; state: string }> = [];
    let version = 'Unknown';

    if (amiConnected) {
      try {
        asteriskPing = await amiClient.pingCLI();
        channelInfo = await amiClient.getChannelCount();
        endpoints = await amiClient.getPJSIPEndpoints();
        version = await amiClient.getVersion();
      } catch {
        // Handle errors silently
      }
    }

    const report =
      `*🔍 Asterisk Diagnostics Report*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Connection Status:*\n` +
      `${amiConnected ? '✅' : '❌'} AMI Connection: ${amiConnected ? 'Connected' : 'Disconnected'}\n` +
      `${asteriskPing.responsive ? '✅' : '❌'} Asterisk CLI: ${asteriskPing.responsive ? `Responsive (${asteriskPing.responseTime}ms)` : 'Not responding'}\n` +
      `✅ AGI Server: Running (port 4573)\n\n` +
      `*System Info:*\n` +
      `🖥️ ${version}\n` +
      `📞 Active Channels: ${channelInfo.count}\n` +
      `📱 PJSIP Endpoints: ${endpoints.length}\n\n` +
      `*Endpoint Details:*\n` +
      (endpoints.length > 0
        ? endpoints.map(e => `  ${e.endpoint}: ${e.state}`).join('\n')
        : '  No endpoints registered');

    await ctx.editMessageText(report, {
      parse_mode: 'Markdown',
      reply_markup: kb.diagnosticsMenuKeyboard(),
    });
  });

  bot.callbackQuery('diag:ami', async (ctx) => {
    const isConnected = ctx.services.amiClient.isConnected();
    const status = isConnected ? '✅ AMI: Connected' : '❌ AMI: Disconnected';
    await ctx.answerCallbackQuery(status);
  });

  bot.callbackQuery('diag:agi', async (ctx) => {
    // AGI server is always running if the app is running
    await ctx.answerCallbackQuery('✅ AGI Server: Running on port 4573');
  });

  bot.callbackQuery('diag:ping', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    const ping = await ctx.services.amiClient.pingCLI();
    if (ping.responsive) {
      await ctx.answerCallbackQuery(`✅ Asterisk CLI: ${ping.responseTime}ms`);
    } else {
      await ctx.answerCallbackQuery('❌ Asterisk CLI: Not responding');
    }
  });

  bot.callbackQuery('diag:pjsip', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    try {
      const endpoints = await ctx.services.amiClient.getPJSIPEndpoints();
      const text = endpoints.length > 0
        ? endpoints.map((e: any) => `📱 ${e.endpoint}: ${e.state}`).join('\n')
        : '❌ No endpoints registered';

      await ctx.editMessageText(
        `*📱 PJSIP Endpoints:*\n\n${text}`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.diagnosticsMenuKeyboard(),
        }
      );
    } catch {
      await ctx.answerCallbackQuery('❌ Failed to query PJSIP');
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('diag:channels', async (ctx) => {
    if (!ctx.services.amiClient.isConnected()) {
      await ctx.answerCallbackQuery('❌ AMI not connected');
      return;
    }

    try {
      const info = await ctx.services.amiClient.getChannelCount();
      await ctx.editMessageText(
        `*📞 Active Channels: ${info.count}*\n\n` +
        (info.count > 0 ? `\`\`\`\n${info.channels.join('\n')}\n\`\`\`` : '✨ No active calls'),
        {
          parse_mode: 'Markdown',
          reply_markup: kb.diagnosticsMenuKeyboard(),
        }
      );
    } catch {
      await ctx.answerCallbackQuery('❌ Failed to query channels');
    }
    await ctx.answerCallbackQuery();
  });

  // =====================
  // SIP Trunk Handlers
  // =====================

  bot.callbackQuery('menu:trunks', async (ctx) => {
    const trunks = await ctx.services.trunkRepo.findAll();
    await ctx.editMessageText('🌐 *SIP Trunks:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.trunksKeyboard(trunks),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('trunk:create', async (ctx) => {
    try {
      telegramLogger.info('Starting createTrunk conversation');
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('createTrunk');
      telegramLogger.info('Entered createTrunk conversation');
    } catch (error) {
      telegramLogger.error('Error starting trunk conversation:', error);
      await ctx.reply(`Error: ${(error as Error).message}`);
    }
  });

  bot.callbackQuery(/^trunk:view:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    const trunk = await ctx.services.trunkRepo.findById(trunkId);

    if (!trunk) {
      await ctx.answerCallbackQuery('Trunk not found');
      return;
    }

    const status = trunk.enabled ? '✅ Enabled' : '❌ Disabled';
    const registration = trunk.register ? '📝 Registration: ON' : '📝 Registration: OFF';

    await ctx.editMessageText(
      `🌐 *${trunk.name}*\n\n` +
      `🖥️ Host: \`${maskHost(trunk.host)}:${trunk.port}\`\n` +
      `👤 Username: \`${maskCredential(trunk.username)}\`\n` +
      `🔑 Password: \`********\`\n\n` +
      `📋 Context: ${trunk.context}\n` +
      `🎵 Codecs: ${trunk.codecs}\n` +
      `${registration}\n\n` +
      `Status: ${status}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.trunkDetailKeyboard(trunkId, trunk.enabled),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trunk:toggle:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    const trunk = await ctx.services.trunkRepo.findById(trunkId);

    if (trunk) {
      await ctx.services.trunkRepo.setEnabled(trunkId, !trunk.enabled);
      const newStatus = !trunk.enabled ? 'enabled' : 'disabled';
      await ctx.answerCallbackQuery(`✅ Trunk ${newStatus}`);

      // Refresh view
      const updatedTrunk = await ctx.services.trunkRepo.findById(trunkId);
      if (updatedTrunk) {
        const status = updatedTrunk.enabled ? '✅ Enabled' : '❌ Disabled';
        const registration = updatedTrunk.register ? '📝 Registration: ON' : '📝 Registration: OFF';

        await ctx.editMessageText(
          `🌐 *${updatedTrunk.name}*\n\n` +
          `🖥️ Host: \`${maskHost(updatedTrunk.host)}:${updatedTrunk.port}\`\n` +
          `👤 Username: \`${maskCredential(updatedTrunk.username)}\`\n` +
          `🔑 Password: \`********\`\n\n` +
          `📋 Context: ${updatedTrunk.context}\n` +
          `🎵 Codecs: ${updatedTrunk.codecs}\n` +
          `${registration}\n\n` +
          `Status: ${status}`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.trunkDetailKeyboard(trunkId, updatedTrunk.enabled),
          }
        );
      }
    }
  });

  bot.callbackQuery(/^trunk:delete:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    await ctx.editMessageText('🗑️ Are you sure you want to delete this SIP trunk?', {
      reply_markup: kb.confirmKeyboard(`trunk:delete:${trunkId}`),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trunk:edit:host:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    ctx.session.awaitingInput = `trunk:host:${trunkId}`;
    await ctx.editMessageText('Enter new SIP host (e.g., sip.provider.com):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trunk:edit:creds:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    ctx.session.awaitingInput = `trunk:username:${trunkId}`;
    await ctx.editMessageText('Enter new SIP username:');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trunk:edit:advanced:(.+)$/, async (ctx) => {
    const trunkId = ctx.match[1];
    await ctx.editMessageText('🔧 *Advanced Trunk Settings:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.trunkAdvancedKeyboard(trunkId),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('trunk:generate', async (ctx) => {
    try {
      await ctx.services.asteriskConfigService.writeTrunkConfig();
      await ctx.answerCallbackQuery('✅ Trunk config generated');
      await ctx.reply('✅ SIP trunk configuration generated!\n\nUse ⚡ Quick Actions → 📱 Reload PJSIP to apply changes.');
    } catch (e) {
      await ctx.answerCallbackQuery('❌ Generation failed');
      await ctx.reply(`❌ Failed to generate config: ${(e as Error).message}`);
    }
  });

  bot.callbackQuery('trunk:testcall', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('testCall');
  });

  // =====================
  // IVR Menu Handlers
  // =====================

  bot.callbackQuery('ivr:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('createIVRMenu');
  });

  bot.callbackQuery(/^ivr:view:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const menu = await ctx.services.ivrMenuRepo.findByIdWithOptions(menuId);

    if (!menu) {
      await ctx.answerCallbackQuery('Menu not found');
      return;
    }

    const optionsList = menu.options.length > 0
      ? menu.options.map((o: any) => `  ${o.keyPress}: ${o.actionType} -> ${o.destination || 'N/A'}`).join('\n')
      : '  (No options configured)';

    await ctx.editMessageText(
      `*${menu.name}*\n\n` +
      `Timeout: ${menu.timeoutSeconds}s\n` +
      `Max Retries: ${menu.maxRetries}\n\n` +
      `Options:\n${optionsList}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.ivrMenuDetailKeyboard(menuId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ivr:options:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const options = await ctx.services.ivrMenuRepo.findOptionsByMenuId(menuId);

    await ctx.editMessageText('DTMF Options:', {
      reply_markup: kb.ivrOptionsKeyboard(menuId, options),
    });
    await ctx.answerCallbackQuery();
  });

  // Test IVR Call - calls user's phone and plays the IVR
  bot.callbackQuery(/^ivr:testcall:(.+)$/, async (ctx) => {
    telegramLogger.debug('Test IVR callback triggered');
    await ctx.answerCallbackQuery();
    try {
      await ctx.conversation.enter('testIVRCall');
      telegramLogger.debug('Conversation entered');
    } catch (err) {
      telegramLogger.error('Error entering conversation:', err);
    }
  });

  // IVR Settings menu
  bot.callbackQuery(/^ivr:settings:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const menu = await ctx.services.ivrMenuRepo.findById(menuId);

    if (!menu) {
      await ctx.answerCallbackQuery('Menu not found');
      return;
    }

    await ctx.editMessageText(
      `*⚙️ IVR Settings*\n\n` +
      `⏱️ Timeout: ${menu.timeoutSeconds} seconds\n` +
      `🔄 Max Retries: ${menu.maxRetries}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.ivrSettingsKeyboard(menuId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // IVR setting: timeout
  bot.callbackQuery(/^ivr:setting:timeout:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    ctx.session.awaitingInput = `ivr:timeout:${menuId}`;
    await ctx.editMessageText('Enter timeout in seconds (5-60):');
    await ctx.answerCallbackQuery();
  });

  // IVR setting: max retries
  bot.callbackQuery(/^ivr:setting:retries:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    ctx.session.awaitingInput = `ivr:retries:${menuId}`;
    await ctx.editMessageText('Enter max retries (1-5):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ivr:opt:add:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const options = await ctx.services.ivrMenuRepo.findOptionsByMenuId(menuId);
    const usedKeys = options.map((o: any) => o.keyPress);

    await ctx.editMessageText('Select DTMF key:', {
      reply_markup: kb.dtmfKeysKeyboard(usedKeys, menuId),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ivr:key:(.+):(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const keyPress = ctx.match[2];

    ctx.session.tempData = { menuId, keyPress };

    await ctx.editMessageText(`Selected key: ${keyPress}\n\nChoose action type:`, {
      reply_markup: kb.actionTypeKeyboard(menuId, keyPress),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ivr:action:(.+):(.+):(.+)$/, async (ctx) => {
    const actionType = ctx.match[1];
    const menuId = ctx.match[2];
    const keyPress = ctx.match[3];

    if (actionType === 'hangup') {
      // No destination needed
      await ctx.services.ivrMenuRepo.addOption({
        menuId,
        keyPress,
        actionType: 'hangup',
        destination: null,
        preConnectPromptId: null,
        postCallPromptId: null,
        transferTrunkId: null,
        transferDestination: null,
        transferMode: 'internal',
      });

      await ctx.editMessageText(`Option ${keyPress} -> Hangup added!`);
      await ctx.answerCallbackQuery('Option added');
    } else if (actionType === 'trunk') {
      // Show trunk selection for 3CX transfer
      const trunks = await ctx.services.trunkRepo.findEnabled();

      if (trunks.length === 0) {
        await ctx.editMessageText(
          `❌ *No Trunks Available*\n\n` +
          `You need to create a SIP trunk first.\n` +
          `Go to Main Menu → SIP Trunks to add one.`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.ivrOptionsKeyboard(menuId, await ctx.services.ivrMenuRepo.findOptionsByMenuId(menuId)),
          }
        );
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.editMessageText(
        `☁️ *Select Transfer Trunk*\n\n` +
        `Key: ${keyPress}\n\n` +
        `Choose the SIP trunk for this transfer:`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.ivrTrunkSelectionKeyboard(menuId, keyPress, trunks),
        }
      );
      await ctx.answerCallbackQuery();
    } else {
      // Need destination input
      ctx.session.awaitingInput = `ivr:destination:${actionType}:${menuId}:${keyPress}`;
      await ctx.editMessageText(
        `Enter destination for ${actionType}:\n` +
        (actionType === 'transfer' ? '(Extension number)' : '') +
        (actionType === 'external' ? '(Phone number)' : '') +
        (actionType === 'submenu' ? '(Menu ID)' : '') +
        (actionType === 'voicemail' ? '(Mailbox number)' : '') +
        (actionType === 'queue' ? '(Queue name)' : '')
      );
      await ctx.answerCallbackQuery();
    }
  });

  // Handle trunk selection for IVR option
  bot.callbackQuery(/^ivr:settrunk:(.+):(.+):(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    const keyPress = ctx.match[2];
    const trunkId = ctx.match[3];

    // Store in session and prompt for ring group number
    ctx.session.tempData = { menuId, keyPress, trunkId };
    ctx.session.awaitingInput = 'ivr_ringgroup';

    const trunk = await ctx.services.trunkRepo.findById(trunkId);

    await ctx.editMessageText(
      `📞 *Ring Group Number*\n\n` +
      `Key: ${keyPress}\n` +
      `Trunk: ${trunk?.name || 'Unknown'}\n\n` +
      `Enter the ring group or extension number to dial on 3CX:\n` +
      `(e.g., 600, 601, 1000)`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ivr:prompts:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    await ctx.editMessageText('Configure IVR Prompts:', {
      reply_markup: kb.ivrPromptsKeyboard(menuId),
    });
    await ctx.answerCallbackQuery();
  });

  // Show prompt selection for welcome/invalid/timeout
  bot.callbackQuery(/^ivr:prompt:(welcome|invalid|timeout):(.+)$/, async (ctx) => {
    const promptType = ctx.match[1];
    const menuId = ctx.match[2];
    const prompts = await ctx.services.promptRepo.findAll();

    // Store in session to avoid long callback data
    ctx.session.tempData = { menuId, promptType };

    const labels: Record<string, string> = {
      welcome: '👋 Welcome Prompt',
      invalid: '⚠️ Invalid Input Prompt',
      timeout: '⏱️ Timeout Prompt',
    };

    // Build compact keyboard (short callback data)
    const keyboard = new InlineKeyboard();
    keyboard.text('⊘ None', 'ivrprompt:none').row();

    for (const prompt of prompts.slice(0, 8)) {
      const icon = prompt.type === 'tts' ? '🗣️' : '📤';
      // Use short prefix + just first 8 chars of ID
      keyboard.text(`${icon} ${prompt.name.substring(0, 20)}`, `ivrprompt:${prompt.id.substring(0, 8)}`).row();
    }
    keyboard.text('❌ Cancel', `ivr:prompts:${menuId}`);

    await ctx.editMessageText(
      `Select ${labels[promptType]}:\n\n_Choose an audio prompt to play_`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Handle prompt selection for IVR (uses session data)
  bot.callbackQuery(/^ivrprompt:(.+)$/, async (ctx) => {
    const shortId = ctx.match[1];
    const tempData = ctx.session.tempData as { menuId?: string; promptType?: string } | undefined;
    const menuId = tempData?.menuId;
    const promptType = tempData?.promptType;

    if (!menuId || !promptType) {
      await ctx.answerCallbackQuery('Session expired. Please try again.');
      return;
    }

    // Find full prompt ID if not "none"
    let promptId: string | null = null;
    let promptName = 'None';

    if (shortId !== 'none') {
      const prompts = await ctx.services.promptRepo.findAll();
      const prompt = prompts.find((p: any) => p.id.startsWith(shortId));
      if (prompt) {
        promptId = prompt.id;
        promptName = prompt.name;
      }
    }

    const fieldMap: Record<string, string> = {
      welcome: 'welcomePromptId',
      invalid: 'invalidPromptId',
      timeout: 'timeoutPromptId',
    };

    const updates: Record<string, string | null> = {};
    updates[fieldMap[promptType]] = promptId;

    await ctx.services.ivrMenuRepo.update(menuId, updates);
    ctx.session.tempData = undefined;

    await ctx.answerCallbackQuery(`✅ ${promptType} prompt set to: ${promptName}`);

    // Go back to prompts menu
    await ctx.editMessageText('Configure IVR Prompts:', {
      reply_markup: kb.ivrPromptsKeyboard(menuId),
    });
  });

  bot.callbackQuery(/^ivr:delete:(.+)$/, async (ctx) => {
    const menuId = ctx.match[1];
    await ctx.editMessageText('Are you sure you want to delete this IVR menu?', {
      reply_markup: kb.confirmKeyboard(`ivr:delete:${menuId}`),
    });
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Extension Handlers
  // =====================

  bot.callbackQuery('ext:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('createExtension');
  });

  bot.callbackQuery(/^ext:view:(.+)$/, async (ctx) => {
    const extNumber = ctx.match[1];
    const ext = await ctx.services.extensionRepo.findByNumber(extNumber);

    if (!ext) {
      await ctx.answerCallbackQuery('Extension not found');
      return;
    }

    const statusEmoji = ext.enabled ? '✅' : '❌';
    const statusText = ext.enabled ? 'Enabled' : 'Disabled';

    // Get server IP
    let serverIp = 'YOUR_SERVER_IP';
    try {
      const { execSync } = require('child_process');
      serverIp = execSync("hostname -I | awk '{print $1}'").toString().trim() || 'YOUR_SERVER_IP';
    } catch { }

    await ctx.editMessageText(
      `🔌 *Extension ${ext.number}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📛 *Name:* ${ext.name}\n` +
      `${statusEmoji} *Status:* ${statusText}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*📱 SIP Login Details:*\n` +
      `┌─────────────────────\n` +
      `│ 🖥️ Server: \`${serverIp}\`\n` +
      `│ 👤 Username: \`${ext.number}\`\n` +
      `│ 🔑 Password: \`${ext.password}\`\n` +
      `│ 🔌 Port: \`5060\`\n` +
      `└─────────────────────\n\n` +
      `_Tap on credentials to copy_`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.extensionDetailKeyboard(ext.number, ext.enabled),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ext:toggle:(.+)$/, async (ctx) => {
    const extNumber = ctx.match[1];
    const ext = await ctx.services.extensionRepo.findByNumber(extNumber);

    if (ext) {
      await ctx.services.extensionRepo.setEnabled(extNumber, !ext.enabled);
      await ctx.services.asteriskConfigService.writePJSIPConfig();

      try {
        await ctx.services.amiClient.reload('res_pjsip.so');
      } catch {
        // Ignore reload errors
      }

      const newStatus = !ext.enabled ? 'enabled' : 'disabled';
      await ctx.answerCallbackQuery(`Extension ${newStatus}`);

      // Refresh view
      const updatedExt = await ctx.services.extensionRepo.findByNumber(extNumber);
      if (updatedExt) {
        await ctx.editMessageText(
          `*Extension ${updatedExt.number}*\n\n` +
          `Name: ${updatedExt.name}\n` +
          `Status: ${updatedExt.enabled ? 'Enabled' : 'Disabled'}\n` +
          `Password: \`${updatedExt.password}\``,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.extensionDetailKeyboard(extNumber, updatedExt.enabled),
          }
        );
      }
    }
  });

  bot.callbackQuery(/^ext:delete:(.+)$/, async (ctx) => {
    const extNumber = ctx.match[1];
    await ctx.editMessageText(`Are you sure you want to delete extension ${extNumber}?`, {
      reply_markup: kb.confirmKeyboard(`ext:delete:${extNumber}`),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('ext:generate', async (ctx) => {
    await ctx.services.asteriskConfigService.writePJSIPConfig();
    await ctx.answerCallbackQuery('PJSIP config generated');
    await ctx.reply('PJSIP extension config has been regenerated.');
  });

  // =====================
  // Routing Handlers
  // =====================

  bot.callbackQuery('route:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('createRouting');
  });

  bot.callbackQuery(/^route:view:(.+)$/, async (ctx) => {
    const ruleId = ctx.match[1];
    const rule = await ctx.services.routingRepo.findById(ruleId);

    if (!rule) {
      await ctx.answerCallbackQuery('Rule not found');
      return;
    }

    const status = rule.enabled ? 'Enabled' : 'Disabled';
    await ctx.editMessageText(
      `*Routing Rule*\n\n` +
      `DID: ${rule.did}\n` +
      `Target: ${rule.targetType} -> ${rule.targetId}\n` +
      `Status: ${status}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.routingDetailKeyboard(ruleId, rule.enabled),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^route:toggle:(.+)$/, async (ctx) => {
    const ruleId = ctx.match[1];
    const rule = await ctx.services.routingRepo.findById(ruleId);

    if (rule) {
      await ctx.services.routingRepo.setEnabled(ruleId, !rule.enabled);
      const newStatus = !rule.enabled ? 'enabled' : 'disabled';
      await ctx.answerCallbackQuery(`Rule ${newStatus}`);

      // Refresh view
      const updatedRule = await ctx.services.routingRepo.findById(ruleId);
      if (updatedRule) {
        await ctx.editMessageText(
          `*Routing Rule*\n\n` +
          `DID: ${updatedRule.did}\n` +
          `Target: ${updatedRule.targetType} -> ${updatedRule.targetId}\n` +
          `Status: ${updatedRule.enabled ? 'Enabled' : 'Disabled'}`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.routingDetailKeyboard(ruleId, updatedRule.enabled),
          }
        );
      }
    }
  });

  bot.callbackQuery(/^route:delete:(.+)$/, async (ctx) => {
    const ruleId = ctx.match[1];
    await ctx.editMessageText('Are you sure you want to delete this routing rule?', {
      reply_markup: kb.confirmKeyboard(`route:delete:${ruleId}`),
    });
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Media Handlers
  // =====================

  bot.callbackQuery('media:tts', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('generateTTS');
  });

  bot.callbackQuery('media:upload', async (ctx) => {
    ctx.session.awaitingInput = 'upload_file';
    await ctx.editMessageText('Send me an audio file (MP3, WAV, OGG) or voice message.');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^media:list(?::(\d+))?$/, async (ctx) => {
    const page = parseInt(ctx.match[1] || '0', 10);
    const prompts = await ctx.services.promptRepo.findAll();

    await ctx.editMessageText('Audio Prompts:', {
      reply_markup: kb.promptsListKeyboard(prompts, page),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^media:view:(.+)$/, async (ctx) => {
    const promptId = ctx.match[1];
    const prompt = await ctx.services.promptRepo.findById(promptId);

    if (!prompt) {
      await ctx.answerCallbackQuery('Prompt not found');
      return;
    }

    const typeLabel = prompt.type === 'tts' ? 'TTS Generated' : 'Uploaded';
    await ctx.editMessageText(
      `*${prompt.name}*\n\n` +
      `Type: ${typeLabel}\n` +
      `File: ${prompt.filePath || 'N/A'}\n` +
      (prompt.text ? `Text: ${prompt.text.substring(0, 100)}...` : ''),
      {
        parse_mode: 'Markdown',
        reply_markup: kb.promptDetailKeyboard(promptId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Preview audio prompt - send the audio file to the chat
  bot.callbackQuery(/^media:preview:(.+)$/, async (ctx) => {
    const promptId = ctx.match[1];
    const prompt = await ctx.services.promptRepo.findById(promptId);

    if (!prompt) {
      await ctx.answerCallbackQuery('❌ Prompt not found');
      return;
    }

    if (!prompt.filePath || !fs.existsSync(prompt.filePath)) {
      await ctx.answerCallbackQuery('❌ Audio file not found');
      return;
    }

    try {
      await ctx.answerCallbackQuery('🔊 Sending audio...');
      await ctx.replyWithAudio(new InputFile(prompt.filePath), {
        title: prompt.name,
        performer: prompt.type === 'tts' ? 'ElevenLabs TTS' : 'Uploaded',
      });
    } catch (error) {
      telegramLogger.error('Failed to send audio preview:', error);
      await ctx.reply('❌ Failed to send audio file');
    }
  });

  bot.callbackQuery(/^media:delete:(.+)$/, async (ctx) => {
    const promptId = ctx.match[1];
    await ctx.editMessageText('Are you sure you want to delete this prompt?', {
      reply_markup: kb.confirmKeyboard(`media:delete:${promptId}`),
    });
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Campaign Handlers
  // =====================

  bot.callbackQuery('campaign:start', async (ctx) => {
    await ctx.services.settingsRepo.setCampaignActive(true);
    await ctx.answerCallbackQuery('✅ Campaign started');
    await ctx.editMessageText('🚀 *Campaign Status:*\n\n🟢 ACTIVE - Calls are being processed', {
      parse_mode: 'Markdown',
      reply_markup: kb.campaignControlKeyboard(true),
    });
  });

  bot.callbackQuery('campaign:stop', async (ctx) => {
    await ctx.services.settingsRepo.setCampaignActive(false);
    await ctx.answerCallbackQuery('⏹️ Campaign stopped');
    await ctx.editMessageText('🚀 *Campaign Status:*\n\n🔴 STOPPED - Calls will hear closed message', {
      parse_mode: 'Markdown',
      reply_markup: kb.campaignControlKeyboard(false),
    });
  });

  bot.callbackQuery('campaign:status', async (ctx) => {
    const activeCalls = ctx.services.ivrController.getActiveCallsCount();
    await ctx.answerCallbackQuery(`Active calls: ${activeCalls}`);
  });

  // =====================
  // Stats Handlers
  // =====================

  bot.callbackQuery('stats:today', async (ctx) => {
    const stats = await ctx.services.callLogRepo.getTodayStats();

    await ctx.editMessageText(
      `*Today's Statistics*\n\n` +
      `Total Calls: ${stats.totalCalls}\n` +
      `Answered: ${stats.answeredCalls}\n` +
      `Abandoned: ${stats.abandonedCalls}\n` +
      `Avg Duration: ${stats.averageDuration}s\n\n` +
      `DTMF Distribution:\n` +
      Object.entries(stats.dtmfDistribution)
        .map(([key, count]) => `  ${key}: ${count}`)
        .join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: kb.statsMenuKeyboard(),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('stats:week', async (ctx) => {
    const dailyStats = await ctx.services.callLogRepo.getDailyStats(7);

    const statsText = dailyStats
      .map((d: any) => `${d.date}: ${d.totalCalls} calls (${d.answeredCalls} answered)`)
      .join('\n');

    await ctx.editMessageText(
      `*Last 7 Days*\n\n${statsText}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.statsMenuKeyboard(),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('stats:recent', async (ctx) => {
    const recentCalls = await ctx.services.callLogRepo.findRecent(10);

    const callsText = recentCalls
      .map((c: any) => {
        const time = new Date(c.timestamp * 1000).toLocaleTimeString();
        return `${time}: ${c.callerId || 'Unknown'} -> ${c.finalDestination || 'N/A'} (${c.disposition})`;
      })
      .join('\n');

    await ctx.editMessageText(
      `*Recent Calls*\n\n${callsText || 'No calls yet'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.statsMenuKeyboard(),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Dialer Campaign Handlers
  // =====================

  bot.callbackQuery('menu:dialer', async (ctx) => {
    const campaigns = await ctx.services.dialerCampaignRepo.findAll();
    await ctx.editMessageText('📢 *Dialer Campaigns:*', {
      parse_mode: 'Markdown',
      reply_markup: kb.dialerMenuKeyboard(campaigns),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dialer:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('createDialerCampaign');
  });

  bot.callbackQuery(/^dialer:view:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    const statusEmoji: Record<string, string> = {
      running: '▶️',
      paused: '⏸️',
      completed: '🏁',
    };

    const contactStats = await ctx.services.campaignContactRepo.countByStatus(campaignId);
    const isRunning = ctx.services.dialerService?.isRunning(campaignId) ?? false;
    const activeDialing = ctx.services.dialerService?.getActiveDialingCount(campaignId) ?? 0;

    await ctx.editMessageText(
      `📢 *${campaign.name}*\n\n` +
      `${statusEmoji[campaign.status] || '❓'} Status: ${campaign.status.toUpperCase()}\n` +
      `${isRunning ? `📞 Active Calls: ${activeDialing}` : ''}\n\n` +
      `*📊 Statistics:*\n` +
      `📋 Total Contacts: ${campaign.totalContacts}\n` +
      `📞 Dialed: ${campaign.dialedCount}\n` +
      `✅ Answered: ${campaign.answeredCount}\n` +
      `🔥 Press 1 (Leads): ${campaign.press1Count}\n` +
      `🤝 Connected: ${campaign.connectedCount}\n\n` +
      `*⚙️ Settings:*\n` +
      `📈 Rate: ${campaign.callsPerMinute} calls/min\n` +
      `🔀 Max Concurrent: ${campaign.maxConcurrent}\n` +
      `🔄 Retry Attempts: ${campaign.retryAttempts}\n` +
      `⏱️ Retry Delay: ${campaign.retryDelayMinutes} min\n\n` +
      `*📋 Contact Status:*\n` +
      `⏳ Pending: ${contactStats.pending}\n` +
      `📞 Dialing: ${contactStats.dialing}\n` +
      `✅ Answered: ${contactStats.answered}\n` +
      `🔥 Press 1: ${contactStats.press1}\n` +
      `🤝 Connected: ${contactStats.connected}\n` +
      `❌ Failed: ${contactStats.failed + contactStats.no_answer + contactStats.busy}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerCampaignDetailKeyboard(campaignId, campaign.status),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:start:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];

    if (!ctx.services.dialerService) {
      await ctx.answerCallbackQuery('❌ Dialer service not available');
      return;
    }

    const result = await ctx.services.dialerService.startCampaign(campaignId);

    if (result.success) {
      await ctx.answerCallbackQuery('▶️ Campaign started');
      // Refresh view
      const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
      if (campaign) {
        const contactStats = await ctx.services.campaignContactRepo.countByStatus(campaignId);
        const activeDialing = ctx.services.dialerService.getActiveDialingCount(campaignId);

        await ctx.editMessageText(
          `📢 *${campaign.name}*\n\n` +
          `▶️ Status: RUNNING\n` +
          `📞 Active Calls: ${activeDialing}\n\n` +
          `*📊 Statistics:*\n` +
          `📋 Total Contacts: ${campaign.totalContacts}\n` +
          `📞 Dialed: ${campaign.dialedCount}\n` +
          `✅ Answered: ${campaign.answeredCount}\n` +
          `🔥 Press 1 (Leads): ${campaign.press1Count}\n` +
          `🤝 Connected: ${campaign.connectedCount}\n\n` +
          `*📋 Contact Status:*\n` +
          `⏳ Pending: ${contactStats.pending}\n` +
          `📞 Dialing: ${contactStats.dialing}`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.dialerCampaignDetailKeyboard(campaignId, 'running'),
          }
        );
      }
    } else {
      await ctx.answerCallbackQuery(`❌ ${result.error}`);
    }
  });

  bot.callbackQuery(/^dialer:pause:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];

    if (!ctx.services.dialerService) {
      await ctx.answerCallbackQuery('❌ Dialer service not available');
      return;
    }

    const result = await ctx.services.dialerService.pauseCampaign(campaignId);

    if (result.success) {
      await ctx.answerCallbackQuery('⏸️ Campaign paused');
      // Refresh view
      const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
      if (campaign) {
        const contactStats = await ctx.services.campaignContactRepo.countByStatus(campaignId);

        await ctx.editMessageText(
          `📢 *${campaign.name}*\n\n` +
          `⏸️ Status: PAUSED\n\n` +
          `*📊 Statistics:*\n` +
          `📋 Total Contacts: ${campaign.totalContacts}\n` +
          `📞 Dialed: ${campaign.dialedCount}\n` +
          `✅ Answered: ${campaign.answeredCount}\n` +
          `🔥 Press 1 (Leads): ${campaign.press1Count}\n` +
          `🤝 Connected: ${campaign.connectedCount}\n\n` +
          `*📋 Contact Status:*\n` +
          `⏳ Pending: ${contactStats.pending}`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.dialerCampaignDetailKeyboard(campaignId, 'paused'),
          }
        );
      }
    } else {
      await ctx.answerCallbackQuery(`❌ ${result.error}`);
    }
  });

  bot.callbackQuery(/^dialer:stop:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    await ctx.editMessageText('⚠️ Are you sure you want to stop this campaign?\n\nThis will mark the campaign as completed.', {
      reply_markup: kb.confirmKeyboard(`dialer:stop:${campaignId}`),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:settings:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    const holdMusicPrompt = campaign.holdMusicPromptId
      ? await ctx.services.promptRepo.findById(campaign.holdMusicPromptId)
      : null;

    await ctx.editMessageText(
      `⚙️ *Campaign Settings*\n\n` +
      `📈 Calls per minute: ${campaign.callsPerMinute}\n` +
      `🔀 Max concurrent: ${campaign.maxConcurrent}\n` +
      `🎵 Hold music: ${holdMusicPrompt ? holdMusicPrompt.name : 'None'}\n` +
      `🔄 Retry attempts: ${campaign.retryAttempts}\n` +
      `⏱️ Retry delay: ${campaign.retryDelayMinutes} min`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:rate:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    await ctx.editMessageText(
      `📈 *Calls Per Minute*\n\nCurrent: ${campaign.callsPerMinute}\n\nSelect new rate:`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerRateKeyboard(campaignId, campaign.callsPerMinute),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:setrate:(.+):(\d+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const rate = parseInt(ctx.match[2], 10);

    await ctx.services.dialerCampaignRepo.update(campaignId, { callsPerMinute: rate });
    await ctx.answerCallbackQuery(`✅ Rate set to ${rate} calls/min`);

    // Go back to settings
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
    if (campaign) {
      await ctx.editMessageText(
        `⚙️ *Campaign Settings*\n\n` +
        `📈 Calls per minute: ${campaign.callsPerMinute}\n` +
        `🔀 Max concurrent: ${campaign.maxConcurrent}\n` +
        `🔄 Retry attempts: ${campaign.retryAttempts}\n` +
        `⏱️ Retry delay: ${campaign.retryDelayMinutes} min`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
        }
      );
    }
  });

  bot.callbackQuery(/^dialer:concurrent:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    await ctx.editMessageText(
      `🔀 *Max Concurrent Calls*\n\nCurrent: ${campaign.maxConcurrent}\n\nSelect new limit:`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerConcurrentKeyboard(campaignId, campaign.maxConcurrent),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:setconcurrent:(.+):(\d+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const concurrent = parseInt(ctx.match[2], 10);

    await ctx.services.dialerCampaignRepo.update(campaignId, { maxConcurrent: concurrent });
    await ctx.answerCallbackQuery(`✅ Max concurrent set to ${concurrent}`);

    // Go back to settings
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
    if (campaign) {
      await ctx.editMessageText(
        `⚙️ *Campaign Settings*\n\n` +
        `📈 Calls per minute: ${campaign.callsPerMinute}\n` +
        `🔀 Max concurrent: ${campaign.maxConcurrent}\n` +
        `🔄 Retry attempts: ${campaign.retryAttempts}\n` +
        `⏱️ Retry delay: ${campaign.retryDelayMinutes} min`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
        }
      );
    }
  });

  // Hold Music handlers
  bot.callbackQuery(/^dialer:set:holdmusic:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    // Get available prompts (audio files)
    const prompts = await ctx.services.promptRepo.findAll();
    const currentPrompt = campaign.holdMusicPromptId
      ? await ctx.services.promptRepo.findById(campaign.holdMusicPromptId)
      : null;

    await ctx.editMessageText(
      `🎵 *Hold Music*\n\n` +
      `Current: ${currentPrompt ? currentPrompt.name : 'None'}\n\n` +
      `Select audio to play while connecting to extensions:`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerHoldMusicKeyboard(campaignId, prompts, campaign.holdMusicPromptId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:setholdmusic:(.+):(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const promptId = ctx.match[2];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    if (promptId === 'none') {
      // Remove hold music
      await ctx.services.dialerCampaignRepo.update(campaignId, { holdMusicPromptId: null });

      // Clean up MOH config
      if (ctx.services.mohService) {
        await ctx.services.mohService.removeCampaignMoh(campaignId);
      }

      await ctx.answerCallbackQuery('✅ Hold music removed');
    } else {
      // Set hold music
      const prompt = await ctx.services.promptRepo.findById(promptId);
      if (!prompt || !prompt.filePath) {
        await ctx.answerCallbackQuery('❌ Audio file not found');
        return;
      }

      await ctx.services.dialerCampaignRepo.update(campaignId, { holdMusicPromptId: promptId });

      // Setup MOH config
      if (ctx.services.mohService) {
        await ctx.services.mohService.setupCampaignMoh(campaignId, prompt.filePath);
      }

      await ctx.answerCallbackQuery(`✅ Hold music set to: ${prompt.name}`);
    }

    // Go back to settings
    const updatedCampaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
    if (updatedCampaign) {
      const holdMusicPrompt = updatedCampaign.holdMusicPromptId
        ? await ctx.services.promptRepo.findById(updatedCampaign.holdMusicPromptId)
        : null;

      await ctx.editMessageText(
        `⚙️ *Campaign Settings*\n\n` +
        `📈 Calls per minute: ${updatedCampaign.callsPerMinute}\n` +
        `🔀 Max concurrent: ${updatedCampaign.maxConcurrent}\n` +
        `🎵 Hold music: ${holdMusicPrompt ? holdMusicPrompt.name : 'None'}\n` +
        `🔄 Retry attempts: ${updatedCampaign.retryAttempts}\n` +
        `⏱️ Retry delay: ${updatedCampaign.retryDelayMinutes} min`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
        }
      );
    }
  });

  bot.callbackQuery(/^dialer:uploadholdmusic:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];

    ctx.session.awaitingInput = 'dialer_upload_holdmusic';
    ctx.session.editingItemId = campaignId;

    await ctx.editMessageText(
      `🎵 *Upload Hold Music*\n\n` +
      `Send an audio file (MP3, WAV, OGG) to use as hold music.\n\n` +
      `This will play while the lead waits for an extension to answer.`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Transfer Mode handlers
  bot.callbackQuery(/^dialer:set:transfer:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    let currentConfig = '';
    if (campaign.transferMode === 'trunk' && campaign.transferTrunkId) {
      const trunk = await ctx.services.trunkRepo.findById(campaign.transferTrunkId);
      currentConfig = `☁️ Trunk: ${trunk?.name || 'Unknown'} → ${campaign.transferDestination || 'Not set'}`;
    } else {
      currentConfig = `📱 Internal: ${campaign.targetExtensions || 'Not configured'}`;
    }

    await ctx.editMessageText(
      `🎯 *Transfer Mode*\n\n` +
      `Current: ${currentConfig}\n\n` +
      `Select how press-1 leads should be transferred:`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerTransferModeKeyboard(campaignId, campaign.transferMode),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:settransfer:(.+):(internal|trunk)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const mode = ctx.match[2] as 'internal' | 'trunk';

    await ctx.services.dialerCampaignRepo.update(campaignId, { transferMode: mode });

    if (mode === 'trunk') {
      // Show trunk selection
      const trunks = await ctx.services.trunkRepo.findEnabled();
      const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

      if (trunks.length === 0) {
        await ctx.editMessageText(
          `❌ *No Trunks Available*\n\n` +
          `You need to create a SIP trunk first.\n` +
          `Go to Main Menu → SIP Trunks to add one.`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
          }
        );
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.editMessageText(
        `☁️ *Select Transfer Trunk*\n\nChoose the SIP trunk to use for transfers:`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerTrunkSelectionKeyboard(campaignId, trunks, campaign?.transferTrunkId || null),
        }
      );
    } else {
      // Redirect to existing extensions handler
      const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
      const extensions = await ctx.services.extensionRepo.findEnabled();
      const currentExtensions = (campaign?.targetExtensions || '').split(',').filter(Boolean);

      const keyboard = new InlineKeyboard();
      for (const ext of extensions.slice(0, 10)) {
        const isSelected = currentExtensions.includes(ext.number);
        const icon = isSelected ? '✅' : '⬜';
        keyboard.text(`${icon} ${ext.number} - ${ext.name}`, `dialer:toggleext:${campaignId}:${ext.number}`).row();
      }
      keyboard.text('💾 Save', `dialer:settings:${campaignId}`).row();
      keyboard.text('« Back', `dialer:settings:${campaignId}`);

      await ctx.editMessageText(
        `📱 *Internal Extensions*\n\n` +
        `Current: ${campaign?.targetExtensions || 'None'}\n\n` +
        `Select extensions to ring when lead presses 1:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:settrunk:(.+):(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const trunkId = ctx.match[2];

    await ctx.services.dialerCampaignRepo.update(campaignId, { transferTrunkId: trunkId });

    // Prompt for ring group number
    ctx.session.awaitingInput = 'dialer_ringgroup';
    ctx.session.editingItemId = campaignId;

    const trunk = await ctx.services.trunkRepo.findById(trunkId);

    await ctx.editMessageText(
      `📞 *Ring Group Number*\n\n` +
      `Trunk: ${trunk?.name || 'Unknown'}\n\n` +
      `Enter the 3CX ring group or extension number to dial:\n` +
      `(e.g., 600, 601, 1000)`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:contacts:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    const contactStats = await ctx.services.campaignContactRepo.countByStatus(campaignId);

    await ctx.editMessageText(
      `📋 *Contacts for ${campaign.name}*\n\n` +
      `Total: ${campaign.totalContacts}\n\n` +
      `⏳ Pending: ${contactStats.pending}\n` +
      `📞 Dialing: ${contactStats.dialing}\n` +
      `✅ Answered: ${contactStats.answered}\n` +
      `🔥 Press 1: ${contactStats.press1}\n` +
      `🤝 Connected: ${contactStats.connected}\n` +
      `📵 No Answer: ${contactStats.no_answer}\n` +
      `🔇 Busy: ${contactStats.busy}\n` +
      `❌ Failed: ${contactStats.failed}\n` +
      `🚫 DNC: ${contactStats.dnc}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerContactsKeyboard(campaignId),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:upload:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    ctx.session.tempData = { campaignId };
    ctx.session.awaitingInput = 'dialer_upload_contacts';
    await ctx.editMessageText(
      '📤 *Upload Contacts*\n\n' +
      'Send a CSV or TXT file with phone numbers.\n\n' +
      '*Supported formats:*\n' +
      '• One phone number per line\n' +
      '• CSV with header: phone,name\n' +
      '• CSV without header (first column = phone)\n\n' +
      '_Send your file now..._',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:ivr:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const menus = await ctx.services.ivrMenuRepo.findAll();

    ctx.session.tempData = { campaignId, settingType: 'ivr' };

    const keyboard = new InlineKeyboard();
    for (const menu of menus.slice(0, 10)) {
      keyboard.text(`📞 ${menu.name}`, `dialer:setivr:${campaignId}:${menu.id}`).row();
    }
    keyboard.text('« Back', `dialer:settings:${campaignId}`);

    await ctx.editMessageText('📞 *Select IVR Menu*\n\nChoose the IVR menu to play when calls are answered:', {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:setivr:(.+):(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const ivrMenuId = ctx.match[2];

    await ctx.services.dialerCampaignRepo.update(campaignId, { ivrMenuId });
    await ctx.answerCallbackQuery('✅ IVR menu updated');

    // Go back to settings
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
    if (campaign) {
      await ctx.editMessageText(
        `⚙️ *Campaign Settings*\n\n` +
        `📈 Calls per minute: ${campaign.callsPerMinute}\n` +
        `🔀 Max concurrent: ${campaign.maxConcurrent}\n` +
        `🔄 Retry attempts: ${campaign.retryAttempts}\n` +
        `⏱️ Retry delay: ${campaign.retryDelayMinutes} min`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
        }
      );
    }
  });

  bot.callbackQuery(/^dialer:extensions:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
    const extensions = await ctx.services.extensionRepo.findEnabled();

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    const currentExtensions = (campaign.targetExtensions || '').split(',').filter(Boolean);

    const keyboard = new InlineKeyboard();
    for (const ext of extensions.slice(0, 10)) {
      const isSelected = currentExtensions.includes(ext.number);
      const icon = isSelected ? '✅' : '⬜';
      keyboard.text(`${icon} ${ext.number} - ${ext.name}`, `dialer:toggleext:${campaignId}:${ext.number}`).row();
    }
    keyboard.text('💾 Save', `dialer:settings:${campaignId}`).row();
    keyboard.text('« Back', `dialer:settings:${campaignId}`);

    await ctx.editMessageText(
      `🔌 *Target Extensions*\n\n` +
      `Select extensions to ring when someone presses 1:\n\n` +
      `Current: ${currentExtensions.length > 0 ? currentExtensions.join(', ') : 'None'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:toggleext:(.+):(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const extNumber = ctx.match[2];
    const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);

    if (!campaign) {
      await ctx.answerCallbackQuery('Campaign not found');
      return;
    }

    const currentExtensions = (campaign.targetExtensions || '').split(',').filter(Boolean);
    const index = currentExtensions.indexOf(extNumber);

    if (index > -1) {
      currentExtensions.splice(index, 1);
    } else {
      currentExtensions.push(extNumber);
    }

    await ctx.services.dialerCampaignRepo.update(campaignId, { targetExtensions: currentExtensions.join(',') });

    // Refresh view
    const extensions = await ctx.services.extensionRepo.findEnabled();
    const keyboard = new InlineKeyboard();
    for (const ext of extensions.slice(0, 10)) {
      const isSelected = currentExtensions.includes(ext.number);
      const icon = isSelected ? '✅' : '⬜';
      keyboard.text(`${icon} ${ext.number} - ${ext.name}`, `dialer:toggleext:${campaignId}:${ext.number}`).row();
    }
    keyboard.text('💾 Save', `dialer:settings:${campaignId}`).row();
    keyboard.text('« Back', `dialer:settings:${campaignId}`);

    await ctx.editMessageText(
      `🔌 *Target Extensions*\n\n` +
      `Select extensions to ring when someone presses 1:\n\n` +
      `Current: ${currentExtensions.length > 0 ? currentExtensions.join(', ') : 'None'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dialer:delete:(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    await ctx.editMessageText('🗑️ Are you sure you want to delete this campaign?\n\nThis will also delete all contacts.', {
      reply_markup: kb.confirmKeyboard(`dialer:delete:${campaignId}`),
    });
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Settings Handlers
  // =====================

  bot.callbackQuery('settings:apikey', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('setApiKey');
  });

  // TTS Provider Selection
  bot.callbackQuery('settings:tts', async (ctx) => {
    const currentProvider = await ctx.services.settingsRepo.getTTSProvider();
    const piperHealth = await ctx.services.ttsService.checkPiperHealth();

    const providerLabels: Record<string, string> = {
      piper: '🖥️ Piper (Local)',
      elevenlabs: '☁️ ElevenLabs',
      openai: '🤖 OpenAI TTS',
      cartesia: '⚡ Cartesia',
      deepgram: '🎙️ Deepgram',
      playht: '🎵 PlayHT',
      google: '🌐 Google TTS',
    };

    await ctx.editMessageText(
      `🔊 *TTS Provider*\n\n` +
      `Current: ${providerLabels[currentProvider] || currentProvider}\n\n` +
      `*Piper Status:* ${piperHealth.ok ? '✅ Running' : '❌ ' + (piperHealth.error || 'Not running')}\n` +
      `*Voices installed:* ${piperHealth.voicesCount || 0}`,
      {
        parse_mode: 'Markdown',
        reply_markup: kb.ttsProviderKeyboard(currentProvider, {
          piperOk: piperHealth.ok,
          hasOpenAIKey: !!(await ctx.services.settingsRepo.get('openai_api_key')),
          hasCartesiaKey: !!(await ctx.services.settingsRepo.get('cartesia_api_key')),
          hasDeepgramKey: !!(await ctx.services.settingsRepo.get('deepgram_api_key')),
          hasPlayHTKey: !!(await ctx.services.settingsRepo.get('playht_api_key')) && !!(await ctx.services.settingsRepo.get('playht_user_id')),
          hasGoogleKey: !!(await ctx.services.settingsRepo.get('google_api_key')),
        }),
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:tts:piper', async (ctx) => {
    const piperHealth = await ctx.services.ttsService.checkPiperHealth();
    if (!piperHealth.ok) {
      await ctx.answerCallbackQuery('Piper server not running! Start it first.');
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('piper');
    ctx.services.ttsService.setProvider('piper');

    await ctx.answerCallbackQuery('Switched to Piper TTS');
    await ctx.editMessageText('✅ TTS Provider changed to Piper (Local)', {
      reply_markup: kb.settingsMenuKeyboard(ctx.services.ttsService.isElevenLabsConfigured(), 'piper'),
    });
  });

  bot.callbackQuery('settings:tts:elevenlabs', async (ctx) => {
    if (!ctx.services.ttsService.isElevenLabsConfigured()) {
      await ctx.answerCallbackQuery('Set ElevenLabs API key first');

      // Prompt to set API key
      await ctx.editMessageText('❌ ElevenLabs API key not configured.\n\nSet your API key first:', {
        reply_markup: new InlineKeyboard().text('🔑 Set API Key', 'settings:apikey').row().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('elevenlabs');
    ctx.services.ttsService.setProvider('elevenlabs');

    await ctx.answerCallbackQuery('Switched to ElevenLabs');
    await ctx.editMessageText('✅ TTS Provider changed to ElevenLabs', {
      reply_markup: kb.settingsMenuKeyboard(true, 'elevenlabs'),
    });
  });

  bot.callbackQuery('settings:tts:openai', async (ctx) => {
    const openaiKey = await ctx.services.settingsRepo.get('openai_api_key');
    if (!openaiKey) {
      await ctx.answerCallbackQuery('Set OpenAI API key first');
      await ctx.editMessageText('❌ OpenAI API key not configured.\n\nConfigure your OpenAI API key in the web admin AI Keys settings.', {
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('openai');
    ctx.services.ttsService.setProvider('openai');
    ctx.services.ttsService.setOpenAIApiKey(openaiKey);

    await ctx.answerCallbackQuery('Switched to OpenAI TTS');
    await ctx.editMessageText('✅ TTS Provider changed to OpenAI', {
      reply_markup: kb.settingsMenuKeyboard(true, 'openai'),
    });
  });

  bot.callbackQuery('settings:tts:cartesia', async (ctx) => {
    const cartesiaKey = await ctx.services.settingsRepo.get('cartesia_api_key');
    if (!cartesiaKey) {
      await ctx.answerCallbackQuery('Set Cartesia API key first');
      await ctx.editMessageText('❌ Cartesia API key not configured.\n\nConfigure your Cartesia API key in the web admin AI Keys settings.', {
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('cartesia');
    ctx.services.ttsService.setProvider('cartesia');
    ctx.services.ttsService.setCartesiaApiKey(cartesiaKey);

    await ctx.answerCallbackQuery('Switched to Cartesia TTS');
    await ctx.editMessageText('✅ TTS Provider changed to Cartesia', {
      reply_markup: kb.settingsMenuKeyboard(true, 'cartesia'),
    });
  });

  bot.callbackQuery('settings:tts:deepgram', async (ctx) => {
    const deepgramKey = await ctx.services.settingsRepo.get('deepgram_api_key');
    if (!deepgramKey) {
      await ctx.answerCallbackQuery('Set Deepgram API key first');
      await ctx.editMessageText('❌ Deepgram API key not configured.\n\nConfigure your Deepgram API key in the web admin AI Keys settings.', {
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('deepgram');
    ctx.services.ttsService.setProvider('deepgram');
    ctx.services.ttsService.setDeepgramApiKey(deepgramKey);

    await ctx.answerCallbackQuery('Switched to Deepgram TTS');
    await ctx.editMessageText('✅ TTS Provider changed to Deepgram', {
      reply_markup: kb.settingsMenuKeyboard(true, 'deepgram'),
    });
  });

  bot.callbackQuery('settings:tts:playht', async (ctx) => {
    const playhtKey = await ctx.services.settingsRepo.get('playht_api_key');
    const playhtUserId = await ctx.services.settingsRepo.get('playht_user_id');
    if (!playhtKey || !playhtUserId) {
      await ctx.answerCallbackQuery('Set PlayHT API key first');
      await ctx.editMessageText('❌ PlayHT credentials not configured.\n\nConfigure your PlayHT API key and User ID in the web admin AI Keys settings.', {
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('playht');
    ctx.services.ttsService.setProvider('playht');
    ctx.services.ttsService.setPlayHTApiKey(playhtKey);
    ctx.services.ttsService.setPlayHTUserId(playhtUserId);

    await ctx.answerCallbackQuery('Switched to PlayHT TTS');
    await ctx.editMessageText('✅ TTS Provider changed to PlayHT', {
      reply_markup: kb.settingsMenuKeyboard(true, 'playht'),
    });
  });

  bot.callbackQuery('settings:tts:google', async (ctx) => {
    const googleKey = await ctx.services.settingsRepo.get('google_api_key');
    if (!googleKey) {
      await ctx.answerCallbackQuery('Set Google API key first');
      await ctx.editMessageText('❌ Google Cloud API key not configured.\n\nConfigure your Google Cloud API key in the web admin AI Keys settings.', {
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'settings:tts'),
      });
      return;
    }

    await ctx.services.settingsRepo.setTTSProvider('google');
    ctx.services.ttsService.setProvider('google');
    ctx.services.ttsService.setGoogleApiKey(googleKey);

    await ctx.answerCallbackQuery('Switched to Google Cloud TTS');
    await ctx.editMessageText('✅ TTS Provider changed to Google Cloud TTS', {
      reply_markup: kb.settingsMenuKeyboard(true, 'google'),
    });
  });

  // Voice Settings (routes to correct provider)
  bot.callbackQuery('settings:voice', async (ctx) => {
    const provider = await ctx.services.settingsRepo.getTTSProvider();
    const hasApiKey = ctx.services.ttsService.isElevenLabsConfigured();

    if (provider === 'piper') {
      // Show Piper voice selection
      const voicesResult = await ctx.services.ttsService.getPiperVoices();
      if (!voicesResult.success || !voicesResult.data) {
        await ctx.editMessageText(`❌ Cannot reach Piper server.\n\nError: ${voicesResult.error}`, {
          reply_markup: new InlineKeyboard().text('⬅️ Back', 'menu:settings'),
        });
        await ctx.answerCallbackQuery();
        return;
      }

      const currentVoice = await ctx.services.settingsRepo.getPiperVoice();
      await ctx.editMessageText('🎙️ Select Piper Voice:', {
        reply_markup: kb.piperVoiceKeyboard(voicesResult.data, currentVoice, 0),
      });
    } else if (provider === 'openai') {
      // Show OpenAI voice selection
      const voices = ctx.services.ttsService.getOpenAIVoices();
      const currentVoice = ctx.services.ttsService.getOpenAIVoice();

      const keyboard = new InlineKeyboard();
      for (const voice of voices) {
        const isSelected = voice.id === currentVoice ? '✓ ' : '';
        keyboard.text(`${isSelected}${voice.name} - ${voice.description}`, `settings:openaivoice:${voice.id}`).row();
      }
      keyboard.text('⬅️ Back', 'menu:settings');

      await ctx.editMessageText('🎙️ Select OpenAI Voice:', {
        reply_markup: keyboard,
      });
    } else if (provider === 'cartesia') {
      // Show Cartesia voice selection
      const voices = ctx.services.ttsService.getCartesiaVoices();
      const currentVoice = ctx.services.ttsService.getCartesiaVoice();

      const keyboard = new InlineKeyboard();
      for (const voice of voices) {
        const isSelected = voice.id === currentVoice ? '✓ ' : '';
        keyboard.text(`${isSelected}${voice.name}`, `settings:cartesiavoice:${voice.id}`).row();
      }
      keyboard.text('⬅️ Back', 'menu:settings');

      await ctx.editMessageText('🎙️ Select Cartesia Voice:', {
        reply_markup: keyboard,
      });
    } else if (provider === 'deepgram') {
      // Show Deepgram voice selection
      const voices = ctx.services.ttsService.getDeepgramVoices();
      const currentVoice = ctx.services.ttsService.getDeepgramVoice();

      const keyboard = new InlineKeyboard();
      for (const voice of voices) {
        const isSelected = voice.id === currentVoice ? '✓ ' : '';
        keyboard.text(`${isSelected}${voice.name} - ${voice.description}`, `settings:deepgramvoice:${voice.id}`).row();
      }
      keyboard.text('⬅️ Back', 'menu:settings');

      await ctx.editMessageText('🎙️ Select Deepgram Voice:', {
        reply_markup: keyboard,
      });
    } else if (provider === 'playht') {
      // Show PlayHT voice selection
      const voices = ctx.services.ttsService.getPlayHTVoices();
      const currentVoice = ctx.services.ttsService.getPlayHTVoice();

      const keyboard = new InlineKeyboard();
      for (const voice of voices) {
        const isSelected = voice.id === currentVoice ? '✓ ' : '';
        keyboard.text(`${isSelected}${voice.name}`, `settings:playhtvoice:${voice.id}`).row();
      }
      keyboard.text('⬅️ Back', 'menu:settings');

      await ctx.editMessageText('🎙️ Select PlayHT Voice:', {
        reply_markup: keyboard,
      });
    } else if (provider === 'google') {
      // Show Google TTS voice selection
      const voices = ctx.services.ttsService.getGoogleVoices();
      const currentVoice = ctx.services.ttsService.getGoogleVoice();

      const keyboard = new InlineKeyboard();
      for (const voice of voices) {
        const isSelected = voice.id === currentVoice ? '✓ ' : '';
        keyboard.text(`${isSelected}${voice.name} - ${voice.description}`, `settings:googlevoice:${voice.id}`).row();
      }
      keyboard.text('⬅️ Back', 'menu:settings');

      await ctx.editMessageText('🎙️ Select Google Voice:', {
        reply_markup: keyboard,
      });
    } else {
      // Show ElevenLabs voice selection
      if (!hasApiKey) {
        await ctx.answerCallbackQuery('Set API key first');
        return;
      }

      const voicesResult = await ctx.services.ttsService.getVoices();

      if (!voicesResult.success || !voicesResult.data) {
        await ctx.answerCallbackQuery('Failed to fetch voices');
        return;
      }

      await ctx.editMessageText('🎙️ Select ElevenLabs Voice:', {
        reply_markup: kb.voiceSelectionKeyboard(voicesResult.data, 'settings:setvoice'),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Set OpenAI voice
  bot.callbackQuery(/^settings:openaivoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    ctx.services.ttsService.setOpenAIVoice(voiceId);
    await ctx.services.settingsRepo.set('openai_tts_voice', voiceId);

    await ctx.answerCallbackQuery(`Voice set to ${voiceId}`);
    await ctx.editMessageText(`✅ OpenAI voice changed to: *${voiceId}*`, {
      parse_mode: 'Markdown',
      reply_markup: kb.settingsMenuKeyboard(true, 'openai'),
    });
  });

  // Set Cartesia voice
  bot.callbackQuery(/^settings:cartesiavoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    ctx.services.ttsService.setCartesiaVoice(voiceId);
    await ctx.services.settingsRepo.set('cartesia_tts_voice', voiceId);

    const voices = ctx.services.ttsService.getCartesiaVoices();
    const voiceName = voices.find((v: any) => v.id === voiceId)?.name || voiceId;

    await ctx.answerCallbackQuery(`Voice set to ${voiceName}`);
    await ctx.editMessageText(`✅ Cartesia voice changed to: *${voiceName}*`, {
      parse_mode: 'Markdown',
      reply_markup: kb.settingsMenuKeyboard(true, 'cartesia'),
    });
  });

  // Set Deepgram voice
  bot.callbackQuery(/^settings:deepgramvoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    ctx.services.ttsService.setDeepgramVoice(voiceId);
    await ctx.services.settingsRepo.set('deepgram_tts_voice', voiceId);

    const voices = ctx.services.ttsService.getDeepgramVoices();
    const voiceName = voices.find((v: any) => v.id === voiceId)?.name || voiceId;

    await ctx.answerCallbackQuery(`Voice set to ${voiceName}`);
    await ctx.editMessageText(`✅ Deepgram voice changed to: *${voiceName}*`, {
      parse_mode: 'Markdown',
      reply_markup: kb.settingsMenuKeyboard(true, 'deepgram'),
    });
  });

  // Set PlayHT voice
  bot.callbackQuery(/^settings:playhtvoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    ctx.services.ttsService.setPlayHTVoice(voiceId);
    await ctx.services.settingsRepo.set('playht_tts_voice', voiceId);

    const voices = ctx.services.ttsService.getPlayHTVoices();
    const voiceName = voices.find((v: any) => v.id === voiceId)?.name || voiceId;

    await ctx.answerCallbackQuery(`Voice set to ${voiceName}`);
    await ctx.editMessageText(`✅ PlayHT voice changed to: *${voiceName}*`, {
      parse_mode: 'Markdown',
      reply_markup: kb.settingsMenuKeyboard(true, 'playht'),
    });
  });

  // Set Google voice
  bot.callbackQuery(/^settings:googlevoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    ctx.services.ttsService.setGoogleVoice(voiceId);
    await ctx.services.settingsRepo.set('google_tts_voice', voiceId);

    const voices = ctx.services.ttsService.getGoogleVoices();
    const voiceName = voices.find((v: any) => v.id === voiceId)?.name || voiceId;

    await ctx.answerCallbackQuery(`Voice set to ${voiceName}`);
    await ctx.editMessageText(`✅ Google voice changed to: *${voiceName}*`, {
      parse_mode: 'Markdown',
      reply_markup: kb.settingsMenuKeyboard(true, 'google'),
    });
  });

  // Piper voice selection with pagination
  bot.callbackQuery(/^settings:pipervoices(?::(\d+))?$/, async (ctx) => {
    const page = ctx.match[1] ? parseInt(ctx.match[1]) : 0;

    const voicesResult = await ctx.services.ttsService.getPiperVoices();
    if (!voicesResult.success || !voicesResult.data) {
      await ctx.answerCallbackQuery('Cannot reach Piper server');
      return;
    }

    const currentVoice = await ctx.services.settingsRepo.getPiperVoice();
    await ctx.editMessageText('🎙️ Select Piper Voice:', {
      reply_markup: kb.piperVoiceKeyboard(voicesResult.data, currentVoice, page),
    });
    await ctx.answerCallbackQuery();
  });

  // Set Piper voice
  bot.callbackQuery(/^settings:pipervoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];

    await ctx.services.settingsRepo.setPiperVoice(voiceId);
    ctx.services.ttsService.setPiperVoice(voiceId);

    await ctx.answerCallbackQuery('Voice updated');

    const shortName = voiceId.replace('en_US-', 'US: ').replace('en_GB-', 'UK: ').replace('-medium', '');
    await ctx.editMessageText(`✅ Piper voice set to: ${shortName}`, {
      reply_markup: kb.settingsMenuKeyboard(ctx.services.ttsService.isElevenLabsConfigured(), 'piper'),
    });
  });

  // ElevenLabs voice selection
  bot.callbackQuery(/^settings:setvoice:(.+)$/, async (ctx) => {
    const voiceId = ctx.match[1];
    await ctx.services.settingsRepo.setDefaultVoice(voiceId);
    ctx.services.ttsService.setDefaultVoice(voiceId);
    await ctx.answerCallbackQuery('Default voice updated');
    await ctx.editMessageText('✅ ElevenLabs voice updated!', {
      reply_markup: kb.settingsMenuKeyboard(true, 'elevenlabs'),
    });
  });

  bot.callbackQuery('settings:admins', async (ctx) => {
    const admins = await ctx.services.settingsRepo.getAllAdmins();
    await ctx.editMessageText('Admin Users:', {
      reply_markup: kb.adminsKeyboard(admins),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:admin:add', async (ctx) => {
    ctx.session.awaitingInput = 'admin_id';
    await ctx.editMessageText('Enter the Telegram user ID of the new admin:');
    await ctx.answerCallbackQuery();
  });

  // =====================
  // Confirmation Handlers
  // =====================

  bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const [type, subAction, id] = action.split(':');

    if (type === 'ivr' && subAction === 'delete' && id) {
      await ctx.services.ivrMenuRepo.delete(id);
      await ctx.answerCallbackQuery('Menu deleted');
      const menus = await ctx.services.ivrMenuRepo.findAll();
      await ctx.editMessageText('IVR Menus:', {
        reply_markup: kb.ivrMenusKeyboard(menus),
      });
    } else if (type === 'ext' && subAction === 'delete' && id) {
      await ctx.services.extensionRepo.delete(id);
      await ctx.services.asteriskConfigService.writePJSIPConfig();
      await ctx.answerCallbackQuery('Extension deleted');
      const extensions = await ctx.services.extensionRepo.findAll();
      await ctx.editMessageText('Extensions:', {
        reply_markup: kb.extensionsKeyboard(extensions),
      });
    } else if (type === 'route' && subAction === 'delete' && id) {
      await ctx.services.routingRepo.delete(id);
      await ctx.answerCallbackQuery('Rule deleted');
      const rules = await ctx.services.routingRepo.findAll();
      await ctx.editMessageText('Routing Rules:', {
        reply_markup: kb.routingKeyboard(rules),
      });
    } else if (type === 'media' && subAction === 'delete' && id) {
      await ctx.services.promptRepo.delete(id);
      ctx.services.audioService.deleteAudio(id, 'prompts');
      await ctx.answerCallbackQuery('Prompt deleted');
      const prompts = await ctx.services.promptRepo.findAll();
      await ctx.editMessageText('Audio Prompts:', {
        reply_markup: kb.promptsListKeyboard(prompts),
      });
    } else if (type === 'trunk' && subAction === 'delete' && id) {
      await ctx.services.trunkRepo.delete(id);
      await ctx.answerCallbackQuery('✅ Trunk deleted');
      const trunks = await ctx.services.trunkRepo.findAll();
      await ctx.editMessageText('🌐 *SIP Trunks:*', {
        parse_mode: 'Markdown',
        reply_markup: kb.trunksKeyboard(trunks),
      });
    } else if (type === 'dialer' && subAction === 'stop' && id) {
      // Stop dialer campaign
      if (ctx.services.dialerService) {
        await ctx.services.dialerService.stopCampaign(id);
      }
      await ctx.answerCallbackQuery('⏹️ Campaign stopped');
      const campaigns = await ctx.services.dialerCampaignRepo.findAll();
      await ctx.editMessageText('📢 *Dialer Campaigns:*', {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerMenuKeyboard(campaigns),
      });
    } else if (type === 'dialer' && subAction === 'delete' && id) {
      // Stop campaign first if running
      if (ctx.services.dialerService?.isRunning(id)) {
        await ctx.services.dialerService.stopCampaign(id);
      }
      await ctx.services.dialerCampaignRepo.delete(id);
      await ctx.answerCallbackQuery('🗑️ Campaign deleted');
      const campaigns = await ctx.services.dialerCampaignRepo.findAll();
      await ctx.editMessageText('📢 *Dialer Campaigns:*', {
        parse_mode: 'Markdown',
        reply_markup: kb.dialerMenuKeyboard(campaigns),
      });
    }
  });

  bot.callbackQuery('cancel', async (ctx) => {
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
    await ctx.editMessageText('Operation cancelled.', {
      reply_markup: kb.mainMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });
}

/**
 * Setup text message handlers for input collection
 */
export function setupMessageHandlers(bot: Bot<MyContext>): void {
  // Handle text input based on session state
  bot.on('message:text', async (ctx, next) => {
    const awaitingInput = ctx.session.awaitingInput;

    if (!awaitingInput) {
      return next();
    }

    const text = ctx.message.text.trim();

    // Handle IVR destination input
    if (awaitingInput.startsWith('ivr:destination:')) {
      const parts = awaitingInput.split(':');
      const actionType = parts[2] as 'transfer' | 'external' | 'submenu' | 'voicemail' | 'queue';
      const menuId = parts[3];
      const keyPress = parts[4];

      await ctx.services.ivrMenuRepo.addOption({
        menuId,
        keyPress,
        actionType,
        destination: text,
        preConnectPromptId: null,
        postCallPromptId: null,
        transferTrunkId: null,
        transferDestination: null,
        transferMode: 'internal',
      });

      ctx.session.awaitingInput = undefined;
      await ctx.reply(`Option ${keyPress} -> ${actionType} -> ${text} added!`);
      return;
    }

    // Handle admin ID input
    if (awaitingInput === 'admin_id') {
      const adminId = parseInt(text, 10);
      if (isNaN(adminId)) {
        await ctx.reply('Invalid user ID. Please enter a number.');
        return;
      }

      await ctx.services.settingsRepo.addAdmin(adminId);
      ctx.session.awaitingInput = undefined;
      await ctx.reply(`✅ Admin ${adminId} added!`);
      return;
    }

    // Handle trunk host input
    if (awaitingInput.startsWith('trunk:host:')) {
      const trunkId = awaitingInput.split(':')[2];
      await ctx.services.trunkRepo.update(trunkId, { host: text });
      ctx.session.awaitingInput = undefined;
      await ctx.reply(`✅ Trunk host updated to: ${text}`);
      return;
    }

    // Handle trunk username input
    if (awaitingInput.startsWith('trunk:username:')) {
      const trunkId = awaitingInput.split(':')[2];
      await ctx.services.trunkRepo.update(trunkId, { username: text });
      ctx.session.awaitingInput = `trunk:password:${trunkId}`;
      await ctx.reply('Now enter the new SIP password:');
      return;
    }

    // Handle trunk password input
    if (awaitingInput.startsWith('trunk:password:')) {
      const trunkId = awaitingInput.split(':')[2];
      await ctx.services.trunkRepo.update(trunkId, { password: text });
      ctx.session.awaitingInput = undefined;
      await ctx.reply('✅ Trunk credentials updated!');
      return;
    }

    // Handle IVR timeout input
    if (awaitingInput.startsWith('ivr:timeout:')) {
      const menuId = awaitingInput.split(':')[2];
      const timeout = parseInt(text, 10);
      if (isNaN(timeout) || timeout < 5 || timeout > 60) {
        await ctx.reply('Invalid timeout. Please enter a number between 5 and 60.');
        return;
      }
      await ctx.services.ivrMenuRepo.update(menuId, { timeoutSeconds: timeout });
      ctx.session.awaitingInput = undefined;
      await ctx.reply(`✅ Timeout set to ${timeout} seconds`, {
        reply_markup: kb.ivrSettingsKeyboard(menuId),
      });
      return;
    }

    // Handle IVR max retries input
    if (awaitingInput.startsWith('ivr:retries:')) {
      const menuId = awaitingInput.split(':')[2];
      const retries = parseInt(text, 10);
      if (isNaN(retries) || retries < 1 || retries > 5) {
        await ctx.reply('Invalid value. Please enter a number between 1 and 5.');
        return;
      }
      await ctx.services.ivrMenuRepo.update(menuId, { maxRetries: retries });
      ctx.session.awaitingInput = undefined;
      await ctx.reply(`✅ Max retries set to ${retries}`, {
        reply_markup: kb.ivrSettingsKeyboard(menuId),
      });
      return;
    }

    // Handle upload name input
    if (awaitingInput === 'upload_name') {
      await handleUploadName(ctx);
      return;
    }

    // Handle IVR ring group input (for 3CX trunk transfer)
    if (awaitingInput === 'ivr_ringgroup') {
      const tempData = ctx.session.tempData as { menuId: string; keyPress: string; trunkId: string } | undefined;

      if (!tempData || !tempData.menuId || !tempData.keyPress || !tempData.trunkId) {
        await ctx.reply('❌ Session expired. Please try again.');
        ctx.session.awaitingInput = undefined;
        ctx.session.tempData = undefined;
        return;
      }

      // Validate ring group number (digits only)
      if (!/^\d+$/.test(text)) {
        await ctx.reply('❌ Please enter a valid extension/ring group number (digits only).');
        return;
      }

      // Create the IVR option with trunk transfer
      await ctx.services.ivrMenuRepo.addOption({
        menuId: tempData.menuId,
        keyPress: tempData.keyPress,
        actionType: 'transfer',
        destination: null,
        preConnectPromptId: null,
        postCallPromptId: null,
        transferTrunkId: tempData.trunkId,
        transferDestination: text,
        transferMode: 'trunk',
      });

      ctx.session.awaitingInput = undefined;
      ctx.session.tempData = undefined;

      const trunk = await ctx.services.trunkRepo.findById(tempData.trunkId);
      const options = await ctx.services.ivrMenuRepo.findOptionsByMenuId(tempData.menuId);

      await ctx.reply(
        `✅ *IVR Option Added!*\n\n` +
        `Key: ${tempData.keyPress}\n` +
        `☁️ Trunk: ${trunk?.name || 'Unknown'}\n` +
        `📞 Ring Group: ${text}\n\n` +
        `Calls will transfer via 3CX trunk.`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.ivrOptionsKeyboard(tempData.menuId, options),
        }
      );
      return;
    }

    // Handle dialer ring group input
    if (awaitingInput === 'dialer_ringgroup') {
      const campaignId = ctx.session.editingItemId;

      if (!campaignId) {
        await ctx.reply('❌ Session expired. Please try again.');
        ctx.session.awaitingInput = undefined;
        ctx.session.editingItemId = undefined;
        return;
      }

      // Validate ring group number (digits only)
      if (!/^\d+$/.test(text)) {
        await ctx.reply('❌ Please enter a valid extension/ring group number (digits only).');
        return;
      }

      await ctx.services.dialerCampaignRepo.update(campaignId, { transferDestination: text });
      ctx.session.awaitingInput = undefined;
      ctx.session.editingItemId = undefined;

      const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
      const trunk = campaign?.transferTrunkId
        ? await ctx.services.trunkRepo.findById(campaign.transferTrunkId)
        : null;

      await ctx.reply(
        `✅ *Transfer Configured!*\n\n` +
        `☁️ Trunk: ${trunk?.name || 'Unknown'}\n` +
        `📞 Ring Group: ${text}\n\n` +
        `Press-1 leads will now be transferred via this trunk.`,
        {
          parse_mode: 'Markdown',
          reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
        }
      );
      return;
    }

    return next();
  });

  // Handle audio/voice uploads
  bot.on(['message:audio', 'message:voice'], async (ctx, next) => {
    if (ctx.session.awaitingInput === 'upload_file') {
      const { handleAudioUpload } = await import('../bot');
      await handleAudioUpload(ctx);
      return;
    }
    return next();
  });

  // Handle document uploads (for audio files and dialer contacts)
  bot.on('message:document', async (ctx, next) => {
    const mimeType = ctx.message.document.mime_type || '';
    const fileName = ctx.message.document.file_name || '';

    // Handle audio file upload
    if (ctx.session.awaitingInput === 'upload_file' && mimeType.startsWith('audio/')) {
      const { handleAudioUpload } = await import('../bot');
      await handleAudioUpload(ctx);
      return;
    }

    // Handle dialer contact list upload (CSV/TXT)
    if (ctx.session.awaitingInput === 'dialer_upload_contacts') {
      const tempData = ctx.session.tempData as { campaignId?: string } | undefined;
      const campaignId = tempData?.campaignId;

      if (!campaignId) {
        await ctx.reply('❌ Session expired. Please try again.');
        ctx.session.awaitingInput = undefined;
        ctx.session.tempData = undefined;
        return;
      }

      const isTextFile = mimeType === 'text/plain' || mimeType === 'text/csv' ||
        fileName.endsWith('.txt') || fileName.endsWith('.csv');

      if (!isTextFile) {
        await ctx.reply('❌ Please upload a CSV or TXT file.');
        return;
      }

      try {
        // Download the file
        const file = await ctx.api.getFile(ctx.message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

        const response = await fetch(fileUrl);
        const content = await response.text();

        // Parse the contact list
        const contacts = parseContactList(content);

        if (contacts.length === 0) {
          await ctx.reply('❌ No valid phone numbers found in the file.');
          return;
        }

        // Bulk insert contacts
        const insertedCount = await ctx.services.campaignContactRepo.bulkCreate(campaignId, contacts);

        // Update campaign total contacts
        const campaign = await ctx.services.dialerCampaignRepo.findById(campaignId);
        if (campaign) {
          await ctx.services.dialerCampaignRepo.setTotalContacts(campaignId, campaign.totalContacts + insertedCount);
        }

        ctx.session.awaitingInput = undefined;
        ctx.session.tempData = undefined;

        await ctx.reply(
          `✅ *Contacts Uploaded*\n\n` +
          `📋 Found: ${contacts.length} phone numbers\n` +
          `✅ Added: ${insertedCount} contacts\n\n` +
          `_Ready to start the campaign!_`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.dialerContactsKeyboard(campaignId),
          }
        );
      } catch (error) {
        telegramLogger.error('Failed to upload contacts:', error);
        await ctx.reply(`❌ Failed to process file: ${(error as Error).message}`);
      }
      return;
    }

    // Handle hold music upload for dialer
    if (ctx.session.awaitingInput === 'dialer_upload_holdmusic') {
      const campaignId = ctx.session.editingItemId;

      if (!campaignId) {
        await ctx.reply('❌ Session expired. Please try again.');
        ctx.session.awaitingInput = undefined;
        ctx.session.editingItemId = undefined;
        return;
      }

      const isAudioFile = mimeType.startsWith('audio/') ||
        fileName.endsWith('.mp3') ||
        fileName.endsWith('.wav') ||
        fileName.endsWith('.ogg');

      if (!isAudioFile) {
        await ctx.reply('❌ Please upload an audio file (MP3, WAV, or OGG).');
        return;
      }

      try {
        await ctx.reply('⏳ Processing audio file...');

        // Download the file
        const file = await ctx.api.getFile(ctx.message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Create a unique name for the hold music
        const promptName = `Hold Music - ${fileName.replace(/\.[^.]+$/, '')}`;

        // Save as a prompt
        const prompt = await ctx.services.promptRepo.create({
          name: promptName,
          type: 'uploaded',
          filePath: null,
          text: null,
          voice: null,
        });

        // Save the audio file
        const audioResult = await ctx.services.audioService.saveUploadedAudio(
          buffer,
          fileName,
          prompt.id
        );

        if (!audioResult.success || !audioResult.data) {
          await ctx.reply(`❌ Failed to convert audio: ${audioResult.error}`);
          await ctx.services.promptRepo.delete(prompt.id);
          return;
        }

        // Update prompt with file path
        await ctx.services.promptRepo.update(prompt.id, { filePath: audioResult.data.slnPath });

        // Set as hold music for the campaign
        await ctx.services.dialerCampaignRepo.update(campaignId, { holdMusicPromptId: prompt.id });

        // Setup MOH config
        if (ctx.services.mohService) {
          await ctx.services.mohService.setupCampaignMoh(campaignId, audioResult.data.slnPath);
        }

        ctx.session.awaitingInput = undefined;
        ctx.session.editingItemId = undefined;

        await ctx.reply(
          `✅ *Hold Music Set*\n\n` +
          `🎵 ${promptName}\n\n` +
          `This will play while connecting leads to extensions.`,
          {
            parse_mode: 'Markdown',
            reply_markup: kb.dialerCampaignSettingsKeyboard(campaignId),
          }
        );
      } catch (error) {
        telegramLogger.error('Failed to upload hold music:', error);
        await ctx.reply(`❌ Failed to process audio file: ${(error as Error).message}`);
      }
      return;
    }

    return next();
  });
}

/**
 * Parse contact list from CSV/TXT file content
 */
function parseContactList(content: string): Array<{ phoneNumber: string; name: string | undefined }> {
  const contacts: Array<{ phoneNumber: string; name: string | undefined }> = [];
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());

  if (lines.length === 0) return contacts;

  // Check if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('phone') || firstLine.includes('mobile') ||
    firstLine.includes('number') || firstLine.includes('name');

  const startIndex = hasHeader ? 1 : 0;

  // Detect delimiter
  const delimiter = firstLine.includes('\t') ? '\t' :
    firstLine.includes(';') ? ';' : ',';

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let phoneNumber: string | undefined = undefined;
    let name: string | undefined = undefined;

    // Check if line contains delimiter
    if (line.includes(delimiter)) {
      const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));

      if (hasHeader) {
        // Try to find phone column based on header
        const headerParts = lines[0].toLowerCase().split(delimiter).map(p => p.trim());
        const phoneIndex = headerParts.findIndex(h =>
          h.includes('phone') || h.includes('mobile') || h.includes('number')
        );
        const nameIndex = headerParts.findIndex(h => h.includes('name'));

        phoneNumber = phoneIndex >= 0 ? parts[phoneIndex] : parts[0];
        name = nameIndex >= 0 && parts[nameIndex] ? parts[nameIndex] : undefined;
      } else {
        // Assume first column is phone, second is name
        phoneNumber = parts[0];
        name = parts[1] || undefined;
      }
    } else {
      // Single column - just phone number
      phoneNumber = line;
    }

    // Clean and validate phone number
    if (phoneNumber) {
      // Remove common formatting
      phoneNumber = phoneNumber.replace(/[\s\-\(\)\.]/g, '');

      // Add + if it looks like an international number without it
      if (/^\d{10,15}$/.test(phoneNumber) && !phoneNumber.startsWith('+')) {
        // Keep as-is, let the trunk handle it
      }

      // Basic validation: must be at least 8 digits
      if (/^\+?\d{8,15}$/.test(phoneNumber)) {
        contacts.push({ phoneNumber, name });
      }
    }
  }

  return contacts;
}
