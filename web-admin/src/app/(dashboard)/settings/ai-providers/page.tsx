'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Brain,
  Mic,
  Volume2,
  AlertCircle,
  HelpCircle,
  Download,
  HardDrive,
  Cpu
} from 'lucide-react';
import { aiProvidersApi, localTtsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocalTtsCard } from '@/components/settings/local-tts-card';
import { LOCAL_TTS_PROVIDERS } from '@/lib/constants/local-tts-providers';

// Provider Logos
function ProviderLogo({ provider, className = "h-8 w-8" }: { provider: string; className?: string }) {
  switch (provider) {
    case 'openai':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="#000000">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
      );
    case 'deepgram':
      return (
        <svg className={className} viewBox="0 0 234 234">
          <path fill="#13EF93" d="M117 0L0 67.5v135L117 270l117-67.5v-135L117 0zm0 45l72 41.5v83L117 211l-72-41.5v-83L117 45z"/>
          <circle fill="#13EF93" cx="117" cy="135" r="40"/>
        </svg>
      );
    case 'elevenlabs':
      return (
        <svg className={className} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="20" fill="#000000"/>
          <rect x="25" y="20" width="15" height="60" rx="4" fill="#FFFFFF"/>
          <rect x="60" y="20" width="15" height="60" rx="4" fill="#FFFFFF"/>
        </svg>
      );
    case 'cartesia':
      return (
        <svg className={className} viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="45" stroke="#6366F1" strokeWidth="8" fill="none"/>
          <circle cx="50" cy="50" r="20" fill="#6366F1"/>
        </svg>
      );
    case 'google':
      return (
        <svg className={className} viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    default:
      return <Volume2 className={className} />;
  }
}

interface ProviderConfig {
  name: string;
  key: string;
  type: 'llm' | 'stt' | 'tts';
  description: string;
  getKeyUrl: string;
  required: boolean;
  models?: string[];
  features?: string[];
}

const PROVIDERS: ProviderConfig[] = [
  // OpenAI - Powers the AI Agent via Realtime API (LLM + TTS + STT all-in-one)
  {
    name: 'OpenAI',
    key: 'openai',
    type: 'llm',
    description: 'Powers AI Agents via Realtime API. Handles voice, speech recognition, and AI responses all-in-one.',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    required: true,
    models: ['gpt-4o-realtime-preview', 'gpt-4o', 'gpt-4o-mini'],
    features: ['Realtime voice AI', 'Low latency', 'Function calling', 'Best quality'],
  },
  // Deepgram - STT for recordings/transcription + TTS
  {
    name: 'Deepgram',
    key: 'deepgram',
    type: 'stt',
    description: 'Real-time speech recognition for call transcription. Also provides Aura TTS voices.',
    getKeyUrl: 'https://console.deepgram.com/',
    required: false,
    models: ['nova-2', 'nova-2-phonecall', 'aura-asteria-en'],
    features: ['Real-time streaming', 'Phone-optimized', 'Aura TTS', '$200 free credits'],
  },
  // ElevenLabs - High-quality TTS
  {
    name: 'ElevenLabs',
    key: 'elevenlabs',
    type: 'tts',
    description: 'High-quality neural text-to-speech with natural sounding voices.',
    getKeyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    required: false,
    features: ['Natural voices', 'Voice cloning', 'Multiple languages', 'Emotion control'],
  },
  // Cartesia - Fast TTS
  {
    name: 'Cartesia',
    key: 'cartesia',
    type: 'tts',
    description: 'Sonic model voices - fast and expressive text-to-speech.',
    getKeyUrl: 'https://play.cartesia.ai/console',
    required: false,
    features: ['Ultra low latency', 'Expressive voices', 'Real-time streaming'],
  },
  // Google Cloud TTS
  {
    name: 'Google Cloud TTS',
    key: 'google',
    type: 'tts',
    description: 'Google Neural2 voices for high-quality text-to-speech.',
    getKeyUrl: 'https://console.cloud.google.com/apis/credentials',
    required: false,
    features: ['Neural2 voices', 'Multiple languages', 'SSML support'],
  },
];

