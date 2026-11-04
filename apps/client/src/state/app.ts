import { useSyncExternalStore } from 'react';
import { createStore, type Store } from './store';
import { loadSettings, prefersReducedMotion, safeStorage, saveSettings, type Settings } from './settings';

export const settingsStore: Store<Settings> = createStore(loadSettings(safeStorage()));

settingsStore.subscribe(() => {
  saveSettings(safeStorage(), settingsStore.get());
});

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useSettings(): Settings {
  return useStore(settingsStore);
}

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function reducedMotionNow(): boolean {
  return prefersReducedMotion(settingsStore.get(), systemPrefersReducedMotion());
}

export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/** Mirrors the settings that CSS depends on onto <html>. */
export function applyDocumentSettings(root: HTMLElement, settings: Settings): void {
  root.dataset.scheme = settings.colorScheme;
  root.dataset.motion = settings.motion === 'system' ? 'system' : settings.motion === 'reduced' ? 'reduced' : 'full';
}
