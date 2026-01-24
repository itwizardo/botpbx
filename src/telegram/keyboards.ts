import { InlineKeyboard } from 'grammy';
import { IVRMenu, Extension, RoutingRule, Prompt, SIPTrunk, DialerCampaign, CampaignStatus } from '../models/types';

// =====================
// Main Menu
// =====================

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Dashboard', 'menu:dashboard').row()
    .text('⚡ Quick Actions', 'menu:quick').row()
    .text('📞 IVR Menus', 'menu:ivr').row()
    .text('🔌 Extensions', 'menu:extensions')
    .text('🌐 SIP Trunks', 'menu:trunks').row()
    .text('🔀 Routing', 'menu:routing').row()
    .text('🎵 Media / Audio', 'menu:media').row()
    .text('📢 Dialer Campaigns', 'menu:dialer').row()
    .text('🚀 IVR Campaign Control', 'menu:campaign').row()
    .text('📈 Stats / Logs', 'menu:stats').row()
    .text('🔍 Diagnostics', 'menu:diagnostics').row()
    .text('⚙️ Settings', 'menu:settings');
}

// =====================
// Dashboard
// =====================

export function dashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Refresh', 'menu:dashboard').row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// Quick Actions
// =====================

export function quickActionsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Reload Asterisk', 'quick:reload:core').row()
    .text('📱 Reload PJSIP', 'quick:reload:pjsip').row()
    .text('📋 View Recent Logs', 'quick:logs').row()
    .text('📞 Active Channels', 'quick:channels').row()
    .text('🔧 Generate PJSIP Config', 'quick:genpjsip').row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// Diagnostics
// =====================

export function diagnosticsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔍 Run All Diagnostics', 'diag:all').row()
    .text('🔌 AMI Connection', 'diag:ami').row()
    .text('📡 AGI Server', 'diag:agi').row()
    .text('🖥️ Asterisk CLI Ping', 'diag:ping').row()
    .text('📱 PJSIP Endpoints', 'diag:pjsip').row()
    .text('📞 Active Channels', 'diag:channels').row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// SIP Trunks
// =====================

export function trunksKeyboard(trunks: SIPTrunk[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const trunk of trunks) {
    const status = trunk.enabled ? '✅' : '❌';
    kb.text(`${status} 🌐 ${trunk.name}`, `trunk:view:${trunk.id}`).row();
  }

  kb.text('➕ Add SIP Trunk', 'trunk:create').row();
  kb.text('🔧 Generate Trunk Config', 'trunk:generate').row();
  kb.text('📞 Test Call', 'trunk:testcall').row();
  kb.text('⬅️ Back', 'menu:main');

  return kb;
}

export function trunkDetailKeyboard(trunkId: string, enabled: boolean): InlineKeyboard {
  const toggleText = enabled ? '🔴 Disable' : '🟢 Enable';

  return new InlineKeyboard()
    .text('✏️ Edit Host', `trunk:edit:host:${trunkId}`)
    .text('✏️ Edit Credentials', `trunk:edit:creds:${trunkId}`).row()
    .text('🔧 Advanced Settings', `trunk:edit:advanced:${trunkId}`).row()
    .text(toggleText, `trunk:toggle:${trunkId}`)
    .text('🗑️ Delete', `trunk:delete:${trunkId}`).row()
    .text('⬅️ Back', 'menu:trunks');
}

export function trunkAdvancedKeyboard(trunkId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 Context', `trunk:edit:context:${trunkId}`)
    .text('🎵 Codecs', `trunk:edit:codecs:${trunkId}`).row()
    .text('📤 From User', `trunk:edit:fromuser:${trunkId}`)
    .text('🌐 From Domain', `trunk:edit:fromdomain:${trunkId}`).row()
    .text('📝 Registration', `trunk:edit:register:${trunkId}`).row()
    .text('⬅️ Back', `trunk:view:${trunkId}`);
}

// =====================
// IVR Menus
// =====================

