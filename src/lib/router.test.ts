import { describe, it, expect } from 'vitest';
import {
  TABS,
  TAB_PATHS,
  TABS_REQUIRING_USER,
  tabFromHash,
  hashForTab,
  coerceTab,
} from './router.ts';

describe('hash router', () => {
  it('round trips every tab through its hash', () => {
    for (const tab of TABS) {
      expect(tabFromHash(hashForTab(tab))).toBe(tab);
    }
  });

  it('sends an empty or unknown hash home rather than nowhere', () => {
    expect(tabFromHash('')).toBe('hero');
    expect(tabFromHash('#')).toBe('hero');
    expect(tabFromHash('#/')).toBe('hero');
    expect(tabFromHash('#/does-not-exist')).toBe('hero');
  });

  it('tolerates the shapes a browser or a person will produce', () => {
    expect(tabFromHash('#/mentors')).toBe('mentors');
    expect(tabFromHash('#mentors')).toBe('mentors');
    expect(tabFromHash('#/mentors/')).toBe('mentors');
    expect(tabFromHash('#/MENTORS')).toBe('mentors');
  });

  it('gives the agent screen a deep link of its own', () => {
    expect(hashForTab('agent')).toBe('#/agent');
    expect(tabFromHash('#/agent')).toBe('agent');
  });

  it('gives every tab its own deep link', () => {
    const paths = TABS.map((tab) => TAB_PATHS[tab]);
    expect(new Set(paths).size).toBe(TABS.length);
  });

  it('marks the signed in screens as requiring a user', () => {
    // 'agent' joined the list with the dashboard: it reads and writes the visitor's own
    // roadmap, so a deep link without a session would only render empty state.
    expect([...TABS_REQUIRING_USER].sort()).toEqual(['agent', 'dashboard', 'onboarding', 'role-selection'])
    // The assessment screen is reachable signed out precisely so it can prompt for
    // sign-in; redirecting it away would hide why it needs one.
    expect(TABS_REQUIRING_USER).not.toContain('assess');
    expect(TABS_REQUIRING_USER).not.toContain('hero');
    expect(TABS_REQUIRING_USER).not.toContain('mentors')
    expect(TABS_REQUIRING_USER).not.toContain('assess');
  });

  it('coerces a loose string to a real tab', () => {
    expect(coerceTab('community')).toBe('community');
    expect(coerceTab('nonsense')).toBe('hero');
  });
});
