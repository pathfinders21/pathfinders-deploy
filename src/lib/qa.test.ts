import { describe, it, expect } from 'vitest';
import { qaControlsEnabled } from './qa.ts';

describe('qa controls visibility', () => {
  it('shows the controller in development', () => {
    expect(qaControlsEnabled('', true)).toBe(true);
  });

  it('hides it from a built site by default', () => {
    expect(qaControlsEnabled('', false)).toBe(false);
    expect(qaControlsEnabled('?utm=email', false)).toBe(false);
    expect(qaControlsEnabled('?qa=0', false)).toBe(false);
    expect(qaControlsEnabled('?qa', false)).toBe(false);
    expect(qaControlsEnabled('?qa=11', false)).toBe(false);
  });

  it('shows it in a built site only when asked for', () => {
    expect(qaControlsEnabled('?qa=1', false)).toBe(true);
    expect(qaControlsEnabled('?qa=1&x=2', false)).toBe(true);
    expect(qaControlsEnabled('?x=2&qa=1', false)).toBe(true);
  });
});
