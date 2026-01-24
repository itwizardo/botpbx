import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: 'online' | 'offline' | 'active' | 'inactive' | 'paused';
  url: string;
}

interface SearchResponse {
  query: string;
  results: {
    extensions: SearchResult[];
    contacts: SearchResult[];
    trunks: SearchResult[];
    ivr: SearchResult[];
    prompts: SearchResult[];
    ringGroups: SearchResult[];
    queues: SearchResult[];
    aiAgents: SearchResult[];
    recordings: SearchResult[];
    campaigns: SearchResult[];
    pages: SearchResult[];
  };
  counts: {
    extensions: number;
    contacts: number;
    trunks: number;
    ivr: number;
    prompts: number;
    ringGroups: number;
    queues: number;
    aiAgents: number;
    recordings: number;
    campaigns: number;
    pages: number;
    total: number;
  };
}

// Static page navigation items
const PAGES = [
  { id: 'dashboard', title: 'Dashboard', url: '/' },
  { id: 'calls', title: 'Calls', url: '/calls' },
  { id: 'recordings', title: 'Recordings', url: '/recordings' },
  { id: 'voicemails', title: 'Voicemails', url: '/voicemails' },
  { id: 'ivr', title: 'IVR Menus', url: '/ivr' },
  { id: 'extensions', title: 'Extensions', url: '/extensions' },
  { id: 'ring-groups', title: 'Ring Groups', url: '/ring-groups' },
  { id: 'queues', title: 'Queues', url: '/queues' },
  { id: 'trunks', title: 'Trunks', url: '/trunks' },
  { id: 'routes', title: 'Routes', url: '/routes' },
  { id: 'contacts', title: 'Contacts', url: '/contacts' },
  { id: 'campaigns', title: 'Campaigns', url: '/campaigns' },
  { id: 'ai-agents', title: 'AI Agents', url: '/ai-agents' },
  { id: 'prompts', title: 'Prompts', url: '/prompts' },
  { id: 'analytics', title: 'Analytics', url: '/analytics' },
  { id: 'settings', title: 'Settings', url: '/settings' },
  { id: 'ai-providers', title: 'AI Providers', url: '/settings/ai-providers' },
  { id: 'system', title: 'System', url: '/system' },
];

