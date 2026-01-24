'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Bot, Volume2, Settings2, Phone, Loader2, Wrench, Sparkles, Zap, Clock, FileText, ChevronRight } from 'lucide-react';
import { PROMPT_TEMPLATES, CATEGORY_LABELS, getTemplateCategories, type PromptTemplate } from '@/lib/constants/prompt-templates';

interface AIAgent {
  id: string;
  name: string;
  systemPrompt: string;
  greetingText: string;
  voice: string;
  voiceProvider?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModel?: string;
  llmProvider?: string;
  llmModel?: string;
  language: string;
  enabledFunctions: string[];
  enabled: boolean;
}

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  description?: string;
  previewUrl?: string;
}

interface AIAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AIAgent | null;
}

interface FormData {
  name: string;
  systemPrompt: string;
  greetingText: string;
  voice: string;
  voiceProvider: string;
  elevenLabsVoiceId: string;
  elevenLabsModel: string;
  llmProvider: string;
  llmModel: string;
  language: string;
  enabledFunctions: string[];
}

export const REALTIME_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'ash', name: 'Ash', description: 'Clear and direct' },
  { id: 'ballad', name: 'Ballad', description: 'Warm and engaging' },
  { id: 'coral', name: 'Coral', description: 'Friendly and upbeat' },
  { id: 'echo', name: 'Echo', description: 'Soft and reflective' },
  { id: 'sage', name: 'Sage', description: 'Calm and wise' },
  { id: 'shimmer', name: 'Shimmer', description: 'Bright and energetic' },
  { id: 'verse', name: 'Verse', description: 'Expressive and dynamic' },
];

const ELEVENLABS_MODELS = [
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', latency: '~75ms', description: 'Fastest, English-optimized', languages: 8 },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', latency: '~250ms', description: 'Balanced quality and speed', languages: 8 },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', latency: '~500ms', description: 'Best quality, native multilingual', languages: 29 },
];

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-latest'] },
];

// OpenAI Realtime supported languages
const OPENAI_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pl', label: 'Polish' },
  { value: 'ru', label: 'Russian' },
];

// ElevenLabs Multilingual v2 supports 29 languages
const ELEVENLABS_MULTILINGUAL_LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'ko', label: 'Korean', flag: '🇰🇷' },
  { value: 'pt', label: 'Portuguese', flag: '🇧🇷' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'id', label: 'Indonesian', flag: '🇮🇩' },
  { value: 'nl', label: 'Dutch', flag: '🇳🇱' },
  { value: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { value: 'fil', label: 'Filipino', flag: '🇵🇭' },
  { value: 'pl', label: 'Polish', flag: '🇵🇱' },
  { value: 'sv', label: 'Swedish', flag: '🇸🇪' },
  { value: 'bg', label: 'Bulgarian', flag: '🇧🇬' },
  { value: 'ro', label: 'Romanian', flag: '🇷🇴' },
  { value: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { value: 'cs', label: 'Czech', flag: '🇨🇿' },
  { value: 'el', label: 'Greek', flag: '🇬🇷' },
  { value: 'fi', label: 'Finnish', flag: '🇫🇮' },
  { value: 'hr', label: 'Croatian', flag: '🇭🇷' },
  { value: 'ms', label: 'Malay', flag: '🇲🇾' },
  { value: 'sk', label: 'Slovak', flag: '🇸🇰' },
  { value: 'da', label: 'Danish', flag: '🇩🇰' },
  { value: 'ta', label: 'Tamil', flag: '🇮🇳' },
  { value: 'uk', label: 'Ukrainian', flag: '🇺🇦' },
  { value: 'ru', label: 'Russian', flag: '🇷🇺' },
];

// ElevenLabs Flash/Turbo models - English optimized but support others
const ELEVENLABS_BASIC_LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'pt', label: 'Portuguese', flag: '🇧🇷' },
  { value: 'pl', label: 'Polish', flag: '🇵🇱' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳' },
];

const AVAILABLE_FUNCTIONS = [
  { id: 'transfer_call', label: 'Transfer Call', description: 'Transfer to extensions or external numbers' },
  { id: 'end_call', label: 'End Call', description: 'Gracefully end conversations' },
  { id: 'send_dtmf', label: 'Send DTMF', description: 'Send touch-tone digits' },
  { id: 'schedule_callback', label: 'Schedule Callback', description: 'Schedule return calls' },
  { id: 'collect_information', label: 'Collect Information', description: 'Gather and store caller data' },
  { id: 'lookup_customer', label: 'Lookup Customer', description: 'Search CRM for customer info' },
  { id: 'check_business_hours', label: 'Check Business Hours', description: 'Verify if business is open' },
];

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI phone assistant. Your role is to:
- Answer questions professionally and concisely
- Help callers with their inquiries
- Transfer calls when appropriate
- Collect necessary information

