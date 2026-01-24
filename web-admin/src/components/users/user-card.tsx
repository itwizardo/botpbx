'use client';

import { useState } from 'react';
import { ShieldCheck, Shield, Eye, MoreHorizontal, Key, Pencil, Trash2, UserMinus, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

export interface UserCardUser {
  id: number;
  username: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  avatarUrl?: string | null;
  role: 'admin' | 'supervisor' | 'viewer';
  enabled: boolean;
  lastLoginAt?: number | null;
}

interface UserCardProps {
  user: UserCardUser;
  inTeam?: boolean;
  onEditPermissions?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRemoveFromTeam?: () => void;
}

const roleConfig = {
  admin: { icon: ShieldCheck, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Admin' },
  supervisor: { icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Supervisor' },
  viewer: { icon: Eye, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Viewer' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export function UserCard({
  user,
  inTeam = false,
  onEditPermissions,
  onEdit,
  onDelete,
  onRemoveFromTeam,
}: UserCardProps) {
  const roleInfo = roleConfig[user.role];
  const RoleIcon = roleInfo.icon;
  const displayName = user.displayName || user.username;
  const initials = getInitials(displayName);

  const lastLogin = user.lastLoginAt
    ? formatDistanceToNow(new Date(user.lastLoginAt * 1000), { addSuffix: true })
    : 'Never';

  return (
    <div className="flex items-start gap-4 p-4 bg-card border rounded-lg hover:shadow-md transition-shadow">
      <Avatar className="h-12 w-12">
        <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
        <AvatarFallback className="bg-primary/10 text-primary font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold truncate">{displayName}</h3>
          <Badge variant="outline" className={`${roleInfo.bg} ${roleInfo.color} border-0`}>
            <RoleIcon className="h-3 w-3 mr-1" />
            {roleInfo.label}
          </Badge>
          {!user.enabled && (
            <Badge variant="secondary" className="bg-gray-200 text-gray-600">
              Disabled
            </Badge>
          )}
        </div>

        <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
          <p>@{user.username}</p>
          {user.email && (
            <p className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {user.email}
            </p>
          )}
          {user.phone && (
            <p className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {user.phone}
            </p>
          )}
          <p className="text-xs">Last login: {lastLogin}</p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEditPermissions && (
            <DropdownMenuItem onClick={onEditPermissions}>
              <Key className="h-4 w-4 mr-2" />
              Permissions
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          {inTeam && onRemoveFromTeam && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRemoveFromTeam} className="text-orange-600">
                <UserMinus className="h-4 w-4 mr-2" />
                Remove from Team
              </DropdownMenuItem>
            </>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete User
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
