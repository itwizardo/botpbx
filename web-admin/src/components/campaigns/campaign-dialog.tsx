'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { campaignsApi, ivrApi, trunksApi, ringGroupsApi, contactGroupsApi, api } from '@/lib/api';
import type { ContactGroup } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Bot,
  Phone,
  Users,
  Settings,
  Upload,
  FileSpreadsheet,
  Trash2,
  AlertCircle,
  FolderOpen,
  RefreshCw,
  PhoneOff,
  Loader2,
} from 'lucide-react';
import type { Campaign } from '@/types/models';

const campaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  handlerType: z.enum(['ivr', 'ai_agent', 'ring_group', 'extension']),
  ivrMenuId: z.string().optional(),
  aiAgentId: z.string().optional(),
  ringGroupId: z.string().optional(),
  targetExtensions: z.string().optional(),
  callerId: z.string().optional(),
  maxConcurrent: z.coerce.number().min(1).max(100),
  callsPerMinute: z.coerce.number().min(1).max(60),
  retryAttempts: z.coerce.number().min(0).max(10),
  retryDelayMinutes: z.coerce.number().min(1).max(1440),
  amdEnabled: z.boolean(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

interface CampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign | null;
}

interface AIAgent {
  id: string;
  name: string;
  enabled: boolean;
}

interface ContactEntry {
  phoneNumber: string;
  name: string;
}

