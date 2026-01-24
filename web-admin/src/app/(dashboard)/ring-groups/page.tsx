'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Phone,
  Settings,
  UserPlus,
  HelpCircle,
} from 'lucide-react';
import { ringGroupsApi, extensionsApi, RingGroup } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';

const strategyLabels: Record<string, string> = {
  ringall: 'Ring All',
  hunt: 'Hunt (Sequential)',
  random: 'Random',
  roundrobin: 'Round Robin',
};

export default function RingGroupsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<RingGroup | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<RingGroup | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStrategy, setFormStrategy] = useState<RingGroup['strategy']>('ringall');
  const [formRingTime, setFormRingTime] = useState('20');
  const [formMembers, setFormMembers] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['ring-groups'],
    queryFn: ringGroupsApi.list,
  });

  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: ringGroupsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ring-groups'] });
      toast.success('Ring group created');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create ring group');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ringGroupsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ring-groups'] });
      toast.success('Ring group updated');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update ring group');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ringGroupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ring-groups'] });
      toast.success('Ring group deleted');
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete ring group');
    },
  });

  const handleCreate = () => {
    setSelectedGroup(null);
    setFormName('');
    setFormStrategy('ringall');
    setFormRingTime('20');
    setFormMembers([]);
    setDialogOpen(true);
  };

  const handleEdit = (group: RingGroup) => {
    setSelectedGroup(group);
    setFormName(group.name);
    setFormStrategy(group.strategy);
    setFormRingTime(String(group.ringTime));
    setFormMembers(group.members?.map(m => m.extensionNumber) || []);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedGroup(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formName,
      strategy: formStrategy,
      ringTime: parseInt(formRingTime, 10),
      members: formMembers.map((num, idx) => ({ number: num, priority: idx + 1 })),
    };

    if (selectedGroup) {
      updateMutation.mutate({ id: selectedGroup.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDeleteClick = (group: RingGroup) => {
    setGroupToDelete(group);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (groupToDelete) {
      deleteMutation.mutate(groupToDelete.id);
    }
  };

  const toggleMember = (extensionNumber: string) => {
    setFormMembers(prev =>
      prev.includes(extensionNumber)
        ? prev.filter(n => n !== extensionNumber)
        : [...prev, extensionNumber]
    );
  };

  const extensions = extensionsData?.extensions || [];
  const ringGroups = data?.ringGroups || [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ring Groups</h1>
          <p className="text-muted-foreground">Manage groups of extensions that ring together</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Ring Group
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Ring Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : ringGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No ring groups configured</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first ring group
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {ringGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{group.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{strategyLabels[group.strategy]}</Badge>
                        <span>{group.ringTime}s ring time</span>
                        <span>•</span>
                        <span>{group.members?.length || 0} members</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={group.enabled ? 'success' : 'secondary'}>
                      {group.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(group)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDeleteClick(group)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup ? 'Edit Ring Group' : 'New Ring Group'}
            </DialogTitle>
            <DialogDescription>
              {selectedGroup
                ? 'Update the ring group settings and members.'
                : 'Create a group of extensions that ring together.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Sales Team, Support"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strategy">Ring Strategy</Label>
                <Select value={formStrategy} onValueChange={(v) => setFormStrategy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ringall">Ring All</SelectItem>
                    <SelectItem value="hunt">Hunt (Sequential)</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="roundrobin">Round Robin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ringTime">Ring Time (seconds)</Label>
                <Input
                  id="ringTime"
                  type="number"
                  value={formRingTime}
                  onChange={(e) => setFormRingTime(e.target.value)}
                  min="5"
                  max="120"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Members</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {extensions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No extensions available</p>
                ) : (
                  extensions.map((ext) => (
                    <label
                      key={ext.number}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formMembers.includes(ext.number)}
                        onChange={() => toggleMember(ext.number)}
                        className="h-4 w-4"
                      />
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{ext.number}</span>
                      <span className="text-muted-foreground">- {ext.name}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formMembers.length} extension(s) selected
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : selectedGroup ? 'Save Changes' : 'Create Group'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Ring Group"
        description={`Are you sure you want to delete "${groupToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ring Groups Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are Ring Groups?</h4>
              <p className="text-sm text-muted-foreground">
                Ring Groups let you group multiple extensions together so they can be reached by a single number. When a call comes in to the ring group, it rings the member extensions according to the selected strategy.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Ring Strategies</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Ring All:</strong> All phones ring simultaneously until one answers</li>
                <li><strong>Hunt (Sequential):</strong> Ring extensions one by one in order until answered</li>
                <li><strong>Random:</strong> Ring a randomly selected available extension</li>
                <li><strong>Round Robin:</strong> Rotate through members, remembering where it left off</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Settings</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Ring Time:</strong> How long (in seconds) to ring before moving to the next action or member</li>
                <li><strong>Members:</strong> The extensions that are part of this group</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Tips</h4>
              <p className="text-sm text-muted-foreground">
                Use "Ring All" for small teams where anyone can answer. Use "Hunt" or "Round Robin" to distribute calls more evenly across larger teams.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
