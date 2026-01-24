'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mic,
  Play,
  Pause,
  Download,
  Trash2,
  Phone,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
} from 'lucide-react';
import { recordingsApi, transcriptionsApi, getToken, getApiBaseUrl, type Transcription, type TranscriptionJob } from '@/lib/api';
import { formatDuration, formatBytes, formatDateTime, cn } from '@/lib/utils';
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

interface RecordingWithTranscription {
  id: string;
  callId: string;
  callerId: string;
  did: string;
  duration: number;
  fileSize: number;
  fileName: string;
  filePath: string;
  status: string;
  createdAt: number;
  transcription?: Transcription | null;
  transcriptionJob?: TranscriptionJob | null;
}

export default function RecordingsPage() {
  const queryClient = useQueryClient();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['recordings', currentPage, pageSize],
    queryFn: () => recordingsApi.list(currentPage, pageSize),
    placeholderData: (previousData) => previousData,
  });

  const { data: statsData } = useQuery({
    queryKey: ['transcription-stats'],
    queryFn: () => transcriptionsApi.getStats(),
  });

  const deleteMutation = useMutation({
    mutationFn: recordingsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      toast.success('Recording deleted');
    },
    onError: () => {
      toast.error('Failed to delete recording');
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: (id: string) => recordingsApi.transcribe(id),
    onSuccess: (data, id) => {
      toast.success('Transcription started');
      queryClient.invalidateQueries({ queryKey: ['recording-transcription', id] });
      queryClient.invalidateQueries({ queryKey: ['transcription-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start transcription');
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
        const response = await fetch(`${getApiBaseUrl()}/api/v1/recordings/${id}/stream`, {
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
          toast.error('Failed to play recording');
          setPlayingId(null);
          URL.revokeObjectURL(blobUrl);
        };
        audio.play();
        audioRef.current = audio;
      } catch (error) {
        toast.error('Failed to play recording');
        setPlayingId(null);
      }
    }
  };

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const token = getToken();
      const response = await fetch(`${getApiBaseUrl()}/api/v1/recordings/${id}/download`, {
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
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Failed to download recording');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this recording?')) {
      deleteMutation.mutate(id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Pagination calculations
  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setExpandedId(null); // Collapse any expanded items when changing pages
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(parseInt(size, 10));
    setCurrentPage(1); // Reset to first page when changing page size
    setExpandedId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recordings</h1>
          <p className="text-muted-foreground">Manage call recordings and transcriptions</p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          {statsData && (
            <div className="flex items-center gap-4 text-sm">
              {statsData.providersAvailable.length > 0 ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {statsData.providersAvailable.join(', ')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-yellow-600">
                  <AlertCircle className="h-3 w-3" />
                  No STT providers configured
                </Badge>
              )}
              {statsData.pending > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {statsData.pending} pending
                </Badge>
              )}
              {statsData.processing > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statsData.processing} processing
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            All Recordings
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
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
          ) : !data?.recordings || data.recordings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recordings yet</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {data.recordings.map((recording: any) => (
                  <RecordingItem
                    key={recording.id}
                    recording={recording}
                    isPlaying={playingId === recording.id}
                    isExpanded={expandedId === recording.id}
                    onPlay={() => handlePlay(recording.id)}
                    onDownload={() => handleDownload(recording.id, recording.fileName)}
                    onDelete={() => handleDelete(recording.id)}
                    onToggleExpand={() => toggleExpand(recording.id)}
                    onTranscribe={() => transcribeMutation.mutate(recording.id)}
                    isTranscribing={transcribeMutation.isPending}
                    hasProviders={(statsData?.providersAvailable.length ?? 0) > 0}
                  />
                ))}
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startItem} to {endItem} of {totalItems} recordings
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
                      Page {currentPage} of {totalPages || 1}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recordings Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Call Recordings</h4>
              <p className="text-sm text-muted-foreground">
                When call recording is enabled (in Settings), all outbound campaign calls are automatically recorded and stored here.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Playback & Download</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Play:</strong> Stream the recording in your browser</li>
                <li><strong>Download:</strong> Save the audio file to your computer</li>
                <li><strong>Expand:</strong> View transcription details</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Transcription</h4>
              <p className="text-sm text-muted-foreground">
                Convert recordings to text using speech-to-text. Requires an STT provider (Deepgram, AssemblyAI, or OpenAI Whisper) configured in AI Providers.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                <li><strong>Pending:</strong> Waiting in transcription queue</li>
                <li><strong>Processing:</strong> Currently being transcribed</li>
                <li><strong>Transcribed:</strong> Text ready to view</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Sentiment Analysis</h4>
              <p className="text-sm text-muted-foreground">
                Transcriptions include sentiment analysis (positive, neutral, negative) to help identify call quality and customer satisfaction.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordingItem({
  recording,
  isPlaying,
  isExpanded,
  onPlay,
  onDownload,
  onDelete,
  onToggleExpand,
  onTranscribe,
  isTranscribing,
  hasProviders,
}: {
  recording: any;
  isPlaying: boolean;
  isExpanded: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onToggleExpand: () => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  hasProviders: boolean;
}) {
  const { data: transcriptionData, isLoading: isLoadingTranscription, refetch } = useQuery({
    queryKey: ['recording-transcription', recording.id],
    queryFn: () => recordingsApi.getTranscription(recording.id),
    enabled: isExpanded,
    refetchInterval: (data) => {
      // Poll while job is pending or processing
      const job = data?.state?.data?.job;
      if (job && (job.status === 'pending' || job.status === 'processing')) {
        return 3000;
      }
      return false;
    },
  });

  const transcription = transcriptionData?.transcription;
  const job = transcriptionData?.job;

  const getTranscriptionStatus = () => {
    if (transcription) return 'completed';
    if (job) return job.status;
    return 'none';
  };

  const status = getTranscriptionStatus();

  return (
    <div className="rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium flex items-center gap-2">
              <span className="truncate">{recording.callerId || 'Unknown Caller'}</span>
              {recording.did && (
                <span className="text-xs text-muted-foreground">→ {recording.did}</span>
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
              {status === 'failed' && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  Failed
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {recording.createdAt ? formatDateTime(recording.createdAt) : 'Unknown date'} • {formatDuration(recording.duration || 0)} • {formatBytes(recording.fileSize || 0)}
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
          {isLoadingTranscription ? (
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
                  {transcription.languageDetected && (
                    <Badge variant="outline" className="text-xs">
                      {transcription.languageDetected}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {transcription.wordCount} words • {transcription.processingTimeMs}ms
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
              {transcription.summary && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Summary:</span>
                  <p className="mt-1">{transcription.summary}</p>
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
