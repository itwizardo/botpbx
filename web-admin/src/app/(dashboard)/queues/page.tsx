'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ListOrdered,
  Plus,
  Edit,
  Trash2,
  Phone,
  Pause,
  Play,
  Users,
  HelpCircle,
  Volume2,
  Loader2,
} from 'lucide-react';
import { queuesApi, extensionsApi, promptsApi, Queue, QueueMember } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';

// ElevenLabs voices (matching the AI agents page)
const elevenLabsVoices = [
  { id: 'Rachel', name: 'Rachel', description: 'American, warm' },
  { id: 'Adam', name: 'Adam', description: 'American, deep' },
  { id: 'Domi', name: 'Domi', description: 'American, confident' },
  { id: 'Bella', name: 'Bella', description: 'American, soft' },
  { id: 'Antoni', name: 'Antoni', description: 'American, balanced' },
  { id: 'Elli', name: 'Elli', description: 'American, young' },
  { id: 'Josh', name: 'Josh', description: 'American, deep, narrative' },
  { id: 'Arnold', name: 'Arnold', description: 'American, dramatic' },
  { id: 'Sam', name: 'Sam', description: 'American, deep, raspy' },
];

// Language options
const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
];

// Default position announcement templates
const defaultTemplates = {
  ranges: [
    { min: 1, max: 1, template: "Great news! You're next in line. An agent will be with you momentarily." },
    { min: 2, max: 5, template: "You're almost there! You're number {position} in the queue. Estimated wait: {waitTime}." },
    { min: 6, max: null, template: "Thank you for your patience. You're currently number {position}. Your estimated wait time is {waitTime}." },
  ],
  includeWaitTime: true,
  waitTimeFormat: 'about {minutes} minutes',
};

const strategyLabels: Record<string, string> = {
  ringall: 'Ring All',
  hunt: 'Hunt (Sequential)',
  random: 'Random',
  roundrobin: 'Round Robin',
  leastrecent: 'Least Recent',
};

