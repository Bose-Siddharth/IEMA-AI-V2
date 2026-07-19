/**
 * Web Studio state store — same idea as the mobile one: module-scoped so
 * a generation survives tab switches inside Studio and even navigation
 * away from /studio and back. React re-subscribes via `useStudioStore`.
 */
import { useEffect, useState } from 'react';

const initial = () => ({ status: 'idle' });
const state = { sum: initial(), img: initial(), vid: initial() };
const listeners = new Set();
const emit = () => { listeners.forEach((l) => l()); };

export const studioStore = {
  get: (k) => state[k],
  anyRunning: () => Object.values(state).some((s) => s.status === 'running'),
  begin: (k, p) => { state[k] = { ...initial(), ...p, status: 'running' }; emit(); },
  complete: (k, p) => { state[k] = { ...state[k], ...p, status: 'done' }; emit(); },
  fail: (k, err) => { state[k] = { ...state[k], error: err, status: 'error' }; emit(); },
  reset: (k) => { state[k] = initial(); emit(); },
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useStudioStore(k) {
  const [, force] = useState(0);
  useEffect(() => studioStore.subscribe(() => force((n) => n + 1)), []);
  return state[k];
}
