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
import { Phone, Loader2, AlertCircle, Wifi, WifiOff, Lock, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
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

// Simple HTTPS Error Banner with "How to fix" button
function HttpsErrorBanner() {
  const [showGuide, setShowGuide] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const serverIp = typeof window !== 'undefined' ? window.location.hostname : 'YOUR_SERVER_IP';

  const copyToClipboard = async (text: string, step: number) => {
    // In secure context, use clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedStep(step);
        setTimeout(() => setCopiedStep(null), 2000);
        return;
      } catch (err) {
        // Fall through to prompt
      }
    }

    // For HTTP: show prompt with pre-selected text (user just presses Ctrl+C)
    window.prompt('Press Ctrl+C to copy:', text);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const commands = {
    install: 'apt update && apt install -y nginx certbot python3-certbot-nginx',
    certbot: 'certbot --nginx -d YOUR_DOMAIN.com',
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
          How to fix
        </Button>
      </div>

      {/* Full guide dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Enable HTTPS for WebRTC
            </DialogTitle>
            <DialogDescription>
              Browser security requires HTTPS to access your microphone for calls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Step 1 */}
            <div className="space-y-2">
              <div className="font-medium">1. Point your domain to this server</div>
              <p className="text-muted-foreground text-xs">
                Add an A record in your domain registrar:
              </p>
              <div className="bg-muted rounded p-2 font-mono text-xs">
                Type: A &nbsp; Host: @ &nbsp; Value: <span className="text-primary">{serverIp}</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="font-medium">2. Install Nginx & Certbot</div>
              <div className="bg-gray-900 rounded p-2 font-mono text-xs text-green-400">
                <code className="break-all select-all">{commands.install}</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => copyToClipboard(commands.install, 2)}
              >
                {copiedStep === 2 ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3 mr-1" /> Copy command</>
                )}
              </Button>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <div className="font-medium">3. Get SSL certificate</div>
              <div className="bg-gray-900 rounded p-2 font-mono text-xs text-green-400">
                <code className="select-all">{commands.certbot}</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => copyToClipboard(commands.certbot, 3)}
              >
                {copiedStep === 3 ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3 mr-1" /> Copy command</>
                )}
              </Button>
              <p className="text-muted-foreground text-xs">Replace YOUR_DOMAIN.com with your actual domain.</p>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <div className="font-medium">4. Configure Nginx reverse proxy</div>
              <p className="text-muted-foreground text-xs">
                Forward HTTPS to BotPBX (port 3000 for API, 3001 for web).
              </p>
            </div>

            {/* Step 5 */}
            <div className="space-y-2">
              <div className="font-medium">5. Access via HTTPS</div>
              <p className="text-muted-foreground text-xs">
                Visit <span className="text-primary font-mono">https://your-domain.com</span> to make calls.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <a
              href="https://certbot.eff.org/instructions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Full Certbot Guide
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
