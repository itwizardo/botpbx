/**
 * AI Agents API Routes (Fastify)
 * CRUD operations for AI agents and AI call management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { ApiContext } from '../server';

interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  greeting_text: string;
  voice_provider: string;
  voice_id: string;
  language: string;
  llm_provider: string;
  llm_model: string;
  stt_provider: string;
  enabled_functions: string | null;
  enabled: number;
  use_realtime: number;
  flow_enabled: number;
  flow_data: string | null;
  created_at: number;
  // ElevenLabs specific fields
  elevenlabs_voice_id: string | null;
  elevenlabs_model: string | null;
}

interface FlowData {
  version: '1.0';
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
}

// Voice provider options
type VoiceProvider = 'openai_realtime' | 'elevenlabs_full';
type ElevenLabsModel = 'eleven_flash_v2_5' | 'eleven_turbo_v2_5' | 'eleven_multilingual_v2' | 'eleven_monolingual_v1';

// Simplified interface for OpenAI Realtime API (AsteriskVoiceBridge)
interface CreateAgentBody {
  name: string;
  systemPrompt: string;
  greetingText: string;
  voice: string;  // OpenAI Realtime voice: alloy, ash, ballad, coral, echo, sage, shimmer, verse
  language?: string;
  enabledFunctions?: string[];
  enabled?: boolean;
  // Voice provider selection
  voiceProvider?: VoiceProvider;
  // ElevenLabs specific fields (required when voiceProvider is 'elevenlabs_full')
  elevenLabsVoiceId?: string;
  elevenLabsModel?: ElevenLabsModel;
  // LLM settings for ElevenLabs mode
  llmProvider?: string;
  llmModel?: string;
  // Legacy fields (optional, for backwards compatibility)
  voiceId?: string;
  sttProvider?: string;
  useRealtime?: boolean;
}

interface UpdateAgentBody {
  name?: string;
  systemPrompt?: string;
  greetingText?: string;
  voice?: string;  // OpenAI Realtime voice
  language?: string;
  enabledFunctions?: string[];
  enabled?: boolean;
  // Voice provider selection
  voiceProvider?: VoiceProvider;
  // ElevenLabs specific fields
  elevenLabsVoiceId?: string;
  elevenLabsModel?: ElevenLabsModel;
  // LLM settings
  llmProvider?: string;
  llmModel?: string;
  // Legacy fields (optional)
  voiceId?: string;
  sttProvider?: string;
  useRealtime?: boolean;
}

interface OutboundCallBody {
  agentId: string;
  phoneNumber: string;
  callerIdNumber?: string;
  callerIdName?: string;
  trunkId?: string;  // Optional: Specify which trunk to use
  variables?: Record<string, string>;
}

function transformAgent(agent: AIAgent) {
  // Return simplified structure for OpenAI Realtime API (AsteriskVoiceBridge)
  let flowData = null;
  try {
    if (agent.flow_data) {
      flowData = JSON.parse(agent.flow_data);
    }
  } catch {
    flowData = null;
  }

  return {
    id: agent.id,
    name: agent.name,
    systemPrompt: agent.system_prompt,
    greetingText: agent.greeting_text,
    voice: agent.voice_id,  // voice_id contains the OpenAI Realtime voice name
    voiceProvider: agent.voice_provider || 'openai_realtime',
    language: agent.language,
    // ElevenLabs specific fields
    elevenLabsVoiceId: agent.elevenlabs_voice_id,
    elevenLabsModel: agent.elevenlabs_model || 'eleven_flash_v2_5',
    // LLM settings
    llmProvider: agent.llm_provider,
    llmModel: agent.llm_model,
    enabledFunctions: agent.enabled_functions ? JSON.parse(agent.enabled_functions) : [],
    enabled: Boolean(agent.enabled),  // Convert integer (0/1) to boolean
    flowEnabled: agent.flow_enabled || 0,
    flowData,
    createdAt: agent.created_at,
  };
}

export function registerAIAgentRoutes(server: FastifyInstance, ctx: ApiContext) {
  // GET /api/v1/ai/agents - List all AI agents
  server.get('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agents = await ctx.db.all<AIAgent>('SELECT * FROM ai_agents ORDER BY created_at DESC');
      return { success: true, data: agents.map(transformAgent) };
    } catch (error) {
      request.log.error(error, 'Failed to list AI agents');
      return reply.status(500).send({ success: false, error: 'Failed to list AI agents' });
    }
  });

  // GET /api/v1/ai/agents/:id - Get a single AI agent
  server.get('/agents/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const agent = await ctx.db.get<AIAgent>('SELECT * FROM ai_agents WHERE id = $1', [id]);

      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      return { success: true, data: transformAgent(agent) };
    } catch (error) {
      request.log.error(error, 'Failed to get AI agent');
      return reply.status(500).send({ success: false, error: 'Failed to get AI agent' });
    }
  });

  // POST /api/v1/ai/agents - Create a new AI agent
  server.post('/agents', async (request: FastifyRequest<{ Body: CreateAgentBody }>, reply: FastifyReply) => {
    try {
      const {
        name,
        systemPrompt,
        greetingText,
        voice,  // OpenAI Realtime voice name
        language = 'en',
        enabledFunctions = [],
        enabled = true,
        voiceProvider = 'openai_realtime',
        elevenLabsVoiceId,
        elevenLabsModel = 'eleven_flash_v2_5',
        llmProvider = 'openai',
        llmModel,
      } = request.body;

      // Accept either 'voice' or legacy 'voiceId'
      const voiceValue = voice || request.body.voiceId;

      // Validate based on voice provider
      if (voiceProvider === 'elevenlabs_full') {
        if (!elevenLabsVoiceId) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required field: elevenLabsVoiceId (required for ElevenLabs provider)',
          });
        }
      } else {
        if (!voiceValue) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: name, systemPrompt, greetingText, voice',
          });
        }
      }

      if (!name || !systemPrompt || !greetingText) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: name, systemPrompt, greetingText',
        });
      }

      const id = uuidv4();
      const createdAt = new Date().toISOString();

      // Determine STT provider based on voice provider
      const sttProvider = voiceProvider === 'elevenlabs_full' ? 'elevenlabs_scribe' : 'openai_realtime';
      const actualLlmModel = llmModel || (voiceProvider === 'elevenlabs_full' ? 'gpt-4o' : 'gpt-4o-realtime');

      await ctx.db.run(`
        INSERT INTO ai_agents (
          id, name, system_prompt, greeting_text, voice_provider, voice_id,
          language, llm_provider, llm_model, stt_provider, enabled_functions, enabled, use_realtime,
          elevenlabs_voice_id, elevenlabs_model, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        id,
        name,
        systemPrompt,
        greetingText,
        voiceProvider,
        voiceValue || 'alloy', // Default for ElevenLabs mode
        language,
        llmProvider,
        actualLlmModel,
        sttProvider,
        JSON.stringify(enabledFunctions),
        enabled,
        true,  // Always use realtime mode
        elevenLabsVoiceId || null,
        elevenLabsModel,
        createdAt
      ]);

      return reply.status(201).send({
        success: true,
        data: {
          id,
          name,
          systemPrompt,
          greetingText,
          voice: voiceValue,
          voiceProvider,
          elevenLabsVoiceId,
          elevenLabsModel,
          llmProvider,
          llmModel: actualLlmModel,
          language,
          enabledFunctions,
          enabled,
          createdAt,
        },
      });
    } catch (error: any) {
      request.log.error(error, 'Failed to create AI agent');

      // Provide more specific error messages
      let errorMessage = 'Failed to create AI agent';
      if (error.message?.includes('UNIQUE constraint')) {
        errorMessage = 'An agent with this name already exists';
      } else if (error.message?.includes('CHECK constraint')) {
        errorMessage = 'Invalid configuration value. Please check voice and provider settings.';
      } else if (error.message?.includes('NOT NULL constraint')) {
        errorMessage = 'Missing required field. Please fill in all required fields.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return reply.status(500).send({ success: false, error: errorMessage });
    }
  });

  // PUT /api/v1/ai/agents/:id - Update an AI agent
  server.put('/agents/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateAgentBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updates = request.body;

      // Check if agent exists
      const existing = await ctx.db.get<{ id: string }>('SELECT id FROM ai_agents WHERE id = $1', [id]);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      // Build update query
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      // Map simplified field names to database columns
      const fieldMap: Record<string, string> = {
        name: 'name',
        systemPrompt: 'system_prompt',
        greetingText: 'greeting_text',
        voice: 'voice_id',  // 'voice' maps to voice_id column
        voiceId: 'voice_id',  // Legacy support
        voiceProvider: 'voice_provider',
        language: 'language',
        enabledFunctions: 'enabled_functions',
        enabled: 'enabled',
        elevenLabsVoiceId: 'elevenlabs_voice_id',
        elevenLabsModel: 'elevenlabs_model',
        llmProvider: 'llm_provider',
        llmModel: 'llm_model',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if ((updates as Record<string, unknown>)[key] !== undefined) {
          // Skip if we already processed 'voice' and now see 'voiceId'
          if (key === 'voiceId' && updates.voice !== undefined) continue;

          fields.push(`${dbField} = $${paramIndex++}`);
          if (key === 'enabledFunctions') {
            values.push(JSON.stringify((updates as Record<string, unknown>)[key]));
          } else if (key === 'enabled') {
            values.push((updates as Record<string, unknown>)[key] ? 1 : 0);
          } else {
            values.push((updates as Record<string, unknown>)[key]);
          }
        }
      }

      if (fields.length === 0) {
        return reply.status(400).send({ success: false, error: 'No valid fields to update' });
      }

      values.push(id);
      await ctx.db.run(`UPDATE ai_agents SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

      // Return updated agent
      const updated = await ctx.db.get<AIAgent>('SELECT * FROM ai_agents WHERE id = $1', [id]);

      return { success: true, data: transformAgent(updated!) };
    } catch (error) {
      request.log.error(error, 'Failed to update AI agent');
      return reply.status(500).send({ success: false, error: 'Failed to update AI agent' });
    }
  });

  // DELETE /api/v1/ai/agents/:id - Delete an AI agent
  server.delete('/agents/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const existing = await ctx.db.get<{ id: string }>('SELECT id FROM ai_agents WHERE id = $1', [id]);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      await ctx.db.run('DELETE FROM ai_agents WHERE id = $1', [id]);

      return { success: true, message: 'Agent deleted' };
    } catch (error) {
      request.log.error(error, 'Failed to delete AI agent');
      return reply.status(500).send({ success: false, error: 'Failed to delete AI agent' });
    }
  });

  // ===================================================
  // Flow Builder Endpoints
  // ===================================================

  // GET /api/v1/ai/agents/:id/flow - Get agent flow data
  server.get('/agents/:id/flow', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const agent = await ctx.db.get<{ flow_enabled: number; flow_data: string | null }>(
        'SELECT flow_enabled, flow_data FROM ai_agents WHERE id = $1',
        [id]
      );

      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      let flowData = null;
      try {
        if (agent.flow_data) {
          flowData = JSON.parse(agent.flow_data);
        }
      } catch {
        flowData = null;
      }

      return {
        success: true,
        data: {
          flowEnabled: agent.flow_enabled || 0,
          flowData,
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to get agent flow');
      return reply.status(500).send({ success: false, error: 'Failed to get agent flow' });
    }
  });

  // PUT /api/v1/ai/agents/:id/flow - Save agent flow data
  server.put('/agents/:id/flow', async (request: FastifyRequest<{ Params: { id: string }; Body: { flowData: FlowData } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { flowData } = request.body;

      // Verify agent exists
      const existing = await ctx.db.get<{ id: string }>('SELECT id FROM ai_agents WHERE id = $1', [id]);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      // Validate flow data structure
      if (!flowData || !flowData.version || !Array.isArray(flowData.nodes) || !Array.isArray(flowData.edges)) {
        return reply.status(400).send({ success: false, error: 'Invalid flow data format' });
      }

      // Save flow data
      await ctx.db.run(
        'UPDATE ai_agents SET flow_data = $1 WHERE id = $2',
        [JSON.stringify(flowData), id]
      );

      // Return updated agent
      const updated = await ctx.db.get<AIAgent>('SELECT * FROM ai_agents WHERE id = $1', [id]);

      return { success: true, data: transformAgent(updated!) };
    } catch (error) {
      request.log.error(error, 'Failed to save agent flow');
      return reply.status(500).send({ success: false, error: 'Failed to save agent flow' });
    }
  });

  // PUT /api/v1/ai/agents/:id/flow/enable - Enable or disable flow mode
  server.put('/agents/:id/flow/enable', async (request: FastifyRequest<{ Params: { id: string }; Body: { enabled: boolean } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { enabled } = request.body;

      // Verify agent exists
      const existing = await ctx.db.get<{ id: string; flow_data: string | null }>(
        'SELECT id, flow_data FROM ai_agents WHERE id = $1',
        [id]
      );
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Agent not found' });
      }

      // If enabling, verify flow data exists
      if (enabled && !existing.flow_data) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot enable flow mode without flow data. Please create a flow first.',
        });
      }

      // Update flow_enabled
      await ctx.db.run(
        'UPDATE ai_agents SET flow_enabled = $1 WHERE id = $2',
        [enabled ? 1 : 0, id]
      );

      // Return updated agent
      const updated = await ctx.db.get<AIAgent>('SELECT * FROM ai_agents WHERE id = $1', [id]);

      return { success: true, data: transformAgent(updated!) };
    } catch (error) {
      request.log.error(error, 'Failed to update flow mode');
      return reply.status(500).send({ success: false, error: 'Failed to update flow mode' });
    }
  });

  // POST /api/v1/ai/agents/:id/flow/validate - Validate flow structure
  server.post('/agents/:id/flow/validate', async (request: FastifyRequest<{ Params: { id: string }; Body: { flowData: FlowData } }>, reply: FastifyReply) => {
    try {
      const { flowData } = request.body;

      const errors: { nodeId?: string; message: string; type: string }[] = [];
      const warnings: { nodeId?: string; message: string; type: string }[] = [];

      // Type the nodes and edges properly
      type FlowNodeItem = { id: string; type: string; data?: { label?: string } };
      type FlowEdgeItem = { source: string; target: string };
      const nodes = flowData.nodes as FlowNodeItem[];
      const edges = flowData.edges as FlowEdgeItem[];

      // Check for exactly one start node
      const startNodes = nodes.filter((n) => n.type === 'start');
      if (startNodes.length === 0) {
        errors.push({ message: 'Flow must have a Start node', type: 'missing_start' });
      } else if (startNodes.length > 1) {
        errors.push({ message: 'Flow can only have one Start node', type: 'missing_start' });
      }

      // Check for at least one end node
      const endNodes = nodes.filter((n) => n.type === 'end');
      if (endNodes.length === 0) {
        warnings.push({ message: 'Flow should have at least one End node', type: 'unreachable' });
      }

      // Check for orphan nodes (no incoming edges except start)
      const targetNodeIds = new Set(edges.map((e) => e.target));
      for (const node of nodes) {
        if (node.type !== 'start' && !targetNodeIds.has(node.id)) {
          warnings.push({
            nodeId: node.id,
            message: `Node "${node.data?.label || node.id}" has no incoming connections`,
            type: 'unreachable',
          });
        }
      }

      // Check for nodes with no outgoing edges (except end)
      const sourceNodeIds = new Set(edges.map((e) => e.source));
      for (const node of nodes) {
        if (node.type !== 'end' && !sourceNodeIds.has(node.id)) {
          warnings.push({
            nodeId: node.id,
            message: `Node "${node.data?.label || node.id}" has no outgoing connections`,
            type: 'no_fallback',
          });
        }
      }

      return {
        success: true,
        data: {
          valid: errors.length === 0,
          errors,
          warnings,
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to validate flow');
      return reply.status(500).send({ success: false, error: 'Failed to validate flow' });
    }
  });

  // GET /api/v1/ai/conversations - List AI conversations with pagination
  server.get('/conversations', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string; offset?: string; agentId?: string } }>, reply: FastifyReply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '25');
      const offset = request.query.offset ? parseInt(request.query.offset) : (page - 1) * limit;
      const agentId = request.query.agentId;

      // Build where clause
      let whereClause = '';
      const countParams: unknown[] = [];
      let countParamIndex = 1;

      if (agentId) {
        whereClause = ` WHERE c.ai_agent_id = $${countParamIndex++}`;
        countParams.push(agentId);
      }

      // Get total count
      const countResult = await ctx.db.get<{ count: string }>(
        `SELECT COUNT(*) as count FROM ai_conversations c${whereClause}`,
        countParams
      );
      const total = parseInt(countResult?.count || '0');

      // Get conversations
      let query = `
        SELECT c.*, a.name as agent_name
        FROM ai_conversations c
        LEFT JOIN ai_agents a ON c.ai_agent_id = a.id
        ${whereClause}
      `;
      const params = [...countParams];
      let paramIndex = countParams.length + 1;

      query += ` ORDER BY c.start_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(limit, offset);

      const conversations = await ctx.db.all(query, params);

      return {
        success: true,
        data: conversations,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      request.log.error(error, 'Failed to list conversations');
      return reply.status(500).send({ success: false, error: 'Failed to list conversations' });
    }
  });

  // GET /api/v1/ai/conversations/:id - Get a single conversation with turns
  server.get('/conversations/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const conversation = await ctx.db.get(`
        SELECT c.*, a.name as agent_name
        FROM ai_conversations c
        LEFT JOIN ai_agents a ON c.ai_agent_id = a.id
        WHERE c.id = $1
      `, [id]);

      if (!conversation) {
        return reply.status(404).send({ success: false, error: 'Conversation not found' });
      }

      const turns = await ctx.db.all(`
        SELECT * FROM ai_conversation_turns WHERE conversation_id = $1 ORDER BY turn_number ASC
      `, [id]);

      return {
        success: true,
        data: {
          ...conversation,
          turns,
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to get conversation');
      return reply.status(500).send({ success: false, error: 'Failed to get conversation' });
    }
  });

  // POST /api/v1/ai/calls/outbound - Initiate an outbound AI call
  server.post('/calls/outbound', async (request: FastifyRequest<{ Body: OutboundCallBody }>, reply: FastifyReply) => {
    try {
      const { agentId, phoneNumber, callerIdNumber, callerIdName, trunkId } = request.body;

      if (!agentId || !phoneNumber) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: agentId, phoneNumber',
        });
      }

      // Verify agent exists and get full details (including flow data and ElevenLabs settings)
      const agent = await ctx.db.get<{
        id: string;
        name: string;
        system_prompt: string;
        greeting_text: string;
        voice_provider: string;
        voice_id: string;
        language: string;
        flow_enabled: number;
        flow_data: string | null;
        elevenlabs_voice_id: string | null;
        elevenlabs_model: string | null;
        llm_provider: string;
        llm_model: string;
      }>(`
        SELECT id, name, system_prompt, greeting_text, voice_provider, voice_id, language,
               flow_enabled, flow_data, elevenlabs_voice_id, elevenlabs_model,
               llm_provider, llm_model
        FROM ai_agents WHERE id = $1 AND enabled = 1
      `, [agentId]);

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found or disabled',
          troubleshoot: ['Verify the agent exists in AI Agents settings', 'Ensure the agent is enabled']
        });
      }

      // Check if AMI is available
      if (!ctx.amiClient || !ctx.amiClient.isConnected()) {
        return reply.status(503).send({
          success: false,
          error: 'Asterisk Manager Interface (AMI) is not connected',
          troubleshoot: [
            'Verify Asterisk is running: systemctl status asterisk',
            'Check AMI credentials in /etc/asterisk/manager.conf',
            'Restart BotPBX after fixing AMI configuration'
          ]
        });
      }

      // Check if AudioSocket server is available
      if (!ctx.audioSocketServer) {
        return reply.status(503).send({
          success: false,
          error: 'AudioSocket server is not running',
          troubleshoot: [
            'Configure OpenAI API key in AI Providers settings',
            'Restart BotPBX after adding the API key',
            'AudioSocket requires OpenAI API key to initialize'
          ]
        });
      }

      // Get trunk - either specified or first enabled
      let trunk;
      if (trunkId) {
        trunk = await ctx.db.get<{ id: string; name: string; username: string; from_user: string | null }>(
          'SELECT id, name, username, from_user FROM sip_trunks WHERE id = $1 AND enabled = 1',
          [trunkId]
        );
        if (!trunk) {
          return reply.status(400).send({
            success: false,
            error: 'Specified trunk not found or not enabled',
            troubleshoot: ['Verify the trunk exists in Trunks settings', 'Ensure the trunk is enabled']
          });
        }
      } else {
        trunk = await ctx.db.get<{ id: string; name: string; username: string; from_user: string | null }>(
          'SELECT id, name, username, from_user FROM sip_trunks WHERE enabled = 1 LIMIT 1'
        );
        if (!trunk) {
          return reply.status(503).send({
            success: false,
            error: 'No enabled SIP trunk available for outbound calls',
            troubleshoot: [
              'Add a SIP trunk in Trunks settings',
              'Ensure the trunk is enabled',
              'Test calls require a trunk to route outbound calls'
            ]
          });
        }
      }

      // Generate call UUID
      const callUuid = uuidv4();

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
      };
      const realtimeVoice = voiceMap[agent.voice_id] || 'alloy';

      // Register agent config with AudioSocket server BEFORE originating the call
      ctx.audioSocketServer.registerCallConfig(callUuid, {
        agentId: agent.id,
        agentName: agent.name,
        systemPrompt: agent.system_prompt,
        greetingText: agent.greeting_text,
        voice: realtimeVoice,
        voiceProvider: agent.voice_provider,
        language: agent.language,
        flowEnabled: agent.flow_enabled,
        flowData: agent.flow_data,
        // ElevenLabs specific settings
        elevenLabsVoiceId: agent.elevenlabs_voice_id,
        elevenLabsModel: agent.elevenlabs_model,
        llmProvider: agent.llm_provider,
        llmModel: agent.llm_model,
      });

      request.log.info({ callUuid, agentId, voice: realtimeVoice, flowEnabled: agent.flow_enabled }, 'Registered agent config with AudioSocket server');

      // Build the channel string
      const trunkName = trunk.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const channel = `PJSIP/${phoneNumber}@${trunkName}`;
      const cid = callerIdNumber || trunk.from_user || trunk.username;
      const cidName = callerIdName || agent.name;

      // Store agent ID as a channel variable for the dialplan
      const variables = `AGENT_ID=${agentId},CALL_UUID=${callUuid}`;

      // Originate the call
      await ctx.amiClient.originate({
        channel,
        context: 'ai-agent-test',
        exten: 's',
        priority: 1,
        callerid: `"${cidName}" <${cid}>`,
        timeout: 30000,
        variable: variables,
      });

      request.log.info({ callUuid, agentId, phoneNumber, channel }, 'AI test call initiated');

      return {
        success: true,
        data: {
          callUuid,
          agentId,
          phoneNumber,
          status: 'initiated',
          message: 'Call initiated - you will receive a call shortly',
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to initiate AI call');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({
        success: false,
        error: `Failed to initiate call: ${errorMessage}`,
        troubleshoot: [
          'Check Asterisk is running and AMI is connected',
          'Verify the dialplan context ai-agent-test exists',
          'Check the BotPBX logs for detailed error information'
        ]
      });
    }
  });

  // GET /api/v1/ai/diagnostics - Get system diagnostics for AI calling
  server.get('/diagnostics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check AMI connection
      const amiConnected = ctx.amiClient?.isConnected() || false;

      // Check AudioSocket server
      const audioSocketRunning = !!ctx.audioSocketServer;

      // Check OpenAI API key
      const openaiKey = await ctx.settingsRepo.get('openai_api_key');
      const openaiConfigured = !!openaiKey && openaiKey.length > 0;

      // Count trunks
      const trunkCounts = await ctx.db.get<{ total: string; enabled: string }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE enabled = 1) as enabled
        FROM sip_trunks
      `);

      // Count agents
      const agentCounts = await ctx.db.get<{ total: string; enabled: string }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE enabled = 1) as enabled
        FROM ai_agents
      `);

      // Check if dialplan context exists (simple check via AMI)
      let dialplanExists = false;
      if (amiConnected && ctx.amiClient) {
        try {
          // We can't directly check dialplan, so assume it exists if AMI is connected
          dialplanExists = true;
        } catch {
          dialplanExists = false;
        }
      }

      const diagnostics = {
        ami: {
          connected: amiConnected,
          error: amiConnected ? undefined : 'AMI is not connected to Asterisk'
        },
        audioSocket: {
          running: audioSocketRunning,
          port: 9092,
          error: audioSocketRunning ? undefined : 'AudioSocket server is not running (requires OpenAI API key)'
        },
        openai: {
          configured: openaiConfigured,
          error: openaiConfigured ? undefined : 'OpenAI API key is not configured'
        },
        trunks: {
          total: parseInt(trunkCounts?.total || '0', 10),
          enabled: parseInt(trunkCounts?.enabled || '0', 10),
          error: (parseInt(trunkCounts?.enabled || '0', 10) > 0) ? undefined : 'No enabled SIP trunks for outbound calls'
        },
        agents: {
          total: parseInt(agentCounts?.total || '0', 10),
          enabled: parseInt(agentCounts?.enabled || '0', 10)
        },
        dialplan: {
          contextExists: dialplanExists
        },
        ready: amiConnected && audioSocketRunning && openaiConfigured && (parseInt(trunkCounts?.enabled || '0', 10) > 0)
      };

      return { success: true, data: diagnostics };
    } catch (error) {
      request.log.error(error, 'Failed to get AI diagnostics');
      return reply.status(500).send({ success: false, error: 'Failed to get diagnostics' });
    }
  });

  // GET /api/v1/ai/functions - List available AI functions
  server.get('/functions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Return built-in function definitions
      const functions = [
        {
          name: 'transfer_to_extension',
          description: 'Transfer the call to a specific extension number',
          parameters: { type: 'object', properties: { extension: { type: 'string' }, reason: { type: 'string' } }, required: ['extension'] },
        },
        {
          name: 'transfer_to_queue',
          description: 'Transfer the call to a call queue',
          parameters: { type: 'object', properties: { queue: { type: 'string' }, priority: { type: 'string', enum: ['high', 'normal', 'low'] } }, required: ['queue'] },
        },
        {
          name: 'send_sms',
          description: 'Send an SMS message to a phone number',
          parameters: { type: 'object', properties: { to: { type: 'string' }, message: { type: 'string' } }, required: ['message'] },
        },
        {
          name: 'end_call',
          description: 'End the current call',
          parameters: { type: 'object', properties: { reason: { type: 'string' }, farewell_message: { type: 'string' } }, required: ['reason'] },
        },
        {
          name: 'schedule_callback',
          description: 'Schedule a callback for the caller',
          parameters: { type: 'object', properties: { date: { type: 'string' }, time: { type: 'string' }, phone_number: { type: 'string' } }, required: ['date', 'time'] },
        },
        {
          name: 'collect_information',
          description: 'Record information collected from the caller',
          parameters: { type: 'object', properties: { field_name: { type: 'string' }, field_value: { type: 'string' } }, required: ['field_name', 'field_value'] },
        },
        {
          name: 'lookup_customer',
          description: 'Look up customer information in the CRM',
          parameters: { type: 'object', properties: { identifier_type: { type: 'string' }, identifier_value: { type: 'string' } }, required: ['identifier_type', 'identifier_value'] },
        },
        {
          name: 'check_business_hours',
          description: 'Check if the business is currently open',
          parameters: { type: 'object', properties: { department: { type: 'string' } }, required: [] },
        },
      ];

      return { success: true, data: functions };
    } catch (error) {
      request.log.error(error, 'Failed to get functions');
      return reply.status(500).send({ success: false, error: 'Failed to get functions' });
    }
  });

  // GET /api/v1/ai/providers - List available AI providers
  server.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return {
        success: true,
        data: {
          voice: [
            {
              name: 'openai_realtime',
              displayName: 'OpenAI Realtime',
              description: 'Low latency (~300ms), built-in STT + LLM + TTS',
              voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'],
            },
            {
              name: 'elevenlabs_full',
              displayName: 'ElevenLabs',
              description: 'Premium voice quality, uses Scribe STT + external LLM + ElevenLabs TTS',
              models: [
                { id: 'eleven_flash_v2_5', name: 'Flash v2.5', latency: '~75ms', description: 'Fastest, good for real-time' },
                { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', latency: '~250ms', description: 'Balanced quality/speed' },
                { id: 'eleven_multilingual_v2', name: 'Multilingual v2', latency: '~500ms', description: 'Best quality, multilingual' },
              ],
            },
          ],
          llm: [
            { name: 'openai', type: 'llm', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
            { name: 'anthropic', type: 'llm', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
            { name: 'groq', type: 'llm', models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
          ],
          stt: [
            { name: 'deepgram', type: 'stt', models: ['nova-2', 'nova-2-phonecall'], languages: ['en-US', 'es', 'fr', 'de'] },
            { name: 'whisper', type: 'stt', models: ['whisper-1'], languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl'] },
            { name: 'assemblyai', type: 'stt', models: ['best', 'nano'], languages: ['en', 'es', 'fr', 'de'] },
            { name: 'elevenlabs_scribe', type: 'stt', models: ['scribe_v2'], languages: ['en', 'es', 'fr', 'de', 'it', 'pt'] },
          ],
        },
      };
    } catch (error) {
      request.log.error(error, 'Failed to get providers');
      return reply.status(500).send({ success: false, error: 'Failed to get providers' });
    }
  });

  // GET /api/v1/ai/elevenlabs/voices - List available ElevenLabs voices
  server.get('/elevenlabs/voices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get ElevenLabs API key from settings
      const apiKeySetting = await ctx.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'elevenlabs_api_key'"
      );

      if (!apiKeySetting?.value) {
        return reply.status(400).send({
          success: false,
          error: 'ElevenLabs API key not configured. Please set it in Settings.',
        });
      }

      // Fetch voices from ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': apiKeySetting.value,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        request.log.error({ status: response.status, error: errorText }, 'Failed to fetch ElevenLabs voices');
        return reply.status(response.status).send({
          success: false,
          error: 'Failed to fetch voices from ElevenLabs',
        });
      }

      const data = await response.json() as { voices?: Array<{ voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string; preview_url?: string }> };

      // Transform voices for frontend
      const voices = (data.voices || []).map((voice) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        category: voice.category || 'custom',
        labels: voice.labels || {},
        description: voice.description,
        previewUrl: voice.preview_url,
      }));

      return {
        success: true,
        data: voices,
      };
    } catch (error) {
      request.log.error(error, 'Failed to get ElevenLabs voices');
      return reply.status(500).send({ success: false, error: 'Failed to get ElevenLabs voices' });
    }
  });
}
