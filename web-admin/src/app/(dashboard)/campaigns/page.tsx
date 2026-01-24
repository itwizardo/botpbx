'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Square,
  Edit,
  Trash2,
  HelpCircle,
  Bot,
  Phone,
  Users,
  Settings,
  Copy,
} from 'lucide-react';
import { campaignsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CampaignDialog } from '@/components/campaigns/campaign-dialog';
import { CampaignStats } from '@/components/campaigns/campaign-stats';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { Campaign } from '@/types/models';

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [campaignToStop, setCampaignToStop] = useState<Campaign | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.list,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign started');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start campaign');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign paused');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pause campaign');
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign stopped');
      setStopDialogOpen(false);
      setCampaignToStop(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to stop campaign');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete campaign');
    },
  });

  const handleCreate = () => {
    setSelectedCampaign(null);
    setDialogOpen(true);
  };

  const handleEdit = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setDialogOpen(true);
  };

  const handleDeleteClick = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  const handleStopClick = (campaign: Campaign) => {
    setCampaignToStop(campaign);
    setStopDialogOpen(true);
  };

  const handleStopConfirm = () => {
    if (campaignToStop) {
      stopMutation.mutate(campaignToStop.id);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'info';
      case 'cancelled':
        return 'error';
      default:
        return 'secondary';
    }
  };

  const getHandlerIcon = (handlerType: string) => {
    switch (handlerType) {
      case 'ai_agent':
        return <Bot className="h-4 w-4" />;
      case 'ivr':
        return <Phone className="h-4 w-4" />;
      case 'ring_group':
        return <Users className="h-4 w-4" />;
      case 'extension':
        return <Settings className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getHandlerLabel = (handlerType: string) => {
    switch (handlerType) {
      case 'ai_agent':
        return 'AI Agent';
      case 'ivr':
        return 'IVR Menu';
      case 'ring_group':
        return 'Ring Group';
      case 'extension':
        return 'Extension';
      default:
        return 'IVR Menu';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Manage outbound dialing campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {data?.campaigns && data.campaigns.length > 0 && (
        <CampaignStats campaigns={data.campaigns} />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : data?.campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No campaigns yet</p>
          <Button className="mt-4" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create your first campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.campaigns.map((campaign) => {
            const progress = campaign.totalContacts > 0
              ? Math.round((campaign.dialedCount / campaign.totalContacts) * 100)
              : 0;

            return (
              <Card key={campaign.id} className={campaign.handlerType === 'ai_agent' ? 'border-primary/30' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      {campaign.handlerType === 'ai_agent' && (
                        <Badge variant="outline" className="bg-primary/10">
                          <Bot className="h-3 w-3 mr-1" />
                          AI
                        </Badge>
                      )}
                    </div>
                    <Badge variant={getStatusVariant(campaign.status)}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {getHandlerIcon(campaign.handlerType)}
                    <span>{getHandlerLabel(campaign.handlerType)}</span>
                    {campaign.amdEnabled && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">AMD</Badge>
                    )}
                  </div>
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground">{campaign.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  <div className="grid grid-cols-5 gap-2 text-center text-sm">
                    <div>
                      <div className="font-semibold">{campaign.totalContacts}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div>
                      <div className="font-semibold">{campaign.dialedCount}</div>
                      <div className="text-xs text-muted-foreground">Dialed</div>
                    </div>
                    <div>
                      <div className="font-semibold text-green-600">{campaign.answeredCount}</div>
                      <div className="text-xs text-muted-foreground">Answered</div>
                    </div>
                    <div>
                      <div className="font-semibold text-primary">{campaign.connectedCount}</div>
                      <div className="text-xs text-muted-foreground">Connected</div>
                    </div>
                    {campaign.amdEnabled && (
                      <div>
                        <div className="font-semibold text-orange-500">{campaign.answeringMachineCount || 0}</div>
                        <div className="text-xs text-muted-foreground">Voicemail</div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    {campaign.status === 'draft' && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => startMutation.mutate(campaign.id)}
                        disabled={startMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    )}
                    {campaign.status === 'running' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => pauseMutation.mutate(campaign.id)}
                        disabled={pauseMutation.isPending}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    )}
                    {campaign.status === 'paused' && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => startMutation.mutate(campaign.id)}
                        disabled={startMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    )}
                    {(campaign.status === 'running' || campaign.status === 'paused') && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleStopClick(campaign)}
                      >
                        <Square className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(campaign)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {campaign.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteClick(campaign)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={selectedCampaign}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Campaign"
        description={`Are you sure you want to delete campaign "${campaignToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={stopDialogOpen}
        onOpenChange={setStopDialogOpen}
        title="Stop Campaign"
        description={`Are you sure you want to stop campaign "${campaignToStop?.name}"? This will end all active calls and mark the campaign as cancelled.`}
        confirmText="Stop Campaign"
        variant="destructive"
        onConfirm={handleStopConfirm}
        loading={stopMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campaigns Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are Campaigns?</h4>
              <p className="text-sm text-muted-foreground">
                Campaigns are outbound dialing programs that automatically call contacts from your contact list. They can use AI agents, IVR menus, or ring groups to handle answered calls.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Campaign Lifecycle</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Draft:</strong> Campaign is being configured, not yet started</li>
                <li><strong>Running:</strong> Actively dialing contacts</li>
                <li><strong>Paused:</strong> Temporarily stopped, can resume</li>
                <li><strong>Completed:</strong> All contacts have been dialed</li>
                <li><strong>Cancelled:</strong> Campaign was stopped permanently</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Settings</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Contacts:</strong> Select contacts to call from your contact list</li>
                <li><strong>Handler:</strong> What happens when a call is answered (AI agent, IVR, Ring Group)</li>
                <li><strong>Trunk:</strong> Which SIP trunk to use for outbound calls</li>
                <li><strong>Caller ID:</strong> The number displayed to called parties</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Compliance</h4>
              <p className="text-sm text-muted-foreground">
                Ensure compliance with TCPA and DNC regulations. Contacts marked as DNC in your contact list will not be dialed.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
