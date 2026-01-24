'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { extensionsApi, SipDetails } from '@/lib/api';
import { toast } from 'sonner';
import { Copy, Check, Server, User, Key, Plug, PhoneForwarded, BellOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Extension } from '@/types/models';

const createSchema = z.object({
  number: z.string().min(1, 'Extension number is required').regex(/^\d+$/, 'Must be numeric'),
  name: z.string().min(1, 'Name is required'),
  // DND
  dndEnabled: z.boolean().optional(),
  // Call Forwarding
  forwardEnabled: z.boolean().optional(),
  forwardDestination: z.string().optional(),
  forwardType: z.enum(['always', 'busy', 'noanswer', 'unavailable']).optional(),
  forwardTimeout: z.number().min(5).max(120).optional(),
});

const editSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  enabled: z.boolean(),
  forwardNumber: z.string().optional(),
  // DND
  dndEnabled: z.boolean().optional(),
  // Call Forwarding
  forwardEnabled: z.boolean().optional(),
  forwardDestination: z.string().optional(),
  forwardType: z.enum(['always', 'busy', 'noanswer', 'unavailable']).optional(),
  forwardTimeout: z.number().min(5).max(120).optional(),
});

type CreateFormData = z.infer<typeof createSchema>;
type EditFormData = z.infer<typeof editSchema>;

interface ExtensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extension?: Extension | null;
}

