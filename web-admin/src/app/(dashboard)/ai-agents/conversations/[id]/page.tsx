'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  Bot,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ListChecks,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { callSummariesApi, ConversationData, CallSummary } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <Badge variant="outline">Unknown</Badge>;

  const config = {
    positive: { icon: ThumbsUp, className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    neutral: { icon: Minus, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
    negative: { icon: ThumbsDown, className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    mixed: { icon: AlertCircle, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  }[sentiment] || { icon: Minus, className: '' };

  const Icon = config.icon;
  return (
    <Badge className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
    </Badge>
  );
}

function StateBadge({ state }: { state: string }) {
  const config: Record<string, { className: string; label: string }> = {
    completed: { className: 'bg-green-100 text-green-800', label: 'Completed' },
    ended: { className: 'bg-green-100 text-green-800', label: 'Ended' },
    failed: { className: 'bg-red-100 text-red-800', label: 'Failed' },
    transferred: { className: 'bg-blue-100 text-blue-800', label: 'Transferred' },
    abandoned: { className: 'bg-yellow-100 text-yellow-800', label: 'Abandoned' },
  };

  const { className, label } = config[state] || { className: 'bg-gray-100 text-gray-800', label: state };
  return <Badge className={className}>{label}</Badge>;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversationId = params.id as string;

  const [followUpNotes, setFollowUpNotes] = useState('');

  // Fetch conversation data with summary
  const { data, isLoading, error } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => callSummariesApi.getConversationData(conversationId),
  });

  // Generate summary mutation
  const generateMutation = useMutation({
    mutationFn: () => callSummariesApi.generate(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  // Regenerate summary mutation
  const regenerateMutation = useMutation({
    mutationFn: () => callSummariesApi.regenerate(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  // Update follow-up mutation
  const updateFollowUpMutation = useMutation({
    mutationFn: ({ summaryId, followUpNeeded, notes }: { summaryId: string; followUpNeeded: boolean; notes?: string }) =>
      callSummariesApi.updateFollowUp(summaryId, followUpNeeded, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Conversation Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The conversation you're looking for doesn't exist or has been deleted.
            </p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const conversation = data;
  const summary = conversation.summary;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Conversation Details</h1>
            <p className="text-sm text-muted-foreground">
              {formatTimestamp(conversation.startTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state={conversation.state} />
          {conversation.outcome && (
            <Badge variant="outline">{conversation.outcome}</Badge>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              {conversation.direction === 'inbound' ? (
                <PhoneIncoming className="h-4 w-4" />
              ) : (
                <PhoneOutgoing className="h-4 w-4" />
              )}
              Direction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold capitalize">{conversation.direction}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Caller
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{conversation.callerNumber || 'Unknown'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{conversation.agentName}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Duration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatDuration(conversation.durationSeconds)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transcript */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Conversation Transcript
              </CardTitle>
              <CardDescription>
                {conversation.turns.length} messages exchanged
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {conversation.turns.map((turn, index) => (
                    <div
                      key={turn.id || index}
                      className={cn(
                        'flex gap-3',
                        turn.role === 'user' ? 'flex-row' : 'flex-row-reverse'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          turn.role === 'user'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-purple-100 text-purple-600'
                        )}
                      >
                        {turn.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={cn(
                          'flex flex-col max-w-[80%]',
                          turn.role === 'user' ? 'items-start' : 'items-end'
                        )}
                      >
                        <span className="text-xs text-muted-foreground mb-1">
                          {turn.role === 'user' ? 'Caller' : 'Agent'}
                        </span>
                        <div
                          className={cn(
                            'rounded-lg px-4 py-2',
                            turn.role === 'user'
                              ? 'bg-blue-50 dark:bg-blue-950'
                              : 'bg-purple-50 dark:bg-purple-950'
                          )}
                        >
                          <p className="text-sm">{turn.content}</p>
                        </div>
                        {turn.audioDurationMs && (
                          <span className="text-xs text-muted-foreground mt-1">
                            {(turn.audioDurationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Summary
                </CardTitle>
                {summary ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => regenerateMutation.mutate()}
                    disabled={regenerateMutation.isPending}
                  >
                    <RefreshCw className={cn('h-4 w-4', regenerateMutation.isPending && 'animate-spin')} />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary ? (
                <>
                  {/* Summary Text */}
                  <div>
                    <p className="text-sm">{summary.summaryText}</p>
                  </div>

                  <Separator />

                  {/* Sentiment & Intent */}
                  <div className="flex flex-wrap gap-2">
                    <SentimentBadge sentiment={summary.sentiment} />
                    {summary.callerIntent && (
                      <Badge variant="outline">{summary.callerIntent}</Badge>
                    )}
                  </div>

                  {/* Key Points */}
                  {summary.keyPoints && summary.keyPoints.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Key Points
                      </h4>
                      <ul className="text-sm space-y-1">
                        {summary.keyPoints.map((point, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {summary.actionItems && summary.actionItems.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Flag className="h-4 w-4" />
                        Action Items
                      </h4>
                      <ul className="text-sm space-y-1">
                        {summary.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Separator />

                  {/* Follow-up Section */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="follow-up"
                        checked={summary.followUpNeeded}
                        onCheckedChange={(checked) => {
                          updateFollowUpMutation.mutate({
                            summaryId: summary.id,
                            followUpNeeded: checked as boolean,
                            notes: followUpNotes || summary.followUpNotes || undefined,
                          });
                        }}
                      />
                      <label
                        htmlFor="follow-up"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Follow-up Required
                      </label>
                    </div>
                    {(summary.followUpNeeded || summary.followUpNotes) && (
                      <div>
                        <Textarea
                          placeholder="Follow-up notes..."
                          defaultValue={summary.followUpNotes || ''}
                          onChange={(e) => setFollowUpNotes(e.target.value)}
                          onBlur={() => {
                            if (followUpNotes !== summary.followUpNotes) {
                              updateFollowUpMutation.mutate({
                                summaryId: summary.id,
                                followUpNeeded: summary.followUpNeeded,
                                notes: followUpNotes,
                              });
                            }
                          }}
                          className="text-sm"
                          rows={3}
                        />
                      </div>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="text-xs text-muted-foreground pt-2">
                    <p>Generated by: {summary.generatedBy} ({summary.modelUsed})</p>
                    {summary.tokensUsed && <p>Tokens used: {summary.tokensUsed}</p>}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No summary generated yet.</p>
                  <p className="text-sm">Click "Generate" to create an AI summary.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timing Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timing Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>{formatTimestamp(conversation.startTime)}</span>
              </div>
              {conversation.endTime && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ended</span>
                  <span>{formatTimestamp(conversation.endTime)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Turns</span>
                <span>{conversation.turns.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
