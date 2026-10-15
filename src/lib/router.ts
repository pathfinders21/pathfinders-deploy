/**
 * The whole router. Small enough to read in one sitting, which is the point: the app
 * has seven screens and no nested routes, so it needs a mapping and nothing more.
 *
 * Using the hash keeps the single page app deployable as static files without a
 * rewrite rule, and it gives real deep links and a working back button, which the
 * previous tab-only state could not.
 */
export const TABS = [
  'hero',
  'plans',
  'mentors',
  'roadmaps',
  'community',
  'assess',
  'agent',
  'assistant',
  'dashboard',
  'role-selection',
  'onboarding',
] as const;

export type Tab = (typeof TABS)[number];

export const TAB_PATHS: Record<Tab, string> = {
  hero: '#/',
  plans: '#/plans',
  mentors: '#/mentors',
  roadmaps: '#/roadmaps',
  community: '#/community',
  assess: '#/assess',
  agent: '#/agent',
  assistant: '#/assistant',
  dashboard: '#/dashboard',
  'role-selection': '#/choose-role',
  onboarding: '#/onboarding',
};

/** Screens that mean nothing without a session, so a deep link to them is redirected. */
export const TABS_REQUIRING_USER: readonly Tab[] = ['dashboard', 'agent', 'role-selection', 'onboarding'];

export const isTab = (value: string): value is Tab => (TABS as readonly string[]).includes(value);

export const tabFromHash = (hash: string): Tab => {
  const clean = hash.replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase();
  if (clean === '') return 'hero';
  const match = TABS.find((tab) => TAB_PATHS[tab].replace(/^#\/?/, '') === clean);
  return match ?? 'hero';
};

export const hashForTab = (tab: Tab): string => TAB_PATHS[tab];

/** Anything that arrives as a loose string (a nav click) lands on a real tab. */
export const coerceTab = (name: string): Tab => (isTab(name) ? name : 'hero');
