'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  UsersRound,
} from 'lucide-react';
import { usersApi, teamsApi } from '@/lib/api';
import type { Team, TeamMember, TeamsResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { User } from '@/types/models';

// Import new components
import { UserStats } from '@/components/users/user-stats';
import { TeamSection, TeamMember as TeamSectionMember } from '@/components/users/team-section';
import { TeamDialog } from '@/components/users/team-dialog';
import { UserCard, UserCardUser } from '@/components/users/user-card';

export default function UsersPage() {
  const queryClient = useQueryClient();

  // Dialog states
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [deleteTeamDialogOpen, setDeleteTeamDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(true);

  // Selected items
  const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedTeamForMember, setSelectedTeamForMember] = useState<Team | null>(null);

  // User form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'viewer'>('viewer');
  const [enabled, setEnabled] = useState(true);

  // Fetch teams with users
  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.list,
  });

  // Fetch queues for team dialog
  const { data: queuesData } = useQuery({
    queryKey: ['queues'],
    queryFn: teamsApi.getQueues,
  });

  // Fetch permissions for selected user
  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions', selectedUser?.id],
    queryFn: () => usersApi.getPermissions(selectedUser!.id),
    enabled: !!selectedUser && permissionsDialogOpen,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('User created successfully');
      setCreateUserDialogOpen(false);
      resetUserForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User & { password?: string; email?: string; phone?: string; department?: string }> }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('User updated successfully');
      setEditUserDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('User deleted');
      setDeleteUserDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: { permission: string; granted: boolean }[] }) =>
      usersApi.updatePermissions(id, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', selectedUser?.id] });
      toast.success('Permissions updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update permissions');
    },
  });

  // Team mutations
  const createTeamMutation = useMutation({
    mutationFn: teamsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team created successfully');
      setTeamDialogOpen(false);
      setSelectedTeam(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create team');
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; color?: string; queueId?: string | null } }) =>
      teamsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team updated successfully');
      setTeamDialogOpen(false);
      setSelectedTeam(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update team');
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: teamsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team deleted');
      setDeleteTeamDialogOpen(false);
      setSelectedTeam(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete team');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: number }) =>
      teamsApi.addMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Member added to team');
      setAddMemberDialogOpen(false);
      setSelectedTeamForMember(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add member');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: number }) =>
      teamsApi.removeMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Member removed from team');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setDisplayName('');
    setEmail('');
    setPhone('');
    setDepartment('');
    setRole('viewer');
    setEnabled(true);
  };

  const handleCreateUser = () => {
    if (!username.trim()) {
      toast.error('Username is required');
      return;
    }
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    createUserMutation.mutate({
      username: username.trim(),
      password,
      role,
      displayName: displayName.trim() || undefined,
    });
  };

  const handleEditUser = (user: TeamMember) => {
    setSelectedUser(user);
    setUsername(user.username);
    setDisplayName(user.displayName || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setDepartment(user.department || '');
    setRole(user.role);
    setEnabled(user.enabled);
    setPassword('');
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    const updates: Partial<User & { password?: string; email?: string; phone?: string; department?: string }> = {
      displayName: displayName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      department: department.trim() || undefined,
      role,
      enabled,
    };
    if (password) {
      if (password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      updates.password = password;
    }
    updateUserMutation.mutate({ id: selectedUser.id, data: updates });
  };

  const handleDeleteUser = (user: TeamMember) => {
    setSelectedUser(user);
    setDeleteUserDialogOpen(true);
  };

  const handlePermissions = (user: TeamMember) => {
    setSelectedUser(user);
    setPermissionsDialogOpen(true);
  };

  const handlePermissionToggle = (permission: string, granted: boolean) => {
    if (!selectedUser) return;
    updatePermissionsMutation.mutate({
      id: selectedUser.id,
      permissions: [{ permission, granted }],
    });
  };

  // Team handlers
  const handleCreateTeam = () => {
    setSelectedTeam(null);
    setTeamDialogOpen(true);
  };

  const handleEditTeam = (team: Team) => {
    setSelectedTeam(team);
    setTeamDialogOpen(true);
  };

  const handleDeleteTeam = (team: Team) => {
    setSelectedTeam(team);
    setDeleteTeamDialogOpen(true);
  };

  const handleAddMember = (team: Team) => {
    setSelectedTeamForMember(team);
    setAddMemberDialogOpen(true);
  };

  const handleRemoveMember = (teamId: string, user: TeamMember) => {
    removeMemberMutation.mutate({ teamId, userId: user.id });
  };

  const handleTeamSave = async (data: { name: string; description: string; color: string; queueId: string | null }) => {
    if (selectedTeam) {
      await updateTeamMutation.mutateAsync({ id: selectedTeam.id, data });
    } else {
      await createTeamMutation.mutateAsync(data);
    }
  };

  // Convert TeamMember to UserCardUser
  const toUserCardUser = (member: TeamMember): UserCardUser => ({
    id: member.id,
    username: member.username,
    displayName: member.displayName,
    email: member.email,
    phone: member.phone,
    department: member.department,
    avatarUrl: member.avatarUrl,
    role: member.role,
    enabled: member.enabled,
    lastLoginAt: member.lastLoginAt,
  });

  // Convert TeamMember to TeamSectionMember
  const toTeamSectionMember = (member: TeamMember): TeamSectionMember => ({
    ...toUserCardUser(member),
    teamRole: member.teamRole,
  });

  const teams = teamsData?.teams || [];
  const stats = teamsData?.stats || { totalUsers: 0, totalTeams: 0, activeUsers: 0, adminCount: 0, supervisorCount: 0, viewerCount: 0 };
  const unassignedUsers = teamsData?.unassignedUsers || [];
  const queues = queuesData?.queues || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage users, teams, and permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" onClick={handleCreateTeam}>
            <UsersRound className="h-4 w-4 mr-2" />
            Create Team
          </Button>
          <Button onClick={() => setCreateUserDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats */}
          <UserStats
            totalUsers={stats.totalUsers}
            totalTeams={stats.totalTeams}
            activeUsers={stats.activeUsers}
            adminCount={stats.adminCount}
            supervisorCount={stats.supervisorCount}
            viewerCount={stats.viewerCount}
          />

          {/* Teams */}
          <div className="space-y-4">
            {teams.map((team) => (
              <TeamSection
                key={team.id}
                team={{
                  ...team,
                  members: team.members.map(toTeamSectionMember),
                }}
                defaultOpen={team.memberCount > 0}
                onEditTeam={() => handleEditTeam(team)}
                onDeleteTeam={() => handleDeleteTeam(team)}
                onAddMember={() => handleAddMember(team)}
                onEditUser={(user) => handleEditUser(user as TeamMember)}
                onEditPermissions={(user) => handlePermissions(user as TeamMember)}
                onDeleteUser={(user) => handleDeleteUser(user as TeamMember)}
                onRemoveMember={(user) => handleRemoveMember(team.id, user as TeamMember)}
              />
            ))}

            {/* Unassigned Users */}
            {unassignedUsers.length > 0 && (
              <Card className="overflow-hidden">
                <Collapsible open={unassignedOpen} onOpenChange={setUnassignedOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gray-500/10 text-gray-600">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">Unassigned Users</h3>
                              <Badge variant="secondary" className="text-xs">
                                {unassignedUsers.length} {unassignedUsers.length === 1 ? 'user' : 'users'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Users not assigned to any team
                            </p>
                          </div>
                        </div>
                        {unassignedOpen ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4">
                      <div className="space-y-2">
                        {unassignedUsers.map((user) => (
                          <UserCard
                            key={user.id}
                            user={toUserCardUser(user)}
                            onEditPermissions={() => handlePermissions(user)}
                            onEdit={() => handleEditUser(user)}
                            onDelete={() => handleDeleteUser(user)}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )}

            {/* No users at all */}
            {teams.length === 0 && unassignedUsers.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Users</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first user to get started
                  </p>
                  <Button onClick={() => setCreateUserDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Create User Dialog */}
      <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Add a new user to the system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+1-555-1234"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin - Full access</SelectItem>
                  <SelectItem value="supervisor">Supervisor - Manage campaigns</SelectItem>
                  <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details for {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Display Name</Label>
              <Input
                id="edit-displayName"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="john@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  placeholder="+1-555-1234"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                placeholder="Sales, Support, etc."
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password (leave empty to keep current)</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-enabled">Account Enabled</Label>
              <Switch
                id="edit-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Permissions</DialogTitle>
            <DialogDescription>
              Configure permissions for {selectedUser?.displayName || selectedUser?.username}
              {selectedUser?.role === 'admin' && (
                <span className="block mt-1 text-amber-500">
                  Admin users have all permissions by default
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {permissionsLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : permissionsData ? (
            <PermissionsMatrix
              permissions={permissionsData.permissions}
              disabled={selectedUser?.role === 'admin'}
              onToggle={handlePermissionToggle}
              isUpdating={updatePermissionsMutation.isPending}
            />
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Dialog */}
      <TeamDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        team={selectedTeam}
        queues={queues}
        onSave={handleTeamSave}
      />

      {/* Add Member Dialog */}
      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Member to {selectedTeamForMember?.name}</DialogTitle>
            <DialogDescription>
              Select a user to add to this team
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
            {unassignedUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No unassigned users available
              </p>
            ) : (
              unassignedUsers.map((user) => (
                <button
                  key={user.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  onClick={() => {
                    if (selectedTeamForMember) {
                      addMemberMutation.mutate({
                        teamId: selectedTeamForMember.id,
                        userId: user.id,
                      });
                    }
                  }}
                  disabled={addMemberMutation.isPending}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {(user.displayName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.displayName || user.username}</p>
                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {user.role}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirm Dialog */}
      <ConfirmDialog
        open={deleteUserDialogOpen}
        onOpenChange={setDeleteUserDialogOpen}
        title="Delete User"
        description={`Are you sure you want to delete "${selectedUser?.displayName || selectedUser?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
        loading={deleteUserMutation.isPending}
      />

      {/* Delete Team Confirm Dialog */}
      <ConfirmDialog
        open={deleteTeamDialogOpen}
        onOpenChange={setDeleteTeamDialogOpen}
        title="Delete Team"
        description={`Are you sure you want to delete "${selectedTeam?.name}"? Users will be moved to unassigned.`}
        confirmText="Delete Team"
        variant="destructive"
        onConfirm={() => selectedTeam && deleteTeamMutation.mutate(selectedTeam.id)}
        loading={deleteTeamMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Management Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Overview</h4>
              <p className="text-sm text-muted-foreground">
                Manage user accounts, organize them into teams, and configure granular permissions for accessing the admin panel.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Teams</h4>
              <p className="text-sm text-muted-foreground">
                Create teams to organize users. Teams can be linked to call queues for department-based routing.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">User Roles</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Admin:</strong> Full access to all features and settings</li>
                <li><strong>Supervisor:</strong> Can manage campaigns, calls, and most features</li>
                <li><strong>Viewer:</strong> Read-only access to dashboards and reports</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Permissions</h4>
              <p className="text-sm text-muted-foreground">
                Click the key icon on a user card to customize permissions. Admins have all permissions by default.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Permissions Matrix Component
function PermissionsMatrix({
  permissions,
  disabled,
  onToggle,
  isUpdating,
}: {
  permissions: { permission: string; granted: boolean; isOverride: boolean }[];
  disabled: boolean;
  onToggle: (permission: string, granted: boolean) => void;
  isUpdating: boolean;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['dashboard', 'calls', 'queues']));

  // Group permissions by category
  const grouped = permissions.reduce((acc, perm) => {
    const [category] = perm.permission.split('.');
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, typeof permissions>);

  const toggleGroup = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  const categoryLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    calls: 'Calls',
    recordings: 'Recordings',
    extensions: 'Extensions',
    trunks: 'Trunks',
    ivr: 'IVR',
    queues: 'Queues',
    campaigns: 'Campaigns',
    contacts: 'Contacts',
    prompts: 'Prompts',
    routing: 'Routing',
    ring_groups: 'Ring Groups',
    analytics: 'Analytics',
    settings: 'Settings',
    users: 'Users',
    system: 'System',
  };

  const actionLabels: Record<string, string> = {
    view: 'View',
    manage: 'Manage',
    delete: 'Delete',
    download: 'Download',
    spy: 'Spy/Listen',
    hangup: 'Hangup',
    test: 'Test',
    start_stop: 'Start/Stop',
    import: 'Import',
    export: 'Export',
  };

  return (
    <div className="space-y-2 py-4">
      {Object.entries(grouped).map(([category, perms]) => {
        const isExpanded = expandedGroups.has(category);
        const grantedCount = perms.filter(p => p.granted).length;

        return (
          <div key={category} className="border rounded-lg">
            <button
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              onClick={() => toggleGroup(category)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{categoryLabels[category] || category}</span>
                <Badge variant="secondary" className="text-xs">
                  {grantedCount}/{perms.length}
                </Badge>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-3 pt-1 space-y-2 border-t">
                {perms.map((perm) => {
                  const [, action] = perm.permission.split('.');
                  return (
                    <div
                      key={perm.permission}
                      className="flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {actionLabels[action] || action}
                        </span>
                        {perm.isOverride && (
                          <Badge variant="outline" className="text-xs">
                            Custom
                          </Badge>
                        )}
                      </div>
                      <Switch
                        checked={perm.granted}
                        disabled={disabled || isUpdating}
                        onCheckedChange={(checked) => onToggle(perm.permission, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
