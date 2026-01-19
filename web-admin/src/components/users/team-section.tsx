'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Users, Phone, Plus, MoreHorizontal, Pencil, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserCard, UserCardUser } from './user-card';

export interface TeamMember extends UserCardUser {
  teamRole?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  queueId?: string | null;
  queueName?: string | null;
  memberCount: number;
  members: TeamMember[];
}

interface TeamSectionProps {
  team: Team;
  defaultOpen?: boolean;
  onEditTeam?: () => void;
  onDeleteTeam?: () => void;
  onAddMember?: () => void;
  onEditUser?: (user: TeamMember) => void;
  onEditPermissions?: (user: TeamMember) => void;
  onDeleteUser?: (user: TeamMember) => void;
  onRemoveMember?: (user: TeamMember) => void;
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600 border-blue-200',
  green: 'bg-green-500/10 text-green-600 border-green-200',
  purple: 'bg-purple-500/10 text-purple-600 border-purple-200',
  orange: 'bg-orange-500/10 text-orange-600 border-orange-200',
  red: 'bg-red-500/10 text-red-600 border-red-200',
  yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
  pink: 'bg-pink-500/10 text-pink-600 border-pink-200',
  cyan: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
};

export function TeamSection({
  team,
  defaultOpen = false,
  onEditTeam,
  onDeleteTeam,
  onAddMember,
  onEditUser,
  onEditPermissions,
  onDeleteUser,
  onRemoveMember,
}: TeamSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const colorClass = colorMap[team.color] || colorMap.blue;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{team.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                    </Badge>
                  </div>
                  {team.queueName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />
                      Linked to: {team.queueName}
                    </p>
                  )}
                  {team.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{team.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onAddMember && (
                      <DropdownMenuItem onClick={onAddMember}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Member
                      </DropdownMenuItem>
                    )}
                    {onEditTeam && (
                      <DropdownMenuItem onClick={onEditTeam}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Team
                      </DropdownMenuItem>
                    )}
                    {onDeleteTeam && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDeleteTeam} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Team
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {team.members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No members in this team</p>
                {onAddMember && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={onAddMember}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {team.members.map((member) => (
                  <UserCard
                    key={member.id}
                    user={member}
                    inTeam
                    onEditPermissions={onEditPermissions ? () => onEditPermissions(member) : undefined}
                    onEdit={onEditUser ? () => onEditUser(member) : undefined}
                    onDelete={onDeleteUser ? () => onDeleteUser(member) : undefined}
                    onRemoveFromTeam={onRemoveMember ? () => onRemoveMember(member) : undefined}
                  />
                ))}
                {onAddMember && (
                  <Button variant="ghost" size="sm" className="w-full mt-2" onClick={onAddMember}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