export function ivrMenusKeyboard(menus: IVRMenu[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const menu of menus) {
    kb.text(`📞 ${menu.name}`, `ivr:view:${menu.id}`).row();
  }

  kb.text('➕ Create New Menu', 'ivr:create').row();
  kb.text('⬅️ Back', 'menu:main');

  return kb;
}

export function ivrMenuDetailKeyboard(menuId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📞 Test IVR Call', `ivr:testcall:${menuId}`).row()
    .text('✏️ Edit Name', `ivr:edit:name:${menuId}`)
    .text('🔊 Prompts', `ivr:prompts:${menuId}`).row()
    .text('🔢 Options (DTMF)', `ivr:options:${menuId}`)
    .text('⚙️ Settings', `ivr:settings:${menuId}`).row()
    .text('🗑️ Delete', `ivr:delete:${menuId}`).row()
    .text('⬅️ Back', 'menu:ivr');
}

export function ivrOptionsKeyboard(menuId: string, options: Array<{ keyPress: string; actionType: string; destination: string | null }>): InlineKeyboard {
  const kb = new InlineKeyboard();

  const actionEmojis: Record<string, string> = {
    transfer: '📱',
    external: '📲',
    submenu: '📁',
    voicemail: '📧',
    queue: '👥',
    hangup: '📴',
  };

  for (const opt of options) {
    const emoji = actionEmojis[opt.actionType] || '🔹';
    const label = `${opt.keyPress}: ${emoji} ${opt.actionType}${opt.destination ? ` → ${opt.destination}` : ''}`;
    kb.text(label, `ivr:opt:edit:${menuId}:${opt.keyPress}`).row();
  }

  kb.text('➕ Add Option', `ivr:opt:add:${menuId}`).row();
  kb.text('⬅️ Back', `ivr:view:${menuId}`);

  return kb;
}

export function ivrPromptsKeyboard(menuId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('👋 Welcome Prompt', `ivr:prompt:welcome:${menuId}`).row()
    .text('⚠️ Invalid Input Prompt', `ivr:prompt:invalid:${menuId}`).row()
    .text('⏱️ Timeout Prompt', `ivr:prompt:timeout:${menuId}`).row()
    .text('⬅️ Back', `ivr:view:${menuId}`);
}

export function actionTypeKeyboard(menuId: string, keyPress: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📱 Transfer to Extension', `ivr:action:transfer:${menuId}:${keyPress}`).row()
    .text('☁️ Transfer to 3CX/Trunk', `ivr:action:trunk:${menuId}:${keyPress}`).row()
    .text('📲 External Number', `ivr:action:external:${menuId}:${keyPress}`).row()
    .text('📁 Sub-menu', `ivr:action:submenu:${menuId}:${keyPress}`).row()
    .text('📧 Voicemail', `ivr:action:voicemail:${menuId}:${keyPress}`).row()
    .text('👥 Queue', `ivr:action:queue:${menuId}:${keyPress}`).row()
    .text('📴 Hangup', `ivr:action:hangup:${menuId}:${keyPress}`).row()
    .text('❌ Cancel', `ivr:options:${menuId}`);
}

// =====================
// Extensions
// =====================

export function extensionsKeyboard(extensions: Extension[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const ext of extensions) {
    const status = ext.enabled ? '✅' : '❌';
    kb.text(`${status} ${ext.number} - ${ext.name}`, `ext:view:${ext.number}`).row();
  }

  kb.text('➕ Create Extension', 'ext:create').row();
  kb.text('🔧 Generate PJSIP Config', 'ext:generate').row();
  kb.text('⬅️ Back', 'menu:main');

  return kb;
}

export function extensionDetailKeyboard(extNumber: string, enabled: boolean): InlineKeyboard {
  const toggleText = enabled ? '🔴 Disable' : '🟢 Enable';

  return new InlineKeyboard()
    .text('✏️ Edit Name', `ext:edit:name:${extNumber}`)
    .text('🔑 New Password', `ext:edit:pwd:${extNumber}`).row()
    .text(toggleText, `ext:toggle:${extNumber}`)
    .text('🗑️ Delete', `ext:delete:${extNumber}`).row()
    .text('⬅️ Back', 'menu:extensions');
}