Guidelines:
- Keep responses brief and natural for phone conversation
- Be friendly but professional
- Ask clarifying questions if needed
- Never make up information you don't have`;

export function AIAgentDialog({ open, onOpenChange, agent }: AIAgentDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!agent;
  const [testCallDialogOpen, setTestCallDialogOpen] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      greetingText: 'Hello! Thank you for calling. How can I help you today?',
      voice: 'alloy',
      voiceProvider: 'openai_realtime',
      elevenLabsVoiceId: '',
      elevenLabsModel: 'eleven_flash_v2_5',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      language: 'en',
      enabledFunctions: ['transfer_call', 'end_call'],
    },
  });

  const selectedVoice = watch('voice');
  const voiceProvider = watch('voiceProvider');
  const elevenLabsVoiceId = watch('elevenLabsVoiceId');
  const elevenLabsModel = watch('elevenLabsModel');
  const llmProvider = watch('llmProvider');
  const enabledFunctions = watch('enabledFunctions');

  // Fetch ElevenLabs voices when provider is selected
  const { data: elevenLabsVoices, isLoading: voicesLoading } = useQuery({
    queryKey: ['elevenlabs-voices'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ElevenLabsVoice[] }>('/api/v1/ai/elevenlabs/voices');
      return res.data;
    },
    enabled: voiceProvider === 'elevenlabs_full',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    if (agent) {
      reset({
        name: agent.name,
        systemPrompt: agent.systemPrompt,
        greetingText: agent.greetingText,
        voice: agent.voice || 'alloy',
        voiceProvider: agent.voiceProvider || 'openai_realtime',
        elevenLabsVoiceId: agent.elevenLabsVoiceId || '',
        elevenLabsModel: agent.elevenLabsModel || 'eleven_flash_v2_5',
        llmProvider: agent.llmProvider || 'openai',
        llmModel: agent.llmModel || 'gpt-4o',
        language: agent.language || 'en',
        enabledFunctions: agent.enabledFunctions || [],
      });
    } else {
      reset({
        name: '',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        greetingText: 'Hello! Thank you for calling. How can I help you today?',
        voice: 'alloy',
        voiceProvider: 'openai_realtime',
        elevenLabsVoiceId: '',
        elevenLabsModel: 'eleven_flash_v2_5',
        llmProvider: 'openai',
        llmModel: 'gpt-4o',
        language: 'en',
        enabledFunctions: ['transfer_call', 'end_call'],
      });
    }
  }, [agent, reset]);

  // Update LLM model when provider changes
  useEffect(() => {
    const provider = LLM_PROVIDERS.find(p => p.id === llmProvider);
    if (provider && provider.models.length > 0) {
      const currentModel = watch('llmModel');
      if (!provider.models.includes(currentModel)) {
        setValue('llmModel', provider.models[0]);
      }
    }
  }, [llmProvider, setValue, watch]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        systemPrompt: data.systemPrompt,
        greetingText: data.greetingText,
        voice: data.voice,
        voiceProvider: data.voiceProvider,
        elevenLabsVoiceId: data.voiceProvider === 'elevenlabs_full' ? data.elevenLabsVoiceId : undefined,
        elevenLabsModel: data.voiceProvider === 'elevenlabs_full' ? data.elevenLabsModel : undefined,
        llmProvider: data.voiceProvider === 'elevenlabs_full' ? data.llmProvider : undefined,
        llmModel: data.voiceProvider === 'elevenlabs_full' ? data.llmModel : undefined,
        language: data.language,
        enabledFunctions: data.enabledFunctions,
      };

      if (isEditing) {
        const res = await api.put<{ success: boolean; data: AIAgent }>(`/api/v1/ai/agents/${agent.id}`, payload);
        return res.data;
      } else {
        const res = await api.post<{ success: boolean; data: AIAgent }>('/api/v1/ai/agents', payload);
        return res.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast.success(isEditing ? 'Agent updated' : 'Agent created');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save agent');
    },
  });

  const testCallMutation = useMutation({
    mutationFn: async ({ agentId, phoneNumber }: { agentId: string; phoneNumber: string }) => {
      const res = await api.post<{ success: boolean; data: { callUuid: string } }>('/api/v1/ai/calls/outbound', { agentId, phoneNumber });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Test call initiated! Call ID: ${data.callUuid}`);
      setTestCallDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate test call');
    },
  });

  const onSubmit = (data: FormData) => {
    // Validate ElevenLabs voice selection
    if (data.voiceProvider === 'elevenlabs_full' && !data.elevenLabsVoiceId) {
      toast.error('Please select an ElevenLabs voice');
      return;
    }
    mutation.mutate(data);
  };

  const toggleFunction = (fnId: string) => {
    const current = enabledFunctions || [];
    if (current.includes(fnId)) {
      setValue('enabledFunctions', current.filter((f) => f !== fnId));
    } else {
      setValue('enabledFunctions', [...current, fnId]);
    }
  };

  const handleTestCall = () => {
    if (!agent?.id) {
      toast.error('Please save the agent first before testing');
      return;
    }
    setTestCallDialogOpen(true);
  };

  const initiateTestCall = () => {
    if (!testPhoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }
    testCallMutation.mutate({ agentId: agent!.id, phoneNumber: testPhoneNumber });
  };

  // Get selected ElevenLabs voice name for display
  const selectedElevenLabsVoice = elevenLabsVoices?.find(v => v.voiceId === elevenLabsVoiceId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {isEditing ? 'Edit AI Agent' : 'Create AI Agent'}
            </DialogTitle>
            <DialogDescription>
              Configure an AI-powered phone agent
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">
                  <Settings2 className="h-4 w-4 mr-2" />
                  General
                </TabsTrigger>
                <TabsTrigger value="voice">
                  <Volume2 className="h-4 w-4 mr-2" />
                  Voice
                </TabsTrigger>
                <TabsTrigger value="functions">
                  <Wrench className="h-4 w-4 mr-2" />
                  Tools
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[400px] mt-4 pr-4">
                <TabsContent value="general" className="space-y-4">
                  {/* Template Selector */}
                  {!isEditing && (
                    <div className="space-y-3 pb-4 border-b">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Start from Template</Label>
                        <Badge variant="secondary" className="text-[10px]">Optional</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {PROMPT_TEMPLATES.filter(t => t.id !== 'custom').slice(0, 6).map((template) => (
                          <div
                            key={template.id}
                            onClick={() => {
                              setValue('greetingText', template.greeting);
                              setValue('systemPrompt', template.prompt);
                              if (template.suggestedVoice) {
                                setValue('voice', template.suggestedVoice);
                              }
                              toast.success(`Applied "${template.name}" template`);
                            }}
                            className="p-3 rounded-lg border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <h4 className="text-sm font-medium truncate">{template.name}</h4>
                                <p className="text-xs text-muted-foreground truncate">{template.description}</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <Select
                        onValueChange={(templateId) => {
                          const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
                          if (template) {
                            setValue('greetingText', template.greeting);
                            setValue('systemPrompt', template.prompt);
                            if (template.suggestedVoice) {
                              setValue('voice', template.suggestedVoice);
                            }
                            toast.success(`Applied "${template.name}" template`);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Browse all templates..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getTemplateCategories().map((category) => (
                            <div key={category}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                {CATEGORY_LABELS[category] || category}
                              </div>
                              {PROMPT_TEMPLATES.filter(t => t.category === category).map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{template.name}</span>
                                    <span className="text-xs text-muted-foreground">- {template.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="name">Agent Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Customer Support Agent"
                      {...register('name', { required: 'Name is required' })}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select
                      value={watch('language')}
                      onValueChange={(value) => setValue('language', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show different language options based on provider */}
                        {voiceProvider === 'openai_realtime' ? (
                          OPENAI_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))
                        ) : elevenLabsModel === 'eleven_multilingual_v2' ? (
                          ELEVENLABS_MULTILINGUAL_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              <span className="flex items-center gap-2">
                                <span>{lang.flag}</span>
                                <span>{lang.label}</span>
                              </span>
                            </SelectItem>
                          ))
                        ) : (
                          ELEVENLABS_BASIC_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              <span className="flex items-center gap-2">
                                <span>{lang.flag}</span>
                                <span>{lang.label}</span>
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {voiceProvider === 'elevenlabs_full' && elevenLabsModel === 'eleven_multilingual_v2' && (
                      <p className="text-xs text-muted-foreground">
                        Multilingual v2 supports 29 languages with native quality
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="greetingText">Greeting Message *</Label>
                    <Textarea
                      id="greetingText"
                      placeholder="What the agent says when answering"
                      rows={2}
                      {...register('greetingText', { required: 'Greeting is required' })}
                    />
                    {errors.greetingText && (
                      <p className="text-sm text-destructive">{errors.greetingText.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      This is spoken immediately when the call connects
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt *</Label>
                    <Textarea
                      id="systemPrompt"
                      placeholder="Instructions for the AI agent"
                      rows={8}
                      {...register('systemPrompt', { required: 'System prompt is required' })}
                    />
                    {errors.systemPrompt && (
                      <p className="text-sm text-destructive">{errors.systemPrompt.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Define the agent's personality, knowledge, and behavior
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="voice" className="space-y-4">
                  {/* Voice Provider Selection */}
                  <div className="space-y-3">
                    <Label className="text-base">Voice Provider</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* OpenAI Realtime */}
                      <div
                        onClick={() => setValue('voiceProvider', 'openai_realtime')}
                        className={`
                          relative p-4 rounded-xl border-2 cursor-pointer transition-all
                          ${voiceProvider === 'openai_realtime'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                            : 'border-border hover:border-blue-300'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                            <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">OpenAI Realtime</h4>
                              <Badge variant="secondary" className="text-[10px]">Low Latency</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              ~300ms latency, built-in STT + LLM + TTS
                            </p>
                          </div>
                        </div>
                        {voiceProvider === 'openai_realtime' && (
                          <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-blue-500" />
                        )}
                      </div>

                      {/* ElevenLabs */}
                      <div
                        onClick={() => setValue('voiceProvider', 'elevenlabs_full')}
                        className={`
                          relative p-4 rounded-xl border-2 cursor-pointer transition-all
                          ${voiceProvider === 'elevenlabs_full'
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                            : 'border-border hover:border-purple-300'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">ElevenLabs</h4>
                              <Badge variant="secondary" className="text-[10px]">Premium</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              1000s of voices, best quality TTS
                            </p>
                          </div>
                        </div>
                        {voiceProvider === 'elevenlabs_full' && (
                          <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-purple-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* OpenAI Realtime Voices */}
                  {voiceProvider === 'openai_realtime' && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-950/50 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>OpenAI Realtime API:</strong> Ultra-low latency voice with integrated speech recognition, language model, and synthesis.
                        </p>
                      </div>

                      <Label className="text-base">Select Voice</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {REALTIME_VOICES.map((voice) => {
                          const isSelected = selectedVoice === voice.id;
                          const getAvatarUrl = (name: string) => `/avatars/avatar_${name.toLowerCase()}.png`;

                          return (
                            <div
                              key={voice.id}
                              onClick={() => setValue('voice', voice.id)}
                              className={`
                                group relative overflow-hidden rounded-xl border p-3 transition-all duration-300 cursor-pointer
                                ${isSelected
                                  ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-sm'
                                  : 'border-border/50 hover:border-primary/30 hover:bg-muted/30'
                                }
                              `}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 rounded-full overflow-hidden shadow-md shrink-0">
                                  <Image
                                    src={getAvatarUrl(voice.name)}
                                    alt={voice.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <h3 className={`font-semibold text-sm truncate ${isSelected ? 'text-primary' : ''}`}>
                                      {voice.name}
                                    </h3>
                                    {isSelected && (
                                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {voice.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ElevenLabs Settings */}
                  {voiceProvider === 'elevenlabs_full' && (
                    <div className="space-y-4">
                      <div className="bg-purple-50 dark:bg-purple-950/50 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          <strong>ElevenLabs Stack:</strong> Premium voice quality using Scribe STT + external LLM + ElevenLabs TTS.
                        </p>
                      </div>

                      {/* Voice Model Selection */}
                      <div className="space-y-2">
                        <Label>Voice Model</Label>
                        <div className="grid grid-cols-1 gap-2">
                          {ELEVENLABS_MODELS.map((model) => (
                            <div
                              key={model.id}
                              onClick={() => setValue('elevenLabsModel', model.id)}
                              className={`
                                p-3 rounded-lg border cursor-pointer transition-all
                                ${elevenLabsModel === model.id
                                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                                  : 'border-border hover:border-purple-300'
                                }
                              `}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{model.name}</span>
                                    <Badge variant="outline" className="text-[10px]">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {model.latency}
                                    </Badge>
                                    <Badge
                                      variant="secondary"
                                      className={`text-[10px] ${model.languages === 29 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : ''}`}
                                    >
                                      {model.languages} languages
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{model.description}</p>
                                </div>
                                {elevenLabsModel === model.id && (
                                  <div className="h-3 w-3 rounded-full bg-purple-500" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Voice Selection */}
                      <div className="space-y-2">
                        <Label>Voice</Label>
                        {voicesLoading ? (
                          <Skeleton className="h-10 w-full" />
                        ) : elevenLabsVoices && elevenLabsVoices.length > 0 ? (
                          <Select
                            value={elevenLabsVoiceId}
                            onValueChange={(value) => setValue('elevenLabsVoiceId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select an ElevenLabs voice">
                                {selectedElevenLabsVoice?.name || 'Select a voice'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {elevenLabsVoices.map((voice) => (
                                <SelectItem key={voice.voiceId} value={voice.voiceId}>
                                  <div className="flex items-center gap-2">
                                    <span>{voice.name}</span>
                                    <Badge variant="outline" className="text-[10px]">{voice.category}</Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/50 dark:border-amber-800">
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                              No ElevenLabs voices found. Please configure your ElevenLabs API key in Settings.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* LLM Provider */}
                      <div className="space-y-2">
                        <Label>LLM Provider</Label>
                        <Select
                          value={llmProvider}
                          onValueChange={(value) => setValue('llmProvider', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LLM_PROVIDERS.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* LLM Model */}
                      <div className="space-y-2">
                        <Label>LLM Model</Label>
                        <Select
                          value={watch('llmModel')}
                          onValueChange={(value) => setValue('llmModel', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LLM_PROVIDERS.find(p => p.id === llmProvider)?.models.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Language Selection for ElevenLabs */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>TTS Language</Label>
                          {elevenLabsModel === 'eleven_multilingual_v2' && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
                              29 languages available
                            </Badge>
                          )}
                        </div>
                        <Select
                          value={watch('language')}
                          onValueChange={(value) => setValue('language', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {elevenLabsModel === 'eleven_multilingual_v2' ? (
                              ELEVENLABS_MULTILINGUAL_LANGUAGES.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  <span className="flex items-center gap-2">
                                    <span>{lang.flag}</span>
                                    <span>{lang.label}</span>
                                  </span>
                                </SelectItem>
                              ))
                            ) : (
                              ELEVENLABS_BASIC_LANGUAGES.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  <span className="flex items-center gap-2">
                                    <span>{lang.flag}</span>
                                    <span>{lang.label}</span>
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {elevenLabsModel === 'eleven_multilingual_v2'
                            ? 'Native quality in all 29 supported languages'
                            : 'Flash/Turbo models are optimized for English with good quality in major languages'}
                        </p>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4 mt-4 border border-green-200 dark:border-green-800">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Test Call
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Make a test call to hear your AI agent in action
                      </p>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={handleTestCall}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Make Test Call
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="functions" className="space-y-4">
                  <div className="space-y-1 mb-4">
                    <h4 className="font-medium">Available Tools</h4>
                    <p className="text-sm text-muted-foreground">
                      Select which actions the AI agent can perform during conversations
                    </p>
                  </div>

                  <div className="space-y-3">
                    {AVAILABLE_FUNCTIONS.map((fn) => (
                      <div
                        key={fn.id}
                        className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleFunction(fn.id)}
                      >
                        <Checkbox
                          checked={enabledFunctions?.includes(fn.id)}
                          onCheckedChange={() => toggleFunction(fn.id)}
                        />
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium cursor-pointer">
                            {fn.label}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {fn.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Test Call Dialog */}
      <Dialog open={testCallDialogOpen} onOpenChange={setTestCallDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Test AI Agent Call
            </DialogTitle>
            <DialogDescription>
              Enter a phone number to receive a test call from your AI agent
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testPhone">Phone Number</Label>
              <Input
                id="testPhone"
                placeholder="+1234567890"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the full phone number including country code
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestCallDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={initiateTestCall}
              disabled={testCallMutation.isPending || !testPhoneNumber}
              className="bg-green-600 hover:bg-green-700"
            >
              {testCallMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 mr-2" />
                  Call Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
