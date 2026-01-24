'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Headphones,
  TrendingUp,
  Calendar,
  HelpCircle,
  Moon,
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Bot,
  Volume2,
  Play,
} from 'lucide-react';
import { aiTemplatesApi, type AIAgentTemplate, type TemplateCategory } from '@/lib/api';
import { VoicePreview } from './voice-preview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Voice options for OpenAI Realtime
const VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'ash', name: 'Ash', description: 'Warm and friendly' },
  { id: 'ballad', name: 'Ballad', description: 'Soft and melodic' },
  { id: 'coral', name: 'Coral', description: 'Bright and energetic' },
  { id: 'echo', name: 'Echo', description: 'Clear and professional' },
  { id: 'sage', name: 'Sage', description: 'Calm and wise' },
  { id: 'shimmer', name: 'Shimmer', description: 'Enthusiastic and upbeat' },
  { id: 'verse', name: 'Verse', description: 'Expressive and dynamic' },
];

// Available functions
const FUNCTIONS = [
  { id: 'transfer_to_extension', name: 'Transfer to Extension', description: 'Transfer call to a specific extension' },
  { id: 'transfer_to_queue', name: 'Transfer to Queue', description: 'Transfer call to a queue' },
  { id: 'collect_information', name: 'Collect Information', description: 'Gather caller details' },
  { id: 'schedule_callback', name: 'Schedule Callback', description: 'Schedule a return call' },
  { id: 'send_sms', name: 'Send SMS', description: 'Send a text message' },
  { id: 'end_call', name: 'End Call', description: 'Gracefully end the conversation' },
];

// Category icons map
const CATEGORY_ICONS: Record<string, typeof Headphones> = {
  'customer-support': Headphones,
  sales: TrendingUp,
  appointments: Calendar,
  faq: HelpCircle,
  'after-hours': Moon,
  custom: Settings,
};

interface AgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type WizardStep = 'category' | 'template' | 'customize' | 'review';

interface WizardState {
  category: string | null;
  template: AIAgentTemplate | null;
  name: string;
  systemPrompt: string;
  greetingText: string;
  voice: string;
  enabledFunctions: string[];
}

const initialState: WizardState = {
  category: null,
  template: null,
  name: '',
  systemPrompt: '',
  greetingText: '',
  voice: 'alloy',
  enabledFunctions: [],
};

