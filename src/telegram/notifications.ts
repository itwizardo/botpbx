import { Bot, Api, RawApi, Context } from 'grammy';
import { DialerCampaign, CampaignContact, ContactStatus } from '../models/types';
import { SettingsRepository } from '../db/repositories/settingsRepository';
import { telegramLogger } from '../utils/logger';

// Generic bot type that works with any context
type AnyBot = Bot<any, Api<RawApi>>;

/**
 * Send a lead alert to all admins when someone presses 1
 */
export async function sendLeadAlert(
  bot: AnyBot,
  settingsRepo: SettingsRepository,
  campaign: DialerCampaign,
  contact: CampaignContact,
  status: ContactStatus
): Promise<void> {
  const admins = await settingsRepo.getAllAdmins();

  if (admins.length === 0) {
    telegramLogger.warn('No admins to send lead alert to');
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let emoji = '🔔';
  let statusText = 'LEAD';

  if (status === 'connected') {
    emoji = '✅';
    statusText = 'CONNECTED';
  } else if (status === 'press1') {
    emoji = '🔥';
    statusText = 'HOT LEAD';
  }

  const message =
    `${emoji} *${statusText} ALERT!*\n\n` +
    `📞 \`${contact.phoneNumber}\`\n` +
    `${contact.name ? `👤 ${contact.name}\n` : ''}` +
    `📋 Campaign: ${campaign.name}\n` +
    `⏰ ${timeStr}\n` +
    `${status === 'connected' ? `\n✅ Connected to agent` : `\n🔄 Connecting to extensions...`}`;

  for (const admin of admins) {
    try {
      await bot.api.sendMessage(admin.telegramId, message, {
        parse_mode: 'Markdown',
      });
      telegramLogger.debug(`Lead alert sent to admin ${admin.telegramId}`);
    } catch (error) {
      telegramLogger.error(`Failed to send lead alert to ${admin.telegramId}:`, error);
    }
  }
}

/**
 * Send campaign status notification
 */
export async function sendCampaignNotification(
  bot: AnyBot,
  settingsRepo: SettingsRepository,
  campaign: DialerCampaign,
  action: 'started' | 'paused' | 'completed' | 'stopped'
): Promise<void> {
  const admins = await settingsRepo.getAllAdmins();

  if (admins.length === 0) return;

  let emoji = '📢';
  let statusText = action.toUpperCase();

  switch (action) {
    case 'started':
      emoji = '▶️';
      break;
    case 'paused':
      emoji = '⏸️';
      break;
    case 'completed':
      emoji = '🏁';
      break;
    case 'stopped':
      emoji = '⏹️';
      break;
  }

  const message =
    `${emoji} *Campaign ${statusText}*\n\n` +
    `📋 ${campaign.name}\n` +
    `📊 Stats:\n` +
    `  • Dialed: ${campaign.dialedCount}\n` +
    `  • Answered: ${campaign.answeredCount}\n` +
    `  • Press 1: ${campaign.press1Count}\n` +
    `  • Connected: ${campaign.connectedCount}`;

  for (const admin of admins) {
    try {
      await bot.api.sendMessage(admin.telegramId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      telegramLogger.error(`Failed to send campaign notification to ${admin.telegramId}:`, error);
    }
  }
}

/**
 * Send daily campaign summary
 */
export async function sendDailySummary(
  bot: AnyBot,
  settingsRepo: SettingsRepository,
  campaigns: DialerCampaign[]
): Promise<void> {
  const admins = await settingsRepo.getAllAdmins();

  if (admins.length === 0 || campaigns.length === 0) return;

  let totalDialed = 0;
  let totalAnswered = 0;
  let totalPress1 = 0;
  let totalConnected = 0;

  let campaignLines: string[] = [];

  for (const campaign of campaigns) {
    totalDialed += campaign.dialedCount;
    totalAnswered += campaign.answeredCount;
    totalPress1 += campaign.press1Count;
    totalConnected += campaign.connectedCount;

    const convRate = campaign.dialedCount > 0
      ? ((campaign.press1Count / campaign.dialedCount) * 100).toFixed(1)
      : '0';

    campaignLines.push(`• ${campaign.name}: ${campaign.dialedCount} dialed, ${campaign.press1Count} leads (${convRate}%)`);
  }

  const overallRate = totalDialed > 0
    ? ((totalPress1 / totalDialed) * 100).toFixed(1)
    : '0';

  const message =
    `📊 *Daily Campaign Summary*\n\n` +
    `📞 Total Dialed: ${totalDialed}\n` +
    `✅ Total Answered: ${totalAnswered}\n` +
    `🔥 Total Leads (Press 1): ${totalPress1}\n` +
    `🤝 Total Connected: ${totalConnected}\n` +
    `📈 Conversion Rate: ${overallRate}%\n\n` +
    `*By Campaign:*\n${campaignLines.join('\n')}`;

  for (const admin of admins) {
    try {
      await bot.api.sendMessage(admin.telegramId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      telegramLogger.error(`Failed to send daily summary to ${admin.telegramId}:`, error);
    }
  }
}
