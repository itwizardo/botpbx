'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Voicemail,
  Play,
  Pause,
  Download,
  Trash2,
  Mail,
  MailOpen,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  User,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
} from 'lucide-react';
import {
  voicemailsApi,
  transcriptionsApi,
  getToken,
  type Voicemail as VoicemailType,
  type Transcription,
  type TranscriptionJob,
} from '@/lib/api';
import { formatDuration, formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const PAGE_SIZES = [10, 25, 50, 100];

export default function VoicemailsPage() {
  const queryClient = useQueryClient();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['voicemails', currentPage, pageSize],
    queryFn: () => voicemailsApi.list({ limit: pageSize, offset: (currentPage - 1) * pageSize }),
    placeholderData: (previousData) => previousData,
  });

  const { data: statsData } = useQuery({
    queryKey: ['voicemail-stats'],
    queryFn: () => voicemailsApi.getStats(),
  });

  const { data: transcriptionStats } = useQuery({
    queryKey: ['transcription-stats'],
    queryFn: () => transcriptionsApi.getStats(),
  });

  const deleteMutation = useMutation({
    mutationFn: voicemailsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      queryClient.invalidateQueries({ queryKey: ['voicemail-stats'] });
      toast.success('Voicemail deleted');
    },
    onError: () => {
      toast.error('Failed to delete voicemail');
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => voicemailsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      queryClient.invalidateQueries({ queryKey: ['voicemail-stats'] });
    },
  });

  const markUnreadMutation = useMutation({
    mutationFn: (id: string) => voicemailsApi.markAsUnread(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      queryClient.invalidateQueries({ queryKey: ['voicemail-stats'] });
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: (id: string) => voicemailsApi.transcribe(id),
    onSuccess: (data, id) => {
      toast.success('Transcription started');
      queryClient.invalidateQueries({ queryKey: ['voicemail-detail', id] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start transcription');
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => voicemailsApi.scan(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      queryClient.invalidateQueries({ queryKey: ['voicemail-stats'] });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to scan voicemails');
    },
  });

  const handlePlay = async (id: string) => {
    if (playingId === id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      try {
        setPlayingId(id);
        const token = getToken();
        const response = await fetch(`/api/v1/voicemails/${id}/stream`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch audio');
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const audio = new Audio(blobUrl);
        audio.onended = () => {
          setPlayingId(null);
          URL.revokeObjectURL(blobUrl);
        };
        audio.onerror = () => {
          toast.error('Failed to play voicemail');
          setPlayingId(null);
          URL.revokeObjectURL(blobUrl);
        };
        audio.play();
        audioRef.current = audio;

        // Mark as read when played
        markReadMutation.mutate(id);
      } catch (error) {
        toast.error('Failed to play voicemail');
        setPlayingId(null);
      }
    }
  };

  const handleDownload = async (id: string, mailbox: string) => {
    try {
      const token = getToken();
      const response = await fetch(`/api/v1/voicemails/${id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `voicemail_${mailbox}_${id}.wav`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Failed to download voicemail');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this voicemail?')) {
      deleteMutation.mutate(id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Pagination calculations
  const totalItems = data?.pagination?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setExpandedId(null);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(parseInt(size, 10));
    setCurrentPage(1);
    setExpandedId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voicemails</h1>
          <p className="text-muted-foreground">View and manage voicemail messages</p>
        </div>
        <div className="flex items-center gap-4">
          {statsData && (
            <div className="flex items-center gap-2 text-sm">
              {statsData.unread > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <Mail className="h-3 w-3" />
                  {statsData.unread} unread
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                <Inbox className="h-3 w-3" />
                {statsData.total} total
              </Badge>
            </div>
          )}
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Scan for Voicemails
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unread</CardTitle>
              <Mail className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{statsData.unread}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Read</CardTitle>
              <MailOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.read}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transcribed</CardTitle>
              <FileText className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{statsData.transcribed}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              All Voicemails
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            {transcriptionStats && transcriptionStats.providersAvailable.length > 0 ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                STT: {transcriptionStats.providersAvailable.join(', ')}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-yellow-600">
                <AlertCircle className="h-3 w-3" />
                No STT providers configured
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Show</span>
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>per page</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data?.voicemails || data.voicemails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Voicemail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No voicemails yet</p>
              <p className="text-sm mt-2">New voicemails will appear here automatically</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {data.voicemails.map((voicemail) => (
                  <VoicemailItem
                    key={voicemail.id}
                    voicemail={voicemail}
                    isPlaying={playingId === voicemail.id}
                    isExpanded={expandedId === voicemail.id}
                    onPlay={() => handlePlay(voicemail.id)}
                    onDownload={() => handleDownload(voicemail.id, voicemail.mailbox)}
                    onDelete={() => handleDelete(voicemail.id)}
                    onToggleExpand={() => toggleExpand(voicemail.id)}
                    onMarkRead={() => markReadMutation.mutate(voicemail.id)}
                    onMarkUnread={() => markUnreadMutation.mutate(voicemail.id)}
                    onTranscribe={() => transcribeMutation.mutate(voicemail.id)}
                    isTranscribing={transcribeMutation.isPending}
                    hasProviders={(transcriptionStats?.providersAvailable.length ?? 0) > 0}
                  />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {startItem} to {endItem} of {totalItems} voicemails
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 px-2">
                      <span className="text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voicemails Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Voicemail Overview</h4>
              <p className="text-sm text-muted-foreground">
                View and manage voicemail messages left for your extensions. Messages are grouped by mailbox (extension number).
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Message Status</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Unread:</strong> New messages with blue border indicator</li>
                <li><strong>Read:</strong> Messages you have listened to</li>
                <li><strong>Urgent:</strong> Messages marked as urgent by the caller</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Actions</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Play:</strong> Listen to the voicemail (marks as read)</li>
                <li><strong>Download:</strong> Save the audio file</li>
                <li><strong>Mark Read/Unread:</strong> Toggle message status</li>
                <li><strong>Delete:</strong> Remove the voicemail permanently</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Transcription</h4>
              <p className="text-sm text-muted-foreground">
                Expand a voicemail to view or request transcription. Requires an STT provider configured in AI Providers settings.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Scanning</h4>
              <p className="text-sm text-muted-foreground">
                Click "Scan for Voicemails" to check for new messages if they are not appearing automatically.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoicemailItem({
  voicemail,
  isPlaying,
  isExpanded,
  onPlay,
  onDownload,
  onDelete,
  onToggleExpand,
  onMarkRead,
  onMarkUnread,
  onTranscribe,
  isTranscribing,
  hasProviders,
}: {
  voicemail: VoicemailType;
  isPlaying: boolean;
  isExpanded: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onToggleExpand: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  hasProviders: boolean;
}) {
  const { data: detailData, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['voicemail-detail', voicemail.id],
    queryFn: () => voicemailsApi.get(voicemail.id),
    enabled: isExpanded,
    refetchInterval: (data) => {
      const job = data?.state?.data?.job;
      if (job && (job.status === 'pending' || job.status === 'processing')) {
        return 3000;
      }
      return false;
    },
  });

  const transcription = detailData?.transcription;
  const job = detailData?.job;

  const getTranscriptionStatus = () => {
    if (transcription) return 'completed';
    if (job) return job.status;
    return 'none';
  };

  const status = getTranscriptionStatus();

  return (
    <div className={cn(
      'rounded-lg transition-colors',
      voicemail.read ? 'bg-muted/30' : 'bg-muted/50 border-l-4 border-l-primary'
    )}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
            voicemail.read ? 'bg-muted' : 'bg-primary/10'
          )}>
            {voicemail.read ? (
              <MailOpen className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Mail className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium flex items-center gap-2">
              <span className={cn('truncate', !voicemail.read && 'font-semibold')}>
                {voicemail.callerName || voicemail.callerId || 'Unknown Caller'}
              </span>
              {voicemail.callerId && voicemail.callerName && (
                <span className="text-xs text-muted-foreground">{voicemail.callerId}</span>
              )}
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                {voicemail.mailbox}
              </Badge>
              {voicemail.urgent && (
                <Badge variant="destructive" className="text-xs">Urgent</Badge>
              )}
              {status === 'completed' && (
                <Badge variant="outline" className="gap-1 text-green-600 text-xs">
                  <FileText className="h-3 w-3" />
                  Transcribed
                </Badge>
              )}
              {status === 'pending' && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  Pending
                </Badge>
              )}
              {status === 'processing' && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {voicemail.createdAt ? formatDateTime(voicemail.createdAt) : voicemail.origDate}
              {voicemail.durationSeconds && ` • ${formatDuration(voicemail.durationSeconds)}`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant={isPlaying ? 'default' : 'ghost'}
            onClick={onPlay}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={voicemail.read ? onMarkUnread : onMarkRead}
            title={voicemail.read ? 'Mark as unread' : 'Mark as read'}
          >
            {voicemail.read ? (
              <Mail className="h-4 w-4" />
            ) : (
              <MailOpen className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-muted pt-4">
          {isLoadingDetail ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading transcription...
            </div>
          ) : transcription ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium">Transcription</span>
                  <Badge variant="outline" className="text-xs">
                    {transcription.provider}
                  </Badge>
                  {transcription.confidence && (
                    <Badge variant="outline" className="text-xs">
                      {Math.round(transcription.confidence * 100)}% confidence
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {transcription.wordCount} words
                </div>
              </div>
              <div className="bg-background rounded-lg p-3 text-sm leading-relaxed">
                {transcription.fullText}
              </div>
              {transcription.sentiment && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Sentiment:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      transcription.sentiment === 'positive' && 'text-green-600',
                      transcription.sentiment === 'negative' && 'text-red-600',
                      transcription.sentiment === 'neutral' && 'text-gray-600'
                    )}
                  >
                    {transcription.sentiment}
                  </Badge>
                </div>
              )}
            </div>
          ) : job ? (
            <div className="space-y-2">
              {job.status === 'failed' ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>Transcription failed: {job.errorMessage || 'Unknown error'}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onTranscribe}
                    disabled={isTranscribing || !hasProviders}
                  >
                    <RefreshCw className={cn('h-4 w-4 mr-2', isTranscribing && 'animate-spin')} />
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  {job.status === 'pending' && <Clock className="h-4 w-4" />}
                  {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>
                    {job.status === 'pending' && 'Waiting in queue...'}
                    {job.status === 'processing' && 'Transcribing...'}
                  </span>
                  <span className="text-xs">
                    (Attempt {job.attempts}/{job.maxAttempts})
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm">
                No transcription available
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onTranscribe}
                disabled={isTranscribing || !hasProviders}
              >
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {hasProviders ? 'Transcribe' : 'No STT Provider'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
