import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

function getSnapshot() {
  return typeof window === 'undefined' || window.matchMedia(query).matches;
}

function subscribe(onChange: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener('change', onChange);
  return () => preference.removeEventListener('change', onChange);
}

/** Reacts to accessibility preference changes while the application is open. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
