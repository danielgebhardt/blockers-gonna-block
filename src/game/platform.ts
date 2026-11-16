/** Thin wrappers over Capacitor plugins so the game also runs in a browser. */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();

let hapticsOn = true;
export const setHaptics = (on: boolean) => (hapticsOn = on);

export const haptic = {
  light() {
    if (hapticsOn && isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  medium() {
    if (hapticsOn && isNative()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  heavy() {
    if (hapticsOn && isNative()) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  },
  tick() {
    if (hapticsOn && isNative()) Haptics.selectionChanged().catch(() => {});
  },
  success() {
    if (hapticsOn && isNative()) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warn() {
    if (hapticsOn && isNative()) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
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