function SipDetailsCard({ sipDetails, extensionName }: { sipDetails: SipDetails; extensionName: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;

        // Ensure element is part of DOM and selectable but invisible
        textArea.style.position = 'fixed';
        textArea.style.left = '0';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // For mobile devices

        try {
          const successful = document.execCommand('copy');
          if (!successful) throw new Error('Copy failed');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setCopied(field);
      toast.success(`${field} copied to clipboard`);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyAll = async () => {
    const allDetails = `Server: ${sipDetails.server}
Port: ${sipDetails.port}
Username: ${sipDetails.username}
Password: ${sipDetails.password}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(allDetails);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = allDetails;

        // Ensure element is part of DOM and selectable but invisible
        textArea.style.position = 'fixed';
        textArea.style.left = '0';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // For mobile devices

        try {
          const successful = document.execCommand('copy');
          if (!successful) throw new Error('Copy failed');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      toast.success('All SIP details copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-green-600 dark:text-green-400">Extension Created!</h3>
        <Button size="sm" variant="outline" onClick={copyAll}>
          <Copy className="h-3 w-3 mr-1" />
          Copy All
        </Button>
      </div>

      <div className="space-y-1 mb-4">
        <div className="text-sm text-muted-foreground">Name: <span className="font-medium text-foreground">{extensionName}</span></div>
        <div className="text-sm text-muted-foreground">Extension: <span className="font-mono font-medium text-foreground">{sipDetails.username}</span></div>
      </div>

      <div className="text-sm font-medium mb-2">SIP Login Details:</div>
      <div className="bg-background rounded-md border p-3 space-y-2 font-mono text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Server:</span>
            <span>{sipDetails.server}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => copyToClipboard(sipDetails.server, 'Server')}
          >
            {copied === 'Server' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Username:</span>
            <span>{sipDetails.username}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => copyToClipboard(sipDetails.username, 'Username')}
          >
            {copied === 'Username' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Password:</span>
            <span className="text-green-600 dark:text-green-400">{sipDetails.password}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => copyToClipboard(sipDetails.password, 'Password')}
          >
            {copied === 'Password' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Port:</span>
            <span>{sipDetails.port}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => copyToClipboard(String(sipDetails.port), 'Port')}
          >
            {copied === 'Port' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExtensionDialog({ open, onOpenChange, extension }: ExtensionDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!extension;
  const [createdSipDetails, setCreatedSipDetails] = useState<{ sipDetails: SipDetails; name: string } | null>(null);

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      number: '',
      name: '',
      dndEnabled: false,
      forwardEnabled: false,
      forwardDestination: '',
      forwardType: 'always',
      forwardTimeout: 20,
    },
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: extension?.name || '',
      enabled: extension?.enabled ?? true,
      forwardNumber: extension?.forwardNumber || '',
      dndEnabled: extension?.dndEnabled ?? false,
      forwardEnabled: extension?.forwardEnabled ?? false,
      forwardDestination: extension?.forwardDestination || '',
      forwardType: extension?.forwardType || 'always',
      forwardTimeout: extension?.forwardTimeout || 20,
    },
  });

  // Reset forms when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      createForm.reset();
      editForm.reset();
      setCreatedSipDetails(null);
    } else if (extension) {
      editForm.reset({
        name: extension.name,
        enabled: extension.enabled,
        forwardNumber: extension.forwardNumber || '',
        dndEnabled: extension.dndEnabled ?? false,
        forwardEnabled: extension.forwardEnabled ?? false,
        forwardDestination: extension.forwardDestination || '',
        forwardType: extension.forwardType || 'always',
        forwardTimeout: extension.forwardTimeout || 20,
      });
    }
    onOpenChange(newOpen);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateFormData) => extensionsApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      setCreatedSipDetails({ sipDetails: response.sipDetails, name: response.name });
      toast.success('Extension created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create extension');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: EditFormData) => extensionsApi.update(extension!.number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      toast.success('Extension updated successfully');
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update extension');
    },
  });

  const onCreateSubmit = (data: CreateFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: EditFormData) => {
    updateMutation.mutate(data);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Show SIP details after creation
  if (createdSipDetails) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Extension</DialogTitle>
            <DialogDescription>
              Extension created successfully. Save these SIP credentials.
            </DialogDescription>
          </DialogHeader>

          <SipDetailsCard
            sipDetails={createdSipDetails.sipDetails}
            extensionName={createdSipDetails.name}
          />

          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Create form
  const createForwardEnabled = createForm.watch('forwardEnabled');

  if (!isEditing) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Extension</DialogTitle>
            <DialogDescription>
              Create a new SIP extension. Password will be auto-generated.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-6">
            {/* Basic Settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="number">Extension Number</Label>
                <Input
                  id="number"
                  placeholder="1001"
                  {...createForm.register('number')}
                />
                {createForm.formState.errors.number && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.number.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Sales, Support, John Doe"
                  {...createForm.register('name')}
                />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
                )}
              </div>
            </div>

            {/* Do Not Disturb */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Do Not Disturb</h4>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable DND</Label>
                  <p className="text-xs text-muted-foreground">Reject all incoming calls</p>
                </div>
                <Switch
                  checked={createForm.watch('dndEnabled')}
                  onCheckedChange={(checked) => createForm.setValue('dndEnabled', checked)}
                />
              </div>
            </div>

            {/* Call Forwarding */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Call Forwarding</h4>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Forwarding</Label>
                  <p className="text-xs text-muted-foreground">Forward calls to another number</p>
                </div>
                <Switch
                  checked={createForm.watch('forwardEnabled')}
                  onCheckedChange={(checked) => createForm.setValue('forwardEnabled', checked)}
                />
              </div>

              {createForwardEnabled && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-forwardDestination">Forward To</Label>
                    <Input
                      id="create-forwardDestination"
                      placeholder="e.g., 1002 or +31612345678"
                      {...createForm.register('forwardDestination')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-forwardType">Forward When</Label>
                    <Select
                      value={createForm.watch('forwardType')}
                      onValueChange={(value: 'always' | 'busy' | 'noanswer' | 'unavailable') =>
                        createForm.setValue('forwardType', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select when to forward" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Always (Unconditional)</SelectItem>
                        <SelectItem value="busy">When Busy</SelectItem>
                        <SelectItem value="noanswer">No Answer</SelectItem>
                        <SelectItem value="unavailable">Unavailable/Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {createForm.watch('forwardType') === 'noanswer' && (
                    <div className="space-y-2">
                      <Label htmlFor="create-forwardTimeout">Ring Timeout (seconds)</Label>
                      <Input
                        id="create-forwardTimeout"
                        type="number"
                        min={5}
                        max={120}
                        {...createForm.register('forwardTimeout', { valueAsNumber: true })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Seconds to ring before forwarding (5-120)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Extension'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Edit form
  const forwardEnabled = editForm.watch('forwardEnabled');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Extension {extension.number}</DialogTitle>
          <DialogDescription>
            Update the extension settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
          {/* Basic Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Display Name</Label>
              <Input
                id="edit-name"
                placeholder="e.g., Sales, Support, John Doe"
                {...editForm.register('name')}
              />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Extension Enabled</Label>
                <p className="text-xs text-muted-foreground">Allow this extension to receive calls</p>
              </div>
              <Switch
                checked={editForm.watch('enabled')}
                onCheckedChange={(checked) => editForm.setValue('enabled', checked)}
              />
            </div>
          </div>

          {/* Do Not Disturb */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BellOff className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Do Not Disturb</h4>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable DND</Label>
                <p className="text-xs text-muted-foreground">Reject all incoming calls</p>
              </div>
              <Switch
                checked={editForm.watch('dndEnabled')}
                onCheckedChange={(checked) => editForm.setValue('dndEnabled', checked)}
              />
            </div>
          </div>

          {/* Call Forwarding */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Call Forwarding</h4>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Forwarding</Label>
                <p className="text-xs text-muted-foreground">Forward calls to another number</p>
              </div>
              <Switch
                checked={editForm.watch('forwardEnabled')}
                onCheckedChange={(checked) => editForm.setValue('forwardEnabled', checked)}
              />
            </div>

            {forwardEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="forwardDestination">Forward To</Label>
                  <Input
                    id="forwardDestination"
                    placeholder="e.g., 1002 or +31612345678"
                    {...editForm.register('forwardDestination')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="forwardType">Forward When</Label>
                  <Select
                    value={editForm.watch('forwardType')}
                    onValueChange={(value: 'always' | 'busy' | 'noanswer' | 'unavailable') =>
                      editForm.setValue('forwardType', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select when to forward" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Always (Unconditional)</SelectItem>
                      <SelectItem value="busy">When Busy</SelectItem>
                      <SelectItem value="noanswer">No Answer</SelectItem>
                      <SelectItem value="unavailable">Unavailable/Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editForm.watch('forwardType') === 'noanswer' && (
                  <div className="space-y-2">
                    <Label htmlFor="forwardTimeout">Ring Timeout (seconds)</Label>
                    <Input
                      id="forwardTimeout"
                      type="number"
                      min={5}
                      max={120}
                      {...editForm.register('forwardTimeout', { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Seconds to ring before forwarding (5-120)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Legacy forward number field (hidden but kept for compatibility) */}
            <input type="hidden" {...editForm.register('forwardNumber')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