// =====================
// Routing
// =====================

export function routingKeyboard(rules: RoutingRule[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  const targetEmojis: Record<string, string> = {
    ivr_menu: '📞',
    extension: '📱',
    queue: '👥',
  };

  for (const rule of rules) {
    const status = rule.enabled ? '✅' : '❌';
    const emoji = targetEmojis[rule.targetType] || '🔹';
    const target = `${emoji} ${rule.targetType}:${rule.targetId}`;
    kb.text(`${status} ${rule.did} → ${target}`, `route:view:${rule.id}`).row();
  }

  kb.text('➕ Add Routing Rule', 'route:create').row();
  kb.text('⬅️ Back', 'menu:main');

  return kb;
}

export function routingDetailKeyboard(ruleId: string, enabled: boolean): InlineKeyboard {
  const toggleText = enabled ? '🔴 Disable' : '🟢 Enable';

  return new InlineKeyboard()
    .text('✏️ Edit DID', `route:edit:did:${ruleId}`)
    .text('🎯 Change Target', `route:edit:target:${ruleId}`).row()
    .text(toggleText, `route:toggle:${ruleId}`)
    .text('🗑️ Delete', `route:delete:${ruleId}`).row()
    .text('⬅️ Back', 'menu:routing');
}

export function targetTypeKeyboard(ruleId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📞 IVR Menu', `route:target:ivr_menu:${ruleId}`).row()
    .text('📱 Extension', `route:target:extension:${ruleId}`).row()
    .text('👥 Queue', `route:target:queue:${ruleId}`).row()
    .text('❌ Cancel', `route:view:${ruleId}`);
}

// =====================
// Media / Audio
// =====================

export function mediaMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗣️ Generate TTS Prompt', 'media:tts').row()
    .text('📤 Upload Audio File', 'media:upload').row()
    .text('📋 View All Prompts', 'media:list').row()
    .text('⬅️ Back', 'menu:main');
}

export function promptsListKeyboard(prompts: Prompt[], page: number = 0, pageSize: number = 10): InlineKeyboard {
  const kb = new InlineKeyboard();
  const start = page * pageSize;
  const end = start + pageSize;
  const pagePrompts = prompts.slice(start, end);

  for (const prompt of pagePrompts) {
    const icon = prompt.type === 'tts' ? '🗣️' : '📤';
    kb.text(`${icon} ${prompt.name}`, `media:view:${prompt.id}`).row();
  }

  // Pagination
  const prevPage = page > 0;
  const nextPage = end < prompts.length;

  if (prevPage || nextPage) {
    if (prevPage) {
      kb.text('⬅️ Prev', `media:list:${page - 1}`);
    }
    if (nextPage) {
      kb.text('➡️ Next', `media:list:${page + 1}`);
    }
    kb.row();
  }

  kb.text('⬅️ Back', 'menu:media');

  return kb;
}

export function promptDetailKeyboard(promptId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('▶️ Preview', `media:preview:${promptId}`)
    .text('🗑️ Delete', `media:delete:${promptId}`).row()
    .text('⬅️ Back', 'media:list:0');
}

export function promptSelectionKeyboard(prompts: Prompt[], callbackPrefix: string, page: number = 0): InlineKeyboard {
  const kb = new InlineKeyboard();
  const pageSize = 8;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagePrompts = prompts.slice(start, end);

  // Add "None" option
  kb.text('⊘ None', `${callbackPrefix}:none`).row();

  for (const prompt of pagePrompts) {
    const icon = prompt.type === 'tts' ? '🗣️' : '📤';
    kb.text(`${icon} ${prompt.name}`, `${callbackPrefix}:${prompt.id}`).row();
  }

  // Pagination
  const prevPage = page > 0;
  const nextPage = end < prompts.length;

  if (prevPage || nextPage) {
    if (prevPage) {
      kb.text('⬅️ Prev', `${callbackPrefix}:page:${page - 1}`);
    }
    if (nextPage) {
      kb.text('➡️ Next', `${callbackPrefix}:page:${page + 1}`);
    }
    kb.row();
  }

  kb.text('❌ Cancel', 'cancel');

  return kb;
}

