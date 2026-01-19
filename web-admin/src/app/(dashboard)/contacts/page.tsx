'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  FolderOpen,
  PhoneOff,
  CheckCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Phone,
  Megaphone,
  Users,
} from 'lucide-react';
import { contactGroupsApi } from '@/lib/api';
import type { ContactGroup, ContactGroupMember } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import { getApiBaseUrl } from '@/lib/api';

export default function ContactGroupsPage() {
  const queryClient = useQueryClient();
  const groupFileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAllowRedial, setGroupAllowRedial] = useState(false);
  const [importToGroupDialogOpen, setImportToGroupDialogOpen] = useState(false);
  const [groupToImport, setGroupToImport] = useState<ContactGroup | null>(null);
  const [groupImportData, setGroupImportData] = useState('');
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<'all' | 'called' | 'uncalled'>('all');

  // Queries
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: contactGroupsApi.list,
  });

  const { data: dncStats } = useQuery({
    queryKey: ['dnc-stats'],
    queryFn: contactGroupsApi.getDNCStats,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['group-members', expandedGroupId, memberFilter],
    queryFn: () => expandedGroupId ? contactGroupsApi.getMembers(expandedGroupId, memberFilter === 'all' ? undefined : memberFilter) : Promise.resolve({ members: [], total: 0 }),
    enabled: !!expandedGroupId,
  });

  // WebSocket for real-time updates
  useEffect(() => {
    const wsUrl = `${getApiBaseUrl().replace('http', 'ws')}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'contact:called' || data.type === 'campaign:contact:called') {
              // Refresh groups and DNC stats when a contact is called
              queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
              queryClient.invalidateQueries({ queryKey: ['dnc-stats'] });
              if (expandedGroupId) {
                queryClient.invalidateQueries({ queryKey: ['group-members', expandedGroupId] });
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        // Reconnect on error
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [queryClient, expandedGroupId]);

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: contactGroupsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success('Group created');
      setCreateGroupDialogOpen(false);
      setGroupName('');
      setGroupDescription('');
      setGroupAllowRedial(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => contactGroupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success('Group deleted');
      setDeleteGroupDialogOpen(false);
      setGroupToDelete(null);
      if (expandedGroupId === groupToDelete?.id) {
        setExpandedGroupId(null);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete group');
    },
  });

  const importToGroupMutation = useMutation({
    mutationFn: async ({ groupId, members }: { groupId: string; members: Array<{ phoneNumber: string; name?: string }> }) => {
      return contactGroupsApi.addMembersBulk(groupId, members);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      toast.success(result.message || `Added ${result.added} numbers, skipped ${result.skipped} duplicates`);
      setImportToGroupDialogOpen(false);
      setGroupToImport(null);
      setGroupImportData('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import numbers');
    },
  });

  // Handlers
  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast.error('Group name is required');
      return;
    }
    createGroupMutation.mutate({
      name: groupName.trim(),
      description: groupDescription.trim() || undefined,
      allowRedial: groupAllowRedial,
    });
  };

  const handleImportToGroup = () => {
    if (!groupToImport || !groupImportData.trim()) return;
    const lines = groupImportData.split('\n').filter(line => line.trim());
    const members = lines.map(line => {
      const [phoneNumber, name] = line.split(',').map(s => s.trim());
      return { phoneNumber, name: name || undefined };
    }).filter(m => m.phoneNumber);

    if (members.length === 0) {
      toast.error('No valid phone numbers found');
      return;
    }

    importToGroupMutation.mutate({ groupId: groupToImport.id, members });
  };

  const handleGroupFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setGroupImportData(event.target?.result as string);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleGroupExpand = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    } else {
      setExpandedGroupId(groupId);
      setMemberFilter('all');
    }
  };

  const groups = groupsData?.groups || [];
  const totalNumbers = groups.reduce((sum, g) => sum + (g.totalMembers || 0), 0);
  const totalCalled = dncStats?.totalCalled || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Groups</h1>
          <p className="text-muted-foreground">
            Organize phone numbers into groups for campaigns
          </p>
        </div>
        <Button onClick={() => setCreateGroupDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Group
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNumbers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Global DNC</CardTitle>
            <PhoneOff className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalCalled.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Numbers already called</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups.length}</div>
            <p className="text-xs text-muted-foreground">Contact groups</p>
          </CardContent>
        </Card>
      </div>

      {/* Groups List */}
      {groupsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center">
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Contact Groups</h3>
          <p className="text-muted-foreground mb-4">
            Create your first group to organize phone numbers for campaigns.
          </p>
          <Button onClick={() => setCreateGroupDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Group
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isExpanded = expandedGroupId === group.id;
            const calledPercent = group.totalMembers ? Math.round((group.calledCount || 0) / group.totalMembers * 100) : 0;

            return (
              <Card key={group.id} className="overflow-hidden">
                <div
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroupExpand(group.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{group.name}</CardTitle>
                            {group.allowRedial ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Redial
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                <PhoneOff className="h-3 w-3 mr-1" />
                                DNC
                              </Badge>
                            )}
                          </div>
                          {group.description && (
                            <CardDescription className="mt-1">{group.description}</CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); setGroupToDelete(group); setDeleteGroupDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          <strong>{group.totalMembers || 0}</strong> total
                        </span>
                        <span className="text-red-600">
                          <strong>{group.calledCount || 0}</strong> called
                        </span>
                        <span className="text-green-600">
                          <strong>{group.uncalledCount || 0}</strong> uncalled
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">{calledPercent}% called</span>
                    </div>
                    <Progress value={calledPercent} className="h-2" />
                  </CardContent>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t bg-muted/30 p-4 space-y-4">
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setGroupToImport(group); setImportToGroupDialogOpen(true); }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Import Numbers
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Navigate to campaigns with pre-selected group
                          window.location.href = '/campaigns?newCampaign=true&groupId=' + group.id;
                        }}
                      >
                        <Megaphone className="h-4 w-4 mr-1" />
                        Use in Campaign
                      </Button>
                    </div>

                    {/* Member Filter */}
                    <div className="flex gap-1 p-1 bg-background rounded-lg w-fit">
                      {(['all', 'uncalled', 'called'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={(e) => { e.stopPropagation(); setMemberFilter(filter); }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            memberFilter === filter ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                          }`}
                        >
                          {filter === 'all' ? 'All' : filter === 'uncalled' ? 'Not Called' : 'Called'}
                        </button>
                      ))}
                    </div>

                    {/* Members List */}
                    {membersLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : membersData?.members.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        {memberFilter === 'all' ? 'No members in this group yet' : `No ${memberFilter} members`}
                      </div>
                    ) : (
                      <div className="border rounded-lg bg-background max-h-64 overflow-y-auto">
                        {membersData?.members.slice(0, 50).map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between px-3 py-2 border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-3">
                              {member.calledAt ? (
                                <div className="p-1 rounded-full bg-red-100">
                                  <CheckCircle className="h-4 w-4 text-red-600" />
                                </div>
                              ) : (
                                <div className="p-1 rounded-full bg-green-100">
                                  <Clock className="h-4 w-4 text-green-600" />
                                </div>
                              )}
                              <div>
                                <span className="font-mono text-sm">{member.phoneNumber}</span>
                                {member.name && (
                                  <span className="text-muted-foreground ml-2 text-sm">- {member.name}</span>
                                )}
                              </div>
                            </div>
                            {member.calledAt && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(member.calledAt * 1000).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        ))}
                        {(membersData?.members.length || 0) > 50 && (
                          <div className="px-3 py-2 text-center text-sm text-muted-foreground bg-muted">
                            ... and {(membersData?.members.length || 0) - 50} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Contact Group</DialogTitle>
            <DialogDescription>Create a new group to organize contacts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Name *</Label>
              <Input id="groupName" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g., Dutch Numbers" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupDesc">Description</Label>
              <Textarea id="groupDesc" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="Optional description..." rows={2} />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="allowRedial" className="text-sm font-medium">Allow Redial</Label>
                <p className="text-xs text-muted-foreground">
                  {groupAllowRedial
                    ? 'Numbers can be called again (NOT added to DNC)'
                    : 'Numbers will be added to DNC after calling'}
                </p>
              </div>
              <input
                id="allowRedial"
                type="checkbox"
                checked={groupAllowRedial}
                onChange={(e) => setGroupAllowRedial(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={createGroupMutation.isPending || !groupName.trim()}>
              {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import to Group Dialog */}
      <Dialog open={importToGroupDialogOpen} onOpenChange={setImportToGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Numbers to {groupToImport?.name}</DialogTitle>
            <DialogDescription>Add phone numbers to this group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">Upload a .txt or .csv file</p>
              <input
                ref={groupFileInputRef}
                type="file"
                accept=".txt,.csv,.text"
                className="hidden"
                onChange={handleGroupFileUpload}
              />
              <Button variant="outline" onClick={() => groupFileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Or paste numbers directly:</Label>
              <Textarea
                value={groupImportData}
                onChange={(e) => setGroupImportData(e.target.value)}
                placeholder={`+31612345678\n+31698765432, John Doe\n+31611111111`}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">One phone number per line. Optionally add name after comma.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportToGroupDialogOpen(false); setGroupImportData(''); }}>Cancel</Button>
            <Button onClick={handleImportToGroup} disabled={importToGroupMutation.isPending || !groupImportData.trim()}>
              {importToGroupMutation.isPending ? 'Importing...' : 'Import Numbers'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <ConfirmDialog
        open={deleteGroupDialogOpen}
        onOpenChange={setDeleteGroupDialogOpen}
        title="Delete Group"
        description={`Are you sure you want to delete "${groupToDelete?.name}"? This will remove all ${groupToDelete?.totalMembers || 0} members from this group. This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => groupToDelete && deleteGroupMutation.mutate(groupToDelete.id)}
        loading={deleteGroupMutation.isPending}
      />
    </div>
  );
}
