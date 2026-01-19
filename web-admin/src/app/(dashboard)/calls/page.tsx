'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Eye,
  PhoneOff,
  RefreshCw,
  Headphones,
  Volume2,
  VolumeX,
  Square,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  HelpCircle,
} from 'lucide-react';
import { useAudioStream } from '@/hooks/use-audio-stream';
import { callsApi, extensionsApi } from '@/lib/api';
import { formatDuration, formatPhoneNumber, formatTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { ActiveCall, CallLog } from '@/types/models';
import { useCallEvents, useWsEvent } from '@/hooks/use-websocket';

// Audio Player Component for Browser Spy
function AudioPlayer({
  isListening,
  isConnecting,
  volume,
  error,
  onStop,
  onVolumeChange,
}: {
  isListening: boolean;
  isConnecting: boolean;
  volume: number;
  error: string | null;
  onStop: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  if (!isListening && !isConnecting && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-background border rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isListening ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
            isConnecting ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
            'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          )}>
            <Headphones className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm">
              {isConnecting ? 'Connecting...' : isListening ? 'Listening' : 'Error'}
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onStop}>
          <Square className="h-4 w-4" />
        </Button>
      </div>
      {isListening && (
        <div className="flex items-center gap-2">
          {volume === 0 ? (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          )}
          <Slider
            value={[volume * 100]}
            max={100}
            step={1}
            onValueChange={(value) => onVolumeChange(value[0] / 100)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8">{Math.round(volume * 100)}%</span>
        </div>
      )}
      {isListening && (
        <div className="mt-2 flex items-center justify-center">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs text-muted-foreground">Audio streaming</span>
        </div>
      )}
    </div>
  );
}

// Spy Dialog Component
function SpyDialog({
  open,
  onOpenChange,
  channel,
  onConfirm,
  extensions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: string;
  onConfirm: (channel: string, extension: string) => void;
  extensions: Array<{ number: string; name: string }>;
}) {
  const [selectedExtension, setSelectedExtension] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Spy on Call
          </DialogTitle>
          <DialogDescription>
            Select the extension that will receive the spy call. When you answer, you'll be able to listen to the conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="extension">Extension to call</Label>
            <Select value={selectedExtension} onValueChange={setSelectedExtension}>
              <SelectTrigger>
                <SelectValue placeholder="Select extension..." />
              </SelectTrigger>
              <SelectContent>
                {extensions.map((ext) => (
                  <SelectItem key={ext.number} value={ext.number}>
                    {ext.number} - {ext.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            <p className="font-medium mb-1">How it works:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Your selected extension will ring</li>
              <li>Answer the call to start listening</li>
              <li>You can hear both parties (silent mode)</li>
            </ol>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedExtension) {
                onConfirm(channel, selectedExtension);
                onOpenChange(false);
              }
            }}
            disabled={!selectedExtension}
          >
            <Eye className="h-4 w-4 mr-2" />
            Start Spy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CallTimer({ startTime, answerTime }: { startTime: number; answerTime: number | null }) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const baseTime = answerTime || startTime;
    const interval = setInterval(() => {
      setDuration(Math.floor(Date.now() / 1000 - baseTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, answerTime]);

  return <span className="font-mono">{formatDuration(duration)}</span>;
}

function ActiveCallCard({ call, onHangup, onSpy, onListen, isListeningToThis }: {
  call: ActiveCall;
  onHangup: (channel: string) => void;
  onSpy: (channel: string) => void;
  onListen: (channel: string) => void;
  isListeningToThis: boolean;
}) {
  const isInbound = call.context === 'from-trunk' || call.context?.includes('inbound');

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'h-1',
          call.state === 'up' ? 'bg-green-500' : 'bg-yellow-500'
        )}
      />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                call.state === 'up'
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
              )}
            >
              {isInbound ? (
                <PhoneIncoming className="h-6 w-6" />
              ) : (
                <PhoneOutgoing className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="font-semibold">{formatPhoneNumber(call.callerId)}</div>
              <div className="text-sm text-muted-foreground">
                {call.callerName || 'Unknown'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              {call.state === 'up' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
              <CallTimer startTime={call.startTime} answerTime={call.answerTime} />
            </div>
            <Badge variant={call.state === 'up' ? 'success' : 'warning'} className="mt-1">
              {call.state === 'up' ? 'Active' : 'Ringing'}
            </Badge>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{call.destination}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isListeningToThis ? "default" : "outline"}
              onClick={() => onListen(call.channel)}
              disabled={isListeningToThis}
            >
              <Headphones className="h-4 w-4 mr-1" />
              {isListeningToThis ? 'Listening' : 'Listen'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSpy(call.channel)}>
              <Eye className="h-4 w-4 mr-1" />
              Spy
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onHangup(call.channel)}>
              <PhoneOff className="h-4 w-4 mr-1" />
              Hangup
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CallLogRow({ call }: { call: CallLog }) {
  const getStatusVariant = (disposition: string) => {
    switch (disposition) {
      case 'TRANSFERRED':
      case 'ANSWERED':
        return 'success';
      case 'CALLER_HANGUP':
        return 'warning';
      case 'TIMEOUT':
      case 'FAILED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3 text-sm">{formatTime(call.timestamp)}</td>
      <td className="px-4 py-3 text-sm font-medium">{formatPhoneNumber(call.callerId)}</td>
      <td className="px-4 py-3 text-sm">{call.finalDestination || call.did || '-'}</td>
      <td className="px-4 py-3 text-sm font-mono">{formatDuration(call.durationSeconds)}</td>
      <td className="px-4 py-3">
        <Badge variant={getStatusVariant(call.disposition)}>
          {call.disposition}
        </Badge>
      </td>
    </tr>
  );
}

export default function CallsPage() {
  const queryClient = useQueryClient();
  const [spyDialogOpen, setSpyDialogOpen] = useState(false);
  const [spyChannel, setSpyChannel] = useState('');
  const [listeningChannel, setListeningChannel] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Pagination state for call history
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Audio stream hook for browser-based call listening
  const {
    isListening,
    isConnecting,
    volume,
    error: audioError,
    startListening,
    stopListening,
    setVolume,
  } = useAudioStream();

  // Subscribe to call events for real-time updates
  useCallEvents();

  // Listen for new call notifications
  useWsEvent('call.started', useCallback((data: any) => {
    toast.info(
      <div className="flex items-center gap-2">
        <PhoneIncoming className="h-4 w-4" />
        <div>
          <p className="font-medium">Incoming Call</p>
          <p className="text-sm text-muted-foreground">{data.callerId || 'Unknown'}</p>
        </div>
      </div>,
      { duration: 5000 }
    );
    // Refetch active calls
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
  }, [queryClient]));

  // Listen for call ended
  useWsEvent('call.ended', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['active-calls'] });
    queryClient.invalidateQueries({ queryKey: ['call-logs'] });
  }, [queryClient]));

  // Fetch active calls
  const { data: activeCallsData, isLoading: activeLoading, refetch } = useQuery({
    queryKey: ['active-calls'],
    queryFn: callsApi.listActive,
    refetchInterval: 3000, // Faster refresh
  });

  // Fetch call logs with pagination
  const { data: callLogsData, isLoading: logsLoading, isFetching: logsFetching } = useQuery({
    queryKey: ['call-logs', currentPage, pageSize],
    queryFn: () => callsApi.listLogs(currentPage, pageSize),
    refetchInterval: 30000,
    placeholderData: (previousData) => previousData,
  });

  // Pagination calculations
  const totalItems = callLogsData?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Fetch extensions for spy dialog
  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  // Hangup mutation
  const hangupMutation = useMutation({
    mutationFn: (channel: string) => callsApi.hangup(channel),
    onSuccess: () => {
      toast.success('Call ended');
      queryClient.invalidateQueries({ queryKey: ['active-calls'] });
    },
    onError: () => {
      toast.error('Failed to hangup call');
    },
  });

  // Spy mutation
  const spyMutation = useMutation({
    mutationFn: ({ channel, extension }: { channel: string; extension: string }) =>
      callsApi.spy(channel, extension),
    onSuccess: () => {
      toast.success('Spy session started - your phone will ring');
    },
    onError: () => {
      toast.error('Failed to start spy session');
    },
  });

  const handleHangup = (channel: string) => {
    if (confirm('Are you sure you want to hangup this call?')) {
      hangupMutation.mutate(channel);
    }
  };

  const handleSpyClick = (channel: string) => {
    setSpyChannel(channel);
    setSpyDialogOpen(true);
  };

  const handleSpyConfirm = (channel: string, extension: string) => {
    spyMutation.mutate({ channel, extension });
  };

  const handleListen = async (channel: string) => {
    setListeningChannel(channel);
    await startListening(channel);
  };

  const handleStopListening = () => {
    stopListening();
    setListeningChannel(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calls</h1>
          <p className="text-muted-foreground">Monitor active calls and view history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Active ({activeCallsData?.calls.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {activeLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : activeCallsData?.calls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No active calls</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeCallsData?.calls.map((call) => (
                <ActiveCallCard
                  key={call.uniqueId || call.channel}
                  call={call}
                  onHangup={handleHangup}
                  onSpy={handleSpyClick}
                  onListen={handleListen}
                  isListeningToThis={listeningChannel === call.channel && isListening}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Call History</span>
                {logsFetching && !logsLoading && (
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Time</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">From</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">To</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Duration</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {callLogsData?.calls.map((call) => (
                          <CallLogRow key={call.id} call={call} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalItems > 0 && (
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Showing {startItem} to {endItem} of {totalItems} calls</span>
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
                          Page {currentPage} of {totalPages || 1}
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
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Spy Dialog */}
      <SpyDialog
        open={spyDialogOpen}
        onOpenChange={setSpyDialogOpen}
        channel={spyChannel}
        onConfirm={handleSpyConfirm}
        extensions={extensionsData?.extensions || []}
      />

      {/* Audio Player for Browser-based listening */}
      <AudioPlayer
        isListening={isListening}
        isConnecting={isConnecting}
        volume={volume}
        error={audioError}
        onStop={handleStopListening}
        onVolumeChange={setVolume}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calls Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Active Calls</h4>
              <p className="text-sm text-muted-foreground">
                View all currently active calls in real-time. The list updates automatically every few seconds.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Call Actions</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Listen:</strong> Stream the call audio directly to your browser (silent mode)</li>
                <li><strong>Spy:</strong> Join the call silently via your extension - you can hear both parties but they cannot hear you</li>
                <li><strong>Hangup:</strong> Forcefully end the call</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Call States</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Ringing:</strong> The call is connecting but not yet answered</li>
                <li><strong>Active:</strong> The call is in progress with parties talking</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Call History</h4>
              <p className="text-sm text-muted-foreground">
                View past calls with status, duration, and caller/destination info. Use pagination to browse older calls.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
