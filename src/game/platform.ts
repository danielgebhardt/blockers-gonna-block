/** Thin wrappers over Capacitor plugins so the game also runs in a browser. */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();

let hapticsOn = true;
export const setHaptics = (on: boolean) => (hapticsOn = on);

/**
 * Browsers: the Vibration API (Android Chrome has it; iOS doesn't). iOS Home
 * Screen web apps report `'vibrate' in navigator` but leave it undefined, so
 * check that it's callable, and never let a haptic failure break gameplay
 * (haptics are called in the middle of drag handling).
 */
const buzz = (pattern: number | number[]) => {
  if (!hapticsOn || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* not critical */
  }
};

export const haptic = {
  light() {
    if (!isNative()) return buzz(8);
    if (hapticsOn) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  medium() {
    if (!isNative()) return buzz(15);
    if (hapticsOn) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  heavy() {
    if (!isNative()) return buzz(25);
    if (hapticsOn) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  },
  tick() {
    if (!isNative()) return buzz(4);
    if (hapticsOn) Haptics.selectionChanged().catch(() => {});
  },
  success() {
    if (!isNative()) return buzz([15, 60, 15]);
    if (hapticsOn) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warn() {
    if (!isNative()) return buzz([30, 60, 30]);
    if (hapticsOn) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  },
};

export async function storeGet(key: string): Promise<string | null> {
  try {
    return (await Preferences.get({ key })).value;
  } catch {
    return localStorage.getItem(key);
  }
}

export async function storeSet(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    localStorage.setItem(key, value);
  }
}

export async function initStatusBar() {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* not critical */
  }
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Safe-area insets in CSS pixels. Capacitor's SystemBars plugin provides
 * --safe-area-inset-* variables on Android; browsers provide env().
 */
export function readInsets(): Insets {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  const v = (p: string) => parseFloat(cs.getPropertyValue(p)) || 0;
  return { top: v('padding-top'), right: v('padding-right'), bottom: v('padding-bottom'), left: v('padding-left') };
}
