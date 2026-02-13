'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  extensionsApi,
  trunksApi,
  outboundRoutesApi,
  ExtensionWithSip,
} from '@/lib/api';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2,
  CheckCircle2,
  Phone,
  Plug,
  Route,
  PartyPopper,
  ArrowLeft,
  ArrowRight,
  Copy,
  Eye,
  EyeOff,
  SkipForward,
} from 'lucide-react';
import { TwilioWizard } from '@/components/trunks/twilio-wizard';

interface SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'extension' | 'trunk' | 'outbound' | 'done';
type TrunkType = 'twilio' | 'manual' | null;

const STEPS: WizardStep[] = ['extension', 'trunk', 'outbound', 'done'];

const STEP_INFO = {
  extension: {
    title: 'Create an Extension',
    description: 'Set up your first SIP extension to make and receive calls',
    icon: Phone,
  },
  trunk: {
    title: 'Connect a Trunk',
    description: 'Connect to a SIP provider to route calls to the outside world',
    icon: Plug,
  },
  outbound: {
    title: 'Set Up Outbound Routing',
    description: 'Configure how outbound calls are routed through your trunk',
    icon: Route,
  },
  done: {
    title: 'Setup Complete!',
    description: 'Your PBX is ready to make and receive calls',
    icon: PartyPopper,
  },
};

const ROUTE_PRESETS = [
  { id: 'us-local', name: 'US Local (10 digit)', pattern: '_NXXNXXXXXX', description: 'Matches 10-digit US numbers' },
  { id: 'us-1', name: 'US with 1 prefix', pattern: '_1NXXNXXXXXX', description: 'Matches 1+10-digit US numbers' },
  { id: 'international', name: 'International', pattern: '_011.', description: 'Matches international calls (011+)' },
  { id: 'all', name: 'All Calls', pattern: '_X.', description: 'Matches any dialed number' },
];

