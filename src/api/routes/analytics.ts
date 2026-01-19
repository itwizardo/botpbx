import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

export function registerAnalyticsRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Dashboard summary
  server.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const todayStats = await ctx.callLogRepo.getTodayStats();
    const recordingStats = {
      count: await ctx.recordingRepo.count(),
      totalSize: await ctx.recordingRepo.getTotalSize(),
    };

    const runningCampaigns = await ctx.campaignRepo.findByStatus('running');
    const totalCampaigns = await ctx.campaignRepo.count();

    const connectedClients = ctx.wsManager.getConnectedCount();

    return {
      calls: {
        today: todayStats.totalCalls,
        answered: todayStats.answeredCalls,
        abandoned: todayStats.abandonedCalls,
        averageDuration: todayStats.averageDuration,
      },
      recordings: recordingStats,
      campaigns: {
        running: runningCampaigns.length,
        total: totalCampaigns,
      },
      system: {
        connectedClients,
        uptime: process.uptime(),
      },
    };
  });

  // Hourly call stats (last 24 hours)
  server.get('/calls/hourly', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    // Use UTC to avoid timezone issues
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = Math.floor(Date.now() / 1000);

    const stats = await ctx.callLogRepo.getStats(startTimestamp, endTimestamp, true);

    // Fill in missing hours
    const hourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      hourlyData.push({
        hour,
        calls: stats.callsByHour[hour] || 0,
      });
    }

    return { data: hourlyData };
  });

  // Daily call stats (last N days)
  server.get('/calls/daily', async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '7' } = request.query as { days?: string };
    const daysNum = Math.min(parseInt(days, 10) || 7, 30);

    const dailyStats = await ctx.callLogRepo.getDailyStats(daysNum);

    return { data: dailyStats };
  });

  // DTMF distribution
  server.get('/calls/dtmf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '7' } = request.query as { days?: string };
    const daysNum = Math.min(parseInt(days, 10) || 7, 30);

    const now = Date.now();
    const startTimestamp = Math.floor(now / 1000) - daysNum * 86400;
    const endTimestamp = Math.floor(now / 1000);

    const stats = await ctx.callLogRepo.getStats(startTimestamp, endTimestamp);

    // Convert to array format
    const dtmfData = Object.entries(stats.dtmfDistribution).map(([key, count]) => ({
      key,
      count,
    }));

    return { data: dtmfData };
  });

  // Campaign performance
  server.get('/campaigns/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await ctx.campaignRepo.findAll();

    const performance = await Promise.all(campaigns.map(async (campaign) => {
      const contactStats = await ctx.campaignContactRepo.countByStatus(campaign.id);
      const answerRate = campaign.dialedCount > 0
        ? Math.round((campaign.answeredCount / campaign.dialedCount) * 100)
        : 0;
      const connectRate = campaign.answeredCount > 0
        ? Math.round((campaign.connectedCount / campaign.answeredCount) * 100)
        : 0;

      // Calculate completed (all terminal states except pending and failed)
      const completed = (contactStats.answered || 0) +
                        (contactStats.connected || 0) +
                        (contactStats.press1 || 0) +
                        (contactStats.no_answer || 0) +
                        (contactStats.busy || 0) +
                        (contactStats.answering_machine || 0);

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        dialedCount: campaign.dialedCount,
        answeredCount: campaign.answeredCount,
        press1Count: campaign.press1Count,
        connectedCount: campaign.connectedCount,
        answerRate,
        connectRate,
        pending: contactStats.pending || 0,
        completed,
        failed: contactStats.failed || 0,
      };
    }));

    return { data: performance };
  });

  // IVR menu usage
  server.get('/ivr/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    const { days = '7' } = request.query as { days?: string };
    const daysNum = Math.min(parseInt(days, 10) || 7, 30);

    const now = Date.now();
    const startTimestamp = Math.floor(now / 1000) - daysNum * 86400;
    const endTimestamp = Math.floor(now / 1000);

    const stats = await ctx.callLogRepo.getStats(startTimestamp, endTimestamp);
    const menus = await ctx.ivrMenuRepo.findAll();

    // Map menu IDs to names
    const menuMap = new Map(menus.map((m) => [m.id, m.name]));

    const usage = Object.entries(stats.callsByMenu).map(([menuId, count]) => ({
      menuId,
      menuName: menuMap.get(menuId) || 'Unknown',
      calls: count,
    }));

    return { data: usage };
  });
}