const strategyDescriptions: Record<string, string> = {
  ringall: 'Ring all available agents simultaneously',
  hunt: 'Ring agents one by one in order',
  random: 'Ring a random available agent',
  roundrobin: 'Ring agents in turn, remembering who was last called',
  leastrecent: 'Ring the agent who has been idle longest',
};

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [queueToDelete, setQueueToDelete] = useState<Queue | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStrategy, setFormStrategy] = useState<Queue['strategy']>('ringall');
  const [formTimeout, setFormTimeout] = useState('30');
  const [formRetry, setFormRetry] = useState('5');
  const [formMaxWait, setFormMaxWait] = useState('300');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formHoldMusicId, setFormHoldMusicId] = useState<string>('');
  const [formJoinAnnouncementId, setFormJoinAnnouncementId] = useState<string>('');
  const [formMembers, setFormMembers] = useState<{ extensionNumber: string; penalty: number }[]>([]);
  // Position announcements
  const [formPosAnnounceEnabled, setFormPosAnnounceEnabled] = useState(false);
  const [formPosAnnounceVoice, setFormPosAnnounceVoice] = useState<string>('Rachel');
  const [formPosAnnounceLanguage, setFormPosAnnounceLanguage] = useState('en');
  const [formPosAnnounceInterval, setFormPosAnnounceInterval] = useState('60');
  const [formPosAnnounceVariations, setFormPosAnnounceVariations] = useState(defaultTemplates);
  const [previewPosition, setPreviewPosition] = useState(1);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['queues'],
    queryFn: queuesApi.list,
  });

  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  const { data: promptsData } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: queuesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Queue created');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create queue');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => queuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Queue updated');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update queue');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => queuesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Queue deleted');
      setDeleteDialogOpen(false);
      setQueueToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete queue');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: ({ queueId, extNum }: { queueId: string; extNum: string }) =>
      queuesApi.pauseMember(queueId, extNum),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Member paused');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pause member');
    },
  });

  const unpauseMutation = useMutation({
    mutationFn: ({ queueId, extNum }: { queueId: string; extNum: string }) =>
      queuesApi.unpauseMember(queueId, extNum),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Member unpaused');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unpause member');
    },
  });

  const handleCreate = () => {
    setSelectedQueue(null);
    setFormName('');
    setFormStrategy('ringall');
    setFormTimeout('30');
    setFormRetry('5');
    setFormMaxWait('300');
    setFormEnabled(true);
    setFormHoldMusicId('');
    setFormJoinAnnouncementId('');
    setFormMembers([]);
    // Reset position announcements
    setFormPosAnnounceEnabled(false);
    setFormPosAnnounceVoice('Rachel');
    setFormPosAnnounceLanguage('en');
    setFormPosAnnounceInterval('60');
    setFormPosAnnounceVariations(defaultTemplates);
    setDialogOpen(true);
  };

  const handleEdit = (queue: Queue) => {
    setSelectedQueue(queue);
    setFormName(queue.name);
    setFormStrategy(queue.strategy);
    setFormTimeout(String(queue.timeoutSeconds));
    setFormRetry(String(queue.retrySeconds));
    setFormMaxWait(String(queue.maxWaitTime));
    setFormEnabled(queue.enabled);
    setFormHoldMusicId(queue.holdMusicPromptId || '');
    setFormJoinAnnouncementId(queue.joinAnnouncementId || '');
    setFormMembers(
      queue.members?.map((m) => ({ extensionNumber: m.extensionNumber, penalty: m.penalty })) || []
    );
    // Load position announcements
    setFormPosAnnounceEnabled((queue as any).positionAnnounceEnabled || false);
    setFormPosAnnounceVoice((queue as any).positionAnnounceVoice || 'Rachel');
    setFormPosAnnounceLanguage((queue as any).positionAnnounceLanguage || 'en');
    setFormPosAnnounceInterval(String((queue as any).positionAnnounceInterval || 60));
    setFormPosAnnounceVariations((queue as any).positionAnnounceVariations || defaultTemplates);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedQueue(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formName,
      strategy: formStrategy,
      timeoutSeconds: parseInt(formTimeout, 10),
      retrySeconds: parseInt(formRetry, 10),
      maxWaitTime: parseInt(formMaxWait, 10),
      enabled: formEnabled,
      holdMusicPromptId: formHoldMusicId || null,
      joinAnnouncementId: formJoinAnnouncementId || null,
      members: formMembers,
      // Position announcements
      positionAnnounceEnabled: formPosAnnounceEnabled,
      positionAnnounceVoice: formPosAnnounceVoice,
      positionAnnounceProvider: 'elevenlabs',
      positionAnnounceLanguage: formPosAnnounceLanguage,
      positionAnnounceInterval: parseInt(formPosAnnounceInterval, 10),
      positionAnnounceVariations: formPosAnnounceEnabled ? formPosAnnounceVariations : null,
    };

    if (selectedQueue) {
      updateMutation.mutate({ id: selectedQueue.id, data });
    } else {
      createMutation.mutate(data as any);
    }
  };

  const handleDeleteClick = (queue: Queue) => {
    setQueueToDelete(queue);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (queueToDelete) {
      deleteMutation.mutate(queueToDelete.id);
    }
  };

  const toggleMember = (extensionNumber: string) => {
    setFormMembers((prev) => {
      const exists = prev.find((m) => m.extensionNumber === extensionNumber);
      if (exists) {
        return prev.filter((m) => m.extensionNumber !== extensionNumber);
      }
      return [...prev, { extensionNumber, penalty: 0 }];
    });
  };

  const updateMemberPenalty = (extensionNumber: string, penalty: number) => {
    setFormMembers((prev) =>
      prev.map((m) => (m.extensionNumber === extensionNumber ? { ...m, penalty } : m))
    );
  };

  const extensions = extensionsData?.extensions || [];
  const prompts = promptsData?.prompts || [];
  const queues = data?.queues || [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Queues</h1>
          <p className="text-muted-foreground">Manage call queues for incoming callers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Queue
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Queues</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : queues.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListOrdered className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No queues configured</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first queue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {queues.map((queue) => (
                <div
                  key={queue.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ListOrdered className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{queue.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline">{strategyLabels[queue.strategy]}</Badge>
                          <span>{queue.timeoutSeconds}s timeout</span>
                          <span>|</span>
                          <span>{queue.memberCount || 0} agents</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={queue.enabled ? 'success' : 'secondary'}>
                        {queue.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(queue)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteClick(queue)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Queue Members */}
                  {queue.members && queue.members.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Queue Members
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {queue.members.map((member) => (
                          <div
                            key={member.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                              member.paused
                                ? 'bg-yellow-500/10 border-yellow-500/30'
                                : 'bg-green-500/10 border-green-500/30'
                            }`}
                          >
                            <Phone className="h-3 w-3" />
                            <span className="font-mono">{member.extensionNumber}</span>
                            {member.extensionName && (
                              <span className="text-muted-foreground">({member.extensionName})</span>
                            )}
                            {member.penalty > 0 && (
                              <span className="text-xs text-muted-foreground">P{member.penalty}</span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0"
                              onClick={() =>
                                member.paused
                                  ? unpauseMutation.mutate({ queueId: queue.id, extNum: member.extensionNumber })
                                  : pauseMutation.mutate({ queueId: queue.id, extNum: member.extensionNumber })
                              }
                            >
                              {member.paused ? (
                                <Play className="h-3 w-3 text-green-600" />
                              ) : (
                                <Pause className="h-3 w-3 text-yellow-600" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedQueue ? 'Edit Queue' : 'New Queue'}</DialogTitle>
            <DialogDescription>
              {selectedQueue
                ? 'Update queue settings and members.'
                : 'Create a queue for handling incoming callers.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Queue Name</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Sales, Support"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="strategy">Ring Strategy</Label>
                <Select value={formStrategy} onValueChange={(v) => setFormStrategy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(strategyLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <div>
                          <div>{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {strategyDescriptions[value]}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeout">Agent Timeout (s)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={formTimeout}
                  onChange={(e) => setFormTimeout(e.target.value)}
                  min="5"
                  max="300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retry">Retry Delay (s)</Label>
                <Input
                  id="retry"
                  type="number"
                  value={formRetry}
                  onChange={(e) => setFormRetry(e.target.value)}
                  min="1"
                  max="60"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxWait">Max Wait (s)</Label>
                <Input
                  id="maxWait"
                  type="number"
                  value={formMaxWait}
                  onChange={(e) => setFormMaxWait(e.target.value)}
                  min="30"
                  max="3600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="holdMusic">Hold Music</Label>
                <Select value={formHoldMusicId || 'none'} onValueChange={(v) => setFormHoldMusicId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default hold music" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default</SelectItem>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="joinAnnouncement">Join Announcement</Label>
                <Select value={formJoinAnnouncementId || 'none'} onValueChange={(v) => setFormJoinAnnouncementId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No announcement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label>Queue Enabled</Label>
            </div>

            <div className="space-y-2">
              <Label>Queue Members</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {extensions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No extensions available</p>
                ) : (
                  extensions.map((ext) => {
                    const memberData = formMembers.find((m) => m.extensionNumber === ext.number);
                    const isSelected = !!memberData;

                    return (
                      <div
                        key={ext.number}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMember(ext.number)}
                          className="h-4 w-4"
                        />
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono">{ext.number}</span>
                        <span className="text-muted-foreground flex-1">- {ext.name}</span>
                        {isSelected && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Penalty:</Label>
                            <Input
                              type="number"
                              value={memberData?.penalty || 0}
                              onChange={(e) =>
                                updateMemberPenalty(ext.number, parseInt(e.target.value, 10) || 0)
                              }
                              min="0"
                              max="10"
                              className="w-16 h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formMembers.length} agent(s) selected. Lower penalty = higher priority.
              </p>
            </div>

            {/* Position Announcements Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <Volume2 className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Position Announcements</Label>
                <Badge variant="secondary" className="ml-auto">Dynamic TTS</Badge>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Switch
                  checked={formPosAnnounceEnabled}
                  onCheckedChange={setFormPosAnnounceEnabled}
                />
                <Label>Enable dynamic position announcements</Label>
              </div>

              {formPosAnnounceEnabled && (
                <div className="space-y-4 pl-2 border-l-2 border-primary/20">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Voice</Label>
                      <Select value={formPosAnnounceVoice} onValueChange={setFormPosAnnounceVoice}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {elevenLabsVoices.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              {voice.name} - {voice.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={formPosAnnounceLanguage} onValueChange={setFormPosAnnounceLanguage}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              {lang.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Announce Every (s)</Label>
                      <Input
                        type="number"
                        value={formPosAnnounceInterval}
                        onChange={(e) => setFormPosAnnounceInterval(e.target.value)}
                        min="30"
                        max="300"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Message Templates</Label>
                    <p className="text-xs text-muted-foreground">
                      Use {'{position}'} for caller position and {'{waitTime}'} for estimated wait.
                    </p>

                    {formPosAnnounceVariations.ranges.map((range, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">
                            Position {range.min}{range.max ? `-${range.max}` : '+'}
                          </Badge>
                        </div>
                        <Textarea
                          value={range.template}
                          onChange={(e) => {
                            const newRanges = [...formPosAnnounceVariations.ranges];
                            newRanges[index] = { ...range, template: e.target.value };
                            setFormPosAnnounceVariations({
                              ...formPosAnnounceVariations,
                              ranges: newRanges,
                            });
                          }}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formPosAnnounceVariations.includeWaitTime}
                      onCheckedChange={(checked) =>
                        setFormPosAnnounceVariations({
                          ...formPosAnnounceVariations,
                          includeWaitTime: checked,
                        })
                      }
                    />
                    <Label className="text-sm">Include estimated wait time</Label>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : selectedQueue ? 'Save Changes' : 'Create Queue'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Queue"
        description={`Are you sure you want to delete "${queueToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call Queues Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are Queues?</h4>
              <p className="text-sm text-muted-foreground">
                Call queues hold incoming callers in line until an agent is available. Callers hear hold music and optional announcements while waiting. Queues are ideal for support and sales teams.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Queue Strategies</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Ring All:</strong> Ring all available agents simultaneously</li>
                <li><strong>Hunt:</strong> Ring agents one by one in order</li>
                <li><strong>Random:</strong> Ring a random available agent</li>
                <li><strong>Round Robin:</strong> Rotate through agents in turn</li>
                <li><strong>Least Recent:</strong> Ring the agent who has been idle longest</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Queue Settings</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Agent Timeout:</strong> Seconds to ring each agent before trying the next</li>
                <li><strong>Retry Delay:</strong> Seconds to wait before retrying agents</li>
                <li><strong>Max Wait:</strong> Maximum time a caller waits before fallback action</li>
                <li><strong>Hold Music:</strong> Audio played while callers wait</li>
                <li><strong>Join Announcement:</strong> Message played when caller enters queue</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Member Penalty</h4>
              <p className="text-sm text-muted-foreground">
                Lower penalty = higher priority. Agents with penalty 0 are tried first. Use this to route calls to senior agents first, or backup agents when primary agents are busy.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Pause/Unpause</h4>
              <p className="text-sm text-muted-foreground">
                Agents can be paused to temporarily stop receiving calls (e.g., during breaks) without removing them from the queue.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
