'use client';

import { Users, UsersRound, UserCheck, ShieldCheck, Shield, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface UserStatsProps {
  totalUsers: number;
  totalTeams: number;
  activeUsers: number;
  adminCount: number;
  supervisorCount: number;
  viewerCount: number;
}

export function UserStats({
  totalUsers,
  totalTeams,
  activeUsers,
  adminCount,
  supervisorCount,
  viewerCount,
}: UserStatsProps) {
  const stats = [
    {
      label: 'Total Users',
      value: totalUsers,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Teams',
      value: totalTeams,
      icon: UsersRound,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Active (24h)',
      value: activeUsers,
      icon: UserCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Admins',
      value: adminCount,
      icon: ShieldCheck,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
