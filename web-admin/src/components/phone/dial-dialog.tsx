'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Loader2, AlertCircle, Wifi, WifiOff, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { usePhone } from '@/contexts/phone-context';

export function DialDialog() {
  const {
    isDialogOpen,
    closeDialDialog,
    isConnected,
    isRegistered,
    isConnecting,
    call,
    trunks,
    loadingTrunks,
    error,
  } = usePhone();

  const [number, setNumber] = useState('');
  const [selectedTrunk, setSelectedTrunk] = useState<string>('');
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  // Set default trunk when trunks load
  const defaultTrunk = trunks.find(t => t.isDefault)?.endpoint || trunks[0]?.endpoint || '';
  const effectiveTrunk = selectedTrunk || defaultTrunk;

  const handleKeypadClick = useCallback((digit: string) => {
    setNumber(prev => prev + digit);
    setCallError(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setNumber(prev => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(async () => {
    if (!number.trim()) {
      setCallError('Please enter a phone number');
      return;
    }

    if (!effectiveTrunk) {
      setCallError('No trunk selected');
      return;
    }

    setCalling(true);
    setCallError(null);

    try {
      await call(number.trim(), effectiveTrunk);
      // Dialog will close automatically when call state changes
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Call failed');
    } finally {
      setCalling(false);
    }
  }, [number, effectiveTrunk, call]);

  const handleNumberInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits, +, *, #
    const value = e.target.value.replace(/[^\d+*#]/g, '');
    setNumber(value);
    setCallError(null);
  }, []);

  const keypadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];

  return (
    <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialDialog()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Make a Call
          </DialogTitle>
          <DialogDescription>
            Dial a number to make an outbound call through WebRTC
          </DialogDescription>
        </DialogHeader>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
              <span className="text-yellow-500">Connecting...</span>
            </>
          ) : isRegistered ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-green-500">Connected & Registered</span>
            </>
          ) : isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-500">Connected (Registering...)</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-red-500">Disconnected</span>
            </>
          )}
        </div>

        {/* HTTPS Required - Simple message with help button */}
        {error?.includes('HTTPS') && (
          <HttpsErrorBanner />
        )}

        {/* Other Error Display */}
        {(error && !error.includes('HTTPS')) || callError ? (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error || callError}</span>
          </div>
        ) : null}

        {/* Trunk Selector */}
        <div className="space-y-2">
          <Label htmlFor="trunk">Trunk</Label>
          <Select
            value={effectiveTrunk}
            onValueChange={setSelectedTrunk}
            disabled={loadingTrunks || trunks.length === 0}
          >
            <SelectTrigger id="trunk">
              <SelectValue placeholder={loadingTrunks ? 'Loading...' : 'Select trunk'} />
            </SelectTrigger>
            <SelectContent>
              {trunks.map((trunk) => (
                <SelectItem key={trunk.id} value={trunk.endpoint}>
                  {trunk.name} {trunk.isDefault && '(Default)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loadingTrunks && trunks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No trunks available. Add a trunk in Settings.
            </p>
          )}
        </div>

        {/* Phone Number Input */}
        <div className="space-y-2">
          <Label htmlFor="number">Phone Number</Label>
          <div className="flex gap-2">
            <Input
              id="number"
              type="tel"
              placeholder="+1234567890"
              value={number}
              onChange={handleNumberInput}
              className="font-mono text-lg text-center"
              autoComplete="off"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackspace}
              disabled={!number}
            >
              <span className="text-lg">&larr;</span>
            </Button>
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {keypadButtons.map((row, rowIdx) =>
            row.map((digit) => (
              <Button
                key={digit}
                variant="outline"
                className="h-12 text-lg font-semibold"
                onClick={() => handleKeypadClick(digit)}
              >
                {digit}
              </Button>
            ))
          )}
        </div>

        {/* Call Button */}
        <Button
          className="w-full h-12 text-lg"
          onClick={handleCall}
          disabled={!isRegistered || calling || !number.trim() || !effectiveTrunk}
        >
          {calling ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Calling...
            </>
          ) : (
            <>
              <Phone className="mr-2 h-5 w-5" />
              Call
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Simple HTTPS Error Banner with automatic setup
function HttpsErrorBanner() {
  const [showGuide, setShowGuide] = useState(false);
  const [domain, setDomain] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string; steps?: string[] } | null>(null);
  const serverIp = typeof window !== 'undefined' ? window.location.hostname : 'YOUR_SERVER_IP';

  const handleSetupHttps = async () => {
    if (!domain.trim()) {
      setSetupResult({ success: false, message: 'Please enter a domain' });
      return;
    }

    setIsSettingUp(true);
    setSetupResult(null);

    try {
      const token = localStorage.getItem('botpbx_token');
      // Determine API URL based on access method
      // HTTPS (via nginx): use relative URL
      // Direct (port 3001): use port 3000
      const { protocol, hostname, port } = window.location;
      let apiBaseUrl = '';
      if (protocol === 'https:' || (protocol === 'http:' && (!port || port === '80'))) {
        apiBaseUrl = ''; // nginx proxy handles it
      } else {
        apiBaseUrl = `${protocol}//${hostname}:3000`;
      }
      const response = await fetch(`${apiBaseUrl}/api/v1/system/setup-https`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ domain: domain.trim() }),
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text || `Server error (${response.status})` };
      }

      if (response.ok) {
        setSetupResult({
          success: true,
          message: data.message || 'HTTPS setup completed!',
          steps: data.steps,
        });
      } else if (response.status === 401) {
        setSetupResult({
          success: false,
          message: 'Session expired. Please refresh the page and login again.',
        });
      } else {
        setSetupResult({
          success: false,
          message: data.message || 'Setup failed',
          steps: data.steps,
        });
      }
    } catch (err) {
      setSetupResult({
        success: false,
        message: err instanceof Error ? err.message : 'Setup failed',
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <>
      {/* Simple inline banner */}
      <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          <span className="text-sm text-amber-800 dark:text-amber-400">HTTPS required for calling</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/50"
          onClick={() => setShowGuide(true)}
        >
          Setup HTTPS
        </Button>
      </div>

      {/* HTTPS Setup Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Enable HTTPS for WebRTC
            </DialogTitle>
            <DialogDescription>
              Browser security requires HTTPS to access your microphone for calls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step 1: Point domain */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="font-medium text-sm">Step 1: Point your domain to this server</div>
              <p className="text-muted-foreground text-xs">
                Add an A record in your DNS settings:
              </p>
              <div className="bg-background rounded p-2 font-mono text-xs border">
                Type: <span className="text-blue-500">A</span> &nbsp;
                Host: <span className="text-blue-500">@</span> &nbsp;
                Value: <span className="text-green-500">{serverIp}</span>
              </div>
            </div>

            {/* Step 2: Enter domain and setup */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="font-medium text-sm">Step 2: Enter your domain and click Setup</div>
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="yourdomain.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={isSettingUp}
                  className="font-mono"
                />
                <p className="text-muted-foreground text-xs">
                  Format: example.com (without https://)
                </p>
                <Button
                  onClick={handleSetupHttps}
                  disabled={isSettingUp || !domain.trim()}
                  className="w-full"
                >
                  {isSettingUp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up HTTPS...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Setup HTTPS Automatically
                    </>
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                This will install Nginx, obtain a free SSL certificate from Let's Encrypt, and configure everything automatically.
              </p>
            </div>

            {/* Setup Result */}
            {setupResult && (
              <div className={`p-3 rounded-lg text-sm ${
                setupResult.success
                  ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {setupResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={setupResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                    {setupResult.message}
                  </span>
                </div>
                {setupResult.steps && setupResult.steps.length > 0 && (
                  <div className="mt-2 text-xs space-y-1">
                    {setupResult.steps.map((step, i) => (
                      <div key={i} className="text-muted-foreground">{step}</div>
                    ))}
                  </div>
                )}
                {setupResult.success && (
                  <div className="mt-3">
                    <a
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open https://{domain}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <a
              href="https://certbot.eff.org/instructions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Manual Setup Guide
            </a>
            <Button variant="outline" size="sm" onClick={() => setShowGuide(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
