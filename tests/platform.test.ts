import { afterEach, describe, expect, it } from 'vitest';
import { haptic } from '../src/game/platform';

// iOS Home Screen web apps report 'vibrate' in navigator but leave it undefined.
// Calling it threw mid-drag and stopped blocks from visibly moving.
describe('browser haptics never throw', () => {
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  afterEach(() => {
    delete nav.vibrate;
  });
  const all = () => {
    haptic.light();
    haptic.medium();
    haptic.heavy();
    haptic.tick();
    haptic.success();
    haptic.warn();
  };

  it('vibrate present but undefined (iOS web app)', () => {
    Object.defineProperty(nav, 'vibrate', { value: undefined, configurable: true });
    expect('vibrate' in nav).toBe(true);
    expect(all).not.toThrow();
  });

  it('vibrate that throws', () => {
    Object.defineProperty(nav, 'vibrate', {
      value: () => {
        throw new Error('nope');
      },
      configurable: true,
    });
    expect(all).not.toThrow();
  });

  it('vibrate that works is called', () => {
    const calls: unknown[] = [];
    Object.defineProperty(nav, 'vibrate', { value: (p: unknown) => calls.push(p), configurable: true });
    all();
    expect(calls.length).toBe(6);
  });
});
