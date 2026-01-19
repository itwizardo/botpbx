'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { ivrApi, extensionsApi, ringGroupsApi, queuesApi } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Trash2, Phone, GitBranch, PhoneOff, RotateCcw, UsersRound, ListOrdered } from 'lucide-react';
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
import type { IVRMenu, IVROption } from '@/types/models';

const menuSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  welcomePromptId: z.string().optional(),
  invalidPromptId: z.string().optional(),
  timeoutPromptId: z.string().optional(),
  timeoutSeconds: z.coerce.number().min(1).max(30),
  maxRetries: z.coerce.number().min(1).max(10),
});

type MenuFormData = z.infer<typeof menuSchema>;

interface IVRMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu?: IVRMenu | null;
}

const actionTypes = [
  { value: 'transfer', label: 'Transfer to Extension', icon: Phone },
  { value: 'ring_group', label: 'Transfer to Ring Group', icon: UsersRound },
  { value: 'call_queue', label: 'Transfer to Call Queue', icon: ListOrdered },
  { value: 'submenu', label: 'Go to Submenu', icon: GitBranch },
  { value: 'hangup', label: 'Hang Up', icon: PhoneOff },
  { value: 'voicemail', label: 'Voicemail', icon: Phone },
];

const keyOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];

interface OptionFormState {
  keyPress: string;
  actionType: string;
  destination: string;
}