// =====================
// Campaign Control
// =====================

export function campaignControlKeyboard(isActive: boolean): InlineKeyboard {
  const statusIcon = isActive ? '🟢 ACTIVE' : '🔴 STOPPED';
  const toggleText = isActive ? '⏹️ Stop Campaign' : '▶️ Start Campaign';
  const toggleAction = isActive ? 'campaign:stop' : 'campaign:start';

  return new InlineKeyboard()
    .text(`📊 Status: ${statusIcon}`, 'campaign:status').row()
    .text(toggleText, toggleAction).row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// Stats
// =====================

export function statsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📅 Today\'s Calls', 'stats:today').row()
    .text('📆 Last 7 Days', 'stats:week').row()
    .text('📞 Recent Calls', 'stats:recent').row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// Settings
// =====================

export type TTSProvider = 'piper' | 'elevenlabs' | 'openai' | 'cartesia' | 'deepgram' | 'playht' | 'google';

export function settingsMenuKeyboard(hasApiKey: boolean, ttsProvider: TTSProvider = 'piper'): InlineKeyboard {
  const providerLabels: Record<TTSProvider, string> = {
    piper: '🖥️ TTS: Piper (Local)',
    elevenlabs: '☁️ TTS: ElevenLabs',
    openai: '🤖 TTS: OpenAI',
    cartesia: '⚡ TTS: Cartesia',
    deepgram: '🎙️ TTS: Deepgram',
    playht: '🎵 TTS: PlayHT',
    google: '🌐 TTS: Google',
  };
  const providerText = providerLabels[ttsProvider] || providerLabels.piper;

  return new InlineKeyboard()
    .text(providerText, 'settings:tts').row()
    .text('🗣️ Voice Settings', 'settings:voice').row()
    .text('👤 Manage Admins', 'settings:admins').row()
    .text('⬅️ Back', 'menu:main');
}

// =====================
// TTS Provider Selection
// =====================

export interface TTSProviderStatus {
  piperOk?: boolean;
  hasOpenAIKey?: boolean;
  hasCartesiaKey?: boolean;
  hasDeepgramKey?: boolean;
  hasPlayHTKey?: boolean;
  hasGoogleKey?: boolean;
}

export function ttsProviderKeyboard(current: TTSProvider, status: TTSProviderStatus = {}): InlineKeyboard {
  const { piperOk = true, hasOpenAIKey = false, hasCartesiaKey = false, hasDeepgramKey = false, hasPlayHTKey = false, hasGoogleKey = false } = status;
  const mark = (p: TTSProvider) => current === p ? '✓ ' : '';
  const stat = (ok: boolean) => ok ? '✅' : '❌';

  return new InlineKeyboard()
    .text(`${mark('piper')}🖥️ Piper (Local) ${stat(piperOk)}`, 'settings:tts:piper').row()
    .text(`${mark('elevenlabs')}☁️ ElevenLabs (API)`, 'settings:tts:elevenlabs').row()
    .text(`${mark('openai')}🤖 OpenAI TTS ${stat(hasOpenAIKey)}`, 'settings:tts:openai').row()
    .text(`${mark('cartesia')}⚡ Cartesia ${stat(hasCartesiaKey)}`, 'settings:tts:cartesia').row()
    .text(`${mark('deepgram')}🎙️ Deepgram ${stat(hasDeepgramKey)}`, 'settings:tts:deepgram').row()
    .text(`${mark('playht')}🎵 PlayHT ${stat(hasPlayHTKey)}`, 'settings:tts:playht').row()
    .text(`${mark('google')}🌐 Google TTS ${stat(hasGoogleKey)}`, 'settings:tts:google').row()
    .text('⬅️ Back', 'menu:settings');
}

