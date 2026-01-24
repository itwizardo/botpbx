'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Megaphone,
  Phone,
  PhoneCall,
  PhoneOff,
  CheckCircle2,
  TrendingUp,
  Users,
  Bot,
} from 'lucide-react';
import type { Campaign } from '@/types/models';

interface CampaignStatsProps {
  campaigns: Campaign[];
}

export function CampaignStats({ campaigns }: CampaignStatsProps) {
  // Calculate aggregate stats
  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    paused: campaigns.filter(c => c.status === 'paused').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    totalContacts: campaigns.reduce((sum, c) => sum + c.totalContacts, 0),
    totalDialed: campaigns.reduce((sum, c) => sum + c.dialedCount, 0),
    totalAnswered: campaigns.reduce((sum, c) => sum + c.answeredCount, 0),
    totalPress1: campaigns.reduce((sum, c) => sum + c.press1Count, 0),
    totalConnected: campaigns.reduce((sum, c) => sum + c.connectedCount, 0),
    aiAgentCampaigns: campaigns.filter(c => c.handlerType === 'ai_agent').length,
  };

  const answerRate = stats.totalDialed > 0
    ? Math.round((stats.totalAnswered / stats.totalDialed) * 100)
    : 0;

  const conversionRate = stats.totalAnswered > 0
    ? Math.round((stats.totalPress1 / stats.totalAnswered) * 100)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
          <Megaphone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">
            {stats.running} running, {stats.paused} paused
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Dialed</CardTitle>
          <Phone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalDialed.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            of {stats.totalContacts.toLocaleString()} contacts
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Answer Rate</CardTitle>
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{answerRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.totalAnswered.toLocaleString()} answered
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{conversionRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.totalPress1.toLocaleString()} press-1 / {stats.totalConnected.toLocaleString()} connected
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
