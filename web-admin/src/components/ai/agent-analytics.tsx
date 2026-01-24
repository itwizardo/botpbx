"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  aiMetricsApi,
  MetricsSummary,
  DailyMetric,
  AgentMetricsSummary,
  FunctionUsage,
} from "@/lib/api";
import {
  Phone,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  DollarSign,
  BarChart3,
  Bot,
  Smile,
  Meh,
  Frown,
  Zap,
} from "lucide-react";

interface AgentAnalyticsProps {
  agentId?: string;
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getSentimentIcon(sentiment: number) {
  if (sentiment >= 0.7) return <Smile className="h-4 w-4 text-green-500" />;
  if (sentiment >= 0.4) return <Meh className="h-4 w-4 text-yellow-500" />;
  return <Frown className="h-4 w-4 text-red-500" />;
}

function getSentimentLabel(sentiment: number): string {
  if (sentiment >= 0.7) return "Positive";
  if (sentiment >= 0.4) return "Neutral";
  return "Negative";
}

export function AgentAnalytics({ agentId }: AgentAnalyticsProps) {
  const [period, setPeriod] = useState("30d");

  // Fetch overview metrics
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ["ai-metrics-overview", period],
    queryFn: () => aiMetricsApi.getOverview(period),
  });

  // Fetch daily metrics
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["ai-metrics-daily", period, agentId],
    queryFn: () => aiMetricsApi.getDailyMetrics(period, agentId),
  });

  // Fetch agents comparison
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["ai-metrics-agents", period],
    queryFn: () => aiMetricsApi.getAgentsMetrics(period),
    enabled: !agentId,
  });

  // Fetch top functions
  const { data: functionsData, isLoading: functionsLoading } = useQuery({
    queryKey: ["ai-metrics-functions", period],
    queryFn: () => aiMetricsApi.getTopFunctions(period, 5),
  });

  const overview = overviewData?.data;
  const dailyMetrics = dailyData?.data || [];
  const agentMetrics = agentsData?.data || [];
  const topFunctions = functionsData?.data || [];

  // Calculate max calls for chart scaling
  const maxCalls = Math.max(...dailyMetrics.map((d) => d.totalCalls), 1);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">AI Agent Analytics</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Calls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{overview?.totalCalls || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {overview?.successfulCalls || 0} completed
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {(overview?.successRate || 0).toFixed(1)}%
                </div>
                <Progress
                  value={overview?.successRate || 0}
                  className="h-2 mt-2"
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Avg Duration */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatDuration(overview?.avgDuration || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Average call length
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sentiment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Sentiment</CardTitle>
            {overview && getSentimentIcon(overview.avgSentiment)}
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {getSentimentLabel(overview?.avgSentiment || 0.5)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(overview?.transferRate || 0).toFixed(1)}% transfer rate
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Volume Chart (simple bar chart) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Daily Call Volume
          </CardTitle>
          <CardDescription>
            Calls handled by AI agents over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dailyLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : dailyMetrics.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No call data available for this period
            </div>
          ) : (
            <div className="h-48">
              <div className="flex items-end justify-between h-40 gap-1">
                {dailyMetrics.slice(-14).map((day, idx) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group"
                  >
                    <div className="relative w-full flex flex-col items-center">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg z-10 whitespace-nowrap">
                        <div className="font-medium">{new Date(day.date).toLocaleDateString()}</div>
                        <div>Total: {day.totalCalls}</div>
                        <div>Success: {day.successfulCalls}</div>
                      </div>
                      {/* Bar */}
                      <div
                        className="w-full bg-primary/20 rounded-t transition-all hover:bg-primary/30"
                        style={{
                          height: `${Math.max((day.totalCalls / maxCalls) * 128, 4)}px`,
                        }}
                      >
                        <div
                          className="bg-primary rounded-t"
                          style={{
                            height: `${(day.successfulCalls / Math.max(day.totalCalls, 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>
                  {dailyMetrics.length > 0 &&
                    new Date(dailyMetrics[Math.max(0, dailyMetrics.length - 14)].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span>
                  {dailyMetrics.length > 0 &&
                    new Date(dailyMetrics[dailyMetrics.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent Performance Table */}
        {!agentId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Agent Performance
              </CardTitle>
              <CardDescription>
                Compare AI agent metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : agentMetrics.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No agent data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Success</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentMetrics.slice(0, 5).map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="font-medium">
                          {agent.agentName}
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.totalCalls}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              agent.successRate >= 80
                                ? "text-green-600"
                                : agent.successRate >= 60
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            )}
                          >
                            {agent.successRate.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDuration(agent.avgDuration)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Functions */}
        <Card className={agentId ? "lg:col-span-2" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Top Functions Used
            </CardTitle>
            <CardDescription>
              Most called AI agent functions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {functionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topFunctions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No function usage data available
              </div>
            ) : (
              <div className="space-y-4">
                {topFunctions.map((func, idx) => {
                  const maxCount = Math.max(...topFunctions.map((f) => f.count), 1);
                  return (
                    <div key={func.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {func.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{func.count} calls</Badge>
                          {func.successRate !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {func.successRate}% success
                            </span>
                          )}
                        </div>
                      </div>
                      <Progress
                        value={(func.count / maxCount) * 100}
                        className="h-2"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Summary (if available) */}
      {overview && overview.totalCost > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Cost Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(overview.totalCost)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cost per Call</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(overview.totalCalls > 0 ? overview.totalCost / overview.totalCalls : 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cost per Minute</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    overview.totalCalls > 0 && overview.avgDuration > 0
                      ? (overview.totalCost / overview.totalCalls) / (overview.avgDuration / 60)
                      : 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