export function registerSearchRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Global search endpoint
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, types, limit = '5' } = request.query as { q?: string; types?: string; limit?: string };

    if (!q || q.trim().length === 0) {
      return {
        query: '',
        results: {
          extensions: [],
          contacts: [],
          trunks: [],
          ivr: [],
          prompts: [],
          ringGroups: [],
          queues: [],
          aiAgents: [],
          recordings: [],
          campaigns: [],
          pages: [],
        },
        counts: {
          extensions: 0,
          contacts: 0,
          trunks: 0,
          ivr: 0,
          prompts: 0,
          ringGroups: 0,
          queues: 0,
          aiAgents: 0,
          recordings: 0,
          campaigns: 0,
          pages: 0,
          total: 0,
        },
      };
    }

    const query = q.trim();
    const searchLimit = Math.min(parseInt(limit, 10) || 5, 20);
    const searchPattern = `%${query}%`;

    // Parse types filter
    const typeFilter = types ? types.split(',').map(t => t.trim().toLowerCase()) : null;
    const shouldSearch = (type: string) => !typeFilter || typeFilter.includes(type);

    const results: SearchResponse['results'] = {
      extensions: [],
      contacts: [],
      trunks: [],
      ivr: [],
      prompts: [],
      ringGroups: [],
      queues: [],
      aiAgents: [],
      recordings: [],
      campaigns: [],
      pages: [],
    };

    // Search pages (static, client-side filter)
    if (shouldSearch('pages')) {
      results.pages = PAGES
        .filter(p => p.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, searchLimit)
        .map(p => ({
          id: p.id,
          type: 'page',
          title: p.title,
          url: p.url,
        }));
    }

    // Search extensions (columns: number, name, enabled)
    if (shouldSearch('extensions')) {
      try {
        const extensions = await ctx.db.all<{
          number: string;
          name: string;
          enabled: boolean;
        }>(`
          SELECT number, name, enabled
          FROM extensions
          WHERE number ILIKE $1 OR name ILIKE $1
          ORDER BY number
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.extensions = extensions.map(ext => ({
          id: ext.number,
          type: 'extension',
          title: `${ext.number} - ${ext.name}`,
          status: ext.enabled ? 'active' : 'inactive',
          url: `/extensions?id=${ext.number}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search extensions failed');
      }
    }

    // Search contacts (columns: id, phone_number, name, company)
    if (shouldSearch('contacts')) {
      try {
        const contacts = await ctx.db.all<{
          id: string;
          name: string | null;
          phone_number: string;
          company: string | null;
        }>(`
          SELECT id, name, phone_number, company
          FROM contacts
          WHERE name ILIKE $1 OR phone_number ILIKE $1 OR company ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.contacts = contacts.map(c => ({
          id: c.id,
          type: 'contact',
          title: c.name || c.phone_number,
          subtitle: c.company || c.phone_number,
          url: `/contacts?id=${c.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search contacts failed');
      }
    }

    // Search trunks (columns: id, name, username, enabled)
    if (shouldSearch('trunks')) {
      try {
        const trunks = await ctx.db.all<{
          id: string;
          name: string;
          username: string | null;
          enabled: boolean;
        }>(`
          SELECT id, name, username, enabled
          FROM sip_trunks
          WHERE name ILIKE $1 OR username ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.trunks = trunks.map(t => ({
          id: t.id,
          type: 'trunk',
          title: t.name,
          subtitle: t.username || undefined,
          status: t.enabled ? 'active' : 'inactive',
          url: `/trunks?id=${t.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search trunks failed');
      }
    }

    // Search IVR menus (columns: id, name)
    if (shouldSearch('ivr')) {
      try {
        const ivrMenus = await ctx.db.all<{
          id: string;
          name: string;
        }>(`
          SELECT id, name
          FROM ivr_menus
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.ivr = ivrMenus.map(m => ({
          id: m.id,
          type: 'ivr',
          title: m.name,
          url: `/ivr?id=${m.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search IVR failed');
      }
    }

    // Search prompts (columns: id, name, type)
    if (shouldSearch('prompts')) {
      try {
        const prompts = await ctx.db.all<{
          id: string;
          name: string;
          type: string;
        }>(`
          SELECT id, name, type
          FROM prompts
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.prompts = prompts.map(p => ({
          id: p.id,
          type: 'prompt',
          title: p.name,
          subtitle: p.type,
          url: `/prompts?id=${p.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search prompts failed');
      }
    }

    // Search ring groups (columns: id, name, strategy)
    if (shouldSearch('ringgroups')) {
      try {
        const ringGroups = await ctx.db.all<{
          id: string;
          name: string;
          strategy: string;
        }>(`
          SELECT id, name, strategy
          FROM ring_groups
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.ringGroups = ringGroups.map(rg => ({
          id: rg.id,
          type: 'ringGroup',
          title: rg.name,
          subtitle: rg.strategy,
          url: `/ring-groups?id=${rg.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search ring groups failed');
      }
    }

    // Search queues (columns: id, name, strategy)
    if (shouldSearch('queues')) {
      try {
        const queues = await ctx.db.all<{
          id: string;
          name: string;
          strategy: string;
        }>(`
          SELECT id, name, strategy
          FROM queues
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.queues = queues.map(q => ({
          id: q.id,
          type: 'queue',
          title: q.name,
          subtitle: q.strategy,
          url: `/queues?id=${q.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search queues failed');
      }
    }

    // Search AI agents (columns: id, name, voice_provider, enabled)
    if (shouldSearch('aiagents')) {
      try {
        const agents = await ctx.db.all<{
          id: string;
          name: string;
          voice_provider: string | null;
          enabled: boolean;
        }>(`
          SELECT id, name, voice_provider, enabled
          FROM ai_agents
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.aiAgents = agents.map(a => ({
          id: a.id,
          type: 'aiAgent',
          title: a.name,
          subtitle: a.voice_provider || undefined,
          status: a.enabled ? 'active' : 'inactive',
          url: `/ai-agents?id=${a.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search AI agents failed');
      }
    }

    // Search campaigns (columns: id, name, status)
    if (shouldSearch('campaigns')) {
      try {
        const campaigns = await ctx.db.all<{
          id: string;
          name: string;
          status: string;
        }>(`
          SELECT id, name, status
          FROM dialer_campaigns
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT $2
        `, [searchPattern, searchLimit]);

        results.campaigns = campaigns.map(c => ({
          id: c.id,
          type: 'campaign',
          title: c.name,
          status: c.status === 'running' ? 'active' : c.status === 'paused' ? 'paused' : 'inactive',
          url: `/campaigns?id=${c.id}`,
        }));
      } catch (error) {
        request.log.error(error, 'Search campaigns failed');
      }
    }

    // Note: recordings table doesn't exist in this schema
    // Results for recordings will always be empty

    // Calculate counts
    const counts = {
      extensions: results.extensions.length,
      contacts: results.contacts.length,
      trunks: results.trunks.length,
      ivr: results.ivr.length,
      prompts: results.prompts.length,
      ringGroups: results.ringGroups.length,
      queues: results.queues.length,
      aiAgents: results.aiAgents.length,
      recordings: results.recordings.length,
      campaigns: results.campaigns.length,
      pages: results.pages.length,
      total: 0,
    };
    counts.total = Object.values(counts).reduce((a, b) => a + b, 0) - counts.total;

    return {
      query,
      results,
      counts,
    };
  });
}
