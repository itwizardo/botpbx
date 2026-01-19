'use client';

import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Volume2,
  Upload,
  Play,
  Pause,
  Square,
  Trash2,
  FileAudio,
  Loader2,
  Save,
  Globe,
  AlertCircle,
  Mic,
  HelpCircle,
  Languages,
} from 'lucide-react';
import { promptsApi, settingsApi, TTSProvider, Prompt } from '@/lib/api';
import { PIPER_PROVIDER, KOKORO_PROVIDER } from '@/lib/constants/local-tts-providers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ===========================================
// LANGUAGES WITH FLAG EMOJIS
// ===========================================
const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'nb', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  // Additional ElevenLabs Multilingual v2 languages
  { code: 'fil', name: 'Filipino', flag: '🇵🇭' },
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
];

// ElevenLabs Multilingual v2 supports these 29 languages with ANY voice
const ELEVENLABS_MULTILINGUAL_LANGUAGES = [
  'en', 'ja', 'zh', 'de', 'hi', 'fr', 'ko', 'pt', 'it', 'es',
  'id', 'nl', 'tr', 'fil', 'pl', 'sv', 'bg', 'ro', 'ar', 'cs',
  'el', 'fi', 'hr', 'ms', 'sk', 'da', 'ta', 'uk', 'ru'
];

// ===========================================
// LANGUAGE-SPECIFIC PREVIEW TEXTS
// Sample phrases for voice preview in each language
// ===========================================
const PREVIEW_TEXTS: Record<string, (voiceName: string) => string> = {
  en: (name) => `Hello, I'm ${name}. This is how I sound when speaking English.`,
  es: (name) => `Hola, soy ${name}. Así es como sueno cuando hablo español.`,
  fr: (name) => `Bonjour, je suis ${name}. Voici comment je parle en français.`,
  de: (name) => `Hallo, ich bin ${name}. So klinge ich auf Deutsch.`,
  it: (name) => `Ciao, sono ${name}. Ecco come parlo in italiano.`,
  pt: (name) => `Olá, eu sou ${name}. É assim que eu falo em português.`,
  nl: (name) => `Hallo, ik ben ${name}. Zo klink ik in het Nederlands.`,
  ja: (name) => `こんにちは、${name}です。日本語ではこのように話します。`,
  ko: (name) => `안녕하세요, 저는 ${name}입니다. 제가 한국어로 말하는 방식입니다.`,
  zh: (name) => `你好，我是${name}。这是我用中文说话的方式。`,
  ru: (name) => `Привет, я ${name}. Вот как я говорю по-русски.`,
  ar: (name) => `مرحباً، أنا ${name}. هكذا أتحدث بالعربية.`,
  hi: (name) => `नमस्ते, मैं ${name} हूं। हिंदी में मैं ऐसे बोलता हूं।`,
  pl: (name) => `Cześć, jestem ${name}. Tak brzmię po polsku.`,
  tr: (name) => `Merhaba, ben ${name}. Türkçe konuşurken böyle duyuluyorum.`,
  vi: (name) => `Xin chào, tôi là ${name}. Đây là cách tôi nói tiếng Việt.`,
  th: (name) => `สวัสดี ฉันชื่อ ${name} นี่คือเสียงของฉันเมื่อพูดภาษาไทย`,
  sv: (name) => `Hej, jag är ${name}. Så här låter jag på svenska.`,
  da: (name) => `Hej, jeg er ${name}. Sådan lyder jeg på dansk.`,
  fi: (name) => `Hei, olen ${name}. Näin kuulostan suomeksi.`,
  nb: (name) => `Hei, jeg er ${name}. Slik høres jeg ut på norsk.`,
  cs: (name) => `Ahoj, jsem ${name}. Takto zním česky.`,
  el: (name) => `Γεια σας, είμαι ο ${name}. Έτσι ακούγομαι στα ελληνικά.`,
  he: (name) => `שלום, אני ${name}. ככה אני נשמע בעברית.`,
  id: (name) => `Halo, saya ${name}. Begini suara saya dalam bahasa Indonesia.`,
  uk: (name) => `Привіт, я ${name}. Ось як я звучу українською.`,
  ro: (name) => `Bună, sunt ${name}. Așa vorbesc în română.`,
  hu: (name) => `Szia, ${name} vagyok. Így hangzom magyarul.`,
  fil: (name) => `Kumusta, ako si ${name}. Ganito ako magsalita sa Filipino.`,
  bg: (name) => `Здравейте, аз съм ${name}. Ето как звуча на български.`,
  hr: (name) => `Bok, ja sam ${name}. Ovako zvučim na hrvatskom.`,
  ms: (name) => `Hai, saya ${name}. Beginilah bunyi saya dalam bahasa Melayu.`,
  sk: (name) => `Ahoj, som ${name}. Takto znejiem po slovensky.`,
  ta: (name) => `வணக்கம், நான் ${name}. தமிழில் நான் இப்படித்தான் பேசுவேன்.`,
};