export function CampaignDialog({ open, onOpenChange, campaign }: CampaignDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!campaign;
  const [activeTab, setActiveTab] = useState('settings');
  const [contactsTab, setContactsTab] = useState<'csv' | 'manual' | 'group'>('csv');
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [newContact, setNewContact] = useState({ phoneNumber: '', name: '' });
  const [csvError, setCsvError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupContacts, setGroupContacts] = useState<ContactEntry[]>([]);
  const [isLoadingGroupContacts, setIsLoadingGroupContacts] = useState(false);
  const [selectedTrunkId, setSelectedTrunkId] = useState<string>('auto');

  // Fetch IVR menus
  const { data: menusData } = useQuery({
    queryKey: ['ivr-menus'],
    queryFn: ivrApi.listMenus,
    enabled: open,
  });

  // Fetch AI agents
  const { data: agentsData } = useQuery({
    queryKey: ['ai-agents'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AIAgent[] }>('/api/v1/ai/agents');
      return res.data;
    },
    enabled: open,
  });

  // Fetch ring groups
  const { data: ringGroupsData } = useQuery({
    queryKey: ['ring-groups'],
    queryFn: ringGroupsApi.list,
    enabled: open,
  });

  // Fetch trunks
  const { data: trunksData } = useQuery({
    queryKey: ['trunks'],
    queryFn: trunksApi.list,
    enabled: open,
  });

  // Fetch contact groups
  const { data: groupsData } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: contactGroupsApi.list,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '',
      description: '',
      handlerType: 'ai_agent',
      ivrMenuId: '',
      aiAgentId: '',
      ringGroupId: '',
      targetExtensions: '',
      callerId: '',
      maxConcurrent: 10,
      callsPerMinute: 10,
      retryAttempts: 3,
      retryDelayMinutes: 30,
      amdEnabled: true,
    },
  });

  const handlerType = watch('handlerType');

  useEffect(() => {
    if (campaign) {
      reset({
        name: campaign.name,
        description: campaign.description || '',
        handlerType: campaign.handlerType || 'ivr',
        ivrMenuId: campaign.ivrMenuId || '',
        aiAgentId: campaign.aiAgentId || '',
        ringGroupId: campaign.ringGroupId || '',
        targetExtensions: campaign.targetExtensions || '',
        callerId: campaign.callerId || '',
        maxConcurrent: campaign.maxConcurrent || 10,
        callsPerMinute: campaign.callsPerMinute || 10,
        retryAttempts: campaign.retryAttempts || 3,
        retryDelayMinutes: campaign.retryDelayMinutes || 30,
        amdEnabled: campaign.amdEnabled !== false,
      });
      setContacts([]);
      setSelectedTrunkId(campaign.trunkId || 'auto');
    } else {
      reset({
        name: '',
        description: '',
        handlerType: 'ai_agent',
        ivrMenuId: '',
        aiAgentId: '',
        ringGroupId: '',
        targetExtensions: '',
        callerId: '',
        maxConcurrent: 10,
        callsPerMinute: 10,
        retryAttempts: 3,
        retryDelayMinutes: 30,
        amdEnabled: true,
      });
      setContacts([]);
      setSelectedTrunkId('auto');
    }
    setActiveTab('settings');
    setContactsTab('csv');
    setCsvError(null);
    setSelectedGroupId('');
    setGroupContacts([]);
  }, [campaign, reset, open]);

  // Load contacts from selected group
  const loadGroupContacts = useCallback(async (groupId: string) => {
    if (!groupId) {
      setGroupContacts([]);
      return;
    }

    const group = groupsData?.groups.find(g => g.id === groupId);
    if (!group) return;

    setIsLoadingGroupContacts(true);
    try {
      // Use allowRedial to determine if we get all contacts or just uncalled
      const uncalledOnly = !group.allowRedial;
      const result = await contactGroupsApi.exportForCampaign(groupId, uncalledOnly);
      setGroupContacts(result.contacts.map(c => ({ phoneNumber: c.phoneNumber, name: c.name || '' })));
      toast.success(`Loaded ${result.count} contacts from "${group.name}"`);
    } catch (error) {
      toast.error('Failed to load contacts from group');
      setGroupContacts([]);
    } finally {
      setIsLoadingGroupContacts(false);
    }
  }, [groupsData]);

  const createMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      // Create campaign
      const result = await campaignsApi.create({
        name: data.name,
        description: data.description,
        handlerType: data.handlerType,
        ivrMenuId: data.handlerType === 'ivr' ? data.ivrMenuId : undefined,
        aiAgentId: data.handlerType === 'ai_agent' ? data.aiAgentId : undefined,
        ringGroupId: data.handlerType === 'ring_group' ? data.ringGroupId : undefined,
        targetExtensions: data.handlerType === 'extension' ? data.targetExtensions : undefined,
        trunkId: selectedTrunkId && selectedTrunkId !== 'auto' ? selectedTrunkId : undefined,
        callerId: data.callerId,
        maxConcurrent: data.maxConcurrent,
        callsPerMinute: data.callsPerMinute,
        retryAttempts: data.retryAttempts,
        retryDelayMinutes: data.retryDelayMinutes,
        amdEnabled: data.amdEnabled,
      });

      // Combine manual/CSV contacts with group contacts
      const allContacts = [...contacts, ...groupContacts];

      // Upload contacts if any
      if (allContacts.length > 0 && result.id) {
        await campaignsApi.uploadContacts(result.id, allContacts);
      }

      return { ...result, totalContacts: allContacts.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(`Campaign created with ${result.totalContacts} contacts`);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create campaign');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      await campaignsApi.update(campaign!.id, {
        name: data.name,
        description: data.description,
        handlerType: data.handlerType,
        ivrMenuId: data.handlerType === 'ivr' ? data.ivrMenuId : null,
        aiAgentId: data.handlerType === 'ai_agent' ? data.aiAgentId : null,
        ringGroupId: data.handlerType === 'ring_group' ? data.ringGroupId : null,
        targetExtensions: data.handlerType === 'extension' ? data.targetExtensions : null,
        trunkId: selectedTrunkId && selectedTrunkId !== 'auto' ? selectedTrunkId : null,
        callerId: data.callerId,
        maxConcurrent: data.maxConcurrent,
        callsPerMinute: data.callsPerMinute,
        retryAttempts: data.retryAttempts,
        retryDelayMinutes: data.retryDelayMinutes,
        amdEnabled: data.amdEnabled,
      });

      // Combine manual/CSV contacts with group contacts
      const allContacts = [...contacts, ...groupContacts];

      // Upload new contacts if any
      if (allContacts.length > 0) {
        await campaignsApi.uploadContacts(campaign!.id, allContacts);
      }

      return allContacts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(count > 0 ? `Campaign updated with ${count} new contacts` : 'Campaign updated successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update campaign');
    },
  });

  const onSubmit = (data: CampaignFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
          setCsvError('CSV file is empty');
          return;
        }

        // Check header
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('phone') || header.includes('name');
        const startIndex = hasHeader ? 1 : 0;

        const newContacts: ContactEntry[] = [];
        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
          if (parts.length >= 1 && parts[0]) {
            newContacts.push({
              phoneNumber: parts[0],
              name: parts[1] || '',
            });
          }
        }

        if (newContacts.length === 0) {
          setCsvError('No valid contacts found in CSV');
          return;
        }

        setContacts(prev => [...prev, ...newContacts]);
        toast.success(`Added ${newContacts.length} contacts from CSV`);
      } catch {
        setCsvError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const addManualContact = () => {
    if (!newContact.phoneNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }
    setContacts(prev => [...prev, { ...newContact }]);
    setNewContact({ phoneNumber: '', name: '' });
  };

  const removeContact = (index: number) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllContacts = () => {
    setContacts([]);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const menus = menusData?.menus || [];
  const agents = agentsData || [];
  const ringGroups = ringGroupsData?.ringGroups || [];
  const contactGroups = groupsData?.groups || [];
  const totalContacts = contacts.length + groupContacts.length;
  const selectedGroup = contactGroups.find(g => g.id === selectedGroupId);

  const handlerOptions = [
    { value: 'ai_agent', label: 'AI Agent', icon: Bot, description: 'AI-powered conversation' },
    { value: 'ivr', label: 'IVR Menu', icon: Phone, description: 'Interactive voice response' },
    { value: 'ring_group', label: 'Ring Group', icon: Users, description: 'Ring multiple extensions' },
    { value: 'extension', label: 'Extension', icon: Settings, description: 'Direct to extension' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the campaign settings.' : 'Create a new dialing campaign with AI agent or IVR.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="dialing">Dialing</TabsTrigger>
              <TabsTrigger value="contacts">
                Contacts
                {totalContacts > 0 && (
                  <Badge variant="secondary" className="ml-2">{totalContacts}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input id="name" placeholder="Sales Outreach Q1" {...register('name')} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this campaign..."
                    rows={2}
                    {...register('description')}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Handler Type *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {handlerOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setValue('handlerType', option.value as any)}
                          className={cn(
                            'p-3 rounded-lg border text-left transition-all hover:border-primary',
                            handlerType === option.value && 'border-primary bg-primary/5 ring-1 ring-primary'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-4 w-4" />
                            <span className="font-medium text-sm">{option.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Handler-specific dropdown */}
                {handlerType === 'ai_agent' && (
                  <div className="space-y-2">
                    <Label>AI Agent *</Label>
                    <Select
                      value={watch('aiAgentId') || '__none__'}
                      onValueChange={(value) => setValue('aiAgentId', value === '__none__' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select AI agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select an agent...</SelectItem>
                        {agents.filter(a => a.enabled).map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              {agent.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {agents.length === 0 && (
                      <p className="text-xs text-muted-foreground">No AI agents available. Create one first.</p>
                    )}
                  </div>
                )}

                {handlerType === 'ivr' && (
                  <div className="space-y-2">
                    <Label>IVR Menu *</Label>
                    <Select
                      value={watch('ivrMenuId') || '__none__'}
                      onValueChange={(value) => setValue('ivrMenuId', value === '__none__' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select IVR menu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a menu...</SelectItem>
                        {menus.map((menu) => (
                          <SelectItem key={menu.id} value={menu.id}>
                            {menu.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {handlerType === 'ring_group' && (
                  <div className="space-y-2">
                    <Label>Ring Group *</Label>
                    <Select
                      value={watch('ringGroupId') || '__none__'}
                      onValueChange={(value) => setValue('ringGroupId', value === '__none__' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select ring group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a ring group...</SelectItem>
                        {ringGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {handlerType === 'extension' && (
                  <div className="space-y-2">
                    <Label>Target Extensions *</Label>
                    <Input
                      placeholder="100,101,102"
                      {...register('targetExtensions')}
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated list of extensions</p>
                  </div>
                )}
              </TabsContent>

              {/* Dialing Tab */}
              <TabsContent value="dialing" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="trunkId">SIP Trunk</Label>
                  <Select value={selectedTrunkId} onValueChange={setSelectedTrunkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-select (first available)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-select (first available)</SelectItem>
                      {trunksData?.trunks?.filter(t => t.enabled).map((trunk) => (
                        <SelectItem key={trunk.id} value={trunk.id}>
                          {trunk.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Select which SIP trunk to use for outbound calls</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callerId">Caller ID</Label>
                  <Input id="callerId" placeholder="+15551234567" {...register('callerId')} />
                  <p className="text-xs text-muted-foreground">The number shown to recipients</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxConcurrent">Max Concurrent Calls</Label>
                    <Input id="maxConcurrent" type="number" {...register('maxConcurrent')} />
                    <p className="text-xs text-muted-foreground">1-100 simultaneous calls</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="callsPerMinute">Calls Per Minute</Label>
                    <Input id="callsPerMinute" type="number" {...register('callsPerMinute')} />
                    <p className="text-xs text-muted-foreground">Dial rate (1-60/min)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retryAttempts">Retry Attempts</Label>
                    <Input id="retryAttempts" type="number" {...register('retryAttempts')} />
                    <p className="text-xs text-muted-foreground">Times to retry failed calls</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retryDelayMinutes">Retry Delay (min)</Label>
                    <Input id="retryDelayMinutes" type="number" {...register('retryDelayMinutes')} />
                    <p className="text-xs text-muted-foreground">Wait before retrying</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label htmlFor="amdEnabled">Answering Machine Detection</Label>
                    <p className="text-xs text-muted-foreground">Skip voicemail and answering machines</p>
                  </div>
                  <Switch
                    id="amdEnabled"
                    checked={watch('amdEnabled')}
                    onCheckedChange={(checked) => setValue('amdEnabled', checked)}
                  />
                </div>
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4 mt-0">
                {/* Import Method Sub-tabs */}
                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setContactsTab('csv')}
                    className={cn(
                      'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      contactsTab === 'csv' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                    )}
                  >
                    <FileSpreadsheet className="h-4 w-4 inline mr-2" />
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactsTab('manual')}
                    className={cn(
                      'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      contactsTab === 'manual' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                    )}
                  >
                    <Phone className="h-4 w-4 inline mr-2" />
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactsTab('group')}
                    className={cn(
                      'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      contactsTab === 'group' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                    )}
                  >
                    <FolderOpen className="h-4 w-4 inline mr-2" />
                    Contact Group
                  </button>
                </div>

                {/* CSV Upload */}
                {contactsTab === 'csv' && (
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">Upload CSV</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Format: phone_number,name (name is optional)
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={handleCsvUpload}
                      />
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Choose File
                        </span>
                      </Button>
                    </label>
                    {csvError && (
                      <p className="text-xs text-destructive mt-2 flex items-center justify-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {csvError}
                      </p>
                    )}
                  </div>
                )}

                {/* Manual Entry */}
                {contactsTab === 'manual' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Add Contact Manually</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Phone number"
                          value={newContact.phoneNumber}
                          onChange={(e) => setNewContact(prev => ({ ...prev, phoneNumber: e.target.value }))}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Name (optional)"
                          value={newContact.name}
                          onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                          className="flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={addManualContact}>
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Group Import */}
                {contactsTab === 'group' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Contact Group</Label>
                      <Select
                        value={selectedGroupId || '__none__'}
                        onValueChange={(value) => {
                          const newGroupId = value === '__none__' ? '' : value;
                          setSelectedGroupId(newGroupId);
                          if (newGroupId) {
                            loadGroupContacts(newGroupId);
                          } else {
                            setGroupContacts([]);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a contact group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select a group...</SelectItem>
                          {contactGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              <div className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4" />
                                <span>{group.name}</span>
                                <span className="text-muted-foreground">
                                  ({group.allowRedial ? group.totalMembers : group.uncalledCount} numbers)
                                </span>
                                {group.allowRedial ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                                    <RefreshCw className="h-3 w-3" />
                                    Redial
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
                                    <PhoneOff className="h-3 w-3" />
                                    DNC
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {contactGroups.length === 0 && (
                        <p className="text-xs text-muted-foreground">No contact groups available. Create one first.</p>
                      )}
                    </div>

                    {selectedGroup && (
                      <div className="p-3 rounded-lg bg-muted space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{selectedGroup.name}</span>
                          {selectedGroup.allowRedial ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Redial Enabled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <PhoneOff className="h-3 w-3 mr-1" />
                              DNC Mode
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {selectedGroup.allowRedial
                            ? `Will import all ${selectedGroup.totalMembers} numbers (redial enabled)`
                            : `Will import ${selectedGroup.uncalledCount} uncalled numbers (${selectedGroup.calledCount} already in DNC)`}
                        </p>
                        {isLoadingGroupContacts && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading contacts...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Combined Contact List */}
                {(contacts.length > 0 || groupContacts.length > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Contacts to Add ({totalContacts})</Label>
                      <div className="flex gap-2">
                        {contacts.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearAllContacts}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Clear CSV/Manual
                          </Button>
                        )}
                        {groupContacts.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setGroupContacts([]); setSelectedGroupId(''); }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Clear Group
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {/* CSV/Manual contacts */}
                      {contacts.slice(0, 25).map((contact, index) => (
                        <div
                          key={`manual-${index}`}
                          className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">CSV</Badge>
                            <span className="font-mono text-sm">{contact.phoneNumber}</span>
                            {contact.name && (
                              <span className="text-muted-foreground text-sm">- {contact.name}</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {contacts.length > 25 && (
                        <div className="px-3 py-2 text-center text-sm text-muted-foreground bg-muted/50">
                          ... and {contacts.length - 25} more from CSV/Manual
                        </div>
                      )}
                      {/* Group contacts */}
                      {groupContacts.slice(0, 25).map((contact, index) => (
                        <div
                          key={`group-${index}`}
                          className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              <FolderOpen className="h-3 w-3 mr-1" />
                              Group
                            </Badge>
                            <span className="font-mono text-sm">{contact.phoneNumber}</span>
                            {contact.name && (
                              <span className="text-muted-foreground text-sm">- {contact.name}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {groupContacts.length > 25 && (
                        <div className="px-3 py-2 text-center text-sm text-muted-foreground bg-muted/50">
                          ... and {groupContacts.length - 25} more from Contact Group
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Update Campaign' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
