'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Plus, Edit, Trash2, TestTube, CheckCircle2, XCircle, Loader2, AlertCircle, Phone, HelpCircle } from 'lucide-react';
import { trunksApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrunkDialog } from '@/components/trunks/trunk-dialog';
import { TwilioWizard } from '@/components/trunks/twilio-wizard';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { Trunk } from '@/types/models';

import Link from 'next/link';
import Image from 'next/image';

interface TrunkTestResult {
  success: boolean;
  trunk: string;
  dnsOk: boolean;
  portOk: boolean;
  sipOptionsOk: boolean;
  latencyMs: number;
  error?: string;
  details: {
    resolvedIp?: string;
    portCheckMs?: number;
    sipResponseCode?: number;
    sipResponseText?: string;
  };
}

export default function TrunksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTrunk, setSelectedTrunk] = useState<Omit<Trunk, 'password'> | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trunkToDelete, setTrunkToDelete] = useState<Omit<Trunk, 'password'> | null>(null);
  const [testResultDialogOpen, setTestResultDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<TrunkTestResult | null>(null);
  const [testingTrunkId, setTestingTrunkId] = useState<string | null>(null);
  const [testCallDialogOpen, setTestCallDialogOpen] = useState(false);
  const [testCallTrunk, setTestCallTrunk] = useState<Omit<Trunk, 'password'> | null>(null);
  const [testCallDestination, setTestCallDestination] = useState('');
  const [testCallCallerId, setTestCallCallerId] = useState('');
  const [twilioWizardOpen, setTwilioWizardOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['trunks'],
    queryFn: trunksApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trunksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trunks'] });
      toast.success('Trunk deleted successfully');
      setDeleteDialogOpen(false);
      setTrunkToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete trunk');
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => trunksApi.test(id),
    onSuccess: (data: TrunkTestResult) => {
      setTestResult(data);
      setTestResultDialogOpen(true);
      setTestingTrunkId(null);
      if (data.success) {
        toast.success('Trunk connection successful');
      } else {
        toast.error(data.error || 'Trunk connection failed');
      }
    },
    onError: (error: Error) => {
      setTestingTrunkId(null);
      toast.error(error.message || 'Failed to test trunk');
    },
  });

  const testCallMutation = useMutation({
    mutationFn: ({ id, destination, callerId }: { id: string; destination: string; callerId?: string }) =>
      trunksApi.testCall(id, destination, callerId),
    onSuccess: (data) => {
      setTestCallDialogOpen(false);
      setTestCallDestination('');
      setTestCallCallerId('');
      setTestCallTrunk(null);
      toast.success(data.message || 'Test call initiated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate test call');
    },
  });

  const handleCreate = () => {
    setSelectedTrunk(null);
    setDialogOpen(true);
  };

  const handleEdit = (trunk: Omit<Trunk, 'password'>) => {
    setSelectedTrunk(trunk);
    setDialogOpen(true);
  };

  const handleDeleteClick = (trunk: Omit<Trunk, 'password'>) => {
    setTrunkToDelete(trunk);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (trunkToDelete) {
      deleteMutation.mutate(trunkToDelete.id);
    }
  };

  const handleTest = (trunk: Omit<Trunk, 'password'>) => {
    setTestingTrunkId(trunk.id);
    testMutation.mutate(trunk.id);
  };

  const handleTestCall = (trunk: Omit<Trunk, 'password'>) => {
    setTestCallTrunk(trunk);
    setTestCallDestination('');
    setTestCallCallerId('');
    setTestCallDialogOpen(true);
  };

  const handleTestCallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testCallTrunk || !testCallDestination) return;
    testCallMutation.mutate({
      id: testCallTrunk.id,
      destination: testCallDestination,
      callerId: testCallCallerId || undefined,
    });
  };

  const TestCheckRow = ({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) => (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-sm text-muted-foreground">{detail || (ok ? 'Passed' : 'Failed')}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SIP Trunks</h1>
          <p className="text-muted-foreground">Configure VoIP provider connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" onClick={() => setTwilioWizardOpen(true)} className="relative">
            <Image
              src="/twilio-logo.png"
              alt="Twilio"
              width={16}
              height={16}
              className="mr-2 object-contain"
            />
            Connect Twilio
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Trunk
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Trunks</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : data?.trunks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No trunks configured</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first trunk
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Host</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.trunks.map((trunk) => (
                    <tr key={trunk.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Plug className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{trunk.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{trunk.host}:{trunk.port}</td>
                      <td className="px-4 py-3 text-muted-foreground">{trunk.username}</td>
                      <td className="px-4 py-3">
                        <Badge variant={trunk.enabled ? 'success' : 'secondary'}>
                          {trunk.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTest(trunk)}
                            disabled={testMutation.isPending}
                            title="Test Connection"
                          >
                            {testingTrunkId === trunk.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <TestTube className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTestCall(trunk)}
                            title="Test Call"
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(trunk)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDeleteClick(trunk)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TrunkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trunk={selectedTrunk}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Trunk"
        description={`Are you sure you want to delete trunk "${trunkToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Test Result Dialog */}
      <Dialog open={testResultDialogOpen} onOpenChange={setTestResultDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testResult?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              Trunk Test Results
            </DialogTitle>
            <DialogDescription>
              Test results for trunk: {testResult?.trunk}
            </DialogDescription>
          </DialogHeader>

          {testResult && (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total latency: {testResult.latencyMs}ms
                    </p>
                  </div>
                </div>
              </div>

              {/* Individual Checks */}
              <div className="bg-muted/50 rounded-lg p-4">
                <TestCheckRow
                  label="DNS Resolution"
                  ok={testResult.dnsOk}
                  detail={testResult.details.resolvedIp || undefined}
                />
                <TestCheckRow
                  label="Port Connectivity"
                  ok={testResult.portOk}
                  detail={testResult.details.portCheckMs ? `${testResult.details.portCheckMs}ms` : undefined}
                />
                <TestCheckRow
                  label="SIP OPTIONS Response"
                  ok={testResult.sipOptionsOk}
                  detail={
                    testResult.details.sipResponseCode
                      ? `${testResult.details.sipResponseCode} ${testResult.details.sipResponseText}`
                      : testResult.details.sipResponseText
                  }
                />
              </div>

              {/* Error Message */}
              {testResult.error && (
                <div className="p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-sm">
                  {testResult.error}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Call Dialog */}
      <Dialog open={testCallDialogOpen} onOpenChange={setTestCallDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Test Call via {testCallTrunk?.name}
            </DialogTitle>
            <DialogDescription>
              Make a test call through this trunk to verify outbound calling works.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTestCallSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="destination">Destination Number *</Label>
              <Input
                id="destination"
                value={testCallDestination}
                onChange={(e) => setTestCallDestination(e.target.value)}
                placeholder="e.g., 15551234567"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the phone number to call (without formatting)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="callerId">Caller ID (optional)</Label>
              <Input
                id="callerId"
                value={testCallCallerId}
                onChange={(e) => setTestCallCallerId(e.target.value)}
                placeholder="Leave empty to use trunk default"
                className="font-mono"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTestCallDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={testCallMutation.isPending || !testCallDestination}>
                {testCallMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calling...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Make Test Call
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Twilio Wizard */}
      <TwilioWizard
        open={twilioWizardOpen}
        onOpenChange={setTwilioWizardOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['trunks'] })}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SIP Trunks Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What is a SIP Trunk?</h4>
              <p className="text-sm text-muted-foreground">
                A SIP trunk connects your PBX to a VoIP provider, enabling you to make and receive calls over the internet.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Configuration Fields</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Host:</strong> Your provider's SIP server address</li>
                <li><strong>Port:</strong> Usually 5060 (UDP) or 5061 (TLS)</li>
                <li><strong>Username/Password:</strong> Credentials from your provider</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Testing Your Trunk</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Test Connection:</strong> Checks DNS, port, and SIP response</li>
                <li><strong>Test Call:</strong> Places a real call to verify audio</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Twilio Integration</h4>
              <p className="text-sm text-muted-foreground">
                Use "Connect Twilio" for quick setup with your Twilio account. It automatically configures the trunk and imports your phone numbers.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
