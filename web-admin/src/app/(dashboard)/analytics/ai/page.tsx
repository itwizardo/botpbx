'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  TrendingUp,
  Zap,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  AlertCircle,
  User,
  Timer,
} from 'lucide-react';
import { aiAnalyticsApi, type AIAnalyticsDashboard } from '@/lib/api';
import { formatDuration, formatDateTime, cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AIAnalyticsPage() {
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-analytics-dashboard', days],
    queryFn: () => aiAnalyticsApi.getDashboard(days),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Analytics</h1>
          <p className="text-muted-foreground">Performance metrics for AI conversations</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : !data ? (
        <Card className="py-12 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No AI conversation data available</p>
        </Card>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total AI Calls</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.stats.totalConversations}</div>
                <p className="text-xs text-muted-foreground">
                  {data.stats.averageTurns} avg turns per call
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {data.stats.successRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.stats.completedConversations} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(data.stats.averageDurationSeconds)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Per conversation
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
                <Zap className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.latency.avgTotalLatencyMs}ms
                </div>
                <p className="text-xs text-muted-foreground">
                  p95: {data.latency.p95LatencyMs}ms
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="latency">Latency</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Sentiment Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sentiment Analysis</CardTitle>
                    <CardDescription>Caller sentiment distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <SentimentBar
                        label="Positive"
                        value={data.sentiment.positive}
                        total={getTotalSentiment(data.sentiment)}
                        color="bg-green-500"
                        icon={<ThumbsUp className="h-4 w-4" />}
                      />
                      <SentimentBar
                        label="Neutral"
                        value={data.sentiment.neutral}
                        total={getTotalSentiment(data.sentiment)}
                        color="bg-gray-400"
                        icon={<Minus className="h-4 w-4" />}
                      />
                      <SentimentBar
                        label="Negative"
                        value={data.sentiment.negative}
                        total={getTotalSentiment(data.sentiment)}
                        color="bg-red-500"
                        icon={<ThumbsDown className="h-4 w-4" />}
                      />
                      <SentimentBar
                        label="Mixed"
                        value={data.sentiment.mixed}
                        total={getTotalSentiment(data.sentiment)}
                        color="bg-yellow-500"
                        icon={<AlertCircle className="h-4 w-4" />}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Outcome Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Outcomes</CardTitle>
                    <CardDescription>How conversations ended</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <OutcomeBar
                        label="Completed"
                        value={data.outcomes.completed}
                        total={getTotalOutcomes(data.outcomes)}
                        color="bg-green-500"
                        icon={<CheckCircle className="h-4 w-4" />}
                      />
                      <OutcomeBar
                        label="Transferred"
                        value={data.outcomes.transferred}
                        total={getTotalOutcomes(data.outcomes)}
                        color="bg-blue-500"
                        icon={<ArrowRightLeft className="h-4 w-4" />}
                      />
                      <OutcomeBar
                        label="Abandoned"
                        value={data.outcomes.abandoned}
                        total={getTotalOutcomes(data.outcomes)}
                        color="bg-yellow-500"
                        icon={<AlertCircle className="h-4 w-4" />}
                      />
                      <OutcomeBar
                        label="Failed"
                        value={data.outcomes.failed}
                        total={getTotalOutcomes(data.outcomes)}
                        color="bg-red-500"
                        icon={<XCircle className="h-4 w-4" />}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Conversations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Conversations</CardTitle>
                  <CardDescription>Latest AI agent interactions</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.recentConversations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent conversations</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.recentConversations.map((conv) => (
                        <div
                          key={conv.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{conv.callerNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {conv.agentName} • {formatDateTime(conv.startTime)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {conv.sentiment && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  conv.sentiment === 'positive' && 'text-green-600',
                                  conv.sentiment === 'negative' && 'text-red-600',
                                  conv.sentiment === 'neutral' && 'text-gray-600'
                                )}
                              >
                                {conv.sentiment}
                              </Badge>
                            )}
                            <Badge
                              variant={conv.state === 'completed' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {conv.state}
                            </Badge>
                            {conv.durationSeconds && (
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(conv.durationSeconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Agent Performance</CardTitle>
                  <CardDescription>Statistics by AI agent</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topAgents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No agent data available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {data.topAgents.map((agent) => (
                        <div
                          key={agent.agentId}
                          className="p-4 rounded-lg bg-muted/50 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <div className="font-medium">{agent.agentName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {agent.totalCalls} calls • {agent.averageTurns} avg turns
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-green-600">
                                {agent.successRate.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Success Rate
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="p-2 rounded bg-background">
                              <div className="text-sm font-medium">{agent.totalCalls}</div>
                              <div className="text-xs text-muted-foreground">Total</div>
                            </div>
                            <div className="p-2 rounded bg-background">
                              <div className="text-sm font-medium text-green-600">{agent.completedCalls}</div>
                              <div className="text-xs text-muted-foreground">Completed</div>
                            </div>
                            <div className="p-2 rounded bg-background">
                              <div className="text-sm font-medium">{formatDuration(agent.averageDurationSeconds)}</div>
                              <div className="text-xs text-muted-foreground">Avg Duration</div>
                            </div>
                            <div className="p-2 rounded bg-background">
                              <div className="text-sm font-medium">{agent.sentimentBreakdown.positive}</div>
                              <div className="text-xs text-muted-foreground">Positive</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="latency" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Average Latency</CardTitle>
                    <CardDescription>Response time breakdown</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <LatencyItem
                      label="Speech-to-Text"
                      value={data.latency.avgSttLatencyMs}
                      color="bg-blue-500"
                    />
                    <LatencyItem
                      label="LLM Processing"
                      value={data.latency.avgLlmLatencyMs}
                      color="bg-purple-500"
                    />
                    <LatencyItem
                      label="Text-to-Speech"
                      value={data.latency.avgTtsLatencyMs}
                      color="bg-green-500"
                    />
                    <div className="pt-2 border-t">
                      <LatencyItem
                        label="Total"
                        value={data.latency.avgTotalLatencyMs}
                        color="bg-primary"
                        large
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Latency Percentiles</CardTitle>
                    <CardDescription>Distribution of response times</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div>
                        <div className="text-sm text-muted-foreground">p50 (Median)</div>
                        <div className="text-2xl font-bold">{data.latency.p50LatencyMs}ms</div>
                      </div>
                      <Timer className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div>
                        <div className="text-sm text-muted-foreground">p95</div>
                        <div className="text-2xl font-bold text-yellow-600">{data.latency.p95LatencyMs}ms</div>
                      </div>
                      <Timer className="h-8 w-8 text-yellow-500" />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div>
                        <div className="text-sm text-muted-foreground">p99</div>
                        <div className="text-2xl font-bold text-red-600">{data.latency.p99LatencyMs}ms</div>
                      </div>
                      <Timer className="h-8 w-8 text-red-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SentimentBar({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-medium">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function OutcomeBar({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-medium">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function LatencyItem({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: number;
  color: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={cn('w-3 h-3 rounded-full', color)} />
        <span className={cn('text-sm', large && 'font-medium')}>{label}</span>
      </div>
      <span className={cn('font-mono', large ? 'text-lg font-bold' : 'text-sm')}>
        {value}ms
      </span>
    </div>
  );
}

function getTotalSentiment(sentiment: AIAnalyticsDashboard['sentiment']): number {
  return (
    sentiment.positive +
    sentiment.neutral +
    sentiment.negative +
    sentiment.mixed +
    sentiment.unknown
  );
}

function getTotalOutcomes(outcomes: AIAnalyticsDashboard['outcomes']): number {
  return (
    outcomes.completed +
    outcomes.transferred +
    outcomes.abandoned +
    outcomes.failed +
    outcomes.other
  );
}