function ProviderCard({
  provider,
  configured,
  keyPrefix,
  onSave,
  onTest,
  onRemove,
  isSaving,
  isTesting,
}: {
  provider: ProviderConfig;
  configured: boolean;
  keyPrefix?: string;
  onSave: (key: string) => void;
  onTest: () => void;
  onRemove: () => void;
  isSaving: boolean;
  isTesting: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isEditing, setIsEditing] = useState(!configured);

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }
    onSave(apiKey);
    setApiKey('');
    setIsEditing(false);
  };

  return (
    <Card className={configured ? 'border-green-200 dark:border-green-800' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white border shadow-sm">
              <ProviderLogo provider={provider.key} className="h-8 w-8" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {provider.name}
                {configured ? (
                  <Badge variant="outline" className="text-green-600 border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not configured
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </div>
          </div>
          <a
            href={provider.getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Get API Key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Features */}
        {provider.features && (
          <div className="flex flex-wrap gap-2">
            {provider.features.map((feature) => (
              <Badge key={feature} variant="secondary" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        )}

        {/* Models */}
        {provider.models && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Models:</span> {provider.models.join(', ')}
          </div>
        )}

        {/* Key Input */}
        {configured && !isEditing ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded-md">
              {keyPrefix}...
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Change
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Test'
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`${provider.key}-key`}>API Key</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id={`${provider.key}-key`}
                  type={showKey ? 'text' : 'password'}
                  placeholder={`Enter your ${provider.name} API key`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  'Save & Test'
                )}
              </Button>
              {configured && (
                <Button variant="ghost" onClick={() => {
                  setIsEditing(false);
                  setApiKey('');
                }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AIProvidersPage() {
  const queryClient = useQueryClient();
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [installingProvider, setInstallingProvider] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);

  // Fetch local TTS status
  const { data: localTtsStatus } = useQuery({
    queryKey: ['local-tts-status'],
    queryFn: localTtsApi.getStatus,
    staleTime: 30000, // Cache for 30 seconds
    retry: 2, // Retry failed requests
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Mutations for local TTS operations
  const installMutation = useMutation({
    mutationFn: ({ provider, modelIds }: { provider: string; modelIds: string[] }) =>
      localTtsApi.installModels(provider, modelIds),
    onMutate: ({ provider }) => {
      setInstallingProvider(provider);
      setInstallProgress(0);
      // Simulate progress during installation
      const interval = setInterval(() => {
        setInstallProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      return { interval };
    },
    onSuccess: (result, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['local-tts-status'] });
      toast.success(result.message || `Installed voice models for ${provider}`);
      setInstallProgress(100);
    },
    onError: (error: Error, { provider }) => {
      toast.error(`Failed to install models: ${error.message}`);
    },
    onSettled: (_, __, ___, context) => {
      if (context?.interval) clearInterval(context.interval);
      setTimeout(() => {
        setInstallingProvider(null);
        setInstallProgress(0);
      }, 500);
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: ({ provider, modelId }: { provider: string; modelId: string }) =>
      localTtsApi.uninstallModel(provider, modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-tts-status'] });
      toast.success('Voice model removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove model: ${error.message}`);
    },
  });

  const setVoiceMutation = useMutation({
    mutationFn: ({ provider, modelId }: { provider: string; modelId: string }) =>
      localTtsApi.setVoice(provider, modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-tts-status'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to set voice: ${error.message}`);
    },
  });

  const testVoiceMutation = useMutation({
    mutationFn: ({ provider, modelId }: { provider: string; modelId: string }) =>
      localTtsApi.testVoice(provider, modelId),
    onSuccess: (result) => {
      // Play the generated audio using the public audio endpoint
      if (result.previewId) {
        const audioUrl = `/api/v1/audio/preview/${result.previewId}`;
        const audio = new Audio(audioUrl);
        audio.play().catch((err) => {
          console.error('Failed to play audio:', err);
          toast.error('Failed to play audio - check browser autoplay settings');
        });
      }
      toast.success(result.message || 'Voice test completed');
    },
    onError: (error: Error) => {
      toast.error(`Voice test failed: ${error.message}`);
    },
  });

  // Get local TTS state for a provider
  const getLocalTtsState = (providerId: string) => {
    const providerStatus = localTtsStatus?.[providerId as keyof typeof localTtsStatus];
    return {
      installedModels: providerStatus?.installedModels || [],
      selectedVoice: providerStatus?.selectedVoice || undefined,
      isInstalling: installingProvider === providerId,
      installProgress: installingProvider === providerId ? installProgress : 0,
    };
  };

  // Local TTS handlers
  const handleLocalTtsInstall = async (providerId: string, modelIds: string[]) => {
    installMutation.mutate({ provider: providerId, modelIds });
  };

  const handleLocalTtsUninstall = (providerId: string, modelId: string) => {
    uninstallMutation.mutate({ provider: providerId, modelId });
  };

  const handleLocalTtsTest = async (providerId: string, modelId: string) => {
    testVoiceMutation.mutate({ provider: providerId, modelId });
  };

  const handleLocalTtsSelectVoice = (providerId: string, modelId: string) => {
    setVoiceMutation.mutate({ provider: providerId, modelId });
  };

  const { data: config, isLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: aiProvidersApi.getConfig,
  });

  const saveMutation = useMutation({
    mutationFn: ({ provider, type, apiKey }: { provider: string; type: 'llm' | 'stt' | 'tts'; apiKey: string }) =>
      aiProvidersApi.updateKey(provider, type, apiKey),
    onSuccess: (data, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success(`${provider} API key verified and saved!`);
      setSavingProvider(null);
    },
    onError: (error: Error & { message?: string }, { provider }) => {
      // The error message contains the validation error from the backend
      const errorMsg = error.message || `Invalid ${provider} API key`;
      toast.error(errorMsg);
      setSavingProvider(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ provider, type }: { provider: string; type: 'llm' | 'stt' | 'tts' }) =>
      aiProvidersApi.testProvider(provider, type),
    onSuccess: (result, { provider }) => {
      if (result.status === 'online') {
        toast.success(`${provider} is working correctly`);
      } else {
        toast.error(`${provider} test failed: ${result.error || 'Unknown error'}`);
      }
      setTestingProvider(null);
    },
    onError: (_, { provider }) => {
      toast.error(`Failed to test ${provider}`);
      setTestingProvider(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ provider, type }: { provider: string; type: 'llm' | 'stt' | 'tts' }) =>
      aiProvidersApi.removeKey(provider, type),
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success(`${provider} API key removed`);
    },
    onError: (_, { provider }) => {
      toast.error(`Failed to remove ${provider} API key`);
    },
  });

  const getProviderConfig = (provider: ProviderConfig): { configured: boolean; keyPrefix?: string } => {
    if (!config) return { configured: false };

    const typeConfig = config[provider.type];
    if (!typeConfig) return { configured: false };

    const providerConfig = typeConfig[provider.key as keyof typeof typeConfig] as { configured: boolean; keyPrefix?: string } | undefined;
    return providerConfig || { configured: false };
  };

  const hasOpenAI = config?.llm?.openai?.configured || false;
  const hasDeepgram = config?.stt?.deepgram?.configured || false;
  const hasElevenLabs = config?.tts?.elevenlabs?.configured || false;
  const hasCartesia = config?.tts?.cartesia?.configured || false;
  const hasGoogle = config?.tts?.google?.configured || false;
  const hasLocalTts = localTtsStatus && (
    (localTtsStatus.piper?.installedModels?.length || 0) > 0 ||
    (localTtsStatus.kokoro?.installedModels?.length || 0) > 0
  );
  const ttsConfigured = hasElevenLabs || hasCartesia || hasGoogle || hasLocalTts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Providers</h1>
          <p className="text-muted-foreground">
            Configure cloud API keys and local TTS for AI-powered calling features
          </p>
        </div>
        <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
          <HelpCircle className="h-4 w-4 mr-2" />
          Help
        </Button>
      </div>

      {/* Requirements Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>For AI Agents:</strong> You need an <strong>OpenAI API key</strong> to power AI voice agents.
          OpenAI's Realtime API handles voice input, AI responses, and speech output all-in-one.
          Other TTS providers (ElevenLabs, Cartesia, Google) can be used for prompts and IVR.
        </AlertDescription>
      </Alert>

      {/* Status Summary */}
      {!isLoading && (
        <div className="flex flex-wrap gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${hasOpenAI ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
            <Brain className="h-4 w-4" />
            <span className="text-sm font-medium">
              OpenAI: {hasOpenAI ? 'Ready' : 'Required'}
            </span>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${hasDeepgram ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            <Mic className="h-4 w-4" />
            <span className="text-sm font-medium">
              Deepgram: {hasDeepgram ? 'Ready' : 'Optional'}
            </span>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${ttsConfigured ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            <Volume2 className="h-4 w-4" />
            <span className="text-sm font-medium">
              TTS: {ttsConfigured ? (hasLocalTts ? 'Local' : 'Cloud') : 'Optional'}
            </span>
          </div>
          {hasLocalTts && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              <HardDrive className="h-4 w-4" />
              <span className="text-sm font-medium">
                Local TTS: Ready
              </span>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          {/* Cloud Provider Cards */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Cloud Providers
            </h2>
            {PROVIDERS.map((provider) => {
              const providerConfig = getProviderConfig(provider);
              return (
                <ProviderCard
                  key={`${provider.key}-${provider.type}`}
                  provider={provider}
                  configured={providerConfig.configured}
                  keyPrefix={providerConfig.keyPrefix}
                  onSave={(apiKey) => {
                    setSavingProvider(provider.key);
                    saveMutation.mutate({ provider: provider.key, type: provider.type, apiKey });
                  }}
                  onTest={() => {
                    setTestingProvider(provider.key);
                    testMutation.mutate({ provider: provider.key, type: provider.type });
                  }}
                  onRemove={() => {
                    removeMutation.mutate({ provider: provider.key, type: provider.type });
                  }}
                  isSaving={savingProvider === provider.key}
                  isTesting={testingProvider === provider.key}
                />
              );
            })}
          </div>

          {/* Local TTS Providers */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Local TTS (No API Key Required)
            </h2>
            <p className="text-sm text-muted-foreground">
              Run text-to-speech locally on your server. No cloud API keys needed - completely free and private.
            </p>
            {LOCAL_TTS_PROVIDERS.map((provider) => {
              const state = getLocalTtsState(provider.id);
              return (
                <LocalTtsCard
                  key={provider.id}
                  provider={provider}
                  installedModels={state.installedModels}
                  selectedVoice={state.selectedVoice}
                  isInstalling={state.isInstalling}
                  installProgress={state.installProgress}
                  onInstall={(modelIds) => handleLocalTtsInstall(provider.id, modelIds)}
                  onUninstall={(modelId) => handleLocalTtsUninstall(provider.id, modelId)}
                  onTest={(modelId) => handleLocalTtsTest(provider.id, modelId)}
                  onSelectVoice={(modelId) => handleLocalTtsSelectVoice(provider.id, modelId)}
                />
              );
            })}
          </div>

          {/* Quick Start Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Getting Started
              </CardTitle>
              <CardDescription>
                Follow these steps to set up AI voice agents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: OpenAI */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${hasOpenAI ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${hasOpenAI ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {hasOpenAI ? <CheckCircle2 className="h-4 w-4" /> : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Configure OpenAI</span>
                    {hasOpenAI ? (
                      <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Complete</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Required</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasOpenAI ? (
                      'OpenAI Realtime API is ready for voice conversations'
                    ) : (
                      <>
                        Sign up at{' '}
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          platform.openai.com
                        </a>
                        {' '}and add your API key above
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Step 2: Deepgram */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${hasDeepgram ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-muted/30 border-border'}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${hasDeepgram ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {hasDeepgram ? <CheckCircle2 className="h-4 w-4" /> : '2'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Deepgram for Transcription</span>
                    {hasDeepgram ? (
                      <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Complete</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">Optional</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasDeepgram ? (
                      'Call transcription is enabled with $200 free credits'
                    ) : (
                      <>
                        Get $200 free credits at{' '}
                        <a href="https://console.deepgram.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          console.deepgram.com
                        </a>
                        {' '}for call transcription
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Step 3: TTS */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${ttsConfigured ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-muted/30 border-border'}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${ttsConfigured ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {ttsConfigured ? <CheckCircle2 className="h-4 w-4" /> : '3'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Text-to-Speech</span>
                    {ttsConfigured ? (
                      <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                        {hasLocalTts ? 'Local TTS' : 'Cloud TTS'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">Optional</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {ttsConfigured ? (
                      hasLocalTts ? 'Local TTS models installed - no cloud costs!' : 'Cloud TTS configured for high-quality voices'
                    ) : (
                      'Choose ElevenLabs for quality, or install Piper/Kokoro for free local TTS'
                    )}
                  </p>
                </div>
              </div>

              {/* Summary */}
              {hasOpenAI && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    You're ready to create AI voice agents! Go to AI Agents to get started.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Providers Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Overview</h4>
              <p className="text-sm text-muted-foreground">
                Configure API keys for AI providers that power voice agents, speech-to-text, and text-to-speech features.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Provider Types</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>OpenAI:</strong> Required for AI Agents - uses Realtime API for voice conversations</li>
                <li><strong>Deepgram:</strong> Optional STT for call transcription and Aura TTS voices</li>
                <li><strong>ElevenLabs:</strong> High-quality neural TTS with voice cloning</li>
                <li><strong>Cartesia:</strong> Ultra-low latency TTS with Sonic voices</li>
                <li><strong>Google Cloud:</strong> Neural2 voices for text-to-speech</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Status Indicators</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Green "Configured":</strong> API key is saved and verified</li>
                <li><strong>"Not configured":</strong> No API key set for this provider</li>
                <li><strong>Test button:</strong> Verify your API key is working</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Getting API Keys</h4>
              <p className="text-sm text-muted-foreground">
                Click "Get API Key" next to each provider to open their console. Create an account if needed, then generate an API key to paste here.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