const TTS_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'High quality, 50+ languages' },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'Premium voices' },
  { id: 'deepgram', name: 'Deepgram', description: 'Fast, natural' },
  { id: 'piper', name: 'Piper', description: 'Free, local, 90+ voices' },
  { id: 'kokoro', name: 'Kokoro', description: 'Fast, lightweight' },
  { id: 'google', name: 'Google', description: 'Neural voices' },
  { id: 'cartesia', name: 'Cartesia', description: 'Sonic voices' },
];

// ===========================================
// VOICE DATA BY PROVIDER
// ===========================================
const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced', gender: 'neutral' },
  { id: 'ash', name: 'Ash', description: 'Clear and direct', gender: 'male' },
  { id: 'ballad', name: 'Ballad', description: 'Warm and engaging', gender: 'male' },
  { id: 'coral', name: 'Coral', description: 'Friendly and upbeat', gender: 'female' },
  { id: 'echo', name: 'Echo', description: 'Soft and reflective', gender: 'male' },
  { id: 'sage', name: 'Sage', description: 'Calm and wise', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', description: 'Bright and energetic', gender: 'female' },
  { id: 'verse', name: 'Verse', description: 'Expressive and dynamic', gender: 'male' },
];

const DEEPGRAM_VOICES: Record<string, Array<{ id: string; name: string; description: string; gender: string }>> = {
  'en': [
    { id: 'aura-asteria-en', name: 'Asteria', description: 'American female', gender: 'female' },
    { id: 'aura-luna-en', name: 'Luna', description: 'American female, warm', gender: 'female' },
    { id: 'aura-stella-en', name: 'Stella', description: 'Professional', gender: 'female' },
    { id: 'aura-orion-en', name: 'Orion', description: 'American male', gender: 'male' },
    { id: 'aura-arcas-en', name: 'Arcas', description: 'Deep male', gender: 'male' },
    { id: 'aura-perseus-en', name: 'Perseus', description: 'Conversational', gender: 'male' },
  ],
};

// Build PIPER_VOICES dynamically from shared provider definition
const PIPER_VOICES: Record<string, Array<{ id: string; name: string; description: string; gender: string }>> =
  PIPER_PROVIDER.models.reduce((acc, model) => {
    // Convert language code: 'en-US' -> 'en', 'es-ES' -> 'es'
    const lang = model.language.split('-')[0];
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push({
      id: model.id,
      name: model.name,
      description: model.description || '',
      gender: model.gender || 'neutral',
    });
    return acc;
  }, {} as Record<string, Array<{ id: string; name: string; description: string; gender: string }>>);

// Build KOKORO_VOICES dynamically from shared provider definition
const KOKORO_VOICES: Record<string, Array<{ id: string; name: string; description: string; gender: string }>> =
  KOKORO_PROVIDER.models.reduce((acc, model) => {
    const lang = model.language.split('-')[0];
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push({
      id: model.id,
      name: model.name,
      description: model.description || '',
      gender: model.gender || 'neutral',
    });
    return acc;
  }, {} as Record<string, Array<{ id: string; name: string; description: string; gender: string }>>);

