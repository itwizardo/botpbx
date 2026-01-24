'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  twilioApi,
  TwilioPhoneNumber,
  TwilioTrunkConfig,
  TwilioStirShaken,
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Phone,
  Shield,
  Lock,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface TwilioWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type WizardStep = 'credentials' | 'numbers' | 'settings' | 'review';

const STEPS: WizardStep[] = ['credentials', 'numbers', 'settings', 'review'];

export function TwilioWizard({ open, onOpenChange, onSuccess }: TwilioWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('credentials');

  // Form state
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [trunkName, setTrunkName] = useState('Twilio SIP Trunk');
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [enableStirShaken, setEnableStirShaken] = useState(true);
  const [useTls, setUseTls] = useState(true);

  // Fetched data
  const [accountName, setAccountName] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<TwilioPhoneNumber[]>([]);
  const [trunkConfig, setTrunkConfig] = useState<TwilioTrunkConfig | null>(null);
  const [stirShaken, setStirShaken] = useState<TwilioStirShaken | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep('credentials');
      setAccountSid('');
      setAuthToken('');
      setTrunkName('Twilio SIP Trunk');
      setSelectedNumbers([]);
      setEnableStirShaken(true);
      setUseTls(true);
      setAccountName(null);
      setPhoneNumbers([]);
      setTrunkConfig(null);
      setStirShaken(null);
      setValidationError(null);
    }
    onOpenChange(isOpen);
  };

  // Validate credentials and fetch all data
  const validateMutation = useMutation({
    mutationFn: () => twilioApi.getWizardData(accountSid, authToken),
    onSuccess: (data) => {
      if (data.valid) {
        setAccountName(data.accountName || null);
        setPhoneNumbers(data.phoneNumbers);
        setTrunkConfig(data.trunkConfig);
        setStirShaken(data.stirShaken);
        setValidationError(null);
        setStep('numbers');
      } else {
        setValidationError('Invalid credentials');
      }
    },
    onError: (error: Error) => {
      setValidationError(error.message || 'Failed to validate credentials');
    },
  });

  // Create trunk
  const createTrunkMutation = useMutation({
    mutationFn: () =>
      twilioApi.createTrunk({
        accountSid,
        authToken,
        name: trunkName,
        selectedNumbers,
        enableStirShaken,
        useTls,
      }),
    onSuccess: () => {
      toast.success('Twilio trunk created successfully');
      queryClient.invalidateQueries({ queryKey: ['trunks'] });
      onSuccess();
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create trunk');
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

  const handleNumberToggle = (phoneNumber: string) => {
    setSelectedNumbers((prev) =>
      prev.includes(phoneNumber)
        ? prev.filter((n) => n !== phoneNumber)
        : [...prev, phoneNumber]
    );
  };

  const handleSelectAll = () => {
    if (selectedNumbers.length === phoneNumbers.length) {
      setSelectedNumbers([]);
    } else {
      setSelectedNumbers(phoneNumbers.map((n) => n.phoneNumber));
    }
  };

  const renderCredentialsStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accountSid">Account SID</Label>
        <Input
          id="accountSid"
          value={accountSid}
          onChange={(e) => setAccountSid(e.target.value)}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Found in your Twilio Console dashboard
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="authToken">Auth Token</Label>
        <Input
          id="authToken"
          type="password"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder="Your Twilio Auth Token"
        />
        <p className="text-xs text-muted-foreground">
          Click "Show" in your Twilio Console to reveal
        </p>
      </div>

      {validationError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          {validationError}
        </div>
      )}

      {accountName && (
        <div className="p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Connected to: {accountName}
        </div>
      )}
    </div>
  );

  const renderNumbersStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {phoneNumbers.length} phone number{phoneNumbers.length !== 1 ? 's' : ''} found
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSelectAll}
        >
          {selectedNumbers.length === phoneNumbers.length ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-3">
        {phoneNumbers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No phone numbers found in your Twilio account
          </p>
        ) : (
          phoneNumbers.map((number) => (
            <div
              key={number.sid}
              className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => handleNumberToggle(number.phoneNumber)}
            >
              <Checkbox
                checked={selectedNumbers.includes(number.phoneNumber)}
                onCheckedChange={() => handleNumberToggle(number.phoneNumber)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm">{number.phoneNumber}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {number.friendlyName}
                </p>
              </div>
              <div className="flex gap-1">
                {number.capabilities.voice && (
                  <Badge variant="outline" className="text-xs">
                    <Phone className="h-3 w-3 mr-1" />
                    Voice
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Selected numbers will be associated with this trunk for caller ID verification
      </p>
    </div>
  );

  const renderSettingsStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="trunkName">Trunk Name</Label>
        <Input
          id="trunkName"
          value={trunkName}
          onChange={(e) => setTrunkName(e.target.value)}
          placeholder="Twilio SIP Trunk"
        />
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="useTls">Use TLS (Port 5061)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Encrypt SIP signaling (recommended)
            </p>
          </div>
          <Switch
            id="useTls"
            checked={useTls}
            onCheckedChange={setUseTls}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="stirShaken">Enable STIR/SHAKEN</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Caller ID verification (A attestation for verified numbers)
            </p>
          </div>
          <Switch
            id="stirShaken"
            checked={enableStirShaken}
            onCheckedChange={setEnableStirShaken}
          />
        </div>
      </div>

      {stirShaken && stirShaken.verifiedNumbers.length > 0 && (
        <div className="p-3 rounded-lg bg-green-500/10 text-sm">
          <p className="font-medium text-green-700 dark:text-green-400">
            STIR/SHAKEN Ready
          </p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-1">
            {stirShaken.verifiedNumbers.length} number{stirShaken.verifiedNumbers.length !== 1 ? 's' : ''} eligible for A attestation
          </p>
        </div>
      )}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <div className="rounded-lg border divide-y">
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Account</span>
          <span className="text-sm font-medium">{accountName || 'Unknown'}</span>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Trunk Name</span>
          <span className="text-sm font-medium">{trunkName}</span>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Host</span>
          <span className="text-sm font-mono">{trunkConfig?.termination.host}</span>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Port</span>
          <span className="text-sm font-mono">{useTls ? '5061 (TLS)' : '5060'}</span>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Phone Numbers</span>
          <span className="text-sm font-medium">
            {selectedNumbers.length} selected
          </span>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">STIR/SHAKEN</span>
          <Badge variant={enableStirShaken ? 'success' : 'secondary'}>
            {enableStirShaken ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="p-3 flex justify-between">
          <span className="text-sm text-muted-foreground">Codecs</span>
          <span className="text-sm font-mono">
            {trunkConfig?.codecs.join(', ')}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click "Create Trunk" to configure this SIP trunk in BotPBX and reload Asterisk.
      </p>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'credentials':
        return renderCredentialsStep();
      case 'numbers':
        return renderNumbersStep();
      case 'settings':
        return renderSettingsStep();
      case 'review':
        return renderReviewStep();
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'credentials':
        return 'Connect Twilio Account';
      case 'numbers':
        return 'Select Phone Numbers';
      case 'settings':
        return 'Configure Trunk';
      case 'review':
        return 'Review & Create';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'credentials':
        return 'Enter your Twilio Account SID and Auth Token to connect';
      case 'numbers':
        return 'Select which phone numbers to use with this trunk';
      case 'settings':
        return 'Configure trunk settings and security options';
      case 'review':
        return 'Review your configuration before creating the trunk';
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'credentials':
        return accountSid.length > 0 && authToken.length > 0;
      case 'numbers':
        return true; // Numbers are optional
      case 'settings':
        return trunkName.length > 0;
      case 'review':
        return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
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

        <div className="py-4">{renderStepContent()}</div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {step !== 'credentials' && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                disabled={validateMutation.isPending || createTrunkMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            {step === 'credentials' ? (
              <Button
                onClick={() => validateMutation.mutate()}
                disabled={!canProceed() || validateMutation.isPending}
              >
                {validateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            ) : step === 'review' ? (
              <Button
                onClick={() => createTrunkMutation.mutate()}
                disabled={createTrunkMutation.isPending}
              >
                {createTrunkMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Trunk'
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