export function AgentWizard({ open, onOpenChange, onSuccess }: AgentWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('category');
  const [state, setState] = useState<WizardState>(initialState);

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['ai-template-categories'],
    queryFn: aiTemplatesApi.getCategories,
    enabled: open,
  });

  // Fetch templates for selected category
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['ai-templates', state.category],
    queryFn: () => aiTemplatesApi.list(state.category || undefined),
    enabled: open && !!state.category,
  });

  // Create agent mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (state.template) {
        // Create from template
        return aiTemplatesApi.createAgentFromTemplate(state.template.id, state.name, {
          systemPrompt: state.systemPrompt !== state.template.systemPrompt ? state.systemPrompt : undefined,
          greetingText: state.greetingText !== state.template.greetingText ? state.greetingText : undefined,
          voice: state.voice !== state.template.voice ? state.voice : undefined,
          enabledFunctions: state.enabledFunctions,
        });
      } else {
        // Create custom agent via regular API
        const res = await fetch('/api/v1/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: state.name,
            systemPrompt: state.systemPrompt,
            greetingText: state.greetingText,
            voice: state.voice,
            enabledFunctions: state.enabledFunctions,
          }),
        });
        return res.json();
      }
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('AI Agent created successfully!');
        queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
        handleClose();
        onSuccess?.();
      } else {
        toast.error(data.error || 'Failed to create agent');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create agent');
    },
  });

  const handleClose = () => {
    setStep('category');
    setState(initialState);
    onOpenChange(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    setState((prev) => ({ ...prev, category: categoryId }));
    setStep('template');
  };

  const handleTemplateSelect = (template: AIAgentTemplate | null) => {
    if (template) {
      setState((prev) => ({
        ...prev,
        template,
        name: '',
        systemPrompt: template.systemPrompt,
        greetingText: template.greetingText,
        voice: template.voice,
        enabledFunctions: template.enabledFunctions,
      }));
    } else {
      // Custom/blank template
      setState((prev) => ({
        ...prev,
        template: null,
        name: '',
        systemPrompt: '',
        greetingText: '',
        voice: 'alloy',
        enabledFunctions: [],
      }));
    }
    setStep('customize');
  };

  const handleBack = () => {
    if (step === 'template') setStep('category');
    else if (step === 'customize') setStep('template');
    else if (step === 'review') setStep('customize');
  };

  const handleNext = () => {
    if (step === 'customize') {
      if (!state.name.trim()) {
        toast.error('Please enter a name for your agent');
        return;
      }
      if (!state.systemPrompt.trim()) {
        toast.error('Please enter a system prompt');
        return;
      }
      if (!state.greetingText.trim()) {
        toast.error('Please enter a greeting');
        return;
      }
      setStep('review');
    }
  };

  const toggleFunction = (funcId: string) => {
    setState((prev) => ({
      ...prev,
      enabledFunctions: prev.enabledFunctions.includes(funcId)
        ? prev.enabledFunctions.filter((f) => f !== funcId)
        : [...prev.enabledFunctions, funcId],
    }));
  };

  const categories = categoriesData?.data || [];
  const templates = templatesData?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create AI Agent
          </DialogTitle>
          <DialogDescription>
            {step === 'category' && 'Choose what your AI agent will do'}
            {step === 'template' && 'Select a template or start from scratch'}
            {step === 'customize' && 'Customize your agent'}
            {step === 'review' && 'Review and create your agent'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 py-4">
          {(['category', 'template', 'customize', 'review'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : ['category', 'template', 'customize', 'review'].indexOf(step) > i
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {['category', 'template', 'customize', 'review'].indexOf(step) > i ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div
                  className={cn(
                    'w-12 h-0.5 mx-1',
                    ['category', 'template', 'customize', 'review'].indexOf(step) > i
                      ? 'bg-primary/50'
                      : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Step 1: Category Selection */}
          {step === 'category' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.id] || Settings;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className={cn(
                      'p-4 rounded-lg border text-left transition-all hover:border-primary hover:bg-primary/5',
                      state.category === cat.id && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{cat.description}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Template Selection */}
          {step === 'template' && (
            <div className="space-y-4">
              {templatesLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Custom/blank option */}
                  <button
                    onClick={() => handleTemplateSelect(null)}
                    className={cn(
                      'p-4 rounded-lg border text-left transition-all hover:border-primary hover:bg-primary/5',
                      !state.template && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Settings className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="font-medium">Start from Scratch</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Build a custom agent with your own prompts</p>
                  </button>

                  {/* Template options */}
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all hover:border-primary hover:bg-primary/5',
                        state.template?.id === template.id && 'border-primary bg-primary/5'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Bot className="h-5 w-5 text-primary" />
                          </div>
                          <span className="font-medium">{template.name}</span>
                        </div>
                        {template.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Customize */}
          {step === 'customize' && (
            <div className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Customer Support Bot"
                  value={state.name}
                  onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="Describe how the AI should behave..."
                  rows={4}
                  value={state.systemPrompt}
                  onChange={(e) => setState((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  This defines the AI's personality and behavior during calls
                </p>
              </div>

              {/* Greeting */}
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea
                  id="greeting"
                  placeholder="What the AI says when answering..."
                  rows={2}
                  value={state.greetingText}
                  onChange={(e) => setState((prev) => ({ ...prev, greetingText: e.target.value }))}
                />
              </div>

              {/* Voice Selection with Preview */}
              <VoicePreview
                selectedVoice={state.voice}
                onVoiceSelect={(voice) => setState((prev) => ({ ...prev, voice }))}
                compact
              />

              {/* Functions */}
              <div className="space-y-2">
                <Label>Enabled Functions</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FUNCTIONS.map((func) => (
                    <button
                      key={func.id}
                      onClick={() => toggleFunction(func.id)}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all hover:border-primary',
                        state.enabledFunctions.includes(func.id) && 'border-primary bg-primary/5'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center',
                            state.enabledFunctions.includes(func.id)
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          )}
                        >
                          {state.enabledFunctions.includes(func.id) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="font-medium text-sm">{func.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">{func.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 'review' && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg bg-muted/50 space-y-4">
                <div>
                  <span className="text-sm text-muted-foreground">Name</span>
                  <p className="font-medium">{state.name}</p>
                </div>

                <div>
                  <span className="text-sm text-muted-foreground">Voice</span>
                  <p className="font-medium capitalize">{state.voice}</p>
                </div>

                <div>
                  <span className="text-sm text-muted-foreground">System Prompt</span>
                  <p className="text-sm mt-1 p-2 bg-background rounded border">
                    {state.systemPrompt.slice(0, 200)}
                    {state.systemPrompt.length > 200 && '...'}
                  </p>
                </div>

                <div>
                  <span className="text-sm text-muted-foreground">Greeting</span>
                  <p className="text-sm mt-1 p-2 bg-background rounded border">{state.greetingText}</p>
                </div>

                <div>
                  <span className="text-sm text-muted-foreground">Enabled Functions</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {state.enabledFunctions.length > 0 ? (
                      state.enabledFunctions.map((funcId) => {
                        const func = FUNCTIONS.find((f) => f.id === funcId);
                        return (
                          <Badge key={funcId} variant="secondary">
                            {func?.name || funcId}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-sm text-muted-foreground">None selected</span>
                    )}
                  </div>
                </div>

                {state.template && (
                  <div>
                    <span className="text-sm text-muted-foreground">Based on Template</span>
                    <p className="font-medium">{state.template.name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>

          <div className="flex gap-2">
            {step !== 'category' && (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}

            {step === 'customize' && (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 'review' && (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Create Agent
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
