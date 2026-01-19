'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  GitBranch,
  Workflow,
  Bot,
  MessageSquare,
  Phone,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

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
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const aiAgentsApi = {
  get: async (id: string) => {
    const res = await api.get<ApiResponse<AIAgent>>(`/api/v1/ai/agents/${id}`);
    return res.data;
  },
};

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const { data: agent, isLoading } = useQuery({
    queryKey: ['ai-agent', agentId],
    queryFn: () => aiAgentsApi.get(agentId),
  });

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="h-14 border-b flex items-center px-4 gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="w-96 h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/ai-agents')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="font-semibold">{agent?.name}</h1>
          <Badge variant="outline">Flow Editor</Badge>
        </div>
      </div>

      {/* Coming Soon Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-6">
              {/* Icon */}
              <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Workflow className="h-10 w-10 text-primary" />
              </div>

              {/* Title */}
              <div>
                <Badge variant="secondary" className="mb-3">Coming Soon</Badge>
                <h2 className="text-2xl font-bold tracking-tight">Visual Flow Builder</h2>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Design advanced conversation flows with a drag-and-drop visual editor.
                  Create branching logic, collect information, and build complex AI interactions.
                </p>
              </div>

              {/* Features Preview */}
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto text-left">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <GitBranch className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Branching Logic</p>
                    <p className="text-xs text-muted-foreground">Route calls based on intent</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Data Collection</p>
                    <p className="text-xs text-muted-foreground">Gather structured info</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Call Transfer</p>
                    <p className="text-xs text-muted-foreground">Smart routing to agents</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">AI Responses</p>
                    <p className="text-xs text-muted-foreground">Dynamic LLM-powered nodes</p>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  In the meantime, you can configure your AI agent with a system prompt for linear conversations.
                </p>
                <Button onClick={() => router.push(`/ai-agents/${agentId}`)}>
                  <Bot className="h-4 w-4 mr-2" />
                  Edit Agent Settings
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