// =====================
// TTS Voice Settings (routes to correct provider)
// =====================

export function ttsVoiceSettingsKeyboard(provider: 'piper' | 'elevenlabs', hasApiKey: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (provider === 'piper') {
    kb.text('🎙️ Select Piper Voice', 'settings:pipervoices').row();
  } else {
    if (hasApiKey) {
      kb.text('🎙️ Select ElevenLabs Voice', 'settings:voice').row();
    }
    kb.text('🔑 ' + (hasApiKey ? 'Update' : 'Set') + ' API Key', 'settings:apikey').row();
  }

  kb.text('⬅️ Back', 'menu:settings');
  return kb;
}

// =====================
// Piper Voice Selection
// =====================

export interface PiperVoiceInfo {
  id: string;
  name: string;
  gender: string;
  quality: string;
}

export function piperVoiceKeyboard(voices: PiperVoiceInfo[], currentVoice: string, page: number = 0): InlineKeyboard {
  const kb = new InlineKeyboard();
  const pageSize = 8;
  const start = page * pageSize;
  const pageVoices = voices.slice(start, start + pageSize);

  for (const voice of pageVoices) {
    const mark = voice.id === currentVoice ? '✓ ' : '';
    const genderIcon = voice.gender === 'female' ? '♀️' : voice.gender === 'male' ? '♂️' : '🔊';
    // Shorten the display name
    const shortName = voice.id.replace('en_US-', 'US: ').replace('en_GB-', 'UK: ').replace('-medium', '');
    kb.text(`${mark}${genderIcon} ${shortName}`, `settings:pipervoice:${voice.id}`).row();
  }

  // Pagination
  const hasPrev = page > 0;
  const hasNext = start + pageSize < voices.length;

  if (hasPrev || hasNext) {
    if (hasPrev) {
      kb.text('⬅️ Prev', `settings:pipervoices:${page - 1}`);
    }
    if (hasNext) {
      kb.text('➡️ Next', `settings:pipervoices:${page + 1}`);
    }
    kb.row();
  }

  kb.text('⬅️ Back', 'settings:voice');

  return kb;
}

export function adminsKeyboard(admins: Array<{ telegramId: number; username: string | null }>): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const admin of admins) {
    const label = admin.username ? `@${admin.username}` : admin.telegramId.toString();
    kb.text(`👤 ${label}`, `settings:admin:view:${admin.telegramId}`).row();
  }

  kb.text('➕ Add Admin', 'settings:admin:add').row();
  kb.text('⬅️ Back', 'menu:settings');

  return kb;
}

// =====================
// Confirmation
// =====================

