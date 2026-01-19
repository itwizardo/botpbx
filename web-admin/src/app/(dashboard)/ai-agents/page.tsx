'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Edit, Trash2, Phone, Loader2, HelpCircle, Sparkles, BarChart3, GitBranch, Workflow, Zap, Wand2, Check, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AIAgentDialog } from '@/components/ai/agent-dialog';
import { AgentWizard } from '@/components/ai/agent-wizard';
import { AgentAnalytics } from '@/components/ai/agent-analytics';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import { api, trunksApi } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AIAgent {
  id: string;
  name: string;
  systemPrompt: string;
  greetingText: string;
  voice: string;
  language: string;
  enabledFunctions: string[];
  enabled: boolean;
  flowEnabled: number;
  createdAt: number;
  // Voice provider fields
  voiceProvider?: 'openai_realtime' | 'elevenlabs_full';
  elevenLabsVoiceId?: string;
  elevenLabsVoiceName?: string;
  elevenLabsModel?: string;
  llmProvider?: string;
  llmModel?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// AI Agents API
const aiAgentsApi = {
  list: async () => {
    const res = await api.get<ApiResponse<AIAgent[]>>('/api/v1/ai/agents');
    return res.data;
  },
  create: async (data: Partial<AIAgent>) => {
    const res = await api.post<ApiResponse<AIAgent>>('/api/v1/ai/agents', data);
    return res.data;
  },
  update: async (id: string, data: Partial<AIAgent>) => {
    const res = await api.put<ApiResponse<AIAgent>>(`/api/v1/ai/agents/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/v1/ai/agents/${id}`);
  },
  testCall: async (id: string, phoneNumber: string, trunkId?: string) => {
    const res = await api.post<ApiResponse<unknown>>('/api/v1/ai/calls/outbound', {
      agentId: id,
      phoneNumber,
      trunkId,  // Optional: specify which trunk to use
    });
    return res.data;
  },
};

const VOICE_NAMES: Record<string, string> = {
  alloy: 'Alloy',
  ash: 'Ash',
  ballad: 'Ballad',
  coral: 'Coral',
  echo: 'Echo',
  sage: 'Sage',
  shimmer: 'Shimmer',
  verse: 'Verse',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  pl: 'Polish',
  ru: 'Russian',
  // Additional ElevenLabs Multilingual v2 languages
  hi: 'Hindi',
  id: 'Indonesian',
  tr: 'Turkish',
  fil: 'Filipino',
  sv: 'Swedish',
  bg: 'Bulgarian',
  ro: 'Romanian',
  ar: 'Arabic',
  cs: 'Czech',
  el: 'Greek',
  fi: 'Finnish',
  hr: 'Croatian',
  ms: 'Malay',
  sk: 'Slovak',
  da: 'Danish',
  ta: 'Tamil',
  uk: 'Ukrainian',
};

const ELEVENLABS_MODEL_NAMES: Record<string, string> = {
  'eleven_flash_v2_5': 'Flash',
  'eleven_turbo_v2_5': 'Turbo',
  'eleven_multilingual_v2': 'Multilingual',
};

export default function AIAgentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('agents');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AIAgent | null>(null);
  const [testCallDialogOpen, setTestCallDialogOpen] = useState(false);
  const [agentToTest, setAgentToTest] = useState<AIAgent | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testTrunkId, setTestTrunkId] = useState<string>('');
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [createMethodOpen, setCreateMethodOpen] = useState(false);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['ai-agents'],
    queryFn: aiAgentsApi.list,
  });

  // Fetch trunks for test call trunk selection
  const { data: trunksData } = useQuery({
    queryKey: ['trunks'],
    queryFn: trunksApi.list,
  });
  const enabledTrunks = trunksData?.trunks?.filter((t: { enabled: boolean }) => t.enabled) || [];

  const toggleMutation = useMutation({
    mutationFn: (agent: AIAgent) =>
      aiAgentsApi.update(agent.id, { enabled: !agent.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast.success('Agent updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update agent');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => aiAgentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast.success('Agent deleted');
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete agent');
    },
  });

  const testCallMutation = useMutation({
    mutationFn: ({ agentId, phoneNumber, trunkId }: { agentId: string; phoneNumber: string; trunkId?: string }) =>
      aiAgentsApi.testCall(agentId, phoneNumber, trunkId),
    onSuccess: () => {
      toast.success('Call initiated! You will receive a call shortly.');
      setTestCallDialogOpen(false);
      setAgentToTest(null);
      setTestPhoneNumber('');
      setTestTrunkId('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate test call');
    },
  });

  // Create agent and redirect to flow builder
  const createFlowAgentMutation = useMutation({
    mutationFn: (data: Partial<AIAgent>) => aiAgentsApi.create(data),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setCreateMethodOpen(false);
      router.push(`/ai-agents/${agent.id}/flow`);
      toast.success('Agent created! Now design your flow.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create agent');
    },
  });

  const handleTestCall = (agent: AIAgent) => {
    if (!agent.enabled) {
      toast.error('Enable the agent first before testing');
      return;
    }
    setAgentToTest(agent);
    setTestCallDialogOpen(true);
  };

  const initiateTestCall = () => {
    if (!testPhoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }
    if (agentToTest) {
      testCallMutation.mutate({
        agentId: agentToTest.id,
        phoneNumber: testPhoneNumber,
        // __auto__ means use first available trunk (don't pass trunkId)
        trunkId: testTrunkId && testTrunkId !== '__auto__' ? testTrunkId : undefined,
      });
    }
  };

  const handleCreate = () => {
    setSelectedAgent(null);
    setDialogOpen(true);
  };

  const handleEdit = (agent: AIAgent) => {
    setSelectedAgent(agent);
    setDialogOpen(true);
  };

  const handleDeleteClick = (agent: AIAgent) => {
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (agentToDelete) {
      deleteMutation.mutate(agentToDelete.id);
    }
  };

  const handleCreateWithFlow = () => {
    // Create a new agent with default values and redirect to flow editor
    createFlowAgentMutation.mutate({
      name: `Flow Agent ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      systemPrompt: 'You are a helpful AI assistant. Follow the conversation flow to assist the caller.',
      greetingText: 'Hello! Thank you for calling. How can I help you today?',
      voice: 'alloy',
      language: 'en',
      enabledFunctions: ['end_call', 'transfer_to_extension'],
      enabled: false, // Start disabled until flow is configured
    });
  };

  const handleSelectCreateMethod = (method: 'flow' | 'quick' | 'wizard') => {
    setCreateMethodOpen(false);
    switch (method) {
      case 'flow':
        handleCreateWithFlow();
        break;
      case 'quick':
        handleCreate();
        break;
      case 'wizard':
        setWizardOpen(true);
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-muted-foreground">
            Create and manage AI-powered phone agents using OpenAI Realtime API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          {activeTab === 'agents' && (
            <Button onClick={() => setCreateMethodOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4 mt-4">
          {/* Info Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-100">AI Voice Agents</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Choose from <strong>OpenAI Realtime</strong> for ultra-low latency (~300ms) or <strong>ElevenLabs</strong> for premium voice quality with 1000+ voices.
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : agents?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No AI Agents Yet</h3>
          <p className="mb-4">Create your first AI agent to handle phone conversations</p>
          <Button onClick={() => setCreateMethodOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create AI Agent
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <Card key={agent.id} className={!agent.enabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${agent.enabled ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <Bot className={`h-5 w-5 ${agent.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        {agent.flowEnabled ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-300">
                            <GitBranch className="h-3 w-3 mr-0.5" />
                            Flow
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="text-xs">
                        {LANGUAGE_NAMES[agent.language] || agent.language}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={agent.enabled}
                    onCheckedChange={() => toggleMutation.mutate(agent)}
                    disabled={toggleMutation.isPending}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Greeting Preview */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    "{agent.greetingText}"
                  </p>
                </div>

                {/* Provider & Voice Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  {agent.voiceProvider === 'elevenlabs_full' ? (
                    <>
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700">
                        ElevenLabs
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {agent.elevenLabsVoiceName || 'Default Voice'}
                      </Badge>
                      {agent.elevenLabsModel && (
                        <span className="text-xs text-muted-foreground">
                          {ELEVENLABS_MODEL_NAMES[agent.elevenLabsModel] || agent.elevenLabsModel}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
                        OpenAI Realtime
                      </Badge>
                      <Badge variant="secondary">
                        {VOICE_NAMES[agent.voice] || agent.voice}
                      </Badge>
                    </>
                  )}
                </div>

                {/* Functions */}
                {agent.enabledFunctions && agent.enabledFunctions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.enabledFunctions.slice(0, 3).map((fn) => (
                      <Badge key={fn} variant="outline" className="text-xs">
                        {fn.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                    {agent.enabledFunctions.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{agent.enabledFunctions.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleTestCall(agent)}
                    disabled={!agent.enabled}
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    Test Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <Link href={`/ai-agents/${agent.id}/flow`}>
                      <GitBranch className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(agent)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDeleteClick(agent)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AgentAnalytics />
        </TabsContent>
      </Tabs>

      <AIAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={selectedAgent}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete AI Agent"
        description={`Are you sure you want to delete "${agentToDelete?.name}"? This will remove all configuration for this agent. Conversation history will be preserved.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Test Call Dialog */}
      <Dialog open={testCallDialogOpen} onOpenChange={setTestCallDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-green-600" />
              Test AI Agent Call
            </DialogTitle>
            <DialogDescription>
              Enter your phone number to receive a test call from <strong>{agentToTest?.name}</strong>.
              The AI agent will greet you and have a conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testPhone">Your Phone Number</Label>
              <Input
                id="testPhone"
                placeholder="+31612345678"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && initiateTestCall()}
              />
              <p className="text-xs text-muted-foreground">
                Enter full phone number with country code (e.g., +31 for Netherlands)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="testTrunk">SIP Trunk</Label>
              <Select value={testTrunkId} onValueChange={setTestTrunkId}>
                <SelectTrigger id="testTrunk">
                  <SelectValue placeholder="Auto (first available)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (first available)</SelectItem>
                  {enabledTrunks.map((trunk: { id: string; name: string }) => (
                    <SelectItem key={trunk.id} value={trunk.id}>
                      {trunk.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select which trunk to use for the outgoing call
              </p>
            </div>
            {agentToTest && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Agent will say:</p>
                <p className="text-sm text-muted-foreground italic">
                  "{agentToTest.greetingText}"
                </p>
                <div className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">Voice:</span>
                  <span className="font-medium">{VOICE_NAMES[agentToTest.voice] || agentToTest.voice}</span>
                </div>
              </div>
            )}
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
                  Call Me Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Method Dialog */}
      <Dialog open={createMethodOpen} onOpenChange={setCreateMethodOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create AI Agent</DialogTitle>
            <DialogDescription>
              Choose the creation method that fits your needs
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            {/* Flow Builder Card */}
            <button
              onClick={() => handleSelectCreateMethod('flow')}
              disabled={createFlowAgentMutation.isPending}
              className="group flex flex-col items-start p-4 rounded-lg border hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all text-left"
            >
              <Badge variant="secondary" className="mb-3 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                Professional
              </Badge>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900 mb-3">
                <Workflow className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold mb-1">Flow Builder</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Visual drag-and-drop canvas for designing complex conversational flows with branching logic.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                {['Drag & drop node editor', 'Branch on intent or keywords', 'Transfer, collect info, play audio', 'Visual flow validation', 'Import/export flows'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-amber-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t w-full flex items-center justify-between text-sm">
                <span className="text-amber-600 dark:text-amber-400 font-medium">Start Building</span>
                <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </button>

            {/* Quick Create Card */}
            <button
              onClick={() => handleSelectCreateMethod('quick')}
              className="group flex flex-col items-start p-4 rounded-lg border hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all text-left"
            >
              <Badge variant="secondary" className="mb-3 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                Fast
              </Badge>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900 mb-3">
                <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold mb-1">Quick Create</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Simple form to create a conversational AI agent in under 30 seconds.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                {['Ready in 30 seconds', 'Essential settings only', 'AI-powered conversations', 'Enable/disable anytime', 'Test call instantly'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-blue-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t w-full flex items-center justify-between text-sm">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Create Now</span>
                <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </button>

            {/* Wizard Card */}
            <button
              onClick={() => handleSelectCreateMethod('wizard')}
              className="group flex flex-col items-start p-4 rounded-lg border hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all text-left"
            >
              <Badge variant="secondary" className="mb-3 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                Guided
              </Badge>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900 mb-3">
                <Wand2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold mb-1">Setup Wizard</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Step-by-step guided experience with templates and AI assistance.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                {['Step-by-step guidance', 'Pre-built templates', 'AI prompt suggestions', 'Best for beginners', 'Customizable presets'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-purple-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t w-full flex items-center justify-between text-sm">
                <span className="text-purple-600 dark:text-purple-400 font-medium">Start Wizard</span>
                <ArrowRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Agents Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are AI Agents?</h4>
              <p className="text-sm text-muted-foreground">
                AI Agents are intelligent phone assistants powered by OpenAI's Realtime API. They can answer calls, have natural conversations, and perform actions like transferring calls or collecting information.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Creating an Agent</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Name:</strong> A descriptive name for the agent</li>
                <li><strong>System Prompt:</strong> Instructions that define the agent's personality and behavior</li>
                <li><strong>Greeting:</strong> What the agent says when answering a call</li>
                <li><strong>Voice:</strong> The OpenAI voice for the agent (e.g., Alloy, Coral)</li>
                <li><strong>Language:</strong> Primary language for the conversation</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Functions</h4>
              <p className="text-sm text-muted-foreground">
                Enable functions to give the agent abilities like transferring calls, hanging up, collecting information, or integrating with external APIs.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Test Calls</h4>
              <p className="text-sm text-muted-foreground">
                Use the "Test Call" button to receive a call from your AI agent. Enter your phone number and the agent will call you to demonstrate its capabilities.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Requirements</h4>
              <p className="text-sm text-muted-foreground">
                Requires an OpenAI API key with access to the Realtime API configured in AI Providers settings.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Creation Wizard */}
      <AgentWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
