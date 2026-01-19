'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Route,
  Plus,
  Edit,
  Trash2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  GitBranch,
  Users,
  UsersRound,
  ListOrdered,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  Search,
  HelpCircle,
} from 'lucide-react';
import { ivrApi, extensionsApi, ringGroupsApi, queuesApi, outboundRoutesApi, trunksApi, OutboundRoute } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';
import type { RoutingRule, IVRMenu, Extension } from '@/types/models';
import type { RingGroup } from '@/lib/api';

const targetTypeLabels: Record<string, string> = {
  ivr_menu: 'IVR Menu',
  extension: 'Extension',
  ring_group: 'Ring Group',
  call_queue: 'Call Queue',
};

const targetTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  ivr_menu: GitBranch,
  extension: Users,
  ring_group: UsersRound,
  call_queue: ListOrdered,
};

const patternExamples = [
  { pattern: '_1NXXNXXXXXX', description: 'US 11-digit' },
  { pattern: '_NXXNXXXXXX', description: 'US 10-digit' },
  { pattern: '_011.', description: 'International (011)' },
  { pattern: '_X.', description: 'Any number' },
];

export default function RoutesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'inbound' | 'outbound'>('inbound');

  // Inbound state
  const [inboundDialogOpen, setInboundDialogOpen] = useState(false);
  const [selectedInboundRule, setSelectedInboundRule] = useState<RoutingRule | null>(null);
  const [deleteInboundDialogOpen, setDeleteInboundDialogOpen] = useState(false);
  const [inboundRuleToDelete, setInboundRuleToDelete] = useState<RoutingRule | null>(null);
  const [inboundFormDid, setInboundFormDid] = useState('');
  const [inboundFormTargetType, setInboundFormTargetType] = useState<string>('ivr_menu');
  const [inboundFormTargetId, setInboundFormTargetId] = useState('');
  const [inboundFormEnabled, setInboundFormEnabled] = useState(true);

  // Outbound state
  const [outboundDialogOpen, setOutboundDialogOpen] = useState(false);
  const [selectedOutboundRoute, setSelectedOutboundRoute] = useState<OutboundRoute | null>(null);
  const [deleteOutboundDialogOpen, setDeleteOutboundDialogOpen] = useState(false);
  const [outboundRouteToDelete, setOutboundRouteToDelete] = useState<OutboundRoute | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [outboundFormName, setOutboundFormName] = useState('');
  const [outboundFormPattern, setOutboundFormPattern] = useState('');
  const [outboundFormTrunkId, setOutboundFormTrunkId] = useState('');
  const [outboundFormPrefixToAdd, setOutboundFormPrefixToAdd] = useState('');
  const [outboundFormPrefixToStrip, setOutboundFormPrefixToStrip] = useState('0');
  const [outboundFormCallerId, setOutboundFormCallerId] = useState('');
  const [outboundFormEnabled, setOutboundFormEnabled] = useState(true);

  // Queries
  const { data: inboundData, isLoading: inboundLoading } = useQuery({ queryKey: ['routing-rules'], queryFn: ivrApi.listRouting });
  const { data: menusData } = useQuery({ queryKey: ['ivr-menus'], queryFn: ivrApi.listMenus });
  const { data: extensionsData } = useQuery({ queryKey: ['extensions'], queryFn: extensionsApi.list });
  const { data: ringGroupsData } = useQuery({ queryKey: ['ring-groups'], queryFn: ringGroupsApi.list });
  const { data: queuesData } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.list });
  const { data: outboundData, isLoading: outboundLoading } = useQuery({ queryKey: ['outbound-routes'], queryFn: outboundRoutesApi.list });
  const { data: trunksData } = useQuery({ queryKey: ['trunks'], queryFn: trunksApi.list });

  // Inbound mutations
  const createInboundMutation = useMutation({
    mutationFn: ivrApi.createRouting,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routing-rules'] }); toast.success('Route created'); handleCloseInboundDialog(); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const updateInboundMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RoutingRule> }) => ivrApi.updateRouting(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routing-rules'] }); toast.success('Route updated'); handleCloseInboundDialog(); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const deleteInboundMutation = useMutation({
    mutationFn: (id: string) => ivrApi.deleteRouting(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routing-rules'] }); toast.success('Route deleted'); setDeleteInboundDialogOpen(false); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const toggleInboundMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => ivrApi.updateRouting(id, { enabled }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routing-rules'] }); },
  });

  // Outbound mutations
  const createOutboundMutation = useMutation({
    mutationFn: outboundRoutesApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['outbound-routes'] }); toast.success('Route created'); handleCloseOutboundDialog(); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const updateOutboundMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof outboundRoutesApi.update>[1] }) => outboundRoutesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['outbound-routes'] }); toast.success('Route updated'); handleCloseOutboundDialog(); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const deleteOutboundMutation = useMutation({
    mutationFn: (id: string) => outboundRoutesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['outbound-routes'] }); toast.success('Route deleted'); setDeleteOutboundDialogOpen(false); },
    onError: (error: Error) => { toast.error(error.message); },
  });
  const toggleOutboundMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => outboundRoutesApi.update(id, { enabled }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['outbound-routes'] }); },
  });
  const testMatchMutation = useMutation({ mutationFn: (number: string) => outboundRoutesApi.testMatch(number) });

  // Handlers
  const handleCreateInbound = () => { setSelectedInboundRule(null); setInboundFormDid(''); setInboundFormTargetType('ivr_menu'); setInboundFormTargetId(''); setInboundFormEnabled(true); setInboundDialogOpen(true); };
  const handleEditInbound = (rule: RoutingRule) => { setSelectedInboundRule(rule); setInboundFormDid(rule.did); setInboundFormTargetType(rule.targetType); setInboundFormTargetId(rule.targetId); setInboundFormEnabled(rule.enabled); setInboundDialogOpen(true); };
  const handleCloseInboundDialog = () => { setInboundDialogOpen(false); setSelectedInboundRule(null); };
  const handleSubmitInbound = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { did: inboundFormDid, targetType: inboundFormTargetType as RoutingRule['targetType'], targetId: inboundFormTargetId, enabled: inboundFormEnabled };
    if (selectedInboundRule) { updateInboundMutation.mutate({ id: selectedInboundRule.id, data }); } else { createInboundMutation.mutate(data); }
  };

  const handleCreateOutbound = () => { setSelectedOutboundRoute(null); setOutboundFormName(''); setOutboundFormPattern(''); setOutboundFormTrunkId(''); setOutboundFormPrefixToAdd(''); setOutboundFormPrefixToStrip('0'); setOutboundFormCallerId(''); setOutboundFormEnabled(true); setOutboundDialogOpen(true); };
  const handleEditOutbound = (route: OutboundRoute) => { setSelectedOutboundRoute(route); setOutboundFormName(route.name); setOutboundFormPattern(route.pattern); setOutboundFormTrunkId(route.trunkId); setOutboundFormPrefixToAdd(route.prefixToAdd || ''); setOutboundFormPrefixToStrip(String(route.prefixToStrip)); setOutboundFormCallerId(route.callerId || ''); setOutboundFormEnabled(route.enabled); setOutboundDialogOpen(true); };
  const handleCloseOutboundDialog = () => { setOutboundDialogOpen(false); setSelectedOutboundRoute(null); };
  const handleSubmitOutbound = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name: outboundFormName, pattern: outboundFormPattern, trunkId: outboundFormTrunkId, prefixToAdd: outboundFormPrefixToAdd || undefined, prefixToStrip: parseInt(outboundFormPrefixToStrip) || 0, callerId: outboundFormCallerId || undefined, enabled: outboundFormEnabled };
    if (selectedOutboundRoute) { updateOutboundMutation.mutate({ id: selectedOutboundRoute.id, data }); } else { createOutboundMutation.mutate(data); }
  };

  const getTargetOptions = () => {
    switch (inboundFormTargetType) {
      case 'ivr_menu': return menusData?.menus || [];
      case 'extension': return extensionsData?.extensions || [];
      case 'ring_group': return ringGroupsData?.ringGroups || [];
      case 'call_queue': return queuesData?.queues || [];
      default: return [];
    }
  };

  const getTargetLabel = (rule: RoutingRule): string => {
    switch (rule.targetType) {
      case 'ivr_menu': return menusData?.menus.find((m: IVRMenu) => m.id === rule.targetId)?.name || rule.targetId;
      case 'extension': const ext = extensionsData?.extensions.find((e: Extension) => e.id === rule.targetId || e.number === rule.targetId); return ext ? `${ext.number} - ${ext.name}` : rule.targetId;
      case 'ring_group': return ringGroupsData?.ringGroups.find((g: RingGroup) => g.id === rule.targetId)?.name || rule.targetId;
      case 'call_queue': return queuesData?.queues.find((q: any) => q.id === rule.targetId)?.name || rule.targetId;
      default: return rule.targetId;
    }
  };

  const inboundRules = inboundData?.rules || [];
  const outboundRoutes = outboundData?.routes || [];
  const trunks = trunksData?.trunks || [];
  const targetOptions = getTargetOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Routes</h1>
          <p className="text-muted-foreground">Manage inbound and outbound call routing</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab('inbound')} className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'inbound' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <PhoneIncoming className="h-4 w-4" />
          Inbound Routes ({inboundRules.length})
        </button>
        <button onClick={() => setActiveTab('outbound')} className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'outbound' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <PhoneOutgoing className="h-4 w-4" />
          Outbound Routes ({outboundRoutes.length})
        </button>
      </div>

      {/* Inbound Tab */}
      {activeTab === 'inbound' && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={handleCreateInbound}><Plus className="h-4 w-4 mr-2" />New Inbound Route</Button></div>
          {inboundLoading ? <Skeleton className="h-40 w-full" /> : inboundRules.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><PhoneIncoming className="h-12 w-12 mx-auto mb-4 opacity-50" /><p className="font-medium">No inbound routes</p><Button className="mt-4" onClick={handleCreateInbound}><Plus className="h-4 w-4 mr-2" />Create first route</Button></CardContent></Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Inbound Routing Rules</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead><tr className="border-b"><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">DID</th><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Type</th><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Destination</th><th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th><th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th></tr></thead>
                  <tbody className="divide-y">
                    {inboundRules.map((rule: RoutingRule) => {
                      const TargetIcon = targetTypeIcons[rule.targetType] || Phone;
                      return (
                        <tr key={rule.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="font-mono font-medium">{rule.did}</span></div></td>
                          <td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded-md bg-background"><TargetIcon className="h-3 w-3" />{targetTypeLabels[rule.targetType]}</span></td>
                          <td className="px-4 py-3 text-sm">{getTargetLabel(rule)}</td>
                          <td className="px-4 py-3 text-center"><Button variant="ghost" size="sm" onClick={() => toggleInboundMutation.mutate({ id: rule.id, enabled: !rule.enabled })}>{rule.enabled ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}</Button></td>
                          <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => handleEditInbound(rule)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setInboundRuleToDelete(rule); setDeleteInboundDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Outbound Tab */}
      {activeTab === 'outbound' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTestDialogOpen(true)}><Search className="h-4 w-4 mr-2" />Test</Button>
            <Button variant="outline" onClick={() => setHelpDialogOpen(true)}><HelpCircle className="h-4 w-4 mr-2" />Help</Button>
            <Button onClick={handleCreateOutbound}><Plus className="h-4 w-4 mr-2" />New Outbound Route</Button>
          </div>
          {outboundLoading ? <Skeleton className="h-40 w-full" /> : outboundRoutes.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><PhoneOutgoing className="h-12 w-12 mx-auto mb-4 opacity-50" /><p className="font-medium">No outbound routes</p><Button className="mt-4" onClick={handleCreateOutbound}><Plus className="h-4 w-4 mr-2" />Create first route</Button></CardContent></Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Outbound Routes</CardTitle><CardDescription>First match wins</CardDescription></CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead><tr className="border-b"><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Pattern</th><th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Trunk</th><th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th><th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th></tr></thead>
                  <tbody className="divide-y">
                    {outboundRoutes.map((route) => (
                      <tr key={route.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">{route.name}</td>
                        <td className="px-4 py-3"><code className="px-2 py-1 bg-muted rounded text-sm font-mono">{route.pattern}</code></td>
                        <td className="px-4 py-3 text-sm">{route.trunkName || route.trunkId}</td>
                        <td className="px-4 py-3 text-center"><Button variant="ghost" size="sm" onClick={() => toggleOutboundMutation.mutate({ id: route.id, enabled: !route.enabled })}>{route.enabled ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}</Button></td>
                        <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => handleEditOutbound(route)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setOutboundRouteToDelete(route); setDeleteOutboundDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Inbound Dialog */}
      <Dialog open={inboundDialogOpen} onOpenChange={setInboundDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{selectedInboundRule ? 'Edit' : 'New'} Inbound Route</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitInbound} className="space-y-4">
            <div className="space-y-2"><Label>DID *</Label><Input value={inboundFormDid} onChange={(e) => setInboundFormDid(e.target.value)} placeholder="+1234567890 or _." required /><p className="text-xs text-muted-foreground">Use _. for catch-all</p></div>
            <div className="space-y-2"><Label>Target Type *</Label><select value={inboundFormTargetType} onChange={(e) => { setInboundFormTargetType(e.target.value); setInboundFormTargetId(''); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="ivr_menu">IVR Menu</option><option value="extension">Extension</option><option value="ring_group">Ring Group</option><option value="call_queue">Call Queue</option></select></div>
            <div className="space-y-2"><Label>Destination *</Label><select value={inboundFormTargetId} onChange={(e) => setInboundFormTargetId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select</option>{targetOptions.map((o: any) => <option key={o.id || o.number} value={o.id || o.number}>{inboundFormTargetType === 'extension' ? `${o.number} - ${o.name}` : o.name}</option>)}</select></div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={inboundFormEnabled} onChange={(e) => setInboundFormEnabled(e.target.checked)} className="h-4 w-4" /><Label className="font-normal">Enabled</Label></div>
            <DialogFooter><Button type="button" variant="outline" onClick={handleCloseInboundDialog}>Cancel</Button><Button type="submit" disabled={!inboundFormTargetId}>{selectedInboundRule ? 'Save' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Outbound Dialog */}
      <Dialog open={outboundDialogOpen} onOpenChange={setOutboundDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{selectedOutboundRoute ? 'Edit' : 'New'} Outbound Route</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitOutbound} className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={outboundFormName} onChange={(e) => setOutboundFormName(e.target.value)} placeholder="US Domestic" required /></div>
            <div className="space-y-2"><Label>Pattern *</Label><Input value={outboundFormPattern} onChange={(e) => setOutboundFormPattern(e.target.value)} placeholder="_1NXXNXXXXXX" className="font-mono" required /><p className="text-xs text-muted-foreground">X=0-9, N=2-9, .=1+ chars</p></div>
            <div className="space-y-2"><Label>Trunk *</Label><Select value={outboundFormTrunkId} onValueChange={setOutboundFormTrunkId}><SelectTrigger><SelectValue placeholder="Select trunk" /></SelectTrigger><SelectContent>{trunks.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Strip Digits</Label><Input type="number" min="0" value={outboundFormPrefixToStrip} onChange={(e) => setOutboundFormPrefixToStrip(e.target.value)} /></div><div className="space-y-2"><Label>Prepend</Label><Input value={outboundFormPrefixToAdd} onChange={(e) => setOutboundFormPrefixToAdd(e.target.value)} className="font-mono" /></div></div>
            <div className="space-y-2"><Label>Caller ID Override</Label><Input value={outboundFormCallerId} onChange={(e) => setOutboundFormCallerId(e.target.value)} className="font-mono" /></div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={outboundFormEnabled} onChange={(e) => setOutboundFormEnabled(e.target.checked)} className="h-4 w-4" /><Label className="font-normal">Enabled</Label></div>
            <DialogFooter><Button type="button" variant="outline" onClick={handleCloseOutboundDialog}>Cancel</Button><Button type="submit" disabled={!outboundFormTrunkId}>{selectedOutboundRoute ? 'Save' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pattern Help */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Pattern Syntax</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><h4 className="font-medium mb-2">Characters</h4><ul className="text-sm space-y-1 text-muted-foreground"><li><code className="bg-muted px-1 rounded">X</code> = 0-9</li><li><code className="bg-muted px-1 rounded">N</code> = 2-9</li><li><code className="bg-muted px-1 rounded">.</code> = 1+ chars</li></ul></div>
            <div><h4 className="font-medium mb-2">Examples</h4>{patternExamples.map((ex) => <div key={ex.pattern} className="flex justify-between text-sm"><code className="bg-muted px-2 py-1 rounded">{ex.pattern}</code><span className="text-muted-foreground">{ex.description}</span></div>)}</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Test Number</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2"><Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="15551234567" className="font-mono" /><Button onClick={() => testMatchMutation.mutate(testNumber)} disabled={!testNumber}>Test</Button></div>
            {testMatchMutation.data && (
              <div className={`p-4 rounded-lg border ${testMatchMutation.data.matched ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                {testMatchMutation.data.matched ? <><p className="font-medium text-green-700">Match: {testMatchMutation.data.route?.name}</p><p className="text-sm">Pattern: {testMatchMutation.data.route?.pattern}</p></> : <p className="text-yellow-700">No match</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={deleteInboundDialogOpen} onOpenChange={setDeleteInboundDialogOpen} title="Delete Route" description={`Delete route for "${inboundRuleToDelete?.did}"?`} confirmText="Delete" variant="destructive" onConfirm={() => inboundRuleToDelete && deleteInboundMutation.mutate(inboundRuleToDelete.id)} loading={deleteInboundMutation.isPending} />
      <ConfirmDialog open={deleteOutboundDialogOpen} onOpenChange={setDeleteOutboundDialogOpen} title="Delete Route" description={`Delete "${outboundRouteToDelete?.name}"?`} confirmText="Delete" variant="destructive" onConfirm={() => outboundRouteToDelete && deleteOutboundMutation.mutate(outboundRouteToDelete.id)} loading={deleteOutboundMutation.isPending} />
    </div>
  );
}
