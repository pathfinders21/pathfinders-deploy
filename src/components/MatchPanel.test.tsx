// @vitest-environment jsdom
/**
 * The matching screen.
 *
 * The rules under test: only mentors that exist in the response are shown, the score is
 * explained rather than asserted, a dropped factor is labelled as unknown instead of
 * zero, and a request carries the mentor id the engine actually ranked.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchPanel } from './MatchPanel.tsx';
import type { Session } from '../lib/session.ts';

const READY: Session = {
  status: 'ready',
  role: 'mentee',
  roleChosen: true,
  completion: 80,
  onboardingComplete: true,
  isMentor: false,
  profile: {
    userId: 'u1',
    role: 'mentee',
    displayName: 'Avik',
    email: 'a@example.com',
    goalsText: 'Become a backend engineer',
    projectText: '',
    skillsHave: ['TypeScript'],
    skillsWant: ['Kafka'],
    interests: [],
    industries: [],
    hoursPerWeek: '6',
    completion: 80,
  },
};

const MATCH = {
  mentor: {
    id: 'm1',
    name: 'Priya Raman',
    headline: 'Payments · 12 years',
    expertise: ['Kafka', 'Postgres'],
    interests: ['mentoring'],
    careers: ['Backend Engineer'],
    industries: ['Payments'],
    mentorGoals: [],
    availability: ['Tue'],
    mentoringStyle: 'Structured',
    bio: 'Spent a decade on payment rails.',
    sessions: null,
    rating: null,
    active: true,
    ready: true,
    missing: [],
    verification: 'unverified',
    account: true,
  },
  score: 78,
  confidence: 'medium' as const,
  factors: [
    { key: 'goal_alignment', label: 'Goal alignment', weight: 30, normalized: 0.9, contribution: 27, note: 'Goal wording overlaps.' },
    { key: 'skill_coverage', label: 'Skill coverage', weight: 25, normalized: null, contribution: 0, note: 'No skills recorded on one side.' },
  ],
  missing: ['Skill coverage'],
  overlaps: { goals: ['Become a backend engineer'], skills: ['Kafka'], interests: [], days: ['Tue'], industries: ['Payments'] },
  explanation: { headline: 'Strong fit', summary: 'Covers Kafka and mentors for your goal.', caveats: ['No session history yet'] },
  summary: 'Covers Kafka and mentors for your goal.',
  phrasedBy: 'demo' as const,
};

const RESPONSE = {
  ok: true as const,
  matches: [MATCH],
  excluded: { inactive: 2 },
  excludedReasonText: ['2 mentors: Not currently taking requests.'],
  note: 'Ranked against your goal “Become a backend engineer” and your stored profile.',
  weights: { goal_alignment: 30 },
  weightsNote: 'Weights are fixed in code and visible to you.',
  disclaimer: 'A fit score for ranking, not a probability of success, of a good match, or of any outcome.',
  goalsConsidered: 'Become a backend engineer',
  candidatePool: 3,
  engine: 'demo' as const,
  profile: READY.profile,
};

let routes: Record<string, { status?: number; body: unknown }>;
let calls: Array<{ method: string; path: string; body: unknown }>;

beforeEach(() => {
  calls = [];
  routes = { '/api/matches': { body: RESPONSE } };
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const entry = routes[path];
    if (!entry) return new Response(JSON.stringify({ ok: false, error: 'not stubbed' }), { status: 404 });
    return new Response(JSON.stringify(entry.body), {
      status: entry.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MatchPanel', () => {
  it('asks for a sign in without fetching', () => {
    render(<MatchPanel session={{ status: 'signed_out' }} />);
    expect(screen.getByText(/sign in to see your matches/i)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('shows only returned mentors, with the score broken down and caveated', async () => {
    render(<MatchPanel session={READY} />);

    expect(await screen.findByText('Priya Raman')).toBeTruthy();
    expect(screen.getByText('78')).toBeTruthy();
    expect(screen.getAllByText(/fit score/i).length).toBeGreaterThan(0);
    // The breakdown and the dropped factor are both visible.
    expect(screen.getByText(/How the 78 was computed/)).toBeTruthy();
    expect(screen.getByText('Goal alignment')).toBeTruthy();
    expect(screen.getAllByText(/no data/).length).toBeGreaterThan(0);
    expect(screen.getByText(/renormalised, not scored as zero/i)).toBeTruthy();
    // The disclaimer and the real records behind the ranking.
    expect(screen.getByText(/not a probability of success/i)).toBeTruthy();
    expect(screen.getByText(/3 mentor records were read from the database/)).toBeTruthy();
    expect(screen.getAllByText(/Not currently taking requests/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Summary written by the app, from computed factors/i)).toBeTruthy();
    // A mentor that was not in the response is not invented for the screen.
    expect(screen.queryByText(/Marcus/)).toBeNull();
  });

  it('says nothing was proposed when no mentor passed the rules', async () => {
    routes['/api/matches'] = {
      body: { ...RESPONSE, matches: [], excluded: { inactive: 3 }, excludedReasonText: ['3 mentors: Not currently taking requests.'], candidatePool: 3 },
    };
    render(<MatchPanel session={READY} />);
    expect(await screen.findByText(/no mentor passed the eligibility rules/i)).toBeTruthy();
    expect(screen.getAllByText(/Not currently taking requests/).length).toBeGreaterThan(0);
  });

  it('lays the factor breakdown out so it stacks on a narrow screen', async () => {
    // jsdom has no layout, so this pins the classes that make the row wrap rather than
    // claiming a browser check: the fixed label column would overflow a phone otherwise.
    render(<MatchPanel session={READY} />);
    const label = await screen.findByText('Goal alignment');
    expect(label.className).toContain('w-full');
    expect(label.className).toContain('sm:w-44');
    expect(label.parentElement?.className).toContain('flex-wrap');
  });

  it('sends the request for the mentor the engine ranked, and confirms it is pending', async () => {
    routes['/api/requests'] = {
      body: { ok: true, request: { id: 'r1', mentor: MATCH.mentor, matchScore: 78 } },
    };
    const onRequested = vi.fn();
    render(<MatchPanel session={READY} onRequested={onRequested} />);
    await screen.findByText('Priya Raman');

    fireEvent.click(screen.getByRole('button', { name: /request mentorship/i }));
    fireEvent.change(screen.getByLabelText(/Message to Priya Raman/), { target: { value: 'Help with Kafka.' } });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/requests' && c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.path === '/api/requests');
    expect(post?.body).toEqual({ mentorId: 'm1', message: 'Help with Kafka.' });
    expect(await screen.findByText(/is pending/i)).toBeTruthy();
    expect(onRequested).toHaveBeenCalledWith('Priya Raman');
  });

  it('shows a rejected request attempt as an error, not as a success', async () => {
    routes['/api/requests'] = { status: 403, body: { ok: false, error: 'That mentor is not accepting requests.' } };
    render(<MatchPanel session={READY} />);
    await screen.findByText('Priya Raman');

    fireEvent.click(screen.getByRole('button', { name: /request mentorship/i }));
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    expect(await screen.findByText(/That did not work/i)).toBeTruthy();
    expect(screen.getByText(/not accepting requests/i)).toBeTruthy();
  });
});
