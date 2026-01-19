'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  Play,
  Trash2,
  Volume2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import type { LocalTtsProvider, LocalTtsModel } from '@/lib/constants/local-tts-providers';

interface LocalTtsCardProps {
  provider: LocalTtsProvider;
  installedModels: string[];
  selectedVoice?: string;
  isInstalling: boolean;
  installProgress?: number;
  onInstall: (modelIds: string[]) => void;
  onUninstall: (modelId: string) => void;
  onTest: (modelId: string) => void;
  onSelectVoice: (modelId: string) => void;
}

// Provider icon
function ProviderIcon({ provider, className = "h-8 w-8" }: { provider: string; className?: string }) {
  if (provider === 'piper') {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="20" fill="#6366F1"/>
        <path d="M30 70V30h15c11 0 20 9 20 20s-9 20-20 20H30z" fill="white"/>
        <circle cx="70" cy="50" r="10" fill="white"/>
      </svg>
    );
  }
  if (provider === 'kokoro') {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="20" fill="#EC4899"/>
        <path d="M50 25c-15 0-25 12-25 25 0 18 25 30 25 30s25-12 25-30c0-13-10-25-25-25z" fill="white"/>
      </svg>
    );
  }
  return <Volume2 className={className} />;
}

// Quality badge color
function getQualityColor(quality: string): string {
  switch (quality) {
    case 'high': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'medium': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'low': return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    default: return '';
  }
}

export function LocalTtsCard({
  provider,
  installedModels,
  selectedVoice,
  isInstalling,
  installProgress,
  onInstall,
  onUninstall,
  onTest,
  onSelectVoice,
}: LocalTtsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [testingModel, setTestingModel] = useState<string | null>(null);

  const hasModels = installedModels.length > 0;
  const isConfigured = hasModels && selectedVoice;

  // Group models by language
  const modelsByLanguage = provider.models.reduce((acc, model) => {
    const lang = model.language;
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(model);
    return acc;
  }, {} as Record<string, LocalTtsModel[]>);

  const handleTestVoice = async (modelId: string) => {
    setTestingModel(modelId);
    try {
      await onTest(modelId);
    } finally {
      setTestingModel(null);
    }
  };

  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleInstallSelected = () => {
    if (selectedModels.length === 0) {
      toast.error('Please select at least one model to install');
      return;
    }
    onInstall(selectedModels);
    setSelectedModels([]);
  };

  const isAvailable = provider.available !== false;

  return (
    <Card className={`${isConfigured ? 'border-green-200 dark:border-green-800' : ''} ${!isAvailable ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white border shadow-sm">
              <ProviderIcon provider={provider.id} className="h-8 w-8" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {provider.name}
                {!isAvailable ? (
                  <Badge variant="outline" className="text-orange-600 border-orange-200 dark:border-orange-800">
                    Coming Soon
                  </Badge>
                ) : isConfigured ? (
                  <Badge variant="outline" className="text-green-600 border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : hasModels ? (
                  <Badge variant="outline" className="text-blue-600 border-blue-200 dark:border-blue-800">
                    <HardDrive className="h-3 w-3 mr-1" />
                    {installedModels.length} installed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not installed
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {provider.badge}
                </Badge>
              </CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </div>
          </div>
          <a
            href={provider.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Learn more
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Features */}
        <div className="flex flex-wrap gap-2">
          {provider.features.map((feature) => (
            <Badge key={feature} variant="secondary" className="text-xs">
              {feature}
            </Badge>
          ))}
        </div>

        {/* Voice Selection (if models installed) */}
        {hasModels && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Voice</label>
            <div className="flex items-center gap-2">
              <Select value={selectedVoice || ''} onValueChange={onSelectVoice}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {installedModels.map((modelId) => {
                    const model = provider.models.find(m => m.id === modelId);
                    return (
                      <SelectItem key={modelId} value={modelId}>
                        <div className="flex items-center gap-2">
                          <span>{model?.name || modelId}</span>
                          <span className="text-xs text-muted-foreground">
                            ({model?.language})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedVoice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestVoice(selectedVoice)}
                  disabled={testingModel === selectedVoice}
                >
                  {testingModel === selectedVoice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Install Progress */}
        {isInstalling && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Downloading models...</span>
              <span>{installProgress}%</span>
            </div>
            <Progress value={installProgress} className="h-2" />
          </div>
        )}

        {/* Model Picker (Collapsible) */}
        <Collapsible open={isExpanded} onOpenChange={isAvailable ? setIsExpanded : undefined}>
          <CollapsibleTrigger asChild disabled={!isAvailable}>
            <Button variant="outline" className="w-full justify-between" disabled={!isAvailable}>
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                {!isAvailable ? 'Coming Soon' : hasModels ? 'Manage Voice Models' : 'Install Voice Models'}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4">
            {/* Models by Language */}
            {Object.entries(modelsByLanguage).map(([language, models]) => (
              <div key={language} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {language}
                </h4>
                <div className="grid gap-2">
                  {models.map((model) => {
                    const isInstalled = installedModels.includes(model.id);
                    const isSelected = selectedModels.includes(model.id);

                    return (
                      <div
                        key={model.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-border'
                        } ${isInstalled ? 'bg-muted/50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {!isInstalled && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleModelSelection(model.id)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.name}</span>
                              <Badge className={`text-xs ${getQualityColor(model.quality)}`}>
                                {model.quality}
                              </Badge>
                              {isInstalled && (
                                <Badge variant="outline" className="text-xs text-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Installed
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {model.description} • {model.size}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isInstalled ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTestVoice(model.id)}
                                disabled={testingModel === model.id}
                              >
                                {testingModel === model.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onUninstall(model.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {model.size}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Install Selected Button */}
            {selectedModels.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedModels.length} model(s) selected
                </span>
                <Button onClick={handleInstallSelected} disabled={isInstalling}>
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Install Selected
                    </>
                  )}
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