const GOOGLE_VOICES: Record<string, Array<{ id: string; name: string; description: string; gender: string }>> = {
  'en': [
    { id: 'en-US-Neural2-A', name: 'James', description: 'American male', gender: 'male' },
    { id: 'en-US-Neural2-C', name: 'Emma', description: 'American female', gender: 'female' },
    { id: 'en-US-Neural2-D', name: 'Michael', description: 'American male, deep', gender: 'male' },
    { id: 'en-US-Neural2-F', name: 'Olivia', description: 'Professional', gender: 'female' },
    { id: 'en-GB-Neural2-A', name: 'Charlotte', description: 'British female', gender: 'female' },
    { id: 'en-GB-Neural2-B', name: 'Oliver', description: 'British male', gender: 'male' },
  ],
  'es': [
    { id: 'es-ES-Neural2-A', name: 'Lucia', description: 'Spanish female', gender: 'female' },
    { id: 'es-ES-Neural2-B', name: 'Carlos', description: 'Spanish male', gender: 'male' },
  ],
  'fr': [
    { id: 'fr-FR-Neural2-A', name: 'Marie', description: 'French female', gender: 'female' },
    { id: 'fr-FR-Neural2-B', name: 'Pierre', description: 'French male', gender: 'male' },
  ],
  'de': [
    { id: 'de-DE-Neural2-A', name: 'Anna', description: 'German female', gender: 'female' },
    { id: 'de-DE-Neural2-B', name: 'Max', description: 'German male', gender: 'male' },
  ],
};

