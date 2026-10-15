// @vitest-environment jsdom
/**
 * The mentor hub.
 *
 * Under test: a request shows only the summary the server exposes, accepting is a real
 * transition rather than a local flag, and the screen never claims to email anyone.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MentorInbox } from './MentorInbox.tsx';
import type { Session } from '../lib/session.ts';

const READY: Session = {
  status: 'ready',
  role: 'mentor',
  roleChosen: true,
  completion: 100,
  onboardingComplete: true,
  isMentor: true,
  profile: {
    userId: 'm1',
    role: 'mentor',
    displayName: 'Priya Raman',
    email: 'p@example.com',
    goalsText: '',
    projectText: '',
    skillsHave: ['Kafka'],
    skillsWant: [],
    interests: [],
    industries: ['Payments'],
    hoursPerWeek: '',
    completion: 100,
  },
};

const REQUEST = {
  id: 'r1',
  direction: 'incoming' as const,
  status: 'pending' as const,
  message: 'I want help with Kafka.',
  response: '',
  matchScore: 78,
  goalTitle: 'Become a backend engineer',
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  mentor: null,
  mentee: {
    userId: 'u1',
    name: 'Avik Sharma',
    program: 'BSc Computer Science',
    year: 'Year 3',
    skillsHave: ['TypeScript'],
    skillsWant: ['Kafka'],
    goal: 'Become a backend engineer on payments systems.',
  },
  can: { accept: true, decline: true, withdraw: false },
};

let routes: Record<string, { status?: number; body: unknown }>;
let calls: Array<{ method: string; path: string }>;

beforeEach(() => {
  calls = [];
  routes = {
    '/api/requests': { body: { ok: true, role: 'mentor', incoming: [REQUEST] } },
    '/api/mentees': { body: { ok: true, mentees: [] } },
  };
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    calls.push({ method: init?.method ?? 'GET', path });
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

describe('MentorInbox', () => {
  it('asks for a mentor session without fetching', () => {
    render(<MentorInbox session={{ status: 'signed_out' }} />);
    expect(screen.getByText(/sign in with a mentor account/i)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('shows the student context that is exposed, and says it is the limit of it', async () => {
    render(<MentorInbox session={READY} />);

    expect(await screen.findByText(/Avik Sharma/)).toBeTruthy();
    expect(screen.getByText(/BSc Computer Science/)).toBeTruthy();
    expect(screen.getByText(/I want help with Kafka/)).toBeTruthy();
    expect(screen.getByText(/What they shared with you/)).toBeTruthy();
    expect(screen.getByText(/Become a backend engineer on payments systems/)).toBeTruthy();
    expect(screen.getByText(/Has:/)).toBeTruthy();
    expect(screen.getByText(/Wants:/)).toBeTruthy();
    expect(screen.getByText(/is all the server exposes about them/i)).toBeTruthy();
    expect(screen.getByText(/the fit score they saw: 78/)).toBeTruthy();
  });

  it('accepts through the real endpoint and reports the stored state', async () => {
    routes['/api/requests/r1/accept'] = {
      body: { ok: true, request: { ...REQUEST, status: 'accepted', mentee: REQUEST.mentee } },
    };
    render(<MentorInbox session={READY} />);
    await screen.findByText(/Avik Sharma/);

    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/requests/r1/accept' && c.method === 'POST')).toBe(true));
    expect(await screen.findByText(/Accepted Avik Sharma/)).toBeTruthy();
    expect(screen.getByText(/they can see the change/)).toBeTruthy();
    expect(screen.getAllByText(/No email is sent/).length).toBeGreaterThan(0);
  });

  it('shows a refused transition as an error', async () => {
    routes['/api/requests/r1/decline'] = { status: 403, body: { ok: false, error: 'This request is not yours to answer.' } };
    render(<MentorInbox session={READY} />);
    await screen.findByText(/Avik Sharma/);

    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    expect(await screen.findByText(/That did not work/i)).toBeTruthy();
    expect(screen.getByText(/not yours to answer/)).toBeTruthy();
  });

  it('says nothing is waiting when the list is empty', async () => {
    routes['/api/requests'] = { body: { ok: true, role: 'mentor', incoming: [] } };
    render(<MentorInbox session={READY} />);
    expect(await screen.findByText(/Nothing is waiting on you/i)).toBeTruthy();
  });
});
