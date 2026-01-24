'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Edit, Trash2, Phone, Loader2, HelpCircle } from 'lucide-react';
import { ivrApi, extensionsApi, trunksApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { IVRMenuDialog } from '@/components/ivr/ivr-menu-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { IVRMenu } from '@/types/models';

export default function IVRPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<IVRMenu | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState<IVRMenu | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testMenu, setTestMenu] = useState<IVRMenu | null>(null);
  const [testExtension, setTestExtension] = useState('');
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testTrunkId, setTestTrunkId] = useState('');
  const [testMode, setTestMode] = useState<'extension' | 'phone'>('extension');
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ivr-menus'],
    queryFn: ivrApi.listMenus,
  });

  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  // Fetch trunks for phone number test calls
  const { data: trunksData } = useQuery({
    queryKey: ['trunks'],
    queryFn: trunksApi.list,
  });
  const enabledTrunks = trunksData?.trunks?.filter((t: { enabled: boolean }) => t.enabled) || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ivrApi.deleteMenu(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ivr-menus'] });
      toast.success('IVR menu deleted successfully');
      setDeleteDialogOpen(false);
      setMenuToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete menu');
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ menuId, options }: {
      menuId: string;
      options?: { extension?: string; phoneNumber?: string; trunkId?: string };
    }) => ivrApi.testMenu(menuId, options),
    onSuccess: (data) => {
      setTestDialogOpen(false);
      setTestExtension('');
      setTestPhoneNumber('');
      setTestTrunkId('');
      setTestMenu(null);
      toast.success(data.message || 'Test call initiated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate test call');
    },
  });

  const handleCreate = () => {
    setSelectedMenu(null);
    setDialogOpen(true);
  };

  const handleEdit = (menu: IVRMenu) => {
    setSelectedMenu(menu);
    setDialogOpen(true);
  };

  const handleDeleteClick = (menu: IVRMenu) => {
    setMenuToDelete(menu);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (menuToDelete) {
      deleteMutation.mutate(menuToDelete.id);
    }
  };

  const handleTest = (menu: IVRMenu) => {
    setTestMenu(menu);
    setTestExtension('');
    setTestPhoneNumber('');
    setTestTrunkId('');
    setTestMode('extension');
    setTestDialogOpen(true);
  };

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMenu) return;

    if (testMode === 'phone') {
      if (!testPhoneNumber) {
        toast.error('Please enter a phone number');
        return;
      }
      testMutation.mutate({
        menuId: testMenu.id,
        options: {
          phoneNumber: testPhoneNumber,
          // __auto__ means use first available trunk (don't pass trunkId)
          trunkId: testTrunkId && testTrunkId !== '__auto__' ? testTrunkId : undefined,
        },
      });
    } else {
      if (!testExtension) {
        toast.error('Please select an extension');
        return;
      }
      testMutation.mutate({
        menuId: testMenu.id,
        options: { extension: testExtension },
      });
    }
  };

  const extensions = extensionsData?.extensions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IVR Menus</h1>
          <p className="text-muted-foreground">Configure interactive voice response menus</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Menu
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : data?.menus.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No IVR menus configured</p>
          <Button className="mt-4" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create your first menu
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.menus.map((menu) => (
            <Card key={menu.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{menu.name}</CardTitle>
                  <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                    {menu.options?.length || 0} options
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  Timeout: {menu.timeoutSeconds}s &bull; Max retries: {menu.maxRetries}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEdit(menu)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleTest(menu)}
                    title="Test IVR"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDeleteClick(menu)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <IVRMenuDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        menu={selectedMenu}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete IVR Menu"
        description={`Are you sure you want to delete menu "${menuToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Test IVR Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Test IVR: {testMenu?.name}
            </DialogTitle>
            <DialogDescription>
              Make a test call to experience this IVR menu.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTestSubmit} className="space-y-4">
            <Tabs value={testMode} onValueChange={(v) => setTestMode(v as 'extension' | 'phone')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="extension">Internal Extension</TabsTrigger>
                <TabsTrigger value="phone">External Phone</TabsTrigger>
              </TabsList>

              <TabsContent value="extension" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extension">Extension to Call</Label>
                  <Select value={testExtension} onValueChange={setTestExtension}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an extension" />
                    </SelectTrigger>
                    <SelectContent>
                      {extensions.map((ext: any) => (
                        <SelectItem key={ext.number} value={ext.number}>
                          {ext.number} - {ext.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This extension will receive a call and be connected to the IVR
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="phone" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    placeholder="+31612345678"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter full phone number with country code
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trunk">SIP Trunk</Label>
                  <Select value={testTrunkId} onValueChange={setTestTrunkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (first available)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto (first available)</SelectItem>
                      {enabledTrunks.map((trunk: { id: string; name: string }) => (
                        <SelectItem key={trunk.id} value={trunk.id}>
                          {trunk.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select which trunk to use for the outgoing call
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {testMenu && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <div className="font-medium mb-1">IVR Options:</div>
                {testMenu.options && testMenu.options.length > 0 ? (
                  <ul className="list-disc list-inside text-muted-foreground">
                    {testMenu.options.slice(0, 5).map((opt: any) => (
                      <li key={opt.id}>
                        Press {opt.keyPress} → {opt.actionType}
                      </li>
                    ))}
                    {testMenu.options.length > 5 && (
                      <li>...and {testMenu.options.length - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No options configured</p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTestDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={testMutation.isPending || (testMode === 'extension' ? !testExtension : !testPhoneNumber)}
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calling...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Start Test Call
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>IVR Menu Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What is an IVR?</h4>
              <p className="text-sm text-muted-foreground">
                IVR (Interactive Voice Response) allows callers to interact with your phone system using keypad inputs. When a call comes in, the IVR plays a greeting and offers options like "Press 1 for Sales, Press 2 for Support."
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Creating an IVR Menu</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Name:</strong> A descriptive name for the menu</li>
                <li><strong>Greeting:</strong> The audio prompt played to callers</li>
                <li><strong>Options:</strong> Key press mappings (0-9, *, #)</li>
                <li><strong>Timeout:</strong> Seconds to wait for input</li>
                <li><strong>Max Retries:</strong> Attempts before fallback action</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Action Types</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Extension:</strong> Transfer to a specific extension</li>
                <li><strong>Queue:</strong> Send caller to a call queue</li>
                <li><strong>Ring Group:</strong> Ring a group of extensions</li>
                <li><strong>IVR Menu:</strong> Go to another IVR menu</li>
                <li><strong>Voicemail:</strong> Send to voicemail box</li>
                <li><strong>Hangup:</strong> End the call</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Testing</h4>
              <p className="text-sm text-muted-foreground">
                Use the phone icon on each IVR card to test. Select an extension to receive a test call that connects to the IVR menu.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
