'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { analyticsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

export default function AnalyticsPage() {
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily-calls', 7],
    queryFn: () => analyticsApi.daily(7),
  });

  const { data: dtmfData, isLoading: dtmfLoading } = useQuery({
    queryKey: ['dtmf-stats', 7],
    queryFn: () => analyticsApi.dtmf(7),
  });

  const { data: campaignData, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign-performance'],
    queryFn: analyticsApi.campaignPerformance,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Call statistics and performance metrics</p>
        </div>
        <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
          <HelpCircle className="h-4 w-4 mr-2" />
          Help
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Calls Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Calls (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData?.data || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="totalCalls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total" />
                    <Bar dataKey="answeredCalls" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Answered" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DTMF Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>DTMF Key Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {dtmfLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(dtmfData?.data || []) as any}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="key"
                      label={({ key, percent }: any) => `${key} (${((percent || 0) * 100).toFixed(0)}%)`}
                    >
                      {(dtmfData?.data || []).map((entry, index) => (
                        <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Campaign</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Contacts</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Dialed</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Answer Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Connect Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(campaignData?.data || []).map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{campaign.name}</td>
                      <td className="px-4 py-3 capitalize">{campaign.status}</td>
                      <td className="px-4 py-3 text-right">{campaign.totalContacts}</td>
                      <td className="px-4 py-3 text-right">{campaign.dialedCount}</td>
                      <td className="px-4 py-3 text-right">{campaign.answerRate}%</td>
                      <td className="px-4 py-3 text-right">{campaign.connectRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analytics Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Call Analytics</h4>
              <p className="text-sm text-muted-foreground">
                View call statistics and trends over time. Charts show daily call volumes, answer rates, and campaign performance.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Charts</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Calls (Last 7 Days):</strong> Daily total and answered calls</li>
                <li><strong>DTMF Responses:</strong> IVR keypress distribution</li>
                <li><strong>Campaign Performance:</strong> Success metrics by campaign</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Metrics Explained</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Answer Rate:</strong> Percentage of calls that were answered</li>
                <li><strong>Connect Rate:</strong> Calls where conversation occurred</li>
                <li><strong>DTMF:</strong> Keypad input choices made by callers</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
