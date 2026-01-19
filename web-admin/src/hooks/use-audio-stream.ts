'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { getWebSocketClient } from '@/lib/websocket';

interface AudioStreamState {
  isListening: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  volume: number;
  error: string | null;
}

interface UseAudioStreamReturn {
  isListening: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  volume: number;
  error: string | null;
  startListening: (channel: string) => Promise<void>;
  stopListening: () => void;
  setVolume: (volume: number) => void;
}

// Audio format from server: 8kHz, 16-bit signed linear, mono
const SAMPLE_RATE = 8000;
const CHANNELS = 1;

export function useAudioStream(): UseAudioStreamReturn {
  const [state, setState] = useState<AudioStreamState>({
    isListening: false,
    isConnecting: false,
    sessionId: null,
    volume: 1.0,
    error: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const wsClientRef = useRef(getWebSocketClient());
  const cleanupRef = useRef<(() => void) | null>(null);

  // Initialize Web Audio API
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.value = state.volume;
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, [state.volume]);

  // Play raw PCM audio data
  const playAudio = useCallback((pcmData: ArrayBuffer) => {
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;

    if (!audioContext || !gainNode) return;

    // Convert Int16 PCM to Float32 for Web Audio API
    const int16Array = new Int16Array(pcmData);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0; // Normalize to -1.0 to 1.0
    }

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(CHANNELS, float32Array.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32Array);

    // Play the buffer
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);
    source.start();
  }, []);

  // Handle binary audio data from WebSocket
  const handleBinaryMessage = useCallback((data: ArrayBuffer) => {
    // First byte is message type, next 32 bytes are session ID
    const view = new DataView(data);
    const messageType = view.getUint8(0);

    if (messageType === 0x01) {
      // Audio data
      const audioData = data.slice(33); // Skip header (1 + 32 bytes)
      playAudio(audioData);
    }
  }, [playAudio]);

  // Start listening to a call
  const startListening = useCallback(async (channel: string) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Get auth token
      const token = localStorage.getItem('botpbx_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Call API to start browser spy
      const response = await fetch('/api/v1/calls/browser-spy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start listening');
      }

      const result = await response.json();
      const { audioSessionId } = result;

      // Initialize audio
      initAudio();

      // Subscribe to audio stream via WebSocket
      const wsClient = wsClientRef.current;
      if (wsClient) {
        wsClient.send('audio:subscribe', { sessionId: audioSessionId });

        // Set up binary message handler
        const ws = (wsClient as any).ws;
        if (ws) {
          const originalOnMessage = ws.onmessage;
          ws.onmessage = (event: MessageEvent) => {
            if (event.data instanceof ArrayBuffer) {
              handleBinaryMessage(event.data);
            } else if (event.data instanceof Blob) {
              event.data.arrayBuffer().then(handleBinaryMessage);
            } else {
              // JSON message - call original handler
              if (originalOnMessage) {
                originalOnMessage.call(ws, event);
              }
            }
          };

          // Store cleanup function
          cleanupRef.current = () => {
            ws.onmessage = originalOnMessage;
            wsClient.send('audio:unsubscribe', { sessionId: audioSessionId });
          };
        }
      }

      setState((prev) => ({
        ...prev,
        isListening: true,
        isConnecting: false,
        sessionId: audioSessionId,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to start listening',
      }));
    }
  }, [initAudio, handleBinaryMessage]);

  // Stop listening
  const stopListening = useCallback(async () => {
    // Run cleanup
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Stop the spy session on server
    if (state.sessionId) {
      try {
        const token = localStorage.getItem('botpbx_token');
        await fetch(`/api/v1/calls/browser-spy/${state.sessionId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Failed to stop spy session:', error);
      }
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }

    setState({
      isListening: false,
      isConnecting: false,
      sessionId: null,
      volume: 1.0,
      error: null,
    });
  }, [state.sessionId]);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState((prev) => ({ ...prev, volume: clampedVolume }));

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isListening: state.isListening,
    isConnecting: state.isConnecting,
    sessionId: state.sessionId,
    volume: state.volume,
    error: state.error,
    startListening,
    stopListening,
    setVolume,
  };
}
