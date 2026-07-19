/**
 * Module-level Studio state store. Keeps generation status (summarize /
 * image / video) alive even when the user switches tabs, backgrounds the
 * app, or the Studio component unmounts. React components subscribe via
 * `useStudioStore(kind)` and get re-rendered whenever the underlying job
 * transitions.
 *
 * Deliberately dependency-free (no zustand / redux) — we only need a tiny
 * pub-sub because there's exactly one Studio screen per app instance.
 */
import { useEffect, useState } from 'react';

const initial = () => ({
  status: 'idle',    // 'idle' | 'running' | 'done' | 'error'
  // per-kind input payload snapshot (so we can restore the form)
  // …plus whatever the runner writes into it.
});

const state = { sum: initial(), img: initial(), vid: initial() };
const listeners = new Set();

const emit = () => { listeners.forEach((l) => l()); };

export const studioStore = {
  get(kind) { return state[kind]; },
  anyRunning() {
    return Object.values(state).some((s) => s.status === 'running');
  },
  begin(kind, payload) {
    state[kind] = { ...initial(), ...payload, status: 'running' };
    emit();
  },
  complete(kind, patch) {
    state[kind] = { ...state[kind], ...patch, status: 'done' };
    emit();
  },
  fail(kind, error) {
    state[kind] = { ...state[kind], error, status: 'error' };
    emit();
  },
  reset(kind) {
    state[kind] = initial();
    emit();
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useStudioStore(kind) {
  const [, force] = useState(0);
  useEffect(() => studioStore.subscribe(() => force((n) => n + 1)), []);
  return state[kind];
}
