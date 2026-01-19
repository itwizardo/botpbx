import { create } from 'zustand';
import type { ActiveCall } from '@/types/models';

interface CallsState {
  // Active calls
  activeCalls: Map<string, ActiveCall>;

  // Spy panel
  spyingCall: ActiveCall | null;
  spyMode: 'listen' | 'whisper' | 'barge';

  // Actions
  setActiveCalls: (calls: ActiveCall[]) => void;
  addCall: (call: ActiveCall) => void;
  updateCall: (uniqueId: string, updates: Partial<ActiveCall>) => void;
  removeCall: (uniqueId: string) => void;
  clearCalls: () => void;

  // Spy actions
  startSpying: (call: ActiveCall, mode: 'listen' | 'whisper' | 'barge') => void;
  setSpyMode: (mode: 'listen' | 'whisper' | 'barge') => void;
  stopSpying: () => void;
}

export const useCallsStore = create<CallsState>((set, get) => ({
  // Initial state
  activeCalls: new Map(),
  spyingCall: null,
  spyMode: 'listen',

  // Actions
  setActiveCalls: (calls) => {
    const callsMap = new Map<string, ActiveCall>();
    calls.forEach((call) => {
      callsMap.set(call.uniqueId, call);
    });
    set({ activeCalls: callsMap });
  },

  addCall: (call) => {
    set((state) => {
      const newCalls = new Map(state.activeCalls);
      newCalls.set(call.uniqueId, call);
      return { activeCalls: newCalls };
    });
  },

  updateCall: (uniqueId, updates) => {
    set((state) => {
      const call = state.activeCalls.get(uniqueId);
      if (!call) return state;

      const newCalls = new Map(state.activeCalls);
      newCalls.set(uniqueId, { ...call, ...updates });

      // Also update spying call if it's the same
      let spyingCall = state.spyingCall;
      if (spyingCall?.uniqueId === uniqueId) {
        spyingCall = { ...spyingCall, ...updates };
      }

      return { activeCalls: newCalls, spyingCall };
    });
  },

  removeCall: (uniqueId) => {
    set((state) => {
      const newCalls = new Map(state.activeCalls);
      newCalls.delete(uniqueId);

      // Stop spying if this was the spied call
      let spyingCall = state.spyingCall;
      if (spyingCall?.uniqueId === uniqueId) {
        spyingCall = null;
      }

      return { activeCalls: newCalls, spyingCall };
    });
  },

  clearCalls: () => {
    set({ activeCalls: new Map(), spyingCall: null });
  },

  // Spy actions
  startSpying: (call, mode) => {
    set({ spyingCall: call, spyMode: mode });
  },

  setSpyMode: (mode) => {
    set({ spyMode: mode });
  },

  stopSpying: () => {
    set({ spyingCall: null });
  },
}));

// Selectors
export const selectActiveCallsArray = (state: CallsState): ActiveCall[] => {
  return Array.from(state.activeCalls.values());
};

export const selectActiveCallCount = (state: CallsState): number => {
  return state.activeCalls.size;
};

export const selectCallById = (uniqueId: string) => (state: CallsState): ActiveCall | undefined => {
  return state.activeCalls.get(uniqueId);
};