export function IVRMenuDialog({ open, onOpenChange, menu }: IVRMenuDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!menu;

  // Options state
  const [options, setOptions] = useState<IVROption[]>([]);
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOption, setNewOption] = useState<OptionFormState>({
    keyPress: '1',
    actionType: 'transfer',
    destination: '',
  });

  const { data: promptsData } = useQuery({
    queryKey: ['prompts'],
    queryFn: ivrApi.listPrompts,
  });

  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  const { data: menusData } = useQuery({
    queryKey: ['ivr-menus'],
    queryFn: ivrApi.listMenus,
  });

  const { data: ringGroupsData } = useQuery({
    queryKey: ['ring-groups'],
    queryFn: ringGroupsApi.list,
  });

  const { data: queuesData } = useQuery({
    queryKey: ['queues'],
    queryFn: queuesApi.list,
  });

  // Fetch fresh menu data when editing to get latest options
  const { data: freshMenuData } = useQuery({
    queryKey: ['ivr-menu', menu?.id],
    queryFn: () => ivrApi.getMenu(menu!.id),
    enabled: !!menu?.id && open,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MenuFormData>({
    resolver: zodResolver(menuSchema),
    defaultValues: {
      name: '',
      welcomePromptId: '',
      invalidPromptId: '',
      timeoutPromptId: '',
      timeoutSeconds: 5,
      maxRetries: 3,
    },
  });

  // Reset form when dialog opens/closes or menu changes
  useEffect(() => {
    if (menu) {
      reset({
        name: menu.name,
        welcomePromptId: menu.welcomePromptId || '',
        invalidPromptId: menu.invalidPromptId || '',
        timeoutPromptId: menu.timeoutPromptId || '',
        timeoutSeconds: menu.timeoutSeconds,
        maxRetries: menu.maxRetries,
      });
    } else {
      reset({
        name: '',
        welcomePromptId: '',
        invalidPromptId: '',
        timeoutPromptId: '',
        timeoutSeconds: 5,
        maxRetries: 3,
      });
      setOptions([]);
    }
    setShowAddOption(false);
  }, [menu, reset, open]);

  // Update options from fresh data when it loads
  useEffect(() => {
    if (freshMenuData?.options) {
      setOptions(freshMenuData.options);
    } else if (menu?.options) {
      setOptions(menu.options);
    }
  }, [freshMenuData, menu?.options]);

  const createMutation = useMutation({
    mutationFn: (data: MenuFormData) => ivrApi.createMenu(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ivr-menus'] });
      toast.success('IVR menu created successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create menu');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: MenuFormData) => ivrApi.updateMenu(menu!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ivr-menus'] });
      toast.success('IVR menu updated successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update menu');
    },
  });

  const addOptionMutation = useMutation({
    mutationFn: (data: Partial<IVROption>) => ivrApi.addOption(menu!.id, data),
    onSuccess: async (newOption) => {
      // Add the new option to local state immediately
      setOptions(prev => [...prev, newOption as IVROption]);
      // Invalidate queries to sync
      queryClient.invalidateQueries({ queryKey: ['ivr-menus'] });
      queryClient.invalidateQueries({ queryKey: ['ivr-menu', menu!.id] });
      toast.success('Option added');
      setShowAddOption(false);
      // Reset with next available key
      const currentUsedKeys = [...options.map(o => o.keyPress), (newOption as IVROption).keyPress];
      const nextAvailable = keyOptions.find(k => !currentUsedKeys.includes(k)) || '1';
      setNewOption({ keyPress: nextAvailable, actionType: 'transfer', destination: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add option');
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (id: string) => ivrApi.deleteOption(id),
    onSuccess: (_, deletedId) => {
      // Remove from local state immediately
      setOptions(prev => prev.filter(o => o.id !== deletedId));
      // Invalidate queries to sync
      queryClient.invalidateQueries({ queryKey: ['ivr-menus'] });
      queryClient.invalidateQueries({ queryKey: ['ivr-menu', menu!.id] });
      toast.success('Option deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete option');
    },
  });

  const onSubmit = (data: MenuFormData) => {
    const cleanData = {
      ...data,
      welcomePromptId: data.welcomePromptId || undefined,
      invalidPromptId: data.invalidPromptId || undefined,
      timeoutPromptId: data.timeoutPromptId || undefined,
    };

    if (isEditing) {
      updateMutation.mutate(cleanData);
    } else {
      createMutation.mutate(cleanData);
    }
  };

  const handleAddOption = () => {
    if (!newOption.keyPress) {
      toast.error('Please select a key');
      return;
    }
    if ((newOption.actionType === 'transfer' || newOption.actionType === 'submenu' || newOption.actionType === 'ring_group' || newOption.actionType === 'call_queue') && !newOption.destination) {
      toast.error('Please select a destination');
      return;
    }

    addOptionMutation.mutate({
      keyPress: newOption.keyPress,
      actionType: newOption.actionType as IVROption['actionType'],
      destination: newOption.destination || null,
    });
  };

  const getDestinationLabel = (option: IVROption): string => {
    if (option.actionType === 'transfer') {
      const ext = extensionsData?.extensions.find(e => e.number === option.destination || e.id === option.destination);
      return ext ? `${ext.number} - ${ext.name}` : option.destination || '';
    }
    if (option.actionType === 'submenu') {
      const m = menusData?.menus.find(m => m.id === option.destination);
      return m?.name || option.destination || '';
    }
    if (option.actionType === 'ring_group' || option.actionType === 'queue') {
      const rg = ringGroupsData?.ringGroups.find(r => r.id === option.destination);
      return rg?.name || option.destination || '';
    }
    if (option.actionType === 'call_queue') {
      const q = queuesData?.queues.find(q => q.id === option.destination);
      return q?.name || option.destination || '';
    }
    return '';
  };

  const usedKeys = options.map(o => o.keyPress);
  const availableKeys = keyOptions.filter(k => !usedKeys.includes(k));

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const prompts = promptsData?.prompts || [];
  const extensions = extensionsData?.extensions || [];
  const menus = menusData?.menus.filter(m => m.id !== menu?.id) || [];
  const ringGroups = ringGroupsData?.ringGroups || [];
  const callQueues = queuesData?.queues || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit IVR Menu' : 'New IVR Menu'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Configure menu settings and key options.' : 'Create a new IVR menu.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Menu Name</Label>
            <Input id="name" placeholder="Main Menu" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Welcome Prompt</Label>
            <select
              value={watch('welcomePromptId') || ''}
              onChange={(e) => setValue('welcomePromptId', e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">None</option>
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Invalid Input Prompt</Label>
            <select
              value={watch('invalidPromptId') || ''}
              onChange={(e) => setValue('invalidPromptId', e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">None</option>
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
              <Input id="timeoutSeconds" type="number" {...register('timeoutSeconds')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Input id="maxRetries" type="number" {...register('maxRetries')} />
            </div>
          </div>

          {/* Key Options Section - Only show when editing */}
          {isEditing && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Key Options</Label>
                {availableKeys.length > 0 && !showAddOption && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewOption({ ...newOption, keyPress: availableKeys[0] });
                      setShowAddOption(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Option
                  </Button>
                )}
              </div>

              {options.length === 0 && !showAddOption && (
                <p className="text-sm text-muted-foreground py-2">
                  No key options configured. Add options to define what happens when callers press keys.
                </p>
              )}

              {/* Existing Options */}
              <div className="space-y-2">
                {options.map((option) => {
                  const actionInfo = actionTypes.find(a => a.value === option.actionType);
                  const Icon = actionInfo?.icon || Phone;
                  return (
                    <div
                      key={option.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-md font-bold">
                          {option.keyPress}
                        </span>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {actionInfo?.label || option.actionType}
                          </span>
                          {option.destination && (
                            <span className="text-sm text-muted-foreground">
                              → {getDestinationLabel(option)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteOptionMutation.mutate(option.id)}
                        disabled={deleteOptionMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Add New Option Form */}
              {showAddOption && (
                <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Key</Label>
                      <select
                        value={newOption.keyPress}
                        onChange={(e) => setNewOption({ ...newOption, keyPress: e.target.value })}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        {availableKeys.map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Action</Label>
                      <select
                        value={newOption.actionType}
                        onChange={(e) => setNewOption({ ...newOption, actionType: e.target.value, destination: '' })}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        {actionTypes.map((action) => (
                          <option key={action.value} value={action.value}>{action.label}</option>
                        ))}
                      </select>
                    </div>
                    {(newOption.actionType === 'transfer' || newOption.actionType === 'submenu' || newOption.actionType === 'ring_group' || newOption.actionType === 'call_queue') && (
                      <div className="space-y-1">
                        <Label className="text-xs">Destination</Label>
                        <select
                          value={newOption.destination}
                          onChange={(e) => setNewOption({ ...newOption, destination: e.target.value })}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                        >
                          <option value="">Select...</option>
                          {newOption.actionType === 'transfer' && extensions.map((ext) => (
                            <option key={ext.number} value={ext.number}>
                              {ext.number} - {ext.name}
                            </option>
                          ))}
                          {newOption.actionType === 'submenu' && menus.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                          {newOption.actionType === 'ring_group' && ringGroups.map((rg) => (
                            <option key={rg.id} value={rg.id}>
                              {rg.name}
                            </option>
                          ))}
                          {newOption.actionType === 'call_queue' && callQueues.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddOption(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddOption}
                      disabled={addOptionMutation.isPending}
                    >
                      {addOptionMutation.isPending ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isEditing && (
            <p className="text-sm text-muted-foreground py-2 border-t pt-4">
              Save the menu first, then edit it to add key options.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Update Menu' : 'Create Menu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