export function confirmKeyboard(action: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${action}`)
    .text('❌ Cancel', 'cancel');
}

// =====================
// Cancel
// =====================

export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', 'cancel');
}

// =====================
// DTMF Keys Selection
// =====================

export function dtmfKeysKeyboard(usedKeys: string[], menuId: string): InlineKeyboard {
  const allKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];
  const availableKeys = allKeys.filter((k) => !usedKeys.includes(k));

  const kb = new InlineKeyboard();

  // Show keys in rows of 3
  for (let i = 0; i < availableKeys.length; i += 3) {
    const row = availableKeys.slice(i, i + 3);
    for (const key of row) {
      kb.text(`🔢 ${key}`, `ivr:key:${menuId}:${key}`);
    }
    kb.row();
  }

  kb.text('❌ Cancel', `ivr:options:${menuId}`);

  return kb;
}

// =====================
// Voice Selection
// =====================

export function voiceSelectionKeyboard(
  voices: Array<{ voice_id: string; name: string }>,
  callbackPrefix: string
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const voice of voices.slice(0, 10)) { // Limit to 10 voices
    kb.text(`🎙️ ${voice.name}`, `${callbackPrefix}:${voice.voice_id}`).row();
  }

  kb.text('❌ Cancel', 'cancel');

  return kb;
}

// =====================
// IVR Menu Selection (for routing)
// =====================

export function menuSelectionKeyboard(menus: IVRMenu[], callbackPrefix: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const menu of menus) {
    kb.text(`📞 ${menu.name}`, `${callbackPrefix}:${menu.id}`).row();
  }

  kb.text('❌ Cancel', 'cancel');

  return kb;
}

// =====================
// Extension Selection
// =====================

export function extensionSelectionKeyboard(extensions: Extension[], callbackPrefix: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const ext of extensions) {
    kb.text(`📱 ${ext.number} - ${ext.name}`, `${callbackPrefix}:${ext.number}`).row();
  }

  kb.text('❌ Cancel', 'cancel');

  return kb;
}

// =====================
// IVR Settings
// =====================

export function ivrSettingsKeyboard(menuId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('⏱️ Timeout', `ivr:setting:timeout:${menuId}`)
    .text('🔄 Max Retries', `ivr:setting:retries:${menuId}`).row()
    .text('⬅️ Back', `ivr:view:${menuId}`);
}

// =====================
// Dialer Campaigns
// =====================

export function dialerMenuKeyboard(campaigns: DialerCampaign[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Show running campaigns first
  const running = campaigns.filter(c => c.status === 'running');
  const paused = campaigns.filter(c => c.status === 'paused');
  const completed = campaigns.filter(c => c.status === 'completed');

  for (const campaign of running) {
    kb.text(`▶️ ${campaign.name} (${campaign.press1Count} leads)`, `dialer:view:${campaign.id}`).row();
  }

  for (const campaign of paused) {
    kb.text(`⏸️ ${campaign.name}`, `dialer:view:${campaign.id}`).row();
  }

  // Show only recent completed campaigns
  for (const campaign of completed.slice(0, 3)) {
    kb.text(`✅ ${campaign.name}`, `dialer:view:${campaign.id}`).row();
  }

  kb.text('➕ Create Campaign', 'dialer:create').row();
  if (completed.length > 3) {
    kb.text('📋 View All Campaigns', 'dialer:history').row();
  }
  kb.text('⬅️ Back', 'menu:main');

  return kb;
}

export function dialerCampaignDetailKeyboard(campaignId: string, status: CampaignStatus): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Control buttons based on status
  if (status === 'paused') {
    kb.text('▶️ Start Campaign', `dialer:start:${campaignId}`).row();
  } else if (status === 'running') {
    kb.text('⏸️ Pause Campaign', `dialer:pause:${campaignId}`).row();
  }

  if (status !== 'completed') {
    kb.text('⏹️ Stop Campaign', `dialer:stop:${campaignId}`).row();
  }

  kb.text('📊 View Stats', `dialer:stats:${campaignId}`)
    .text('📋 View Contacts', `dialer:contacts:${campaignId}`).row();

  if (status === 'paused') {
    kb.text('📤 Upload More Contacts', `dialer:upload:${campaignId}`).row();
    kb.text('⚙️ Settings', `dialer:settings:${campaignId}`).row();
  }

  kb.text('🗑️ Delete', `dialer:delete:${campaignId}`).row();
  kb.text('⬅️ Back', 'menu:dialer');

  return kb;
}

export function dialerCampaignSettingsKeyboard(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📞 IVR Menu', `dialer:set:ivr:${campaignId}`)
    .text('🎯 Transfer Mode', `dialer:set:transfer:${campaignId}`).row()
    .text('🎵 Hold Music', `dialer:set:holdmusic:${campaignId}`)
    .text('⏱️ Calls/Min', `dialer:set:rate:${campaignId}`).row()
    .text('📞 Max Concurrent', `dialer:set:concurrent:${campaignId}`)
    .text('🔄 Retry Attempts', `dialer:set:retries:${campaignId}`).row()
    .text('⏰ Retry Delay', `dialer:set:delay:${campaignId}`).row()
    .text('⬅️ Back', `dialer:view:${campaignId}`);
}

export function dialerContactsKeyboard(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📤 Upload More', `dialer:upload:${campaignId}`).row()
    .text('⬅️ Back', `dialer:view:${campaignId}`);
}

export function dialerRateKeyboard(campaignId: string, currentRate?: number): InlineKeyboard {
  const mark = (rate: number) => rate === currentRate ? '✓ ' : '';
  return new InlineKeyboard()
    .text(`${mark(1)}1/min`, `dialer:setrate:${campaignId}:1`)
    .text(`${mark(2)}2/min`, `dialer:setrate:${campaignId}:2`)
    .text(`${mark(3)}3/min`, `dialer:setrate:${campaignId}:3`).row()
    .text(`${mark(5)}5/min`, `dialer:setrate:${campaignId}:5`)
    .text(`${mark(10)}10/min`, `dialer:setrate:${campaignId}:10`).row()
    .text('❌ Cancel', `dialer:settings:${campaignId}`);
}

export function dialerConcurrentKeyboard(campaignId: string, currentConcurrent?: number): InlineKeyboard {
  const mark = (val: number) => val === currentConcurrent ? '✓ ' : '';
  return new InlineKeyboard()
    .text(`${mark(1)}1`, `dialer:setconcurrent:${campaignId}:1`)
    .text(`${mark(2)}2`, `dialer:setconcurrent:${campaignId}:2`)
    .text(`${mark(3)}3`, `dialer:setconcurrent:${campaignId}:3`).row()
    .text(`${mark(5)}5`, `dialer:setconcurrent:${campaignId}:5`)
    .text(`${mark(10)}10`, `dialer:setconcurrent:${campaignId}:10`).row()
    .text('❌ Cancel', `dialer:settings:${campaignId}`);
}

export function dialerHoldMusicKeyboard(campaignId: string, prompts: Prompt[], currentPromptId: string | null): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Option to remove hold music
  if (currentPromptId) {
    kb.text('🚫 No Hold Music', `dialer:setholdmusic:${campaignId}:none`).row();
  }

  // Show available prompts as options
  for (const prompt of prompts.slice(0, 8)) {
    const mark = prompt.id === currentPromptId ? '✓ ' : '';
    kb.text(`${mark}🎵 ${prompt.name}`, `dialer:setholdmusic:${campaignId}:${prompt.id}`).row();
  }

  // Option to upload new hold music
  kb.text('📤 Upload New Audio', `dialer:uploadholdmusic:${campaignId}`).row();
  kb.text('❌ Cancel', `dialer:settings:${campaignId}`);

  return kb;
}

export function ivrTrunkSelectionKeyboard(menuId: string, keyPress: string, trunks: SIPTrunk[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const trunk of trunks.slice(0, 10)) {
    kb.text(`🌐 ${trunk.name}`, `ivr:settrunk:${menuId}:${keyPress}:${trunk.id}`).row();
  }

  kb.text('❌ Cancel', `ivr:options:${menuId}`);
  return kb;
}

export function dialerTransferModeKeyboard(campaignId: string, currentMode: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      `${currentMode === 'internal' ? '✓ ' : ''}📱 Internal Extensions`,
      `dialer:settransfer:${campaignId}:internal`
    ).row()
    .text(
      `${currentMode === 'trunk' ? '✓ ' : ''}☁️ 3CX / External Trunk`,
      `dialer:settransfer:${campaignId}:trunk`
    ).row()
    .text('❌ Cancel', `dialer:settings:${campaignId}`);
}

export function dialerTrunkSelectionKeyboard(campaignId: string, trunks: SIPTrunk[], currentTrunkId: string | null): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const trunk of trunks.slice(0, 10)) {
    const mark = trunk.id === currentTrunkId ? '✓ ' : '';
    kb.text(`${mark}🌐 ${trunk.name}`, `dialer:settrunk:${campaignId}:${trunk.id}`).row();
  }

  kb.text('❌ Cancel', `dialer:set:transfer:${campaignId}`);
  return kb;
}
