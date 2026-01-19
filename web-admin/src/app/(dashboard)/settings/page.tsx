'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Music, Mic, User, Check, Upload, HelpCircle, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { authApi, settingsApi, promptsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load local storage settings
    const avatar = localStorage.getItem('user_avatar');
    if (avatar) {
      setFormData(prev => ({ ...prev, user_avatar: avatar }));
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: promptsData } = useQuery({
    queryKey: ['prompts'],
    queryFn: promptsApi.list,
  });

  const { data: recordingData, isLoading: recordingLoading } = useQuery({
    queryKey: ['settings', 'recording'],
    queryFn: settingsApi.getRecording,
  });

  const recordingMutation = useMutation({
    mutationFn: settingsApi.toggleRecording,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'recording'] });
      toast.success(data.message);
    },
    onError: () => {
      toast.error('Failed to toggle call recording');
    },
  });

  const mutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved successfully');
    },
    onError: () => {
      toast.error('Failed to save settings');
    },
  });

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Exclude user_avatar from backend submission as it's client-side only
    const { user_avatar, ...submitData } = formData;
    mutation.mutate(submitData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">System configuration</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          {/* AMI Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Asterisk Manager Interface</CardTitle>
              <CardDescription>Configure connection to Asterisk AMI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ami_host">AMI Host</Label>
                      <Input
                        id="ami_host"
                        defaultValue={data?.ami_host || 'localhost'}
                        onChange={(e) => handleChange('ami_host', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ami_port">AMI Port</Label>
                      <Input
                        id="ami_port"
                        type="number"
                        defaultValue={data?.ami_port || '5038'}
                        onChange={(e) => handleChange('ami_port', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ami_username">AMI Username</Label>
                      <Input
                        id="ami_username"
                        defaultValue={data?.ami_username || ''}
                        onChange={(e) => handleChange('ami_username', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ami_secret">AMI Secret</Label>
                      <Input
                        id="ami_secret"
                        type="password"
                        placeholder="Enter secret to change"
                        onChange={(e) => handleChange('ami_secret', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* TTS Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Text-to-Speech</CardTitle>
              <CardDescription>Configure TTS engine settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tts_engine">TTS Engine</Label>
                    <Input
                      id="tts_engine"
                      defaultValue={data?.tts_engine || 'piper'}
                      onChange={(e) => handleChange('tts_engine', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tts_voice">Default Voice</Label>
                    <Input
                      id="tts_voice"
                      defaultValue={data?.tts_voice || 'en_US-amy-medium'}
                      onChange={(e) => handleChange('tts_voice', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Music on Hold Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Music on Hold
              </CardTitle>
              <CardDescription>
                Configure default hold music. This will be used when no queue-specific or campaign-specific hold music is set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="default_moh">Default Hold Music</Label>
                  <Select
                    defaultValue={data?.default_moh_prompt_id || 'none'}
                    onValueChange={(value) => handleChange('default_moh_prompt_id', value === 'none' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a prompt for hold music" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (System Default)</SelectItem>
                      {promptsData?.prompts?.map((prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id}>
                          {prompt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Select an audio prompt to use as the default music on hold. You can create new audio prompts in the Prompts section.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Recording Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Call Recording
              </CardTitle>
              <CardDescription>
                Enable or disable automatic call recording for all outbound campaign calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recordingLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="recording-toggle">Record All Calls</Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, all outbound campaign calls will be automatically recorded.
                    </p>
                  </div>
                  <Switch
                    id="recording-toggle"
                    checked={recordingData?.enabled ?? false}
                    onCheckedChange={() => recordingMutation.mutate()}
                    disabled={recordingMutation.isPending}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                User Profile
              </CardTitle>
              <CardDescription>
                Customize your admin profile appearance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Profile Avatar</Label>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-3">
                  {[
                    // Human Avatars - Diverse
                    'white_avatar_top_left', 'white_avatar_top_right', 'white_avatar_bottom_left', 'white_avatar_bottom_right',
                    'asian_avatar_top_left', 'asian_avatar_top_right', 'asian_avatar_bottom_left', 'asian_avatar_bottom_right',
                    'asian_standard_avatar_top_left', 'asian_standard_avatar_top_right', 'asian_standard_avatar_bottom_left', 'asian_standard_avatar_bottom_right',
                    'african_american_avatar_top_left', 'african_american_avatar_top_right', 'african_american_avatar_bottom_left', 'african_american_avatar_bottom_right',
                    'latino_avatar_top_left', 'latino_avatar_top_right', 'latino_avatar_bottom_left', 'latino_avatar_bottom_right',
                    'middle_eastern_avatar_top_left', 'middle_eastern_avatar_top_right', 'middle_eastern_avatar_bottom_left', 'middle_eastern_avatar_bottom_right',
                    'south_asian_avatar_top_left', 'south_asian_avatar_top_right', 'south_asian_avatar_bottom_left', 'south_asian_avatar_bottom_right',
                    'pacific_islander_avatar_top_left', 'pacific_islander_avatar_top_right', 'pacific_islander_avatar_bottom_left', 'pacific_islander_avatar_bottom_right',
                    'indigenous_avatar_top_left', 'indigenous_avatar_top_right', 'indigenous_avatar_bottom_left', 'indigenous_avatar_bottom_right',
                    // Robot Avatars
                    'robot_avatar_top_left', 'robot_avatar_top_right', 'robot_avatar_bottom_left', 'robot_avatar_bottom_right',
                    'robot_white_avatar_top_left', 'robot_white_avatar_top_right', 'robot_white_avatar_bottom_left', 'robot_white_avatar_bottom_right',
                    'robot_asian_avatar_top_left', 'robot_asian_avatar_top_right', 'robot_asian_avatar_bottom_left', 'robot_asian_avatar_bottom_right',
                    'robot_afro_avatar_top_left', 'robot_afro_avatar_top_right', 'robot_afro_avatar_bottom_left', 'robot_afro_avatar_bottom_right',
                    'robot_latino_avatar_top_left', 'robot_latino_avatar_top_right', 'robot_latino_avatar_bottom_left', 'robot_latino_avatar_bottom_right',
                    'robot_middle_eastern_avatar_top_left', 'robot_middle_eastern_avatar_top_right', 'robot_middle_eastern_avatar_bottom_left', 'robot_middle_eastern_avatar_bottom_right',
                    'robot_south_asian_avatar_top_left', 'robot_south_asian_avatar_top_right', 'robot_south_asian_avatar_bottom_left', 'robot_south_asian_avatar_bottom_right',
                    'robot_pacific_islander_avatar_top_left', 'robot_pacific_islander_avatar_top_right', 'robot_pacific_islander_avatar_bottom_left', 'robot_pacific_islander_avatar_bottom_right',
                    'robot_indigenous_avatar_top_left', 'robot_indigenous_avatar_top_right', 'robot_indigenous_avatar_bottom_left', 'robot_indigenous_avatar_bottom_right',
                    // Robot Professions
                    'robot_profession_business', 'robot_profession_doctor', 'robot_profession_scientist',
                    'robot_profession_chef', 'robot_profession_pilot', 'robot_profession_police',
                    'robot_profession_firefighter', 'robot_profession_construction',
                    // Alien Avatars
                    'alien_avatar_top_left', 'alien_avatar_top_right', 'alien_avatar_bottom_left', 'alien_avatar_bottom_right',
                  ].map((avatarId) => {
                    const avatarPath = `/avatars/${avatarId}.png`;
                    const isSelected = user?.avatarUrl === avatarPath;

                    return (
                      <div
                        key={avatarId}
                        onClick={async () => {
                          const path = `/avatars/${avatarId}.png`;
                          try {
                            // Update backend
                            await authApi.updateProfile({ avatarUrl: path });
                            // Update local store
                            updateUser({ avatarUrl: path });
                            // Update local storage for persistence on refresh if store not hydrated
                            localStorage.setItem('user_avatar', path);
                            toast.success('Avatar updated');
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to update avatar');
                          }
                        }}
                        className={`
                          group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200
                          ${isSelected
                            ? 'border-primary ring-2 ring-primary/20 scale-95'
                            : 'border-transparent hover:border-primary/50 hover:scale-105'
                          }
                        `}
                      >
                        <Image
                          src={`/avatars/${avatarId}.png`}
                          alt={avatarId}
                          fill
                          className="object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-4 w-4" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 border-t pt-4">
                  <div className="flex-1">
                    <Label className="text-base">Custom Avatar</Label>
                    <p className="text-sm text-muted-foreground">Upload your own image to use as profile picture</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      className="hidden"
                      id="avatar-upload"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const result = ev.target?.result as string;
                            try {
                              // Update backend
                              await authApi.updateProfile({ avatarUrl: result });
                              // Update local store
                              updateUser({ avatarUrl: result });
                              localStorage.setItem('user_avatar', result);
                              toast.success('Custom avatar uploaded');
                            } catch (err: any) {
                              toast.error(err.message || 'Failed to upload avatar');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => document.getElementById('avatar-upload')?.click()}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Image
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Help & Documentation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Help & Documentation
              </CardTitle>
              <CardDescription>
                Learn how to use BotPBX
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href="https://botpbx.com/docs" target="_blank" rel="noopener noreferrer">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Open Documentation
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
