'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trunksApi } from '@/lib/api';
import { toast } from 'sonner';
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
import type { Trunk } from '@/types/models';

const trunkSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().min(1).max(65535),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  authUsername: z.string().optional(),
  fromUser: z.string().optional(),
  fromDomain: z.string().optional(),
  codecs: z.string(),
  enabled: z.boolean(),
  register: z.boolean(),
});

type TrunkFormData = z.infer<typeof trunkSchema>;

interface TrunkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trunk?: Omit<Trunk, 'password'> | null;
}

export function TrunkDialog({ open, onOpenChange, trunk }: TrunkDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!trunk;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TrunkFormData>({
    resolver: zodResolver(trunkSchema),
    defaultValues: {
      name: '',
      host: '',
      port: 5060,
      username: '',
      password: '',
      authUsername: '',
      fromUser: '',
      fromDomain: '',
      codecs: 'ulaw,alaw',
      enabled: true,
      register: true,
    },
  });

  const enabled = watch('enabled');
  const registerTrunk = watch('register');

  useEffect(() => {
    if (trunk) {
      reset({
        name: trunk.name,
        host: trunk.host,
        port: trunk.port,
        username: trunk.username,
        password: '', // Don't prefill password
        authUsername: trunk.authUsername || '',
        fromUser: trunk.fromUser || '',
        fromDomain: trunk.fromDomain || '',
        codecs: trunk.codecs,
        enabled: trunk.enabled,
        register: trunk.register,
      });
    } else {
      reset({
        name: '',
        host: '',
        port: 5060,
        username: '',
        password: '',
        authUsername: '',
        fromUser: '',
        fromDomain: '',
        codecs: 'ulaw,alaw',
        enabled: true,
        register: true,
      });
    }
  }, [trunk, reset]);

  const createMutation = useMutation({
    mutationFn: (data: TrunkFormData) => trunksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trunks'] });
      toast.success('Trunk created successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create trunk');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: TrunkFormData) => {
      const updateData = { ...data };
      if (!updateData.password) {
        delete (updateData as any).password;
      }
      return trunksApi.update(trunk!.id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trunks'] });
      toast.success('Trunk updated successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update trunk');
    },
  });

  const onSubmit = (data: TrunkFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Trunk' : 'New SIP Trunk'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the trunk configuration.' : 'Configure a new SIP trunk connection.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Trunk Name</Label>
            <Input id="name" placeholder="My VoIP Provider" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input id="host" placeholder="sip.provider.com" {...register('host')} />
              {errors.host && <p className="text-xs text-destructive">{errors.host.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" {...register('port')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" {...register('username')} />
              {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={isEditing ? 'Leave blank to keep current' : ''}
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromUser">From User (optional)</Label>
              <Input id="fromUser" {...register('fromUser')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fromDomain">From Domain (optional)</Label>
              <Input id="fromDomain" {...register('fromDomain')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="codecs">Codecs</Label>
            <Input id="codecs" placeholder="ulaw,alaw,g729" {...register('codecs')} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={(checked) => setValue('enabled', checked)}
                />
                <Label htmlFor="enabled">Enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="register"
                  checked={registerTrunk}
                  onCheckedChange={(checked) => setValue('register', checked)}
                />
                <Label htmlFor="register">Register</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
