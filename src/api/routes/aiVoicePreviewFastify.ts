/**
 * AI Voice Preview API Routes (Fastify)
 * Generate voice previews for AI agent voice selection
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import OpenAI from 'openai';

interface VoicePreviewBody {
  voice: string;
  text?: string;
}

const SAMPLE_TEXTS: Record<string, string> = {
  default: "Hello! I'm your AI assistant. How can I help you today?",
  greeting: "Good morning! Thank you for calling. I'm here to assist you.",
  support: "I understand your concern. Let me look into that for you right away.",
  sales: "That's a great question! I'd be happy to tell you more about our services.",
  appointment: "I'd be happy to schedule that appointment for you. What time works best?",
};

const VOICE_DESCRIPTIONS: Record<string, { name: string; description: string; gender: string; style: string }> = {
  alloy: { name: 'Alloy', description: 'Neutral and balanced', gender: 'neutral', style: 'professional' },
  ash: { name: 'Ash', description: 'Calm and thoughtful', gender: 'neutral', style: 'measured' },
  ballad: { name: 'Ballad', description: 'Warm and melodic', gender: 'neutral', style: 'warm' },
  coral: { name: 'Coral', description: 'Friendly and approachable', gender: 'female', style: 'casual' },
  echo: { name: 'Echo', description: 'Clear and articulate', gender: 'male', style: 'professional' },
  sage: { name: 'Sage', description: 'Wise and reassuring', gender: 'neutral', style: 'calm' },
  shimmer: { name: 'Shimmer', description: 'Bright and energetic', gender: 'female', style: 'enthusiastic' },
  verse: { name: 'Verse', description: 'Expressive and dynamic', gender: 'neutral', style: 'expressive' },
};

export function registerAIVoicePreviewRoutes(server: FastifyInstance, ctx: ApiContext) {
  // GET /api/v1/ai/voices - List available voices with metadata
  server.get('/voices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const voices = Object.entries(VOICE_DESCRIPTIONS).map(([id, info]) => ({
        id,
        ...info,
      }));

      return { success: true, data: voices };
    } catch (error) {
      request.log.error(error, 'Failed to list voices');
      return reply.status(500).send({ success: false, error: 'Failed to list voices' });
    }
  });

  // GET /api/v1/ai/voices/samples - Get available sample texts
  server.get('/voices/samples', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const samples = Object.entries(SAMPLE_TEXTS).map(([id, text]) => ({
        id,
        text,
      }));

      return { success: true, data: samples };
    } catch (error) {
      request.log.error(error, 'Failed to list voice samples');
      return reply.status(500).send({ success: false, error: 'Failed to list voice samples' });
    }
  });

  // POST /api/v1/ai/voices/preview - Generate voice preview audio
  server.post('/voices/preview', async (request: FastifyRequest<{ Body: VoicePreviewBody }>, reply: FastifyReply) => {
    try {
      const { voice, text = SAMPLE_TEXTS.default } = request.body;

      if (!voice) {
        return reply.status(400).send({ success: false, error: 'Voice is required' });
      }

      if (!VOICE_DESCRIPTIONS[voice]) {
        return reply.status(400).send({
          success: false,
          error: `Invalid voice. Available voices: ${Object.keys(VOICE_DESCRIPTIONS).join(', ')}`
        });
      }

      // Get OpenAI API key from settings
      const apiKeySetting = await ctx.db.get<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        ['openai_api_key']
      );

      if (!apiKeySetting?.value) {
        return reply.status(400).send({
          success: false,
          error: 'OpenAI API key not configured. Please set it in AI Providers settings.'
        });
      }

      const openai = new OpenAI({ apiKey: apiKeySetting.value });

      // Generate speech using OpenAI TTS
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: text.substring(0, 500), // Limit text length
        response_format: 'mp3',
      });

      // Convert to base64 for easy frontend consumption
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64Audio = buffer.toString('base64');

      return {
        success: true,
        data: {
          audio: `data:audio/mp3;base64,${base64Audio}`,
          voice,
          text: text.substring(0, 500),
          durationEstimate: Math.ceil(text.length / 15), // Rough estimate in seconds
        }
      };
    } catch (error: any) {
      request.log.error(error, 'Failed to generate voice preview');

      let errorMessage = 'Failed to generate voice preview';
      if (error.message?.includes('API key')) {
        errorMessage = 'Invalid OpenAI API key';
      } else if (error.message?.includes('quota')) {
        errorMessage = 'OpenAI API quota exceeded';
      }

      return reply.status(500).send({ success: false, error: errorMessage });
    }
  });

  // POST /api/v1/ai/voices/compare - Compare multiple voices with same text
  server.post('/voices/compare', async (request: FastifyRequest<{ Body: { voices: string[]; text?: string } }>, reply: FastifyReply) => {
    try {
      const { voices, text = SAMPLE_TEXTS.default } = request.body;

      if (!voices || voices.length === 0) {
        return reply.status(400).send({ success: false, error: 'At least one voice is required' });
      }

      if (voices.length > 4) {
        return reply.status(400).send({ success: false, error: 'Maximum 4 voices can be compared at once' });
      }

      // Validate all voices
      const invalidVoices = voices.filter(v => !VOICE_DESCRIPTIONS[v]);
      if (invalidVoices.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Invalid voices: ${invalidVoices.join(', ')}`
        });
      }

      // Get OpenAI API key
      const apiKeySetting = await ctx.db.get<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        ['openai_api_key']
      );

      if (!apiKeySetting?.value) {
        return reply.status(400).send({
          success: false,
          error: 'OpenAI API key not configured'
        });
      }

      const openai = new OpenAI({ apiKey: apiKeySetting.value });

      // Generate previews for all voices in parallel
      const previews = await Promise.all(
        voices.map(async (voice) => {
          try {
            const response = await openai.audio.speech.create({
              model: 'tts-1',
              voice: voice as any,
              input: text.substring(0, 300),
              response_format: 'mp3',
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            const base64Audio = buffer.toString('base64');

            return {
              voice,
              ...VOICE_DESCRIPTIONS[voice],
              audio: `data:audio/mp3;base64,${base64Audio}`,
              success: true,
            };
          } catch (error) {
            return {
              voice,
              ...VOICE_DESCRIPTIONS[voice],
              audio: null,
              success: false,
              error: 'Failed to generate',
            };
          }
        })
      );

      return { success: true, data: { previews, text: text.substring(0, 300) } };
    } catch (error) {
      request.log.error(error, 'Failed to compare voices');
      return reply.status(500).send({ success: false, error: 'Failed to compare voices' });
    }
  });
}