const CARTESIA_VOICES: Record<string, Array<{ id: string; name: string; description: string; gender: string }>> = {
  'en': [
    { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Barbershop Man', description: 'Casual male', gender: 'male' },
    { id: 'b7d50908-b17c-442d-ad8d-810c63997ed9', name: 'California Girl', description: 'Young female', gender: 'female' },
    { id: '71a7ad14-091c-4e8e-a314-022ece01c121', name: 'Commercial Lady', description: 'Professional', gender: 'female' },
    { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Newsman', description: 'News anchor', gender: 'male' },
  ],
};

// ElevenLabs voices are fetched dynamically
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: { description?: string; accent?: string; gender?: string; language?: string };
}

// Get voices for a provider and language
function getVoicesForProvider(provider: string, language: string) {
  switch (provider) {
    case 'openai':
      return OPENAI_VOICES;
    case 'deepgram':
      return DEEPGRAM_VOICES[language] || DEEPGRAM_VOICES['en'] || [];
    case 'cartesia':
      return CARTESIA_VOICES[language] || CARTESIA_VOICES['en'] || [];
    case 'google':
      return GOOGLE_VOICES[language] || GOOGLE_VOICES['en'] || [];
    case 'piper':
      return PIPER_VOICES[language] || PIPER_VOICES['en'] || [];
    case 'kokoro':
      return KOKORO_VOICES[language] || KOKORO_VOICES['en'] || [];
    default:
      return [];
  }
}

// Get languages available for a provider
function getLanguagesForProvider(provider: string): string[] {
  switch (provider) {
    case 'openai':
      return LANGUAGES.map(l => l.code);
    case 'deepgram':
      return Object.keys(DEEPGRAM_VOICES);
    case 'cartesia':
      return Object.keys(CARTESIA_VOICES);
    case 'google':
      return Object.keys(GOOGLE_VOICES);
    case 'piper':
      return Object.keys(PIPER_VOICES);
    case 'kokoro':
      return Object.keys(KOKORO_VOICES);
    case 'elevenlabs':
      return LANGUAGES.map(l => l.code);
    default:
      return ['en'];
  }
}

export default function PromptsPage() {
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<Prompt | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // TTS Creator state
  const [promptName, setPromptName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [provider, setProvider] = useState<TTSProvider>('openai');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Translation state
  const [isTranslating, setIsTranslating] = useState(false);

  // Fetch prompts
  const { data, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptsApi.list,
  });

  // Fetch ElevenLabs voices if that provider is selected
  const { data: elevenLabsVoices } = useQuery({
    queryKey: ['elevenlabs-voices'],
    queryFn: async () => {
      const result = await settingsApi.getTTSVoices('elevenlabs');
      return result.voices as unknown as ElevenLabsVoice[];
    },
    enabled: provider === 'elevenlabs',
  });

  // Fetch installed local TTS models (for Piper/Kokoro)
  const { data: localTtsStatus } = useQuery({
    queryKey: ['local-tts-status'],
    queryFn: async () => {
      const token = localStorage.getItem('botpbx_token');
      const response = await fetch('/api/v1/local-tts/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return { piper: { installedModels: [] }, kokoro: { installedModels: [] } };
      return response.json();
    },
    enabled: provider === 'piper' || provider === 'kokoro',
  });

  // Get available languages for current provider
  // ElevenLabs Multilingual v2 supports 29 languages with ANY voice
  const availableLanguages = useMemo(() => {
    if (provider === 'elevenlabs') {
      // Show all 29 languages supported by Multilingual v2 model
      // Any ElevenLabs voice can speak any of these languages
      return LANGUAGES.filter(l => ELEVENLABS_MULTILINGUAL_LANGUAGES.includes(l.code));
    }
    const langCodes = getLanguagesForProvider(provider);
    return LANGUAGES.filter(l => langCodes.includes(l.code));
  }, [provider]);

  // Get voices for current provider and language
  const displayVoices = useMemo(() => {
    if (provider === 'elevenlabs') {
      // Show ALL voices - any voice can speak any language with Multilingual v2
      return (elevenLabsVoices || [])
        .filter(v => {
          // No language filtering needed - all voices support all 29 languages
          return true;
        })
        .map(v => ({
          id: v.voice_id,
          name: v.name,
          description: v.labels?.description || v.labels?.accent || 'Custom voice',
          gender: v.labels?.gender || 'neutral',
        }));
    }

    // For local TTS providers, only show INSTALLED voices
    if (provider === 'piper') {
      const installedModels = localTtsStatus?.piper?.installedModels || [];
      if (installedModels.length === 0) {
        return []; // No voices installed - show empty
      }
      const allVoices = getVoicesForProvider(provider, selectedLanguage);
      return allVoices.filter(v => installedModels.includes(v.id));
    }

    if (provider === 'kokoro') {
      const installedModels = localTtsStatus?.kokoro?.installedModels || [];
      if (installedModels.length === 0) {
        return []; // No voices installed - show empty
      }
      const allVoices = getVoicesForProvider(provider, selectedLanguage);
      return allVoices.filter(v => installedModels.includes(v.id));
    }

    return getVoicesForProvider(provider, selectedLanguage);
  }, [provider, selectedLanguage, elevenLabsVoices, localTtsStatus]);

  // Create TTS mutation
  const createTTSMutation = useMutation({
    mutationFn: promptsApi.createTTS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('Audio prompt created!');
      setPromptName('');
      setPromptText('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create prompt');
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => promptsApi.upload(file, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('Audio uploaded!');
      setUploadDialogOpen(false);
      setUploadName('');
      setUploadFile(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload audio');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => promptsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('Prompt deleted');
      setDeleteDialogOpen(false);
      setPromptToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete prompt');
    },
  });

  // Handle provider change
  const handleProviderChange = (newProvider: TTSProvider) => {
    setProvider(newProvider);
    setSelectedLanguage('en');
    const voices = getVoicesForProvider(newProvider, 'en');
    if (voices.length > 0) {
      setSelectedVoice(voices[0].id);
    }
    stopPreview();
  };

  // Handle language change
  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    const voices = getVoicesForProvider(provider, langCode);
    if (voices.length > 0) {
      setSelectedVoice(voices[0].id);
    }
  };

  // Stop preview audio
  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingVoice(null);
  };

  // Play voice preview
  const handlePlayVoice = async (voiceId: string, voiceName: string) => {
    if (previewingVoice === voiceId) {
      stopPreview();
      return;
    }

    stopPreview();
    setLoadingPreview(true);
    setPreviewingVoice(voiceId);

    try {
      // Use prompt text if available, otherwise use a language-specific sample
      const getPreviewText = PREVIEW_TEXTS[selectedLanguage] || PREVIEW_TEXTS['en'];
      const textToSpeak = promptText.trim() || getPreviewText(voiceName);
      const result = await settingsApi.generatePreview(textToSpeak, voiceId, provider, selectedLanguage);

      if (result.success && result.previewId) {
        const audioUrl = settingsApi.getPreviewUrl(result.previewId);
        const audio = new Audio(audioUrl);
        previewAudioRef.current = audio;

        audio.onended = () => setPreviewingVoice(null);
        audio.onerror = () => {
          toast.error('Failed to play audio');
          setPreviewingVoice(null);
        };

        await audio.play();
      }
    } catch (error) {
      toast.error('Failed to generate preview');
      setPreviewingVoice(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Create prompt
  const handleCreatePrompt = () => {
    if (!promptName.trim()) {
      toast.error('Enter a name for the prompt');
      return;
    }
    if (!promptText.trim()) {
      toast.error('Enter the text to speak');
      return;
    }
    createTTSMutation.mutate({
      name: promptName.trim(),
      text: promptText.trim(),
      voice: selectedVoice,
      provider: provider,
      // Pass language for ElevenLabs multilingual - forces output language
      language: provider === 'elevenlabs' ? selectedLanguage : undefined,
    });
  };

  // Play saved prompt
  const handlePlay = async (prompt: Prompt) => {
    if (playingId === prompt.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingId(null);
    } else {
      try {
        setPlayingId(prompt.id);
        const audioUrl = promptsApi.getAudioUrl(prompt.id);
        const response = await fetch(audioUrl.split('?')[0], {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('botpbx_token')}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch audio');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = blobUrl;
          audioRef.current.play();
        }
      } catch {
        toast.error('Failed to play audio');
        setPlayingId(null);
      }
    }
  };

  const handleUpload = () => {
    if (!uploadFile) {
      toast.error('Please select a file');
      return;
    }
    uploadMutation.mutate({
      file: uploadFile,
      name: uploadName.trim() || undefined,
    });
  };

  // Handle AI translation
  const handleTranslate = async () => {
    if (!promptText.trim() || !selectedLanguage) return;

    setIsTranslating(true);
    try {
      const result = await promptsApi.translate(promptText.trim(), selectedLanguage);
      if (result.success && result.translatedText) {
        setPromptText(result.translatedText);
        const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || selectedLanguage;
        toast.success(`Translated to ${langName}`);
      } else {
        toast.error('Translation failed');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      toast.error(errorMessage);
    } finally {
      setIsTranslating(false);
    }
  };

  const prompts = data?.prompts || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audio Prompts</h1>
          <p className="text-muted-foreground">
            Create TTS prompts or upload audio files for your IVR system
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Audio
          </Button>
        </div>
      </div>

      {/* Hidden audio element for saved prompts */}
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

      {/* TTS Creator Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Create TTS Prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name and Text */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prompt-name">Prompt Name</Label>
              <Input
                id="prompt-name"
                placeholder="e.g., Welcome Message"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="prompt-text">Text to Speak</Label>
              <Textarea
                id="prompt-text"
                placeholder="Enter the text you want to convert to speech..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
              />
              {/* Translate button - shows when text exists and non-English language selected */}
              {promptText.trim() && selectedLanguage && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="gap-2"
                  >
                    {isTranslating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Translating...
                      </>
                    ) : (
                      <>
                        <Languages className="h-4 w-4" />
                        Translate to {LANGUAGES.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-3">
            <Label>TTS Provider</Label>
            <div className="flex flex-wrap gap-2">
              {TTS_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id as TTSProvider)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    provider === p.id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Language
            </Label>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.slice(0, 12).map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5',
                    selectedLanguage === lang.code
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
              {availableLanguages.length > 12 && (
                <span className="px-3 py-1.5 text-sm text-muted-foreground">
                  +{availableLanguages.length - 12} more
                </span>
              )}
            </div>
          </div>

          {/* Voice Selection */}
          {displayVoices.length > 0 ? (
            <div className="space-y-3">
              {/* ElevenLabs multilingual info */}
              {provider === 'elevenlabs' && (
                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-sm">
                  <p className="text-purple-700 dark:text-purple-300">
                    <strong>Multilingual v2:</strong> All voices below can speak <strong>{selectedLanguage ? LANGUAGES.find(l => l.code === selectedLanguage)?.name : 'any language'}</strong> fluently.
                    The accent label shows the voice's native style, but it will speak naturally in your selected language.
                  </p>
                </div>
              )}
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Select Voice
                <span className="text-muted-foreground font-normal">
                  (click to preview{promptText ? ' your text' : ''})
                </span>
              </Label>

              {/* Message when no local TTS voices are installed */}
              {(provider === 'piper' || provider === 'kokoro') && displayVoices.length === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">No voices installed</p>
                    <p className="text-sm opacity-80">
                      Go to <a href="/settings/ai-providers" className="underline font-medium">AI Providers</a> and install {provider === 'piper' ? 'Piper' : 'Kokoro'} voice models first.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {displayVoices.map((voice) => {
                  const isSelected = selectedVoice === voice.id;
                  const isPlaying = previewingVoice === voice.id;

                  return (
                    <button
                      key={voice.id}
                      onClick={() => {
                        setSelectedVoice(voice.id);
                        handlePlayVoice(voice.id, voice.name);
                      }}
                      className={cn(
                        'group relative p-3 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-md'
                          : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-10 w-10 rounded-full flex items-center justify-center text-lg',
                            voice.gender === 'female' ? 'bg-pink-100 dark:bg-pink-900/30' :
                            voice.gender === 'male' ? 'bg-blue-100 dark:bg-blue-900/30' :
                            'bg-purple-100 dark:bg-purple-900/30'
                          )}
                        >
                          {isPlaying ? (
                            loadingPreview ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Pause className="h-5 w-5" />
                            )
                          ) : (
                            <span>{voice.gender === 'female' ? '👩' : voice.gender === 'male' ? '👨' : '🧑'}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn('font-medium text-sm truncate', isSelected && 'text-primary')}>
                            {voice.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {voice.description}
                          </div>
                        </div>
                      </div>

                      {/* Play indicator */}
                      {isPlaying && !loadingPreview && (
                        <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : provider === 'elevenlabs' ? (
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Configure your ElevenLabs API key in Settings to see voices
              </p>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={handleCreatePrompt}
              disabled={createTTSMutation.isPending || !promptName.trim() || !promptText.trim()}
            >
              {createTTSMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Prompt
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Prompts */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Volume2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Saved Prompts</h3>
            <p className="text-muted-foreground">
              Create your first TTS prompt above or upload an audio file
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Saved Prompts ({prompts.length})</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {prompts.map((prompt) => (
              <Card
                key={prompt.id}
                className={cn('hover:shadow-md transition-shadow', playingId === prompt.id && 'ring-2 ring-primary')}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{prompt.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                          {prompt.type === 'tts' ? 'TTS' : 'Uploaded'}
                        </span>
                        {prompt.voice && (
                          <span className="text-xs text-muted-foreground">
                            {prompt.voice}
                          </span>
                        )}
                      </div>
                    </div>
                    {prompt.type === 'tts' ? (
                      <Mic className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <FileAudio className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  {prompt.type === 'tts' && prompt.text && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      "{prompt.text}"
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handlePlay(prompt)}
                    >
                      {playingId === prompt.id ? (
                        <>
                          <Square className="h-3 w-3 mr-1" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 mr-1" />
                          Play
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        setPromptToDelete(prompt);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Audio</DialogTitle>
            <DialogDescription>
              Upload an audio file (WAV, MP3, OGG, or GSM)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="upload-name">Prompt Name (optional)</Label>
              <Input
                id="upload-name"
                placeholder="Leave empty to use filename"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-file">Audio File</Label>
              <Input
                id="upload-file"
                type="file"
                accept=".wav,.mp3,.ogg,.gsm"
                ref={fileInputRef}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Supported: WAV, MP3, OGG, GSM (max 50MB)
              </p>
            </div>

            {uploadFile && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{uploadFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !uploadFile}>
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Prompt"
        description={`Are you sure you want to delete "${promptToDelete?.name}"? This will also delete the audio file.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => promptToDelete && deleteMutation.mutate(promptToDelete.id)}
        loading={deleteMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audio Prompts Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are Audio Prompts?</h4>
              <p className="text-sm text-muted-foreground">
                Audio prompts are pre-recorded or generated audio files used in your IVR menus, queues, and voicemail greetings. They provide professional announcements to callers.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Creating TTS Prompts</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Provider:</strong> Choose from OpenAI, ElevenLabs, Deepgram, Piper, Google, or Cartesia</li>
                <li><strong>Language:</strong> Select the language for the voice</li>
                <li><strong>Voice:</strong> Click a voice card to preview it</li>
                <li><strong>Text:</strong> Enter what you want spoken, then save</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Uploading Audio</h4>
              <p className="text-sm text-muted-foreground">
                Upload your own audio files in WAV, MP3, OGG, or GSM format. Files are automatically converted to the format required by Asterisk.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Using Prompts</h4>
              <p className="text-sm text-muted-foreground">
                Once created, prompts can be selected in IVR menus (as greetings), queues (as hold music or join announcements), and settings (as default hold music).
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">TTS Providers</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Piper:</strong> Free, runs locally - no API key needed</li>
                <li><strong>Others:</strong> Require API keys configured in AI Providers</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
