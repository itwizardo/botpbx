'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  MessageSquare,
  Bot,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRightLeft,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { aiConversationsApi, type AIConversationListItem } from '@/lib/api';
import { formatDuration, formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function getStateIcon(state: AIConversationListItem['state']) {
  switch (state) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'transferred':
      return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
    case 'abandoned':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case 'active':
      return (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
      );
    default:
      return <MessageSquare className="h-4 w-4 text-gray-500" />;
  }
}

function getStateVariant(state: AIConversationListItem['state']) {
  switch (state) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'transferred':
      return 'default';
    case 'abandoned':
      return 'warning';
    case 'active':
      return 'default';
    default:
      return 'secondary';
  }
}

function getSentimentIcon(sentiment: AIConversationListItem['sentiment']) {
  switch (sentiment) {
    case 'positive':
      return <ThumbsUp className="h-3 w-3" />;
    case 'negative':
      return <ThumbsDown className="h-3 w-3" />;
    case 'mixed':
      return <AlertCircle className="h-3 w-3" />;
    default:
      return <Minus className="h-3 w-3" />;
  }
}

function getSentimentColor(sentiment: AIConversationListItem['sentiment']) {
  switch (sentiment) {
    case 'positive':
      return 'text-green-600';
    case 'negative':
      return 'text-red-600';
    case 'mixed':
      return 'text-yellow-600';
    default:
      return 'text-gray-500';
  }
}

function ConversationRow({ conversation }: { conversation: AIConversationListItem }) {
  return (
    <Link
      href={`/ai-agents/conversations/${conversation.id}`}
      className="block hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{conversation.caller_number || 'Unknown Caller'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Bot className="h-3 w-3" />
              <span>{conversation.agent_name || 'Unknown Agent'}</span>
              <span className="text-muted-foreground/50">|</span>
              <Clock className="h-3 w-3" />
              <span>{formatDateTime(conversation.start_time)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Sentiment */}
          {conversation.sentiment && (
            <Badge
              variant="outline"
              className={cn('text-xs gap-1', getSentimentColor(conversation.sentiment))}
            >
              {getSentimentIcon(conversation.sentiment)}
              {conversation.sentiment}
            </Badge>
          )}

          {/* Duration */}
          {conversation.duration_seconds != null && (
            <span className="text-sm text-muted-foreground font-mono">
              {formatDuration(conversation.duration_seconds)}
            </span>
          )}

          {/* State */}
          <Badge
            variant={getStateVariant(conversation.state) as 'default' | 'secondary' | 'destructive' | 'outline'}
            className="gap-1"
          >
            {getStateIcon(conversation.state)}
            {conversation.state}
          </Badge>

          {/* Turn count */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>{conversation.turn_count || 0}</span>
          </div>

          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

export default function AIConversationsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ai-conversations', currentPage, pageSize],
    queryFn: () => aiConversationsApi.list(currentPage, pageSize),
    placeholderData: (previousData) => previousData,
  });

  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Conversations</h1>
          <p className="text-muted-foreground">View all AI agent conversations and transcripts</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>All Conversations</span>
            {isFetching && !isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data?.data?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No conversations yet</p>
              <p className="text-sm">AI conversations will appear here once calls come in</p>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {data.data.map((conversation) => (
                  <ConversationRow key={conversation.id} conversation={conversation} />
                ))}
              </div>

              {/* Pagination Controls */}
              <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing {startItem} to {endItem} of {totalItems} conversations</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Page size:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-3 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