export function SetupWizard({ open, onOpenChange }: SetupWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('extension');

  // Created items tracking
  const [createdExtension, setCreatedExtension] = useState<ExtensionWithSip | null>(null);
  const [createdTrunkId, setCreatedTrunkId] = useState<string | null>(null);
  const [createdTrunkName, setCreatedTrunkName] = useState<string | null>(null);
  const [createdRouteName, setCreatedRouteName] = useState<string | null>(null);

  // Extension form
  const [extNumber, setExtNumber] = useState('1001');
  const [extName, setExtName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Trunk form
  const [trunkType, setTrunkType] = useState<TrunkType>(null);
  const [showTwilioWizard, setShowTwilioWizard] = useState(false);
  const [manualTrunkName, setManualTrunkName] = useState('');
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('5060');
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');

  // Outbound route form
  const [routeName, setRouteName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('us-local');
  const [customPattern, setCustomPattern] = useState('');

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep('extension');
      setCreatedExtension(null);
      setCreatedTrunkId(null);
      setCreatedTrunkName(null);
      setCreatedRouteName(null);
      setExtNumber('1001');
      setExtName('');
      setShowPassword(false);
      setTrunkType(null);
      setManualTrunkName('');
      setManualHost('');
      setManualPort('5060');
      setManualUsername('');
      setManualPassword('');
      setRouteName('');
      setSelectedPreset('us-local');
      setCustomPattern('');
    }
    onOpenChange(isOpen);
  };

  // Create extension mutation
  const createExtensionMutation = useMutation({
    mutationFn: () => extensionsApi.create({ number: extNumber, name: extName || `Extension ${extNumber}` }),
    onSuccess: (data) => {
      setCreatedExtension(data);
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      toast.success('Extension created successfully');
      setStep('trunk');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create extension');
    },
  });

  // Create manual trunk mutation
  const createTrunkMutation = useMutation({
    mutationFn: () => trunksApi.create({
      name: manualTrunkName,
      host: manualHost,
      port: parseInt(manualPort, 10),
      username: manualUsername,
      password: manualPassword,
      codecs: 'ulaw,alaw,g722',
    }),
    onSuccess: (data) => {
      setCreatedTrunkId(data.id);
      setCreatedTrunkName(data.name);
      queryClient.invalidateQueries({ queryKey: ['trunks'] });
      toast.success('Trunk created successfully');
      setStep('outbound');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create trunk');
    },
  });

  // Create outbound route mutation
  const createRouteMutation = useMutation({
    mutationFn: () => {
      const preset = ROUTE_PRESETS.find(p => p.id === selectedPreset);
      const pattern = selectedPreset === 'custom' ? customPattern : preset?.pattern || '_X.';
      return outboundRoutesApi.create({
        name: routeName || `Route via ${createdTrunkName}`,
        pattern,
        trunkId: createdTrunkId!,
        priority: 1,
      });
    },
    onSuccess: (data) => {
      setCreatedRouteName(data.name);
      queryClient.invalidateQueries({ queryKey: ['outbound-routes'] });
      toast.success('Outbound route created successfully');
      setStep('done');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create outbound route');
    },
  });

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleTwilioSuccess = () => {
    // After Twilio wizard succeeds, we need to get the created trunk
    // For now, just move to next step - user will need to select trunk in route step
    queryClient.invalidateQueries({ queryKey: ['trunks'] });
    toast.success('Twilio trunk created');
    setStep('outbound');
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        const target = document.querySelector('[role="dialog"]') || document.body;
        target.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        target.removeChild(textArea);
      }
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const renderExtensionStep = () => (
    <div className="space-y-4">
      {createdExtension ? (
        // Show created extension details
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-3">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Extension Created!</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extension:</span>
                <span className="font-mono font-medium">{createdExtension.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span>{createdExtension.name}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border bg-muted/30">
            <p className="text-sm font-medium mb-3">SIP Credentials</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Server:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{createdExtension.sipDetails.server}:{createdExtension.sipDetails.port}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(`${createdExtension.sipDetails.server}:${createdExtension.sipDetails.port}`)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Username:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{createdExtension.sipDetails.username}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(createdExtension.sipDetails.username)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Password:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">
                    {showPassword ? createdExtension.sipDetails.password : '••••••••'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(createdExtension.sipDetails.password)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Save these credentials to configure your SIP phone or softphone.
          </p>
        </div>
      ) : (
        // Show creation form
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="extNumber">Extension Number</Label>
            <Input
              id="extNumber"
              value={extNumber}
              onChange={(e) => setExtNumber(e.target.value)}
              placeholder="1001"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              The number users will dial to reach this extension
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extName">Display Name (Optional)</Label>
            <Input
              id="extName"
              value={extName}
              onChange={(e) => setExtName(e.target.value)}
              placeholder="John Doe"
            />
            <p className="text-xs text-muted-foreground">
              Name shown on caller ID for internal calls
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const renderTrunkStep = () => (
    <div className="space-y-4">
      {!trunkType ? (
        // Trunk type selection
        <div className="grid grid-cols-2 gap-4">
          <div
            className="p-4 rounded-lg border-2 cursor-pointer hover:border-primary transition-colors"
            onClick={() => {
              setTrunkType('twilio');
              setShowTwilioWizard(true);
            }}
          >
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-[#F22F46]/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-[#F22F46]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.8c.994 0 1.8.806 1.8 1.8s-.806 1.8-1.8 1.8-1.8-.806-1.8-1.8.806-1.8 1.8-1.8zm0 12.6c-.994 0-1.8-.806-1.8-1.8s.806-1.8 1.8-1.8 1.8.806 1.8 1.8-.806 1.8-1.8 1.8zm4.2-4.2c-.994 0-1.8-.806-1.8-1.8s.806-1.8 1.8-1.8 1.8.806 1.8 1.8-.806 1.8-1.8 1.8zm-8.4 0c-.994 0-1.8-.806-1.8-1.8s.806-1.8 1.8-1.8 1.8.806 1.8 1.8-.806 1.8-1.8 1.8z"/>
                </svg>
              </div>
              <p className="font-medium">Twilio</p>
              <p className="text-xs text-muted-foreground mt-1">Quick guided setup</p>
            </div>
          </div>

          <div
            className="p-4 rounded-lg border-2 cursor-pointer hover:border-primary transition-colors"
            onClick={() => setTrunkType('manual')}
          >
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                <Plug className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">Other SIP Provider</p>
              <p className="text-xs text-muted-foreground mt-1">Manual configuration</p>
            </div>
          </div>
        </div>
      ) : trunkType === 'manual' ? (
        // Manual trunk form
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTrunkType(null)}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to selection
          </Button>

          <div className="space-y-2">
            <Label htmlFor="trunkName">Provider Name</Label>
            <Input
              id="trunkName"
              value={manualTrunkName}
              onChange={(e) => setManualTrunkName(e.target.value)}
              placeholder="My SIP Provider"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={manualHost}
                onChange={(e) => setManualHost(e.target.value)}
                placeholder="sip.provider.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
                placeholder="5060"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                placeholder="password"
              />
            </div>
          </div>
        </div>
      ) : null}

      {createdTrunkName && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Trunk "{createdTrunkName}" created!</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderOutboundStep = () => (
    <div className="space-y-4">
      {!createdTrunkId ? (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
          <p className="text-yellow-700 dark:text-yellow-400">
            No trunk was created. You can skip this step or go back to create a trunk.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="routeName">Route Name (Optional)</Label>
            <Input
              id="routeName"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder={`Route via ${createdTrunkName}`}
            />
          </div>

          <div className="space-y-2">
            <Label>Dial Pattern</Label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUTE_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <div>
                      <span>{preset.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{preset.pattern}</span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom Pattern</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ROUTE_PRESETS.find(p => p.id === selectedPreset)?.description || 'Enter a custom Asterisk dial pattern'}
            </p>
          </div>

          {selectedPreset === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="customPattern">Custom Pattern</Label>
              <Input
                id="customPattern"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="_X."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use Asterisk pattern syntax: X=0-9, N=2-9, Z=1-9, .=wildcard
              </p>
            </div>
          )}

          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-sm">
              <span className="text-muted-foreground">Trunk: </span>
              <span className="font-medium">{createdTrunkName}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );

  const renderDoneStep = () => (
    <div className="space-y-6 text-center py-4">
      <div className="h-16 w-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
        <PartyPopper className="h-8 w-8 text-green-600" />
      </div>

      <div>
        <h3 className="text-lg font-semibold">Your PBX is Ready!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Here's what was set up:
        </p>
      </div>

      <div className="text-left space-y-2">
        {createdExtension && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Extension {createdExtension.number}</p>
              <p className="text-xs text-muted-foreground">{createdExtension.name}</p>
            </div>
          </div>
        )}
        {createdTrunkName && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Trunk: {createdTrunkName}</p>
              <p className="text-xs text-muted-foreground">SIP connection configured</p>
            </div>
          </div>
        )}
        {createdRouteName && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Route: {createdRouteName}</p>
              <p className="text-xs text-muted-foreground">Outbound calling enabled</p>
            </div>
          </div>
        )}
        {!createdExtension && !createdTrunkName && !createdRouteName && (
          <p className="text-sm text-muted-foreground text-center">
            No items were created. You can set these up later from the respective pages.
          </p>
        )}
      </div>

      <div className="pt-4 space-y-2">
        <p className="text-sm text-muted-foreground">
          Need more features? Check out IVR menus, ring groups, and call queues.
        </p>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'extension':
        return renderExtensionStep();
      case 'trunk':
        return renderTrunkStep();
      case 'outbound':
        return renderOutboundStep();
      case 'done':
        return renderDoneStep();
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'extension':
        return createdExtension !== null || extNumber.length > 0;
      case 'trunk':
        return createdTrunkId !== null || (trunkType === 'manual' && manualTrunkName && manualHost);
      case 'outbound':
        return createdTrunkId !== null;
      case 'done':
        return true;
    }
  };

  const handlePrimaryAction = () => {
    switch (step) {
      case 'extension':
        if (createdExtension) {
          setStep('trunk');
        } else {
          createExtensionMutation.mutate();
        }
        break;
      case 'trunk':
        if (createdTrunkId) {
          setStep('outbound');
        } else if (trunkType === 'manual') {
          createTrunkMutation.mutate();
        }
        break;
      case 'outbound':
        if (createdTrunkId) {
          createRouteMutation.mutate();
        } else {
          setStep('done');
        }
        break;
      case 'done':
        handleOpenChange(false);
        break;
    }
  };

  const isPending = createExtensionMutation.isPending || createTrunkMutation.isPending || createRouteMutation.isPending;

  const StepIcon = STEP_INFO[step].icon;

  return (
    <>
      <Dialog open={open && !showTwilioWizard} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <StepIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle>{STEP_INFO[step].title}</DialogTitle>
                <DialogDescription>{STEP_INFO[step].description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex justify-center gap-2 py-2">
            {STEPS.map((s, index) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full transition-colors ${
                  index <= STEPS.indexOf(step)
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>

          <div className="py-4 min-h-[280px]">{renderStepContent()}</div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {step !== 'extension' && step !== 'done' && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={isPending}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step !== 'done' && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={isPending}
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Skip
                </Button>
              )}
              <Button
                onClick={handlePrimaryAction}
                disabled={isPending || (step !== 'done' && !canProceed())}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : step === 'done' ? (
                  'Close'
                ) : step === 'extension' && createdExtension ? (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : step === 'trunk' && createdTrunkId ? (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Create & Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Twilio Wizard - separate dialog */}
      <TwilioWizard
        open={showTwilioWizard}
        onOpenChange={(isOpen) => {
          setShowTwilioWizard(isOpen);
          if (!isOpen && !createdTrunkId) {
            setTrunkType(null);
          }
        }}
        onSuccess={handleTwilioSuccess}
      />
    </>
  );
}
