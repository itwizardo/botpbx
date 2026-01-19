'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  UserAgent,
  Registerer,
  Inviter,
  SessionState,
  Session,
  RegistererState,
  UserAgentState,
} from 'sip.js';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'ended';

interface WebRTCPhoneState {
  isConnected: boolean;
  isRegistered: boolean;
  isConnecting: boolean;
  callState: CallState;
  callDuration: number;
  remoteNumber: string | null;
  isMuted: boolean;
  error: string | null;
}

interface UseWebRTCPhoneReturn extends WebRTCPhoneState {
  connect: () => Promise<void>;
  disconnect: () => void;
  call: (number: string, trunkEndpoint: string) => Promise<void>;
  hangup: () => void;
  mute: () => void;
  unmute: () => void;
  sendDTMF: (digit: string) => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
}

// WebRTC configuration
const getServerUrl = () => {
  // Use current host for WSS connection
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname;
  // Asterisk WebSocket port from http.conf
  const port = protocol === 'wss' ? 8089 : 8088;
  return `${protocol}://${host}:${port}/ws`;
};

const SIP_CONFIG = {
  username: 'browser',
  // Password is fetched from API at runtime
  displayName: 'Browser Phone',
};

export function useWebRTCPhone(): UseWebRTCPhoneReturn {
  const [state, setState] = useState<WebRTCPhoneState>({
    isConnected: false,
    isRegistered: false,
    isConnecting: false,
    callState: 'idle',
    callDuration: 0,
    remoteNumber: null,
    isMuted: false,
    error: null,
  });

  const userAgentRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Check if media devices are available (requires HTTPS)
  const checkMediaDevices = useCallback(() => {
    if (typeof window === 'undefined') return false;

    // Check if we're in a secure context
    if (!window.isSecureContext) {
      return false;
    }

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }

    return true;
  }, []);

  // Connect to Asterisk WebSocket server
  const connect = useCallback(async () => {
    if (userAgentRef.current) {
      return;
    }

    // Check for secure context / media devices availability
    if (!checkMediaDevices()) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: 'Media devices not available. WebRTC requires HTTPS. Please access this site via HTTPS to make calls.',
      }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Fetch WebRTC password from API
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const passwordRes = await fetch(`${apiBase}/api/v1/webrtc/password`, {
        credentials: 'include',
      });
      if (!passwordRes.ok) {
        throw new Error('Failed to get WebRTC credentials');
      }
      const { password } = await passwordRes.json();

      const serverUrl = getServerUrl();
      const host = window.location.hostname;

      // Create SIP URI
      const uri = UserAgent.makeURI(`sip:${SIP_CONFIG.username}@${host}`);
      if (!uri) {
        throw new Error('Failed to create SIP URI');
      }

      // Create user agent
      const userAgent = new UserAgent({
        uri,
        transportOptions: {
          server: serverUrl,
        },
        authorizationUsername: SIP_CONFIG.username,
        authorizationPassword: password,
        displayName: SIP_CONFIG.displayName,
        logLevel: 'warn',
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
            ],
          },
        },
      });

      // Handle user agent state changes
      userAgent.stateChange.addListener((newState: UserAgentState) => {
        switch (newState) {
          case UserAgentState.Started:
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
            break;
          case UserAgentState.Stopped:
            setState(prev => ({
              ...prev,
              isConnected: false,
              isRegistered: false,
              isConnecting: false,
            }));
            break;
        }
      });

      // Start the user agent
      await userAgent.start();
      userAgentRef.current = userAgent;

      // Create registerer
      const registerer = new Registerer(userAgent, {
        expires: 300,
      });

      // Handle registerer state changes
      registerer.stateChange.addListener((newState: RegistererState) => {
        switch (newState) {
          case RegistererState.Registered:
            setState(prev => ({ ...prev, isRegistered: true }));
            break;
          case RegistererState.Unregistered:
          case RegistererState.Terminated:
            setState(prev => ({ ...prev, isRegistered: false }));
            break;
        }
      });

      // Register
      await registerer.register();
      registererRef.current = registerer;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
  }, []);

  // Disconnect from server
  const disconnect = useCallback(() => {
    cleanup();

    if (sessionRef.current) {
      try {
        if (sessionRef.current.state === SessionState.Established) {
          sessionRef.current.bye();
        }
      } catch (e) {
        // Session end error - ignore
      }
      sessionRef.current = null;
    }

    if (registererRef.current) {
      try {
        // Only unregister if in a valid state (not already unregistering or in progress)
        const state = registererRef.current.state;
        if (state === RegistererState.Registered) {
          registererRef.current.unregister();
        }
      } catch (e) {
        // Unregister error - ignore
      }
      registererRef.current = null;
    }

    if (userAgentRef.current) {
      try {
        userAgentRef.current.stop();
      } catch (e) {
        // Stop user agent error - ignore
      }
      userAgentRef.current = null;
    }

    setState({
      isConnected: false,
      isRegistered: false,
      isConnecting: false,
      callState: 'idle',
      callDuration: 0,
      remoteNumber: null,
      isMuted: false,
      error: null,
    });
  }, [cleanup]);

  // Make a call
  const call = useCallback(async (number: string, trunkEndpoint: string) => {
    if (!userAgentRef.current) {
      throw new Error('Not connected');
    }

    if (sessionRef.current) {
      throw new Error('Already in a call');
    }

    setState(prev => ({
      ...prev,
      callState: 'connecting',
      remoteNumber: number,
      error: null,
    }));

    try {
      const host = window.location.hostname;
      const targetUri = UserAgent.makeURI(`sip:${number}@${host}`);

      if (!targetUri) {
        throw new Error('Invalid phone number');
      }

      // Create inviter with custom headers to pass trunk info
      const inviter = new Inviter(userAgentRef.current, targetUri, {
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: true,
            video: false,
          },
        },
        extraHeaders: [
          `X-Browser-Trunk: ${trunkEndpoint}`,
        ],
      });

      // Handle session state changes
      inviter.stateChange.addListener((newState: SessionState) => {
        switch (newState) {
          case SessionState.Establishing:
            setState(prev => ({ ...prev, callState: 'ringing' }));
            break;
          case SessionState.Established:
            setState(prev => ({ ...prev, callState: 'active', callDuration: 0 }));
            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
              setState(prev => ({ ...prev, callDuration: prev.callDuration + 1 }));
            }, 1000);
            break;
          case SessionState.Terminated:
            cleanup();
            sessionRef.current = null;
            setState(prev => ({
              ...prev,
              callState: 'idle',
              callDuration: 0,
              remoteNumber: null,
              isMuted: false,
            }));
            break;
        }
      });

      // Set up remote audio handling
      const setupRemoteAudio = () => {
        const sdh = inviter.sessionDescriptionHandler;
        if (sdh) {
          const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined;
          if (pc) {
            pc.ontrack = (event: RTCTrackEvent) => {
              if (remoteAudioRef.current && event.track.kind === 'audio') {
                const stream = new MediaStream([event.track]);
                remoteAudioRef.current.srcObject = stream;
                remoteAudioRef.current.play().catch(() => { /* Audio autoplay blocked */ });
              }
            };
          }
        }
      };

      // Send the INVITE
      await inviter.invite({
        requestDelegate: {
          onProgress: () => {
            setState(prev => ({ ...prev, callState: 'ringing' }));
          },
          onAccept: () => {
            // Remote audio setup
            setupRemoteAudio();
          },
          onReject: (response) => {
            cleanup();
            sessionRef.current = null;
            setState(prev => ({
              ...prev,
              callState: 'idle',
              remoteNumber: null,
              error: `Call rejected (${response.message.statusCode})`,
            }));
          },
        },
      });

      sessionRef.current = inviter;

    } catch (error) {
      cleanup();
      setState(prev => ({
        ...prev,
        callState: 'idle',
        remoteNumber: null,
        error: error instanceof Error ? error.message : 'Call failed',
      }));
    }
  }, [cleanup]);

  // Hangup the current call
  const hangup = useCallback(() => {
    if (!sessionRef.current) return;

    try {
      if (sessionRef.current.state === SessionState.Established) {
        sessionRef.current.bye();
      } else if (sessionRef.current.state === SessionState.Establishing) {
        (sessionRef.current as Inviter).cancel();
      }
    } catch (e) {
      // Hangup error - ignore
    }

    cleanup();
    sessionRef.current = null;
    setState(prev => ({
      ...prev,
      callState: 'idle',
      callDuration: 0,
      remoteNumber: null,
      isMuted: false,
    }));
  }, [cleanup]);

  // Mute the call
  const mute = useCallback(() => {
    if (!sessionRef.current) return;

    const sdh = sessionRef.current.sessionDescriptionHandler;
    if (sdh) {
      const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined;
      if (pc) {
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = false;
          }
        });
        setState(prev => ({ ...prev, isMuted: true }));
      }
    }
  }, []);

  // Unmute the call
  const unmute = useCallback(() => {
    if (!sessionRef.current) return;

    const sdh = sessionRef.current.sessionDescriptionHandler;
    if (sdh) {
      const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined;
      if (pc) {
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = true;
          }
        });
        setState(prev => ({ ...prev, isMuted: false }));
      }
    }
  }, []);

  // Send DTMF tone
  const sendDTMF = useCallback((digit: string) => {
    if (!sessionRef.current || sessionRef.current.state !== SessionState.Established) {
      return;
    }

    const sdh = sessionRef.current.sessionDescriptionHandler;
    if (sdh) {
      const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined;
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender && sender.dtmf) {
          sender.dtmf.insertDTMF(digit, 100, 50);
        }
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    call,
    hangup,
    mute,
    unmute,
    sendDTMF,
    remoteAudioRef,
  };
}
