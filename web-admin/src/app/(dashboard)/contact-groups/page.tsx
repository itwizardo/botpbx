'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Upload,
  Phone,
  PhoneOff,
  Eye,
  MoreVertical,
  X,
  FileText,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { contactGroupsApi, ContactGroup, ContactGroupMember } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ContactGroupsPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [memberFilter, setMemberFilter] = useState<'all' | 'called' | 'uncalled'>('all');

  // Form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [importText, setImportText] = useState('');

  // Fetch groups
  const { data, isLoading } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: contactGroupsApi.list,
  });

  // Fetch members when viewing a group
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['contact-group-members', selectedGroup?.id, memberFilter],
    queryFn: () => selectedGroup ? contactGroupsApi.getMembers(selectedGroup.id, memberFilter) : null,
    enabled: !!selectedGroup && viewDialogOpen,
  });

  // Fetch DNC stats
  const { data: dncStats } = useQuery({
    queryKey: ['dnc-stats'],
    queryFn: contactGroupsApi.getDNCStats,
  });

  // Create group mutation
  const createMutation = useMutation({
    mutationFn: contactGroupsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success('Group created successfully');
      setCreateDialogOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
    },
  });

  // Delete group mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactGroupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success('Group deleted');
      setDeleteDialogOpen(false);
      setSelectedGroup(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete group');
    },
  });

  // Import members mutation
  const importMutation = useMutation({
    mutationFn: async ({ groupId, text }: { groupId: string; text: string }) => {
      // Parse text: each line is "phone,name" or just "phone"
      const lines = text.split('\n').filter(l => l.trim());
      const members = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          phoneNumber: parts[0],
          name: parts[1] || undefined,
        };
      }).filter(m => m.phoneNumber);

      return contactGroupsApi.addMembersBulk(groupId, members);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      queryClient.invalidateQueries({ queryKey: ['contact-group-members'] });
      toast.success(result.message);
      setImportDialogOpen(false);
      setImportText('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import members');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
      contactGroupsApi.removeMember(groupId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      queryClient.invalidateQueries({ queryKey: ['contact-group-members'] });
      toast.success('Member removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    createMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim() || undefined,
    });
  };

  const handleImport = () => {
    if (!selectedGroup || !importText.trim()) {
      toast.error('Please enter phone numbers to import');
      return;
    }
    importMutation.mutate({ groupId: selectedGroup.id, text: importText });
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const groups = data?.groups || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contact Groups</h1>
          <p className="text-muted-foreground">
            Organize numbers into groups and track which have been called globally
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Group
        </Button>
      </div>

      {/* Global DNC Stats */}
      <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
              <PhoneOff className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Global Do Not Call List</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {dncStats?.totalCalled?.toLocaleString() || '0'} numbers called
              </p>
            </div>
          </div>
          <p className="text-sm text-orange-600/80 dark:text-orange-400/80 max-w-xs text-right">
            Numbers called across all campaigns are tracked globally and shown in red
          </p>
        </CardContent>
      </Card>

      {/* Groups Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Contact Groups</h3>
            <p className="text-muted-foreground mb-4">
              Create groups to organize your contacts (e.g., "Dutch Numbers", "VIP Leads")
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate">{group.name}</CardTitle>
                    {group.description && (
                      <CardDescription className="line-clamp-2 mt-1">
                        {group.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setSelectedGroup(group);
                        setViewDialogOpen(true);
                      }}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Members
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedGroup(group);
                        setImportDialogOpen(true);
                      }}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Numbers
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        const result = await contactGroupsApi.exportForCampaign(group.id, true);
                        const csv = result.contacts.map(c => c.name ? `${c.phoneNumber},${c.name}` : c.phoneNumber).join('\n');
                        try {
                          if (navigator.clipboard) {
                            await navigator.clipboard.writeText(csv);
                          } else {
                            const ta = document.createElement('textarea');
                            ta.value = csv;
                            ta.setAttribute('readonly', '');
                            ta.style.position = 'absolute';
                            ta.style.left = '-9999px';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                          }
                        } catch { /* ignore */ }
                        toast.success(`Copied ${result.count} uncalled numbers to clipboard`);
                      }}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Uncalled
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setSelectedGroup(group);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{group.totalMembers || 0}</span>
                    <span className="text-muted-foreground">total</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-600">{group.uncalledCount || 0}</span>
                    <span className="text-muted-foreground">uncalled</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PhoneOff className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-500">{group.calledCount || 0}</span>
                    <span className="text-muted-foreground">called</span>
                  </div>
                </div>

                {/* Progress bar */}
                {(group.totalMembers || 0) > 0 && (
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{
                          width: `${((group.calledCount || 0) / (group.totalMembers || 1)) * 100}%`
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(((group.calledCount || 0) / (group.totalMembers || 1)) * 100)}% called
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Contact Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize your contacts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Dutch Numbers, VIP Leads"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Description (optional)</Label>
              <Textarea
                id="group-description"
                placeholder="Add notes about this group..."
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Group'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Numbers Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Numbers to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Enter phone numbers to import (one per line). Optionally add names after a comma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-text">Phone Numbers</Label>
              <Textarea
                id="import-text"
                placeholder={`+31612345678
+31698765432,John Smith
+31611111111,Jane Doe`}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: phone number (required), name (optional) separated by comma
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Numbers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Members Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.name} - Members</DialogTitle>
            <DialogDescription>
              {selectedGroup?.totalMembers || 0} numbers in this group
            </DialogDescription>
          </DialogHeader>

          {/* Filter Tabs */}
          <div className="flex gap-2 border-b pb-4">
            {(['all', 'uncalled', 'called'] as const).map((filter) => (
              <Button
                key={filter}
                variant={memberFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMemberFilter(filter)}
              >
                {filter === 'all' && `All (${selectedGroup?.totalMembers || 0})`}
                {filter === 'uncalled' && (
                  <>
                    <Phone className="h-3 w-3 mr-1 text-green-600" />
                    Uncalled ({selectedGroup?.uncalledCount || 0})
                  </>
                )}
                {filter === 'called' && (
                  <>
                    <PhoneOff className="h-3 w-3 mr-1 text-red-500" />
                    Called ({selectedGroup?.calledCount || 0})
                  </>
                )}
              </Button>
            ))}
          </div>

          {/* Members List */}
          <div className="overflow-y-auto max-h-[400px] space-y-2">
            {membersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (membersData?.members || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {memberFilter === 'all' ? 'No members in this group yet' :
                 memberFilter === 'called' ? 'No called numbers' : 'No uncalled numbers'}
              </div>
            ) : (
              membersData?.members.map((member: ContactGroupMember) => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    member.calledAt ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center',
                      member.calledAt ? 'bg-red-100 dark:bg-red-900/50' : 'bg-green-100 dark:bg-green-900/50'
                    )}>
                      {member.calledAt ? (
                        <PhoneOff className="h-4 w-4 text-red-600" />
                      ) : (
                        <Phone className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{member.phoneNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.name || 'No name'} {member.calledAt && `- Called ${formatDate(member.calledAt)}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (selectedGroup) {
                        removeMemberMutation.mutate({
                          groupId: selectedGroup.id,
                          memberId: member.id,
                        });
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                setImportDialogOpen(true);
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import More
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Contact Group"
        description={`Are you sure you want to delete "${selectedGroup?.name}"? This will remove all ${selectedGroup?.totalMembers || 0} members from this group. The global DNC list will NOT be affected.`}
        confirmText="Delete Group"
        variant="destructive"
        onConfirm={() => selectedGroup && deleteMutation.mutate(selectedGroup.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
