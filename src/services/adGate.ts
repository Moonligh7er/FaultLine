import { useEffect, useSyncExternalStore } from 'react';

// ============================================================
// Ad gate
// ============================================================
// No ad is requested (and so the ad SDK isn't touched) while a sensitive
// flow is on screen: the report flow, including insider reports. Banners
// also only render on the focused screen, so a banner on a tab left behind
// the report flow is unmounted rather than refreshing in the background.

let suppressors = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function areAdsSuppressed(): boolean {
  return suppressors > 0;
}

export function useAdsSuppressed(): boolean {
  return useSyncExternalStore(subscribe, areAdsSuppressed, areAdsSuppressed);
}

/** Suppresses ads app-wide while `active` is true and the caller is mounted. */
export function useSuppressAds(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    suppressors++;
    emit();
    return () => {
      suppressors--;
      emit();
    };
  }, [active]);
}
