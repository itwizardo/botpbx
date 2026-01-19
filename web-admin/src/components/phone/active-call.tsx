'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Grid,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhone } from '@/contexts/phone-context';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function ActiveCall() {
  const {
    callState,
    callDuration,
    remoteNumber,
    isMuted,
    hangup,
    mute,
    unmute,
    sendDTMF,
  } = usePhone();

  const [showKeypad, setShowKeypad] = useState(false);

  const handleDTMF = useCallback((digit: string) => {
    sendDTMF(digit);
  }, [sendDTMF]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      unmute();
    } else {
      mute();
    }
  }, [isMuted, mute, unmute]);

  // Only show when there's an active call
  if (callState === 'idle') {
    return null;
  }

  const keypadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];

  const getCallStateText = () => {
    switch (callState) {
      case 'connecting':
        return 'Connecting...';
      case 'ringing':
        return 'Ringing...';
      case 'active':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call Ended';
      default:
        return '';
    }
  };

  const isCallActive = callState === 'active';

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-2xl border-2 border-primary/20 bg-background/95 backdrop-blur">
      <CardContent className="p-4">
        {/* Call Info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'p-2 rounded-full',
                callState === 'active' ? 'bg-green-500/20' : 'bg-yellow-500/20'
              )}
            >
              {callState === 'connecting' || callState === 'ringing' ? (
                <Loader2
                  className={cn(
                    'h-5 w-5 animate-spin',
                    callState === 'connecting' ? 'text-yellow-500' : 'text-green-500'
                  )}
                />
              ) : (
                <Phone
                  className={cn(
                    'h-5 w-5',
                    callState === 'active' ? 'text-green-500' : 'text-muted-foreground'
                  )}
                />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{remoteNumber || 'Unknown'}</p>
              <p
                className={cn(
                  'text-xs',
                  callState === 'active' ? 'text-green-500' : 'text-muted-foreground'
                )}
              >
                {getCallStateText()}
              </p>
            </div>
          </div>
        </div>

        {/* Call Controls */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {/* Mute Button */}
          <Button
            variant={isMuted ? 'destructive' : 'outline'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={toggleMute}
            disabled={!isCallActive}
          >
            {isMuted ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          {/* Keypad Toggle */}
          <Button
            variant={showKeypad ? 'secondary' : 'outline'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={() => setShowKeypad(!showKeypad)}
            disabled={!isCallActive}
          >
            <Grid className="h-5 w-5" />
          </Button>

          {/* Hangup Button */}
          <Button
            variant="destructive"
            size="icon"
            className="h-14 w-14 rounded-full"
            onClick={hangup}
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>

        {/* DTMF Keypad */}
        {showKeypad && isCallActive && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">DTMF Keypad</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setShowKeypad(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {keypadButtons.map((row) =>
                row.map((digit) => (
                  <Button
                    key={digit}
                    variant="outline"
                    size="sm"
                    className="h-10 text-lg font-semibold"
                    onClick={() => handleDTMF(digit)}
                  >
                    {digit}
                  </Button>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
