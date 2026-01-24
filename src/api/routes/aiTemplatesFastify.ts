/**
 * AI Agent Templates API Routes (Fastify)
 * CRUD operations for AI agent templates
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { ApiContext } from '../server';

interface AIAgentTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  system_prompt: string;
  greeting_text: string;
  voice: string;
  enabled_functions: string;
  icon: string | null;
  is_default: number;
  created_at: number;
}

interface CreateTemplateBody {
  name: string;
  category: string;
  description?: string;
  systemPrompt: string;
  greetingText: string;
  voice?: string;
  enabledFunctions?: string[];
  icon?: string;
}

function transformTemplate(template: AIAgentTemplate) {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    systemPrompt: template.system_prompt,
    greetingText: template.greeting_text,
    voice: template.voice,
    enabledFunctions: template.enabled_functions ? JSON.parse(template.enabled_functions) : [],
    icon: template.icon,
    isDefault: Boolean(template.is_default),
    createdAt: template.created_at,
  };
}

export function registerAITemplateRoutes(server: FastifyInstance, ctx: ApiContext) {
  // GET /api/v1/ai/templates - List all templates
  server.get('/templates', async (request: FastifyRequest<{ Querystring: { category?: string } }>, reply: FastifyReply) => {
    try {
      const { category } = request.query;

      let query = 'SELECT * FROM ai_agent_templates';
      const params: string[] = [];

      if (category) {
        query += ' WHERE category = $1';
        params.push(category);
      }

      query += ' ORDER BY is_default DESC, name ASC';

      const templates = await ctx.db.all<AIAgentTemplate>(query, params);
      return { success: true, data: templates.map(transformTemplate) };
    } catch (error) {
      request.log.error(error, 'Failed to list AI templates');
      return reply.status(500).send({ success: false, error: 'Failed to list AI templates' });
    }
  });

  // GET /api/v1/ai/templates/categories - Get available categories
  server.get('/templates/categories', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const categories = [
        { id: 'customer-support', name: 'Customer Support', icon: 'headphones', description: 'Handle inquiries and resolve issues' },
        { id: 'sales', name: 'Sales', icon: 'trending-up', description: 'Qualify leads and drive conversions' },
        { id: 'appointments', name: 'Appointments', icon: 'calendar', description: 'Schedule and manage bookings' },
        { id: 'faq', name: 'FAQ', icon: 'help-circle', description: 'Answer common questions' },
        { id: 'after-hours', name: 'After Hours', icon: 'moon', description: 'Handle calls outside business hours' },
        { id: 'custom', name: 'Custom', icon: 'settings', description: 'Build from scratch' },
      ];
      return { success: true, data: categories };
    } catch (error) {
      request.log.error(error, 'Failed to get template categories');
      return reply.status(500).send({ success: false, error: 'Failed to get template categories' });
    }
  });

  // GET /api/v1/ai/templates/:id - Get a single template
  server.get('/templates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const template = await ctx.db.get<AIAgentTemplate>('SELECT * FROM ai_agent_templates WHERE id = $1', [id]);

      if (!template) {
        return reply.status(404).send({ success: false, error: 'Template not found' });
      }

      return { success: true, data: transformTemplate(template) };
    } catch (error) {
      request.log.error(error, 'Failed to get AI template');
      return reply.status(500).send({ success: false, error: 'Failed to get AI template' });
    }
  });

  // POST /api/v1/ai/templates - Create a new template (admin only)
  server.post('/templates', async (request: FastifyRequest<{ Body: CreateTemplateBody }>, reply: FastifyReply) => {
    try {
      const {
        name,
        category,
        description = '',
        systemPrompt,
        greetingText,
        voice = 'alloy',
        enabledFunctions = [],
        icon = '',
      } = request.body;

      if (!name || !category || !systemPrompt || !greetingText) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: name, category, systemPrompt, greetingText',
        });
      }

      const id = `tpl-${uuidv4().slice(0, 8)}`;

      await ctx.db.run(`
        INSERT INTO ai_agent_templates (
          id, name, category, description, system_prompt, greeting_text, voice, enabled_functions, icon, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        id,
        name,
        category,
        description,
        systemPrompt,
        greetingText,
        voice,
        JSON.stringify(enabledFunctions),
        icon,
        0, // User-created templates are not default
      ]);

      return reply.status(201).send({
        success: true,
        data: {
          id,
          name,
          category,
          description,
          systemPrompt,
          greetingText,
          voice,
          enabledFunctions,
          icon,
          isDefault: false,
        },
      });
    } catch (error) {
      request.log.error(error, 'Failed to create AI template');
      return reply.status(500).send({ success: false, error: 'Failed to create AI template' });
    }
  });

  // POST /api/v1/ai/agents/from-template - Create agent from template
  server.post('/agents/from-template', async (request: FastifyRequest<{ Body: { templateId: string; name: string; customizations?: Partial<CreateTemplateBody> } }>, reply: FastifyReply) => {
    try {
      const { templateId, name, customizations = {} } = request.body;

      if (!templateId || !name) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: templateId, name',
        });
      }

      // Get the template
      const template = await ctx.db.get<AIAgentTemplate>('SELECT * FROM ai_agent_templates WHERE id = $1', [templateId]);
      if (!template) {
        return reply.status(404).send({ success: false, error: 'Template not found' });
      }

      // Merge template with customizations
      const systemPrompt = customizations.systemPrompt || template.system_prompt;
      const greetingText = customizations.greetingText || template.greeting_text;
      const voice = customizations.voice || template.voice;
      const enabledFunctions = customizations.enabledFunctions || JSON.parse(template.enabled_functions);

      const id = uuidv4();
      const createdAt = Math.floor(Date.now() / 1000);  // Unix timestamp for INTEGER column

      await ctx.db.run(`
        INSERT INTO ai_agents (
          id, name, system_prompt, greeting_text, voice_provider, voice_id,
          language, llm_provider, llm_model, stt_provider, enabled_functions, enabled, use_realtime, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        id,
        name,
        systemPrompt,
        greetingText,
        'openai_realtime',
        voice,
        'en',
        'openai',
        'gpt-4o-realtime',
        'openai_realtime',
        JSON.stringify(enabledFunctions),
        1,  // enabled: INTEGER boolean
        1,  // use_realtime: INTEGER boolean
        createdAt
      ]);

      return reply.status(201).send({
        success: true,
        data: {
          id,
          name,
          systemPrompt,
          greetingText,
          voice,
          language: 'en',
          enabledFunctions,
          enabled: true,
          createdAt,
          templateId,
        },
      });
    } catch (error: any) {
      request.log.error(error, 'Failed to create agent from template');

      let errorMessage = 'Failed to create agent from template';
      if (error.message?.includes('UNIQUE constraint')) {
        errorMessage = 'An agent with this name already exists';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return reply.status(500).send({ success: false, error: errorMessage });
    }
  });

  // DELETE /api/v1/ai/templates/:id - Delete a template (non-default only)
  server.delete('/templates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Check if template exists and is not default
      const template = await ctx.db.get<AIAgentTemplate>('SELECT * FROM ai_agent_templates WHERE id = $1', [id]);
      if (!template) {
        return reply.status(404).send({ success: false, error: 'Template not found' });
      }

      if (template.is_default) {
        return reply.status(403).send({ success: false, error: 'Cannot delete default templates' });
      }

      await ctx.db.run('DELETE FROM ai_agent_templates WHERE id = $1', [id]);

      return { success: true, message: 'Template deleted' };
    } catch (error) {
      request.log.error(error, 'Failed to delete AI template');
      return reply.status(500).send({ success: false, error: 'Failed to delete AI template' });
    }
  });
}
