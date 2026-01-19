'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWebRTCPhone, CallState } from '@/hooks/use-webrtc-phone';

interface DialTrunk {
  id: string;
  name: string;
  endpoint: string;
  isDefault: boolean;
}

interface PhoneContextValue {
  // Connection state
  isConnected: boolean;
  isRegistered: boolean;
  isConnecting: boolean;

  // Call state
  callState: CallState;
  callDuration: number;
  remoteNumber: string | null;
  isMuted: boolean;
  error: string | null;

  // Trunks
  trunks: DialTrunk[];
  loadingTrunks: boolean;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  call: (number: string, trunkEndpoint: string) => Promise<void>;
  hangup: () => void;
  mute: () => void;
  unmute: () => void;
  sendDTMF: (digit: string) => void;
  refreshTrunks: () => Promise<void>;

  // UI state
  isDialogOpen: boolean;
  openDialDialog: () => void;
  closeDialDialog: () => void;

  // Audio element ref
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
}

const PhoneContext = createContext<PhoneContextValue | null>(null);

export function usePhone() {
  const context = useContext(PhoneContext);
  if (!context) {
    throw new Error('usePhone must be used within a PhoneProvider');
  }
  return context;
}

interface PhoneProviderProps {
  children: React.ReactNode;
}

export function PhoneProvider({ children }: PhoneProviderProps) {
  const phone = useWebRTCPhone();

  // UI state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Trunks state
  const [trunks, setTrunks] = useState<DialTrunk[]>([]);
  const [loadingTrunks, setLoadingTrunks] = useState(false);

  // Load available trunks
  const refreshTrunks = useCallback(async () => {
    setLoadingTrunks(true);
    try {
      const token = localStorage.getItem('botpbx_token');
      if (!token) return;

      const response = await fetch('/api/v1/trunks/for-dialing', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTrunks(data.trunks || []);
      }
    } catch (error) {
      console.error('Failed to load trunks:', error);
    } finally {
      setLoadingTrunks(false);
    }
  }, []);

  // Load trunks on mount
  useEffect(() => {
    refreshTrunks();
  }, [refreshTrunks]);

  // Auto-connect when authenticated (only once on mount)
  useEffect(() => {
    const token = localStorage.getItem('botpbx_token');
    if (token && !phone.isConnected && !phone.isConnecting && !phone.error) {
      phone.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Dialog controls
  const openDialDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closeDialDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  // Close dialog when call starts
  useEffect(() => {
    if (phone.callState === 'connecting' || phone.callState === 'ringing') {
      setIsDialogOpen(false);
    }
  }, [phone.callState]);

  const value: PhoneContextValue = {
    // Connection state
    isConnected: phone.isConnected,
    isRegistered: phone.isRegistered,
    isConnecting: phone.isConnecting,

    // Call state
    callState: phone.callState,
    callDuration: phone.callDuration,
    remoteNumber: phone.remoteNumber,
    isMuted: phone.isMuted,
    error: phone.error,

    // Trunks
    trunks,
    loadingTrunks,

    // Actions
    connect: phone.connect,
    disconnect: phone.disconnect,
    call: phone.call,
    hangup: phone.hangup,
    mute: phone.mute,
    unmute: phone.unmute,
    sendDTMF: phone.sendDTMF,
    refreshTrunks,

    // UI state
    isDialogOpen,
    openDialDialog,
    closeDialDialog,

    // Audio element ref
    remoteAudioRef: phone.remoteAudioRef,
  };

  return (
    <PhoneContext.Provider value={value}>
      {children}
      {/* Hidden audio element for remote audio playback */}
      <audio ref={phone.remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </PhoneContext.Provider>
  );
}
