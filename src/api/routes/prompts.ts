import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart, { MultipartFile } from '@fastify/multipart';
import { ApiContext } from '../server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { apiLogger } from '../../utils/logger';

const execAsync = promisify(exec);

const PROMPTS_DIR = process.env.PROMPTS_PATH || '/var/lib/asterisk/sounds/prompts';

// Ensure prompts directory exists
if (!fs.existsSync(PROMPTS_DIR)) {
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });
}

export async function registerPromptRoutes(server: FastifyInstance, ctx: ApiContext): Promise<void> {
  // Register multipart support for file uploads
  await server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max
    },
  });

  // List all prompts - requires prompts.view
  server.get('/', {
    preHandler: [ctx.requirePermission('prompts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const prompts = await ctx.promptRepo.findAll();
    return { prompts };
  });

  // Get single prompt - requires prompts.view
  server.get('/:id', {
    preHandler: [ctx.requirePermission('prompts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const prompt = await ctx.promptRepo.findById(id);
    if (!prompt) {
      return reply.status(404).send({ error: 'Not Found', message: 'Prompt not found' });
    }
    return prompt;
  });

  // Stream audio file for a prompt - requires prompts.view
  server.get('/:id/audio', {
    preHandler: [ctx.requirePermission('prompts.view')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const prompt = await ctx.promptRepo.findById(id);

    if (!prompt) {
      return reply.status(404).send({ error: 'Not Found', message: 'Prompt not found' });
    }

    if (!prompt.filePath || !fs.existsSync(prompt.filePath)) {
      return reply.status(404).send({ error: 'Not Found', message: 'Audio file not found' });
    }

    const ext = path.extname(prompt.filePath).toLowerCase();
    const contentType = ext === '.mp3' ? 'audio/mpeg' :
                       ext === '.wav' ? 'audio/wav' :
                       ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';

    const stream = fs.createReadStream(prompt.filePath);
    reply.header('Content-Type', contentType);
    reply.header('Accept-Ranges', 'bytes');
    return reply.send(stream);
  });

  // Create TTS prompt (generate audio from text) - requires prompts.manage
  server.post('/tts', {
    preHandler: [ctx.requirePermission('prompts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      text: string;
      voice?: string;
      provider?: string;
      language?: string;  // Language code for multilingual TTS (e.g., 'fr', 'de', 'es')
    };

    if (!body.name || !body.text) {
      return reply.status(400).send({ error: 'Bad Request', message: 'name and text required' });
    }

    // Check for duplicate name
    const existing = await ctx.promptRepo.findByName(body.name);
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'A prompt with this name already exists' });
    }

    try {
      const id = uuidv4();
      const tempFile = path.join(PROMPTS_DIR, `${id}-temp`);
      const finalFile = path.join(PROMPTS_DIR, `${id}.wav`);
      const provider = body.provider || (await ctx.settingsRepo?.get('tts_provider')) || 'piper';
      const voice = body.voice || 'alloy';

      // Use TTS service to generate audio with the selected provider
      const originalProvider = ctx.ttsService.getProvider();

      // Temporarily switch provider if specified and sync API keys
      if (body.provider) {
        ctx.ttsService.setProvider(body.provider as any);

        // Sync API keys for the selected provider
        if (body.provider === 'openai') {
          const openaiKey = await ctx.settingsRepo.get('openai_api_key');
          if (openaiKey) ctx.ttsService.setOpenAIApiKey(openaiKey);
        } else if (body.provider === 'elevenlabs') {
          const elevenLabsKey = await ctx.settingsRepo.get('elevenlabs_api_key');
          if (elevenLabsKey) ctx.ttsService.setApiKey(elevenLabsKey);
        } else if (body.provider === 'cartesia') {
          const cartesiaKey = await ctx.settingsRepo.get('cartesia_api_key');
          if (cartesiaKey) ctx.ttsService.setCartesiaApiKey(cartesiaKey);
        } else if (body.provider === 'deepgram') {
          const deepgramKey = await ctx.settingsRepo.get('deepgram_api_key');
          if (deepgramKey) ctx.ttsService.setDeepgramApiKey(deepgramKey);
        } else if (body.provider === 'playht') {
          const playhtKey = await ctx.settingsRepo.get('playht_api_key');
          const playhtUserId = await ctx.settingsRepo.get('playht_user_id');
          if (playhtKey) ctx.ttsService.setPlayHTApiKey(playhtKey);
          if (playhtUserId) ctx.ttsService.setPlayHTUserId(playhtUserId);
        } else if (body.provider === 'google') {
          const googleKey = await ctx.settingsRepo.get('google_api_key');
          if (googleKey) ctx.ttsService.setGoogleApiKey(googleKey);
        }
      }

      // Generate audio using TTS service
      // Pass language code for multilingual TTS (forces output language for ElevenLabs Multilingual v2)
      const result = await ctx.ttsService.generateAudio(body.text, id, {
        voice,
        language: body.language  // e.g., 'fr' for French output regardless of input text
      });

      // Restore original provider
      ctx.ttsService.setProvider(originalProvider);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'TTS generation failed');
      }

      // The TTS service returns the audio file path
      const generatedFile = result.data;

      // Convert to Asterisk-compatible format: 8kHz, 16-bit, mono if needed
      if (fs.existsSync(generatedFile)) {
        await execAsync(
          `ffmpeg -i "${generatedFile}" -ar 8000 -ac 1 -acodec pcm_s16le -y "${finalFile}"`,
          { timeout: 30000 }
        );
        // Clean up temp file if different from final
        if (generatedFile !== finalFile) {
          try { fs.unlinkSync(generatedFile); } catch {}
        }
      } else {
        throw new Error('TTS generation failed - no output file created');
      }

      // Save prompt to database with provider info
      const prompt = await ctx.promptRepo.create({
        name: body.name,
        type: 'tts',
        text: body.text,
        voice: `${provider}/${voice}`,
        filePath: finalFile,
      });

      return reply.status(201).send(prompt);
    } catch (error: any) {
      console.error('TTS generation error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message || 'Failed to generate TTS audio'
      });
    }
  });

  // Upload audio file - requires prompts.manage
  server.post('/upload', {
    preHandler: [ctx.requirePermission('prompts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await (request as any).file() as MultipartFile | undefined;
      if (!data) {
        return reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      }

      const name = (data.fields.name as any)?.value || data.filename.replace(/\.[^/.]+$/, '');

      // Check for duplicate name
      const existing = await ctx.promptRepo.findByName(name);
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'A prompt with this name already exists' });
      }

      // Validate file type
      const ext = path.extname(data.filename).toLowerCase();
      if (!['.wav', '.mp3', '.ogg', '.gsm'].includes(ext)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid file type. Supported: wav, mp3, ogg, gsm'
        });
      }

      const id = uuidv4();
      const origFileName = `${id}_orig${ext}`;
      const origPath = path.join(PROMPTS_DIR, origFileName);
      const wavFileName = `${id}.wav`;
      const wavPath = path.join(PROMPTS_DIR, wavFileName);

      // Save original file
      const buffer = await data.toBuffer();
      fs.writeFileSync(origPath, buffer);

      // Always convert to Asterisk-compatible format: 8kHz, 16-bit, mono WAV
      try {
        await execAsync(
          `ffmpeg -i "${origPath}" -ar 8000 -ac 1 -acodec pcm_s16le -y "${wavPath}"`,
          { timeout: 60000 }
        );
        apiLogger.info(`Converted ${origPath} to Asterisk format: ${wavPath}`);
      } catch (e: any) {
        apiLogger.error('Audio conversion failed:', e.message);
        // Clean up and return error
        if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
        return reply.status(500).send({
          error: 'Server Error',
          message: 'Failed to convert audio to Asterisk format. Ensure ffmpeg is installed.'
        });
      }

      // Save prompt to database - use WAV path for Asterisk, keep original for browser
      const prompt = await ctx.promptRepo.create({
        name: name,
        type: 'uploaded',
        text: null,
        voice: null,
        filePath: wavPath, // Asterisk-compatible WAV
      });

      return reply.status(201).send(prompt);
    } catch (error: any) {
      apiLogger.error('Upload error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error.message || 'Failed to upload file'
      });
    }
  });

  // Update prompt - requires prompts.manage
  server.put('/:id', {
    preHandler: [ctx.requirePermission('prompts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      text?: string;
      voice?: string;
    };

    const prompt = await ctx.promptRepo.findById(id);
    if (!prompt) {
      return reply.status(404).send({ error: 'Not Found', message: 'Prompt not found' });
    }

    // If name is changing, check for duplicate
    if (body.name && body.name !== prompt.name) {
      const existing = await ctx.promptRepo.findByName(body.name);
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'A prompt with this name already exists' });
      }
    }

    // If text or voice changed for TTS prompt, regenerate audio
    if (prompt.type === 'tts' && (body.text || body.voice)) {
      try {
        const text = body.text || prompt.text || '';
        const voice = body.voice || prompt.voice || 'en_US-lessac-medium';
        const filePath = prompt.filePath || path.join(PROMPTS_DIR, `${id}.wav`);

        const piperPath = '/usr/bin/piper';
        const modelsPath = '/opt/botpbx/tts-server/voices';
        const modelFile = `${modelsPath}/${voice}.onnx`;

        if (fs.existsSync(modelFile)) {
          const textFile = `/tmp/tts-${id}.txt`;
          fs.writeFileSync(textFile, text);
          await execAsync(
            `cat "${textFile}" | ${piperPath} --model "${modelFile}" --output_file "${filePath}"`,
            { timeout: 30000 }
          );
          fs.unlinkSync(textFile);
        }

        body.text = text;
        body.voice = voice;
      } catch (error) {
        console.error('TTS regeneration error:', error);
      }
    }

    const success = await ctx.promptRepo.update(id, body);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to update prompt' });
    }

    const updated = await ctx.promptRepo.findById(id);
    return updated;
  });

  // Delete prompt - requires prompts.manage
  server.delete('/:id', {
    preHandler: [ctx.requirePermission('prompts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const prompt = await ctx.promptRepo.findById(id);
    if (!prompt) {
      return reply.status(404).send({ error: 'Not Found', message: 'Prompt not found' });
    }

    // Delete audio file
    if (prompt.filePath && fs.existsSync(prompt.filePath)) {
      try {
        fs.unlinkSync(prompt.filePath);
        // Also delete any converted WAV version
        const wavPath = prompt.filePath.replace(/\.[^/.]+$/, '.wav');
        if (wavPath !== prompt.filePath && fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath);
        }
      } catch (e) {
        console.warn('Could not delete prompt file:', e);
      }
    }

    const success = await ctx.promptRepo.delete(id);
    if (!success) {
      return reply.status(500).send({ error: 'Server Error', message: 'Failed to delete prompt' });
    }

    return { success: true };
  });

  // Translate text using OpenAI - requires prompts.manage
  server.post('/translate', {
    preHandler: [ctx.requirePermission('prompts.manage')]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      text: string;
      targetLanguage: string;
      sourceLang?: string;
    };

    if (!body.text || !body.targetLanguage) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'text and targetLanguage are required'
      });
    }

    // Language names for better translation
    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      nl: 'Dutch',
      pl: 'Polish',
      sv: 'Swedish',
      da: 'Danish',
      fi: 'Finnish',
      no: 'Norwegian',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      ru: 'Russian',
      ar: 'Arabic',
      hi: 'Hindi',
      tr: 'Turkish',
      vi: 'Vietnamese',
      th: 'Thai',
      cs: 'Czech',
      el: 'Greek',
      he: 'Hebrew',
      id: 'Indonesian',
      uk: 'Ukrainian',
      ro: 'Romanian',
      hu: 'Hungarian',
      fil: 'Filipino',
      bg: 'Bulgarian',
      hr: 'Croatian',
      ms: 'Malay',
      sk: 'Slovak',
      ta: 'Tamil',
    };

    const targetLangName = languageNames[body.targetLanguage] || body.targetLanguage;

    try {
      // Get OpenAI API key from settings
      const openaiKey = await ctx.settingsRepo.get('openai_api_key');

      if (!openaiKey) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'OpenAI API key not configured. Go to Settings > AI Providers to add your key.'
        });
      }

      // Call OpenAI for translation
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the given text to ${targetLangName}.
Keep the same tone and style. If it's a phone system message or IVR prompt, keep it natural and conversational.
Only output the translated text, nothing else.`
            },
            {
              role: 'user',
              content: body.text
            }
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error?.message || 'OpenAI API request failed');
      }

      const data = await response.json() as {
        choices: { message: { content: string } }[];
      };

      const translatedText = data.choices?.[0]?.message?.content?.trim();

      if (!translatedText) {
        throw new Error('No translation received from OpenAI');
      }

      return {
        success: true,
        translatedText,
        sourceLanguage: body.sourceLang || 'auto',
        targetLanguage: body.targetLanguage,
      };
    } catch (error: any) {
      console.error('Translation error:', error);
      return reply.status(500).send({
        error: 'Translation Failed',
        message: error.message || 'Failed to translate text'
      });
    }
  });
}
